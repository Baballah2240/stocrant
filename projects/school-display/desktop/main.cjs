const {app,BrowserWindow,Tray,Menu,shell,screen,nativeImage,ipcMain,dialog,powerMonitor}=require('electron');
const path=require('node:path');
const fs=require('node:fs');
const assert=require('node:assert/strict');
const {randomBytes}=require('node:crypto');
let service,overlay,tray,quitting=false,displayToken,alertAt=0,pointerPoll,panelBounds=null,contentHeight=240,pointerInside=null;
const smoke=process.argv.includes('--smoke-test');
if(smoke&&process.env.SCHOOL_DATA_DIR)app.setPath('userData',process.env.SCHOOL_DATA_DIR);
if(!app.requestSingleInstanceLock())app.quit();else{
 app.on('second-instance',()=>openControl());
 app.on('window-all-closed',()=>{});
 app.on('will-quit',()=>clearInterval(pointerPoll));
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
   if(height!==contentHeight){contentHeight=height;applyBounds(service.store.get().settings);}
  });
  await overlay.loadURL(displayUrl());applyBounds(service.store.get().settings);
  pointerPoll=setInterval(()=>{
   if(overlay.isDestroyed())return;
   const cursor=screen.getCursorScreenPoint(),windowBounds=overlay.getBounds(),p=panelBounds;
   const inside=Boolean(overlay.isVisible()&&p&&cursor.x>=windowBounds.x+p.x&&cursor.x<=windowBounds.x+p.x+p.width&&cursor.y>=windowBounds.y+p.y&&cursor.y<=windowBounds.y+p.y+p.height);
   if(inside!==pointerInside){pointerInside=inside;overlay.webContents.send('school:pointer',inside);}
  },50);pointerPoll.unref();
  const image=nativeImage.createFromPath(path.join(__dirname,'../assets/icon.png'));tray=new Tray(image.resize({width:20,height:20}));tray.setToolTip('School Display · جدول المدرسة');tray.setContextMenu(Menu.buildFromTemplate([{label:'Open control panel · لوحة التحكم',click:openControl},{label:'Open timetable · عرض الجدول',click:()=>shell.openExternal(service.origin+'/display?token='+displayToken)},{type:'separator'},{label:'Close app (administrator) · إغلاق التطبيق',click:openControl}]));tray.on('double-click',openControl);
  screen.on('display-metrics-changed',()=>applyBounds(service.store.get().settings));screen.on('display-removed',()=>applyBounds(service.store.get().settings));powerMonitor.on('resume',()=>overlay.webContents.reload());
  if(smoke){
   assert.equal(service.store.get().admin,null,'Smoke tests require a fresh isolated database.');
   overlay.close();assert.ok(!overlay.isDestroyed(),'Normal close must preserve the overlay.');
   const password=randomBytes(24).toString('hex');let cookie='';
   async function post(route,body){return fetch(service.origin+'/api/'+route,{method:'POST',headers:{Origin:service.origin,'Content-Type':'application/json',Cookie:cookie},body:JSON.stringify(body)});}
   assert.equal((await post('exit',{password})).status,401);
   assert.equal((await post('setup',{name:'Desktop QA',email:'desktop@school.test',password})).status,200);
   const login=await post('login',{email:'desktop@school.test',password});assert.equal(login.status,200);cookie=login.headers.get('set-cookie').split(';')[0];
   assert.equal((await post('exit',{password:'wrong'})).status,403);
   assert.equal((await post('publish',{})).status,200);
   await overlay.webContents.executeJavaScript(`new Promise((resolve,reject)=>{let attempts=0;const timer=setInterval(()=>{if(document.querySelector('.publication')){clearInterval(timer);resolve();}else if(++attempts>60){clearInterval(timer);reject(Error('Display data did not arrive'));}},100);})`);
   // Native cursor IPC must preserve the 500ms dwell while staying click-through.
   overlay.webContents.send('school:pointer',true);await new Promise(r=>setTimeout(r,250));
   assert.equal(await overlay.webContents.executeJavaScript("document.querySelector('.ribbon').classList.contains('is-hovered')"),false);
   overlay.webContents.send('school:pointer',false);await new Promise(r=>setTimeout(r,350));
   assert.equal(await overlay.webContents.executeJavaScript("document.querySelector('.ribbon').classList.contains('is-hovered')"),false);
   overlay.webContents.send('school:pointer',true);await new Promise(r=>setTimeout(r,650));
   assert.equal(await overlay.webContents.executeJavaScript("document.querySelector('.ribbon').classList.contains('is-hovered')"),true);
   overlay.webContents.send('school:pointer',false);
   const result={packaged:app.isPackaged,alwaysOnTop:overlay.isAlwaysOnTop(),focusable:overlay.isFocusable(),normalCloseBlocked:!overlay.isDestroyed(),unauthenticatedExitBlocked:true,incorrectPasswordBlocked:true,published:true,bounds:overlay.getBounds(),url:service.origin,version:process.versions.electron,userData:app.getPath('userData')};
   result.nativeHoverDelayVerified=true;result.panelBounds=panelBounds;
   assert.equal(result.alwaysOnTop,true);assert.equal(result.focusable,false);
   assert.equal((await post('exit',{password})).status,200);result.authorizedExitAccepted=true;
   if(process.env.SCHOOL_SMOKE_OUTPUT)fs.writeFileSync(process.env.SCHOOL_SMOKE_OUTPUT,JSON.stringify(result,null,2));return;
  }
  if(!process.argv.includes('--background'))openControl();
 }).catch(error=>{quitting=true;dialog.showErrorBox('School Display',error.code==='EADDRINUSE'?'Port 4318 is already in use. Close the local preview or the other School Display instance, then reopen the app.':error.message);app.exit(1);});
}
function displayUrl(){return service.origin+'/display?overlay=1&token='+displayToken;}
function openControl(){if(service&&!smoke)shell.openExternal(service.origin+'/control');}
function applyBounds(settings){if(!overlay)return;const monitor=screen.getAllDisplays().find(m=>String(m.id)===settings.monitor)||screen.getPrimaryDisplay(),area=monitor.workArea;const height=Math.min(Math.max(140,contentHeight),area.height-24);overlay.setBounds({x:area.x+12,y:settings.position==='bottom'?area.y+area.height-height-12:area.y+12,width:Math.max(300,area.width-24),height});overlay.setIgnoreMouseEvents(true,{forward:true});if(settings.paused)overlay.hide();else overlay.showInactive();}
