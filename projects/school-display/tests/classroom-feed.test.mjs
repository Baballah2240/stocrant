import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {mkdtempSync, readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {startServer} from '../server/server.mjs';
import {schoolClock} from '../shared/schedule.mjs';

test('teacher posts with several photos, classwork photos, and parent file submissions', async () => {
  const app = await startServer({directory:mkdtempSync(join(tmpdir(),'school-feed-')),port:0,updateEnv:{},pushSender:null});
  const password = randomBytes(24).toString('hex');
  let cookie;
  async function api(path, {body, token, admin=false}={}) {
    const response = await fetch(app.origin+'/api/'+path, {
      method:body?'POST':'GET',
      headers:{Origin:app.origin,'Content-Type':'application/json',...(admin?{Cookie:cookie}:{}),...(token?{Authorization:'Bearer '+token}:{})},
      body:body?JSON.stringify(body):undefined,
    });
    const type = response.headers.get('content-type')||'';
    const payload = type.startsWith('application/json') ? await response.json() : Buffer.from(await response.arrayBuffer());
    return {status:response.status, payload, cookie:response.headers.get('set-cookie')?.split(';')[0], type};
  }
  try {
    await api('setup',{body:{name:'Administrator',email:'admin@school.test',password}});
    cookie = (await api('login',{body:{email:'admin@school.test',password}})).cookie;
    const classA = (await api('classes',{admin:true,body:{nameEn:'Grade 6',nameAr:''}})).payload.group.id;
    const classB = (await api('classes',{admin:true,body:{nameEn:'Grade 7',nameAr:''}})).payload.group.id;
    const clock = schoolClock(new Date(),'Asia/Qatar');
    await api('draft',{admin:true,body:{schedule:[]}}).catch(()=>{});
    await fetch(app.origin+'/api/draft',{method:'PUT',headers:{Origin:app.origin,'Content-Type':'application/json',Cookie:cookie},body:JSON.stringify({schedule:[
      {id:'a',classId:classA,day:clock.day,type:'lesson',start:'08:00',end:'09:00',subjectEn:'Maths',subjectAr:'',teacherEn:'Teacher',teacherAr:'',room:''},
      {id:'b',classId:classB,day:clock.day,type:'lesson',start:'09:00',end:'10:00',subjectEn:'Art',subjectAr:'',teacherEn:'Other',teacherAr:'',room:''}]})});
    await api('publish',{admin:true,body:{}});
    await api('users',{admin:true,body:{name:'Class Teacher',email:'teacher@school.test',password,role:'teacher',classIds:[classA],teacherName:'Teacher'}});
    await api('users',{admin:true,body:{name:'Other Teacher',email:'other@school.test',password,role:'teacher',classIds:[classB],teacherName:'Other'}});
    const teacher = (await api('mobile/login',{body:{email:'teacher@school.test',password,audience:'teacher'}})).payload.token;
    const other = (await api('mobile/login',{body:{email:'other@school.test',password,audience:'teacher'}})).payload.token;
    const ali = (await api('students',{admin:true,body:{nameEn:'Ali',nameAr:'علي',classId:classA}})).payload.student;
    const sara = (await api('students',{admin:true,body:{nameEn:'Sara',nameAr:'سارة',classId:classA}})).payload.student;
    const join = async (student,email) => (await api('mobile/parent/register',{body:{code:(await api('parent-invites',{admin:true,body:{studentId:student.id}})).payload.code,name:'Parent '+student.nameEn,email,password,confirm:password}})).payload.token;
    const parent = await join(ali,'ali.parent@home.test');
    const otherParent = await join(sara,'sara.parent@home.test');
    assert.ok(parent && otherParent);

    const png = readFileSync(new URL('../assets/icon.png',import.meta.url));
    const photo = 'data:image/png;base64,'+png.toString('base64');

    // A teacher announcement with two photos reaches parents and other teachers.
    assert.equal((await api('mobile/community/post',{token:parent,body:{text:'Hello',photos:[]}})).status,403,'Parents cannot publish school posts.');
    assert.equal((await api('mobile/community/post',{token:teacher,body:{text:'Trip',photos:Array(7).fill(photo)}})).status,400,'At most six photos.');
    const posted = await api('mobile/community/post',{token:teacher,body:{title:'Science trip',text:'Photos from our visit.',photos:[photo,photo]}});
    assert.equal(posted.status,200);
    const feed = (await api('mobile/community',{token:parent})).payload;
    const trip = feed.posts.find(row=>row.id===posted.payload.id);
    assert.equal(trip.photoCount,2);
    assert.equal(trip.kind,'announcement');
    assert.equal(trip.title,'Science trip');
    assert.equal(trip.author,'Class Teacher');
    assert.equal(trip.mine,false);
    assert.ok(feed.items.some(row=>row.title==='Science trip'),'Parents are notified.');
    assert.deepEqual((await api('mobile/community/photo/'+trip.id+'?i=1',{token:parent})).payload,png);
    const teacherFeed = (await api('mobile/community',{token:teacher})).payload;
    assert.equal(teacherFeed.posts.find(row=>row.id===trip.id).mine,true,'Teachers see their own posts in the app.');
    assert.equal((await api('mobile/community',{token:other})).status,200,'Every teacher can read the school feed.');
    assert.equal((await api('mobile/community/remove',{token:other,body:{postId:trip.id}})).status,403,'Teachers remove only their own posts.');
    assert.equal((await api('community',{admin:true})).payload.posts.find(row=>row.id===trip.id).author,'Class Teacher','The dashboard shows who posted.');

    // Classwork with a photo becomes a classwork post linked to the class.
    const due = clock.date;
    assert.equal((await api('mobile/work',{token:teacher,body:{classId:classA,type:'homework',title:'Bad photo',dueDate:due,community:true,photos:['data:image/png;base64,AAAA']}})).status,400);
    assert.ok(!(await api('mobile/timetable',{token:teacher})).payload.work.some(row=>row.title==='Bad photo'),'A rejected photo does not leave classwork behind.');
    const work = (await api('mobile/work',{token:teacher,body:{classId:classA,type:'homework',title:'Fractions',details:'Page 4',dueDate:due,community:true,photos:[photo]}})).payload.item;
    const workPost = (await api('mobile/community',{token:parent})).payload.posts.find(row=>row.kind==='classwork');
    assert.equal(workPost.title,'Fractions');
    assert.equal(workPost.classId,classA);
    assert.equal(workPost.photoCount,1);

    // A parent attaches a file to the classwork; the teacher can open it, other families cannot.
    const pdf = 'data:application/pdf;base64,'+Buffer.from('%PDF-1.4 homework').toString('base64');
    const submit = body => api('mobile/work/submit',{token:parent,body:{workId:work.id,studentId:ali.id,file:{name:'answers.pdf',data:pdf},...body}});
    assert.equal((await api('mobile/work/submit',{token:teacher,body:{workId:work.id,studentId:ali.id,file:{name:'a.pdf',data:pdf}}})).status,403);
    assert.equal((await submit({studentId:sara.id})).status,403,'Parents submit only for their own child.');
    assert.equal((await submit({file:{name:'answers.exe',data:pdf}})).status,400,'Only school file types are accepted.');
    assert.equal((await submit({})).status,200);
    assert.equal((await submit({})).status,200,'Submitting again replaces the earlier file.');
    const mine = (await api('mobile/timetable',{token:parent})).payload.work.find(row=>row.id===work.id);
    assert.equal(mine.submissions.length,1);
    assert.equal(mine.submissions[0].name,'answers.pdf');
    assert.deepEqual((await api('mobile/timetable',{token:otherParent})).payload.work.find(row=>row.id===work.id).submissions,[],'Other families do not see the file.');
    const teacherWork = (await api('mobile/timetable',{token:teacher})).payload.work.find(row=>row.id===work.id);
    assert.equal(teacherWork.submissions[0].studentNameEn,'Ali');
    const fileId = teacherWork.submissions[0].id;
    const download = await api('mobile/submission/'+fileId,{token:teacher});
    assert.equal(download.status,200);
    assert.equal(download.payload.toString(),'%PDF-1.4 homework');
    assert.equal((await api('mobile/submission/'+fileId,{token:other})).status,404,'Teachers of other classes cannot open it.');
    assert.equal((await api('mobile/submission/'+fileId,{token:otherParent})).status,404);
    assert.equal((await api('mobile/submission/'+fileId,{token:parent})).status,200);
    assert.equal(app.store.get().files.length,1,'The replaced file was deleted.');

    // Removing the classwork removes its post and the attached files.
    assert.equal((await api('mobile/work/remove',{token:teacher,body:{id:work.id}})).status,200);
    assert.ok(!(await api('mobile/community',{token:parent})).payload.posts.some(row=>row.id===workPost.id));
    assert.equal(app.store.get().files.length,0);
    assert.equal((await api('mobile/community/remove',{token:teacher,body:{postId:trip.id}})).status,200);
  } finally {
    await app.close?.();
  }
});
