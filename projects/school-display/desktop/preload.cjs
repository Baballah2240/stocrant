const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('schoolDesktop',Object.freeze({alert:()=>ipcRenderer.send('school:alert')}));
