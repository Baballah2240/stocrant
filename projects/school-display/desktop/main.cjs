const {app,BrowserWindow,Tray,Menu,shell,screen,nativeImage,ipcMain,dialog,powerMonitor,globalShortcut}=require('electron');
const path=require('node:path');
const {overlayBounds}=require('./bounds.cjs');
const fs=require('node:fs');
const assert=require('node:assert/strict');
const {randomBytes}=require('node:crypto');
let service,overlay,tray,quitting=false,displayToken,alertAt=0,pointerPoll,panelBounds=null,contentHeight=240,pointerInside=null,expanded=false,centered=false,clockOnly=false,controlWindow=null;
const smoke=process.argv.includes('--smoke-test');
if(smoke&&process.env.SCHOOL_DATA_DIR)app.setPath('userData',process.env.SCHOOL_DATA_DIR);
if(!app.requestSingleInstanceLock())app.quit();else{
 app.on('second-instance',()=>openControl());
 app.on('window-all-closed',()=>{});
 app.on('will-quit',()=>{clearInterval(pointerPoll);globalShortcut.unregisterAll();});
 app.on('before-quit',event=>{if(!quitting){event.preventDefault();openControl();}});
 app.whenReady().then(async()=>{
  app.setAppUserModelId('online.schooldisplay.desktop');
  const {startServer}=await import('../server/server.mjs');
  const desktop={
   monitors:()=>screen.getAllDisplays().map((m,i)=>({id:String(m.id),label:`${m.label||'Monitor '+(i+1)} · ${m.size.width}×${m.size.height}`})),
   apply:async settings=>{if(!smoke&&app.isPackaged)app.setLoginItemSettings({openAtLogin:settings.autostart,path:app.getPath('exe'),args:['--background']});applyBounds(settings);},
   reload:async token=>{displayToken=token;await overlay.loadURL(displayUrl());},
   exit:()=>{quitting=true;service.close().finally(()=>app.quit());}
  };
  if(smoke&&!process.env.SCHOOL_DATA_DIR)throw Error('Set an isolated SCHOOL_DATA_DIR for smoke testing.');
  service=await startServer({directory:smoke?process.env.SCHOOL_DATA_DIR:app.getPath('userData'),port:smoke?0:4318,desktop});displayToken=service.store.get().displayToken;
  overlay=new BrowserWindow({width:1200,height:240,frame:false,transparent:true,alwaysOnTop:true,skipTaskbar:true,focusable:false,resizable:false,movable:false,hasShadow:false,show:false,webPreferences:{preload:path.join(__dirname,'preload.cjs'),nodeIntegration:false,contextIsolation:true,sandbox:true,backgroundThrottling:false}});
  overlay.setAlwaysOnTop(true,'screen-saver');overlay.setIgnoreMouseEvents(true,{forward:true});overlay.setMenu(null);
  overlay.on('close',event=>{if(!quitting){event.preventDefault();openControl();}});
  overlay.webContents.setWindowOpenHandler(()=>({action:'deny'}));overlay.webContents.on('will-navigate',(event,url)=>{if(url!==displayUrl())event.preventDefault();});overlay.webContents.session.setPermissionRequestHandler((_wc,_permission,callback)=>callback(false));
  ipcMain.on('school:alert',event=>{if(event.sender===overlay.webContents&&Date.now()-alertAt>3000){alertAt=Date.now();shell.beep();}});
  // Observe the OS cursor without making the overlay intercept teachers' clicks.
  ipcMain.on('school:layout',(event,bounds)=>{
   if(event.sender!==overlay.webContents||!bounds||!['x','y','width','height','contentHeight'].every(key=>Number.isFinite(bounds[key])&&bounds[key]>=0&&bounds[key]<=10000))return;
   panelBounds={x:bounds.x,y:bounds.y,width:bounds.width,height:bounds.height};
   const height=Math.ceil(bounds.contentHeight);
   const nextExpanded=bounds.expanded===true;
   if(height!==contentHeight||nextExpanded!==expanded||centered!==(bounds.centered===true)||clockOnly!==(bounds.clockOnly===true)){contentHeight=height;expanded=nextExpanded;centered=bounds.centered===true;clockOnly=bounds.clockOnly===true;applyBounds(service.store.get().settings);}
  });
  await overlay.loadURL(displayUrl());applyBounds(service.store.get().settings);
  pointerPoll=setInterval(()=>{
   if(overlay.isDestroyed())return;
   const cursor=screen.getCursorScreenPoint(),windowBounds=overlay.getBounds(),p=panelBounds;
   const inside=Boolean(overlay.isVisible()&&p&&cursor.x>=windowBounds.x+p.x&&cursor.x<=windowBounds.x+p.x+p.width&&cursor.y>=windowBounds.y+p.y&&cursor.y<=windowBounds.y+p.y+p.height);
   if(inside!==pointerInside){pointerInside=inside;overlay.webContents.send('school:pointer',inside);}
  },50);pointerPoll.unref();
  const image=nativeImage.createFromPath(path.join(__dirname,'../assets/icon.png'));tray=new Tray(image.resize({width:20,height:20}));tray.setToolTip('School Display · جدول المدرسة');tray.setContextMenu(Menu.buildFromTemplate([{label:'Open control panel · لوحة التحكم',click:openControl},{label:'Open timetable · عرض الجدول',click:()=>shell.openExternal(service.origin+'/display?token='+displayToken)},{type:'separator'},{label:'Close app (administrator) · إغلاق التطبيق',click:openControl}]));tray.on('double-click',openControl);
  globalShortcut.register('Control+Alt+Shift+S',()=>{if(service)showLocalControl();});
  screen.on('display-added',()=>applyBounds(service.store.get().settings));screen.on('display-metrics-changed',()=>applyBounds(service.store.get().settings));screen.on('display-removed',()=>applyBounds(service.store.get().settings));powerMonitor.on('resume',()=>overlay.webContents.reload());
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
   Object.assign(service.store.get().settings,{fullscreenBreaks:false,fullscreenIdle:false,timezone:new Date().getUTCHours()<12?'UTC':'Pacific/Honolulu'});service.store.save();
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
   result.nativeHoverDelayVerified=true;result.panelBounds=panelBounds;
   assert.equal(result.alwaysOnTop,true);assert.equal(result.focusable,false);
   assert.equal((await post('exit',{password})).status,200);result.authorizedExitAccepted=true;
   if(process.env.SCHOOL_SMOKE_OUTPUT)fs.writeFileSync(process.env.SCHOOL_SMOKE_OUTPUT,JSON.stringify(result,null,2));return;
  }
  if(!process.argv.includes('--background'))openControl();
 }).catch(error=>{quitting=true;if(smoke){if(process.env.SCHOOL_SMOKE_OUTPUT)fs.writeFileSync(process.env.SCHOOL_SMOKE_OUTPUT,JSON.stringify({error:error.stack},null,2));overlay?.destroy();controlWindow?.destroy();app.exit(1);return;}dialog.showErrorBox('School Display',error.code==='EADDRINUSE'?'Port 4318 is already in use. Close the local preview or the other School Display instance, then reopen the app.':error.message);app.exit(1);});
}
function displayUrl(){return service.origin+'/display?overlay=1&token='+displayToken;}
function openControl(){if(service&&!smoke){if(expanded)showLocalControl();else shell.openExternal(service.origin+'/control');}}
function showLocalControl(){
 if(controlWindow&&!controlWindow.isDestroyed()){controlWindow.show();controlWindow.focus();return controlWindow;}
 const area=screen.getPrimaryDisplay().workArea;
 controlWindow=new BrowserWindow({width:Math.min(1180,area.width-40),height:Math.min(850,area.height-40),alwaysOnTop:true,show:!smoke,title:'School Display · Administrator',webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true}});
 controlWindow.setAlwaysOnTop(true,'screen-saver');controlWindow.setMenu(null);
 controlWindow.webContents.setWindowOpenHandler(()=>({action:'deny'}));
 controlWindow.webContents.on('will-navigate',(event,url)=>{if(url!==service.origin+'/control'&&url!==service.origin+'/')event.preventDefault();});
 controlWindow.on('closed',()=>{controlWindow=null;});controlWindow.loadURL(service.origin+'/control').catch(error=>{if(!smoke&&controlWindow&&!controlWindow.isDestroyed()&&error.code!=='ERR_ABORTED'&&error.errno!==-3)dialog.showErrorBox('School Display',error.message);});return controlWindow;
}
function applyBounds(settings){
 if(!overlay)return;
 const monitor=screen.getAllDisplays().find(m=>String(m.id)===settings.monitor)||screen.getPrimaryDisplay();
 overlay.setBounds(overlayBounds(monitor,{expanded,centered,clockOnly,contentHeight,position:settings.position}));
 // Photo mode accepts mouse/touch for its Exit button. Teaching and clock modes stay click-through.
 overlay.setIgnoreMouseEvents(!expanded,{forward:true});
 if(settings.paused)overlay.hide();else{overlay.showInactive();if(controlWindow&&!controlWindow.isDestroyed()&&controlWindow.isVisible())controlWindow.moveTop();}
}
