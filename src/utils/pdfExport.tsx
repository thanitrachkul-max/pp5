import React from "react";
import {
  Document,
  Font,
  Image,
  Page,
  StyleSheet,
  Text,
  View,
  pdf,
} from "@react-pdf/renderer";
import type { AppData, GradebookApprovalStatus, Indicator, ScoreUnit, Student } from "../types";

const FONT_FAMILY = "TH Sarabun PSK";
const DEFAULT_SCHOOL_NAME = "โรงเรียนกาฬสินธุ์ปัญญานุกูล จังหวัดกาฬสินธุ์";
const DEFAULT_AGENCY_NAME = "สำนักบริหารงานการศึกษาพิเศษ";
const DEFAULT_LOGO_URL = "/logo3.png";
const LEGACY_LOGO_URL = "/logo1.png";
const KALASIN_PANYANUKUL_SCHOOL_NAME_PART = "กาฬสินธุ์ปัญญานุกูล";
const KALASIN_DEFAULT_HEAD_OF_EVALUATION = "นางสาว ประภาวดี ศรีทับ";
const KALASIN_DEFAULT_DEPUTY_DIRECTOR = "นางสาว อัจฉราภรณ์ เศษวิ";
const KALASIN_DEFAULT_LEARNING_AREA_HEADS: Record<string, string> = {
  ภาษาไทย: "นางสาว พรชิดา ภูแสงสั่น",
  คณิตศาสตร์: "นางสาว ราตรี ภูจอมแก้ว",
  วิทยาศาสตร์และเทคโนโลยี: "นางสาว พิยา คำปัน",
  "สังคมศึกษา ศาสนา และวัฒนธรรม": "นางสาว ประภาวดี ศรีทับ",
  สุขศึกษาและพลศึกษา: "นาย ทนงเดช วงษ์ประจันต์",
  ศิลปะ: "นาย วสันต์ วอแพง",
  ภาษาต่างประเทศ: "นางสาว พรนิมา สว่างศรี",
  การงานอาชีพ: "นาง ฐิติมา สุ้มเกษตร",
};

const THAI_MONTHS_FULL = [
  "มกราคม",
  "กุมภาพันธ์",
  "มีนาคม",
  "เมษายน",
  "พฤษภาคม",
  "มิถุนายน",
  "กรกฎาคม",
  "สิงหาคม",
  "กันยายน",
  "ตุลาคม",
  "พฤศจิกายน",
  "ธันวาคม",
];

const COLORS = {
  border: "#64748B",
  lightBorder: "#CBD5E1",
  orange: "#FCE4D6",
  coverBlue: "#F3F8FF",
  coverBorder: "#CBD5E1",
  yellow: "#FEF9C3",
  green: "#DCFCE7",
  blue: "#DBEAFE",
  cyan: "#CCFFFF",
  white: "#FFFFFF",
  muted: "#F8FAFC",
  red: "#DC2626",
  slate: "#0F172A",
};

const LANDSCAPE_CONTENT_WIDTH = 790;
const PORTRAIT_CONTENT_WIDTH = 536;

let fontsRegistered = false;

function publicUrl(path: string) {
  if (typeof window === "undefined") return path.startsWith("/") ? `public${path}` : path;
  return new URL(path, window.location.origin).toString();
}

function assetUrl(path: string | undefined) {
  const fallback = DEFAULT_LOGO_URL;
  const target = path && path !== LEGACY_LOGO_URL ? path : fallback;
  if (/^(https?:|data:|blob:)/i.test(target)) return target;
  return publicUrl(target.startsWith("/") ? target : `/${target}`);
}

function registerPdfFonts() {
  if (fontsRegistered) return;
  Font.register({
    family: FONT_FAMILY,
    fonts: [
      { src: publicUrl("/fonts/Sarabun-Regular.ttf"), fontWeight: "normal" },
      { src: publicUrl("/fonts/Sarabun-Bold.ttf"), fontWeight: "bold" },
    ],
  });
  fontsRegistered = true;
}

function text(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value);
}

function numeric(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function sanitizeFileName(value: string) {
  return value.replace(/[\\/:*?"<>|]/g, " ").replace(/\s+/g, " ").trim();
}

function getAvg(keys: string[], attrs: Record<string, unknown> | undefined) {
  let sum = 0;
  let count = 0;
  keys.forEach((key) => {
    const value = attrs?.[key];
    if (value !== undefined && value !== "") {
      sum += Number(value);
      count += 1;
    }
  });
  return count > 0 ? Math.round(sum / count) : 0;
}

function normalizeLearningArea(value: string) {
  return value.replace(/\s+/g, "").toLowerCase();
}

function applyPdfOfficialDisplayDefaults(generalInfo: AppData["generalInfo"]): AppData["generalInfo"] {
  const schoolName = generalInfo.schoolName || DEFAULT_SCHOOL_NAME;
  const shouldUseKalasinDefaults = schoolName.includes(KALASIN_PANYANUKUL_SCHOOL_NAME_PART);
  const normalizedLearningArea = normalizeLearningArea(generalInfo.learningArea || "");
  const defaultLearningAreaHead = Object.entries(KALASIN_DEFAULT_LEARNING_AREA_HEADS).find(
    ([area]) => normalizeLearningArea(area) === normalizedLearningArea,
  )?.[1] ?? "";

  if (!shouldUseKalasinDefaults) return generalInfo;

  return {
    ...generalInfo,
    headOfLearningArea: generalInfo.headOfLearningArea || defaultLearningAreaHead,
    headOfEvaluation: generalInfo.headOfEvaluation || KALASIN_DEFAULT_HEAD_OF_EVALUATION,
    deputyDirector: generalInfo.deputyDirector || KALASIN_DEFAULT_DEPUTY_DIRECTOR,
  };
}

function gradeFromTotal(total: number) {
  if (total >= 80) return "4";
  if (total >= 75) return "3.5";
  if (total >= 70) return "3";
  if (total >= 65) return "2.5";
  if (total >= 60) return "2";
  if (total >= 55) return "1.5";
  if (total >= 50) return "1";
  return "0";
}

function qualityText(score: number) {
  if (score === 3) return "ดีเยี่ยม";
  if (score === 2) return "ดี";
  if (score === 1) return "ผ่าน";
  return "ไม่ผ่าน";
}

function bodyRowHeight(rowCount: number, compact = 14) {
  if (rowCount <= 10) return 20;
  if (rowCount <= 16) return 17;
  if (rowCount <= 24) return 15;
  return compact;
}

function formatApprovalDate(value: string | undefined) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return "วันที่ ....../....../......";
  }
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return "วันที่ ....../....../......";
  return `วันที่ ${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}/${year + 543}`;
}

function formatApprovalInputDate(value: string | undefined) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return "";
  const [year, month, day] = value.split("-");
  return `${month}/${day}/${year}`;
}

function getHoursFromText(value: string) {
  if (!value) return 0;
  if (value.includes("-")) {
    const [start, end] = value.split("-").map(Number);
    if (Number.isFinite(start) && Number.isFinite(end)) return Math.max(0, end - start + 1);
  }
  return 1;
}

const styles = StyleSheet.create({
  portraitPage: {
    padding: 24,
    fontFamily: FONT_FAMILY,
    fontSize: 16,
    color: COLORS.slate,
  },
  landscapePage: {
    padding: 18,
    fontFamily: FONT_FAMILY,
    fontSize: 11,
    color: COLORS.slate,
  },
  pageTitle: {
    textAlign: "center",
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 5,
  },
  pageSubtitle: {
    textAlign: "center",
    fontSize: 15,
    marginBottom: 7,
  },
  coverCode: {
    position: "absolute",
    right: 24,
    top: 24,
    fontSize: 10.5,
    fontWeight: "bold",
  },
  coverLogo: {
    width: 72,
    height: 72,
    objectFit: "contain",
    alignSelf: "center",
    marginTop: 0,
    marginBottom: 8,
  },
  coverMainTitle: {
    textAlign: "center",
    fontSize: 11,
    fontWeight: "bold",
    lineHeight: 1.16,
  },
  coverInfoRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 3,
  },
  coverLabel: {
    fontSize: 10.5,
    marginHorizontal: 2,
  },
  coverField: {
    minWidth: 40,
    minHeight: 14,
    paddingHorizontal: 3,
    paddingTop: 0,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    backgroundColor: COLORS.yellow,
    textAlign: "center",
    fontSize: 10.5,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
  },
  table: {
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderColor: COLORS.border,
  },
  cell: {
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 2,
    paddingVertical: 1,
    justifyContent: "center",
  },
  cellText: {
    fontSize: 10,
    lineHeight: 1.08,
  },
  coverCellText: {
    fontSize: 9,
    lineHeight: 1.05,
  },
  coverTinyText: {
    fontSize: 7.5,
    lineHeight: 1,
  },
  tinyText: {
    fontSize: 7,
    lineHeight: 1.02,
  },
  smallText: {
    fontSize: 8.4,
    lineHeight: 1.05,
  },
  normalText: {
    fontSize: 16,
    lineHeight: 1.18,
  },
  center: {
    textAlign: "center",
  },
  right: {
    textAlign: "right",
  },
  bold: {
    fontWeight: "bold",
  },
  signatureBlock: {
    marginTop: 12,
    paddingHorizontal: 20,
  },
  teacherSignaturePair: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 2,
  },
  teacherSignatureItem: {
    width: 238,
    minHeight: 48,
  },
  teacherSignatureLineRow: {
    flexDirection: "row",
    alignItems: "flex-end",
  },
  teacherSignaturePrefix: {
    width: 40,
    paddingRight: 4,
    textAlign: "right",
  },
  teacherSignatureLine: {
    flexGrow: 1,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    borderStyle: "dotted",
    height: 8,
  },
  teacherSignatureCaption: {
    marginLeft: 40,
    textAlign: "center",
    fontSize: 9.5,
    lineHeight: 1.04,
  },
  teacherSignatureName: {
    marginTop: 2,
  },
  signatureRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "flex-end",
    marginTop: 2,
  },
  signatureLine: {
    width: 168,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    borderStyle: "dotted",
    height: 8,
  },
  signatureText: {
    fontSize: 10.5,
    lineHeight: 1.04,
  },
  signatureNameRow: {
    flexDirection: "row",
    justifyContent: "center",
    marginTop: 0,
  },
  approvalDateBox: {
    width: 116,
    height: 24,
    borderWidth: 1,
    borderColor: COLORS.lightBorder,
    borderRadius: 3,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
  },
  approvalDateText: {
    flexGrow: 1,
    textAlign: "center",
    fontSize: 10.5,
    lineHeight: 1,
  },
  approvalDateIcon: {
    width: 9,
    height: 9,
    borderWidth: 1,
    borderColor: COLORS.slate,
    marginLeft: 4,
  },
  approvalDateIconTop: {
    position: "absolute",
    left: -1,
    right: -1,
    top: 2,
    borderTopWidth: 1,
    borderTopColor: COLORS.slate,
  },
  instructionHeading: {
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 5,
  },
  paragraph: {
    fontSize: 14.5,
    lineHeight: 1.22,
    marginBottom: 2.5,
  },
});

