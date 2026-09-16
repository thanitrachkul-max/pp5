export interface AssignmentIdentity {
  id: string;
  assignment_group_id?: string | null;
  semester_id: string;
  subject_id: string;
  classroom_id: string;
}

export function assignmentGroupKey(assignment: AssignmentIdentity): string {
  return assignment.assignment_group_id
    ? `group:${assignment.assignment_group_id}`
    : `legacy:${assignment.semester_id}:${assignment.subject_id}:${assignment.classroom_id}`;
}

export function uniqueTeacherIds(primaryTeacherId: string | null | undefined, coTeacherIds: string[]): string[] {
  return Array.from(new Set([primaryTeacherId ?? '', ...coTeacherIds].filter(Boolean)));
}

export function assignmentTeacherCounts(assignments: Array<AssignmentIdentity & { teacher_id: string }>): Map<string, number> {
  const groups = new Map<string, Set<string>>();
  for (const assignment of assignments) {
    const key = assignmentGroupKey(assignment);
    const teachers = groups.get(key) ?? new Set<string>();
    teachers.add(assignment.teacher_id);
    groups.set(key, teachers);
  }
  return new Map(Array.from(groups, ([key, teachers]) => [key, teachers.size]));
}

export function expandSharedAssignmentRows<T extends Record<string, unknown>>(
  base: T,
  primaryTeacherId: string,
  coTeacherIds: string[],
  teacherLabelById: (teacherId: string) => string,
): Array<T & { teacher_id: string; co_teacher_name: string | null }> {
  const teacherIds = uniqueTeacherIds(primaryTeacherId, coTeacherIds);
  return teacherIds.map((teacherId) => ({
    ...base,
    teacher_id: teacherId,
    co_teacher_name:
      teacherIds
        .filter((candidateId) => candidateId !== teacherId)
        .map(teacherLabelById)
        .filter(Boolean)
        .join(', ') || null,
  }));
}

export function sharedRecordForAssignment<T>(
  assignment: AssignmentIdentity,
  recordsByGroupId: ReadonlyMap<string, T>,
  directRecord: T | null | undefined,
): T | null {
  if (assignment.assignment_group_id) {
    const shared = recordsByGroupId.get(assignment.assignment_group_id);
    if (shared) return shared;
  }
  return directRecord ?? null;
}
