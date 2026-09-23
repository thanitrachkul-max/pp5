"""Extract secondary Thai indicators from the official midway/exit DOCX table.

The school's local revised curriculum contains only M.1; M.2-M.6 indicators
come from tmp/curriculum-word/(ไฟล์เวิร์ด) ตัวชี้วัดระหว่างทาง ปลายทาง/1. ภาษาไทย.docx.
"""
from __future__ import annotations

import json
import re
import sys
import unicodedata
from pathlib import Path
from docx import Document

ROOT = Path(__file__).resolve().parents[1]
# Pass the official Thai midway/exit indicator DOCX as the first argument.
SOURCE = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / 'tmp/curriculum-word/(ไฟล์เวิร์ด) ตัวชี้วัดระหว่างทาง ปลายทาง/1. ภาษาไทย.docx'
OUTPUT = ROOT / 'src/data/curriculum/thai/thaiSecondaryData.json'
THAI_DIGITS = str.maketrans('๐๑๒๓๔๕๖๗๘๙', '0123456789')
CODE = re.compile(r'ท\s*\.?\s*([1-5])\s*\.\s*1\s*ม\s*\.\s*(2|3|4\s*[-–]\s*6)\s*/\s*(\d+)')
STRANDS = {1: 'การอ่าน', 2: 'การเขียน', 3: 'การฟัง การดู และการพูด', 4: 'หลักการใช้ภาษาไทย', 5: 'วรรณคดีและวรรณกรรม'}


def normalize(value: str) -> str:
    return re.sub(r'\s+', ' ', unicodedata.normalize('NFKC', value).translate(THAI_DIGITS)).strip()


def indicators(value: str):
    clean = normalize(value)
    matches = list(CODE.finditer(clean))
    for i, match in enumerate(matches):
        section = int(match.group(1))
        grade = match.group(2).replace(' ', '').replace('–', '-')
        number = int(match.group(3))
        description = clean[match.end():matches[i + 1].start() if i + 1 < len(matches) else None].strip()
        if description:
            yield section, grade, number, description


def main():
    document = Document(SOURCE)
    output = []
    for grade, table_indexes in [('ม.2', range(38, 43)), ('ม.3', range(43, 48)),
                                 ('ม.4', range(48, 53)), ('ม.5', range(48, 53)), ('ม.6', range(48, 53))]:
        found = {}
        for table_index in table_indexes:
            for row in document.tables[table_index].rows[1:]:
                if len(row.cells) < 3: continue
                for column, field in [(1, 'midwayIndicator'), (2, 'exitIndicator')]:
                    for section, source_grade, number, description in indicators(row.cells[column].text):
                        if source_grade not in [grade[2:], '4-6']:
                            continue
                        code = f'ท {section}.1 ม.{source_grade}/{number}'
                        item = found.setdefault(code, {
                            'id': f'th-{grade}-{section}-{number}',
                            'subject': 'ภาษาไทย', 'learningArea': 'ภาษาไทย',
                            'gradeLevel': grade, 'strandNo': section,
                            'strandName': STRANDS[section], 'standardCode': f'ท {section}.1',
                            'standardDescription': '', 'indicatorCode': code,
                            'midwayIndicator': None, 'exitIndicator': None,
                            'learningAreaNote': None,
                        })
                        item[field] = f'{code} {description}'
        expected = 32 if grade == 'ม.2' else 36
        if len(found) != expected:
            raise ValueError(f'{grade}: expected {expected} indicators, got {len(found)}: {sorted(found)}')
        output.extend(sorted(found.values(), key=lambda x: (x['strandNo'], int(x['indicatorCode'].split('/')[-1]))))
    OUTPUT.write_text(json.dumps(output, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f'Wrote {len(output)} indicators to {OUTPUT}')


if __name__ == '__main__':
    main()