type CellProps = {
  key?: React.Key;
  children?: React.ReactNode;
  width?: number;
  flex?: number;
  minHeight?: number;
  backgroundColor?: string;
  bold?: boolean;
  center?: boolean;
  style?: Record<string, unknown> | Array<Record<string, unknown>>;
  textStyle?: Record<string, unknown> | Array<Record<string, unknown>>;
};

function flattenTextChild(child: React.ReactNode): string | null {
  if (child === null || child === undefined || typeof child === "boolean") return "";
  if (typeof child === "string" || typeof child === "number") return String(child);
  if (Array.isArray(child)) {
    const parts = child.map(flattenTextChild);
    if (parts.every((part) => part !== null)) return parts.join("");
  }
  return null;
}

function Cell({
  children,
  width,
  flex,
  minHeight = 16,
  backgroundColor,
  bold = false,
  center = true,
  style,
  textStyle,
}: CellProps) {
  const textContent = flattenTextChild(children);
  const content =
    textContent !== null ? (
      <Text
        style={[
          styles.cellText,
          center ? styles.center : {},
          bold ? styles.bold : {},
          textStyle ?? {},
        ]}
      >
        {textContent}
      </Text>
    ) : (
      children
    );

  return (
    <View
      style={[
        styles.cell,
        { minHeight },
        typeof width === "number" ? { width } : { flex: flex ?? 1 },
        backgroundColor ? { backgroundColor } : {},
        style ?? {},
      ]}
    >
      {content}
    </View>
  );
}

function HeaderCell(props: CellProps) {
  return <Cell {...props} backgroundColor={props.backgroundColor ?? COLORS.orange} bold />;
}

function CoverHeaderCell({ style, textStyle, minHeight, ...props }: CellProps) {
  return (
    <Cell
      {...props}
      minHeight={minHeight ?? 30}
      backgroundColor={props.backgroundColor ?? COLORS.coverBlue}
      bold
      style={[{ borderColor: COLORS.coverBorder }, ...(Array.isArray(style) ? style : [style ?? {}])]}
      textStyle={[styles.coverCellText, ...(Array.isArray(textStyle) ? textStyle : [textStyle ?? {}])]}
    />
  );
}

function CoverCell({ style, textStyle, minHeight, ...props }: CellProps) {
  return (
    <Cell
      {...props}
      minHeight={minHeight ?? 30}
      style={[{ borderColor: COLORS.coverBorder }, ...(Array.isArray(style) ? style : [style ?? {}])]}
      textStyle={[styles.coverCellText, ...(Array.isArray(textStyle) ? textStyle : [textStyle ?? {}])]}
    />
  );
}

function InfoField({
  label,
  value,
  width,
  backgroundColor = COLORS.yellow,
}: {
  label: string;
  value: string | number | undefined;
  width: number;
  backgroundColor?: string;
}) {
  return (
    <>
      <Text style={styles.coverLabel}>{label}</Text>
      <Text wrap={false} style={[styles.coverField, { width, backgroundColor }]}>{text(value)}</Text>
    </>
  );
}

function buildSummary(data: AppData) {
  const summary = {
    totalStudents: data.students.length,
    grades: { "4": 0, "3.5": 0, "3": 0, "2.5": 0, "2": 0, "1.5": 0, "1": 0, "0": 0, ผ: 0, มผ: 0 },
    analytical: { "3": 0, "2": 0, "1": 0, "0": 0 },
    attributes: { "3": 0, "2": 0, "1": 0, "0": 0 },
  };

  data.students.forEach((student) => {
    const score = data.scores[student.id] || {};
    const betweenTerm = getBetweenTermTotal(data, student.id);
    const total = betweenTerm + numeric(score.midterm) + numeric(score.final);
    const grade = gradeFromTotal(total);
    summary.grades[grade as keyof typeof summary.grades] += 1;
    if (total >= 50) summary.grades["ผ"] += 1;
    else summary.grades["มผ"] += 1;

    const analyticalAvg = getAvg(
      ["attr1", "attr2", "attr3", "attr4", "attr5", "attr6", "attr7"],
      data.analytical[student.id],
    );
    summary.analytical[analyticalAvg.toString() as keyof typeof summary.analytical] += 1;

    const attrs = data.attributes[student.id] || {};
    const attrAverages = [
      getAvg(["attr1_1", "attr1_2", "attr1_3", "attr1_4"], attrs),
      getAvg(["attr2_1", "attr2_2"], attrs),
      getAvg(["attr3_1"], attrs),
      getAvg(["attr4_1", "attr4_2"], attrs),
      getAvg(["attr5_1", "attr5_2"], attrs),
      getAvg(["attr6_1", "attr6_2"], attrs),
      getAvg(["attr7_1", "attr7_2", "attr7_3"], attrs),
      getAvg(["attr8_1", "attr8_2"], attrs),
    ];
    const attrAvg = Math.round(attrAverages.reduce((sum, value) => sum + value, 0) / 8);
    summary.attributes[attrAvg.toString() as keyof typeof summary.attributes] += 1;
  });

  return summary;
}

function getPercent(count: number, total: number) {
  if (total === 0) return "0";
  return Math.round((count / total) * 100).toString();
}

function defaultScoreUnits(): ScoreUnit[] {
  return Array.from({ length: 3 }).map(() => ({
    name: "",
    indicators: Array.from({ length: 4 }).map(() => ({
      code: "",
      fullScore: 0,
      passingScore: 0,
    })),
  }));
}

function getUnits(data: AppData) {
  return data.scoreConfig?.units?.length ? data.scoreConfig.units : defaultScoreUnits();
}

function getIndicatorSlotCount(unit: ScoreUnit) {
  return Math.max(4, unit.indicators.length);
}

function getIndicatorSlotIndexes(unit: ScoreUnit) {
  return Array.from({ length: getIndicatorSlotCount(unit) }, (_, index) => index);
}

function getUnitName(unit: ScoreUnit, index: number) {
  const name = unit.name?.trim();
  return name ? `${index + 1}. ${name}` : `${index + 1}`;
}

function getBetweenTermTotal(data: AppData, studentId: string) {
  const score = data.scores[studentId] || {};
  let total = 0;
  if (data.scoreConfig?.units) {
    data.scoreConfig.units.forEach((unit, unitIndex) => {
      unit.indicators.forEach((indicator, indicatorIndex) => {
        if (indicator) total += numeric(score[`u${unitIndex}_i${indicatorIndex}`]);
      });
    });
    return total;
  }

  Object.keys(score).forEach((key) => {
    if (key.startsWith("u") && key.includes("_i")) total += numeric(score[key]);
  });
  return total;
}

function getUnitTotal(data: AppData, studentId: string, unitIndex: number) {
  const score = data.scores[studentId] || {};
  return getUnits(data)[unitIndex].indicators.reduce(
    (sum, _indicator, indicatorIndex) => sum + numeric(score[`u${unitIndex}_i${indicatorIndex}`]),
    0,
  );
}

