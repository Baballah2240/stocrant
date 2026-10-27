// Used only by dist:win:signed. Fail closed when publisher credentials are absent.
if(!(process.env.WIN_CSC_LINK||process.env.CSC_LINK))throw Error('Set WIN_CSC_LINK and WIN_CSC_KEY_PASSWORD using your signing provider.');
const base=require('../package.json').build;module.exports={...base,forceCodeSigning:true,win:{...base.win,signExecutable:true}};
