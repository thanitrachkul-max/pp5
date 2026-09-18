import test from 'node:test';
import assert from 'node:assert/strict';
import { gradebookSubmissionResetPayload } from '../src/lib/gradebookSubmissionReset';

test('reset all submitted approval states without removing teacher data', () => {
  for (const approval_status of ['pending', 'approved', 'revision_requested']) {
    const original = {
      status: 'completed', approval_status, approval_reason: 'แก้ไข',
      approval_reason_seen_at: 'old', approval_reviewed_by: 'admin',
      approval_reviewed_at: 'old', approval_resubmitted_at: 'old',
      scores: { student: { final: 20 } }, attendance: { student: ['present'] },
    };
    const result = { ...original, ...gradebookSubmissionResetPayload('now') };
    assert.equal(result.status, 'in_progress');
    for (const key of ['approval_status', 'approval_reason', 'approval_reason_seen_at',
      'approval_reviewed_by', 'approval_reviewed_at', 'approval_resubmitted_at'] as const) {
      assert.equal(result[key], null);
    }
    assert.equal(result.scores, original.scores);
    assert.equal(result.attendance, original.attendance);
  }
});
