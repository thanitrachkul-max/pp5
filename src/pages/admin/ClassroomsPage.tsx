import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { SearchableTeacherSelect } from '../../components/SearchableTeacherSelect';
import { FilterBar, FilterClearButton, FilterSelect } from '../../components/FilterBar';
import { createPortal } from 'react-dom';
import { AlertCircle, CheckCircle2, Edit3, FileSpreadsheet, Loader2, Plus, RefreshCw, School, Trash2, Users, X } from 'lucide-react';
import { STUDENT_HOMEROOMS } from '../../data/studentHomerooms';
import { getErrorMessage, isSchemaCacheErrorFor } from '../../lib/dbErrors';
import { filterHomeroomEligibleTeachers, collectHomeroomDuplicateFixes, buildUniqueHomeroomDisplayValues, type HomeroomField } from '../../lib/homeroomTeachers';
import { supabase } from '../../lib/supabase';
import type { AcademicYear, AppUser, ClassLevel, Classroom, Profile } from '../../types';

interface ClassroomsPageProps {
  currentUser: AppUser;
  initialYearId?: string;
}

interface TeacherSlot {
  classroomId: string;
  classroomName: string;
  field: HomeroomField;
}

interface HomeroomUpdate {
  classroomId: string;
  field: HomeroomField;
  teacherId: string | null;
}

interface ClassroomFormState {
  classLevelCode: string;
  roomNumber: string;
}

interface PendingClassroomCreate {
  classLevelCode: string;
  roomNumber: number;
  name: string;
}

interface PendingClassroomDelete {
  id: string;
  classLevelCode: string;
  roomNumber: number;
  name: string;
}

type HomeroomDialogState =
  | {
      kind: 'duplicate';
      classroomId: string;
      field: HomeroomField;
      newTeacherId: string;
      existingSlot: TeacherSlot;
    }
  | {
      kind: 'replace';
      classroomId: string;
      field: HomeroomField;
      oldTeacherId: string;
      newTeacherId: string;
      newTeacherSlot: TeacherSlot | null;
    };

const HOMEROOM_FIELDS: HomeroomField[] = [
  'homeroom_teacher_id',
  'homeroom_teacher_2_id',
  'homeroom_teacher_3_id',
];

const DEFAULT_CLASS_LEVEL_OPTIONS = ['ม.1', 'ม.2', 'ม.3', 'ม.4', 'ม.5', 'ม.6'];

const HOMEROOM_FIELD_LABEL: Record<HomeroomField, string> = {
  homeroom_teacher_id: 'ครูประจำชั้น 1',
  homeroom_teacher_2_id: 'ครูประจำชั้น 2',
  homeroom_teacher_3_id: 'ครูประจำชั้น 3',
};

const HOMEROOM_3_MIGRATION_HINT =
  'ฐานข้อมูลยังไม่มีคอลัมน์ครูประจำชั้น 3 กรุณารัน migration `supabase/migrations/0013_classroom_homeroom_teacher_3.sql` ใน Supabase SQL Editor แล้วลองใหม่';

function teacherLabel(teacher: Profile): string {
  return [teacher.title, teacher.full_name].filter(Boolean).join(' ');
}

function createEmptyClassroomForm(classLevelCode = ''): ClassroomFormState {
  return {
    classLevelCode,
    roomNumber: '',
  };
}

function buildClassroomName(classLevelCode: string, roomNumber: number): string {
  return `${classLevelCode}/${roomNumber}`;
}

function normalizeTeacherName(value: string): string {
  return value
    .replace(/\s+/g, '')
    .replace(/^(นาย|นางสาว|นาง|ว่าที่ร้อยตรีหญิง|ว่าที่ร้อยตรี|ดร\.|ครู)/, '')
    .toLowerCase();
}

function classroomExcelNames(classroom: Classroom): string[] {
  return STUDENT_HOMEROOMS[classroom.name] ?? STUDENT_HOMEROOMS[`${classroom.class_level_code}/${classroom.room_number}`] ?? [];
}

function slotDescription(slot: TeacherSlot): string {
  return `${slot.classroomName} (${HOMEROOM_FIELD_LABEL[slot.field]})`;
}

function findTeacherSlot(
  items: Classroom[],
  teacherId: string,
  resolveValue: (classroom: Classroom, field: HomeroomField) => string,
  exclude?: { classroomId: string; field: HomeroomField },
): TeacherSlot | null {
  for (const classroom of items) {
    for (const field of HOMEROOM_FIELDS) {
      if (exclude && exclude.classroomId === classroom.id && exclude.field === field) continue;
      if (resolveValue(classroom, field) === teacherId) {
        return {
          classroomId: classroom.id,
          classroomName: classroom.name,
          field,
        };
      }
    }
  }
  return null;
}

function homeroomMigrationMessage(error: unknown, field: HomeroomField): string {
  if (field === 'homeroom_teacher_3_id' && isSchemaCacheErrorFor(error, 'homeroom_teacher_3_id')) {
    return HOMEROOM_3_MIGRATION_HINT;
  }
  return getErrorMessage(error, 'บันทึกครูประจำชั้นไม่สำเร็จ');
}

