import React from 'react';
import type { AppData } from '../types';
import { hasScoreValue, primaryAnnualComplete, primaryAnnualTotal, primaryExamScale, primaryScoreScale, primaryTerm, primaryTermTotal, scoreGrade } from '../lib/primaryYear';

const rounded = (n: number) => Math.round(n * 100) / 100;
export function PrimaryScorePrintPage({ data, term, offset = 0 }: { data: AppData; term?: 1 | 2; offset?: number }) {
  const terms = (term ? [term] : [1, 2]).map(number => {
    const value = primaryTerm(data, number);
    const units = value.scoreConfig?.units ?? [];
    return { number, value, scale: primaryScoreScale(value.scoreConfig), units,
      layout: Array.from({ length: Math.max(3, units.length) }, (_, i) => units[i] ?? null) };
  });
  const score = (t: typeof terms[number], id: string, key: string) => {
    const raw = t.value.scores[id]?.[key];
    return hasScoreValue(raw) ? rounded(Number(raw) * (key === 'midterm' || key === 'final' ? primaryExamScale(t.value.scoreConfig) : t.scale)) : '';
  };
  const unitSum = (t: typeof terms[number], id: string, ui: number) => {
    const values = t.units[ui]?.indicators.map((_, ii) => score(t, id, `u${ui}_i${ii}`)) ?? [];
    return values.some(v => v !== '') ? rounded(values.reduce<number>((sum,v) => sum + Number(v), 0)) : '';
  };
  const t = terms[0];
  return <div className="primary-score-print-content">
    <h2>{term ? `บันทึกคะแนนตามตัวชี้วัด ภาคเรียนที่ ${term}` : 'สรุปคะแนนหน่วยการเรียนรู้และระดับผลการเรียนประจำปี'}</h2>
    <p>รายวิชา {data.generalInfo.subjectName} ชั้น {data.generalInfo.gradeLevel} ปีการศึกษา {data.generalInfo.academicYear}</p>
    <table className="primary-print-score-table">
      <colgroup><col style={{width:'4%'}}/><col style={{width:'7%'}}/><col style={{width:'12%'}}/><col style={{width:'20%'}}/></colgroup>
      <thead>
        <tr>{['เลขที่','เลขประจำตัว','เลขประจำตัวประชาชน','ชื่อ - สกุล'].map(label => <th key={label} rowSpan={2}>{label}</th>)}
          {term ? t.layout.map((u,ui) => <th key={ui} colSpan={Math.max(4,u?.indicators.length ?? 0)+1}>หน่วยที่ {ui+1}{u?.name ? ` ${u.name}` : ''}</th>) : <>{terms.map(v => <th key={v.number} colSpan={v.layout.length+4}>ภาคเรียนที่ {v.number}</th>)}<th colSpan={4}>ผลการเรียนประจำปี</th></>}
        </tr>
        <tr>{term ? t.layout.map((u,ui) => <React.Fragment key={ui}>{Array.from({length:Math.max(4,u?.indicators.length ?? 0)},(_,ii) => <th key={ii} className="primary-print-vertical"><span>{u?.indicators[ii]?.code ?? ''}</span></th>)}<th className="primary-print-vertical"><span>รวมหน่วยที่ {ui+1}</span></th></React.Fragment>) : <>{terms.map(v => <React.Fragment key={v.number}>{v.layout.map((u,ui) => <th key={ui} className="primary-print-vertical"><span>หน่วยที่ {ui+1}{u?.name ? ` ${u.name}` : ''}</span></th>)}{['รวมคะแนนเก็บ','กลางภาค','ปลายภาค','รวมภาคเรียน'].map(s => <th key={s} className="primary-print-vertical"><span>{s}</span></th>)}</React.Fragment>)}{['รวมทั้งปีการศึกษา','ระดับผลการเรียน','แก้ไข','ผลการเรียนรู้'].map(s => <th key={s} className="primary-print-vertical"><span>{s}</span></th>)}</>}</tr>
        <tr><th colSpan={4}>คะแนนเต็ม</th>{term ? t.layout.map((u,ui) => <React.Fragment key={ui}>{Array.from({length:Math.max(4,u?.indicators.length ?? 0)},(_,ii) => <th key={ii}>{u?.indicators[ii] ? rounded(u.indicators[ii].fullScore*t.scale) : ''}</th>)}<th>{u ? rounded(u.indicators.reduce((n,i)=>n+i.fullScore*t.scale,0)) : ''}</th></React.Fragment>) : <>{terms.map(v => <React.Fragment key={v.number}>{v.layout.map((u,ui) => <th key={ui}>{u ? rounded(u.indicators.reduce((n,i)=>n+i.fullScore*v.scale,0)) : ''}</th>)}{[35,5,10,50].map((n,i)=><th key={i}>{n}</th>)}</React.Fragment>)}<th>100</th><th>4</th><th/><th>ผ / มผ</th></>}</tr>
        <tr><th colSpan={4}>คะแนนตามเกณฑ์</th>{term ? t.layout.map((u,ui) => <React.Fragment key={ui}>{Array.from({length:Math.max(4,u?.indicators.length ?? 0)},(_,ii) => <th key={ii}>{u?.indicators[ii] ? rounded(u.indicators[ii].passingScore*t.scale) : ''}</th>)}<th>{u ? rounded(u.indicators.reduce((n,i)=>n+i.passingScore*t.scale,0)) : ''}</th></React.Fragment>) : <>{terms.map(v => <React.Fragment key={v.number}>{v.layout.map((u,ui) => <th key={ui}>{u ? rounded(u.indicators.reduce((n,i)=>n+i.passingScore*v.scale,0)) : ''}</th>)}{[17.5,2.5,5,25].map((n,i)=><th key={i}>{n}</th>)}</React.Fragment>)}<th>50</th><th/><th/><th/></>}</tr>
      </thead>
      <tbody>{data.students.map((student,i) => {
        const total=primaryAnnualTotal(data,student.id), complete=primaryAnnualComplete(data,student.id);
        return <tr key={student.id}><td>{offset+i+1}</td><td>{student.studentId}</td><td>{student.citizenId}</td><td className="primary-print-name">{student.name}</td>
          {term ? t.layout.map((u,ui)=><React.Fragment key={ui}>{Array.from({length:Math.max(4,u?.indicators.length ?? 0)},(_,ii)=><td key={ii}>{u?.indicators[ii] ? score(t,student.id,`u${ui}_i${ii}`) : ''}</td>)}<td>{unitSum(t,student.id,ui)}</td></React.Fragment>) : <>{terms.map(v=><React.Fragment key={v.number}>{v.layout.map((_,ui)=><td key={ui}>{unitSum(v,student.id,ui)}</td>)}<td>{v.units.some((_,ui)=>unitSum(v,student.id,ui)!=='') ? rounded(v.units.reduce((n,_,ui)=>n+Number(unitSum(v,student.id,ui)),0)) : ''}</td><td>{score(v,student.id,'midterm')}</td><td>{score(v,student.id,'final')}</td><td>{primaryTermTotal(v.value,student.id) ?? ''}</td></React.Fragment>)}<td>{total ?? ''}</td><td>{complete && total!==null ? scoreGrade(total) : ''}</td><td>{complete && total!==null && total<50 ? '0' : ''}</td><td>{complete && total!==null ? total>=50 ? 'ผ' : 'มผ' : ''}</td></>}
        </tr>;
      })}</tbody>
    </table>
  </div>;
}
