import type { Indicator, ScoreConfig } from '../types';

export const normalizeIndicatorCode = (code: string) => code.replace(/\s+/g, ' ').trim();
export function configuredIndicatorCodes(config?: ScoreConfig): string[] {
  return [...new Set(config?.units.flatMap(u => u.indicators.map(i => normalizeIndicatorCode(i.code))).filter(Boolean) ?? [])];
}
export function missingIndicatorCodes(config: ScoreConfig | undefined, rows: Indicator[]): string[] {
  const complete = new Set(rows.filter(r => r.description?.trim()).map(r => normalizeIndicatorCode(r.id)));
  return configuredIndicatorCodes(config).filter(code => !complete.has(code));
}
/** Preserve teacher-written descriptions and unrelated rows while filling newly configured codes. */
export function mergeIndicatorDetails(rows: Indicator[], codes: string[], descriptions: Map<string, string>): Indicator[] {
  const next = rows.map(r => ({ ...r }));
  for (const code of codes) {
    const row = next.find(r => normalizeIndicatorCode(r.id) === code);
    const description = descriptions.get(code) ?? '';
    if (row) { if (!row.description?.trim() && description) row.description = description; }
    else next.push({ id: code, description });
  }
  return next;
}
