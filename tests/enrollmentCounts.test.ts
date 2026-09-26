import assert from 'node:assert/strict';
import test from 'node:test';
import { countActiveEnrollments } from '../src/lib/enrollmentCounts';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';

const pairs = [{ classroomId: 'a', academicYearId: 'y' }, { classroomId: 'a', academicYearId: 'y' }, { classroomId: 'a', academicYearId: 'z' }];
test('one RPC counts repeated classrooms across years', async () => {
  let calls = 0;
  const client = { rpc: async (_: string, args: unknown) => {
    calls++;
    assert.deepEqual(args, { p_classroom_ids: ['a'] });
    return { data: [{ classroom_id: 'a', academic_year_id: 'y', student_count: '12' }, { classroom_id: 'a', academic_year_id: 'z', student_count: 8 }] };
  }, from: () => { throw new Error('unexpected fallback'); } };
  const counts = await countActiveEnrollments(client as any, pairs);
  assert.deepEqual([...counts], [['a:y', 12], ['a:z', 8]]);
  assert.equal(calls, 1);
});
test('missing RPC falls back once per distinct classroom/year and propagates errors', async () => {
  let queries = 0;
  const client = { rpc: async () => ({ error: { code: 'PGRST202', message: 'Could not find public.count_active_enrollments in the schema cache' } }), from: () => {
    queries++;
    const filters: Record<string, string> = {};
    const query = { select: () => query, eq: (k: string, v: string) => {
      filters[k] = v;
      return k === 'status' ? Promise.resolve({ count: filters.academic_year_id === 'y' ? 12 : 8 }) : query;
    } };
    return query;
  } };
  assert.deepEqual([...(await countActiveEnrollments(client as any, pairs))], [['a:y', 12], ['a:z', 8]]);
  assert.equal(queries, 2);
  await assert.rejects(countActiveEnrollments({ ...client, rpc: async () => ({ error: new Error('permission denied') }) } as any, pairs), /permission denied/);
  assert.equal((await countActiveEnrollments(client as any, [])).size, 0);
});

test('count RPC preserves RLS and excludes inactive enrollments', async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role authenticated; create table student_enrollments(classroom_id uuid, academic_year_id uuid, status text);
      alter table student_enrollments enable row level security;
      grant select on student_enrollments to authenticated;
      create policy visible on student_enrollments for select to authenticated using (classroom_id = '00000000-0000-0000-0000-000000000001');
      insert into student_enrollments values
      ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000010','active'),
      ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000010','inactive'),
      ('00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000010','active');`);
    await db.exec(readFileSync('supabase/migrations/0054_count_active_enrollments.sql', 'utf8'));
    await db.exec('set role authenticated');
    const { rows } = await db.query(`select * from count_active_enrollments(array['00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002']::uuid[])`);
    assert.equal(rows.length, 1);
    assert.equal(Number((rows[0] as any).student_count), 1);
  } finally { await db.close(); }
});