function CoverPage({
  data,
  approvalStatus,
}: {
  data: AppData;
  approvalStatus?: GradebookApprovalStatus | null;
}) {
  const generalInfo = applyPdfOfficialDisplayDefaults(data.generalInfo);
  const schoolName = generalInfo.schoolName || DEFAULT_SCHOOL_NAME;
  const agencyName = generalInfo.agencyName || DEFAULT_AGENCY_NAME;
  const logoUrl = assetUrl(generalInfo.logoUrl);
  const summary = buildSummary(data);
  const grades = ["4", "3.5", "3", "2.5", "2", "1.5", "1", "0"] as const;
  const qualities = ["3", "2", "1", "0"] as const;
  const coverTableWidths = {
    total: 43,
    grade: 26.5,
    summary: 28,
    report: 115,
    quality: 27.5,
  };
  const teacherNames = [generalInfo.teacherName, generalInfo.teacherName2, generalInfo.teacherName3]
    .map((name) => name?.trim())
    .filter((name): name is string => Boolean(name));
  const teacherText = teacherNames.length > 1
    ? teacherNames.map((name, index) => `${index + 1}. ${name}`).join("  ")
    : teacherNames[0] ?? "";
  const teacherFieldWidth = teacherNames.length >= 3 ? 92 : teacherNames.length === 2 ? 144 : 320;

  return (
    <Page size="A4" style={styles.portraitPage}>
      <Text style={styles.coverCode}>ปพ. 5</Text>
      <Image src={logoUrl} style={styles.coverLogo} />
      <Text style={styles.coverMainTitle}>แบบบันทึกผลการเรียนรายวิชา</Text>
      <Text style={styles.coverMainTitle}>ตามหลักสูตรแกนกลางการศึกษาขั้นพื้นฐาน พุทธศักราช 2551</Text>
      <Text style={styles.coverMainTitle}>{schoolName}</Text>
      <Text style={[styles.coverMainTitle, { marginBottom: 18 }]}>{agencyName}</Text>

      <View style={styles.coverInfoRow}>
        <InfoField label="ชั้นมัธยมศึกษาปีที่" value={generalInfo.gradeLevel} width={60} />
        <InfoField label="ภาคเรียนที่" value={generalInfo.semester} width={48} />
        <InfoField label="ปีการศึกษา" value={generalInfo.academicYear} width={60} backgroundColor={COLORS.white} />
      </View>
      <View style={styles.coverInfoRow}>
        <InfoField label="รหัสวิชา" value={generalInfo.subjectCode} width={48} />
        <InfoField label="รายวิชา" value={generalInfo.subjectName} width={120} />
        <InfoField label="กลุ่มสาระการเรียนรู้" value={generalInfo.learningArea} width={168} />
      </View>
      <View style={styles.coverInfoRow}>
        <InfoField label="รวมเวลาเรียน" value={generalInfo.totalHours} width={36} />
        <Text style={styles.coverLabel}>ชั่วโมง/สัปดาห์</Text>
        <InfoField label="" value={generalInfo.hoursPerSemester} width={36} backgroundColor={COLORS.muted} />
        <Text style={styles.coverLabel}>ชั่วโมง/ภาคเรียน</Text>
      </View>
      <View style={styles.coverInfoRow}>
        {teacherNames.length <= 1 ? (
          <InfoField label="ครูผู้สอน" value={teacherNames[0] ?? ""} width={teacherFieldWidth} />
        ) : (
          teacherNames.map((name, index) => (
            <React.Fragment key={`${name}-${index}`}>
              <InfoField
                label={index === 0 ? "ครูผู้สอน 1." : `${index + 1}.`}
                value={name}
                width={teacherFieldWidth}
              />
            </React.Fragment>
          ))
        )}
      </View>
      <View style={[styles.coverInfoRow, { marginBottom: 10 }]}>
        <InfoField label="ครูประจำชั้น 1." value={generalInfo.homeroomTeacher1} width={126} backgroundColor={COLORS.white} />
        <InfoField label="2." value={generalInfo.homeroomTeacher2} width={126} backgroundColor={COLORS.white} />
        <InfoField label="3." value={generalInfo.homeroomTeacher3} width={126} backgroundColor={COLORS.white} />
      </View>

      <View style={[styles.table, { width: PORTRAIT_CONTENT_WIDTH, marginTop: 3, borderColor: COLORS.coverBorder }]}>
        <View style={styles.row}>
          <CoverHeaderCell width={coverTableWidths.total} minHeight={90}>
            จำนวน{"\n"}นักเรียน{"\n"}ทั้งหมด
          </CoverHeaderCell>
          <View style={{ width: PORTRAIT_CONTENT_WIDTH - coverTableWidths.total }}>
            <View style={styles.row}>
              <CoverHeaderCell width={493} minHeight={30}>สรุปผลการเรียน</CoverHeaderCell>
            </View>
            <View style={styles.row}>
              <View>
                <View style={styles.row}>
                  <CoverHeaderCell width={coverTableWidths.grade * 8} minHeight={30} textStyle={styles.coverTinyText}>
                    จำนวนนักเรียนที่ได้รับระดับ{"\n"}ผลการเรียน
                  </CoverHeaderCell>
                  <CoverHeaderCell width={coverTableWidths.summary * 2} minHeight={30}>สรุป</CoverHeaderCell>
                </View>
                <View style={styles.row}>
                  {grades.map((grade) => (
                    <CoverHeaderCell key={grade} width={coverTableWidths.grade}>{grade}</CoverHeaderCell>
                  ))}
                  <CoverHeaderCell width={coverTableWidths.summary}>ผ</CoverHeaderCell>
                  <CoverHeaderCell width={coverTableWidths.summary}>มผ</CoverHeaderCell>
                </View>
              </View>
              <CoverHeaderCell width={coverTableWidths.report} minHeight={60}>รายงานการประเมิน</CoverHeaderCell>
              <View>
                <CoverHeaderCell width={coverTableWidths.quality * 4} minHeight={30} textStyle={styles.coverTinyText}>
                  จำนวนนักเรียนที่ได้รับระดับ{"\n"}คุณภาพ
                </CoverHeaderCell>
                <View style={styles.row}>
                  <CoverHeaderCell width={coverTableWidths.quality} textStyle={styles.coverTinyText}>ดีเยี่ยม{"\n"}(3)</CoverHeaderCell>
                  <CoverHeaderCell width={coverTableWidths.quality} textStyle={styles.coverTinyText}>ดี{"\n"}(2)</CoverHeaderCell>
                  <CoverHeaderCell width={coverTableWidths.quality} textStyle={styles.coverTinyText}>ผ่าน{"\n"}(1)</CoverHeaderCell>
                  <CoverHeaderCell width={coverTableWidths.quality} textStyle={styles.coverTinyText}>ไม่ผ่าน{"\n"}(0)</CoverHeaderCell>
                </View>
              </View>
            </View>
          </View>
        </View>
        <View style={styles.row}>
          <CoverCell width={coverTableWidths.total}>{summary.totalStudents}</CoverCell>
          {grades.map((grade) => (
            <CoverCell key={grade} width={coverTableWidths.grade}>{summary.grades[grade]}</CoverCell>
          ))}
          <CoverCell width={coverTableWidths.summary}>{summary.grades["ผ"]}</CoverCell>
          <CoverCell width={coverTableWidths.summary}>{summary.grades["มผ"]}</CoverCell>
          <CoverCell width={coverTableWidths.report} textStyle={styles.coverTinyText}>การอ่านคิดวิเคราะห์และเขียน</CoverCell>
          {qualities.map((quality) => (
            <CoverCell key={quality} width={coverTableWidths.quality}>{summary.analytical[quality]}</CoverCell>
          ))}
        </View>
        <View style={styles.row}>
          <CoverCell width={coverTableWidths.total}>%</CoverCell>
          {grades.map((grade) => (
            <CoverCell key={grade} width={coverTableWidths.grade}>{getPercent(summary.grades[grade], summary.totalStudents)}</CoverCell>
          ))}
          <CoverCell width={coverTableWidths.summary}>{summary.grades["ผ"]}</CoverCell>
          <CoverCell width={coverTableWidths.summary}>{summary.grades["มผ"]}</CoverCell>
          <CoverCell width={coverTableWidths.report} textStyle={styles.coverTinyText}>คุณลักษณะอันพึงประสงค์</CoverCell>
          {qualities.map((quality) => (
            <CoverCell key={quality} width={coverTableWidths.quality}>{summary.attributes[quality]}</CoverCell>
          ))}
        </View>
      </View>

      <View style={styles.signatureBlock}>
        <Text style={[styles.signatureText, styles.bold]}>การอนุมัติผลการเรียน</Text>
        {teacherNames.length === 2 ? (
          <TeacherSignaturePair names={teacherNames} />
        ) : (
          <SignatureLine label="ครูผู้สอน" name={teacherText} />
        )}
        <SignatureLine label="หัวหน้ากลุ่มสาระการเรียนรู้" name={generalInfo.headOfLearningArea} />
        <SignatureLine label="หัวหน้างานวัดและประเมินผล" name={generalInfo.headOfEvaluation} />
        <Text style={[styles.signatureText, styles.bold, { marginTop: 5 }]}>เรียนเสนอเพื่อพิจารณา</Text>
        <SignatureLine label="รองผู้อำนวยการฝ่ายวิชาการ" name={generalInfo.deputyDirector} />
        <View style={[styles.row, { justifyContent: "center", marginTop: 10, marginBottom: 10 }]}>
          <ApprovalChoice checked={approvalStatus === "approved"} label="อนุมัติ" />
          <View style={{ width: 36 }} />
          <ApprovalChoice checked={approvalStatus === "revision_requested"} label="ไม่อนุมัติ" />
        </View>
        <DirectorSignatureBlock
          schoolName={schoolName}
          directorName={generalInfo.schoolDirector}
          approvalDate={generalInfo.approvalDate}
        />
      </View>
    </Page>
  );
}

function TeacherSignaturePair({ names }: { names: string[] }) {
  return (
    <View style={styles.teacherSignaturePair}>
      {names.slice(0, 2).map((name, index) => (
        <View key={`${name}-${index}`} style={styles.teacherSignatureItem}>
          <View style={styles.teacherSignatureLineRow}>
            <Text style={[styles.signatureText, styles.teacherSignaturePrefix]}>ลงชื่อ</Text>
            <View style={styles.teacherSignatureLine} />
          </View>
          <Text wrap={false} style={[styles.teacherSignatureCaption, styles.teacherSignatureName]}>
            ( {name} )
          </Text>
          <Text style={styles.teacherSignatureCaption}>ครูผู้สอน คนที่ {index + 1}</Text>
        </View>
      ))}
    </View>
  );
}

function SignatureLine({ label, name }: { label: string; name: string | undefined }) {
  return (
    <View style={{ height: 48, marginTop: 2 }}>
      <View style={styles.signatureRow}>
        <Text style={[styles.signatureText, { width: 72, textAlign: "right", paddingRight: 6 }]}>ลงชื่อ</Text>
        <View style={styles.signatureLine} />
        <Text style={[styles.signatureText, { width: 168, paddingLeft: 6 }]}>{label}</Text>
      </View>
      <View style={styles.signatureNameRow}>
        <Text style={[styles.signatureText, { width: 72 }]} />
        <Text style={[styles.signatureText, styles.center, { width: 168 }]}>
          ( {text(name)} )
        </Text>
        <Text style={[styles.signatureText, { width: 168 }]} />
      </View>
    </View>
  );
}

