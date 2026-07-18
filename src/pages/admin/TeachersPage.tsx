import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, CheckCircle2, Crown, Loader2, Pencil, Search, ShieldCheck, Trash2, UserPlus, Users, X } from 'lucide-react';
import { canManageAdminData, isSuperAdmin, ROLE_LABELS } from '../../lib/auth';
import { createTeacherAccount, deleteTeacherAccount, updateTeacherAccount } from '../../lib/createTeacherAccount';
import { supabase } from '../../lib/supabase';
import type { AppUser, Profile, UserRole } from '../../types';

interface TeachersPageProps {
  currentUser: AppUser;
  readOnly?: boolean;
  mode?: 'all' | 'academic-admins';
}

interface TeacherRow extends Profile {
  email?: string;
}

interface TeacherFormState {
  username: string;
  full_name: string;
  title: string;
  role: UserRole;
  password: string;
}

type ModalSaveState = 'idle' | 'saving' | 'success';

interface RoleGroup {
  key: string;
  title: string;
  description: string;
  icon: React.ElementType;
  roles: UserRole[];
}

const emptyForm = (): TeacherFormState => ({
  username: '',
  full_name: '',
  title: '',
  role: 'teacher',
  password: '',
});

const roleGroups: RoleGroup[] = [
  {
    key: 'developers',
    title: 'ผู้พัฒนาและผู้ดูแลระบบ',
    description: 'บัญชีผู้พัฒนาระบบและผู้ดูแลระบบหลัก',
    icon: ShieldCheck,
    roles: ['super_admin', 'admin'],
  },
  {
    key: 'executives',
    title: 'ผู้บริหาร',
    description: 'ดูภาพรวมและรายงาน โดยไม่แก้ไขข้อมูล',
    icon: Crown,
    roles: ['executive'],
  },
  {
    key: 'teachers',
    title: 'ผู้ใช้งาน (ครู)',
    description: 'บัญชีครูสำหรับกรอก ปพ.5 และใช้งานหน้าครู',
    icon: Users,
    roles: ['teacher'],
  },
];

const executiveNameOrder = [
  'นาย มีเกียรติ นาสมตรึก',
  'นางสาว อัจฉราภรณ์ เศษวิ',
  'นาย วุฒิพงษ์ วิลาจันทร์',
  'นาง นวลลักษณ์ นาสมตรึก',
  'นางสาว ปานฤทัย เนื่องศรี',
];

function displayName(teacher: TeacherRow): string {
  return [teacher.title, teacher.full_name].filter(Boolean).join(' ');
}

function displayGroupKey(teacher: TeacherRow): string {
  if (teacher.role === 'super_admin') return 'developers';
  if (teacher.role === 'admin') return 'developers';
  if (teacher.role === 'teacher') return 'teachers';
  if (teacher.role === 'executive') return 'executives';
  return 'teachers';
}

function roleBadgeClass(role: UserRole): string {
  if (role === 'super_admin') return 'bg-purple-50 text-purple-700 border-purple-100';
  if (role === 'admin') return 'bg-blue-50 text-blue-700 border-blue-100';
  if (role === 'executive') return 'bg-amber-50 text-amber-700 border-amber-100';
  return 'bg-slate-100 text-slate-700 border-slate-200';
}

function displayedRoleLabel(teacher: TeacherRow, groupKey: string): string {
  if (groupKey === 'executives') return 'บริหาร';
  return ROLE_LABELS[teacher.role];
}

function displayedRoleBadgeClass(teacher: TeacherRow, groupKey: string): string {
  if (groupKey === 'executives') return 'bg-amber-50 text-amber-700 border-amber-100';
  return roleBadgeClass(teacher.role);
}

