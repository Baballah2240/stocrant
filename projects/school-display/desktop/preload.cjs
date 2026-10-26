const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('schoolDesktop',Object.freeze({
 alert:()=>ipcRenderer.send('school:alert'),
 reportLayout:bounds=>ipcRenderer.send('school:layout',bounds),
 onPointer:callback=>{const listener=(_event,inside)=>callback(inside===true);ipcRenderer.on('school:pointer',listener);return()=>ipcRenderer.removeListener('school:pointer',listener);}
}));
