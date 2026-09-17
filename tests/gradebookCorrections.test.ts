import test from 'node:test';
import assert from 'node:assert/strict';
import { allocateIntegerScores } from '../src/lib/integerScores';
import { computeGradebookStats } from '../src/lib/gradebookStats';
import { mergeIndicatorDetails, missingIndicatorCodes } from '../src/lib/indicatorDetails';
import { rowToAppData } from '../src/lib/gradebookAdapter';

test('three configured indicators with two descriptions reproduce 97 percent and synchronize to 100 without changing scores', () => {
 const d=rowToAppData({});
 d.generalInfo.gradeLevel='ม.1';
 d.students=[{id:'s',studentId:'TEST',name:'Test'}];
 d.scoreConfig={learningArea:'',subjectName:'',standard:'',selectedIndicators:[],storedScore:70,units:[{name:'u',indicators:[1,2,3].map(i=>({code:`x ${i}`,fullScore:10,passingScore:5}))}]};
 d.scores={s:{u0_i0:0,u0_i1:5,u0_i2:8,midterm:5,final:10}};
 d.attendance={hoursMap:{'05-18':'1'},records:{s:{'05-18':'/'}}};
 const keys=['1_1','1_2','1_3','1_4','2_1','2_2','3_1','4_1','4_2','5_1','5_2','6_1','6_2','7_1','7_2','7_3','8_1','8_2'];
 d.attributes={s:Object.fromEntries(keys.map(k=>['attr'+k,0]))};
 d.analytical={s:Object.fromEntries([1,2,3,4,5,6,7].map(k=>['attr'+k,0]))};
 d.indicators=[{id:'x 1',description:'custom text'},{id:'x 2',description:'two'}];
 assert.equal(Math.round(computeGradebookStats(d).completionPercent),97);
 const before=JSON.stringify(d.scores);
 d.indicators=mergeIndicatorDetails(d.indicators,['x 1','x 2','x 3'],new Map([['x 1','replacement'],['x 3','three']]));
 assert.equal(computeGradebookStats(d).completionPercent,100);
 assert.equal(d.indicators[0].description,'custom text');
 assert.equal(JSON.stringify(d.scores),before);
 d.indicators[2]={id:'unrelated',description:'not a substitute'};
 assert.deepEqual(missingIndicatorCodes(d.scoreConfig,d.indicators),['x 3']);
 const term={scores:d.scores,scoreConfig:d.scoreConfig,attributes:d.attributes,analytical:d.analytical};
 d.indicators=mergeIndicatorDetails(d.indicators,['x 3'],new Map([['x 3','three']]));
 d.primaryYear={terms:{'1':term},editableTerms:[1]};
 assert.equal(computeGradebookStats(d).completionPercent,100);
});

test('integer allocation preserves target and bounds across primary and legacy scaled maxima',()=>{
 for(const maxima of [[12,12,11,5,10],[17.5,17.5,5,10],[0,0,5,10]]) {
  for(let target=0;target<=50;target++){
   const values=allocateIntegerScores(maxima,target);
   assert(values.every((n,i)=>Number.isInteger(n)&&n>=0&&n<=maxima[i]));
   assert.equal(values.reduce((a,b)=>a+b,0),Math.min(target,maxima.reduce((n,m)=>n+Math.floor(m),0)));
  }
 }
});
