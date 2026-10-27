const {BrowserWindow,ipcMain,screen,shell}=require('electron');
const path=require('node:path');
const {overlayBounds}=require('./bounds.cjs');
function createScreens({origin,openControl}){
 const windows=new Map();let devices=[],settings={},closing=false,lastAlert=0;
 function apply(item){const display=screen.getAllDisplays().find(m=>String(m.id)===item.device.monitor);if(!display){item.window.hide();return;}item.window.setBounds(overlayBounds(display,{...item.layout,position:settings.position,horizontal:settings.horizontal,edgeMargin:settings.edgeMargin}));item.window.setIgnoreMouseEvents(!item.layout.expanded,{forward:true});if(settings.paused)item.window.hide();else item.window.showInactive();}
 const onLayout=(event,bounds)=>{const item=[...windows.values()].find(i=>i.window.webContents===event.sender);if(!item||!bounds||!['x','y','width','height','contentHeight'].every(k=>Number.isFinite(bounds[k])&&bounds[k]>=0&&bounds[k]<=10000))return;item.panel=bounds;item.layout={contentHeight:bounds.contentHeight,expanded:bounds.expanded===true,centered:bounds.centered===true,clockOnly:bounds.clockOnly===true};apply(item);};
 const onAlert=(event,style)=>{if(![...windows.values()].some(i=>i.window.webContents===event.sender&&i.window.isVisible())||Date.now()-lastAlert<3000)return;lastAlert=Date.now();shell.beep();if(style==='double')setTimeout(()=>{if(!closing)shell.beep();},220);};
 ipcMain.on('school:layout',onLayout);ipcMain.on('school:alert',onAlert);
 const pointer=setInterval(()=>{const cursor=screen.getCursorScreenPoint();for(const item of windows.values()){const bounds=item.window.getBounds(),p=item.panel,inside=Boolean(p&&item.window.isVisible()&&cursor.x>=bounds.x+p.x&&cursor.x<=bounds.x+p.x+p.width&&cursor.y>=bounds.y+p.y&&cursor.y<=bounds.y+p.y+p.height);if(inside!==item.inside){item.inside=inside;item.window.webContents.send('school:pointer',inside);}}},50);pointer.unref();
 async function sync(next,nextSettings){devices=next;settings=nextSettings;const active=devices.filter(d=>d.enabled&&d.monitor!=='browser'&&screen.getAllDisplays().some(m=>String(m.id)===d.monitor));
  for(const [id,item] of windows)if(!active.some(d=>d.id===id)){item.window.destroy();windows.delete(id);}
  for(const device of active){let item=windows.get(device.id);const url=origin+'/display?overlay=1&token='+device.token;
   if(!item){const window=new BrowserWindow({width:1200,height:200,frame:false,transparent:true,alwaysOnTop:true,skipTaskbar:true,focusable:false,movable:false,resizable:false,hasShadow:false,show:false,webPreferences:{preload:path.join(__dirname,'preload.cjs'),sandbox:true,contextIsolation:true,nodeIntegration:false,backgroundThrottling:false}});window.setAlwaysOnTop(true,'screen-saver');window.setMenu(null);window.on('close',event=>{if(!closing){event.preventDefault();openControl();}});window.webContents.setWindowOpenHandler(()=>({action:'deny'}));window.webContents.on('will-navigate',(event,nextUrl)=>{if(nextUrl!==item.url)event.preventDefault();});item={window,device,url,layout:{contentHeight:180},inside:null};windows.set(device.id,item);await window.loadURL(url);
   }else{item.device=device;if(item.url!==url){item.url=url;await item.window.loadURL(url);}}apply(item);
  }
 }
 return {sync,hasMonitor:id=>devices.some(d=>d.enabled&&d.monitor===String(id)&&screen.getAllDisplays().some(m=>String(m.id)===d.monitor)),count:()=>windows.size,close:()=>{closing=true;clearInterval(pointer);ipcMain.removeListener('school:layout',onLayout);ipcMain.removeListener('school:alert',onAlert);for(const item of windows.values())item.window.destroy();windows.clear();}};
}
module.exports={createScreens};
