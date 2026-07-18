import { supabase } from './supabase';
import { normalizeUsername } from './auth';
import type { UserRole } from '../types';

export interface CreateTeacherAccountInput {
  username: string;
  fullName: string;
  title: string | null;
  role: UserRole;
  password?: string;
}

export interface UpdateTeacherAccountInput extends CreateTeacherAccountInput {
  id: string;
}

interface AccountMutationResponse {
  ok?: boolean;
  error?: unknown;
  message?: unknown;
}

function isEdgeFunctionUnavailable(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return (
    message.includes('Failed to send a request to the Edge Function') ||
    message.includes('non-2xx') ||
    message.includes('FunctionsFetchError') ||
    message.includes('Function not found')
  );
}

async function readFunctionErrorMessage(error: unknown): Promise<string | null> {
  const context = (error as { context?: unknown })?.context;
  if (context instanceof Response) {
    try {
      const payload = await context.clone().json() as { error?: unknown; message?: unknown };
      return String(payload.error ?? payload.message ?? '').trim() || null;
    } catch {
      return null;
    }
  }
  return null;
}

async function updateTeacherAccountViaServer(
  body: {
    id: string;
    username: string;
    full_name: string;
    title: string | null;
    role: UserRole;
    password?: string;
    reset_password_to_username: boolean;
  },
): Promise<void> {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;

  if (sessionError || !accessToken) {
    throw new Error('กรุณาเข้าสู่ระบบใหม่อีกครั้งก่อนแก้ไขบัญชีผู้ใช้งาน');
  }

  const response = await fetch('/api/update-teacher', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => null) as { error?: unknown; message?: unknown } | null;

  if (!response.ok || payload?.error) {
    const message = String(payload?.error ?? payload?.message ?? '').trim();
    throw new Error(message || 'บันทึกไม่สำเร็จ');
  }
}

async function deleteTeacherAccountViaServer(id: string): Promise<void> {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;

  if (sessionError || !accessToken) {
    throw new Error('กรุณาเข้าสู่ระบบใหม่อีกครั้งก่อนลบบัญชีผู้ใช้งาน');
  }

  const response = await fetch('/api/delete-teacher', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ id }),
  });
  const payload = await response.json().catch(() => null) as AccountMutationResponse | null;

  if (!response.ok || payload?.error || payload?.ok !== true) {
    const message = String(payload?.error ?? payload?.message ?? '').trim();
    throw new Error(message || 'ลบบัญชีผู้ใช้งานไม่สำเร็จ');
  }
}

export async function createTeacherAccount(input: CreateTeacherAccountInput): Promise<void> {
  const username = normalizeUsername(input.username);
  const password = (input.password ?? username).trim();
  const body = {
    username,
    password,
    full_name: input.fullName.trim(),
    title: input.title?.trim() || null,
    role: input.role,
  };

  try {
    const { data, error } = await supabase.functions.invoke('create-teacher', { body });
    if (error) {
      const detail = await readFunctionErrorMessage(error);
      throw new Error(detail || error.message);
    }
    if (data?.error) throw new Error(String(data.error));
    return;
  } catch (err) {
    if (!isEdgeFunctionUnavailable(err)) {
      throw err instanceof Error ? err : new Error('เพิ่มผู้ใช้งานไม่สำเร็จ');
    }
  }

  const { data, error } = await supabase.rpc('admin_create_teacher_account', {
    p_username: username,
    p_password: password,
    p_full_name: body.full_name,
    p_title: body.title,
    p_role: body.role,
  });

  if (error) {
    if (error.message.includes('Could not find the function')) {
      throw new Error(
        'ไม่สามารถสร้างผู้ใช้ได้ — กรุณา deploy Edge Function create-teacher หรือรัน migration `0021_admin_create_teacher_rpc.sql` ใน Supabase',
      );
    }
    throw error;
  }

  if (data && typeof data === 'object' && 'error' in data && data.error) {
    throw new Error(String(data.error));
  }
}

export async function updateTeacherAccount(input: UpdateTeacherAccountInput): Promise<void> {
  const username = normalizeUsername(input.username);
  const password = input.password?.trim() || null;
  const body = {
    id: input.id,
    username,
    full_name: input.fullName.trim(),
    title: input.title?.trim() || null,
    role: input.role,
    password: password || undefined,
    reset_password_to_username: false,
  };

  try {
    const { data, error } = await supabase.functions.invoke('update-teacher', { body });
    if (error) {
      const detail = await readFunctionErrorMessage(error);
      throw new Error(detail || error.message);
    }
    if (data?.error) throw new Error(String(data.error));
    return;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err ?? '');
    const staleUsernameValidation = message.includes('Username ต้องมีอย่างน้อย 6 ตัวอักษร');

    if (!isEdgeFunctionUnavailable(err) && !staleUsernameValidation) {
      throw err instanceof Error ? err : new Error('บันทึกไม่สำเร็จ');
    }
  }

  try {
    await updateTeacherAccountViaServer(body);
    return;
  } catch (serverError) {
    const { data, error } = await supabase.rpc('admin_update_teacher_account', {
      p_id: input.id,
      p_username: username,
      p_password: password,
      p_full_name: body.full_name,
      p_title: body.title,
      p_role: body.role,
    });

    if (error) {
      if (error.message.includes('Could not find the function')) {
        const serverMessage = serverError instanceof Error ? serverError.message : String(serverError ?? '');
        throw new Error(
          serverMessage ||
            'ยังแก้ไขผู้ใช้จากหน้าเว็บไม่ได้ เพราะระบบสำรองสำหรับแก้บัญชีผู้ใช้ยังไม่พร้อมใช้งาน — กรุณาตรวจ Environment Variable `SUPABASE_SERVICE_ROLE_KEY` แล้ว deploy ใหม่',
        );
      }
      throw error;
    }

    if (data && typeof data === 'object' && 'error' in data && data.error) {
      throw new Error(String(data.error));
    }
  }
}

export async function deleteTeacherAccount(id: string): Promise<void> {
  const targetId = id.trim();
  if (!targetId) throw new Error('ไม่พบบัญชีผู้ใช้งานที่ต้องการลบ');

  try {
    const { data, error } = await supabase.functions.invoke('delete-teacher', {
      body: { id: targetId },
    });
    if (error) {
      const detail = await readFunctionErrorMessage(error);
      throw new Error(detail || error.message);
    }
    if (data?.error) throw new Error(String(data.error));
    if (data?.ok === true) return;
    throw new Error('Edge Function ตอบกลับไม่สมบูรณ์');
  } catch (edgeError) {
    if (!isEdgeFunctionUnavailable(edgeError)) {
      throw edgeError instanceof Error ? edgeError : new Error('ลบบัญชีผู้ใช้งานไม่สำเร็จ');
    }
  }

  try {
    await deleteTeacherAccountViaServer(targetId);
    return;
  } catch (serverError) {
    const { data, error } = await supabase.rpc('admin_delete_user_account', {
      p_id: targetId,
    });

    if (error) {
      if (error.message.includes('Could not find the function')) {
        const serverMessage = serverError instanceof Error ? serverError.message : String(serverError ?? '');
        throw new Error(
          serverMessage ||
            'ระบบลบบัญชียังไม่พร้อมใช้งาน กรุณา deploy API/Edge Function หรือลง migration สำหรับลบบัญชีผู้ใช้',
        );
      }
      throw error;
    }

    if (data && typeof data === 'object' && 'error' in data && data.error) {
      throw new Error(String(data.error));
    }
  }
}
