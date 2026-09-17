import React, { useState } from 'react';
import type { AppData } from '../types';
import { primaryTerm, qualityAverage, qualityLabel, updatePrimaryTerm } from '../lib/primaryYear';
import { ATTRIBUTE_GROUPS, ATTRIBUTE_LABELS, PRIMARY_ANALYTICAL_LABELS } from '../data/primaryAssessment';
import { AutoFillAttributesModal } from './AutoFillAttributesModal';

interface Props { data: AppData; kind: '1-4' | '5-8' | 'analytical'; readOnly?: boolean; printMode?: boolean; offset?: number; onChange: (data: AppData) => void }
export function PrimaryAssessmentForm({ data, kind, readOnly = false, printMode = false, offset = 0, onChange }: Props) {
  const [fillTerm, setFillTerm] = useState<number | null>(null);
  const analytical = kind === 'analytical', section = analytical ? 'analytical' : 'attributes';
  const groups = analytical ? [{ name: 'การอ่าน คิดวิเคราะห์ และเขียน', fields: PRIMARY_ANALYTICAL_LABELS.map((label, i) => ({ key: `attr${i + 1}`, label: `${i + 1}. ${label}` })) }]
    : ATTRIBUTE_GROUPS.map((name, i) => ({ name: `${i + 1}. ${name}`, fields: ATTRIBUTE_LABELS.filter(label => label.startsWith(`${i + 1}.`)).map(label => ({ key: `attr${label.split(' ')[0].replace('.', '_')}`, label })) })).slice(kind === '1-4' ? 0 : 4, kind === '1-4' ? 4 : 8);
  const fields = groups.flatMap(g => g.fields);
  const editable = (term: number) => !readOnly && !printMode && !!data.primaryYear?.editableTerms.includes(term);
  const row = (id: string, term: number) => primaryTerm(data, term)[section][id] ?? {};
  const average = (id: string, term: number, keys: string[]) => qualityAverage(row(id, term), keys);
  const allKeys = analytical ? fields.map(f => f.key) : ATTRIBUTE_LABELS.map(label => `attr${label.split(' ')[0].replace('.', '_')}`);
  const overall = (id: string, term: number) => {
    if (analytical) return average(id, term, allKeys);
    const values = ATTRIBUTE_GROUPS.map((_, i) => average(id, term, allKeys.filter(k => k.startsWith(`attr${i + 1}_`))));
    return values.some(v => v === null) ? null : Math.round(values.reduce<number>((n, v) => n + (v ?? 0), 0) / 8);
  };
  const annual = (id: string) => {
    const a = overall(id, 1), b = overall(id, 2);
    return a === null || b === null ? '' : qualityLabel(Math.round((a + b) / 2));
  };
  function change(term: number, id: string, key: string, text: string) {
    if (!editable(term)) return;
    const value = text === '' ? '' : Math.min(3, Math.max(0, Math.trunc(Number(text) || 0)));
    const current = primaryTerm(data, term)[section];
    onChange(updatePrimaryTerm(data, term, { [section]: { ...current, [id]: { ...current[id], [key]: value } } }));
  }
  function fill(term: number, min: number, max: number, ids?: string[], clear = false) {
    if (!editable(term)) return;
    const next = structuredClone(primaryTerm(data, term)[section]);
    data.students.filter(s => !ids?.length || ids.includes(s.id)).forEach(s => {
      next[s.id] = { ...next[s.id] };
      fields.forEach(f => { next[s.id][f.key] = clear ? '' : min + Math.floor(Math.random() * (max - min + 1)); });
    });
    onChange(updatePrimaryTerm(data, term, { [section]: next }));
  }
  const cell = (term: number, id: string, key: string) => <td key={`${key}-${term}`} className={!editable(term) && !printMode ? '!bg-slate-200' : ''}>{printMode ? row(id, term)[key] ?? '' :
    <input aria-label={`ภาคเรียนที่ ${term} ${id} ${key}`} className="excel-input text-center disabled:bg-slate-200 disabled:text-slate-500" type="number" min={0} max={3} step={1} disabled={!editable(term)} value={row(id, term)[key] ?? ''} onChange={e => change(term, id, key, e.target.value)} />}</td>;
  return <div className={`primary-year-form ${printMode ? 'primary-year-print' : ''}`}>
    <h2 className="mb-4 text-center text-lg font-bold">{analytical ? 'ผลการประเมินการอ่าน คิดวิเคราะห์ และเขียน' : 'แบบบันทึกผลการประเมินคุณลักษณะอันพึงประสงค์'} ชั้น {data.generalInfo.gradeLevel} ปีการศึกษา {data.generalInfo.academicYear}</h2>
    {analytical && <div className="mb-4 rounded border bg-slate-50 p-3"><strong>ประเมินตัวชี้วัดชั้น ป.1-6</strong>{PRIMARY_ANALYTICAL_LABELS.map((label, i) => <div key={label}>{i + 1}. {label}</div>)}</div>}
    <div className="overflow-x-auto"><table className="excel-table whitespace-nowrap"><thead>
      <tr><th rowSpan={3}>เลขที่</th><th rowSpan={3}>เลขประจำตัว</th><th rowSpan={3}>เลขประจำตัวประชาชน</th><th rowSpan={3}>ชื่อ - สกุล</th>
        {analytical ? [1, 2].map(term => <th key={term} colSpan={8}>ภาคเรียนที่ {term}</th>) : groups.map(g => <th key={g.name} colSpan={g.fields.length * 2 + 3}>{g.name}</th>)}
        {!analytical && kind === '5-8' && <th colSpan={2}>สรุประดับคุณภาพ</th>}{(analytical || kind === '5-8') && <th rowSpan={3}>ผลการประเมินปลายปี<br/>ดีเยี่ยม ดี ผ่าน ไม่ผ่าน</th>}</tr>
      <tr>{analytical ? [1, 2].map(term => <React.Fragment key={term}>{fields.map((f, i) => <th key={f.key}>{i + 1}</th>)}<th>สรุปผลการประเมิน</th></React.Fragment>) : groups.map(g => <React.Fragment key={g.name}>{g.fields.map(f => <th key={f.key} colSpan={2}><span className="writing-vertical inline-block">{f.label}</span></th>)}<th colSpan={2}><span className="writing-vertical inline-block">ผลการประเมิน</span></th><th rowSpan={2}><span className="writing-vertical inline-block">รายคุณลักษณะ (ส)</span></th></React.Fragment>)}
        {!analytical && kind === '5-8' && [1, 2].map(t => <th key={t} rowSpan={2}><span className="writing-vertical inline-block">รวมทุกคุณลักษณะภาคเรียนที่ {t}</span></th>)}</tr>
      <tr>{analytical ? Array.from({ length: 16 }, (_, i) => <th key={i}>3</th>) : groups.map(g => <React.Fragment key={g.name}>{[...g.fields, { key: 'summary' }].map(f => <React.Fragment key={f.key}><th>1</th><th>2</th></React.Fragment>)}</React.Fragment>)}</tr>
    </thead><tbody>{data.students.map((student, i) => <tr key={student.id}><td>{offset + i + 1}</td><td>{student.studentId}</td><td>{student.citizenId}</td><td className="!text-left">{student.name}</td>
      {analytical ? [1, 2].map(term => <React.Fragment key={term}>{fields.map(f => cell(term, student.id, f.key))}<td className="!bg-orange-50">{overall(student.id, term) ?? ''}</td></React.Fragment>) : groups.map(g => {
        const a = average(student.id, 1, g.fields.map(f => f.key)), b = average(student.id, 2, g.fields.map(f => f.key));
        return <React.Fragment key={g.name}>{g.fields.flatMap(f => [1, 2].map(t => cell(t, student.id, f.key)))}<td className="!bg-orange-50">{a ?? ''}</td><td className="!bg-orange-50">{b ?? ''}</td><td className="!bg-orange-50">{a === null || b === null ? '' : Math.round((a + b) / 2)}</td></React.Fragment>;
      })}{!analytical && kind === '5-8' && [1, 2].map(t => <td key={t}>{overall(student.id, t) ?? ''}</td>)}{(analytical || kind === '5-8') && <td className="font-bold">{annual(student.id)}</td>}</tr>)}</tbody></table></div>
    {!printMode && <div className="mt-5 flex flex-wrap justify-center gap-4">{[1, 2].map(term => <div key={term} className="flex items-center gap-2 rounded-lg border p-3"><strong>ภาคเรียนที่ {term}</strong>
      <button disabled={!editable(term)} className="rounded bg-emerald-600 px-3 py-2 text-white disabled:bg-slate-300" onClick={() => setFillTerm(term)}>ระบบช่วยลงคะแนนอัตโนมัติ</button>
      <button disabled={!editable(term)} className="rounded bg-red-50 px-3 py-2 text-red-600 disabled:text-slate-400" onClick={() => { if (window.confirm(`ล้างคะแนนส่วนนี้เฉพาะภาคเรียนที่ ${term}?`)) fill(term, 0, 0, undefined, true); }}>ล้างคะแนน</button></div>)}</div>}
    {fillTerm !== null && <AutoFillAttributesModal isOpen students={data.students} onClose={() => setFillTerm(null)} onFill={(min, max, ids) => fill(fillTerm, min, max, ids)} />}
  </div>;
}
