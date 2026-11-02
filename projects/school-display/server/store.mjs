import initSqlJs from 'sql.js';
import {mkdirSync,existsSync,readFileSync,writeFileSync,renameSync} from 'node:fs';
import {join} from 'node:path';
import {randomBytes} from 'node:crypto';
import {defaultClasses} from './classes.mjs';
import {sampleSchedule} from '../shared/schedule.mjs';
export const defaultSettings=()=>({schoolEn:'Your school',schoolAr:'مدرستك',timezone:'Asia/Qatar',language:'both',position:'top',monitor:'primary',size:'standard',panelWidth:680,textScale:100,horizontal:'center',edgeMargin:12,classId:'default',themeAccent:'#007aff',themeMode:'light',panelTheme:'neutral',panelOpacity:72,logoImage:'/icon.svg',popupSeconds:5,notificationSeconds:4,soundStyle:'single',alertMinutes:5,autostart:false,sound:false,paused:false,hideBar:false,lessonClock:true,lessonDockSide:'right',lessonLeadSeconds:10,lessonStartSeconds:5,lessonFinishSeconds:5,lessonStartImage:'/icon.svg',lessonFinishImage:'/icon.svg',eventImage:'/icon.svg',announcementEn:'Welcome to a new day of learning.',announcementAr:'أهلاً بكم في يوم جديد من التعلم.',holidays:[],fullscreenBreaks:true,fullscreenIdle:false,breakImage:'/images/student-break.png',returnImage:'/images/student-return.png'});
export async function openStore(directory) {
  mkdirSync(directory,{recursive:true}); const file=join(directory,'school.sqlite');
  const SQL=await initSqlJs(),previous=join(directory,'school.previous.sqlite');let db,result,recovered=null;
  const read=path=>{const candidate=new SQL.Database(readFileSync(path));try{const rows=candidate.exec('SELECT value FROM state WHERE id=1');if(!rows.length)throw Error('The school database has no saved state.');const value=JSON.parse(rows[0].values[0][0]);if(!value.settings||!Array.isArray(value.draft)||!Array.isArray(value.published)||typeof value.displayToken!=='string')throw Error('The school database state is invalid.');return {db:candidate,result:rows};}catch(error){candidate.close();throw error;}};
  if(existsSync(file)){
    try{({db,result}=read(file));}catch(error){
      if(!existsSync(previous))throw Error('The school database could not be read. Restore your complete database backup.');
      ({db,result}=read(previous));const quarantined='school-corrupt-'+Date.now()+'.sqlite';renameSync(file,join(directory,quarantined));recovered={at:new Date().toISOString(),quarantined};
    }
  }else{db=new SQL.Database();db.run('CREATE TABLE state (id INTEGER PRIMARY KEY CHECK(id=1), value TEXT NOT NULL)');result=[];}
  let state=result.length?JSON.parse(result[0].values[0][0]):{admin:null,displayToken:randomBytes(32).toString('hex'),settings:defaultSettings(),draft:sampleSchedule(),published:[],revision:0,publishedAt:null,audit:[]};
  state.settings={...defaultSettings(),...state.settings};
  state.users ??= [];state.specialDays ??= [];state.publishedSpecialDays ??= [];state.devices ??= [];state.announcements ??= [];state.mobileTokens ??= [];
  for(const user of [state.admin,...state.users].filter(Boolean)){user.role ??= 'admin';user.classIds ??= [];}
  state.classes ??= defaultClasses();state.publishedClasses ??= structuredClone(state.classes);
  if(state.admin){state.admin.id ??= randomBytes(16).toString('hex');state.admin.active=true;}
  if(recovered){state.audit.unshift({at:recovered.at,action:'Database recovered from last valid save'});state.audit=state.audit.slice(0,100);}
  const save=()=>{
    if(db.exec('SELECT value FROM state WHERE id=1').length){writeFileSync(previous+'.tmp',Buffer.from(db.export()),{mode:0o600});renameSync(previous+'.tmp',previous);}
    db.run('INSERT OR REPLACE INTO state(id,value) VALUES(1,?)',[JSON.stringify(state)]);const tmp=file+'.tmp';writeFileSync(tmp,Buffer.from(db.export()),{mode:0o600});renameSync(tmp,file);
  };
  save();return {get:()=>state,save,close:()=>db.close(),file,recovered};
}
