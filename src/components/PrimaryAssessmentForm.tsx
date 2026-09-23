import React, { useState } from 'react';
import type { AppData } from '../types';
import { primaryTerm, qualityAverage, qualityLabel, updatePrimaryTerm } from '../lib/primaryYear';
import { ATTRIBUTE_GROUPS, ATTRIBUTE_LABELS, PRIMARY_ANALYTICAL_LABELS } from '../data/primaryAssessment';
import { AutoFillAttributesModal } from './AutoFillAttributesModal';
import { AssessmentScoreCell } from './AssessmentScoreCell';

interface Props { data: AppData; kind: '1-4' | '5-8' | 'analytical'; readOnly?: boolean; printMode?: boolean; offset?: number; onChange: (data: AppData) => void }
export function PrimaryAssessmentForm({ data, kind, readOnly = false, printMode = false, offset = 0, onChange }: Props) {
  const [fillTerm, setFillTerm] = useState<number | null>(null);
  const analytical = kind === 'analytical', section = analytical ? 'analytical' : 'attributes';
  const groups = analytical ? [{ name: 'การอ่าน คิดวิเคราะห์ และเขียน', fields: PRIMARY_ANALYTICAL_LABELS.map((label, i) => ({ key: `attr${i + 1}`, label: `${i + 1}. ${label}` })) }]
    : ATTRIBUTE_GROUPS.map((name, i) => ({ name: `${i + 1}. ${name}`, fields: ATTRIBUTE_LABELS.filter(label => label.startsWith(`${i + 1}.`)).map(label => ({ key: `attr${label.split(' ')[0].replace('.', '_')}`, label })) })).slice(kind === '1-4' ? 0 : 4, kind === '1-4' ? 4 : 8);
  const fields = groups.flatMap(g => g.fields);
  const editable = (term: number) => !readOnly && !printMode && !!data.primaryYear?.editableTerms.includes(term);
  const activeTerm = [1,2].find(t => editable(t) && t === Number(data.generalInfo.semester)) ?? [1,2].find(editable);
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
  function change(term: number, id: string, key: string, value: number | '') {
    if (!editable(term)) return;
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
  const cell = (term: number, id: string, key: string) => printMode
    ? <td key={`${key}-${term}`}>{row(id, term)[key] ?? ''}</td>
    : <AssessmentScoreCell key={`${key}-${term}`} ariaLabel={`ภาคเรียนที่ ${term} ${id} ${key}`} className={!editable(term) ? '!bg-slate-200' : ''} disabled={!editable(term)} value={row(id, term)[key]} onChange={value => change(term, id, key, value)} />;
  return <div className={`primary-year-form ${printMode ? 'primary-year-print' : ''}`}>
    <h2 className="mb-4 text-center text-lg font-bold">{analytical ? 'ผลการประเมินการอ่าน คิดวิเคราะห์ และเขียน' : 'แบบบันทึกผลการประเมินคุณลักษณะอันพึงประสงค์'} ชั้น {data.generalInfo.gradeLevel} ปีการศึกษา {data.generalInfo.academicYear}</h2>
    <div className="overflow-x-auto"><table className="excel-table whitespace-nowrap">
      {printMode && <colgroup>
        <col className="primary-year-col-no" />
        <col className="primary-year-col-code" />
        <col className="primary-year-col-citizen" />
        <col className="primary-year-col-name" />
        {analytical
          ? <>
              {Array.from({ length: 14 }, (_, i) => <col key={`analytical-score-${i}`} className="primary-year-analytical-score-col" />)}
              <col className="primary-year-analytical-summary-col" />
              <col className="primary-year-analytical-summary-col" />
              <col className="primary-year-col-final primary-year-analytical-final-col" />
            </>
          : <>{groups.flatMap(group => Array.from({ length: group.fields.length * 2 + 3 }, (_, i) => <col key={`${group.name}-${i}`} />))}{kind === '5-8' && <><col /><col /><col className="primary-year-col-final primary-year-attribute-final-col" /></>}</>}
      </colgroup>}
      <thead>
      <tr>{["เลขที่","เลขประจำตัว","เลขประจำตัวประชาชน","ชื่อ - สกุล"].map((label, index) => <th key={label} className={['primary-year-col-no', 'primary-year-col-code', 'primary-year-col-citizen', 'primary-year-col-name'][index]} rowSpan={analytical ? 11 : 3}>{label}</th>)}
        {analytical ? <th colSpan={17}>ประเมินตัวชี้วัดชั้น ป.1-6</th> : groups.map(g => <th key={g.name} colSpan={g.fields.length * 2 + 3}>{g.name}</th>)}
        {!analytical && kind === '5-8' && <th colSpan={2}>สรุประดับคุณภาพ</th>}{(!analytical && kind === '5-8') && <th className="primary-year-final-header" rowSpan={3}>ผลการประเมินปลายปี<br/>ดีเยี่ยม ดี ผ่าน ไม่ผ่าน</th>}</tr>
      {analytical && PRIMARY_ANALYTICAL_LABELS.map((label,i) => <tr key={label}><th colSpan={17} className="!text-left font-normal">{i+1}. {label}</th></tr>)}
      <tr>{analytical ? <>{fields.map((f,i) => <th key={f.key} colSpan={2}>{i+1}</th>)}<th colSpan={2}>สรุปผลการประเมิน</th><th className="primary-year-final-header" rowSpan={3}>สรุปผลการประเมินปลายปี<br/>(ดีเยี่ยม ดี ผ่าน ไม่ผ่าน)</th></> : groups.map(g => <React.Fragment key={g.name}>{g.fields.map(f => <th key={f.key} colSpan={2}><span className={`writing-vertical inline-block${f.label.trim().startsWith('4.2') ? ' attribute-item-4-2' : ''}`}>{f.label}</span></th>)}<th colSpan={2}><span className="writing-vertical inline-block">ผลการประเมิน</span></th><th rowSpan={2}><span className="writing-vertical inline-block">รายคุณลักษณะ (ส)</span></th></React.Fragment>)}
        {!analytical && kind === '5-8' && [1, 2].map(t => <th key={t} rowSpan={2}><span className="writing-vertical inline-block">รวมทุกคุณลักษณะภาคเรียนที่ {t}</span></th>)}</tr>
      <tr>{analytical ? Array.from({ length: 8 }, (_, i) => <th key={i} colSpan={2}>3</th>) : groups.map(g => <React.Fragment key={g.name}>{[...g.fields, { key: 'summary' }].map(f => <React.Fragment key={f.key}><th>1</th><th>2</th></React.Fragment>)}</React.Fragment>)}</tr>
      {analytical && <tr>{Array.from({length:8},(_,i) => <React.Fragment key={i}><th>1</th><th>2</th></React.Fragment>)}</tr>}
    </thead><tbody>{data.students.map((student, i) => <tr key={student.id}><td>{offset + i + 1}</td><td>{student.studentId}</td><td>{student.citizenId}</td><td className="primary-year-name-cell !text-left">{student.name}</td>
      {analytical ? <>{fields.flatMap(f => [1,2].map(term => cell(term,student.id,f.key)))}{[1,2].map(term => <td key={term} className="!bg-orange-50">{overall(student.id,term) ?? ''}</td>)}</> : groups.map(g => {
        const a = average(student.id, 1, g.fields.map(f => f.key)), b = average(student.id, 2, g.fields.map(f => f.key));
        return <React.Fragment key={g.name}>{g.fields.flatMap(f => [1, 2].map(t => cell(t, student.id, f.key)))}<td className="!bg-orange-50">{a ?? ''}</td><td className="!bg-orange-50">{b ?? ''}</td><td className="!bg-orange-50">{a === null || b === null ? '' : Math.round((a + b) / 2)}</td></React.Fragment>;
      })}{!analytical && kind === '5-8' && [1, 2].map(t => <td key={t}>{overall(student.id, t) ?? ''}</td>)}{(analytical || kind === '5-8') && <td className="font-bold">{annual(student.id)}</td>}</tr>)}</tbody></table></div>
    {!printMode && <div className="mt-8 flex flex-wrap justify-center gap-4 border-t pt-6">
      <button disabled={!activeTerm} className="rounded bg-emerald-600 px-6 py-2 text-white disabled:bg-slate-300" onClick={() => activeTerm && setFillTerm(activeTerm)}>ระบบช่วยลงคะแนนอัตโนมัติ</button>
      <button disabled={!activeTerm} className="rounded bg-red-50 px-6 py-2 text-red-600 disabled:text-slate-400" onClick={() => { if (activeTerm && window.confirm(`ล้างคะแนนส่วนนี้เฉพาะภาคเรียนที่ ${activeTerm}?`)) fill(activeTerm,0,0,undefined,true); }}>ล้างคะแนน</button></div>}
    {fillTerm !== null && <AutoFillAttributesModal isOpen students={data.students} onClose={() => setFillTerm(null)} onFill={(min, max, ids) => fill(fillTerm, min, max, ids)} />}
  </div>;
}
