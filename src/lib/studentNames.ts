const STUDENT_NAME_TITLES = [
  "เด็กชาย",
  "เด็กหญิง",
  "ด.ช.",
  "ด.ญ.",
  "นาย",
  "นางสาว",
  "น.ส.",
  "นาง",
];

export const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** แยกคำนำหน้า ชื่อ และนามสกุล เพื่อบันทึกลงทะเบียนนักเรียนกลาง */
export function splitStudentNameForAcademicRecord(fullName: string) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  const title = parts.length > 0 && STUDENT_NAME_TITLES.includes(parts[0]) ? parts.shift() ?? null : null;
  const firstName = parts.shift() ?? "";
  const lastName = parts.join(" ");

  return {
    title,
    firstName: firstName || fullName.trim(),
    lastName,
  };
}
