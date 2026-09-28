import test from 'node:test';
import assert from 'node:assert/strict';
import { createStudentActivityPdfFile } from '../src/utils/studentActivityPdf.ts';
import { buildActivityGeneralInfo, emptyActivityAssessments } from '../src/lib/studentActivities.ts';

const request = { id: 'record', approvalStatus: 'approved' as const, data: {
  generalInfo: buildActivityGeneralInfo({ schoolName: 'โรงเรียนทดสอบ', classroomName: 'ม.1/1', classLevelCode: 'ม.1', yearBe: 2569, homeroomTeachers: [] }),
  students: [], attendance: {}, assessments: emptyActivityAssessments(),
} };
test('activity PDF creation returns a named blob for ZIP without starting a browser download', async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async (_input, options) => {
      assert.equal(JSON.parse(String(options?.body)).approvalStatus, 'approved');
      return new Response('%PDF-1.7\nfixture', { headers: { 'content-type': 'application/pdf', 'content-disposition': "attachment; filename*=UTF-8''" + encodeURIComponent('กิจกรรม ม.1-1.pdf') } });
    };
    const file = await createStudentActivityPdfFile(request);
    assert.equal(file.fileName, 'กิจกรรม ม.1-1.pdf');
    assert.equal(file.blob.type, 'application/pdf');
    assert.match(await file.blob.text(), /^%PDF/);
    globalThis.fetch = async () => new Response(JSON.stringify({ error: 'สร้างเอกสารไม่สำเร็จ' }), { status: 500 });
    await assert.rejects(createStudentActivityPdfFile(request), /สร้างเอกสารไม่สำเร็จ/);
    globalThis.fetch = async () => new Response('<html>Error</html>', { headers: { 'content-type': 'text/html' } });
    await assert.rejects(createStudentActivityPdfFile(request), /ไม่ใช่ application\/pdf/);
  } finally { globalThis.fetch = original; }
});
