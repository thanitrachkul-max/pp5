import type { AppData, PrimaryTermData, ScoreConfig } from '../types';
import { ATTRIBUTE_LABELS } from '../data/primaryAssessment.js';

export const isPrimaryGrade = (grade: string = '') => /^(ป\.?\s*[1-6]|ประถม)/.test(grade.trim());
export const emptyPrimaryTerm = (): PrimaryTermData => ({ scores: {}, attributes: {}, analytical: {} });
export const hasScoreValue = (v: unknown) => v !== '' && v != null && Number.isFinite(Number(v));
export function primaryTerm(data: AppData, term: number): PrimaryTermData {
  return data.primaryYear?.terms[String(term) as '1' | '2'] ??
    (!data.primaryYear && Number(data.generalInfo.semester) === term
      ? { scores: data.scores, scoreConfig: data.scoreConfig, attributes: data.attributes, analytical: data.analytical }
      : emptyPrimaryTerm());
}
// Existing books retain their original raw scores; only their display weight changes.
export function primaryScoreScale(config?: ScoreConfig) {
  return config?.semesterFullScore === 50 ? 1 : 35 / (config?.units.reduce((n, u) => n + u.indicators.reduce((s, i) => s + i.fullScore, 0), 0) || 70);
}
export const primaryExamScale = (config?: ScoreConfig) => config?.semesterFullScore === 50 ? 1 : 0.5;
export function primaryTermTotal(term: PrimaryTermData, studentId: string): number | null {
  const row = term.scores[studentId] ?? {};
  const keys = term.scoreConfig?.units.flatMap((u, ui) => u.indicators.map((_, ii) => `u${ui}_i${ii}`)) ??
    Object.keys(row).filter(k => /^u\d+_i\d+$/.test(k));
  keys.push('midterm', 'final');
  if (!keys.some(k => hasScoreValue(row[k]))) return null;
  return Math.round(keys.reduce((sum, k) => sum + (Number(row[k]) || 0) * (k === 'midterm' || k === 'final' ? primaryExamScale(term.scoreConfig) : primaryScoreScale(term.scoreConfig)), 0) * 100) / 100;
}
export function primaryAnnualTotal(data: AppData, studentId: string): number | null {
  const totals = [1, 2].map(t => primaryTermTotal(primaryTerm(data, t), studentId));
  return totals.every(v => v === null) ? null : Math.round(totals.reduce<number>((sum, v) => sum + (v ?? 0), 0) * 100) / 100;
}
export function primaryAnnualComplete(data: AppData, studentId: string) {
  return [1, 2].every(t => {
    const term = primaryTerm(data, t), row = term.scores[studentId] ?? {};
    return Boolean(term.scoreConfig?.units.length) &&
      [...term.scoreConfig!.units.flatMap((u, ui) => u.indicators.map((_, ii) => `u${ui}_i${ii}`)), 'midterm', 'final'].every(k => hasScoreValue(row[k]));
  });
}
export function scoreGrade(total: number) {
  return total >= 80 ? '4' : total >= 75 ? '3.5' : total >= 70 ? '3' : total >= 65 ? '2.5' : total >= 60 ? '2' : total >= 55 ? '1.5' : total >= 50 ? '1' : '0';
}
export function updatePrimaryTerm(data: AppData, term: number, change: Partial<PrimaryTermData>): AppData {
  if (!data.primaryYear?.editableTerms.includes(term)) return data;
  const value = { ...primaryTerm(data, term), ...change };
  return {
    ...data,
    ...(Number(data.generalInfo.semester) === term ? value : {}),
    primaryYear: { ...data.primaryYear, terms: { ...data.primaryYear.terms, [term]: value } },
  };
}
export function qualityAverage(row: Record<string, unknown>, keys: string[]): number | null {
  if (!keys.every(k => hasScoreValue(row[k]))) return null;
  return Math.round(keys.reduce((s, k) => s + Number(row[k]), 0) / keys.length);
}
export const qualityLabel = (n: number) => ['ไม่ผ่าน', 'ผ่าน', 'ดี', 'ดีเยี่ยม'][Math.max(0, Math.min(3, n))];
export function primaryCombinedConfig(data: AppData): ScoreConfig | undefined {
  if (!data.primaryYear) return data.scoreConfig;
  const configs = [1, 2].map(t => primaryTerm(data, t).scoreConfig).filter((c): c is ScoreConfig => !!c);
  if (!configs.length) return undefined;
  return { ...configs[0], units: configs.flatMap(c => c.units),
    selectedIndicators: [...new Set(configs.flatMap(c => c.selectedIndicators))],
    expectedLearningOutcomes: [1, 2].map(t => {
      const text = primaryTerm(data, t).scoreConfig?.expectedLearningOutcomes;
      return text ? `ภาคเรียนที่ ${t}\n${text}` : '';
    }).filter(Boolean).join('\n\n'),
  };
}
export function primaryAnnualQuality(data: AppData, id: string, section: 'attributes' | 'analytical'): number | null {
  const termValues = [1, 2].map(t => {
    const row = primaryTerm(data, t)[section][id] ?? {};
    if (section === 'analytical') return qualityAverage(row, Array.from({ length: 7 }, (_, i) => `attr${i + 1}`));
    const groups = Array.from({ length: 8 }, (_, i) => qualityAverage(row,
      ATTRIBUTE_LABELS.filter(label => label.startsWith(`${i + 1}.`)).map(label => `attr${label.split(' ')[0].replace('.', '_')}`)));
    return groups.some(v => v === null) ? null : Math.round(groups.reduce<number>((s, v) => s + (v ?? 0), 0) / 8);
  });
  return termValues.some(v => v === null) ? null : Math.round(((termValues[0] ?? 0) + (termValues[1] ?? 0)) / 2);
}
