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
) => {
  if (normalize(sourceInfo.learningArea) !== normalize(targetInfo.learningArea)) return false;

  const sourceCode = normalize(sourceInfo.subjectCode);
  const targetCode = normalize(targetInfo.subjectCode);
  if (sourceCode && targetCode) return sourceCode === targetCode;

  return normalize(sourceInfo.subjectName) === normalize(targetInfo.subjectName);
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

    if (
      row.id === filter.currentGradebookId ||
      !configHasContent(config) ||
      sourceFullScore !== filter.semesterFullScore ||
      !isSameSubject(info, filter.generalInfo) ||
      (targetYear && normalize(info.academicYear) !== targetYear) ||
      (targetSemester && normalize(info.semester) !== targetSemester)
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
  const { data, error } = await supabase
    .from("gradebooks")
    .select("id, updated_at, general_info, score_config")
    .neq("id", filter.currentGradebookId)
    .not("score_config", "is", null)
    .is("deleted_at", null)
    .order("updated_at", { ascending: false })
    .limit(100);

  if (error) throw error;
  return filterReusableScoreConfigs((data ?? []) as GradebookConfigRow[], filter);
}
