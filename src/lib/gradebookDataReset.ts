import type { AppData } from '../types';

/** Build a pristine gradebook row while keeping the existing gradebook identity. */
export function gradebookDataResetPayload(
  now: string,
  generalInfo: AppData['generalInfo'],
  students: AppData['students'],
) {
  return {
    status: 'not_started' as const,
    general_info: generalInfo,
    students,
    attendance: {},
    scores: {},
    score_config: null,
    attributes: {},
    analytical: {},
    indicators: [],
    stats: {},
    approval_status: null,
    approval_reason: null,
    approval_reason_seen_at: null,
    approval_reviewed_by: null,
    approval_reviewed_at: null,
    approval_resubmitted_at: null,
    updated_at: now,
  };
}

export function resetPrimaryTerm(
  terms: Record<string, unknown> | null | undefined,
  semesterNumber: number,
) {
  return {
    ...(terms ?? {}),
    [String(semesterNumber)]: {
      scores: {},
      scoreConfig: null,
      attributes: {},
      analytical: {},
    },
  };
}
