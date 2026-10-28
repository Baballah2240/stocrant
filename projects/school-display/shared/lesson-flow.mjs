import {minutes} from './schedule.mjs';

// Presentation decisions use school timestamps. Refreshes never restart a countdown.
export function createLessonFlow(){
 let previous=null,finish=null,start=null,event=null;
 return {
  reset(){previous=null;finish=null;start=null;event=null;},
  update(state,settings,now,enabled=true){
   const current=state.current,seconds=state.clock.seconds,date=state.clock.date;
   if(!enabled||settings.paused){previous=null;finish=null;start=null;event=null;return null;}
   const recent=previous&&previous.date===date&&previous.classId===settings.classId&&now>=previous.now&&now-previous.now<15000;
   if(previous&&!recent){finish=null;start=null;event=null;}
   const ended=recent&&previous.row?.type==='lesson'&&previous.row.id!==current?.id&&seconds>=minutes(previous.row.end)*60&&previous.seconds<minutes(previous.row.end)*60;
   if(ended&&settings.lessonFinishSeconds>0)finish={kind:'lesson-finish',row:previous.row,until:now+settings.lessonFinishSeconds*1000,key:`finish:${date}:${previous.row.id}`};
   const elapsed=current?seconds-minutes(current.start)*60:Infinity;
   if(current?.type==='lesson'&&settings.lessonLeadSeconds===0&&elapsed>=0&&elapsed<settings.lessonStartSeconds&&(!previous||previous.row?.id!==current.id))start={kind:'lesson-start',row:current,until:(finish?.until||now)+Math.max(0,settings.lessonStartSeconds-elapsed)*1000,key:`start:${date}:${current.id}`};
   if(current?.type==='event'&&elapsed>=0&&elapsed<settings.popupSeconds&&(current.actionImage||settings.eventImage!=='/icon.svg')&&(!previous||previous.row?.id!==current.id))event={kind:'event',row:current,until:(finish?.until||now)+(settings.popupSeconds-elapsed)*1000,key:`event:${date}:${current.id}`};
   previous={date,classId:settings.classId,row:current,seconds,now};
   if(finish&&(finish.until<=now||settings.lessonFinishSeconds===0))finish=null;
   if(start&&(start.until<=now||start.row.id!==current?.id||settings.lessonLeadSeconds!==0))start=null;
   if(event&&(event.until<=now||event.row.id!==current?.id))event=null;
   if(finish)return {...finish,remaining:Math.max(0,Math.ceil((finish.until-now)/1000))};
   if(start)return {...start,remaining:0};
   if(event)return {...event,remaining:0};
   const next=state.next,until=next?minutes(next.start)*60-seconds:Infinity;
   if(next?.type==='lesson'&&settings.lessonLeadSeconds>0&&until>0&&until<=settings.lessonLeadSeconds)return {kind:'lesson-start',row:next,remaining:until,key:`start:${date}:${next.id}`};
   return null;
  }
 };
}
