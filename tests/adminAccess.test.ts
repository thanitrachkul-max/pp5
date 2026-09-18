import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import createGradebook from '../api/create-gradebook.ts';
import resetGradebook from '../api/reset-gradebook.ts';
import updateTeacher from '../api/update-teacher.ts';
import deleteTeacher from '../api/delete-teacher.ts';

for (const [name, handler] of Object.entries({ createGradebook, resetGradebook, updateTeacher, deleteTeacher })) {
  test(`${name}: inactive admin gets 403 before any privileged write`, async () => {
    const originalFetch = globalThis.fetch;
    const envNames = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY'];
    const originalEnv = envNames.map(key => process.env[key]);
    process.env.VITE_SUPABASE_URL = 'https://test.invalid';
    process.env.VITE_SUPABASE_ANON_KEY = 'test-anon-key';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';
    const calls: string[] = [];
    globalThis.fetch = async (input, init) => {
      const url = String(input);
      calls.push(url);
      assert.equal(init?.method ?? 'GET', 'GET');
      if (url.includes('/auth/v1/user')) return new Response(JSON.stringify({ id: 'admin-id' }), { status: 200 });
      assert.match(url, /\/rest\/v1\/profiles/);
      assert.match(decodeURIComponent(url), /is_active/);
      return new Response(JSON.stringify({ role: 'super_admin', school_id: 'school-id', is_active: false }), { status: 200 });
    };
    let status = 0;
    let body = '';
    const res = { set statusCode(value: number) { status = value; }, setHeader() {}, end(value: string) { body = value; } };
    try {
      const req = Object.assign(Readable.from([JSON.stringify({ id: 'teacher-id', username: 'teacher', full_name: 'Test Teacher', role: 'teacher' })]), {
        method: 'POST', headers: { authorization: 'Bearer test-token' },
      });
      await handler(req as any, res as any);
      assert.equal(status, 403);
      assert.match(body, /Forbidden/);
      assert.equal(calls.length, 2);
    } finally {
      globalThis.fetch = originalFetch;
      envNames.forEach((key, i) => { if (originalEnv[i] === undefined) delete process.env[key]; else process.env[key] = originalEnv[i]; });
    }
  });
}
