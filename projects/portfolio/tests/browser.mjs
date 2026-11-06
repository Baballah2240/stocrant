import assert from 'node:assert/strict';
import {mkdirSync,mkdtempSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {chrome} from './support/chrome.mjs';
import {start} from '../server.mjs';

mkdirSync('.qa',{recursive:true});
const server=await start(0),url='http://127.0.0.1:'+server.address().port;
const browser=await chrome(mkdtempSync(join(tmpdir(),'portfolio-'))),{send,evaluate,until}=browser;
const settle=()=>evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
const finish=()=>evaluate('Promise.all(document.getAnimations().filter(a=>Number.isFinite(a.effect?.getTiming().iterations)).map(a=>a.finished.catch(()=>{})))');
const stillPage=async label=>{
 await finish();
 const state=await evaluate('(()=>{const root=getComputedStyle(document.documentElement),style=getComputedStyle(document.querySelector(".dashboard"));return{x:parseFloat(root.getPropertyValue("--page-x"))||0,y:parseFloat(root.getPropertyValue("--page-y"))||0,translate:style.translate,transform:style.transform,running:document.getAnimations().some(a=>a.effect?.target?.closest?.(".dashboard")&&a.effect.getTiming().iterations===Infinity&&a.playState==="running")}})()');
 assert.equal(state.running,false,'Dashboard and artwork stop moving '+label);
 assert.equal(state.x,0,'Horizontal parallax resets '+label);
 assert.equal(state.y,0,'Vertical parallax resets '+label);
 assert.equal(state.transform,'none','Dashboard drift resets '+label);
 assert.ok(state.translate==='none'||state.translate.split(/\s+/).every(value=>parseFloat(value)===0),'Dashboard translation resets '+label+' '+state.translate);
};
const screenshot=async name=>{
 await finish();
 writeFileSync(`.qa/${name}.png`,Buffer.from((await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false})).data,'base64'));
};
const escape=async()=>{
 await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27,nativeVirtualKeyCode:27});
 await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27,nativeVirtualKeyCode:27});
 await until('!document.querySelector("#project-dialog").open');
};
const open=async selector=>{
 await evaluate(`window.__opener=[...document.querySelectorAll(${JSON.stringify(selector)})].find(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0});if(!__opener)throw Error(${JSON.stringify('No visible opener: '+selector)});__opener.focus();__opener.click()`);
 await until('document.querySelector("#project-dialog").open');
 assert.equal(await evaluate('document.body.classList.contains("card-preview") || Boolean(document.querySelector(".is-preview"))'),false,'Modal clears card preview');
 assert.equal(await evaluate('document.body.classList.contains("focus-active")'),true,'Focused view dims the dashboard');
 assert.ok((await evaluate('document.querySelector("#project-details").textContent')).trim().length>25,'Focused view contains details');
 assert.ok((await evaluate('document.querySelector("#dialog-title").textContent')).trim(),'Focused view has an accessible title');
 assert.equal(await evaluate('document.querySelector("#project-dialog").contains(document.activeElement)'),true,'Focus enters dialog');
 await evaluate('document.querySelector(".theme-toggle").focus()');
 assert.equal(await evaluate('document.querySelector("#project-dialog").contains(document.activeElement)'),true,'Background remains inert');
 await stillPage('while focused content is open');
};
const closed=async()=>{
 await until('!document.querySelector("#project-dialog").open && !document.body.classList.contains("focus-active")');
 assert.equal(await evaluate('document.activeElement===window.__opener'),true,'Focus returns to selected card');
};
const neutral=async()=>{
 await evaluate('document.activeElement?.blur()');
 await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:2,y:2});
 await escape();
 await until('!document.body.classList.contains("card-preview") && !document.querySelector(".is-preview")');
 await finish();
};
const point=selector=>evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)}),r=e.getBoundingClientRect();return{x:r.left+r.width/2,y:r.top+r.height/2}})()`);
const tap=async selector=>{
 const p=typeof selector==='string'?await point(selector):selector;
 await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...p,radiusX:2,radiusY:2,force:1}]});
 await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
};
const noOverflow=async label=>{
 await settle();
 const dimensions=await evaluate('({width:innerWidth,height:innerHeight,scrollWidth:document.scrollingElement.scrollWidth,scrollHeight:document.scrollingElement.scrollHeight})');
 assert.ok(dimensions.scrollWidth<=dimensions.width+1,'Horizontal page overflow '+label+' '+JSON.stringify(dimensions));
 assert.ok(dimensions.scrollHeight<=dimensions.height+1,'Vertical page overflow '+label+' '+JSON.stringify(dimensions));
 const outside=await evaluate('[...document.querySelectorAll(".app-shell button,.app-shell a")].filter(e=>{const r=e.getBoundingClientRect();return r.width&&r.height&&(r.left< -1||r.top< -1||r.right>innerWidth+1||r.bottom>innerHeight+1)}).map(e=>({text:e.textContent.trim(),rect:e.getBoundingClientRect().toJSON()}))');
 assert.deepEqual(outside,[],'Dashboard actions visible without scrolling '+label);
};
try{
 await send('Page.enable');
 await send('Emulation.setDeviceMetricsOverride',{width:1366,height:768,deviceScaleFactor:1,mobile:false});
 await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'no-preference'}]});
 await send('Page.addScriptToEvaluateOnNewDocument',{source:'window.__errors=[];addEventListener("error",e=>__errors.push(e.message));addEventListener("unhandledrejection",e=>__errors.push(String(e.reason)));'});
 await send('Page.navigate',{url});
 await until('document.readyState==="complete" && Boolean(document.querySelector("[data-project]"))');
 await send('Page.bringToFront');
 assert.equal(await evaluate('document.querySelector(".planet")'),null,'Unprofessional face removed');
 assert.equal(await evaluate('document.querySelector(".ambient")?.parentElement===document.body'),true,'Decorative background stays outside application content');
 assert.equal(await evaluate('document.querySelector(".ambient")?.getAttribute("aria-hidden")'),'true','Background is hidden from assistive technology');
 assert.equal(await evaluate('getComputedStyle(document.querySelector(".ambient")).pointerEvents'),'none','Background never captures card or navigation input');
 assert.equal(await evaluate('document.querySelectorAll(".ambient a,.ambient button,.ambient input,.ambient [tabindex]").length'),0,'Decorative background has no focusable controls');
 assert.equal(await evaluate('document.querySelector(".ambient canvas")'),null,'Ambient design uses lightweight CSS decoration');
 assert.equal(await evaluate('document.documentElement.dataset.motion'),'on','Motion starts enabled without a reduced-motion preference');
 assert.equal(await evaluate('document.querySelector(".motion-toggle").getAttribute("aria-pressed")'),'true');
 assert.equal(await evaluate('document.querySelector(".motion-toggle").getAttribute("aria-label")'),'Pause page motion');
 await until('document.getAnimations().some(a=>a.effect?.target?.closest?.(".ambient")&&a.effect.getTiming().iterations===Infinity&&a.playState==="running")');
 await until('document.getAnimations().some(a=>a.effect?.target===document.querySelector(".dashboard")&&a.effect.getTiming().iterations===Infinity&&a.playState==="running")');
 assert.equal(await evaluate('document.getAnimations().some(a=>a.effect?.target?.matches?.(".project-visual")&&a.effect.getTiming().iterations===Infinity&&a.playState==="running")'),true,'Project artwork floats while the page is idle');
 await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:20,y:7});
 await until('Math.abs(parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--page-x")))>0.01||Math.abs(parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--page-y")))>0.01');
 await evaluate('document.querySelector(".dashboard").focus()');
 await stillPage('while keyboard focus is within the dashboard');
 await neutral();
 await until('document.getAnimations().some(a=>a.effect?.target===document.querySelector(".dashboard")&&a.effect.getTiming().iterations===Infinity&&a.playState==="running")');
 assert.equal(await evaluate('document.querySelectorAll(".project-card[data-project]").length'),3);
 assert.equal(await evaluate('document.querySelectorAll(".flip-card").length'),6,'Six overview cards have front and back faces');
 assert.equal(await evaluate('[...document.querySelectorAll(".flip-card")].every(e=>e.querySelector(".flip-inner .flip-front")&&e.querySelector(".flip-inner .flip-back"))'),true);
 for(const section of ['work','about','expertise','contact'])assert.ok(await evaluate(`Boolean(document.querySelector('[data-focus="${section}"]'))`),'Section entry '+section);

 const layouts=[[1920,1080],[1366,768],[768,1024],[390,844],[320,740],[844,390]];
 for(const [width,height] of layouts)for(const theme of ['dark','light']){
  await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<600});
  await neutral();
  await evaluate(`document.documentElement.dataset.theme=${JSON.stringify(theme)}`);
  await noOverflow(`${width}x${height} ${theme}`);
  assert.equal(await evaluate('[...document.querySelectorAll(".flip-card,.motion-toggle,.theme-toggle")].every(e=>{const r=e.getBoundingClientRect(),hit=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);return e===hit||e.contains(hit)})'),true,'Cards and appearance controls remain above ambient decoration');
  await screenshot(`dashboard-${width}x${height}-${theme}`);
  for(const project of ['stocrant','safeer','school']){
   await open(`[data-project="${project}"]`);
   await noOverflow(`${width}x${height} ${theme} ${project} dialog`);
   const dialog=await evaluate('({scrollWidth:document.querySelector("#project-dialog").scrollWidth,clientWidth:document.querySelector("#project-dialog").clientWidth,rect:document.querySelector("#project-dialog").getBoundingClientRect().toJSON()})');
   assert.ok(dialog.scrollWidth<=dialog.clientWidth+1,'Dialog has no horizontal overflow');
   assert.ok(dialog.rect.top>=-1&&dialog.rect.bottom<=height+1,'Dialog stays inside screen');
   if(theme==='dark'&&[1366,390].includes(width))await screenshot(`focus-${project}-${width}x${height}`);
   await evaluate('document.querySelector(".dialog-close").click()');await closed();
  }
  for(const section of ['work','about','expertise','contact']){
   await open(`[data-focus="${section}"]`);
   if(['about','contact'].includes(section))assert.match(await evaluate('document.querySelector("#project-details").textContent'),/Sudanese/,'Nationality appears in '+section);
   await noOverflow(`${width}x${height} ${theme} ${section} dialog`);
   const closeRect=await evaluate('document.querySelector(".dialog-close").getBoundingClientRect().toJSON()');
   assert.ok(closeRect.top>=0&&closeRect.bottom<=height,'Dialog close always visible');
   const controls=await evaluate('document.querySelectorAll("#project-dialog a,#project-dialog button,#project-dialog input,#project-dialog textarea,#project-dialog select").length');
   for(let index=0;index<controls;index++){
    const rect=await evaluate(`(()=>{const e=document.querySelectorAll('#project-dialog a,#project-dialog button,#project-dialog input,#project-dialog textarea,#project-dialog select')[${index}];e.scrollIntoView({block:'nearest',inline:'nearest'});return e.getBoundingClientRect().toJSON()})()`);
    assert.ok(rect.top>=-1&&rect.bottom<=height+1&&rect.left>=-1&&rect.right<=width+1,'Dialog control reachable '+section);
   }
   await evaluate('document.querySelector(".dialog-scroll").scrollTop=0');
   if(theme==='dark'&&[1366,390].includes(width))await screenshot(`focus-${section}-${width}x${height}`);
   await escape();await closed();
  }
 }

 await send('Emulation.setDeviceMetricsOverride',{width:1366,height:768,deviceScaleFactor:1,mobile:false});
 await evaluate('document.documentElement.dataset.theme="dark"');
 await neutral();
 for(let index=0;index<6;index++){
  const cardPoint=await evaluate(`(()=>{const r=document.querySelectorAll('.flip-card')[${index}].getBoundingClientRect();return{x:r.left+r.width/2,y:r.top+r.height/2}})()`);
  await send('Input.dispatchMouseEvent',{type:'mouseMoved',...cardPoint});
  await until('document.querySelectorAll(".is-preview").length===1 && document.body.classList.contains("card-preview")');
  await finish();
  assert.equal(await evaluate(`document.querySelectorAll('.flip-card')[${index}].classList.contains('is-preview')`),true,'Only hovered card previews');
  await stillPage('while a hovered card is selected');
  const blurred=await evaluate('[...document.querySelectorAll(".flip-card:not(.is-preview),.topbar,.intro,.footer")].map(e=>getComputedStyle(e).filter)');
  assert.ok(blurred.every(value=>Number.parseFloat(value.match(/blur\(([^)]+)/)?.[1])>0),'Hover isolates the card with background blur');
  if(index===1)await screenshot('hover-safeer-1366x768-dark');
  await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:2,y:2});
  await until('!document.body.classList.contains("card-preview") && !document.querySelector(".is-preview")');
 }
 await evaluate('document.querySelector("[data-project=stocrant]").focus()');
 await until('document.querySelector("[data-project=stocrant]").classList.contains("is-preview")');
 await escape();await until('!document.body.classList.contains("card-preview")');
 await evaluate('window.__opener=document.querySelector("[data-project=stocrant]");__opener.focus()');
 await send('Input.dispatchKeyEvent',{type:'rawKeyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,nativeVirtualKeyCode:13});
 await send('Input.dispatchKeyEvent',{type:'char',text:'\r',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,nativeVirtualKeyCode:13});
 await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,nativeVirtualKeyCode:13});
 await until('document.querySelector("#project-dialog").open');
 assert.equal(await evaluate('document.body.classList.contains("card-preview")'),false);
 await escape();await closed();

 await open('[data-focus="contact"]');
 assert.ok(await evaluate(`Boolean(document.querySelector('#project-details a[href="mailto:mohammedbaballah142@gmail.com"]'))`),'Direct email link');
 assert.ok(await evaluate(`Boolean(document.querySelector('#project-details a[href="tel:+97470533752"]'))`),'Direct phone link');
 assert.match(await evaluate('document.querySelector("#project-details").textContent'),/email (app|application|client)/i,'Contact form explains email-app handoff');
 for(const name of ['name','email','subject','message'])assert.equal(await evaluate(`Boolean(document.querySelector('.contact-form [name="${name}"]').labels.length)`),true,'Accessible label for '+name);
 assert.equal(await evaluate('document.querySelector(".contact-form").checkValidity()'),false,'Blank contact form is invalid');
 await evaluate('document.querySelector(".contact-form").requestSubmit()');
 assert.equal(await evaluate('Boolean(document.querySelector(".email-draft")?.getClientRects().length)'),false,'Invalid contact form does not create a draft');
 const contact={name:'QA Visitor',email:'visitor@example.test',subject:'Portfolio chat & demo?',message:'Hello Mohammed,\nCan we discuss a full-stack project?\nTest & verify.'};
 await evaluate(`Object.entries(${JSON.stringify(contact)}).forEach(([name,value])=>{document.querySelector('.contact-form').elements.namedItem(name).value=value})`);
 assert.equal(await evaluate('document.querySelector(".contact-form").checkValidity()'),true);
 await evaluate('document.querySelector(".contact-form").requestSubmit()');
 await until('Boolean(document.querySelector(".email-draft")?.getClientRects().length)');
 const draft=new URL(await evaluate('document.querySelector(".email-draft").href'));
 assert.equal(draft.protocol,'mailto:');assert.equal(draft.pathname,'mohammedbaballah142@gmail.com');
 assert.ok(draft.searchParams.get('subject').includes(contact.subject),'Encoded draft contains supplied subject');
 for(const value of [contact.name,contact.email,contact.message])assert.ok(draft.searchParams.get('body').includes(value),'Encoded draft contains supplied contact details');
 assert.equal(await evaluate('location.href'),url+'/','Draft creation keeps the local portfolio open');
 assert.doesNotMatch(await evaluate('document.querySelector("#project-details").textContent'),/message (sent|delivered)|successfully sent/i,'No false delivery claim');
 await escape();await closed();
 assert.equal(await evaluate('document.querySelector(".contact-form")'),null,'Closing discards private draft fields');
 await open('[data-focus="contact"]');
 assert.equal(await evaluate('[...document.querySelectorAll(".contact-form input,.contact-form textarea")].every(e=>e.value==="")'),true,'Reopened contact form is blank');
 assert.equal(await evaluate('Boolean(document.querySelector(".email-draft")?.getAttribute("href"))'),false,'Reopened contact form has no previous draft');
 await escape();await closed();

 await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
 await send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:1});
 await neutral();
 await evaluate('window.__opener=document.querySelector("[data-project=safeer]")');
 await tap('[data-project="safeer"]');
 await until('document.querySelector("[data-project=safeer]").classList.contains("is-preview")');
 assert.equal(await evaluate('document.querySelector("#project-dialog").open'),false,'First touch previews');
 await stillPage('while a touch card preview is selected');
 await tap('[data-project="safeer"]');await until('document.querySelector("#project-dialog").open');
 assert.equal(await evaluate('document.body.classList.contains("card-preview")'),false,'Second touch opens dialog and clears preview');
 await escape();await closed();
 await neutral();
 await tap('[data-project="school"]');await until('document.body.classList.contains("card-preview")');
 await tap({x:2,y:2});await until('!document.body.classList.contains("card-preview") && !document.querySelector(".is-preview")');
 await open('.info-card[data-focus="contact"]');
 await screenshot('contact-form-390x844-dark');
 await escape();await closed();
 await send('Emulation.setTouchEmulationEnabled',{enabled:false});
 await send('Emulation.setDeviceMetricsOverride',{width:1366,height:768,deviceScaleFactor:1,mobile:false});
 await neutral();
 await open('[data-focus="work"]');
 await evaluate('document.querySelector(".project-picker button").click()');
 assert.equal(await evaluate('document.querySelector("#dialog-title").textContent'),'Stocrant','Project picker switches focused content');
 await escape();await closed();
 await open('[data-project="safeer"]');
 const backdrop=await evaluate('(()=>{const r=document.querySelector("#project-dialog").getBoundingClientRect();return r.left>8?{x:4,y:innerHeight/2}:r.top>8?{x:innerWidth/2,y:4}:null})()');
 assert.ok(backdrop,'Desktop dialog has a dismissible backdrop');
 await send('Input.dispatchMouseEvent',{type:'mousePressed',...backdrop,button:'left',clickCount:1});
 await send('Input.dispatchMouseEvent',{type:'mouseReleased',...backdrop,button:'left',clickCount:1});
 await closed();

 await neutral();
 await evaluate('window.__opener=document.querySelector("[data-project=safeer]")');
 const mouseCard=await point('[data-project="safeer"]');
 await send('Input.dispatchMouseEvent',{type:'mouseMoved',...mouseCard});
 await until('document.body.classList.contains("card-preview")');
 await send('Input.dispatchMouseEvent',{type:'mousePressed',...mouseCard,button:'left',clickCount:1});
 await send('Input.dispatchMouseEvent',{type:'mouseReleased',...mouseCard,button:'left',clickCount:1});
 await until('document.querySelector("#project-dialog").open');
 await stillPage('during a mouse-opened focused view');
 const mouseClose=await point('.dialog-close');
 await send('Input.dispatchMouseEvent',{type:'mouseMoved',...mouseClose});
 await send('Input.dispatchMouseEvent',{type:'mousePressed',...mouseClose,button:'left',clickCount:1});
 await send('Input.dispatchMouseEvent',{type:'mouseReleased',...mouseClose,button:'left',clickCount:1});
 await closed();
 await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:2,y:2});
 await until('document.getAnimations().some(a=>a.effect?.target===document.querySelector(".dashboard")&&a.effect.getTiming().iterations===Infinity&&a.playState==="running")');
 assert.equal(await evaluate('document.activeElement===window.__opener'),true,'Mouse-close restores focus without permanently stopping idle motion');

 await evaluate('document.documentElement.dataset.theme="dark";document.querySelector(".theme-toggle").click()');
 assert.equal(await evaluate('document.documentElement.dataset.theme'),'light');
 assert.equal(await evaluate('localStorage.getItem("mb-portfolio-theme")'),'light');
 await send('Page.reload');await until('document.readyState==="complete" && document.documentElement.dataset.theme==="light"');
 await evaluate('document.querySelector(".motion-toggle").click()');
 assert.equal(await evaluate('document.documentElement.dataset.motion'),'off');
 assert.equal(await evaluate('localStorage.getItem("mb-portfolio-motion")'),'off');
 assert.equal(await evaluate('document.querySelector(".motion-toggle").getAttribute("aria-pressed")'),'false');
 assert.equal(await evaluate('document.querySelector(".motion-toggle").getAttribute("aria-label")'),'Resume page motion');
 await settle();
 assert.equal(await evaluate('document.getAnimations().some(a=>a.effect?.target?.closest?.(".ambient,.app-shell")&&a.effect.getTiming().iterations===Infinity&&a.playState==="running")'),false,'Pause stops continuous ambient and dashboard animation');
 await stillPage('when motion is turned off');
 await send('Page.reload');await until('document.readyState==="complete" && document.documentElement.dataset.motion==="off"');
 assert.equal(await evaluate('document.querySelector(".motion-toggle").getAttribute("aria-pressed")'),'false','Paused setting survives reload');
 assert.equal(await evaluate('document.getAnimations().some(a=>a.effect?.target?.closest?.(".ambient,.app-shell")&&a.effect.getTiming().iterations===Infinity&&a.playState==="running")'),false,'Paused reload does not restart continuous motion');
 await evaluate('document.querySelector(".motion-toggle").click()');
 assert.equal(await evaluate('document.documentElement.dataset.motion'),'on');
 assert.equal(await evaluate('localStorage.getItem("mb-portfolio-motion")'),'on');
 assert.equal(await evaluate('document.querySelector(".motion-toggle").getAttribute("aria-pressed")'),'true');
 assert.equal(await evaluate('document.querySelector(".motion-toggle").getAttribute("aria-label")'),'Pause page motion');
 await until('document.getAnimations().some(a=>a.effect?.target?.closest?.(".ambient")&&a.effect.getTiming().iterations===Infinity&&a.playState==="running")');
 await until('document.getAnimations().some(a=>a.effect?.target===document.querySelector(".dashboard")&&a.effect.getTiming().iterations===Infinity&&a.playState==="running")');
 await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
 await send('Page.reload');await until('document.readyState==="complete" && Boolean(document.querySelector(".motion-toggle"))');
 assert.equal(await evaluate('localStorage.getItem("mb-portfolio-motion")'),'on','Reduced motion preserves the visitor\'s saved preference');
 await evaluate('document.documentElement.dataset.motion="on"');
 await settle();
 assert.equal(await evaluate('getComputedStyle(document.documentElement).scrollBehavior'),'auto');
 const moving=await evaluate('[...document.querySelectorAll(".app-shell *")].filter(e=>{const s=getComputedStyle(e);return s.animationName!=="none"&&s.animationDuration.split(",").some(v=>parseFloat(v)>0.01)}).map(e=>({tag:e.tagName,class:e.className}))');
 assert.deepEqual(moving,[],'Reduced motion removes continuous dashboard animation');
 const ambientMotion=await evaluate('[...document.querySelectorAll(".ambient,.ambient *")].flatMap(e=>[null,"::before","::after"].map(pseudo=>({element:e.className,pseudo,style:getComputedStyle(e,pseudo)}))).filter(({style})=>style.animationName!=="none"&&style.animationDuration.split(",").some(v=>parseFloat(v)>0.01)).map(({element,pseudo})=>({element,pseudo}))');
 assert.deepEqual(ambientMotion,[],'Reduced motion removes ambient animation even with a saved and forced on setting');
 await stillPage('with reduced motion and a forced on setting');
 await evaluate('document.querySelector("[data-project=safeer]").focus()');await until('document.body.classList.contains("card-preview")');
 assert.ok(await evaluate('![...document.querySelectorAll(".flip-inner")].some(e=>getComputedStyle(e).transform.includes("matrix3d"))'),'Reduced motion avoids 3D flip');
 assert.deepEqual(await evaluate('window.__errors'),[]);
 console.log('PASS: 12 single-screen layouts, 84 project/section views, six hover/focus previews, touch preview/open/dismiss, keyboard controls, labeled contact form and encoded email draft, direct contacts, nationality, modal isolation/focus restoration, decorative background isolation, idle dashboard/artwork motion and pointer parallax, stable selected/keyboard/touch content, persistent theme and motion controls, reduced-motion override and no runtime errors.');
}finally{await browser.close();await new Promise(r=>server.close(r));}
