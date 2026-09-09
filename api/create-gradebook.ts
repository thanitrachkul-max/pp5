import type { IncomingMessage, ServerResponse } from 'node:http';
import { createClient } from '@supabase/supabase-js';

interface CreateGradebookPayload {
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
    : 'สร้างสมุด ปพ.5 ไม่สำเร็จ';
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
      .select('role, school_id, is_active')
      .eq('id', authData.user.id)
      .single();
    if (profileError || adminProfile?.is_active !== true || !adminProfile || !['super_admin', 'admin'].includes(adminProfile.role)) {
      json(res, 403, { error: 'Forbidden' });
      return;
    }

    const payload = JSON.parse(await readRequestBody(req) || '{}') as CreateGradebookPayload;
    const assignmentId = String(payload.assignmentId ?? '').trim();
    if (!assignmentId || !payload.generalInfo || !Array.isArray(payload.students)) {
      json(res, 400, { error: 'ข้อมูลสำหรับสร้างสมุด ปพ.5 ไม่ครบถ้วน' });
      return;
    }

    const { data: assignment, error: assignmentError } = await supabaseAdmin
      .from('teaching_assignments')
      .select('id, school_id, teacher_id, semester_id')
      .eq('id', assignmentId)
      .single();
    if (assignmentError || !assignment) {
      json(res, 404, { error: 'ไม่พบรายการมอบหมายที่ต้องการเปิด' });
      return;
    }
    if (assignment.school_id !== adminProfile.school_id) {
      json(res, 403, { error: 'Forbidden' });
      return;
    }

    const findExisting = () => supabaseAdmin
      .from('gradebooks')
      .select('id')
      .eq('teaching_assignment_id', assignment.id)
      .eq('teacher_id', assignment.teacher_id)
      .maybeSingle();
    const { data: existing, error: existingError } = await findExisting();
    if (existingError) throw existingError;
    if (existing?.id) {
      json(res, 200, { id: existing.id, created: false });
      return;
    }

    const { data: created, error: createError } = await supabaseAdmin
      .from('gradebooks')
      .insert({
        teaching_assignment_id: assignment.id,
        teacher_id: assignment.teacher_id,
        semester_id: assignment.semester_id,
        status: 'not_started',
        general_info: payload.generalInfo,
        students: payload.students,
      })
      .select('id')
      .single();

    if (createError) {
      const { data: racedExisting } = await findExisting();
      if (racedExisting?.id) {
        json(res, 200, { id: racedExisting.id, created: false });
        return;
      }
      throw createError;
    }

    json(res, 201, { id: created.id, created: true });
  } catch (error) {
    console.error('Admin create gradebook failed', error);
    json(res, 500, { error: errorMessage(error) });
  }
}
