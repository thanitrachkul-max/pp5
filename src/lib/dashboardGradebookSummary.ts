import type { ScoreConfig, Student } from '../types';
import type { SupabaseClient } from '@supabase/supabase-js';
const round1 = (n: number) => Math.round(n * 10) / 10;
export interface DashboardGradebook {
  id: string;
  status: 'not_started' | 'in_progress' | 'completed';
  stats: Record<string, unknown> | null;
  students: unknown;
  scores: Record<string, unknown> | null;
  score_config: ScoreConfig | null;
}

function hasStudentCount(gradebook: DashboardGradebook): boolean {
  const count = gradebook.stats?.studentCount;
  return count != null && count !== '' && Number.isFinite(Number(count)) && Number(count) >= 0;
}

export function gradebookStudentCount(gradebook: DashboardGradebook | null): number {
  if (!gradebook) return 0;
  return hasStudentCount(gradebook) ? Number(gradebook.stats!.studentCount) : normalizeStudents(gradebook.students).length;
}

export function needsLegacyGradebook(gradebook: DashboardGradebook): boolean {
  // Zero completion still uses the original score-based fallback, even with stats present.
  return !hasStudentCount(gradebook) || (numberFromStats(gradebook.stats, 'completionPercent') <= 0 && gradebook.status !== 'completed');
}

export async function hydrateLegacyGradebooks(client: Pick<SupabaseClient, 'from'>, rows: DashboardGradebook[]) {
  const ids = [...new Set(rows.filter(needsLegacyGradebook).map(row => row.id))];
  const legacy = new Map<string, Partial<DashboardGradebook>>();
  for (let index = 0; index < ids.length; index += 40) {
    const { data, error } = await client.from('gradebooks').select('id, students, scores, score_config').in('id', ids.slice(index, index + 40));
    if (error) throw error;
    for (const row of data ?? []) legacy.set(row.id, row);
  }
  for (const row of rows) {
    const details = legacy.get(row.id);
    if (details) Object.assign(row, details);
  }
}

function numberFromStats(stats: Record<string, unknown> | null, key: string): number {
  const raw = stats?.[key];
  const value = Number(raw);
  return Number.isFinite(value) ? value : 0;
}

function scoreKeys(scoreConfig: ScoreConfig | null): string[] {
  if (!scoreConfig?.units?.length) return [];
  const keys: string[] = [];
  scoreConfig.units.forEach((unit, unitIndex) => {
    unit.indicators.forEach((_indicator, indicatorIndex) => {
      keys.push(`u${unitIndex}_i${indicatorIndex}`);
    });
  });
  keys.push('midterm', 'final');
  return keys;
}

function normalizeStudents(value: unknown): Student[] {
  return Array.isArray(value) ? (value as Student[]) : [];
}

export function gradebookCompletion(gradebook: DashboardGradebook | null): number {
  if (!gradebook) return 0;
  const completion = numberFromStats(gradebook.stats, 'completionPercent');
  if (completion > 0 || gradebook.status === 'completed') {
    return gradebook.status === 'completed' ? Math.max(100, completion) : completion;
  }

  const students = normalizeStudents(gradebook.students);
  const keys = scoreKeys(gradebook.score_config);
  if (students.length === 0 || keys.length === 0) return 0;

  let filled = 0;
  const scores = gradebook.scores ?? {};
  students.forEach((student) => {
    const row = (scores[student.id] ?? {}) as Record<string, unknown>;
    keys.forEach((key) => {
      const value = row[key];
      if (value !== '' && value != null) filled += 1;
    });
  });

  return round1((filled / (students.length * keys.length)) * 100);
}