function DirectorSignatureBlock({
  schoolName,
  directorName,
  approvalDate,
}: {
  schoolName: string;
  directorName: string | undefined;
  approvalDate: string | undefined;
}) {
  return (
    <View style={{ marginTop: 2 }}>
      <View style={styles.signatureRow}>
        <Text style={[styles.signatureText, { width: 72, textAlign: "right", paddingRight: 6 }]}>ลงชื่อ</Text>
        <View style={styles.signatureLine} />
        <Text style={[styles.signatureText, { width: 168 }]} />
      </View>
      <View style={styles.signatureNameRow}>
        <Text style={[styles.signatureText, { width: 72 }]} />
        <Text style={[styles.signatureText, styles.center, { width: 168 }]}>
          ( {text(directorName)} )
        </Text>
        <Text style={[styles.signatureText, { width: 168 }]} />
      </View>
      <View style={[styles.signatureNameRow, { marginTop: 1 }]}>
        <Text style={[styles.signatureText, { width: 72 }]} />
        <Text wrap={false} style={[styles.signatureText, styles.center, { width: 168 }]}>
          {`ผู้อำนวยการ${schoolName}`}
        </Text>
        <Text style={[styles.signatureText, { width: 168 }]} />
      </View>
      <View style={[styles.signatureNameRow, { marginTop: 4 }]}>
        <Text style={[styles.signatureText, { width: 72 }]} />
        <View style={styles.approvalDateBox}>
          <Text style={styles.approvalDateText}>{formatApprovalInputDate(approvalDate)}</Text>
          <View style={styles.approvalDateIcon}>
            <View style={styles.approvalDateIconTop} />
          </View>
        </View>
        <Text style={[styles.signatureText, { width: 168 }]} />
      </View>
    </View>
  );
}

