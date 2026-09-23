import type { AppData, ScoreConfig } from '../types';

/** Keep the exam allocation within the 100-point semester total. */
export function examScoreLimits(config?: Pick<ScoreConfig, 'storedScore'>) {
  const storedScore = config?.storedScore ?? 70;
  const examPoints = Math.max(0, 100 - storedScore);
  const midterm = Math.min(10, Math.floor(examPoints / 2));
  return { storedScore, midterm, final: examPoints - midterm };
}

export function limitScore(value: number | string | undefined, maximum: number): number | '' {
  if (value === '' || value == null) return '';
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.min(Math.max(0, numeric), Math.max(0, maximum)) : 0;
}

/** Repair saved scores after a maximum changes, including older over-limit exam scores. */
export function constrainScores(scores: AppData['scores'], config?: ScoreConfig) {
  if (!config?.units.length) return { scores, changed: 0 };
  const { midterm, final } = examScoreLimits(config);
  let changed = 0;
  const result = { ...scores };
  for (const [studentId, row] of Object.entries(scores)) {
    const next = { ...row };
    const caps: Array<[string, number]> = [
      ...config.units.flatMap((unit, unitIndex) => unit.indicators.map((indicator, indicatorIndex): [string, number] => [
        `u${unitIndex}_i${indicatorIndex}`, indicator.fullScore,
      ])),
      ['midterm', midterm], ['final', final],
    ];
    for (const [key, maximum] of caps) {
      if (next[key] === undefined || next[key] === '') continue;
      const limited = limitScore(next[key], maximum);
      if (limited !== next[key]) {
        next[key] = limited;
        changed++;
      }
    }
    if (changed) result[studentId] = next;
  }
  return { scores: changed ? result : scores, changed };
}
