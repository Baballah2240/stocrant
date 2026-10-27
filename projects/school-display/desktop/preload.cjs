const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('schoolDesktop',Object.freeze({
 alert:style=>ipcRenderer.send('school:alert',style==='double'?'double':'single'),
 reportLayout:bounds=>ipcRenderer.send('school:layout',bounds),
 onPointer:callback=>{const listener=(_event,inside)=>callback(inside===true);ipcRenderer.on('school:pointer',listener);return()=>ipcRenderer.removeListener('school:pointer',listener);}
}));
