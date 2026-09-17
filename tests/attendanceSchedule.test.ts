import test from 'node:test';
import assert from 'node:assert/strict';
import { buildShiftedAttendanceSchedule } from '../src/lib/attendanceSchedule';

test('term one ends in September with complete, chronological hours and balanced replacement weeks', () => {
  for (const year of [2025,2026,2027]) for (const hours of [1,2,4,6]) {
    const end = new Date(year,8,30);
    const result=buildShiftedAttendanceSchedule({ startDate:new Date(year,4,16), endDate:end,
      schedule:[{dayOfWeek:1,hours}], holidays:{'06-03':'holiday','07-28':'holiday','08-12':'holiday'}, totalHours:hours*20 });
    assert.equal(result.scheduleDays.reduce((n,d)=>n+d.hours,0),hours*20);
    assert.ok(result.scheduleDays.every(d=>d.date<=end && d.date.getDay()!==0 && d.date.getDay()!==6));
    assert.equal(new Set(result.scheduleDays.map(d=>d.dateKey)).size,result.scheduleDays.length);
    let next=1;
    for(const day of result.scheduleDays) {
      assert.equal(Number(result.hoursMap[day.dateKey].split('-')[0]),next);
      next+=day.hours;
    }
  }
});

test('large deficit is spread across weeks backwards instead of piling into the last month', () => {
  const result=buildShiftedAttendanceSchedule({startDate:new Date(2026,4,18),endDate:new Date(2026,8,30),schedule:[{dayOfWeek:1,hours:1}],holidays:{},totalHours:40});
  const weeks=new Map<string,number>();
  for(const day of result.scheduleDays){ const monday=new Date(day.date);monday.setDate(monday.getDate()-(monday.getDay()+6)%7);const key=monday.toISOString();weeks.set(key,(weeks.get(key)??0)+day.hours); }
  assert.equal(result.scheduleDays.reduce((n,d)=>n+d.hours,0),40);
  assert.ok(Math.max(...weeks.values())-Math.min(...weeks.values())<=1);
  assert.ok(result.scheduleDays.filter(d=>d.date.getMonth()===8).reduce((n,d)=>n+d.hours,0)<=12);
});

test('semester two supports dates across calendar years and rejects a period with no teaching day',()=>{
  const result=buildShiftedAttendanceSchedule({startDate:new Date(2026,9,16),endDate:new Date(2027,2,31),schedule:[{dayOfWeek:5,hours:2}],holidays:{'01-01':'holiday'},totalHours:40});
  assert.equal(result.scheduleDays.reduce((n,d)=>n+d.hours,0),40);
  assert.ok(result.scheduleDays.every(d=>d.date<=new Date(2027,2,31)));
  assert.throws(()=>buildShiftedAttendanceSchedule({startDate:new Date(2026,8,26),endDate:new Date(2026,8,27),schedule:[{dayOfWeek:1,hours:1}],holidays:{},totalHours:20}));
});
