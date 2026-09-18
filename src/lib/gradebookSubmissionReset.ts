/** Reset submission metadata only; scores and other teacher-entered data stay intact. */
export function gradebookSubmissionResetPayload(now: string) {
  return {
    status: 'in_progress' as const,
    approval_status: null,
    approval_reason: null,
    approval_reason_seen_at: null,
    approval_reviewed_by: null,
    approval_reviewed_at: null,
    approval_resubmitted_at: null,
    updated_at: now,
  };
}
