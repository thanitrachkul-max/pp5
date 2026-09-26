import type { SupabaseClient } from '@supabase/supabase-js';
import { isSchemaCacheErrorFor } from './dbErrors';

export async function countActiveEnrollments(
  client: Pick<SupabaseClient, 'rpc' | 'from'>,
  pairs: Array<{ classroomId: string; academicYearId: string }>,
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  const keyOf = (pair: typeof pairs[number]) => `${pair.classroomId}:${pair.academicYearId}`;
  const uniquePairs = Array.from(new Map(pairs.map(pair => [keyOf(pair), pair])).values());
  const classroomIds = [...new Set(pairs.map(pair => pair.classroomId))];
  if (!classroomIds.length) return counts;
  const { data, error } = await client.rpc('count_active_enrollments', { p_classroom_ids: classroomIds });
  if (!error) {
    for (const row of data ?? []) counts.set(`${row.classroom_id}:${row.academic_year_id}`, Number(row.student_count) || 0);
    return counts;
  }
  if (!isSchemaCacheErrorFor(error, 'count_active_enrollments')) throw error;
  // Bound concurrency on databases that have not installed the aggregate RPC yet.
  for (let index = 0; index < uniquePairs.length; index += 6) {
    await Promise.all(uniquePairs.slice(index, index + 6).map(async pair => {
      const { count, error: countError } = await client.from('student_enrollments')
        .select('id', { count: 'exact', head: true })
        .eq('classroom_id', pair.classroomId).eq('academic_year_id', pair.academicYearId).eq('status', 'active');
      if (countError) throw countError;
      counts.set(keyOf(pair), count ?? 0);
    }));
  }
  return counts;
}
