const {app,BrowserWindow,Tray,Menu,shell,screen,nativeImage,ipcMain,dialog,powerMonitor,globalShortcut}=require('electron');
const path=require('node:path');
const {createScreens}=require('./screens.cjs');
const {verifyInstaller}=require('./update.cjs');
const {spawn}=require('node:child_process');
const {overlayBounds}=require('./bounds.cjs');
const fs=require('node:fs');
const assert=require('node:assert/strict');
const {randomBytes}=require('node:crypto');
let remoteSettings=null;
let service,overlay,tray,quitting=false,displayToken,alertAt=0,pointerPoll,panelBounds=null,contentHeight=240,pointerInside=null,expanded=false,centered=false,clockOnly=false,controlWindow=null,screens=null;
const smoke=process.argv.includes('--smoke-test');
if(smoke&&!process.env.SCHOOL_DATA_DIR)throw Error('Set an isolated SCHOOL_DATA_DIR for smoke testing.');
const profileDirectory=smoke?process.env.SCHOOL_DATA_DIR:path.join(app.getPath('appData'),'School Display');
fs.mkdirSync(profileDirectory,{recursive:true});
app.setPath('userData',profileDirectory);app.setPath('sessionData',profileDirectory); // Retain existing accounts and browser cache after renaming.
if(!app.requestSingleInstanceLock())app.quit();else{
 app.on('second-instance',()=>openControl());
 app.on('window-all-closed',()=>{});
 app.on('will-quit',()=>{clearInterval(pointerPoll);globalShortcut.unregisterAll();screens?.close();});
 app.on('before-quit',event=>{if(!quitting){event.preventDefault();openControl();}});
 app.whenReady().then(async()=>{
  app.setAppUserModelId('online.schooldisplay.desktop');
  const {startServer}=await import('../server/server.mjs');
  const applyAutostart=settings=>{if(!smoke&&app.isPackaged)app.setLoginItemSettings({name:'online.schooldisplay.desktop',openAtLogin:settings.autostart,path:app.getPath('exe'),args:['--background']});};
  const desktop={
   verifyInstaller,
   applyRemote:async (settings,connected)=>{remoteSettings=settings;if(!overlay)return;await screens?.sync(connected?[]:service.store.get().devices,settings||service.store.get().settings);applyBounds(effectiveSettings(),connected?[]:service.store.get().devices);},
   installUpdate:async file=>{const child=spawn(file,[],{detached:true,stdio:'ignore',windowsHide:false});await new Promise((resolve,reject)=>{child.once('spawn',resolve);child.once('error',reject);});child.unref();setTimeout(()=>desktop.exit(),250);},
   applyDevices:async (devices,settings=service.store.get().settings)=>{await screens?.sync(service?.remote?.status().configured?[]:devices,effectiveSettings(settings));applyBounds(settings,devices);},
   monitors:()=>screen.getAllDisplays().map((m,i)=>({id:String(m.id),label:`${m.label||'Monitor '+(i+1)} · ${m.size.width}×${m.size.height}`})),
   apply:async settings=>{applyAutostart(settings);applyBounds(settings);await screens?.sync(localDevices(),effectiveSettings(settings));},
   reload:async token=>{displayToken=token;await overlay.loadURL(displayUrl());},
   exit:()=>{quitting=true;screens?.close();service.close().finally(()=>app.quit());}
  };
  if(smoke&&!process.env.SCHOOL_DATA_DIR)throw Error('Set an isolated SCHOOL_DATA_DIR for smoke testing.');
  service=await startServer({directory:smoke?process.env.SCHOOL_DATA_DIR:app.getPath('userData'),port:smoke?0:4318,desktop,remoteOptions:smoke?{allowLoopback:true}:{}});displayToken=service.store.get().displayToken;remoteSettings=service.remote?.snapshot()?.settings||null;applyAutostart(service.store.get().settings);
  overlay=new BrowserWindow({width:1200,height:240,frame:false,transparent:true,alwaysOnTop:true,skipTaskbar:true,focusable:false,resizable:false,movable:false,hasShadow:false,show:false,webPreferences:{preload:path.join(__dirname,'preload.cjs'),nodeIntegration:false,contextIsolation:true,sandbox:true,backgroundThrottling:false}});
  overlay.setAlwaysOnTop(true,'screen-saver');overlay.setIgnoreMouseEvents(true,{forward:true});overlay.setMenu(null);
  overlay.on('close',event=>{if(!quitting){event.preventDefault();openControl();}});
  overlay.webContents.setWindowOpenHandler(()=>({action:'deny'}));overlay.webContents.on('will-navigate',(event,url)=>{if(url!==displayUrl())event.preventDefault();});overlay.webContents.session.setPermissionRequestHandler((_wc,_permission,callback)=>callback(false));
  ipcMain.on('school:alert',(event,style)=>{if(event.sender===overlay.webContents&&overlay.isVisible()&&Date.now()-alertAt>3000){alertAt=Date.now();shell.beep();if(style==='double')setTimeout(()=>{if(!quitting)shell.beep();},220);}});
  // Observe the OS cursor without making the overlay intercept teachers' clicks.
  ipcMain.on('school:layout',(event,bounds)=>{
   if(event.sender!==overlay.webContents||!bounds||!['x','y','width','height','contentHeight'].every(key=>Number.isFinite(bounds[key])&&bounds[key]>=0&&bounds[key]<=10000))return;
   panelBounds={x:bounds.x,y:bounds.y,width:bounds.width,height:bounds.height};
   const height=Math.ceil(bounds.contentHeight);
   const nextExpanded=bounds.expanded===true;
   if(height!==contentHeight||nextExpanded!==expanded||centered!==(bounds.centered===true)||clockOnly!==(bounds.clockOnly===true)){contentHeight=height;expanded=nextExpanded;centered=bounds.centered===true;clockOnly=bounds.clockOnly===true;applyBounds(service.store.get().settings);}
  });
  await overlay.loadURL(displayUrl());applyBounds(service.store.get().settings);
  screens=createScreens({origin:service.origin,openControl});await screens.sync(localDevices(),effectiveSettings());applyBounds(service.store.get().settings);
  pointerPoll=setInterval(()=>{
   if(overlay.isDestroyed())return;
   const cursor=screen.getCursorScreenPoint(),windowBounds=overlay.getBounds(),p=panelBounds;
   const inside=Boolean(overlay.isVisible()&&p&&cursor.x>=windowBounds.x+p.x&&cursor.x<=windowBounds.x+p.x+p.width&&cursor.y>=windowBounds.y+p.y&&cursor.y<=windowBounds.y+p.y+p.height);
   if(inside!==pointerInside){pointerInside=inside;overlay.webContents.send('school:pointer',inside);}
  },50);pointerPoll.unref();
  const image=nativeImage.createFromPath(path.join(__dirname,'../assets/icon.png'));tray=new Tray(image.resize({width:20,height:20}));tray.setToolTip('Qatar School Time Table · جدول المدرسة');tray.setContextMenu(Menu.buildFromTemplate([{label:'Open control panel · لوحة التحكم',click:openControl},{label:'Open timetable · عرض الجدول',click:()=>shell.openExternal(service.origin+'/display?token='+displayToken)},{type:'separator'},{label:'Close app (administrator) · إغلاق التطبيق',click:openControl}]));tray.on('double-click',openControl);
  globalShortcut.register('Control+Alt+Shift+S',()=>{if(service)showLocalControl();});
  const refreshDisplays=()=>{applyBounds(service.store.get().settings);screens.sync(localDevices(),effectiveSettings()).catch(()=>{});};screen.on('display-added',refreshDisplays);screen.on('display-metrics-changed',refreshDisplays);screen.on('display-removed',refreshDisplays);powerMonitor.on('resume',()=>overlay.webContents.reload());
  if(smoke){
   const progress=stage=>{if(process.env.SCHOOL_SMOKE_OUTPUT)fs.writeFileSync(process.env.SCHOOL_SMOKE_OUTPUT,JSON.stringify({stage}));};progress('started');
   assert.equal(service.store.get().admin,null,'Smoke tests require a fresh isolated database.');
   overlay.close();assert.ok(!overlay.isDestroyed(),'Normal close must preserve the overlay.');
   const password=randomBytes(24).toString('hex');let cookie='';
   async function post(route,body){return fetch(service.origin+'/api/'+route,{method:'POST',headers:{Origin:service.origin,'Content-Type':'application/json',Cookie:cookie},body:JSON.stringify(body)});}
   assert.equal((await post('exit',{password})).status,401);
   assert.equal((await post('setup',{name:'Desktop QA',email:'desktop@school.test',password})).status,200);
   const login=await post('login',{email:'desktop@school.test',password});assert.equal(login.status,200);cookie=login.headers.get('set-cookie').split(';')[0];
   assert.equal((await post('exit',{password:'wrong'})).status,403);
   Object.assign(service.store.get().settings,{lessonClock:false,lessonLeadSeconds:0,lessonStartSeconds:0,lessonFinishSeconds:0,fullscreenBreaks:false,fullscreenIdle:false,timezone:new Date().getUTCHours()<12?'UTC':'Pacific/Honolulu'});service.store.save();
   assert.equal((await post('publish',{})).status,200);
   const testDay=new Intl.DateTimeFormat('en-US',{timeZone:service.store.get().settings.timezone,weekday:'short'}).format(new Date());
   service.store.get().published=[{id:'native-lesson',day:['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].indexOf(testDay),type:'lesson',start:'00:00',end:'23:59',subjectEn:'Native lesson',subjectAr:'',teacherEn:'Teacher',teacherAr:'',room:''}];service.store.save();
   await overlay.webContents.executeJavaScript(`new Promise((resolve,reject)=>{let attempts=0;const timer=setInterval(()=>{if(document.querySelector('.activity h1')?.textContent.includes('Native lesson')){clearInterval(timer);resolve();}else if(++attempts>60){clearInterval(timer);reject(Error('Display data did not arrive'));}},100);})`);
   // Native cursor IPC must preserve the 500ms dwell while staying click-through.
   overlay.webContents.send('school:pointer',true);await new Promise(r=>setTimeout(r,250));
   assert.equal(await overlay.webContents.executeJavaScript("document.querySelector('.ribbon').classList.contains('is-hovered')"),false);
   overlay.webContents.send('school:pointer',false);await new Promise(r=>setTimeout(r,350));
   assert.equal(await overlay.webContents.executeJavaScript("document.querySelector('.ribbon').classList.contains('is-hovered')"),false);
   overlay.webContents.send('school:pointer',true);await new Promise(r=>setTimeout(r,650));
   assert.equal(await overlay.webContents.executeJavaScript("document.querySelector('.ribbon').classList.contains('is-hovered')"),true);
   overlay.webContents.send('school:pointer',false);
   const waitFor=async predicate=>{for(let i=0;i<120;i++){if(predicate())return;await new Promise(r=>setTimeout(r,100));}throw Error('Native presentation transition timed out: '+JSON.stringify({expanded,centered,clockOnly,bounds:overlay.getBounds(),contentHeight,panelBounds}));};
   service.store.get().settings.hideBar=true;service.store.save();
   await waitFor(()=>panelBounds?.width===0);assert.equal(overlay.isVisible(),true,'Background mode must keep the native alert window running.');
   assert.equal(await overlay.webContents.executeJavaScript("getComputedStyle(document.querySelector('.panel-shell')).visibility"),'hidden');
   service.store.get().published[0].id='native-background-transition';service.store.save();
   await overlay.webContents.executeJavaScript(`new Promise((resolve,reject)=>{let attempts=0;const timer=setInterval(()=>{if(document.querySelector('#alert.show')){clearInterval(timer);resolve();}else if(++attempts>90){clearInterval(timer);reject(Error('Background notification did not arrive'));}},100);})`);
   assert.equal(centered,false,'A hidden panel must not center its transparent window.');
   service.store.get().settings.hideBar=false;service.store.save();await waitFor(()=>panelBounds.width>400&&!centered);
   Object.assign(service.store.get().settings,{panelWidth:420,textScale:140,horizontal:'right',edgeMargin:80,position:'bottom'});service.store.save();applyBounds(service.store.get().settings);
   await overlay.webContents.executeJavaScript(`new Promise((resolve,reject)=>{let attempts=0;const timer=setInterval(()=>{if(document.body.style.getPropertyValue('--panel-width')==='420px'&&document.body.dataset.align==='right'){clearInterval(timer);resolve();}else if(++attempts>60){clearInterval(timer);reject(Error('Panel adjustment did not arrive'));}},100);})`);
   overlay.webContents.send('school:pointer',false);await new Promise(r=>setTimeout(r,300));await overlay.webContents.executeJavaScript("window.dispatchEvent(new Event('resize'))");await waitFor(()=>Math.abs(panelBounds.width-420)<2);const adjustedWindow=overlay.getBounds(),adjustedPanel=panelBounds,adjustedArea=screen.getPrimaryDisplay().workArea;
   assert.ok(Math.abs(adjustedPanel.width-420)<2);assert.ok(Math.abs(adjustedArea.x+adjustedArea.width-adjustedWindow.x-adjustedPanel.x-adjustedPanel.width-80)<3);
   Object.assign(service.store.get().settings,{panelWidth:680,textScale:100,horizontal:'center',edgeMargin:12,position:'top'});service.store.save();applyBounds(service.store.get().settings);
   const {schoolClock}=await import('../shared/schedule.mjs');const day=schoolClock(new Date(),service.store.get().settings.timezone).day;
   service.store.get().published=[{id:'native-break',day,type:'break',start:'00:00',end:'23:59',subjectEn:'Break',subjectAr:'',teacherEn:'',teacherAr:'',room:''}];service.store.get().settings.fullscreenBreaks=true;service.store.save();
   await waitFor(()=>centered);const eventBounds=overlay.getBounds(),workArea=screen.getPrimaryDisplay().workArea;assert.ok(Math.abs(eventBounds.y+eventBounds.height/2-workArea.y-workArea.height/2)<2);await waitFor(()=>expanded);assert.deepEqual(overlay.getBounds(),screen.getPrimaryDisplay().bounds);
   progress('fullscreen-verified');const controller=showLocalControl();progress('controller-created');assert.equal(controller.isAlwaysOnTop(),true);await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(Error('Admin panel did not load')),5000);controller.webContents.once('did-finish-load',()=>{clearTimeout(timeout);resolve();});});progress('controller-loaded');controller.close();
   await overlay.webContents.executeJavaScript("document.querySelector('.exit-fullscreen').click()");await waitFor(()=>!expanded);await new Promise(r=>setTimeout(r,3300));assert.equal(expanded,false,'Exit must survive synchronization');
   service.store.get().published=[];service.store.save();await waitFor(()=>clockOnly&&overlay.getBounds().width<200);assert.ok(await overlay.webContents.executeJavaScript("document.querySelector('.ribbon').getBoundingClientRect().width<=121"));
   assert.ok(overlay.getBounds().height<screen.getPrimaryDisplay().bounds.height);
   const result={packaged:app.isPackaged,alwaysOnTop:overlay.isAlwaysOnTop(),focusable:overlay.isFocusable(),normalCloseBlocked:!overlay.isDestroyed(),unauthenticatedExitBlocked:true,incorrectPasswordBlocked:true,published:true,bounds:overlay.getBounds(),url:service.origin,version:process.versions.electron,userData:app.getPath('userData')};
   result.fullScreenAndCompactRestoreVerified=true;result.idleClockVerified=true;result.nativeCenterPopupVerified=true;result.fullscreenExitButtonVerified=true;
   result.adminControlsAboveFullScreenVerified=true;
   result.nativeHoverDelayVerified=true;result.nativePanelAdjustmentVerified=true;result.panelBounds=panelBounds;
   result.backgroundModeVerified=true;
   assert.equal(result.alwaysOnTop,true);assert.equal(result.focusable,false);
   const added=await post('devices',{name:'Native classroom',classId:'default',monitor:String(screen.getPrimaryDisplay().id),enabled:true});assert.equal(added.status,200);const addedDevice=(await added.json()).device;
   await waitFor(()=>screens.count()===1&&!overlay.isVisible());
   let screenOnline=false;for(let attempt=0;attempt<90;attempt++){const state=await fetch(service.origin+'/api/state',{headers:{Cookie:cookie}}).then(r=>r.json());if(state.devices.find(d=>d.id===addedDevice.id)?.status==='online'){screenOnline=true;break;}await new Promise(r=>setTimeout(r,100));}assert.ok(screenOnline,'Assigned native screen must report its published revision');
   const disabled=await fetch(service.origin+'/api/devices',{method:'PUT',headers:{Origin:service.origin,'Content-Type':'application/json',Cookie:cookie},body:JSON.stringify({...addedDevice,enabled:false})});assert.equal(disabled.status,200);await waitFor(()=>screens.count()===0&&overlay.isVisible());result.classroomScreenAssignmentVerified=true;
   const central=await startServer({directory:path.join(process.env.SCHOOL_DATA_DIR,'central-smoke'),port:0,updateEnv:{}});
   try{
    Object.assign(central.store.get(),{admin:{...service.store.get().admin},publishedAt:new Date().toISOString(),revision:1,published:[{id:'remote-native',classId:'default',day,type:'lesson',start:'00:00',end:'23:59',subjectEn:'Remote classroom lesson',subjectAr:'',teacherEn:'Remote teacher',teacherAr:'',room:''}]});
    Object.assign(central.store.get().settings,{timezone:service.store.get().settings.timezone,schoolEn:'Remote native school',lessonClock:false,panelWidth:500,fullscreenBreaks:false});central.store.save();
    assert.equal((await post('remote',{url:central.origin+'/display?token='+central.store.get().displayToken,password})).status,200);
    await overlay.webContents.executeJavaScript(`new Promise((resolve,reject)=>{let attempts=0;const timer=setInterval(()=>{if(document.querySelector('.activity h1')?.textContent.includes('Remote classroom lesson')){clearInterval(timer);resolve();}else if(++attempts>90){clearInterval(timer);reject(Error('Remote native timetable did not arrive'));}},100);})`);
    await new Promise(r=>setTimeout(r,5500));await waitFor(()=>!centered&&!clockOnly&&Math.abs(panelBounds.width-500)<3);
    assert.equal(overlay.isAlwaysOnTop(),true);result.remoteNativeSynchronizationVerified=true;
    assert.equal((await post('remote',{disconnect:true,password})).status,200);assert.equal(service.remote.status().configured,false);
   }finally{await central.close();}
   progress('lesson-flow-start');Object.assign(service.store.get().settings,{lessonClock:true,lessonLeadSeconds:10,lessonStartSeconds:3,lessonFinishSeconds:3,fullscreenBreaks:false,timezone:'UTC'});
   service.store.get().published=[{id:'native-new-math',classId:'default',day:0,type:'lesson',start:'07:30',end:'07:31',subjectEn:'Native new lesson',subjectAr:'',teacherEn:'Teacher',teacherAr:'',room:''},{id:'native-new-next',classId:'default',day:0,type:'lesson',start:'07:31',end:'08:00',subjectEn:'Native next lesson',subjectAr:'',teacherEn:'Teacher',teacherAr:'',room:''}];service.store.get().revision++;service.store.save();
   await overlay.webContents.executeJavaScript(`window.__nativeTime=Date.parse('2026-10-25T07:29:54Z');window.__nativeAt=Date.now();window.__nativeSeen=0;window.__nativeFetch=window.fetch;window.fetch=async(...args)=>{const response=await window.__nativeFetch(...args);if(String(args[0]).startsWith('/api/display')&&response.ok){const value=await response.json();value.serverTime=window.__nativeTime+Date.now()-window.__nativeAt;window.__nativeSeen=window.__nativeTime;return new Response(JSON.stringify(value));}return response;};void 0;`);
   const seekNative=async time=>{await overlay.webContents.executeJavaScript(`window.__nativeTime=Date.parse('2026-10-25T${time}Z');window.__nativeAt=Date.now();`);await overlay.webContents.executeJavaScript(`new Promise((resolve,reject)=>{let count=0;const timer=setInterval(()=>{if(window.__nativeSeen===window.__nativeTime){clearInterval(timer);resolve();}else if(++count>90){clearInterval(timer);reject(Error('Native test clock did not synchronize'));}},100);})`);await new Promise(r=>setTimeout(r,350));};
   await waitFor(()=>expanded);assert.ok(await overlay.webContents.executeJavaScript("document.querySelector('.cinema-eyebrow').textContent.includes('starts soon')"));
   await seekNative('07:30:10');await waitFor(()=>!expanded&&!clockOnly);await new Promise(r=>setTimeout(r,8500));
   assert.ok(await overlay.webContents.executeJavaScript("document.body.classList.contains('lesson-clock')&&document.querySelector('.ribbon').textContent.trim()==='07:30'"));
   const dockWindow=overlay.getBounds(),dockArea=screen.getPrimaryDisplay().workArea;assert.ok(Math.abs(dockWindow.x+panelBounds.x+panelBounds.width-(dockArea.x+dockArea.width))<65);assert.equal(overlay.isAlwaysOnTop(),true);
   await seekNative('07:30:52');await seekNative('07:31:00');await waitFor(()=>expanded);assert.ok(await overlay.webContents.executeJavaScript("document.querySelector('.cinema-eyebrow').textContent.includes('Lesson finished')"));await waitFor(()=>!expanded);result.lessonClockFlowVerified=true;
   assert.equal((await post('exit',{password})).status,200);result.authorizedExitAccepted=true;
   if(process.env.SCHOOL_SMOKE_OUTPUT)fs.writeFileSync(process.env.SCHOOL_SMOKE_OUTPUT,JSON.stringify(result,null,2));return;
  }
  void service.remote?.sync();
  if(!process.argv.includes('--background'))openControl();
 }).catch(error=>{quitting=true;if(smoke){if(process.env.SCHOOL_SMOKE_OUTPUT)fs.writeFileSync(process.env.SCHOOL_SMOKE_OUTPUT,JSON.stringify({error:error.stack},null,2));screens?.close();overlay?.destroy();controlWindow?.destroy();app.exit(1);return;}dialog.showErrorBox('Qatar School Time Table',error.code==='EADDRINUSE'?'Port 4318 is already in use. Close the local preview or the other Qatar School Time Table instance, then reopen the app.':error.message);app.exit(1);});
}
function displayUrl(){return service.origin+'/display?overlay=1&token='+displayToken;}
function openControl(){if(service&&!smoke){if(expanded)showLocalControl();else shell.openExternal(service.origin+'/control');}}
function showLocalControl(){
 if(controlWindow&&!controlWindow.isDestroyed()){controlWindow.show();controlWindow.focus();return controlWindow;}
 const area=screen.getPrimaryDisplay().workArea;
 controlWindow=new BrowserWindow({width:Math.min(1180,area.width-40),height:Math.min(850,area.height-40),alwaysOnTop:true,show:!smoke,title:'Qatar School Time Table · Administrator',webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true}});
 controlWindow.setAlwaysOnTop(true,'screen-saver');controlWindow.setMenu(null);
 controlWindow.webContents.setWindowOpenHandler(({url})=>{try{const target=new URL(url);if(target.origin===service.origin&&target.pathname==='/display')shell.openExternal(url);}catch{}return {action:'deny'};});
 controlWindow.webContents.on('will-navigate',(event,url)=>{if(url!==service.origin+'/control'&&url!==service.origin+'/')event.preventDefault();});
 controlWindow.on('closed',()=>{controlWindow=null;});controlWindow.loadURL(service.origin+'/control').catch(error=>{if(!smoke&&controlWindow&&!controlWindow.isDestroyed()&&error.code!=='ERR_ABORTED'&&error.errno!==-3)dialog.showErrorBox('Qatar School Time Table',error.message);});return controlWindow;
}
function effectiveSettings(local=service?.store.get().settings){return remoteSettings?{...remoteSettings,monitor:local.monitor,autostart:local.autostart}:local;}
function localDevices(){return service?.remote?.status().configured?[]:service.store.get().devices;}
function applyBounds(settings,devices=localDevices()){
 settings=effectiveSettings(settings);if(service?.remote?.status().configured)devices=[];
 if(!overlay)return;
 const monitor=screen.getAllDisplays().find(m=>String(m.id)===settings.monitor)||screen.getPrimaryDisplay();
 overlay.setBounds(overlayBounds(monitor,{expanded,centered,clockOnly,contentHeight,position:settings.position,horizontal:settings.horizontal,edgeMargin:settings.edgeMargin}));
 // Photo mode accepts mouse/touch for its Exit button. Teaching and clock modes stay click-through.
 overlay.setIgnoreMouseEvents(!expanded,{forward:true});
 if(settings.paused||devices.some(d=>d.enabled&&d.monitor===String(monitor.id)&&d.monitor!=='browser'))overlay.hide();else{overlay.showInactive();if(controlWindow&&!controlWindow.isDestroyed()&&controlWindow.isVisible())controlWindow.moveTop();}
}