export const ClassroomsPage: React.FC<ClassroomsPageProps> = ({ currentUser, initialYearId }) => {
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [selectedYearId, setSelectedYearId] = useState(initialYearId ?? '');
  const [classLevels, setClassLevels] = useState<ClassLevel[]>([]);
  const [teachers, setTeachers] = useState<Profile[]>([]);
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [classroomFilter, setClassroomFilter] = useState('');
  const [homeroomTeacherFilter, setHomeroomTeacherFilter] = useState('');
  const [dialog, setDialog] = useState<HomeroomDialogState | null>(null);
  const [showClassroomManager, setShowClassroomManager] = useState(false);
  const [classroomForm, setClassroomForm] = useState<ClassroomFormState>(() => createEmptyClassroomForm());
  const [pendingClassroomCreate, setPendingClassroomCreate] = useState<PendingClassroomCreate | null>(null);
  const [pendingClassroomDelete, setPendingClassroomDelete] = useState<PendingClassroomDelete | null>(null);
  const [homeroomTeacher3Supported, setHomeroomTeacher3Supported] = useState(true);

  const loadMeta = useCallback(async () => {
    if (!currentUser.schoolId) return;
    const [{ data: yearData }, { data: teacherData }, { data: classLevelData }] = await Promise.all([
      supabase
        .from('academic_years')
        .select('*')
        .eq('school_id', currentUser.schoolId)
        .order('year_be', { ascending: false }),
      supabase
        .from('profiles')
        .select('id, school_id, username, title, full_name, role, is_active, created_at')
        .eq('school_id', currentUser.schoolId)
        .eq('is_active', true)
        .order('full_name'),
      supabase
        .from('class_levels')
        .select('*')
        .order('sequence'),
    ]);

    setYears(yearData ?? []);
    setTeachers(teacherData ?? []);
    setClassLevels(classLevelData ?? []);

    const preferred = initialYearId ? yearData?.find((y) => y.id === initialYearId) : undefined;
    const active = preferred ?? yearData?.find((y) => y.is_active) ?? yearData?.[0];
    if (active) {
      setSelectedYearId((prev) => {
        if (preferred && prev !== preferred.id) return preferred.id;
        return prev || active.id;
      });
    }
  }, [currentUser.schoolId, initialYearId]);

  const loadClassrooms = useCallback(async () => {
    if (!selectedYearId) return;
    setLoading(true);
    setError('');
    try {
      const { data, error: queryError } = await supabase
        .from('classrooms')
        .select('*, homeroom_teacher_3_id')
        .eq('academic_year_id', selectedYearId)
        .order('class_level_code')
        .order('room_number');

      if (queryError) {
        if (isSchemaCacheErrorFor(queryError, 'homeroom_teacher_3_id')) {
          setHomeroomTeacher3Supported(false);
          const fallback = await supabase
            .from('classrooms')
            .select('*')
            .eq('academic_year_id', selectedYearId)
            .order('class_level_code')
            .order('room_number');
          if (fallback.error) throw fallback.error;
          setClassrooms(fallback.data ?? []);
          return;
        }
        throw queryError;
      }

      setHomeroomTeacher3Supported(true);
      let rows = data ?? [];
      const duplicateFixes = collectHomeroomDuplicateFixes(rows);

      if (duplicateFixes.length > 0) {
        for (const fix of duplicateFixes) {
          const { error: fixError } = await supabase
            .from('classrooms')
            .update({ [fix.field]: null })
            .eq('id', fix.classroomId);

          if (fixError) throw fixError;
        }

        rows = rows.map((classroom) => {
          const next = { ...classroom };
          duplicateFixes
            .filter((fix) => fix.classroomId === classroom.id)
            .forEach((fix) => {
              next[fix.field] = null;
            });
          return next;
        });

        setMessage(`ล้างครูประจำชั้นที่ซ้ำ ${duplicateFixes.length.toLocaleString('th-TH')} ช่องอัตโนมัติ`);
      }

      setClassrooms(rows);
    } catch (err) {
      setError(getErrorMessage(err, 'โหลดข้อมูลชั้นเรียนไม่สำเร็จ'));
    } finally {
      setLoading(false);
    }
  }, [selectedYearId]);

  useEffect(() => {
    void loadMeta();
  }, [loadMeta]);

  useEffect(() => {
    void loadClassrooms();
  }, [loadClassrooms]);

  const selectedYear = years.find((y) => y.id === selectedYearId);

  const classLevelOptions = useMemo(() => {
    const options = classLevels.length > 0
      ? classLevels.map((level) => level.code)
      : DEFAULT_CLASS_LEVEL_OPTIONS;
    const usedCodes = classrooms.map((classroom) => classroom.class_level_code);
    return Array.from(new Set([...options, ...usedCodes]));
  }, [classLevels, classrooms]);

  const homeroomTeachers = useMemo(
    () => filterHomeroomEligibleTeachers(teachers),
    [teachers],
  );

  const teacherIdByExcelName = useMemo(() => {
    const map = new Map<string, string>();
    homeroomTeachers.forEach((teacher) => {
      map.set(normalizeTeacherName(teacher.full_name), teacher.id);
      map.set(normalizeTeacherName(teacherLabel(teacher)), teacher.id);
    });
    return map;
  }, [homeroomTeachers]);

  const teacherNameById = useMemo(() => {
    const map = new Map<string, string>();
    teachers.forEach((teacher) => {
      map.set(teacher.id, teacherLabel(teacher));
    });
    return map;
  }, [teachers]);

  const excelTeacherIdFor = useCallback((classroom: Classroom, field: HomeroomField): string => {
    const indexByField: Record<HomeroomField, number> = {
      homeroom_teacher_id: 0,
      homeroom_teacher_2_id: 1,
      homeroom_teacher_3_id: 2,
    };
    const name = classroomExcelNames(classroom)[indexByField[field]];
    return name ? teacherIdByExcelName.get(normalizeTeacherName(name)) ?? '' : '';
  }, [teacherIdByExcelName]);

  const rawTeacherValueFor = useCallback(
    (classroom: Classroom, field: HomeroomField): string => {
      const value = classroom[field] as string | null | undefined;
      return value === undefined ? excelTeacherIdFor(classroom, field) : value ?? '';
    },
    [excelTeacherIdFor],
  );

  const homeroomDisplayValues = useMemo(() => {
    const map = new Map<string, Record<HomeroomField, string>>();
    const schoolWideSeen = new Set<string>();

    for (const classroom of classrooms) {
      map.set(
        classroom.id,
        buildUniqueHomeroomDisplayValues(
          classroom,
          (field) => {
            const raw = rawTeacherValueFor(classroom, field);
            if (!raw) return '';
            return homeroomTeachers.some((teacher) => teacher.id === raw) ? raw : '';
          },
          schoolWideSeen,
        ),
      );
    }

    return map;
  }, [classrooms, homeroomTeachers, rawTeacherValueFor]);

  const teacherValueFor = useCallback(
    (classroom: Classroom, field: HomeroomField): string =>
      homeroomDisplayValues.get(classroom.id)?.[field] ?? '',
    [homeroomDisplayValues],
  );

  const applyHomeroomUpdates = useCallback(async (updates: HomeroomUpdate[]) => {
    if (updates.length === 0) return;
    const previous = classrooms;
    setSaving(true);
    setError('');
    setMessage('');
    setClassrooms((items) => {
      let next = items;
      for (const update of updates) {
        next = next.map((item) =>
          item.id === update.classroomId ? { ...item, [update.field]: update.teacherId } : item,
        );
      }
      return next;
    });

    try {
      for (const update of updates) {
        if (!homeroomTeacher3Supported && update.field === 'homeroom_teacher_3_id') {
          throw new Error(HOMEROOM_3_MIGRATION_HINT);
        }

        const { error: updateError } = await supabase
          .from('classrooms')
          .update({ [update.field]: update.teacherId })
          .eq('id', update.classroomId);

        if (updateError) {
          if (
            update.field === 'homeroom_teacher_3_id' &&
            isSchemaCacheErrorFor(updateError, 'homeroom_teacher_3_id')
          ) {
            setHomeroomTeacher3Supported(false);
            throw new Error(HOMEROOM_3_MIGRATION_HINT);
          }
          throw new Error(homeroomMigrationMessage(updateError, update.field));
        }
      }
      setMessage('บันทึกครูประจำชั้นแล้ว');
    } catch (err) {
      setClassrooms(previous);
      setError(getErrorMessage(err, 'บันทึกครูประจำชั้นไม่สำเร็จ'));
    } finally {
      setSaving(false);
    }
  }, [classrooms, homeroomTeacher3Supported]);

  const handleHomeroomSelect = (classroomId: string, field: HomeroomField, value: string) => {
    const classroom = classrooms.find((item) => item.id === classroomId);
    if (!classroom || saving) return;

    const oldTeacherId = teacherValueFor(classroom, field);
    const newTeacherId = value;

    if (newTeacherId === oldTeacherId) return;

    setMessage('');

    if (!newTeacherId) {
      void applyHomeroomUpdates([{ classroomId, field, teacherId: null }]);
      return;
    }

    const duplicateInSameClassroom = HOMEROOM_FIELDS.some(
      (otherField) => otherField !== field && teacherValueFor(classroom, otherField) === newTeacherId,
    );
    if (duplicateInSameClassroom) {
      setError('ครูคนนี้ถูกมอบหมายในห้องนี้แล้ว — 1 คนต่อ 1 ช่องเท่านั้น');
      return;
    }

    const newTeacherSlot = findTeacherSlot(classrooms, newTeacherId, rawTeacherValueFor, {
      classroomId,
      field,
    });

    if (oldTeacherId && oldTeacherId !== newTeacherId) {
      setDialog({
        kind: 'replace',
        classroomId,
        field,
        oldTeacherId,
        newTeacherId,
        newTeacherSlot,
      });
      return;
    }

    if (newTeacherSlot) {
      setDialog({
        kind: 'duplicate',
        classroomId,
        field,
        newTeacherId,
        existingSlot: newTeacherSlot,
      });
      return;
    }

    void applyHomeroomUpdates([{ classroomId, field, teacherId: newTeacherId }]);
  };

  const confirmDuplicateAssignment = () => {
    if (!dialog || dialog.kind !== 'duplicate') return;
    const { classroomId, field, newTeacherId, existingSlot } = dialog;
    setDialog(null);
    void applyHomeroomUpdates([
      { classroomId: existingSlot.classroomId, field: existingSlot.field, teacherId: null },
      { classroomId, field, teacherId: newTeacherId },
    ]);
  };

  const confirmReplaceLeaveEmpty = () => {
    if (!dialog || dialog.kind !== 'replace') return;
    const { classroomId, field, newTeacherId, newTeacherSlot } = dialog;
    setDialog(null);
    const updates: HomeroomUpdate[] = [];
    if (newTeacherSlot) {
      updates.push({
        classroomId: newTeacherSlot.classroomId,
        field: newTeacherSlot.field,
        teacherId: null,
      });
    }
    updates.push({ classroomId, field, teacherId: newTeacherId });
    void applyHomeroomUpdates(updates);
  };

  const confirmReplaceSwap = () => {
    if (!dialog || dialog.kind !== 'replace' || !dialog.newTeacherSlot) return;
    const { classroomId, field, oldTeacherId, newTeacherId, newTeacherSlot } = dialog;
    setDialog(null);
    void applyHomeroomUpdates([
      { classroomId: newTeacherSlot.classroomId, field: newTeacherSlot.field, teacherId: oldTeacherId },
      { classroomId, field, teacherId: newTeacherId },
    ]);
  };

  const syncHomeroomsFromExcel = async () => {
    if (classrooms.length === 0) return;
    setSyncing(true);
    setError('');
    setMessage('');

    const teacherMap = new Map<string, string>();
    homeroomTeachers.forEach((teacher) => {
      teacherMap.set(normalizeTeacherName(teacher.full_name), teacher.id);
      teacherMap.set(normalizeTeacherName(teacherLabel(teacher)), teacher.id);
    });

    const unmatched = new Set<string>();
    const usedTeacherIds = new Set<string>();

    try {
      for (const classroom of classrooms) {
        const names = classroomExcelNames(classroom);
        const ids = names.slice(0, 3).map((name) => {
          const id = teacherMap.get(normalizeTeacherName(name)) ?? null;
          if (name && !id) unmatched.add(name);
          return id;
        });

        const uniqueIds: Array<string | null> = [];
        const classroomSeen = new Set<string>();
        ids.forEach((id) => {
          if (!id || usedTeacherIds.has(id) || classroomSeen.has(id)) {
            uniqueIds.push(null);
            return;
          }
          usedTeacherIds.add(id);
          classroomSeen.add(id);
          uniqueIds.push(id);
        });

        const payload = {
          homeroom_teacher_id: uniqueIds[0] ?? null,
          homeroom_teacher_2_id: uniqueIds[1] ?? null,
          homeroom_teacher_3_id: uniqueIds[2] ?? null,
        };

        let { error: updateError } = await supabase
          .from('classrooms')
          .update(payload)
          .eq('id', classroom.id);

        if (updateError && isSchemaCacheErrorFor(updateError, 'homeroom_teacher_3_id')) {
          const retry = await supabase
            .from('classrooms')
            .update({
              homeroom_teacher_id: payload.homeroom_teacher_id,
              homeroom_teacher_2_id: payload.homeroom_teacher_2_id,
            })
            .eq('id', classroom.id);
          updateError = retry.error;
        }

        if (updateError) {
          throw new Error(homeroomMigrationMessage(updateError, 'homeroom_teacher_3_id'));
        }
      }

      await loadClassrooms();
      setMessage(
        unmatched.size > 0
          ? `ดึงข้อมูลจาก Excel แล้ว แต่มี ${unmatched.size} ชื่อที่ยังไม่ตรงกับบัญชีครู`
          : 'ดึงข้อมูลครูประจำชั้นจาก Excel แล้ว',
      );
    } catch (err) {
      setError(getErrorMessage(err, 'ดึงข้อมูลจาก Excel ไม่สำเร็จ'));
    } finally {
      setSyncing(false);
    }
  };

  const filteredClassrooms = useMemo(() => {
    return classrooms.filter((classroom) => {
      const matchesClassroom = !classroomFilter || classroom.id === classroomFilter;
      const matchesTeacher =
        !homeroomTeacherFilter ||
        teacherValueFor(classroom, 'homeroom_teacher_id') === homeroomTeacherFilter ||
        teacherValueFor(classroom, 'homeroom_teacher_2_id') === homeroomTeacherFilter ||
        teacherValueFor(classroom, 'homeroom_teacher_3_id') === homeroomTeacherFilter;
      return matchesClassroom && matchesTeacher;
    });
  }, [classrooms, classroomFilter, homeroomTeacherFilter, teacherValueFor]);

  const hasActiveClassroomFilters = Boolean(classroomFilter || homeroomTeacherFilter);

  const clearClassroomFilters = () => {
    setClassroomFilter('');
    setHomeroomTeacherFilter('');
  };

  const openClassroomManager = () => {
    setError('');
    setMessage('');
    setClassroomForm(createEmptyClassroomForm(classroomForm.classLevelCode || classLevelOptions[0] || ''));
    setShowClassroomManager(true);
  };

  const handleCreateClassroom = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!currentUser.schoolId || !selectedYearId) {
      setError('ไม่พบข้อมูลโรงเรียนหรือปีการศึกษาที่ใช้งาน');
      return;
    }

    const classLevelCode = classroomForm.classLevelCode.trim();
    const roomNumber = Number(classroomForm.roomNumber);
    if (!classLevelCode || !Number.isInteger(roomNumber) || roomNumber <= 0) {
      setError('กรุณาเลือกชั้นเรียนและระบุเลขห้องให้ถูกต้อง');
      return;
    }

    const name = buildClassroomName(classLevelCode, roomNumber);
    const alreadyExists = classrooms.some(
      (classroom) => classroom.class_level_code === classLevelCode && classroom.room_number === roomNumber,
    );
    if (alreadyExists) {
      setError(`มีห้อง ${name} ในปีการศึกษานี้แล้ว`);
      return;
    }

    setPendingClassroomCreate({
      classLevelCode,
      roomNumber,
      name,
    });
  };

  const confirmCreateClassroom = async () => {
    if (!pendingClassroomCreate || !currentUser.schoolId || !selectedYearId) {
      setPendingClassroomCreate(null);
      setError('ไม่พบข้อมูลโรงเรียนหรือปีการศึกษาที่ใช้งาน');
      return;
    }

    const { classLevelCode, roomNumber, name } = pendingClassroomCreate;
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const { error: insertError } = await supabase
        .from('classrooms')
        .insert({
          school_id: currentUser.schoolId,
          academic_year_id: selectedYearId,
          class_level_code: classLevelCode,
          room_number: roomNumber,
          name,
        });

      if (insertError) {
        if (insertError.code === '23505') {
          throw new Error(`มีห้อง ${name} ในปีการศึกษานี้แล้ว`);
        }
        throw insertError;
      }

      setClassroomForm(createEmptyClassroomForm(classLevelCode));
      await loadClassrooms();
      setPendingClassroomCreate(null);
      setShowClassroomManager(false);
      setMessage(`เพิ่มห้อง ${name} แล้ว`);
    } catch (err) {
      setPendingClassroomCreate(null);
      setError(getErrorMessage(err, 'เพิ่มห้องเรียนไม่สำเร็จ'));
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteClassroom = (classroom: Classroom) => {
    setError('');
    setMessage('');
    setPendingClassroomDelete({
      id: classroom.id,
      classLevelCode: classroom.class_level_code,
      roomNumber: classroom.room_number,
      name: classroom.name,
    });
  };

  const confirmDeleteClassroom = async () => {
    if (!pendingClassroomDelete) return;

    const classroom = pendingClassroomDelete;
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const { error: deleteError } = await supabase
        .from('classrooms')
        .delete()
        .eq('id', classroom.id);

      if (deleteError) throw deleteError;

      await loadClassrooms();
      setPendingClassroomDelete(null);
      setMessage(`ลบห้อง ${classroom.name} แล้ว`);
    } catch (err) {
      setPendingClassroomDelete(null);
      setError(getErrorMessage(err, 'ลบห้องเรียนไม่สำเร็จ'));
    } finally {
      setSaving(false);
    }
  };

  const assignedTeacherIds = useMemo(() => {
    const ids = new Set<string>();
    classrooms.forEach((classroom) => {
      HOMEROOM_FIELDS.forEach((field) => {
        const teacherId = teacherValueFor(classroom, field);
        if (teacherId) ids.add(teacherId);
      });
    });
    return ids;
  }, [classrooms, teacherValueFor]);

  const unassignedTeachers = useMemo(
    () => homeroomTeachers.filter((teacher) => !assignedTeacherIds.has(teacher.id)),
    [homeroomTeachers, assignedTeacherIds],
  );

  const renderTeacherSelect = (classroom: Classroom, field: HomeroomField) => {
    const disabled = saving || (field === 'homeroom_teacher_3_id' && !homeroomTeacher3Supported);
    const currentValue = teacherValueFor(classroom, field);

    return (
      <SearchableTeacherSelect
        value={currentValue}
        teachers={homeroomTeachers}
        onChange={(teacherId) => handleHomeroomSelect(classroom.id, field, teacherId)}
        disabled={disabled}
        getLabel={teacherLabel}
        placeholder={disabled ? 'ยังไม่รองรับ' : '— เว้นว่าง —'}
      />
    );
  };

  const dialogTeacherName = dialog
    ? teacherNameById.get(dialog.newTeacherId) ?? 'ครูที่เลือก'
    : '';

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h4 className="text-[22px] font-extrabold tracking-tight text-slate-900">ข้อมูลชั้นเรียน และ ครูประจำชั้น</h4>
          <p className="mt-1 text-sm text-slate-500">
            จัดการครูประจำชั้นสำหรับแต่ละห้องเรียนในปีการศึกษา {selectedYear?.year_be ?? '—'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={openClassroomManager}
            className="btn btn-secondary"
          >
            <Edit3 className="mr-2 h-4 w-4" />
            แก้ไขข้อมูลห้องเรียน
          </button>
          <button
            type="button"
            onClick={() => void loadClassrooms()}
            className="btn btn-secondary"
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            รีเฟรช
          </button>
          <button
            type="button"
            onClick={() => void syncHomeroomsFromExcel()}
            disabled={syncing || classrooms.length === 0}
            className="btn btn-primary"
          >
            {syncing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileSpreadsheet className="mr-2 h-4 w-4" />}
            ดึงรายชื่อครูจาก Excel
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-100 bg-red-50 p-3 text-sm text-red-600">
          <div className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p>{error}</p>
              {error.includes('homeroom_teacher_3_id') || error.includes('ครูประจำชั้น 3') ? (
                <p className="mt-2 text-xs text-red-500">
                  รัน SQL นี้ใน Supabase SQL Editor:{' '}
                  <code className="rounded bg-red-100 px-1 py-0.5">
                    alter table public.classrooms add column if not exists homeroom_teacher_3_id uuid references public.profiles(id) on delete set null;
                  </code>
                </p>
              ) : null}
            </div>
          </div>
        </div>
      )}
      {message && (
        <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-3 text-sm text-emerald-700">{message}</div>
      )}

      <FilterBar fill>
        <FilterSelect
          label="ชั้นเรียน (ห้อง)"
          value={classroomFilter}
          onChange={setClassroomFilter}
        >
          <option value="">ทุกชั้นเรียน (ห้อง)</option>
          {classrooms.map((classroom) => (
            <option key={classroom.id} value={classroom.id}>{classroom.name}</option>
          ))}
        </FilterSelect>
        <FilterSelect
          label="ครูประจำชั้น"
          value={homeroomTeacherFilter}
          onChange={setHomeroomTeacherFilter}
        >
          <option value="">ทุกครูประจำชั้น</option>
          {homeroomTeachers.map((teacher) => (
            <option key={teacher.id} value={teacher.id}>{teacherLabel(teacher)}</option>
          ))}
        </FilterSelect>
        <FilterClearButton onClick={clearClassroomFilters} disabled={!hasActiveClassroomFilters} />
      </FilterBar>

      <div className="ui-card overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-slate-500">
            <Loader2 className="mr-2 h-6 w-6 animate-spin" /> กำลังโหลด...
          </div>
        ) : filteredClassrooms.length === 0 ? (
          <div className="py-16 text-center text-slate-400">
            <School className="mx-auto mb-2 h-10 w-10 opacity-40" />
            ยังไม่มีข้อมูลชั้นเรียนในปีนี้
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px] text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-5 py-3 text-center align-middle font-semibold">ชั้นเรียน</th>
                  <th className="px-5 py-3 text-center align-middle font-semibold">ครูประจำชั้น 1</th>
                  <th className="px-5 py-3 text-center align-middle font-semibold">ครูประจำชั้น 2</th>
                  <th className="px-5 py-3 text-center align-middle font-semibold">ครูประจำชั้น 3</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredClassrooms.map((classroom) => (
                  <tr key={classroom.id} className="transition-colors hover:bg-slate-50/60">
                    <td className="px-5 py-3 text-center font-bold text-slate-900">{classroom.name}</td>
                    <td className="px-5 py-3">{renderTeacherSelect(classroom, 'homeroom_teacher_id')}</td>
                    <td className="px-5 py-3">{renderTeacherSelect(classroom, 'homeroom_teacher_2_id')}</td>
                    <td className="px-5 py-3">{renderTeacherSelect(classroom, 'homeroom_teacher_3_id')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <section className="ui-card p-4">
        <div className="mb-3 flex items-center gap-2">
          <Users className="h-5 w-5 text-slate-500" />
          <h5 className="text-base font-bold text-slate-900">ครูที่ยังไม่ได้มอบหมายเป็นครูประจำชั้น</h5>
        </div>
        {unassignedTeachers.length === 0 ? (
          <p className="text-sm text-emerald-700">ครูทุกคนได้รับมอบหมายเป็นครูประจำชั้นแล้ว</p>
        ) : (
          <>
            <p className="text-sm font-semibold text-amber-700">
              มีครูที่ยังไม่ได้มอบหมาย {unassignedTeachers.length.toLocaleString('th-TH')} คน
            </p>
            <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {unassignedTeachers.map((teacher) => (
                <li
                  key={teacher.id}
                  className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700"
                >
                  {teacherLabel(teacher)}
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      {showClassroomManager && createPortal(
        <div className="fixed inset-0 z-[200] overflow-y-auto bg-slate-900/50 p-4 backdrop-blur-sm">
          <div className="mx-auto my-8 w-full max-w-3xl rounded-2xl bg-white p-6 shadow-xl">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-bold text-slate-900">แก้ไขข้อมูลห้องเรียน</h3>
                <p className="mt-1 text-sm text-slate-500">
                  เพิ่มหรือลบห้องเรียนของปีการศึกษา {selectedYear?.year_be ?? '-'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowClassroomManager(false)}
                className="text-slate-400 hover:text-slate-600"
                aria-label="ปิด"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {error && (
              <div className="mb-4 flex items-start gap-2 rounded-xl border border-red-100 bg-red-50 p-3 text-sm text-red-600">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <p>{error}</p>
              </div>
            )}

            <form
              onSubmit={(event) => void handleCreateClassroom(event)}
              className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 md:grid-cols-[minmax(0,1fr)_140px_auto] md:items-end"
            >
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-slate-500">ชั้นเรียน</span>
                <select
                  value={classroomForm.classLevelCode}
                  onChange={(event) =>
                    setClassroomForm((prev) => ({ ...prev, classLevelCode: event.target.value }))
                  }
                  className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  disabled={saving}
                >
                  {classLevelOptions.map((classLevelCode) => (
                    <option key={classLevelCode} value={classLevelCode}>
                      {classLevelCode}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-slate-500">เลขห้อง</span>
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={classroomForm.roomNumber}
                  onChange={(event) =>
                    setClassroomForm((prev) => ({ ...prev, roomNumber: event.target.value }))
                  }
                  className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  disabled={saving}
                  placeholder="1"
                />
              </label>
              <button
                type="submit"
                className="btn btn-primary h-11 justify-center"
                disabled={saving || classLevelOptions.length === 0}
              >
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                เพิ่มห้องเรียน
              </button>
            </form>

            <div className="mt-5 overflow-hidden rounded-xl border border-slate-200">
              <div className="max-h-[50vh] overflow-y-auto">
                <table className="w-full min-w-[560px] text-sm">
                  <thead className="sticky top-0 border-b border-slate-200 bg-slate-50 text-slate-600">
                    <tr>
                      <th className="px-4 py-3 text-left font-semibold">ห้องเรียน</th>
                      <th className="px-4 py-3 text-center font-semibold">ชั้นเรียน</th>
                      <th className="px-4 py-3 text-center font-semibold">เลขห้อง</th>
                      <th className="px-4 py-3 text-center font-semibold">จัดการ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {classrooms.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-4 py-8 text-center text-slate-400">
                          ยังไม่มีข้อมูลห้องเรียน
                        </td>
                      </tr>
                    ) : (
                      classrooms.map((classroom) => (
                        <tr key={classroom.id} className="hover:bg-slate-50/70">
                          <td className="px-4 py-3 font-bold text-slate-900">{classroom.name}</td>
                          <td className="px-4 py-3 text-center text-slate-600">{classroom.class_level_code}</td>
                          <td className="px-4 py-3 text-center text-slate-600">{classroom.room_number}</td>
                          <td className="px-4 py-3 text-center">
                            <button
                              type="button"
                              onClick={() => void handleDeleteClassroom(classroom)}
                              className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-red-50 text-red-600 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
                              disabled={saving}
                              aria-label={`ลบห้อง ${classroom.name}`}
                              title={`ลบห้อง ${classroom.name}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>,
        document.body,
      )}

      {pendingClassroomCreate && createPortal(
        <div className="fixed inset-0 z-[240] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-white/70 bg-white p-6 text-center shadow-2xl">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-blue-50 text-blue-600">
              <CheckCircle2 className="h-7 w-7" />
            </div>
            <h3 className="mt-4 text-xl font-extrabold text-slate-900">ยืนยันเพิ่มห้องเรียน</h3>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              ต้องการเพิ่มห้องเรียนนี้เข้าสู่ปีการศึกษา {selectedYear?.year_be ?? '-'} ใช่ไหม
            </p>

            <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-left">
              <div className="flex items-center justify-between gap-4">
                <span className="text-sm font-semibold text-slate-500">ห้องเรียน</span>
                <span className="text-lg font-extrabold text-slate-900">{pendingClassroomCreate.name}</span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-xl bg-white p-3">
                  <p className="text-xs font-semibold text-slate-400">ชั้นเรียน</p>
                  <p className="mt-1 font-bold text-slate-800">{pendingClassroomCreate.classLevelCode}</p>
                </div>
                <div className="rounded-xl bg-white p-3">
                  <p className="text-xs font-semibold text-slate-400">เลขห้อง</p>
                  <p className="mt-1 font-bold text-slate-800">{pendingClassroomCreate.roomNumber}</p>
                </div>
              </div>
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setPendingClassroomCreate(null)}
                className="btn btn-secondary justify-center"
                disabled={saving}
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={() => void confirmCreateClassroom()}
                className="btn btn-primary justify-center"
                disabled={saving}
              >
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                ยืนยันเพิ่ม
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}

      {pendingClassroomDelete && createPortal(
        <div className="fixed inset-0 z-[240] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-white/70 bg-white p-6 text-center shadow-2xl">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-red-50 text-red-600">
              <Trash2 className="h-7 w-7" />
            </div>
            <h3 className="mt-4 text-xl font-extrabold text-slate-900">ยืนยันลบห้องเรียน</h3>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              ต้องการลบห้องเรียนนี้ออกจากปีการศึกษา {selectedYear?.year_be ?? '-'} ใช่ไหม
            </p>

            <div className="mt-5 rounded-2xl border border-red-100 bg-red-50/70 p-4 text-left">
              <div className="flex items-center justify-between gap-4">
                <span className="text-sm font-semibold text-red-500">ห้องเรียนที่จะลบ</span>
                <span className="text-lg font-extrabold text-red-700">{pendingClassroomDelete.name}</span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-xl bg-white p-3">
                  <p className="text-xs font-semibold text-slate-400">ชั้นเรียน</p>
                  <p className="mt-1 font-bold text-slate-800">{pendingClassroomDelete.classLevelCode}</p>
                </div>
                <div className="rounded-xl bg-white p-3">
                  <p className="text-xs font-semibold text-slate-400">เลขห้อง</p>
                  <p className="mt-1 font-bold text-slate-800">{pendingClassroomDelete.roomNumber}</p>
                </div>
              </div>
              <div className="mt-3 flex items-start gap-2 rounded-xl bg-white px-3 py-2 text-xs leading-5 text-red-600">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>ข้อมูลนักเรียนหรือรายการมอบหมายที่ผูกกับห้องนี้อาจถูกลบตามไปด้วย</span>
              </div>
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setPendingClassroomDelete(null)}
                className="btn btn-secondary justify-center"
                disabled={saving}
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={() => void confirmDeleteClassroom()}
                className="inline-flex h-11 items-center justify-center rounded-lg bg-red-600 px-4 text-sm font-bold text-white shadow-sm transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={saving}
              >
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
                ยืนยันลบ
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}

      {dialog && createPortal(
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  {dialog.kind === 'duplicate' ? 'ครูถูกมอบหมายอยู่แล้ว' : 'แทนที่ครูประจำชั้น'}
                </h3>
                {dialog.kind === 'duplicate' ? (
                  <p className="mt-2 text-sm leading-relaxed text-slate-600">
                    <span className="font-semibold text-slate-800">{dialogTeacherName}</span> ถูกมอบหมายที่{' '}
                    <span className="font-semibold text-slate-800">{slotDescription(dialog.existingSlot)}</span> แล้ว
                    <br />
                    หากยืนยันทำรายการ รายชื่อครูที่ตำแหน่งเดิมจะหายไป
                  </p>
                ) : (
                  <>
                    <p className="mt-2 text-sm leading-relaxed text-slate-600">
                      จะนำ <span className="font-semibold text-slate-800">{dialogTeacherName}</span> มาแทนที่{' '}
                      <span className="font-semibold text-slate-800">
                        {teacherNameById.get(dialog.oldTeacherId) ?? 'ครูเดิม'}
                      </span>{' '}
                      ในตำแหน่งนี้
                    </p>
                    {dialog.newTeacherSlot ? (
                      <p className="mt-2 text-sm leading-relaxed text-slate-600">
                        ขณะนี้ <span className="font-semibold text-slate-800">{dialogTeacherName}</span> อยู่ที่{' '}
                        <span className="font-semibold text-slate-800">
                          {slotDescription(dialog.newTeacherSlot)}
                        </span>
                        <br />
                        เลือกว่าจะให้ครูทั้งสอง <span className="font-semibold">สลับตำแหน่งกัน</span> หรือ{' '}
                        <span className="font-semibold">แทนที่แล้วปล่อยตำแหน่งเดิมว่าง</span>
                      </p>
                    ) : (
                      <p className="mt-2 text-sm leading-relaxed text-slate-600">
                        ครูเดิมจะไม่ได้รับมอบหมายในตำแหน่งนี้อีกต่อไป
                      </p>
                    )}
                  </>
                )}
              </div>
              <button
                type="button"
                onClick={() => setDialog(null)}
                className="text-slate-400 hover:text-slate-600"
                aria-label="ปิด"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
              <button type="button" onClick={() => setDialog(null)} className="btn btn-secondary">
                ยกเลิก
              </button>
              {dialog.kind === 'duplicate' ? (
                <button type="button" onClick={confirmDuplicateAssignment} className="btn btn-primary">
                  ยืนยัน (ล้างตำแหน่งเดิม)
                </button>
              ) : dialog.newTeacherSlot ? (
                <>
                  <button type="button" onClick={confirmReplaceSwap} className="btn btn-primary">
                    สลับตำแหน่งกัน
                  </button>
                  <button type="button" onClick={confirmReplaceLeaveEmpty} className="btn btn-secondary">
                    แทนที่ — ตำแหน่งเดิมว่าง
                  </button>
                </>
              ) : (
                <button type="button" onClick={confirmReplaceLeaveEmpty} className="btn btn-primary">
                  ยืนยันแทนที่
                </button>
              )}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
};
