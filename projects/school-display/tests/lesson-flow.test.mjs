import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createLessonFlow} from '../shared/lesson-flow.mjs';
import {scheduleState,validateSchedule} from '../shared/schedule.mjs';
import {defaultSettings} from '../server/store.mjs';
const rows=validateSchedule([
 {id:'math',day:0,type:'lesson',start:'07:30',end:'08:15',subjectEn:'Math',subjectAr:'',teacherEn:'Teacher',teacherAr:'',room:''},
 {id:'english',day:0,type:'lesson',start:'08:15',end:'09:00',subjectEn:'English',subjectAr:'',teacherEn:'Another teacher',teacherAr:'',room:''}
]);
function advance(flow,settings,time){const now=Date.parse('2026-10-25T'+time+'Z');return flow.update(scheduleState(rows,settings,new Date(now)),settings,now);}
test('lesson countdown follows timestamps, finish expires once and does not replay after schedule edits',()=>{
 const settings={...defaultSettings(),timezone:'UTC'},flow=createLessonFlow();
 assert.equal(advance(flow,settings,'07:29:49'),null);assert.equal(advance(flow,settings,'07:29:50').remaining,10);assert.equal(advance(flow,settings,'07:29:59').remaining,1);assert.equal(advance(flow,settings,'07:30:00'),null);
 advance(flow,settings,'08:14:59');const finish=advance(flow,settings,'08:15:00');assert.equal(finish.kind,'lesson-finish');assert.equal(finish.row.id,'math');assert.equal(advance(flow,settings,'08:15:04').kind,'lesson-finish');assert.equal(advance(flow,settings,'08:15:05'),null);
 assert.equal(advance(flow,settings,'08:15:06'),null);flow.reset();assert.equal(advance(flow,settings,'08:16:00'),null);
});
test('zero lead shows teacher photo at start after the previous finish screen, and zero durations disable it',()=>{
 const settings={...defaultSettings(),timezone:'UTC',lessonLeadSeconds:0,lessonFinishSeconds:3,lessonStartSeconds:4},flow=createLessonFlow();
 advance(flow,settings,'08:14:59');assert.equal(advance(flow,settings,'08:15:00').kind,'lesson-finish');assert.equal(advance(flow,settings,'08:15:03').kind,'lesson-start');assert.equal(advance(flow,settings,'08:15:06').row.id,'english');assert.equal(advance(flow,settings,'08:15:07'),null);
 flow.reset();settings.lessonStartSeconds=0;settings.lessonFinishSeconds=0;assert.equal(advance(flow,settings,'07:30:00'),null);
});
test('paused, overnight and missed transitions do not create old finish screens',()=>{
 const settings={...defaultSettings(),timezone:'UTC'},flow=createLessonFlow();advance(flow,settings,'08:14:00');assert.equal(advance(flow,settings,'08:16:00'),null);
 settings.paused=true;assert.equal(advance(flow,settings,'08:16:01'),null);settings.paused=false;assert.equal(advance(flow,settings,'08:16:02'),null);
 const bad={...rows[0],teacherImage:'https://external.test/photo.jpg'};assert.throws(()=>validateSchedule([bad]),/uploaded activity photo/);
  const another=createLessonFlow();advance(another,settings,'08:14:59');settings.classId='other';assert.equal(advance(another,settings,'08:15:00'),null,'Changing the assigned class must clear the previous class presentation.');
});
test('an event photo follows a lesson finish and clock corrections clear an old screen',()=>{
 const settings={...defaultSettings(),timezone:'UTC',lessonFinishSeconds:3},flow=createLessonFlow();
 const schedule=[rows[0],{...rows[1],type:'event',actionImage:'/images/student-break.png'}];
 const tick=time=>{const now=Date.parse('2026-10-25T'+time+'Z');return flow.update(scheduleState(schedule,settings,new Date(now)),settings,now);};
 tick('08:14:59');assert.equal(tick('08:15:00').kind,'lesson-finish');assert.equal(tick('08:15:03').kind,'event');assert.equal(tick('08:15:08'),null);
 flow.reset();tick('08:14:59');tick('08:15:00');assert.equal(tick('08:14:00'),null);
});
