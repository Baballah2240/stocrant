import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {mkdtempSync, readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {startServer} from '../server/server.mjs';
import {schoolClock} from '../shared/schedule.mjs';
import {deliverPush} from '../server/push.mjs';

test('community membership, private photos, comments, notifications, and classwork', async () => {
  const app = await startServer({directory:mkdtempSync(join(tmpdir(),'school-community-')),port:0,updateEnv:{},pushSender:null});
  const password=randomBytes(24).toString('hex');
  let cookie;
  async function api(path, {body, token, admin=false, method=body?'POST':'GET'}={}) {
    const response=await fetch(app.origin+'/api/'+path,{
      method,headers:{Origin:app.origin,'Content-Type':'application/json',
        ...(admin?{Cookie:cookie}:{}),...(token?{Authorization:'Bearer '+token}:{})},
      body:body?JSON.stringify(body):undefined
    });
    const payload=response.headers.get('content-type').startsWith('image/')
      ? Buffer.from(await response.arrayBuffer()) : await response.json();
    return {status:response.status, payload, cookie:response.headers.get('set-cookie')?.split(';')[0]};
  }
  try {
    await api('setup',{body:{name:'School administrator',email:'admin@school.test',password}});
    cookie=(await api('login',{body:{email:'admin@school.test',password}})).cookie;
    assert.ok(cookie);
    const classId=(await api('classes',{admin:true,body:{nameEn:'Grade 6',nameAr:''}})).payload.group.id;
    const clock=schoolClock(new Date(),'Asia/Qatar');
    await api('draft',{admin:true,method:'PUT',body:{schedule:[{id:'math',day:(clock.day+1)%7,type:'lesson',
      classId,start:'08:00',end:'09:00',subjectEn:'Mathematics',subjectAr:'',teacherEn:'Class Teacher',teacherAr:'',room:'Room 2'}]}});
    await api('publish',{admin:true,body:{}});
    await api('users',{admin:true,body:{name:'Class Teacher',email:'teacher@school.test',password,role:'teacher',classIds:[classId],teacherName:'Class Teacher'}});
    const teacher=(await api('mobile/login',{body:{email:'teacher@school.test',password,audience:'teacher'}})).payload.token;
    assert.ok(teacher);
    assert.equal((await api('community/code',{token:teacher,body:{}})).status,401);
    const code=(await api('community/code',{admin:true,body:{}})).payload.code;
    const registration={name:'Family member',email:'family@school.test',password};
    assert.equal((await api('mobile/community/register',{body:{...registration,code:'wrong'}})).status,403);
    assert.equal((await api('mobile/community/register',{body:{...registration,code,audience:'teacher'}})).status,403);
    const parent=(await api('mobile/community/register',{body:{...registration,code}})).payload.token;
    assert.ok(parent);
    assert.deepEqual(app.store.get().users.find(row=>row.email===registration.email).studentIds,[]);
    const raster=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aJHsAAAAASUVORK5CYII=','base64');
    const {id:postId}=(await api('community/post',{admin:true,body:{text:'Science fair',notify:true,photo:'data:image/png;base64,'+raster.toString('base64')}})).payload;
    assert.ok(postId);
    assert.equal((await api('mobile/community/photo/'+postId)).status,401);
    assert.equal((await api('community/photo/'+postId,{token:teacher})).status,401);
    assert.deepEqual((await api('community/photo/'+postId,{admin:true})).payload,raster);
    assert.deepEqual((await api('community',{admin:true})).payload.recipients,{teacher:1,parent:1});
    assert.equal((await api('mobile/community/photo/'+postId,{token:teacher})).status,403);
    assert.deepEqual((await api('mobile/community/photo/'+postId,{token:parent})).payload,raster);
    for(let i=0;i<2;i++)assert.equal((await api('mobile/community/like',{token:parent,body:{postId,liked:true}})).status,200);
    assert.equal((await api('mobile/community/comment',{token:parent,body:{postId,text:'See you there'}})).status,200);
    let feed=(await api('mobile/community',{token:parent})).payload;
    assert.equal(feed.posts[0].likeCount,1);
    assert.equal(feed.posts[0].commentCount,1);
    assert.deepEqual(feed.posts[0].comments,[]);
    assert.equal(feed.showComments,false);
    assert.deepEqual((await api('community',{admin:true})).payload.posts[0].comments.map(row=>row.author),['Family member']);
    const settings={teacher:true,parent:true,posts:true,classwork:true};
    assert.equal((await api('community/settings',{admin:true,body:{...settings,showParentComments:true}})).status,200);
    feed=(await api('mobile/community',{token:parent})).payload;
    assert.equal(feed.showComments,true);
    assert.deepEqual(feed.posts[0].comments.map(row=>row.author),['Family member']);
    const neighbour=(await api('mobile/community/register',{body:{name:'Other family',email:'other@school.test',password,code}})).payload.token;
    assert.deepEqual((await api('mobile/community',{token:neighbour})).payload.posts[0].comments.map(row=>row.author),['ولي أمر · Parent'],'Other families do not see the name of another parent.');
    const school=(await api('mobile/school')).payload;
    assert.deepEqual(Object.keys(school).sort(),['nameAr','nameEn']);
    assert.ok(!JSON.stringify(feed).includes(registration.email));
    assert.equal(feed.items.length,1);
    const existing=(await api('community/post',{admin:true,body:{text:'A post without a photo'}})).payload.id;
    await api('mobile/community/like',{token:parent,body:{postId:existing,liked:true}});
    await api('mobile/community/comment',{token:parent,body:{postId:existing,text:'Keep this comment'}});
    const largerPhoto=readFileSync(new URL('../assets/student-break.png',import.meta.url));
    assert.ok(largerPhoto.length>2*1024*1024 && largerPhoto.length<5*1024*1024);
    const attach={postId:existing,photo:'data:image/png;base64,'+largerPhoto.toString('base64')};
    const tooLarge='data:image/png;base64,'+Buffer.alloc(5*1024*1024+1).toString('base64');
    assert.equal((await api('community/post/photo',{admin:true,body:{postId:existing,photo:tooLarge}})).status,400);
    assert.equal((await api('community/post/photo',{token:parent,body:attach})).status,401);
    assert.equal((await api('community/post/photo',{admin:true,body:{postId:existing,photo:''}})).status,400);
    assert.equal((await api('community/post/photo',{admin:true,body:attach})).status,200);
    assert.equal((await api('community/post/photo',{admin:true,body:attach})).status,409);
    const updated=(await api('mobile/community',{token:parent})).payload.posts.find(row=>row.id===existing);
    assert.equal(updated.photo,true);
    assert.equal(updated.likeCount,1);
    assert.equal(updated.comments[0].text,'Keep this comment');
    assert.deepEqual((await api('mobile/community/photo/'+existing,{token:parent})).payload,largerPhoto);
    assert.equal((await api('community/settings',{admin:true,body:{...settings,showParentComments:false}})).status,200);
    assert.equal((await api('mobile/notifications',{token:teacher})).payload.items.length,0);
    const view=(await api('mobile/timetable?view=cards',{token:teacher})).payload;
    assert.equal(view.next.subjectEn,'Mathematics');
    assert.equal(view.next.room,'Room 2');
    const work={classId,type:'homework',dueDate:clock.date,title:'Practice fractions',details:'Questions 1 to 4',community:true};
    assert.equal((await api('mobile/work',{token:teacher,body:{...work,classId:'outside'}})).status,403);
    const shared=(await api('mobile/work',{token:teacher,body:work}));
    assert.equal(shared.status,200);
    const sharedPost=shared.payload.item.communityPostId;
    feed=(await api('mobile/community',{token:parent})).payload;
    assert.match(feed.posts[0].text,/Grade 6[\s\S]*Practice fractions/);
    assert.equal(feed.items.length,2);
    const draftWork=(await api('mobile/work',{token:teacher,body:{...work,title:'Mistake'}})).payload.item;
    assert.ok((await api('mobile/community',{token:parent})).payload.posts.some(row=>row.id===draftWork.communityPostId));
    assert.equal((await api('mobile/work/remove',{token:teacher,body:{id:draftWork.id}})).status,200);
    assert.ok(!(await api('mobile/community',{token:parent})).payload.posts.some(row=>row.id===draftWork.communityPostId),'Removing classwork removes its community post.');
    assert.ok(!(await api('mobile/notifications',{token:parent})).payload.items.some(row=>row.id===draftWork.communityNoticeId),'Removing classwork removes its notification.');
    assert.ok((await api('mobile/community',{token:parent})).payload.posts.some(row=>row.id===sharedPost));
    await api('users',{admin:true,body:{name:'Coordinator',email:'coord@school.test',password,role:'coordinator',classIds:[]}});
    assert.equal((await api('mobile/login',{body:{email:'coord@school.test',password,audience:'teacher'}})).status,200,'Coordinators can use the teacher app.');
    assert.equal((await api('mobile/login',{body:{email:'coord@school.test',password,audience:'parent'}})).status,403);
    const created=await api('community/notice',{admin:true,body:{title:'Teacher notice',text:'Staff meeting',audience:'teacher'}});
    assert.equal(created.status,200);
    const noticeId=created.payload.id;
    assert.equal((await api('mobile/notifications',{token:teacher})).payload.items.length,1);
    assert.equal((await api('community/settings',{admin:true,body:{teacher:false,parent:true,posts:true,classwork:true}})).status,200);
    assert.deepEqual((await api('mobile/notifications',{token:teacher})).payload.items,[]);
    assert.equal((await api('community/notice',{admin:true,body:{title:'Blocked',text:'Audience disabled',audience:'teacher'}})).status,409);
    assert.equal((await api('community/notice/edit',{admin:true,body:{id:noticeId,title:'Parent notice',text:'Meeting at 4',audience:'parent'}})).status,200);
    const parentNotices=(await api('mobile/notifications',{token:parent})).payload.items;
    assert.equal(parentNotices.find(row=>row.id===noticeId).title,'Parent notice');
    assert.ok(parentNotices.find(row=>row.id===noticeId).editedAt);
    assert.equal((await api('community/notice/edit',{admin:true,body:{id:parentNotices.find(row=>row.type==='posts').id,title:'No',text:'No',audience:'parent'}})).status,409);
    assert.equal((await api('community/notice/remove',{admin:true,body:{id:noticeId}})).status,200);
    assert.ok(!(await api('mobile/notifications',{token:parent})).payload.items.some(row=>row.id===noticeId));
    const before=app.store.get().pushJobs.find(row=>row.data.communityNotice===noticeId);
    assert.ok(before);
    await deliverPush(app.store.get(),{send:async()=>({ok:true})});
    assert.equal(before.status,'skipped');
    assert.equal(before.error,'School notification unavailable');
  } finally {
    await app.close();
  }
});
