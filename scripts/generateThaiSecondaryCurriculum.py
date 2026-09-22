"""Generate upper-secondary Thai curriculum rows from the supplied Word source.

The Word tables use vertically merged cells.  python-docx exposes the merged
value once for every physical row, so exact repeated rows are collapsed here
before the JSON is written.  Indicator text that was placed in the learning
content column in the source is moved back into the appropriate indicator
column so the application can index it.
"""

from __future__ import annotations

import argparse
import json
import re
import unicodedata
from pathlib import Path

from docx import Document


THAI_DIGITS = str.maketrans("๐๑๒๓๔๕๖๗๘๙", "0123456789")
CODE_RE = re.compile(
    r"ท\s*\.?\s*(\d+)\s*\.\s*(\d+)\s*(ป|ม)\s*\.\s*(\d+(?:\s*-\s*\d+)?)\s*/\s*(\d+)"
)
GRADE_RE = re.compile(r"^(ป|ม)\s*\.\s*(\d+)")
STANDARD_RE = re.compile(r"(ท\s*\d+\s*\.\s*\d+)")

STANDARD_TEXT = {
    "ท 1.1": "ใช้กระบวนการอ่านสร้างความรู้และความคิดเพื่อนำไปใช้ตัดสินใจ แก้ปัญหาในการดำเนินชีวิต และมีนิสัยรักการอ่าน",
    "ท 2.1": "ใช้กระบวนการเขียนสื่อสาร เขียนเรียงความ ย่อความ และเขียนเรื่องราวในรูปแบบต่าง ๆ เขียนรายงานข้อมูลสารสนเทศและรายงานการศึกษาค้นคว้าอย่างมีประสิทธิภาพ",
    "ท 3.1": "สามารถเลือกฟังและดูอย่างมีวิจารณญาณ และพูดแสดงความรู้ ความคิด และความรู้สึก ในโอกาสต่าง ๆ อย่างมีวิจารณญาณและสร้างสรรค์",
    "ท 4.1": "เข้าใจธรรมชาติของภาษาและหลักภาษาไทย การเปลี่ยนแปลงของภาษาและพลังของภาษา ภูมิปัญญาทางภาษา และรักษาภาษาไทยไว้เป็นสมบัติของชาติ",
    "ท 5.1": "เข้าใจและแสดงความคิดเห็น วิจารณ์วรรณคดีและวรรณกรรมไทยอย่างเห็นคุณค่า และนำมาประยุกต์ใช้ในชีวิตจริง",
}

STRANDS = {
    1: "การอ่าน",
    2: "การเขียน",
    3: "การฟัง การดู และการพูด",
    4: "หลักการใช้ภาษาไทย",
    5: "วรรณคดีและวรรณกรรม",
}

GRADE_TABLES = {
    "ม.2": (42, 47),
    "ม.3": (48, 53),
    "ม.4": (54, 58),
    "ม.5": (59, 63),
    "ม.6": (64, 68),
}


def normalize_code(match: re.Match[str]) -> str:
    area, standard, level, grade, number = match.groups()
    grade = grade.replace(" ", "")
    return f"ท {area}.{standard} {level}.{grade}/{number}"


def clean_text(value: str | None) -> str:
    if not value:
        return ""
    text = unicodedata.normalize("NFKC", value).translate(THAI_DIGITS)
    text = text.replace("\u00a0", " ").replace("\u200b", "")
    text = re.sub(r"\s+", " ", text).strip()
    text = re.sub(r"\s*/\s*", " / ", text)
    text = CODE_RE.sub(normalize_code, text)
    text = re.sub(r"(?:\s*/\s*)+$", "", text).strip()
    return text


def canonical_grade(value: str, fallback: str) -> str:
    match = GRADE_RE.search(value)
    if not match:
        return fallback
    return f"{match.group(1)}.{match.group(2)}"


def indicator_codes(value: str) -> list[str]:
    return [normalize_code(match) for match in CODE_RE.finditer(value)]


def standard_code(value: str) -> str:
    match = STANDARD_RE.search(value)
    if not match:
        return ""
    raw = re.sub(r"\s+", " ", match.group(1)).strip()
    digits = raw.translate(THAI_DIGITS)
    digits = re.sub(r"\s*\.\s*", ".", digits)
    digits = re.sub(r"\s+", " ", digits)
    return digits.replace("ท ", "ท ")


def clean_indicator(value: str) -> str | None:
    value = clean_text(value)
    return value if value and value != "-" else None


def source_row(
    cells: list[str], grade: str, explicit_exit_codes: set[str]
) -> tuple[str, str | None, str | None, str | None]:
    row_grade = canonical_grade(cells[0], grade)
    midway = clean_indicator(cells[1])
    exit_indicator = clean_indicator(cells[2])
    learning = clean_indicator(cells[3])

    # A few merged rows in the source place an indicator in the learning
    # column.  Preserve the source wording, but put it where the application
    # can classify and index it.
    if learning and indicator_codes(learning):
        if not midway and not exit_indicator:
            if any(code in explicit_exit_codes for code in indicator_codes(learning)):
                exit_indicator, learning = learning, None
            else:
                midway, learning = learning, None
        elif not exit_indicator:
            exit_indicator, learning = learning, None

    return row_grade, midway, exit_indicator, learning


