import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { chromium } from 'playwright';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { browserFixture } from './fixture.mjs';

// Usage: node scripts/performance/check.mjs <baseline-worktree> [artifact-directory]
const baseline = process.argv[2];
if (!baseline) throw new Error('Pass the checkpoint worktree path');
const output = path.resolve(process.argv[3] ?? 'performance-results');
await mkdir(output, { recursive: true });
const harness = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { TeacherDashboard } from '/src/pages/teacher/TeacherDashboard.tsx';
import { AssignmentsPage } from '/src/pages/admin/AssignmentsPage.tsx';
import { AdminHomePage } from '/src/pages/admin/AdminHomePage.tsx';
import { fetchTeacherAssignments, loadGradebookSession } from '/src/lib/teacherGradebooks.ts';
import '/src/index.css';
const user = { id: 'teacher', name: 'ครูทดสอบ', role: 'admin', schoolId: 'school', isActive: true };
const root = createRoot(document.getElementById('root'));
const open = async (assignment, id) => {
  const session = await loadGradebookSession(id, assignment);
  const { GradebookEditor } = await import('/src/pages/teacher/GradebookEditor.tsx');
  root.render(React.createElement(GradebookEditor, { session: { ...session, readOnly: true }, currentUser: user, onBack() {} }));
  window.__perf.opened = true;
};
window.__perf.fetchOne = () => fetchTeacherAssignments('teacher', { assignmentIds: ['assignment0'] });
window.__perf.fetchAll = () => fetchTeacherAssignments('teacher');
const mode = new URLSearchParams(location.search).get('mode');
const component = mode === 'teacher' ? TeacherDashboard : mode === 'home' ? AdminHomePage : AssignmentsPage;
root.render(React.createElement(component, { currentUser: mode === 'teacher' ? { ...user, role: 'teacher' } : user, initialYearId: 'year', selectedYearId: 'year', onOpenTab() {}, onOpenGradebook: open, onLogout() {}, onSettings() {} }));
`;

const results = {};
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  for (const [label, root] of [['before', baseline], ['after', process.cwd()]]) {
    const server = await createServer({
      root, configFile: false, server: { host: '127.0.0.1', port: 0 },
      plugins: [{
        name: 'offline-performance-fixture', enforce: 'pre',
        resolveId(id) { if (id === 'virtual:performance') return '\0virtual:performance'; },
        load(id) {
          if (id === '\0virtual:performance') return harness;
          if (id.replaceAll('\\', '/').endsWith('/src/lib/supabase.ts')) return `export const supabase = (${browserFixture.toString()})(); export const supabaseConfigError = null;`;
        },
        configureServer(server) {
          server.middlewares.use('/__performance', async (req, res) => {
            const html = await server.transformIndexHtml('/__performance', '<html><body><div id="root"></div><script type="module" src="/@id/__x00__virtual:performance"></script></body></html>');
            res.setHeader('content-type', 'text/html'); res.end(html);
          });
        },
      }, react(), tailwindcss()],
    });
    await server.listen();
    const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, timezoneId: 'Asia/Bangkok' });
    // Fail closed: there are no requests to Supabase or any external service.
    await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    results[label] = {};
    try {
      for (const mode of ['teacher', 'admin', 'home']) {
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.clock.install({ time: new Date('2026-09-26T16:40:00Z') });
        await page.clock.pauseAt(new Date('2026-09-26T17:40:00Z'));
        await page.goto(`${origin}/__performance?mode=${mode}`);
        await page.waitForFunction(() => window.__perf?.requests.some(r => r.table === 'gradebooks') && window.__perf.active === 0);
        await page.waitForTimeout(500);
        const initial = await page.evaluate(() => ({ count: window.__perf.requests.length, bytes: window.__perf.requests.reduce((sum, r) => sum + r.bytes, 0) }));
        await page.screenshot({ path: path.join(output, `${label}-${mode}.png`), fullPage: true });
        const text = await page.locator('body').innerText();
        await page.evaluate(() => { window.__perf.requests = []; });
        for (let i = 0; i < 65; i++) { await page.clock.runFor(1000); await page.evaluate(() => Promise.resolve()); }
        const idle = await page.evaluate(() => ({ count: window.__perf.requests.length, bytes: window.__perf.requests.reduce((sum, r) => sum + r.bytes, 0) }));
        results[label][mode] = { initial, idle65Seconds: idle, text };
        if (mode === 'admin') {
          await page.getByRole('button', { name: 'แก้ไข', exact: true }).first().click();
          await page.clock.resume();
          await page.evaluate(() => { window.__perf.requests = []; window.__perf.delay = 50; });
          const start = performance.now();
          await page.getByRole('button', { name: 'เปิดสมุด ปพ.5', exact: true }).first().click();
          await page.waitForFunction(() => window.__perf.opened);
          await page.waitForTimeout(200);
          results[label].open = await page.evaluate(() => ({ count: window.__perf.requests.length, bytes: window.__perf.requests.reduce((sum, r) => sum + r.bytes, 0), requests: window.__perf.requests }));
          results[label].open.elapsedMs = Math.round(performance.now() - start);
          await page.screenshot({ path: path.join(output, `${label}-gradebook.png`), fullPage: true });
          if (label === 'after') {
            const assignmentRequest = results[label].open.requests.find(r => r.table === 'teaching_assignments');
            assert.equal(assignmentRequest.count, 1);
            assert.ok(assignmentRequest.or.includes('teacher_id.eq.teacher'));
            await page.evaluate(() => window.__perf.setApproval('revision_requested'));
            await page.getByText('รอแก้ไข', { exact: true }).waitFor();
            results.after.approvalRealtime = 'passed';
          }
        }
        if (label === 'after' && mode === 'teacher') {
          await page.evaluate(() => { window.__perf.requests = []; for (let i = 0; i < 30; i++) window.__perf.emit('gradebooks'); });
          await page.clock.runFor(2500);
          await page.waitForFunction(() => window.__perf.active === 0);
          results.after.realtimeBurstQueries = await page.evaluate(() => window.__perf.requests.length);
          await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' }); window.__perf.requests = []; window.__perf.emit('gradebooks'); });
          await page.clock.runFor(65000);
          assert.equal(await page.evaluate(() => window.__perf.requests.length), 0);
          await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' }); document.dispatchEvent(new Event('visibilitychange')); });
          await page.clock.runFor(2500);
          await page.waitForFunction(() => window.__perf.active === 0);
          results.after.resumeQueries = await page.evaluate(() => window.__perf.requests.length);
          await page.evaluate(async () => { window.__perf.rpcMissing = true; window.__perf.requests = []; window.__perf.fallback = await window.__perf.fetchAll(); });
          results.after.fallback = await page.evaluate(() => ({ count: window.__perf.requests.length, studentCounts: window.__perf.fallback.map(r => r.student_count) }));
          assert.ok(results.after.fallback.studentCounts.every(count => count === 30));
        }
        assert.deepEqual(errors, [], `${label}/${mode} browser errors`);
        await page.close();
      }
    } finally { await context.close(); await server.close(); }
  }
  await writeFile(path.join(output, 'results.json'), JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results, (key, value) => ['text', 'requests'].includes(key) ? undefined : value, 2));
  assert.ok(results.after.teacher.idle65Seconds.count < results.before.teacher.idle65Seconds.count * 0.1);
  assert.ok(results.after.admin.idle65Seconds.count < results.before.admin.idle65Seconds.count * 0.1);
  assert.ok(results.after.open.count < results.before.open.count);
  const normalize = text => text.replace(/\d{2}:\d{2}:\d{2}/g, 'TIME');
  assert.equal(normalize(results.before.home.text), normalize(results.after.home.text), 'Dashboard numbers and labels must match');
} finally { await browser.close(); }
