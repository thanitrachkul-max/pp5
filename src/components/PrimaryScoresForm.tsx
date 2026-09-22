import { allocateIntegerScores } from '../lib/integerScores';
import React, { useState, useEffect } from 'react';
import type { AppData, ScoreConfig } from '../types';
import { primaryExamScale, primaryAnnualComplete, primaryAnnualTotal, primaryScoreScale, primaryTerm, primaryTermTotal, scoreGrade, updatePrimaryTerm } from '../lib/primaryYear';
import { ScoreConfigModal } from './ScoreConfigModal';
import { AutoFillModal } from './AutoFillModal';

function TermCells({ locked, children }: { key?: number; locked: boolean; children: React.ReactNode }) {
  const shade = (nodes: React.ReactNode): React.ReactNode => React.Children.map(nodes, node => {
    if (!React.isValidElement<{ children?: React.ReactNode; style?: React.CSSProperties }>(node)) return node;
    if (node.type === React.Fragment) return React.cloneElement(node, {}, shade(node.props.children));
    return React.cloneElement(node, { style: locked ? { ...node.props.style, backgroundColor: '#e2e8f0' } : node.props.style });
  });
  return <>{shade(children)}</>;
}
interface Props { data: AppData; readOnly?: boolean; printMode?: boolean; offset?: number; currentGradebookId?: string; onChange: (data: AppData) => void }
export function PrimaryScoresForm({ data, readOnly = false, printMode = false, offset = 0, currentGradebookId, onChange }: Props) {
  const [configTerm, setConfigTerm] = useState<number | null>(null);
  const [fillTerm, setFillTerm] = useState<number | null>(null);
  const terms = [1, 2].map(number => {
    const value = primaryTerm(data, number), scale = primaryScoreScale(value.scoreConfig);
    return { number, value, scale, units: value.scoreConfig?.units ?? [], editable: !readOnly && !printMode && !!data.primaryYear?.editableTerms.includes(number) };
  });
  const activeTerm = terms.find(t => t.editable && t.number === Number(data.generalInfo.semester)) ?? terms.find(t => t.editable);
  useEffect(() => {
    if (activeTerm && !activeTerm.value.scoreConfig?.units.length) setConfigTerm(activeTerm.number);
  }, [activeTerm?.number, !!activeTerm?.value.scoreConfig?.units.length]);
  const layout = (t: typeof terms[number]) => Array.from({ length: Math.max(3, t.units.length) }, (_, ui) => ({
    name: t.units[ui]?.name ?? '',
    indicators: Array.from({ length: Math.max(4, t.units[ui]?.indicators.length ?? 0) }, (_, ii) => t.units[ui]?.indicators[ii] ?? null),
  }));
  function change(number: number, studentId: string, key: string, text: string, max: number) {
    const term = terms[number - 1];
    if (!term.editable) return;
    const value = text === '' ? '' : Math.min(Math.floor(max), Math.max(0, Math.round(Number(text) || 0))) / (key === "midterm" || key === "final" ? primaryExamScale(term.value.scoreConfig) : term.scale);
    onChange(updatePrimaryTerm(data, number, { scores: { ...term.value.scores, [studentId]: { ...term.value.scores[studentId], [key]: value } } }));
  }
  function saveConfig(config: ScoreConfig) {
    if (configTerm === null) return;
    const term = terms[configTerm - 1];
    const scores = Object.fromEntries(Object.entries(term.value.scores).map(([id, row]) => [id,
      Object.fromEntries(Object.entries(row).map(([k, v]) => [k, v === '' || v == null ? v : Number(v) * (k === "midterm" || k === "final" ? primaryExamScale(term.value.scoreConfig) : term.scale)]))]));
    onChange(updatePrimaryTerm(data, configTerm, { scoreConfig: config, scores }));
  }
  function fill(minGrade: number, maxGrade: number, ids?: string[]) {
    if (!fillTerm) return;
    const term = terms[fillTerm - 1];
    if (!term.editable || !term.value.scoreConfig) return;
    const gradeMin = (g: number) => g === 0 ? 0 : g === 4 ? 80 : 50 + (g - 1) * 10;
    const min = Math.ceil(gradeMin(minGrade) / 2), max = Math.floor((maxGrade === 4 ? 100 : maxGrade === 0 ? 49 : gradeMin(maxGrade) + 4) / 2);
    const components = term.units.flatMap((u, ui) => u.indicators.map((ind, ii) => ({ key: `u${ui}_i${ii}`, max: ind.fullScore * term.scale, scale: term.scale })));
    components.push({ key: 'midterm', max: 5, scale: primaryExamScale(term.value.scoreConfig) }, { key: 'final', max: 10, scale: primaryExamScale(term.value.scoreConfig) });
    const scores = structuredClone(term.value.scores);
    data.students.filter(s => !ids?.length || ids.includes(s.id)).forEach(s => {
      const values = allocateIntegerScores(components.map(c => c.max), min + Math.floor(Math.random() * (max-min+1)));
      scores[s.id] = { ...scores[s.id], ...Object.fromEntries(components.map((c,i) => [c.key, values[i] / c.scale])) };
    });
    onChange(updatePrimaryTerm(data, fillTerm, { scores }));
  }
  const input = (t: typeof terms[number], id: string, key: string, max: number) => {
    const raw = t.value.scores[id]?.[key], value = raw === '' || raw == null ? '' : Math.round(Number(raw) * (key === "midterm" || key === "final" ? primaryExamScale(t.value.scoreConfig) : t.scale) * 100) / 100;
    return printMode || !t.value.scoreConfig?.units.length ? value : <input aria-label={`ภาคเรียนที่ ${t.number} ${id} ${key}`} type="number" step="1" min={0} max={max} value={value}
      disabled={!t.editable || !t.value.scoreConfig} className="excel-input text-center !bg-transparent disabled:text-slate-500"
      onChange={e => change(t.number, id, key, e.target.value, max)} />;
  };
  return <div className={`primary-year-form ${printMode ? 'primary-year-print' : ''}`}>
    <h2 className="mb-4 text-center text-lg font-bold">บันทึกคะแนนวัดและประเมินผลการเรียนรู้ ชั้น {data.generalInfo.gradeLevel} ปีการศึกษา {data.generalInfo.academicYear}</h2>
    {!printMode && <p className="mb-3 text-sm text-slate-600">คะแนนภาคเรียนละ 50 คะแนน รวมทั้งปี 100 คะแนน ช่องสีเทาปิดการแก้ไขตามการตั้งค่าระบบ</p>}
    <div className="overflow-x-auto"><table className="excel-table primary-score-table whitespace-nowrap">
      <thead><tr>{['เลขที่','เลขประจำตัว','เลขประจำตัวประชาชน','ชื่อ - สกุล'].map(label => <th key={label} rowSpan={5}>{label}</th>)}
        {terms.map(t => <th style={!t.editable && !printMode ? {backgroundColor:"#e2e8f0"} : undefined} key={t.number} colSpan={1 + layout(t).reduce((n,u) => n+u.indicators.length+1,0)+4}>บันทึกคะแนนวัดและประเมินผลการเรียนรู้ ภาคเรียนที่ {t.number}</th>)}<th colSpan={5}>ระดับผลการเรียน</th></tr>
        <tr>{terms.map(t => <TermCells key={t.number} locked={!t.editable && !printMode}><th>หน่วยการเรียนรู้ที่</th>{layout(t).map((u,ui) => <React.Fragment key={ui}><th colSpan={u.indicators.length}>{u.name ? `${ui+1}. ${u.name}` : ''}</th><th rowSpan={2}><span className="writing-vertical inline-block">รวม</span></th></React.Fragment>)}{['รวมคะแนนเก็บ','คะแนนสอบกลางภาค','คะแนนสอบปลายภาค','รวมคะแนนภาคเรียน'].map(label => <th key={label} rowSpan={2}><span className="writing-vertical inline-block">{label}</span></th>)}</TermCells>)}<th rowSpan={2}><span className="writing-vertical inline-block">รวมคะแนนทั้งปีการศึกษา</span></th>{['ปกติ','แก้ไข','ร้อยละ','ผลการเรียนรู้'].map(label => <th key={label} rowSpan={4}>{label}</th>)}</tr>
        <tr>{terms.map(t => <TermCells key={t.number} locked={!t.editable && !printMode}><th>รหัสตัวชี้วัด/<br/>ผลการเรียนรู้</th>{layout(t).flatMap((u,ui) => u.indicators.map((ind,ii) => <th key={`${ui}-${ii}`}><span className="writing-vertical inline-block">{ind?.code ?? ''}</span></th>))}</TermCells>)}</tr>
        {[false,true].map(passing => <tr key={String(passing)}>{terms.map(t => <TermCells key={t.number} locked={!t.editable && !printMode}><th>{passing ? 'คะแนนตามเกณฑ์' : 'คะแนนเต็ม'}</th>{layout(t).map((u,ui) => <React.Fragment key={ui}>{u.indicators.map((ind,ii) => <th key={ii}>{ind ? Math.round((passing ? ind.passingScore : ind.fullScore)*t.scale*100)/100 : ''}</th>)}<th>{t.units[ui] ? Math.round(u.indicators.reduce((n,ind) => n+(ind ? (passing ? ind.passingScore : ind.fullScore)*t.scale : 0),0)*100)/100 : ''}</th></React.Fragment>)}{(passing ? [17.5,2.5,5,25] : [35,5,10,50]).map((n,i) => <th key={i}>{n}</th>)}</TermCells>)}<th>{passing ? 50 : 100}</th></tr>)}
      </thead><tbody>{data.students.map((student,i) => {
        const total=primaryAnnualTotal(data,student.id), complete=primaryAnnualComplete(data,student.id);
        return <tr key={student.id}><td>{offset+i+1}</td><td>{student.studentId}</td><td>{student.citizenId}</td><td className="!text-left">{student.name}</td>
          {terms.map(t => {
            const subtotal=primaryTermTotal(t.value,student.id);
            const sumUnit=(ui:number) => t.units[ui]?.indicators.reduce((n,_,ii) => n+(Number(t.value.scores[student.id]?.[`u${ui}_i${ii}`])||0)*t.scale,0) ?? 0;
            return <TermCells key={t.number} locked={!t.editable && !printMode}><td />{layout(t).map((u,ui) => <React.Fragment key={ui}>{u.indicators.map((ind,ii) => <td key={ii} >{ind ? input(t,student.id,`u${ui}_i${ii}`,ind.fullScore*t.scale) : ''}</td>)}<td className="bg-slate-50">{t.units[ui] && t.units[ui].indicators.some((_,ii) => { const v=t.value.scores[student.id]?.[`u${ui}_i${ii}`];return v!=='' && v!=null; }) ? Math.round(sumUnit(ui)*100)/100 : ''}</td></React.Fragment>)}
              <td>{subtotal===null ? '' : Math.round(t.units.reduce((n,_,ui)=>n+sumUnit(ui),0)*100)/100}</td><td>{input(t,student.id,'midterm',5)}</td><td>{input(t,student.id,'final',10)}</td><td className="bg-blue-50 font-bold">{subtotal ?? ''}</td></TermCells>;
          })}<td className="bg-blue-50 font-bold">{total ?? ''}</td><td>{complete && total!==null ? scoreGrade(total) : ''}</td><td>{complete && total!==null && total<50 ? '0' : ''}</td><td>{total ?? ''}</td><td>{complete && total!==null ? total>=50 ? 'ผ' : 'มผ' : ''}</td></tr>;
      })}</tbody></table></div>
    {!printMode && <div className="mt-8 flex flex-wrap justify-center gap-4 border-t pt-6">
      <button disabled={!activeTerm} className="rounded bg-blue-600 px-5 py-2 text-white disabled:bg-slate-300" onClick={() => activeTerm && setConfigTerm(activeTerm.number)}>ตั้งค่าตัวชี้วัด</button>
      <button disabled={!activeTerm?.value.scoreConfig} className="rounded bg-emerald-600 px-5 py-2 text-white disabled:bg-slate-300" onClick={() => activeTerm && setFillTerm(activeTerm.number)}>ระบบช่วยบันทึกคะแนน</button>
      <button disabled={!activeTerm} className="rounded bg-red-500 px-5 py-2 text-white disabled:bg-slate-300" onClick={() => { if (activeTerm && window.confirm(`ล้างคะแนนและการตั้งค่าเฉพาะภาคเรียนที่ ${activeTerm.number}?`)) onChange(updatePrimaryTerm(data,activeTerm.number,{scores:{},scoreConfig:undefined})); }}>ล้างข้อมูล</button>
    </div>}
    {configTerm !== null && <ScoreConfigModal isOpen onClose={() => setConfigTerm(null)} generalInfo={data.generalInfo} initialConfig={terms[configTerm - 1].value.scoreConfig} semesterFullScore={50} currentGradebookId={currentGradebookId} onSave={saveConfig} />}
    {fillTerm !== null && <AutoFillModal isOpen onClose={() => setFillTerm(null)} scoreConfig={terms[fillTerm - 1].value.scoreConfig} students={data.students} onFill={fill} />}
  </div>;
}
