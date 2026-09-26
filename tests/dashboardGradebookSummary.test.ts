import assert from 'node:assert/strict';
import test from 'node:test';
import { gradebookCompletion, gradebookStudentCount, hydrateLegacyGradebooks, needsLegacyGradebook, type DashboardGradebook } from '../src/lib/dashboardGradebookSummary';

test('compact summaries preserve completion and counts, including zero-score legacy fallback', async () => {
  const legacy = { id: 'old', status: 'in_progress', stats: { completionPercent: 0 }, students: [{ id: 's' }], scores: { s: { u0_i0: 0, midterm: 10 } }, score_config: { units: [{ indicators: [{}] }] } } as unknown as DashboardGradebook;
  const modern = { ...legacy, id: 'new', stats: { completionPercent: 75, studentCount: 1 } };
  const completed = { ...legacy, id: 'done', status: 'completed', stats: { studentCount: 1 } } as DashboardGradebook;
  const compact = [legacy, modern, completed].map(({ id, status, stats }) => ({ id, status, stats } as DashboardGradebook));
  const requested: string[][] = [];
  const client = { from: () => ({ select: () => ({ in: async (_: string, ids: string[]) => { requested.push(ids); return { data: [legacy] }; } }) }) };
  await hydrateLegacyGradebooks(client as any, compact);
  assert.deepEqual(requested, [['old']]);
  assert.deepEqual(compact.map(gradebookCompletion), [66.7, 75, 100]);
  assert.deepEqual(compact.map(gradebookStudentCount), [1, 1, 1]);
  assert.deepEqual(compact.map(gradebookCompletion), [legacy, modern, completed].map(gradebookCompletion));
  assert.equal(needsLegacyGradebook({ ...modern, stats: { studentCount: 1, completionPercent: 0 } }), true);
  assert.equal(needsLegacyGradebook({ ...modern, stats: { studentCount: 0, completionPercent: 75 } }), false);
});
