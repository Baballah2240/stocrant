import initSqlJs from 'sql.js';
import {mkdirSync,existsSync,readFileSync,writeFileSync,renameSync} from 'node:fs';
import {join} from 'node:path';
import {randomBytes} from 'node:crypto';
import {sampleSchedule} from '../shared/schedule.mjs';
export const defaultSettings=()=>({schoolEn:'Your school',schoolAr:'مدرستك',timezone:'Asia/Qatar',language:'both',position:'top',monitor:'primary',size:'standard',alertMinutes:5,autostart:false,sound:false,paused:false,announcementEn:'Welcome to a new day of learning.',announcementAr:'أهلاً بكم في يوم جديد من التعلم.',holidays:[],fullscreenBreaks:true,fullscreenIdle:true,breakImage:'/images/student-break.png',returnImage:'/images/student-return.png'});
export async function openStore(directory) {
  mkdirSync(directory,{recursive:true}); const file=join(directory,'school.sqlite');
  const SQL=await initSqlJs();const db=new SQL.Database(existsSync(file)?readFileSync(file):undefined);
  db.run('CREATE TABLE IF NOT EXISTS state (id INTEGER PRIMARY KEY CHECK(id=1), value TEXT NOT NULL)');
  const result=db.exec('SELECT value FROM state WHERE id=1');
  let state=result.length?JSON.parse(result[0].values[0][0]):{admin:null,displayToken:randomBytes(32).toString('hex'),settings:defaultSettings(),draft:sampleSchedule(),published:[],revision:0,publishedAt:null,audit:[]};
  state.settings={...defaultSettings(),...state.settings};
  const save=()=>{db.run('INSERT OR REPLACE INTO state(id,value) VALUES(1,?)',[JSON.stringify(state)]);const tmp=file+'.tmp';writeFileSync(tmp,Buffer.from(db.export()),{mode:0o600});renameSync(tmp,file);};
  save();return {get:()=>state,save,close:()=>db.close(),file};
}
