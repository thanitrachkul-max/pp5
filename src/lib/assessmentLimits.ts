import type { AppData } from '../types';

export function parseAssessmentScore(text: string): number | '' | null {
  if (text === '') return '';
  const score = Number(text);
  return Number.isInteger(score) && score >= 0 && score <= 3 ? score : null;
}

function constrainRows(rows: Record<string, Record<string, unknown>>, fieldPattern: RegExp) {
  let changed = 0;
  const nextRows = { ...rows };
  for (const [studentId, row] of Object.entries(rows)) {
    let nextRow: Record<string, unknown> | null = null;
    for (const [field, value] of Object.entries(row ?? {})) {
      if (!fieldPattern.test(field) || value === '' || value == null) continue;
      const numeric = Number(value);
      const bounded = Number.isFinite(numeric) ? Math.min(3, Math.max(0, Math.trunc(numeric))) : 0;
      if (bounded !== value) {
        nextRow ??= { ...row };
        nextRow[field] = bounded;
        changed++;
      }
    }
    if (nextRow) nextRows[studentId] = nextRow;
  }
  return { rows: changed ? nextRows : rows, changed };
}

/** Bring legacy secondary assessment entries back to the 0–3 scale. */
export function constrainAssessmentData(data: AppData) {
  if (data.primaryYear) return { data, changed: 0 };
  const attributes = constrainRows(data.attributes, /^attr[1-8]_[1-9]$/);
  const analytical = constrainRows(data.analytical, /^attr[1-7]$/);
  const changed = attributes.changed + analytical.changed;
  return {
    data: changed ? { ...data, attributes: attributes.rows, analytical: analytical.rows } as AppData : data,
    changed,
  };
}
