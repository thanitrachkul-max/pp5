import type { IncomingMessage, ServerResponse } from 'node:http';
import { createClient } from '@supabase/supabase-js';

interface DeleteTeacherPayload {
  id?: unknown;
}

function readRequestBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => {
      body += chunk;
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

function getRequiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing server environment variable ${name}`);
  return value;
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim()) return error.message;
  const message = String(error ?? '').trim();
  return message || 'ลบบัญชีผู้ใช้งานไม่สำเร็จ';
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

    const supabaseUrl = getRequiredEnv('VITE_SUPABASE_URL');
    const anonKey = getRequiredEnv('VITE_SUPABASE_ANON_KEY');
    const serviceRoleKey = getRequiredEnv('SUPABASE_SERVICE_ROLE_KEY');
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

    const rawBody = await readRequestBody(req);
    const payload = JSON.parse(rawBody || '{}') as DeleteTeacherPayload;
    const id = String(payload.id ?? '').trim();
    if (!id) {
      json(res, 400, { error: 'ไม่พบบัญชีผู้ใช้งานที่ต้องการลบ' });
      return;
    }

    if (id === authData.user.id) {
      json(res, 400, { error: 'ไม่สามารถลบบัญชีของตัวเองได้' });
      return;
    }

    const { data: adminProfile, error: adminError } = await supabaseUser
      .from('profiles')
      .select('role, school_id')
      .eq('id', authData.user.id)
      .single();

    if (adminError || !['super_admin', 'admin'].includes(adminProfile?.role ?? '')) {
      json(res, 403, { error: 'Forbidden' });
      return;
    }

    const { data: targetProfile, error: targetError } = await supabaseAdmin
      .from('profiles')
      .select('id, school_id, role, full_name')
      .eq('id', id)
      .single();

    if (targetError || !targetProfile) {
      json(res, 404, { error: 'ไม่พบบัญชีผู้ใช้งาน' });
      return;
    }

    if (targetProfile.school_id !== adminProfile.school_id) {
      json(res, 403, { error: 'Forbidden' });
      return;
    }

    if (targetProfile.role === 'super_admin' && adminProfile.role !== 'super_admin') {
      json(res, 403, { error: 'เฉพาะ Super Admin เท่านั้นที่ลบบัญชีผู้พัฒนาระบบได้' });
      return;
    }

    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(id);
    if (deleteError) {
      json(res, 400, { error: deleteError.message });
      return;
    }

    json(res, 200, { ok: true, id, full_name: targetProfile.full_name });
  } catch (error) {
    console.error('Delete teacher account failed', error);
    json(res, 500, { error: getErrorMessage(error) });
  }
}