def generate(source: Path) -> list[dict]:
    document = Document(source)
    rows: list[dict] = []
    sequence = 0

    for grade, (start, end) in GRADE_TABLES.items():
        current_grade = grade
        explicit_exit_codes = {
            code
            for table_index in range(start, end + 1)
            for row in document.tables[table_index].rows[1:]
            for code in indicator_codes(clean_text(row.cells[2].text))
        }
        for table_index in range(start, end + 1):
            table = document.tables[table_index]
            strand_no = table_index - start + 1
            seen: set[tuple[str, str, str, str]] = set()
            for row in table.rows[1:]:
                cells = [clean_text(cell.text) for cell in row.cells]
                if len(cells) != 4:
                    continue
                row_grade, midway, exit_indicator, learning = source_row(cells, current_grade, explicit_exit_codes)
                current_grade = row_grade
                if not midway and not exit_indicator and not learning:
                    continue

                key = (row_grade, midway or "", exit_indicator or "", learning or "")
                if key in seen:
                    continue
                seen.add(key)

                codes = indicator_codes(" ".join(filter(None, [midway, exit_indicator, learning])))
                standard = standard_code(codes[0]) if codes else ""
                sequence += 1
                rows.append(
                    {
                        "id": f"th-{row_grade}-{sequence}",
                        "subject": "ภาษาไทย",
                        "learningArea": "ภาษาไทย",
                        "gradeLevel": row_grade,
                        "strandNo": strand_no,
                        "strandName": STRANDS[strand_no],
                        "standardCode": standard,
                        "standardDescription": STANDARD_TEXT.get(standard, ""),
                        "indicatorCode": codes[0] if codes else "",
                        "midwayIndicator": midway,
                        "exitIndicator": exit_indicator,
                        "learningAreaNote": learning,
                    }
                )

    return rows


def report(rows: list[dict]) -> None:
    for grade in GRADE_TABLES:
        grade_rows = [row for row in rows if row["gradeLevel"] == grade]
        midway = {code for row in grade_rows for code in indicator_codes(row["midwayIndicator"] or "")}
        exits = {code for row in grade_rows for code in indicator_codes(row["exitIndicator"] or "")}
        all_codes = midway | exits
        print(f"{grade}: rows={len(grade_rows)}, midway={len(midway)}, exit={len(exits)}, unique={len(all_codes)}")


def indicator_descriptions(rows: list[dict], grade: str) -> dict[str, str]:
    descriptions: dict[str, str] = {}
    for row in rows:
        if row["gradeLevel"] != grade:
            continue
        for value in (row["midwayIndicator"], row["exitIndicator"]):
            if not value:
                continue
            matches = list(CODE_RE.finditer(value))
            for index, match in enumerate(matches):
                code = normalize_code(match)
                end = matches[index + 1].start() if index + 1 < len(matches) else len(value)
                description = re.sub(r"^\s*[/:,-]?\s*", "", value[match.end() : end]).strip()
                description = re.sub(r"\s*/\s*$", "", description).strip()
                if description and len(description) > len(descriptions.get(code, "")):
                    descriptions[code] = description
    return descriptions


def sql_quote(value: str) -> str:
    return value.replace("'", "''")


def write_sql(rows: list[dict], output: Path) -> None:
    statements = [
        "-- Seed Thai language standards and indicators for ม.2 - ม.6.",
        "-- Generated from หลักสูตรภาษาไทย ส่วนที่ 4.docx.",
        "",
    ]
    for grade in GRADE_TABLES:
        for code, description in STANDARD_TEXT.items():
            statements.append(
                "insert into curriculum_standards (learning_area, class_level_code, standard_code, description)\n"
                f"values ('ภาษาไทย', '{grade}', '{code}', '{sql_quote(description)}')\n"
                "on conflict (learning_area, class_level_code, standard_code) do update\n"
                "set description = excluded.description;"
            )

        descriptions = indicator_descriptions(rows, grade)
        def code_sort(value: str) -> tuple[int, int, int, int]:
            match = re.search(r"ท\s*(\d+)\.(\d+)\s*[มป]\.(\d+)(?:-(\d+))?/(\d+)", value)
            if not match:
                return (99, 99, 99, 99)
            standard_a, standard_b, _grade_start, _grade_end, number = match.groups()
            return (int(standard_a), int(standard_b), int(number), 0)

        for code in sorted(descriptions, key=code_sort):
            standard = standard_code(code)
            if not standard:
                continue
            statements.append(
                "insert into curriculum_indicators (standard_id, indicator_code, description)\n"
                f"select cs.id, '{sql_quote(code)}', '{sql_quote(descriptions[code])}'\n"
                "from curriculum_standards cs\n"
                f"where cs.learning_area = 'ภาษาไทย' and cs.class_level_code = '{grade}'\n"
                f"  and cs.standard_code = '{standard}'\n"
                "on conflict (standard_id, indicator_code) do update\n"
                "set description = excluded.description;"
            )

    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text("\n\n".join(statements) + "\n", encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--source",
        type=Path,
        default=Path("หลักสตูร") / "หลักสูตรภาษาไทย ส่วนที่ 4.docx",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("src/data/curriculum/thai/thaiSecondaryData.json"),
    )
    parser.add_argument("--sql-output", type=Path)
    args = parser.parse_args()
    rows = generate(args.source)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(rows, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {len(rows)} rows to {args.output}")
    report(rows)
    if args.sql_output:
        write_sql(rows, args.sql_output)
        print(f"wrote SQL seed to {args.sql_output}")


if __name__ == "__main__":
    main()