function ApprovalChoice({ checked, label }: { checked: boolean; label: string }) {
  return (
    <View style={[styles.row, { alignItems: "center" }]}>
      <View
        style={{
          width: 15,
          height: 15,
          borderWidth: 1,
          borderColor: COLORS.lightBorder,
          borderRadius: 2,
          marginRight: 6,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {checked ? <View style={{ width: 8, height: 8, backgroundColor: COLORS.slate }} /> : null}
      </View>
      <Text style={styles.signatureText}>{label}</Text>
    </View>
  );
}

function buildAttendanceDates(generalInfo: AppData["generalInfo"]) {
  const academicYearStr = generalInfo.academicYear || "2568";
  const semester = generalInfo.semester || "1";
  const academicYear = parseInt(academicYearStr, 10) - 543;
  const dates: Date[] = [];
  const holidays: Record<string, string> = {
    "01-01": "วันขึ้นปีใหม่",
    "04-06": "วันจักรี",
    "04-13": "วันสงกรานต์",
    "04-14": "วันสงกรานต์",
    "04-15": "วันสงกรานต์",
    "05-01": "วันแรงงาน",
    "05-04": "วันฉัตรมงคล",
    "06-03": "วันเฉลิมฯ พระราชินี",
    "07-28": "วันเฉลิมฯ ร.10",
    "08-12": "วันแม่แห่งชาติ",
    "10-13": "วันคล้ายวันสวรรคต ร.9",
    "10-23": "วันปิยมหาราช",
    "12-05": "วันพ่อแห่งชาติ",
    "12-10": "วันรัฐธรรมนูญ",
    "12-31": "วันสิ้นปี",
  };

  let currentDate = semester === "1" ? new Date(academicYear, 4, 10) : new Date(academicYear, 9, 25);
  while (currentDate.getDay() === 0 || currentDate.getDay() === 6) {
    currentDate.setDate(currentDate.getDate() + 1);
  }
  for (let i = 0; i < 100; i += 1) {
    dates.push(new Date(currentDate));
    currentDate.setDate(currentDate.getDate() + 1);
    while (currentDate.getDay() === 0 || currentDate.getDay() === 6) {
      currentDate.setDate(currentDate.getDate() + 1);
    }
  }
  return { dates, holidays };
}

function dateKey(date: Date) {
  return `${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function groupDatesByMonth(dates: Date[]) {
  const monthGroups = new Map<string, { label: string; dates: Array<{ date: Date; index: number }> }>();
  dates.forEach((date, index) => {
    const key = `${date.getFullYear()}-${date.getMonth()}`;
    const label = `${THAI_MONTHS_FULL[date.getMonth()]} พ.ศ.${date.getFullYear() + 543}`;
    if (!monthGroups.has(key)) monthGroups.set(key, { label, dates: [] });
    monthGroups.get(key)?.dates.push({ date, index });
  });
  return Array.from(monthGroups.values());
}

function weekGroups(monthDates: Array<{ date: Date; index: number }>) {
  const groups: Array<{ week: number; span: number }> = [];
  monthDates.forEach(({ index }) => {
    const week = Math.floor(index / 5) + 1;
    const last = groups[groups.length - 1];
    if (last?.week === week) last.span += 1;
    else groups.push({ week, span: 1 });
  });
  return groups;
}

function AttendanceMonthPage({
  data,
  month,
}: {
  key?: React.Key;
  data: AppData;
  month: { label: string; dates: Array<{ date: Date; index: number }> };
}) {
  const { dates, holidays } = buildAttendanceDates(data.generalInfo);
  const currentHoursPerWeek = parseInt(data.generalInfo.totalHours, 10) || 1;
  const totalRequiredHours = currentHoursPerWeek * 20;
  const monthKeys = month.dates.map(({ date }) => dateKey(date));
  const monthScheduledHours = monthKeys.reduce(
    (sum, key) => sum + getHoursFromText(text(data.attendance?.hoursMap?.[key])),
    0,
  );
  const rowHeight = bodyRowHeight(data.students.length, 14);
  const studentLeftWidth = 332;
  const summaryWidth = 111;
  const dayWidth = Math.max(12, (LANDSCAPE_CONTENT_WIDTH - studentLeftWidth - summaryWidth) / Math.max(1, month.dates.length));

  const attendedHours = (student: Student, keys: string[]) =>
    keys.reduce((sum, key) => {
      const record = text(data.attendance?.records?.[student.id]?.[key]).trim();
      if (!record) return sum;
      return sum + getHoursFromText(text(data.attendance?.hoursMap?.[key]));
    }, 0);

  return (
    <Page size="A4" orientation="landscape" style={styles.landscapePage}>
      <Text style={styles.pageTitle}>
        บันทึกเวลาเรียน ชั้นมัธยมศึกษาปีที่ {data.generalInfo.gradeLevel} ภาคเรียนที่ {data.generalInfo.semester} ปีการศึกษา {data.generalInfo.academicYear}
      </Text>
      <Text style={styles.pageSubtitle}>
        {month.label} - รวมเวลาเรียน {data.generalInfo.totalHours} ชั่วโมง/สัปดาห์ {data.generalInfo.hoursPerSemester} ชั่วโมงภาคเรียน
      </Text>

      <View style={styles.table}>
        <View style={styles.row}>
          <HeaderCell width={32} minHeight={20}>เลขที่</HeaderCell>
          <HeaderCell width={62} minHeight={20}>เลขประจำตัว</HeaderCell>
          <HeaderCell width={82} minHeight={20}>เลขประจำตัวประชาชน</HeaderCell>
          <HeaderCell width={126} minHeight={20}>ชื่อ - สกุล</HeaderCell>
          <HeaderCell width={30} minHeight={20}>สัปดาห์ที่</HeaderCell>
          {weekGroups(month.dates).map((group, index) => (
            <HeaderCell key={`${group.week}-${index}`} width={dayWidth * group.span} minHeight={20}>{group.week}</HeaderCell>
          ))}
          <HeaderCell width={40} minHeight={20}>รวมเดือน</HeaderCell>
          <HeaderCell width={39} minHeight={20}>มาเรียน%</HeaderCell>
          <HeaderCell width={32} minHeight={20}>สรุป</HeaderCell>
        </View>
        <View style={styles.row}>
          <HeaderCell width={302} minHeight={16} />
          <HeaderCell width={30} minHeight={16}>วันที่</HeaderCell>
          {month.dates.map(({ date }) => {
            const key = dateKey(date);
            return (
              <HeaderCell
                key={key}
                width={dayWidth}
                minHeight={16}
                backgroundColor={holidays[key] ? COLORS.cyan : COLORS.orange}
                textStyle={styles.smallText}
              >
                {date.getDate()}
              </HeaderCell>
            );
          })}
          <Cell width={40} minHeight={16} bold backgroundColor={COLORS.white}>{monthScheduledHours}</Cell>
          <Cell width={39} minHeight={16} bold backgroundColor={COLORS.white}>100</Cell>
          <Cell width={32} minHeight={16} bold backgroundColor={COLORS.white} />
        </View>
        <View style={styles.row}>
          <HeaderCell width={302} minHeight={17} />
          <HeaderCell width={30} minHeight={17}>ชั่วโมงที่</HeaderCell>
          {month.dates.map(({ date }) => {
            const key = dateKey(date);
            return (
              <HeaderCell
                key={key}
                width={dayWidth}
                minHeight={17}
                backgroundColor={holidays[key] ? COLORS.cyan : COLORS.orange}
                textStyle={styles.tinyText}
              >
                {holidays[key] ? holidays[key] : text(data.attendance?.hoursMap?.[key])}
              </HeaderCell>
            );
          })}
          <Cell width={40} minHeight={17} bold backgroundColor={COLORS.white}>{monthScheduledHours}</Cell>
          <Cell width={39} minHeight={17} bold backgroundColor={COLORS.white}>100</Cell>
          <Cell width={32} minHeight={17} bold backgroundColor={COLORS.white} />
        </View>

        {data.students.map((student, index) => {
          const monthHours = attendedHours(student, monthKeys);
          const allHours = attendedHours(student, dates.map(dateKey));
          const percentage = monthScheduledHours > 0 ? ((monthHours / monthScheduledHours) * 100).toFixed(2) : "0.00";
          return (
            <View key={student.id} style={styles.row}>
              <Cell width={32} minHeight={rowHeight} textStyle={styles.smallText}>{index + 1}</Cell>
              <Cell width={62} minHeight={rowHeight} textStyle={styles.smallText}>{student.studentId}</Cell>
              <Cell width={82} minHeight={rowHeight} textStyle={styles.smallText}>{student.citizenId}</Cell>
              <Cell width={126} minHeight={rowHeight} center={false} textStyle={styles.smallText}>{student.name}</Cell>
              <Cell width={30} minHeight={rowHeight} backgroundColor={COLORS.muted} />
              {month.dates.map(({ date }) => {
                const key = dateKey(date);
                return (
                  <Cell
                    key={key}
                    width={dayWidth}
                    minHeight={rowHeight}
                    backgroundColor={holidays[key] ? COLORS.cyan : COLORS.white}
                    textStyle={styles.smallText}
                  >
                    {holidays[key] ? "" : text(data.attendance?.records?.[student.id]?.[key])}
                  </Cell>
                );
              })}
              <Cell width={40} minHeight={rowHeight} bold textStyle={styles.smallText}>{monthHours}</Cell>
              <Cell width={39} minHeight={rowHeight} bold textStyle={styles.tinyText}>{percentage}</Cell>
              <Cell
                width={32}
                minHeight={rowHeight}
                bold
                textStyle={[styles.smallText, { color: allHours >= totalRequiredHours * 0.8 ? "#16A34A" : COLORS.red }]}
              >
                {allHours >= totalRequiredHours * 0.8 ? "ผ" : "มผ"}
              </Cell>
            </View>
          );
        })}
      </View>
    </Page>
  );
}

function ScoresPage({ data }: { data: AppData }) {
  const units = getUnits(data);
  const unitSlotCounts = units.map(getIndicatorSlotCount);
  const detailCols = unitSlotCounts.reduce((sum, count) => sum + count + 1, 0);
  const summaryCols = 8;
  const leftWidth = 290;
  const labelWidth = 82;
  const scoreColWidth = Math.max(11, (LANDSCAPE_CONTENT_WIDTH - leftWidth - labelWidth) / (detailCols + summaryCols));
  const storedScore = data.scoreConfig?.storedScore ?? 70;
  const hasConfiguredScores = Boolean(data.scoreConfig);
  const rowHeight = bodyRowHeight(data.students.length, 13);

  return (
    <Page size="A4" orientation="landscape" style={styles.landscapePage}>
      <Text style={styles.pageTitle}>
        บันทึกคะแนนวัดผลและประเมินผลการเรียนรู้ ชั้นมัธยมศึกษาปีที่ {data.generalInfo.gradeLevel} ภาคเรียนที่ {data.generalInfo.semester} ปีการศึกษา {data.generalInfo.academicYear}
      </Text>
      <View style={styles.table}>
        <View style={styles.row}>
          <HeaderCell width={30} minHeight={19}>เลขที่</HeaderCell>
          <HeaderCell width={56} minHeight={19}>เลขประจำตัว</HeaderCell>
          <HeaderCell width={78} minHeight={19}>เลขประชาชน</HeaderCell>
          <HeaderCell width={126} minHeight={19}>ชื่อ - สกุล</HeaderCell>
          <HeaderCell width={labelWidth + scoreColWidth * detailCols} minHeight={19}>บันทึกคะแนนวัดและประเมินผลการเรียนรู้</HeaderCell>
          <HeaderCell width={scoreColWidth * summaryCols} minHeight={19}>ภาคเรียนที่ {data.generalInfo.semester}</HeaderCell>
        </View>
        <View style={styles.row}>
          <HeaderCell width={leftWidth} minHeight={22} />
          <HeaderCell width={labelWidth} minHeight={22} textStyle={styles.smallText}>หน่วยการเรียนรู้ที่</HeaderCell>
          {units.map((unit, unitIndex) => (
            <React.Fragment key={`unit-${unitIndex}`}>
              <HeaderCell width={scoreColWidth * getIndicatorSlotCount(unit)} minHeight={22} textStyle={styles.tinyText}>
                {getUnitName(unit, unitIndex)}
              </HeaderCell>
              <HeaderCell width={scoreColWidth} minHeight={22} textStyle={styles.smallText}>รวม</HeaderCell>
            </React.Fragment>
          ))}
          {["รวมระหว่าง", "กลางภาค", "ปลายภาค", "รวมทั้งหมด", "ปกติ", "แก้ไข", "ร้อยละ", "สรุป"].map((label) => (
            <HeaderCell key={label} width={scoreColWidth} minHeight={22} textStyle={styles.tinyText}>{label}</HeaderCell>
          ))}
        </View>
        <View style={styles.row}>
          <HeaderCell width={leftWidth} minHeight={30} />
          <HeaderCell width={labelWidth} minHeight={30} textStyle={styles.smallText}>รหัสตัวชี้วัด/ผลการเรียนรู้</HeaderCell>
          {units.map((unit, unitIndex) => (
            <React.Fragment key={`codes-${unitIndex}`}>
              {getIndicatorSlotIndexes(unit).map((indicatorIndex) => (
                <HeaderCell key={`code-${unitIndex}-${indicatorIndex}`} width={scoreColWidth} minHeight={30} textStyle={styles.tinyText}>
                  {unit.indicators[indicatorIndex]?.code || ""}
                </HeaderCell>
              ))}
              <HeaderCell width={scoreColWidth} minHeight={30} />
            </React.Fragment>
          ))}
          <HeaderCell width={scoreColWidth} minHeight={30}>{storedScore}</HeaderCell>
          <HeaderCell width={scoreColWidth} minHeight={30}>10</HeaderCell>
          <HeaderCell width={scoreColWidth} minHeight={30}>20</HeaderCell>
          <HeaderCell width={scoreColWidth} minHeight={30}>100</HeaderCell>
          <HeaderCell width={scoreColWidth * 4} minHeight={30} />
        </View>
        <View style={styles.row}>
          <HeaderCell width={leftWidth} minHeight={18} />
          <HeaderCell width={labelWidth} minHeight={18} textStyle={styles.smallText}>คะแนนตามเกณฑ์</HeaderCell>
          {units.map((unit, unitIndex) => (
            <React.Fragment key={`passing-${unitIndex}`}>
              {getIndicatorSlotIndexes(unit).map((indicatorIndex) => (
                <HeaderCell key={`pass-${unitIndex}-${indicatorIndex}`} width={scoreColWidth} minHeight={18} textStyle={styles.tinyText}>
                  {unit.indicators[indicatorIndex]?.passingScore || ""}
                </HeaderCell>
              ))}
              <HeaderCell width={scoreColWidth} minHeight={18} textStyle={styles.tinyText}>
                {unit.indicators.reduce((sum, indicator) => sum + (indicator.passingScore || 0), 0) || ""}
              </HeaderCell>
            </React.Fragment>
          ))}
          <HeaderCell width={scoreColWidth} minHeight={18}>{Math.floor(storedScore / 2)}</HeaderCell>
          <HeaderCell width={scoreColWidth} minHeight={18}>5</HeaderCell>
          <HeaderCell width={scoreColWidth} minHeight={18}>10</HeaderCell>
          <HeaderCell width={scoreColWidth} minHeight={18}>50</HeaderCell>
          <HeaderCell width={scoreColWidth * 4} minHeight={18} />
        </View>
        {data.students.map((student, index) => {
          const score = data.scores[student.id] || {};
          const hasScoreData = hasConfiguredScores && Object.keys(score).length > 0;
          const betweenTermTotal = getBetweenTermTotal(data, student.id);
          const midterm = numeric(score.midterm);
          const final = numeric(score.final);
          const total = betweenTermTotal + midterm + final;
          const grade = gradeFromTotal(total);

          return (
            <View key={student.id} style={styles.row}>
              <Cell width={30} minHeight={rowHeight} textStyle={styles.smallText}>{index + 1}</Cell>
              <Cell width={56} minHeight={rowHeight} textStyle={styles.smallText}>{student.studentId}</Cell>
              <Cell width={78} minHeight={rowHeight} textStyle={styles.smallText}>{student.citizenId}</Cell>
              <Cell width={126} minHeight={rowHeight} center={false} textStyle={styles.smallText}>{student.name}</Cell>
              <Cell width={labelWidth} minHeight={rowHeight} backgroundColor={COLORS.muted} />
              {units.map((unit, unitIndex) => (
                <React.Fragment key={`score-row-${student.id}-${unitIndex}`}>
                  {getIndicatorSlotIndexes(unit).map((indicatorIndex) => (
                    <Cell key={`value-${unitIndex}-${indicatorIndex}`} width={scoreColWidth} minHeight={rowHeight} textStyle={styles.smallText}>
                      {unit.indicators[indicatorIndex] ? text(score[`u${unitIndex}_i${indicatorIndex}`]) : ""}
                    </Cell>
                  ))}
                  <Cell width={scoreColWidth} minHeight={rowHeight} backgroundColor={COLORS.muted} textStyle={styles.smallText}>
                    {hasScoreData ? getUnitTotal(data, student.id, unitIndex) : ""}
                  </Cell>
                </React.Fragment>
              ))}
              <Cell width={scoreColWidth} minHeight={rowHeight} backgroundColor={COLORS.blue} textStyle={styles.smallText}>{hasScoreData ? betweenTermTotal : ""}</Cell>
              <Cell width={scoreColWidth} minHeight={rowHeight} textStyle={styles.smallText}>{hasScoreData ? midterm : ""}</Cell>
              <Cell width={scoreColWidth} minHeight={rowHeight} textStyle={styles.smallText}>{hasScoreData ? final : ""}</Cell>
              <Cell width={scoreColWidth} minHeight={rowHeight} backgroundColor={COLORS.blue} bold textStyle={styles.smallText}>{hasScoreData ? total : ""}</Cell>
              <Cell width={scoreColWidth} minHeight={rowHeight} textStyle={styles.smallText}>{hasScoreData ? grade : ""}</Cell>
              <Cell width={scoreColWidth} minHeight={rowHeight} textStyle={[styles.smallText, { color: COLORS.red }]}>{hasScoreData && total < 50 ? "0" : ""}</Cell>
              <Cell width={scoreColWidth} minHeight={rowHeight} textStyle={styles.tinyText}>{hasScoreData ? total.toFixed(2) : ""}</Cell>
              <Cell
                width={scoreColWidth}
                minHeight={rowHeight}
                bold
                textStyle={[styles.smallText, { color: total >= 50 ? "#16A34A" : COLORS.red }]}
              >
                {hasScoreData ? (total >= 50 ? "ผ" : "มผ") : ""}
              </Cell>
            </View>
          );
        })}
      </View>
    </Page>
  );
}

type AttributeColumn = {
  key: string;
  header: string;
  max: string;
  compute?: (attrs: Record<string, unknown>) => string | number;
  color?: string;
};

const ATTR_1_4_GROUPS = [
  { label: "1. รักชาติ ศาสน์ กษัตริย์", span: 6 },
  { label: "2. ซื่อสัตย์สุจริต", span: 4 },
  { label: "3. มีวินัย", span: 3 },
  { label: "4. ใฝ่เรียนรู้", span: 4 },
];

const ATTR_1_4_COLUMNS: AttributeColumn[] = [
  { key: "attr1_1", header: "1.1 เป็นพลเมืองดีของชาติ", max: "3" },
  { key: "attr1_2", header: "1.2 ธำรงไว้ซึ่งความเข้มแข็งของชาติ", max: "3" },
  { key: "attr1_3", header: "1.3 ศรัทธาและปฏิบัติตามหลักศาสนา", max: "3" },
  { key: "attr1_4", header: "1.4 เคารพเทิดทูนสถาบันพระมหากษัตริย์", max: "3" },
  { key: "avg1", header: "ผลการประเมิน", max: "3", compute: (attrs) => getAvg(["attr1_1", "attr1_2", "attr1_3", "attr1_4"], attrs), color: COLORS.orange },
  { key: "avg1s", header: "รายคุณลักษณะ", max: "ส", compute: (attrs) => getAvg(["attr1_1", "attr1_2", "attr1_3", "attr1_4"], attrs), color: COLORS.orange },
  { key: "attr2_1", header: "2.1 ประพฤติตรงตามความเป็นจริงต่อตนเอง", max: "3" },
  { key: "attr2_2", header: "2.2 ประพฤติตรงตามความเป็นจริงต่อผู้อื่น", max: "3" },
  { key: "avg2", header: "ผลการประเมิน", max: "3", compute: (attrs) => getAvg(["attr2_1", "attr2_2"], attrs), color: COLORS.orange },
  { key: "avg2s", header: "รายคุณลักษณะ", max: "ส", compute: (attrs) => getAvg(["attr2_1", "attr2_2"], attrs), color: COLORS.orange },
  { key: "attr3_1", header: "3.1 ปฏิบัติตามข้อตกลง กฎเกณฑ์ ระเบียบ", max: "3" },
  { key: "avg3", header: "ผลการประเมิน", max: "3", compute: (attrs) => getAvg(["attr3_1"], attrs), color: COLORS.orange },
  { key: "avg3s", header: "รายคุณลักษณะ", max: "ส", compute: (attrs) => getAvg(["attr3_1"], attrs), color: COLORS.orange },
  { key: "attr4_1", header: "4.1 ตั้งใจเรียนและร่วมกิจกรรมการเรียนรู้", max: "3" },
  { key: "attr4_2", header: "4.2 แสวงหาความรู้จากแหล่งเรียนรู้ต่าง ๆ", max: "3" },
  { key: "avg4", header: "ผลการประเมิน", max: "3", compute: (attrs) => getAvg(["attr4_1", "attr4_2"], attrs), color: COLORS.orange },
  { key: "avg4s", header: "รายคุณลักษณะ", max: "ส", compute: (attrs) => getAvg(["attr4_1", "attr4_2"], attrs), color: COLORS.orange },
];

const ATTR_5_8_GROUPS = [
  { label: "5. อยู่อย่างพอเพียง", span: 4 },
  { label: "6. มุ่งมั่นในการทำงาน", span: 4 },
  { label: "7. รักความเป็นไทย", span: 5 },
  { label: "8. มีจิตสาธารณะ", span: 4 },
  { label: "สรุประดับคุณภาพ", span: 2 },
];

const ATTR_5_8_COLUMNS: AttributeColumn[] = [
  { key: "attr5_1", header: "5.1 ดำเนินชีวิตอย่างพอประมาณ มีเหตุผล", max: "3" },
  { key: "attr5_2", header: "5.2 มีภูมิคุ้มกันและปรับตัวได้", max: "3" },
  { key: "avg5", header: "ผลการประเมิน", max: "3", compute: (attrs) => getAvg(["attr5_1", "attr5_2"], attrs), color: COLORS.orange },
  { key: "avg5s", header: "รายคุณลักษณะ", max: "ส", compute: (attrs) => getAvg(["attr5_1", "attr5_2"], attrs), color: COLORS.orange },
  { key: "attr6_1", header: "6.1 ตั้งใจและรับผิดชอบในการทำงาน", max: "3" },
  { key: "attr6_2", header: "6.2 ทำงานด้วยความเพียรพยายาม", max: "3" },
  { key: "avg6", header: "ผลการประเมิน", max: "3", compute: (attrs) => getAvg(["attr6_1", "attr6_2"], attrs), color: COLORS.orange },
  { key: "avg6s", header: "รายคุณลักษณะ", max: "ส", compute: (attrs) => getAvg(["attr6_1", "attr6_2"], attrs), color: COLORS.orange },
  { key: "attr7_1", header: "7.1 ภาคภูมิใจในวัฒนธรรมไทย", max: "3" },
  { key: "attr7_2", header: "7.2 ใช้ภาษาไทยได้ถูกต้องเหมาะสม", max: "3" },
  { key: "attr7_3", header: "7.3 อนุรักษ์และสืบทอดภูมิปัญญาไทย", max: "3" },
  { key: "avg7", header: "ผลการประเมิน", max: "3", compute: (attrs) => getAvg(["attr7_1", "attr7_2", "attr7_3"], attrs), color: COLORS.orange },
  { key: "avg7s", header: "รายคุณลักษณะ", max: "ส", compute: (attrs) => getAvg(["attr7_1", "attr7_2", "attr7_3"], attrs), color: COLORS.orange },
  { key: "attr8_1", header: "8.1 ช่วยเหลือผู้อื่นด้วยความเต็มใจ", max: "3" },
  { key: "attr8_2", header: "8.2 เข้าร่วมกิจกรรมที่เป็นประโยชน์", max: "3" },
  { key: "avg8", header: "ผลการประเมิน", max: "3", compute: (attrs) => getAvg(["attr8_1", "attr8_2"], attrs), color: COLORS.orange },
  { key: "avg8s", header: "รายคุณลักษณะ", max: "ส", compute: (attrs) => getAvg(["attr8_1", "attr8_2"], attrs), color: COLORS.orange },
  { key: "totalAvg", header: "รวมทุกคุณลักษณะภาคเรียนที่ 2", max: "3,2,1,0", compute: (attrs) => getAttributeTotalAvg(attrs), color: COLORS.orange },
  { key: "quality", header: "ผลการตัดสินคุณลักษณะรายปี", max: "", compute: (attrs) => qualityText(getAttributeTotalAvg(attrs)), color: COLORS.green },
];

function getAttributeTotalAvg(attrs: Record<string, unknown>) {
  const averages = [
    getAvg(["attr1_1", "attr1_2", "attr1_3", "attr1_4"], attrs),
    getAvg(["attr2_1", "attr2_2"], attrs),
    getAvg(["attr3_1"], attrs),
    getAvg(["attr4_1", "attr4_2"], attrs),
    getAvg(["attr5_1", "attr5_2"], attrs),
    getAvg(["attr6_1", "attr6_2"], attrs),
    getAvg(["attr7_1", "attr7_2", "attr7_3"], attrs),
    getAvg(["attr8_1", "attr8_2"], attrs),
  ];
  return Math.round(averages.reduce((sum, value) => sum + value, 0) / averages.length);
}

function AttributesPage({
  data,
  title,
  groups,
  columns,
}: {
  data: AppData;
  title: string;
  groups: Array<{ label: string; span: number }>;
  columns: AttributeColumn[];
}) {
  const leftWidth = 302;
  const colWidth = (LANDSCAPE_CONTENT_WIDTH - leftWidth) / columns.length;
  const rowHeight = bodyRowHeight(data.students.length, 13);

  return (
    <Page size="A4" orientation="landscape" style={styles.landscapePage}>
      <Text style={styles.pageTitle}>
        ผลการประเมินคุณลักษณะอันพึงประสงค์ ชั้น {data.generalInfo.gradeLevel} ภาคเรียนที่ {data.generalInfo.semester} ปีการศึกษา {data.generalInfo.academicYear}
      </Text>
      <Text style={styles.pageSubtitle}>{title}</Text>
      <View style={styles.table}>
        <View style={styles.row}>
          <HeaderCell width={32} minHeight={20}>เลขที่</HeaderCell>
          <HeaderCell width={62} minHeight={20}>เลขประจำตัว</HeaderCell>
          <HeaderCell width={82} minHeight={20}>เลขประชาชน</HeaderCell>
          <HeaderCell width={126} minHeight={20}>ชื่อ - สกุล</HeaderCell>
          <HeaderCell width={colWidth * columns.length} minHeight={20}>แบบบันทึกผลการประเมินคุณลักษณะอันพึงประสงค์</HeaderCell>
        </View>
        <View style={styles.row}>
          <HeaderCell width={leftWidth} minHeight={18} />
          {groups.map((group) => (
            <HeaderCell key={group.label} width={colWidth * group.span} minHeight={18} textStyle={styles.smallText}>{group.label}</HeaderCell>
          ))}
        </View>
        <View style={styles.row}>
          <HeaderCell width={leftWidth} minHeight={46} />
          {columns.map((column) => (
            <HeaderCell key={column.key} width={colWidth} minHeight={46} textStyle={styles.tinyText}>{column.header}</HeaderCell>
          ))}
        </View>
        <View style={styles.row}>
          <HeaderCell width={leftWidth} minHeight={16} />
          {columns.map((column) => (
            <HeaderCell key={column.key} width={colWidth} minHeight={16} textStyle={styles.tinyText}>{column.max}</HeaderCell>
          ))}
        </View>
        {data.students.map((student, index) => {
          const attrs = data.attributes[student.id] || {};
          return (
            <View key={student.id} style={styles.row}>
              <Cell width={32} minHeight={rowHeight} textStyle={styles.smallText}>{index + 1}</Cell>
              <Cell width={62} minHeight={rowHeight} textStyle={styles.smallText}>{student.studentId}</Cell>
              <Cell width={82} minHeight={rowHeight} textStyle={styles.smallText}>{student.citizenId}</Cell>
              <Cell width={126} minHeight={rowHeight} center={false} textStyle={styles.smallText}>{student.name}</Cell>
              {columns.map((column) => {
                const value = column.compute ? column.compute(attrs) : text(attrs[column.key]);
                return (
                  <Cell
                    key={column.key}
                    width={colWidth}
                    minHeight={rowHeight}
                    backgroundColor={column.color ?? COLORS.white}
                    textStyle={column.key === "quality" ? styles.tinyText : styles.smallText}
                    bold={column.key === "quality"}
                  >
                    {text(value)}
                  </Cell>
                );
              })}
            </View>
          );
        })}
      </View>
    </Page>
  );
}

const ANALYTICAL_HEADERS = [
  "1. อ่านออกเสียงให้ถูกต้องตามหลักการอ่าน",
  "2. อ่านแล้วจับใจความได้",
  "3. สรุป/แสดงความคิดเห็นในเรื่องที่เรียนได้",
  "4. แยกข้อเท็จจริงและข้อคิดเห็นในเรื่องที่เรียนได้",
  "5. เขียนสื่อความได้ตรงประเด็น",
  "6. เขียนแสดงความคิดเห็นได้ถูกต้อง",
  "7. เขียนสะกดคำได้ถูกต้องตามหลักภาษาไทย",
];

function AnalyticalPage({ data }: { data: AppData }) {
  const leftWidth = 302;
  const colWidth = (LANDSCAPE_CONTENT_WIDTH - leftWidth - 88) / 8;
  const rowHeight = bodyRowHeight(data.students.length, 14);

  return (
    <Page size="A4" orientation="landscape" style={styles.landscapePage}>
      <Text style={styles.pageTitle}>
        ผลการประเมินการอ่าน คิดวิเคราะห์ และเขียน ชั้น {data.generalInfo.gradeLevel} ภาคเรียนที่ {data.generalInfo.semester} ปีการศึกษา {data.generalInfo.academicYear}
      </Text>
      <View style={styles.table}>
        <View style={styles.row}>
          <HeaderCell width={32} minHeight={22}>เลขที่</HeaderCell>
          <HeaderCell width={62} minHeight={22}>เลขประจำตัว</HeaderCell>
          <HeaderCell width={82} minHeight={22}>เลขประชาชน</HeaderCell>
          <HeaderCell width={126} minHeight={22}>ชื่อ - สกุล</HeaderCell>
          <HeaderCell width={colWidth * 7 + 88} minHeight={22}>ประเมินตัวชี้วัดชั้น ม.1-3</HeaderCell>
        </View>
        <View style={styles.row}>
          <HeaderCell width={leftWidth} minHeight={62} />
          {ANALYTICAL_HEADERS.map((header, index) => (
            <HeaderCell key={header} width={colWidth} minHeight={62} textStyle={styles.tinyText}>
              {`${index + 1}\n${header.replace(/^\d+\.\s*/, "")}`}
            </HeaderCell>
          ))}
          <HeaderCell width={38} minHeight={62} textStyle={styles.tinyText}>สรุปผลการประเมิน</HeaderCell>
          <HeaderCell width={50} minHeight={62} textStyle={styles.tinyText}>สรุปผลการประเมินปลายปี</HeaderCell>
        </View>
        <View style={styles.row}>
          <HeaderCell width={leftWidth} minHeight={16} />
          {Array.from({ length: 7 }).map((_, index) => (
            <HeaderCell key={index} width={colWidth} minHeight={16}>3</HeaderCell>
          ))}
          <HeaderCell width={38} minHeight={16}>3</HeaderCell>
          <HeaderCell width={50} minHeight={16} textStyle={styles.tinyText}>ดีเยี่ยม ดี ผ่าน ไม่ผ่าน</HeaderCell>
        </View>
        {data.students.map((student, index) => {
          const attrs = data.analytical[student.id] || {};
          const avg = getAvg(["attr1", "attr2", "attr3", "attr4", "attr5", "attr6", "attr7"], attrs);
          return (
            <View key={student.id} style={styles.row}>
              <Cell width={32} minHeight={rowHeight} textStyle={styles.smallText}>{index + 1}</Cell>
              <Cell width={62} minHeight={rowHeight} textStyle={styles.smallText}>{student.studentId}</Cell>
              <Cell width={82} minHeight={rowHeight} textStyle={styles.smallText}>{student.citizenId}</Cell>
              <Cell width={126} minHeight={rowHeight} center={false} textStyle={styles.smallText}>{student.name}</Cell>
              {Array.from({ length: 7 }).map((_, attrIndex) => (
                <Cell key={attrIndex} width={colWidth} minHeight={rowHeight} textStyle={styles.smallText}>
                  {text(attrs[`attr${attrIndex + 1}`])}
                </Cell>
              ))}
              <Cell width={38} minHeight={rowHeight} backgroundColor={COLORS.orange} textStyle={styles.smallText}>{avg || ""}</Cell>
              <Cell width={50} minHeight={rowHeight} bold backgroundColor={avg > 0 ? COLORS.green : COLORS.white} textStyle={styles.tinyText}>
                {avg > 0 ? qualityText(avg) : ""}
              </Cell>
            </View>
          );
        })}
      </View>
    </Page>
  );
}

function IndicatorsPage({ data }: { data: AppData }) {
  const fallbackIndicators: Indicator[] = [];
  if (data.indicators.length === 0 && data.scoreConfig) {
    const codes = new Set<string>();
    data.scoreConfig.units.forEach((unit) => {
      unit.indicators.forEach((indicator) => {
        if (indicator.code.trim()) codes.add(indicator.code.trim());
      });
    });
    codes.forEach((code) => fallbackIndicators.push({ id: code, description: "" }));
  }
  const rows = data.indicators.length ? data.indicators : fallbackIndicators;

  return (
    <Page size="A4" orientation="landscape" style={styles.landscapePage}>
      <Text style={styles.pageTitle}>ตัวชี้วัด/ผลการเรียนรู้ ตามสาระและมาตรฐานการเรียนรู้</Text>
      <View style={[styles.table, { width: 700, alignSelf: "center" }]}>
        <View style={styles.row}>
          <HeaderCell width={700} minHeight={20}>ตัวชี้วัด/ผลการเรียนรู้ ตามสาระและมาตรฐานการเรียนรู้</HeaderCell>
        </View>
        <View style={styles.row}>
          <HeaderCell width={92} minHeight={20}>กลุ่มสาระการเรียนรู้</HeaderCell>
          <Cell width={155} minHeight={20} center={false}>{data.generalInfo.learningArea}</Cell>
          <HeaderCell width={70} minHeight={20}>รายวิชา</HeaderCell>
          <Cell width={185} minHeight={20} center={false}>{data.generalInfo.subjectName}</Cell>
          <HeaderCell width={70} minHeight={20}>รหัสวิชา</HeaderCell>
          <Cell width={128} minHeight={20} center={false}>{data.generalInfo.subjectCode}</Cell>
        </View>
        {rows.map((indicator, index) => (
          <View key={`${indicator.id}-${index}`} style={styles.row}>
            <Cell width={95} minHeight={28} center={false} textStyle={styles.smallText}>{indicator.id}</Cell>
            <Cell width={535} minHeight={28} center={false} textStyle={styles.smallText}>{indicator.description}</Cell>
            <Cell width={70} minHeight={28}>{index + 1}</Cell>
          </View>
        ))}
        <View style={styles.row}>
          <Cell width={700} minHeight={24} center={false} bold>
            ตัวชี้วัดรวม.........{rows.length}.........ตัวชี้วัด
          </Cell>
        </View>
      </View>
    </Page>
  );
}

function InstructionTable({
  rows,
}: {
  rows: Array<Array<string | number>>;
}) {
  const tableWidth = 430;
  const cellWidth = tableWidth / rows[0].length;
  return (
    <View style={[styles.table, { width: tableWidth, marginTop: 6, marginBottom: 6 }]}>
      {rows.map((row, rowIndex) => (
        <View key={rowIndex} style={styles.row}>
          {row.map((value, cellIndex) => (
            <Cell key={`${rowIndex}-${cellIndex}`} width={cellWidth} minHeight={18} textStyle={styles.smallText}>
              {value}
            </Cell>
          ))}
        </View>
      ))}
    </View>
  );
}

function InstructionsPageOne() {
  return (
    <Page size="A4" style={styles.portraitPage}>
      <Text style={styles.instructionHeading}>การบันทึกเวลาเรียน</Text>
      {[
        "1. เลขประจำตัวนักเรียน ให้กรอกเลขประจำตัวนักเรียนเรียงจากน้อยไปหามาก โดยเริ่มจากนักเรียนชายทั้งหมด แล้วต่อด้วยนักเรียนหญิง ให้ยึดตามข้อมูล 10 มิถุนายนของทุกปี",
        "2. กรอกเลขประจำตัวประชาชน 13 หลัก ให้ถูกต้อง",
        "3. ชื่อ - ชื่อสกุล ให้กรอกชื่อและนามสกุลให้ชัดเจน",
        "4. ชั่วโมง สัปดาห์หนึ่งกำหนดไว้ 6 ช่อง คือ 6 วัน",
        "5. การบันทึกเวลาเรียน ให้เขียนจำนวนชั่วโมงที่ 1, 2, 3 ... ถ้าสอนมากกว่า 1 ชั่วโมงในเวลาเดียวกันให้เขียน 1-2, 3-4 หรือ 1-3",
        "6. ผู้ที่มาเรียนให้ใส่เครื่องหมาย / ลงในช่อง ส่วนผู้ไม่มาเรียนให้บันทึกตามหลักฐานการลา ป่วย ลากิจ หรือเหตุอื่น",
        "7. รวมจำนวนชั่วโมงเรียนเมื่อสิ้นภาค แล้วกรอกเวลาเรียนเต็มและเวลาเรียน 80 เปอร์เซ็นต์ นักเรียนที่มีเวลาเรียนไม่ถึง 80 เปอร์เซ็นต์ให้สรุปผลเป็น มส",
      ].map((paragraph) => (
        <Text key={paragraph} style={styles.paragraph}>{paragraph}</Text>
      ))}

      <Text style={[styles.instructionHeading, { marginTop: 10 }]}>การบันทึกการประเมินผลการเรียน</Text>
      {[
        "1. ให้เขียนตัวชี้วัดจากข้อ 1 ถึงข้อสุดท้าย",
        "2. เขียนอัตราส่วนคะแนนระหว่างเรียนและปลายปี/ภาค",
        "3. ให้เขียนเลขข้อของตัวชี้วัด และน้ำหนักคะแนนของแต่ละข้อลงใต้ช่องตัวชี้วัด/คะแนน เพื่อให้ทราบว่าการประเมินแต่ละครั้งจะประเมินข้อใด",
      ].map((paragraph) => (
        <Text key={paragraph} style={styles.paragraph}>{paragraph}</Text>
      ))}
      <InstructionTable
        rows={[
          ["คะแนนวัดผลระหว่างเรียน", "", "", "", "", "", "", "", "", "", "รวมคะแนน"],
          ["ตัวชี้วัด/คะแนน", "", "", "", "", "", "", "", "", "", "ระหว่างเรียน"],
          [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 80],
          [10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 80],
        ]}
      />
      <Text style={styles.paragraph}>
        4. วิธีการกรอกคะแนนตามที่นักเรียนได้จริง เมื่อประเมินแล้วผู้เรียนไม่ผ่านในแต่ละข้อ ต้องสอนซ่อมเสริมและสอบแก้ตัว คะแนนเดิมที่ได้ใหม่ต้องไม่เกินครึ่งหนึ่งของคะแนนทั้งหมด
      </Text>
      <InstructionTable
        rows={[
          ["คะแนนวัดผลระหว่างเรียน", "", "", "", "", "", "", "", "", "", "รวมคะแนน"],
          ["ตัวชี้วัด/คะแนน", "", "", "", "", "", "", "", "", "", "ระหว่างเรียน"],
          [1, 3, 4, 5, 6, "", "", "", "", "", 80],
          [4, 6, 5, 5, 10, "", "", "", "", "", 80],
          [2, "2/3", 3, 4, 6, "", "", "", "", "", 18],
          [3, 4, 4, "2/3", "4/5", "", "", "", "", "", 19],
        ]}
      />
    </Page>
  );
}

function InstructionsPageTwo() {
  const gradeRows = [
    ["0", "ผลการเรียนต่ำกว่าเกณฑ์", "0 - 49"],
    ["1", "ผลการเรียนขั้นต่ำ", "50 - 54"],
    ["1.5", "ผลการเรียนพอใช้", "55 - 59"],
    ["2", "ผลการเรียนน่าพอใจ", "60 - 64"],
    ["2.5", "ผลการเรียนค่อนข้างดี", "65 - 69"],
    ["3", "ผลการเรียนดี", "70 - 74"],
    ["3.5", "ผลการเรียนดีมาก", "75 - 79"],
    ["4", "ผลการเรียนดีเยี่ยม", "80 - 100"],
  ];

  return (
    <Page size="A4" style={styles.portraitPage}>
      <Text style={styles.instructionHeading}>การบันทึกการวัดและประเมินผล</Text>
      {[
        "1.1 สำหรับคะแนนวัดผลการเรียนรู้นักเรียนคนใดเมื่อทดสอบแล้วไม่ผ่านเกณฑ์ ให้มีการสอนซ่อมเสริมในจุดที่ไม่ผ่านเกณฑ์แล้วให้สอบแก้ตัว",
        "1.2 ให้รวมคะแนนระหว่างภาคเรียนเข้าด้วยกันแล้วเขียนลงในช่องรวมคะแนนระหว่างเรียน",
        "1.3 เขียนคะแนนสอบปลายภาคเรียนลงในช่องรวมคะแนนสอบปลายภาค",
        "1.4 รวมคะแนนระหว่างเรียนและรวมคะแนนสอบปลายภาคแล้วนำมาเทียบกับเกณฑ์ที่กำหนดไว้ เพื่อให้ระดับผลการเรียน",
        "1.5 นักเรียนที่มีเวลาเรียนไม่ครบ 80% ไม่มีสิทธิ์เข้าสอบปลายภาค ให้ได้ มส",
        "1.6 นักเรียนที่มีเวลาเรียนครบ 80% แต่ไม่ได้เข้าสอบปลายภาค หรือผู้ที่ส่งงานไม่ครบ ให้ได้ผลการเรียนเป็น ร",
        "2. การกรอกคะแนนผลการเรียนใช้หมึกสีน้ำเงินหรือสีดำ ยกเว้น 0, ร, มส, มผ ให้ใช้หมึกสีแดง",
        "3. หากมีการแก้ไขให้ใช้หมึกสีแดง ขีดฆ่าคำผิด และเขียนคำที่ถูกต้องพร้อมลงชื่อกำกับด้วยหมึกสีแดง",
      ].map((paragraph) => (
        <Text key={paragraph} style={styles.paragraph}>{paragraph}</Text>
      ))}

      <View style={{ marginTop: 8, marginLeft: 34 }}>
        {[
          ["ร", "หมายถึง", "รอการตัดสิน หรือยังตัดสินไม่ได้เนื่องจากไม่ส่งงาน หรือไม่ผ่านการทดสอบตัวชี้วัด/ผลการเรียนรู้"],
          ["มส", "หมายถึง", "เข้าเรียนไม่ครบร้อยละ 80"],
          ["ผ", "หมายถึง", "ผ่านเกณฑ์การประเมิน"],
          ["มผ", "หมายถึง", "ไม่ผ่านเกณฑ์การประเมิน"],
        ].map(([code, meaning, detail]) => (
          <View key={code} style={[styles.row, { marginBottom: 2 }]}>
            <Text style={[styles.paragraph, { width: 42 }]}>{code}</Text>
            <Text style={[styles.paragraph, { width: 72 }]}>{meaning}</Text>
            <Text style={[styles.paragraph, { width: 360 }]}>{detail}</Text>
          </View>
        ))}
      </View>

      <Text style={[styles.instructionHeading, { marginTop: 12 }]}>ระดับผลการเรียน</Text>
      <View style={[styles.table, { width: 430 }]}>
        <View style={styles.row}>
          <HeaderCell width={90}>ระดับผลการเรียน</HeaderCell>
          <HeaderCell width={210}>ความหมาย</HeaderCell>
          <HeaderCell width={130}>ช่วงคะแนนเป็นร้อยละ</HeaderCell>
        </View>
        {gradeRows.map(([level, meaning, range]) => (
          <View key={level} style={styles.row}>
            <Cell width={90}>{level}</Cell>
            <Cell width={210}>{meaning}</Cell>
            <Cell width={130}>{range}</Cell>
          </View>
        ))}
      </View>
    </Page>
  );
}

function Pap5PdfDocument({
  data,
  approvalStatus,
}: {
  data: AppData;
  approvalStatus?: GradebookApprovalStatus | null;
}) {
  const { dates } = buildAttendanceDates(data.generalInfo);
  const months = groupDatesByMonth(dates);

  return (
    <Document
      title={`แบบ ปพ.5 ${data.generalInfo.subjectName} ${data.generalInfo.gradeLevel}`}
      author="KSP Gradebook"
    >
      <CoverPage data={data} approvalStatus={approvalStatus} />
      {months.map((month) => (
        <AttendanceMonthPage key={month.label} data={data} month={month} />
      ))}
      <ScoresPage data={data} />
      <AttributesPage data={data} title="คุณลักษณะอันพึงประสงค์ 1-4" groups={ATTR_1_4_GROUPS} columns={ATTR_1_4_COLUMNS} />
      <AttributesPage data={data} title="คุณลักษณะอันพึงประสงค์ 5-8" groups={ATTR_5_8_GROUPS} columns={ATTR_5_8_COLUMNS} />
      <AnalyticalPage data={data} />
      <IndicatorsPage data={data} />
      <InstructionsPageOne />
      <InstructionsPageTwo />
    </Document>
  );
}

export async function createPap5PdfBlob(
  data: AppData,
  options: { approvalStatus?: GradebookApprovalStatus | null } = {},
) {
  registerPdfFonts();
  const preparedData: AppData = {
    ...data,
    generalInfo: applyPdfOfficialDisplayDefaults(data.generalInfo),
  };
  const blob = await pdf(
    <Pap5PdfDocument data={preparedData} approvalStatus={options.approvalStatus} />,
  ).toBlob();
  return blob;
}

export async function exportToPdf(
  data: AppData,
  options: { approvalStatus?: GradebookApprovalStatus | null } = {},
) {
  const preparedData: AppData = {
    ...data,
    generalInfo: applyPdfOfficialDisplayDefaults(data.generalInfo),
  };
  const blob = await createPap5PdfBlob(preparedData, options);
  const subjectName = preparedData.generalInfo.subjectName || "รายวิชา";
  const gradeLevel = preparedData.generalInfo.gradeLevel || "ระดับชั้น";
  const fileName = sanitizeFileName(`แบบปพ.5 ${subjectName} ${gradeLevel}.pdf`);
  const fileSaver = await import("file-saver");
  const save =
    fileSaver.saveAs ??
    (fileSaver.default as unknown as { saveAs?: typeof fileSaver.saveAs })?.saveAs;
  if (!save) throw new Error("ไม่สามารถโหลดระบบดาวน์โหลดไฟล์ PDF ได้");
  save(blob, fileName);
}
