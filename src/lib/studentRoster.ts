import type { Student } from '../types';

/**
 * Merge current classroom enrollments with settings stored in a gradebook.
 * The enrollment list is authoritative; gradebook JSON only carries settings
 * that belong to the particular book, such as target attendance percentage.
 */
export function mergeRosterWithSavedState(
  roster: Student[],
  savedStudents: Student[],
): Student[] {
  const targetByStudentId = new Map(
    savedStudents.map((student) => [student.id, student.targetPercentage]),
  );

  return roster.map((student) => {
    const targetPercentage = targetByStudentId.get(student.id);
    return targetPercentage === undefined
      ? student
      : { ...student, targetPercentage };
  });
}
