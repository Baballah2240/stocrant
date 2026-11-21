import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {mkdtempSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {startServer} from '../server/server.mjs';
import {browserQa} from './browser-helper.mjs';

const mode=process.argv[2];
assert.ok(['layout','workflow'].includes(mode),'Specify layout or workflow');
const directory=mkdtempSync(join(tmpdir(),'school-community-'+mode+'-'));
const app=await startServer({directory:join(directory,'data'),port:0,updateEnv:{},pushSender:null});
const password=randomBytes(24).toString('hex');
let cookie='', browser;

async function call(path,body,{token,administrator=false}={}) {
  const response=await fetch(app.origin+'/api/'+path,{
    method:body===undefined?'GET':'POST',
    headers:{Origin:app.origin,'Content-Type':'application/json',
      ...(token?{Authorization:'Bearer '+token}:{}),...(administrator?{Cookie:cookie}:{})},
    body:body===undefined?undefined:JSON.stringify(body),
  });
  const data=await response.json();
  assert.ok(response.ok,path+': '+JSON.stringify(data));
  cookie=response.headers.get('set-cookie')?.split(';')[0]||cookie;
  return data;
}

try {
  await call('setup',{name:'QA administrator',email:'admin@school.test',password});
  await call('login',{email:'admin@school.test',password});
  const group=(await call('classes',{nameEn:'QA class',nameAr:''},{administrator:true})).group.id;
  await call('users',{name:'QA teacher',email:'teacher@school.test',password,role:'teacher',classIds:[group]},{administrator:true});
  const teacher=(await call('mobile/login',{email:'teacher@school.test',password,audience:'teacher'})).token;
  const {code}=await call('community/code',{}, {administrator:true});
  const parent=(await call('mobile/community/register',{name:'QA parent',email:'parent@school.test',password,code})).token;
  browser=await browserQa(directory);
  const {send,evaluate,until}=browser;
  const setSize=async width=>send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false});
  const shot=async name=>{
    const {data}=await send('Page.captureScreenshot',{format:'png'});
    writeFileSync(join(directory,name+'.png'),Buffer.from(data,'base64'));
  };
  await send('Page.enable');
  await send('Network.enable');
  await setSize(mode==='layout'?320:1200);
  await send('Page.navigate',{url:app.origin+'/community-admin'});
  await until('document.querySelector("#retry")?.hidden === false');
  assert.match(await evaluate('document.querySelector("#status").textContent'),/Sign in/);
  await send('Network.setCookie',{name:'school_session',value:cookie.split('=')[1],url:app.origin,path:'/'});
  await evaluate('document.querySelector("#retry").click()');
  await until('document.querySelector("#workspace").hidden === false');

  if (mode === 'layout') {
    await send('Page.navigate', {url: app.origin+'/control'});
    await until('!!document.querySelector("[data-tab=community]")');
    await evaluate('document.querySelector("[data-tab=community]").click()');
    await until('document.querySelector("#community-frame")?.contentDocument?.querySelector("#workspace")?.hidden === false');
    assert.equal(await evaluate('document.querySelector("[data-tab=community]").getAttribute("aria-current")'), 'page');
    for (const theme of ['dark', 'light']) {
      await evaluate('document.querySelector("[data-dashboard-theme='+theme+']").click()');
      await until('document.querySelector("#community-frame").contentDocument.documentElement.dataset.theme === "'+theme+'"');
      assert.equal(await evaluate('document.querySelector("[data-dashboard-theme='+theme+']").getAttribute("aria-pressed")'), 'true');
    }
    await until('document.querySelector("#community-frame").clientHeight > 260');
    assert.equal(await evaluate('!!document.querySelector("#community-frame").contentDocument.querySelector("#school-back")'), false);
    assert.equal(await evaluate('location.pathname'), '/control');
    await send('Page.navigate', {url: app.origin+'/community-admin'});
    await until('document.querySelector("#workspace")?.hidden === false');
  }
  if(mode==='layout') {
    const readLayout=()=>evaluate(`(()=>{
      const body=getComputedStyle(document.body);
      const tile=getComputedStyle(document.querySelector('.compose'));
      const button=getComputedStyle(document.querySelector('#send-notice'));
      return {width:document.documentElement.scrollWidth, viewport:document.documentElement.clientWidth, direction:body.direction,
        bg:body.backgroundColor, fg:body.color, tile:tile.backgroundColor,
        columns:getComputedStyle(document.querySelector('#workspace')).gridTemplateColumns.split(' ').length,
        buttonBg:button.backgroundColor, buttonFg:button.color, animation:tile.animationName};
    })()`);
    const ratio=(a,b)=>{
      const luminance=value=>value.match(/\d+/g).slice(0,3).map(Number).map(v=>v/255)
        .map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4)
        .reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
      const [high,low]=[luminance(a),luminance(b)].sort((a,b)=>b-a);
      return (high+.05)/(low+.05);
    };
    for(const [theme,width,columns] of [['dark',320,1],['light',1200,2],['dark',1200,2]]) {
      await setSize(width);
      await evaluate(`(()=>{const s=document.querySelector('#theme');s.value='${theme}';s.dispatchEvent(new Event('change'));})()`);
      const layout=await readLayout();
      assert.equal(layout.width,layout.viewport,'No horizontal scroll');
      assert.equal(layout.direction,'rtl');
      assert.equal(layout.columns,columns);
      assert.ok(ratio(layout.tile,layout.fg)>=4.5);
      assert.ok(ratio(layout.buttonBg,layout.buttonFg)>=4.5);
      if(theme==='dark')assert.equal(layout.bg,'rgb(27, 11, 19)');
      await evaluate('new Promise(resolve=>setTimeout(resolve,320))');
      await shot(theme+'-'+width);
    }
    await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
    assert.equal((await readLayout()).animation,'none');
    await send('Page.reload');
    await until('document.documentElement.dataset.theme === "dark" && !document.querySelector("#workspace").hidden');
  } else {
    await evaluate(`(()=>{
      const settings=document.querySelector('#settings');
      settings.elements.parent.checked=false;
      const form=document.querySelector('#notice');
      form.elements.title.value='Teacher briefing';
      form.elements.text.value='Bring the timetable.';
      form.elements.audience.value='teacher';
      form.dispatchEvent(new Event('input',{bubbles:true}));
    })()`);
    assert.equal(await evaluate('document.querySelector("#preview-title").textContent'),'Teacher briefing');
    assert.match(await evaluate('document.querySelector("#audience-status").textContent'),/1 حساب/);
    await evaluate('document.querySelector("#notice").requestSubmit(document.querySelector("#send-notice"))');
    await until('document.querySelector("#notices").textContent.includes("Teacher briefing")');
    assert.equal(await evaluate('document.querySelector("#settings").elements.parent.checked'),false,'Preserves unsaved settings');
    const notices=role=>call('mobile/notifications',undefined,{token:role==='teacher'?teacher:parent}).then(result=>result.items);
    assert.equal((await notices('teacher')).length,1);
    assert.deepEqual(await notices('parent'),[]);
    await evaluate('document.querySelector("#notices button").click()');
    await evaluate(`(()=>{
      const form=document.querySelector('#notice');
      form.elements.title.value='Family briefing';
      form.elements.audience.value='parent';
      form.dispatchEvent(new Event('input',{bubbles:true}));
      form.requestSubmit(document.querySelector('#send-notice'));
    })()`);
    await until('document.querySelector("#notices").textContent.includes("Family briefing")');
    assert.equal((await notices('parent'))[0].title,'Family briefing');
    assert.deepEqual(await notices('teacher'),[]);
    await evaluate(`(()=>{
      const filter=document.querySelector('#notice-filter');
      filter.value='teacher';filter.dispatchEvent(new Event('change'));
    })()`);
    assert.ok(!(await evaluate('document.querySelector("#notices").textContent')).includes('Family briefing'));
    await evaluate(`(()=>{
      const form=document.querySelector('#post');
      form.elements.text.value='Science fair update';
      const files=new DataTransfer();
      files.items.add(new File([Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aJHsAAAAASUVORK5CYII='), ch=>ch.charCodeAt(0))], 'fixture.png',{type:'image/png'}));
      form.elements.photo.files=files.files;
      form.elements.photo.dispatchEvent(new Event('change'));
    })()`);
    await until('!document.querySelector("#photo-preview").hidden');
    await evaluate('document.querySelector("#post").requestSubmit(document.querySelector("#post button:last-child"))');
    await until('document.querySelector("#posts img")?.naturalWidth > 0');
    assert.equal((await call('mobile/community',undefined,{token:parent})).posts[0].text,'Science fair update');
    await evaluate(`(()=>{
      const form=document.querySelector('#post');
      form.elements.text.value='A saved caption';
      const files=new DataTransfer();
      files.items.add(new File(['unreadable image'],'bad.png',{type:'image/png'}));
      form.elements.photo.files=files.files;
      form.elements.photo.dispatchEvent(new Event('change'));
    })()`);
    await until('!document.querySelector("#photo-error").hidden');
    assert.equal(await evaluate('document.querySelector("#post").checkValidity()'),false);
    await evaluate('document.querySelector("#remove-photo").click()');
    assert.equal(await evaluate('document.querySelector("#post").checkValidity()'),true);
    await evaluate('document.querySelector("#post").requestSubmit(document.querySelector("#post button[type=submit]") || document.querySelector("#post button:last-child"))');
    await until('document.querySelector("#posts").textContent.includes("A saved caption")');
    await evaluate('document.querySelector("#posts li button").click()');
    await until('document.querySelector("#attach-dialog").open');
    await evaluate(`(()=>{
      const form=document.querySelector('#attach-form');
      const files=new DataTransfer();
      files.items.add(new File([Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aJHsAAAAASUVORK5CYII='), ch=>ch.charCodeAt(0))],'fixture.png',{type:'image/png'}));
      form.elements.photo.files=files.files;
      form.requestSubmit(form.querySelector('[type=submit]'));
    })()`);
    await until('!document.querySelector("#attach-dialog").open && document.querySelector("#posts > li img")?.naturalWidth > 0');
    assert.equal((await call('mobile/community',undefined,{token:parent})).posts.find(post=>post.text==='A saved caption').photo,true);
  }
  console.log('Community dashboard '+mode+' checks passed. '+directory);
} finally {
  if(browser)await browser.close();
  await app.close();
}