function sortGroupRows(rows: TeacherRow[], groupKey: string): TeacherRow[] {
  if (groupKey === 'developers') {
    return [...rows].sort((a, b) => {
      const roleRank = (role: UserRole) => (role === 'super_admin' ? 0 : role === 'admin' ? 1 : 2);
      return roleRank(a.role) - roleRank(b.role) || displayName(a).localeCompare(displayName(b), 'th');
    });
  }

  if (groupKey !== 'executives') return rows;
  return [...rows].sort((a, b) => {
    const aIndex = executiveNameOrder.indexOf(displayName(a));
    const bIndex = executiveNameOrder.indexOf(displayName(b));
    const aRank = aIndex >= 0 ? aIndex : executiveNameOrder.length;
    const bRank = bIndex >= 0 ? bIndex : executiveNameOrder.length;
    return aRank - bRank || displayName(a).localeCompare(displayName(b), 'th');
  });
}

export const TeachersPage: React.FC<TeachersPageProps> = ({
  currentUser,
  readOnly = false,
}) => {
  const [teachers, setTeachers] = useState<TeacherRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [form, setForm] = useState<TeacherFormState>(emptyForm());
  const [editing, setEditing] = useState<TeacherRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [modalSaveState, setModalSaveState] = useState<ModalSaveState>('idle');
  const [modalSuccessText, setModalSuccessText] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<TeacherRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const canWrite = !readOnly && canManageAdminData(currentUser);
  const canEditSuperAdmin = isSuperAdmin(currentUser);

  const roleOptions = useMemo(() => {
    const options: Array<{ value: UserRole; label: string }> = [
      { value: 'teacher', label: 'ผู้ใช้งาน (ครู)' },
      { value: 'admin', label: 'ผู้ดูแลระบบ (Admin)' },
      { value: 'executive', label: 'ผู้บริหาร' },
    ];

    if (canEditSuperAdmin) {
      options.unshift({ value: 'super_admin', label: ROLE_LABELS.super_admin });
    }

    return options;
  }, [canEditSuperAdmin]);

  const groupedTeachers = useMemo(() => {
    const keyword = searchTerm.trim().toLocaleLowerCase('th-TH');
    const filteredTeachers = keyword
      ? teachers.filter((teacher) => {
          const searchable = [
            displayName(teacher),
            teacher.username ?? '',
            ROLE_LABELS[teacher.role],
            teacher.role,
          ].join(' ').toLocaleLowerCase('th-TH');
          return searchable.includes(keyword);
        })
      : teachers;

    return roleGroups
      .map((group) => ({
        ...group,
        rows: sortGroupRows(
          filteredTeachers.filter((teacher) => displayGroupKey(teacher) === group.key),
          group.key,
        ),
      }))
      .filter((group) => group.rows.length > 0);
  }, [searchTerm, teachers]);

  const loadTeachers = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data, error: queryError } = await supabase
        .from('profiles')
        .select('id, school_id, username, title, full_name, role, is_active, created_at')
        .eq('school_id', currentUser.schoolId)
        .order('role')
        .order('full_name');

      if (queryError) throw queryError;
      setTeachers(data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'โหลดรายชื่อผู้ใช้งานไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  }, [currentUser.schoolId]);

  useEffect(() => {
    void loadTeachers();
  }, [loadTeachers]);

  const closeModal = () => {
    setShowAddModal(false);
    setShowEditModal(false);
    setEditing(null);
    setForm(emptyForm());
    setModalSaveState('idle');
    setModalSuccessText('');
  };

  const openAdd = () => {
    setError('');
    setMessage('');
    setModalSaveState('idle');
    setModalSuccessText('');
    setForm(emptyForm());
    setEditing(null);
    setShowAddModal(true);
  };

  const handleAddTeacher = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setModalSaveState('saving');
    setModalSuccessText('');
    setError('');
    setMessage('');

    if (!canWrite) {
      setError('บัญชีนี้ดูข้อมูลได้อย่างเดียว');
      setModalSaveState('idle');
      setSaving(false);
      return;
    }

    if (form.role === 'super_admin' && !canEditSuperAdmin) {
      setError('เฉพาะ Super Admin เท่านั้นที่เพิ่มผู้พัฒนาระบบได้');
      setModalSaveState('idle');
      setSaving(false);
      return;
    }

    try {
      const username = form.username.trim();
      const { data: existingUser, error: existingError } = await supabase
        .from('profiles')
        .select('id')
        .eq('school_id', currentUser.schoolId)
        .ilike('username', username)
        .maybeSingle();

      if (existingError) throw existingError;
      if (existingUser) {
        throw new Error(`Username "${username}" มีอยู่แล้ว กรุณาใช้ username อื่น`);
      }

      await createTeacherAccount({
        username,
        fullName: form.full_name.trim(),
        title: form.title.trim() || null,
        role: form.role,
        password: form.password.trim() || undefined,
      });

      const successText = form.password.trim()
        ? 'เพิ่มผู้ใช้งานแล้ว และตั้งรหัสผ่านตามที่กำหนด'
        : 'เพิ่มผู้ใช้งานแล้ว และตั้งรหัสผ่านเริ่มต้นเป็น username';
      setModalSaveState('success');
      setModalSuccessText(successText);
      setMessage(successText);
      await loadTeachers();
      await new Promise((resolve) => window.setTimeout(resolve, 650));
      closeModal();
    } catch (err) {
      setModalSaveState('idle');
      setError(err instanceof Error ? err.message : 'เพิ่มผู้ใช้งานไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  };

  const openEdit = (teacher: TeacherRow) => {
    setError('');
    setMessage('');
    setModalSaveState('idle');
    setModalSuccessText('');
    setEditing(teacher);
    setForm({
      username: teacher.username ?? '',
      full_name: teacher.full_name,
      title: teacher.title ?? '',
      role: teacher.role,
      password: '',
    });
    setShowEditModal(true);
  };

  const handleEditTeacher = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editing) return;

    setSaving(true);
    setModalSaveState('saving');
    setModalSuccessText('');
    setError('');
    setMessage('');

    if (!canWrite) {
      setError('บัญชีนี้ดูข้อมูลได้อย่างเดียว');
      setModalSaveState('idle');
      setSaving(false);
      return;
    }

    if ((editing.role === 'super_admin' || form.role === 'super_admin') && !canEditSuperAdmin) {
      setError('เฉพาะ Super Admin เท่านั้นที่แก้ไขบทบาทผู้พัฒนาระบบได้');
      setModalSaveState('idle');
      setSaving(false);
      return;
    }

    const newPassword = form.password.trim();
    if (newPassword && newPassword.length < 6) {
      setError('รหัสผ่านใหม่ต้องมีอย่างน้อย 6 ตัวอักษร');
      setModalSaveState('idle');
      setSaving(false);
      return;
    }

    try {
      await updateTeacherAccount({
        id: editing.id,
        username: form.username.trim(),
        fullName: form.full_name.trim(),
        title: form.title.trim() || null,
        role: form.role,
        password: newPassword || undefined,
      });

      if (newPassword && editing.id === currentUser.id) {
        const { error: passwordError } = await supabase.auth.updateUser({ password: newPassword });
        if (passwordError) throw passwordError;
      }

      const successText = newPassword
        ? 'เปลี่ยนรหัสผ่านใหม่เรียบร้อยแล้ว'
        : 'บันทึกข้อมูลเรียบร้อยแล้ว';
      setModalSaveState('success');
      setModalSuccessText(successText);
      setError('');
      setMessage('บันทึกสำเร็จ');
      await loadTeachers();
      await new Promise((resolve) => window.setTimeout(resolve, 650));
      closeModal();
    } catch (err) {
      setModalSaveState('idle');
      const message = err instanceof Error ? err.message : 'บันทึกไม่สำเร็จ';
      setError(message);
    } finally {
      setSaving(false);
    }
  };

  const requestDeleteUser = (teacher: TeacherRow) => {
    if (!canWrite) {
      setError('บัญชีนี้ดูข้อมูลได้อย่างเดียว');
      return;
    }

    if (teacher.id === currentUser.id) {
      setError('ไม่สามารถลบบัญชีของตัวเองได้');
      return;
    }

    if (teacher.role === 'super_admin' && !canEditSuperAdmin) {
      setError('เฉพาะ Super Admin เท่านั้นที่ลบบัญชีผู้พัฒนาระบบได้');
      return;
    }

    setError('');
    setMessage('');
    setDeleteTarget(teacher);
  };

  const confirmDeleteUser = async () => {
    if (!deleteTarget) return;

    const target = deleteTarget;
    setDeleting(true);
    setError('');
    setMessage('');
    try {
      await deleteTeacherAccount(target.id);
      setDeleteTarget(null);
      setMessage(`ลบบัญชี ${displayName(target)} ออกจากระบบและฐานข้อมูลเรียบร้อยแล้ว`);
      await loadTeachers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ลบบัญชีผู้ใช้งานไม่สำเร็จ');
    } finally {
      setDeleting(false);
    }
  };

  const toggleUserActive = async (teacher: TeacherRow) => {
    if (!canWrite) {
      setError('บัญชีนี้ดูข้อมูลได้อย่างเดียว');
      return;
    }

    if (teacher.id === currentUser.id) {
      setError('ไม่สามารถปิดบัญชีของตัวเองได้');
      return;
    }

    if (teacher.role === 'super_admin' && !canEditSuperAdmin) {
      setError('เฉพาะ Super Admin เท่านั้นที่แก้ไขบัญชีผู้พัฒนาระบบได้');
      return;
    }

    const nextActive = !teacher.is_active;
    if (!window.confirm(`${nextActive ? 'เปิดใช้งาน' : 'ปิดใช้งาน'}บัญชี "${teacher.full_name}" ใช่หรือไม่?`)) return;

    setError('');
    setMessage('');
    const { error: updateError } = await supabase
      .from('profiles')
      .update({ is_active: nextActive })
      .eq('id', teacher.id);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    setMessage(nextActive ? 'เปิดใช้งานบัญชีเรียบร้อยแล้ว' : 'ปิดใช้งานบัญชีเรียบร้อยแล้ว');
    await loadTeachers();
  };

  const renderUserTable = (rows: TeacherRow[], groupKey: string) => {
    if (rows.length === 0) {
      return <div className="px-5 py-10 text-center text-sm text-slate-400">ยังไม่มีผู้ใช้งานในกลุ่มนี้</div>;
    }

    return (
      <div className="overflow-x-auto">
        <table className="w-full min-w-[920px] text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
            <tr>
              <th className="px-5 py-3 text-center font-semibold">ชื่อ-นามสกุล</th>
              <th className="px-5 py-3 text-center font-semibold">Username</th>
              <th className="px-5 py-3 text-center font-semibold">บทบาท</th>
              <th className="px-5 py-3 text-center font-semibold">สถานะ</th>
              <th className="px-5 py-3 text-center font-semibold">เปิด/ปิดใช้งาน</th>
              <th className="px-5 py-3 text-center font-semibold">จัดการ</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((teacher) => {
              const canEditRow = canWrite && (teacher.role !== 'super_admin' || canEditSuperAdmin);
              const canViewCredentials = canEditSuperAdmin || teacher.role !== 'super_admin';

              return (
                <tr key={teacher.id} className="transition-colors hover:bg-slate-50/70">
                  <td className="px-5 py-4 font-semibold text-slate-950">{displayName(teacher)}</td>
                  <td className="px-5 py-4 text-center font-mono text-slate-700">
                    {canViewCredentials ? teacher.username ?? '—' : 'ซ่อน'}
                  </td>
                  <td className="px-5 py-4 text-center">
                    <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-bold ${displayedRoleBadgeClass(teacher, groupKey)}`}>
                      {displayedRoleLabel(teacher, groupKey)}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-center">
                    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${
                      teacher.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
                    }`}>
                      {teacher.is_active ? 'ใช้งานอยู่' : 'ปิดใช้งาน'}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-center">
                    {canEditRow && teacher.id !== currentUser.id ? (
                      <button
                        type="button"
                        onClick={() => void toggleUserActive(teacher)}
                        className={`relative inline-flex h-7 w-12 items-center rounded-full transition ${
                          teacher.is_active ? 'bg-emerald-500' : 'bg-slate-300'
                        }`}
                        aria-label={teacher.is_active ? 'ปิดใช้งานบัญชี' : 'เปิดใช้งานบัญชี'}
                      >
                        <span
                          className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${
                            teacher.is_active ? 'translate-x-6' : 'translate-x-1'
                          }`}
                        />
                      </button>
                    ) : (
                      <span className="text-xs font-semibold text-slate-400">—</span>
                    )}
                  </td>
                  <td className="px-5 py-4">
                    {canEditRow ? (
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => openEdit(teacher)}
                          className="inline-flex items-center rounded-lg bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-700 hover:bg-blue-100"
                        >
                          <Pencil className="mr-1 h-3.5 w-3.5" />
                          แก้ไข
                        </button>
                        <button
                          type="button"
                          onClick={() => requestDeleteUser(teacher)}
                          disabled={teacher.id === currentUser.id}
                          className="inline-flex items-center rounded-lg bg-red-50 px-3 py-1.5 text-xs font-bold text-red-700 hover:bg-red-100 disabled:bg-slate-100 disabled:text-slate-400 disabled:opacity-60"
                        >
                          <Trash2 className="mr-1 h-3.5 w-3.5" />
                          ลบ
                        </button>
                      </div>
                    ) : (
                      <div className="text-right text-xs font-semibold text-slate-400">ดูได้อย่างเดียว</div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  const modalOpen = showAddModal || showEditModal;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h4 className="text-[22px] font-extrabold tracking-tight text-slate-900">บทบาทและผู้ใช้งาน</h4>
          <p className="mt-1 text-sm text-slate-500">
            จัดการบัญชีผู้ดูแลระบบ ผู้บริหาร และผู้ใช้งาน โดยใช้ username เป็นรหัสผ่านเริ่มต้นอัตโนมัติ
          </p>
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
          <label className="relative w-full sm:w-72">
            <span className="sr-only">ค้นหาผู้ใช้งาน</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="ค้นหาชื่อ หรือ Username"
              className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
            />
          </label>
          {canWrite && (
            <button
              type="button"
              onClick={openAdd}
              className="btn btn-primary whitespace-nowrap"
            >
              <UserPlus className="mr-2 h-4 w-4" />
              เพิ่มผู้ใช้งาน
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-100 bg-red-50 p-3 text-sm text-red-600">{error}</div>
      )}
      {message && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-100 bg-emerald-50 p-3 text-sm font-semibold text-emerald-700">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>{message}</span>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center rounded-2xl border border-slate-200 bg-white py-16 text-slate-500">
          <Loader2 className="mr-2 h-6 w-6 animate-spin" />
          กำลังโหลด...
        </div>
      ) : (
        <div className="space-y-5">
          {groupedTeachers.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-white py-16 text-center text-sm text-slate-400">
              ไม่พบผู้ใช้งานตามคำค้นหา
            </div>
          ) : groupedTeachers.map((group) => {
            const Icon = group.icon;

            return (
              <section key={group.key} className="ui-card overflow-hidden">
                <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-800">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div>
                      <h5 className="font-bold text-slate-900">{group.title}</h5>
                      <p className="mt-0.5 text-xs text-slate-500">{group.description}</p>
                    </div>
                  </div>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">
                    {group.rows.length.toLocaleString('th-TH')} บัญชี
                  </span>
                </div>
                {renderUserTable(group.rows, group.key)}
              </section>
            );
          })}
        </div>
      )}

      {deleteTarget && createPortal((
        <div className="fixed inset-0 z-[220] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 text-center shadow-2xl">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-100 text-red-600">
              <AlertTriangle className="h-8 w-8" />
            </div>
            <h3 className="text-xl font-extrabold text-slate-900">ยืนยันลบบัญชีถาวร</h3>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              ต้องการลบบัญชี <span className="font-bold text-slate-900">{displayName(deleteTarget)}</span> ออกจากระบบจริงใช่หรือไม่
            </p>
            <div className="mt-3 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-left text-sm leading-6 text-red-700">
              บัญชี Auth, โปรไฟล์ และข้อมูล ปพ.5 ที่ผูกกับบัญชีนี้จะถูกลบจากฐานข้อมูล ไม่ใช่เพียงการปิดใช้งาน
            </div>
            {!deleteTarget.is_active && (
              <p className="mt-3 text-xs font-semibold text-slate-500">บัญชีนี้อยู่ในสถานะปิดใช้งาน แต่ยังลบถาวรได้</p>
            )}
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
                className="flex-1 rounded-xl bg-slate-100 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-200 disabled:opacity-60"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={() => void confirmDeleteUser()}
                disabled={deleting}
                className="inline-flex flex-1 items-center justify-center rounded-xl bg-red-600 py-2.5 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-60"
              >
                {deleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
                ลบบัญชีถาวร
              </button>
            </div>
          </div>
        </div>
      ), document.body)}

      {modalOpen && createPortal((
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
          <div className="relative w-full max-w-md overflow-hidden rounded-2xl bg-white p-6 shadow-xl">
            {modalSaveState !== 'idle' && (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-white/95 px-8 text-center">
                {modalSaveState === 'success' ? (
                  <CheckCircle2 className="h-14 w-14 text-emerald-500" />
                ) : (
                  <Loader2 className="h-14 w-14 animate-spin text-blue-600" />
                )}
                <div className="mt-4 text-lg font-extrabold text-slate-900">
                  {modalSaveState === 'success' ? 'บันทึกสำเร็จ' : 'กำลังบันทึกข้อมูล'}
                </div>
                <p className="mt-1 text-sm font-semibold text-slate-500">
                  {modalSaveState === 'success'
                    ? modalSuccessText || 'บันทึกข้อมูลเรียบร้อยแล้ว'
                    : 'กรุณารอสักครู่ ระบบกำลังอัปเดตบัญชีผู้ใช้งาน'}
                </p>
              </div>
            )}
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  {showAddModal ? 'เพิ่มผู้ใช้งานใหม่' : 'แก้ไขข้อมูลผู้ใช้งาน'}
                </h3>
                <p className="mt-1 text-sm text-slate-500">
                  {showAddModal ? 'กำหนดรหัสผ่านได้เอง หรือเว้นว่างเพื่อใช้ username เป็นรหัสผ่านเริ่มต้น' : 'กรอกรหัสผ่านใหม่เฉพาะเมื่อต้องการเปลี่ยนรหัสผ่าน'}
                </p>
              </div>
              <button
                type="button"
                onClick={closeModal}
                disabled={saving}
                className="text-slate-400 hover:text-slate-600 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={showAddModal ? handleAddTeacher : handleEditTeacher} className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Username</label>
                <input
                  type="text"
                  value={form.username}
                  onChange={(event) => setForm((current) => ({ ...current, username: event.target.value }))}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2.5 outline-none focus:ring-2 focus:ring-blue-500"
                  required
                  autoComplete="off"
                />
              </div>

              {(showAddModal || showEditModal) && (
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    {showAddModal ? 'รหัสผ่านเริ่มต้น' : 'รหัสผ่านใหม่'}
                  </label>
                  <input
                    type="text"
                    value={form.password}
                    onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
                    placeholder={showAddModal ? 'เว้นว่างเพื่อใช้ username หรือกรอก @ksp123456' : 'เว้นว่างถ้าไม่ต้องการเปลี่ยนรหัสผ่าน'}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2.5 outline-none focus:ring-2 focus:ring-blue-500"
                    autoComplete="new-password"
                  />
                </div>
              )}

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">คำนำหน้า</label>
                <input
                  type="text"
                  value={form.title}
                  onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
                  placeholder="นาย / นาง / นางสาว"
                  className="w-full rounded-xl border border-slate-300 px-3 py-2.5 outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">ชื่อ-นามสกุล</label>
                <input
                  type="text"
                  value={form.full_name}
                  onChange={(event) => setForm((current) => ({ ...current, full_name: event.target.value }))}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2.5 outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">บทบาท</label>
                <select
                  value={form.role}
                  onChange={(event) => setForm((current) => ({ ...current, role: event.target.value as UserRole }))}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2.5 outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {roleOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeModal}
                  disabled={saving}
                  className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-50"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="btn btn-primary flex-1"
                >
                  {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  {saving ? 'กำลังบันทึก...' : 'บันทึก'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ), document.body)}
    </div>
  );
};
