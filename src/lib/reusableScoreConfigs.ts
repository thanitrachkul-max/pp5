import type { AppData, ScoreConfig } from "../types";

export interface ReusableScoreConfigSource {
  id: string;
  classroomName: string;
  academicYear: string;
  semester: string;
  updatedAt: string;
  config: ScoreConfig;
}

interface GradebookConfigRow {
  id: string;
  updated_at: string;
  general_info: Partial<AppData["generalInfo"]> | null;
  score_config: ScoreConfig | null;
  teaching_assignments?: {
    subjects?: {
      subject_code?: string | null;
      subject_name?: string | null;
      learning_area?: string | null;
    } | null;
    classrooms?: { name?: string | null } | null;
    semesters?: {
      semester_number?: number | null;
      academic_years?: { year_be?: number | null } | null;
    } | null;
  } | null;
}

interface ReusableScoreConfigFilter {
  currentGradebookId: string;
  generalInfo: AppData["generalInfo"];
  semesterFullScore: 50 | 100;
}

const normalize = (value: unknown) =>
  String(value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("th-TH");

const normalizeSubjectKey = (value: unknown) =>
  normalize(value).replace(/[\s._-]+/g, "");

const firstRelation = <T>(value: T | T[] | null | undefined): T | undefined =>
  Array.isArray(value) ? value[0] : value ?? undefined;

const configHasContent = (config: ScoreConfig | null): config is ScoreConfig =>
  Boolean(
    config &&
      Array.isArray(config.selectedIndicators) &&
      config.selectedIndicators.length > 0 &&
      Array.isArray(config.units) &&
      config.units.length > 0,
  );

const isSameSubject = (
  sourceInfo: Partial<AppData["generalInfo"]>,
  targetInfo: AppData["generalInfo"],
  sourceConfig: ScoreConfig,
) => {
  const sourceLearningAreas = [sourceInfo.learningArea, sourceConfig.learningArea]
    .map(normalize)
    .filter(Boolean);
  if (!sourceLearningAreas.includes(normalize(targetInfo.learningArea))) return false;

  const targetCode = normalizeSubjectKey(targetInfo.subjectCode);
  const sourceCodes = [sourceInfo.subjectCode, sourceConfig.subjectCode]
    .map(normalizeSubjectKey)
    .filter(Boolean);
  if (sourceCodes.length > 0) return Boolean(targetCode && sourceCodes.includes(targetCode));

  const targetName = normalizeSubjectKey(targetInfo.subjectName);
  const sourceNames = [sourceInfo.subjectName, sourceConfig.subjectName]
    .map(normalizeSubjectKey)
    .filter(Boolean);
  return Boolean(targetName && sourceNames.includes(targetName));
};

export function filterReusableScoreConfigs(
  rows: GradebookConfigRow[],
  filter: ReusableScoreConfigFilter,
): ReusableScoreConfigSource[] {
  const targetYear = normalize(filter.generalInfo.academicYear);
  const targetSemester = normalize(filter.generalInfo.semester);

  return rows.flatMap((row) => {
    const info = row.general_info ?? {};
    const config = row.score_config;
    const sourceFullScore = config?.semesterFullScore ?? 100;
    const sourceYear = normalize(info.academicYear);
    const sourceSemester = normalize(info.semester);

    if (
      row.id === filter.currentGradebookId ||
      !configHasContent(config) ||
      sourceFullScore !== filter.semesterFullScore ||
      !isSameSubject(info, filter.generalInfo, config) ||
      (targetYear && sourceYear && sourceYear !== targetYear) ||
      (targetSemester && sourceSemester && sourceSemester !== targetSemester)
    ) {
      return [];
    }

    return [{
      id: row.id,
      classroomName: String(info.gradeLevel ?? "").trim() || "ไม่ระบุห้องเรียน",
      academicYear: String(info.academicYear ?? "").trim(),
      semester: String(info.semester ?? "").trim(),
      updatedAt: row.updated_at,
      config,
    }];
  });
}

export async function fetchReusableScoreConfigs(
  filter: ReusableScoreConfigFilter,
): Promise<ReusableScoreConfigSource[]> {
  const { supabase } = await import("./supabase");
  const selectWithAssignment = `
    id,
    updated_at,
    general_info,
    score_config,
    teaching_assignments:teaching_assignment_id(
      subjects:subject_id(subject_code, subject_name, learning_area),
      classrooms:classroom_id(name),
      semesters:semester_id(semester_number, academic_years:academic_year_id(year_be))
    )
  `;
  let result: any = await supabase
    .from("gradebooks")
    .select(selectWithAssignment)
    .neq("id", filter.currentGradebookId)
    .is("deleted_at", null)
    .order("updated_at", { ascending: false })
    .limit(1000);

  // Older deployments may not have the relationship in PostgREST's schema
  // cache. Fall back to the JSON fields so the picker remains compatible.
  if (result.error) {
    result = await supabase
      .from("gradebooks")
      .select("id, updated_at, general_info, score_config")
      .neq("id", filter.currentGradebookId)
      .is("deleted_at", null)
      .order("updated_at", { ascending: false })
      .limit(1000);
  }

  if (result.error) throw result.error;

  const rows = ((result.data ?? []) as GradebookConfigRow[]).map((row) => {
    const assignment = firstRelation(row.teaching_assignments);
    const subject = firstRelation(assignment?.subjects);
    const semester = firstRelation(assignment?.semesters);
    const academicYear = firstRelation(semester?.academic_years);
    const info = { ...(row.general_info ?? {}) };

    // Prefer canonical subject/room/term values when legacy JSON is empty or stale.
    if (subject?.subject_code) info.subjectCode = subject.subject_code;
    if (subject?.subject_name) info.subjectName = subject.subject_name;
    if (subject?.learning_area) info.learningArea = subject.learning_area;
    if (assignment?.classrooms?.name) info.gradeLevel = assignment.classrooms.name;
    if (semester?.semester_number != null) info.semester = String(semester.semester_number);
    if (academicYear?.year_be != null) info.academicYear = String(academicYear.year_be);

    return { ...row, general_info: info };
  });

  return filterReusableScoreConfigs(rows, filter);
}
