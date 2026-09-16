import { supabase } from './supabase';
import { isSchemaCacheErrorFor } from './dbErrors';

export interface GradebookDelegation {
  id: string;
  gradebook_id: string;
  assignment_id: string;
  assignment_group_id: string;
  teacher_id: string;
  teacher_name: string;
  assigned_by: string;
  assigned_by_name: string;
}
export type RecordingMode = 'self' | 'delegated' | 'received';
export function recordingMode(groupId: string, teacherId: string, delegations: GradebookDelegation[]): RecordingMode {
  const matches = delegations.filter(d => d.assignment_group_id === groupId);
  return matches.some(d => d.teacher_id === teacherId) ? 'received' : matches.length ? 'delegated' : 'self';
}
export async function listGradebookDelegations(): Promise<GradebookDelegation[]> {
  const { data, error } = await supabase.rpc('list_gradebook_delegations');
  if (error) throw error;
  return data ?? [];
}
export async function listOptionalGradebookDelegations(): Promise<GradebookDelegation[]> {
  try { return await listGradebookDelegations(); }
  catch (error) {
    // Keep existing dashboards available during the deployment migration window.
    if (isSchemaCacheErrorFor(error, 'list_gradebook_delegations')) return [];
    throw error;
  }
}
