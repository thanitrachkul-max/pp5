import type { IncomingMessage, ServerResponse } from 'node:http';
import { createClient } from '@supabase/supabase-js';
import type { AppData } from '../src/types';

export function gradebookDataResetPayload(now: string, generalInfo: AppData['generalInfo'], students: AppData['students']) {
  return {
    status: 'not_started' as const, general_info: generalInfo, students,
    attendance: {}, scores: {}, score_config: null, attributes: {}, analytical: {},
    indicators: [], stats: {}, approval_status: null, approval_reason: null,
    approval_reason_seen_at: null, approval_reviewed_by: null,
    approval_reviewed_at: null, approval_resubmitted_at: null, updated_at: now,
  };
}

export function resetPrimaryTerm(terms: Record<string, unknown> | null | undefined, semesterNumber: number) {
  return {
    ...(terms ?? {}),
    [String(semesterNumber)]: { scores: {}, scoreConfig: null, attributes: {}, analytical: {} },
  };
}

interface ResetGradebookPayload {
  assignmentId?: unknown;
  generalInfo?: unknown;
  students?: unknown;
}

function readRequestBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 2_000_000) reject(new Error('ข้อมูลสมุด ปพ.5 มีขนาดใหญ่เกินไป'));
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

function json(res: ServerResponse, statusCode: number, payload: unknown) {
  res.statusCode = statusCode;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

function requiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing server environment variable ${name}`);
  return value;
}

function errorMessage(error: unknown) {
  return error instanceof Error && error.message.trim()
    ? error.message
    : 'ล้างข้อมูล ปพ.5 ไม่สำเร็จ';
}

function isMissingColumn(error: unknown, column: string) {
  const message = String((error as { message?: unknown } | null)?.message ?? error ?? '');
  return message.includes(column) && (
    message.includes('schema cache') ||
    message.includes('Could not find') ||
    message.includes('column')
  );
}

function relatedRow<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }
  if (req.method !== 'POST') {
    json(res, 405, { error: 'Method not allowed' });
    return;
  }

  try {
    const authHeader = req.headers.authorization;
    const authorization = Array.isArray(authHeader) ? authHeader[0] : authHeader;
    if (!authorization) {
      json(res, 401, { error: 'Unauthorized' });
      return;
    }

    const supabaseUrl = requiredEnv('VITE_SUPABASE_URL');
    const anonKey = requiredEnv('VITE_SUPABASE_ANON_KEY');
    const serviceRoleKey = requiredEnv('SUPABASE_SERVICE_ROLE_KEY');
    const supabaseUser = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: authData, error: authError } = await supabaseUser.auth.getUser();
    if (authError || !authData.user) {
      json(res, 401, { error: 'Unauthorized' });
      return;
    }

    const { data: adminProfile, error: profileError } = await supabaseUser
      .from('profiles')
      .select('role, school_id, is_active, full_name')
      .eq('id', authData.user.id)
      .single();
    if (profileError || !adminProfile || adminProfile.is_active !== true || !['super_admin', 'admin'].includes(adminProfile.role)) {
      json(res, 403, { error: 'Forbidden' });
      return;
    }

    const payload = JSON.parse(await readRequestBody(req) || '{}') as ResetGradebookPayload;
    const assignmentId = String(payload.assignmentId ?? '').trim();
    if (!assignmentId || !payload.generalInfo || typeof payload.generalInfo !== 'object' || !Array.isArray(payload.students)) {
      json(res, 400, { error: 'ข้อมูลสำหรับรีเซ็ตสมุด ปพ.5 ไม่ครบถ้วน' });
      return;
    }

    let assignmentResult: any = await supabaseAdmin
      .from('teaching_assignments')
      .select(`
        id, assignment_group_id, school_id, teacher_id, semester_id, subject_id, classroom_id,
        semesters:semester_id(semester_number, academic_year_id),
        classrooms:classroom_id(class_level_code)
      `)
      .eq('id', assignmentId)
      .single();
    if (assignmentResult.error && isMissingColumn(assignmentResult.error, 'assignment_group_id')) {
      assignmentResult = await supabaseAdmin
        .from('teaching_assignments')
        .select(`
          id, school_id, teacher_id, semester_id, subject_id, classroom_id,
          semesters:semester_id(semester_number, academic_year_id),
          classrooms:classroom_id(class_level_code)
        `)
        .eq('id', assignmentId)
        .single();
    }
    const assignment = assignmentResult.data as any;
    if (assignmentResult.error || !assignment) {
      json(res, 404, { error: 'ไม่พบรายการมอบหมายที่ต้องการล้างข้อมูล' });
      return;
    }
    if (assignment.school_id !== adminProfile.school_id) {
      json(res, 403, { error: 'Forbidden' });
      return;
    }

    const findLegacyGradebook = () => supabaseAdmin
      .from('gradebooks')
      .select('id')
      .eq('teaching_assignment_id', assignment.id)
      .is('deleted_at', null)
      .maybeSingle();
    const findGradebook = () => assignment.assignment_group_id
      ? supabaseAdmin
          .from('gradebooks')
          .select('id')
          .eq('assignment_group_id', assignment.assignment_group_id)
          .is('deleted_at', null)
          .maybeSingle()
      : findLegacyGradebook();
    let gradebookResult: any = await findGradebook();
    if (gradebookResult.error && isMissingColumn(gradebookResult.error, 'assignment_group_id')) {
      gradebookResult = await findLegacyGradebook();
    }
    if (gradebookResult.error) throw gradebookResult.error;
    if (!gradebookResult.data?.id) {
      json(res, 200, { reset: false });
      return;
    }

    const semester = relatedRow<{ semester_number: number; academic_year_id: string }>(assignment.semesters);
    const classroom = relatedRow<{ class_level_code: string }>(assignment.classrooms);
    const isPrimary = classroom?.class_level_code?.startsWith('ป.') === true;
    let originalPrimaryTerms: Record<string, unknown> | null = null;
    let originalPrimaryRowExisted = false;

    if (isPrimary && semester) {
      const key = {
        academic_year_id: semester.academic_year_id,
        classroom_id: assignment.classroom_id,
        subject_id: assignment.subject_id,
      };
      const { data: annualRow, error: annualReadError } = await supabaseAdmin
        .from('primary_gradebook_years')
        .select('terms')
        .match(key)
        .maybeSingle();
      if (annualReadError) throw annualReadError;
      originalPrimaryRowExisted = Boolean(annualRow);
      originalPrimaryTerms = (annualRow?.terms as Record<string, unknown> | null) ?? null;
      const { error: annualWriteError } = await supabaseAdmin
        .from('primary_gradebook_years')
        .upsert({
          ...key,
          terms: resetPrimaryTerm(originalPrimaryTerms, semester.semester_number),
          updated_at: new Date().toISOString(),
        }, { onConflict: 'academic_year_id,classroom_id,subject_id' });
      if (annualWriteError) throw annualWriteError;
    }

    const now = new Date().toISOString();
    const { error: resetError } = await supabaseAdmin
      .from('gradebooks')
      .update(gradebookDataResetPayload(
        now,
        payload.generalInfo as any,
        payload.students as any,
      ))
      .eq('id', gradebookResult.data.id);

    if (resetError) {
      if (isPrimary && semester) {
        const key = {
          academic_year_id: semester.academic_year_id,
          classroom_id: assignment.classroom_id,
          subject_id: assignment.subject_id,
        };
        if (originalPrimaryRowExisted) {
          await supabaseAdmin
            .from('primary_gradebook_years')
            .update({ terms: originalPrimaryTerms ?? {}, updated_at: new Date().toISOString() })
            .match(key);
        } else {
          await supabaseAdmin.from('primary_gradebook_years').delete().match(key);
        }
      }
      throw resetError;
    }

    await supabaseAdmin.from('activity_logs').insert({
      school_id: assignment.school_id,
      user_id: authData.user.id,
      user_name: adminProfile.full_name,
      action: `ล้างข้อมูล ปพ.5 ของรายการมอบหมาย ${assignment.id}`,
    });

    json(res, 200, { reset: true, gradebookId: gradebookResult.data.id });
  } catch (error) {
    console.error('Admin reset gradebook failed', error);
    json(res, 500, { error: errorMessage(error) });
  }
}
