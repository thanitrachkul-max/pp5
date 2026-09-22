import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PrimaryScorePrintPage } from '../src/components/PrimaryScorePrintPage';
import { getPrimaryScorePrintRanges, getPap5PrintPageSpecs } from '../src/utils/pap5PrintLayout';
import type { AppData } from '../src/types';

const term = (value:number) => ({ scoreConfig:{semesterFullScore:50,units:[{name:'หน่วยทดสอบ',indicators:[{code:'TEST',fullScore:35,passingScore:17.5}]}]},scores:{s:{u0_i0:value,midterm:5,final:10}} });
const data={generalInfo:{gradeLevel:'ป.6/1',semester:'1'},students:[{id:'s',studentId:'TEST',name:'ทดสอบ'}],primaryYear:{terms:{'1':term(30),'2':term(25)}}} as unknown as AppData;
test('primary scores print as two term pages followed by annual summary, secondary keeps its original page',()=>{
  assert.deepEqual(getPrimaryScorePrintRanges(data).map(r=>r.id),['scores-term-1','scores-term-2','scores-summary']);
  const first=renderToStaticMarkup(React.createElement(PrimaryScorePrintPage,{data,term:1}));
  assert.ok(first.includes('ภาคเรียนที่ 1'));
  assert.ok(!first.includes('ภาคเรียนที่ 2'));
  assert.ok(first.includes('หน่วยที่ 1 หน่วยทดสอบ'));
  const summary=renderToStaticMarkup(React.createElement(PrimaryScorePrintPage,{data}));
  assert.ok(summary.includes('<td>85</td><td>4</td>'));
  assert.equal(summary.match(/หน่วยที่ 1/g)?.length,2);
  assert.ok(!summary.includes('หน่วยที่ 1 หน่วยทดสอบ'));
  const secondary={...data,generalInfo:{...data.generalInfo,gradeLevel:'ม.1/1'}};
  assert.equal(getPrimaryScorePrintRanges(secondary).length,0);
  assert.ok(getPap5PrintPageSpecs(secondary).some(p=>p.id==='scores'));
});
