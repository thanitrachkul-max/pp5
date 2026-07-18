import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function response(status: number, payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') return response(405, { error: 'Method not allowed' });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return response(401, { error: 'Unauthorized' });

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabaseUser = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    const { data: authData, error: authError } = await supabaseUser.auth.getUser();
    if (authError || !authData.user) return response(401, { error: 'Unauthorized' });

    const { id: rawId } = await req.json();
    const id = String(rawId ?? '').trim();
    if (!id) return response(400, { error: 'ไม่พบบัญชีผู้ใช้งานที่ต้องการลบ' });
    if (id === authData.user.id) return response(400, { error: 'ไม่สามารถลบบัญชีของตัวเองได้' });

    const { data: adminProfile, error: adminError } = await supabaseUser
      .from('profiles')
      .select('role, school_id')
      .eq('id', authData.user.id)
      .single();

    if (adminError || !['super_admin', 'admin'].includes(adminProfile?.role ?? '')) {
      return response(403, { error: 'Forbidden' });
    }

    const { data: targetProfile, error: targetError } = await supabaseAdmin
      .from('profiles')
      .select('id, school_id, role, full_name')
      .eq('id', id)
      .single();

    if (targetError || !targetProfile) return response(404, { error: 'ไม่พบบัญชีผู้ใช้งาน' });
    if (targetProfile.school_id !== adminProfile.school_id) return response(403, { error: 'Forbidden' });
    if (targetProfile.role === 'super_admin' && adminProfile.role !== 'super_admin') {
      return response(403, { error: 'เฉพาะ Super Admin เท่านั้นที่ลบบัญชีผู้พัฒนาระบบได้' });
    }

    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(id);
    if (deleteError) return response(400, { error: deleteError.message });

    return response(200, { ok: true, id, full_name: targetProfile.full_name });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal error';
    return response(500, { error: message });
  }
});
