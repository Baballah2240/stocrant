import {existsSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {resolve,join} from 'node:path';
const root=resolve(import.meta.dirname,'..'),dir=join(root,'flutter_app');
const local=join(root,'.qa','flutter-sdk','bin','flutter.bat');
const binary=process.env.FLUTTER_ROOT?join(process.env.FLUTTER_ROOT,'bin',process.platform==='win32'?'flutter.bat':'flutter'):existsSync(local)?local:'flutter';
const operation=process.argv[2];
const commands={check:[['analyze'],['test']],windows:[['build','windows','--release']],android:[['build','apk','--debug']],run:[['run','-d',process.platform==='win32'?'windows':'android']]};
if(!commands[operation])throw Error('Choose check, windows, android or run.');
const env={...process.env};
if(process.platform==='win32')env.ANDROID_HOME||=join(env.LOCALAPPDATA,'Android','Sdk');
for(const args of commands[operation]){
 const quote=value=>"'"+value.replaceAll("'","''")+"'";
 const script=`& ${quote(binary)} ${args.map(quote).join(' ')}\nexit $LASTEXITCODE`;
 const executable=process.platform==='win32'?'powershell.exe':binary;
 const parameters=process.platform==='win32'?['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')]:args;
 const code=await new Promise((accept,reject)=>{const child=spawn(executable,parameters,{cwd:dir,env,stdio:'inherit',windowsHide:true});child.once('error',reject);child.once('exit',accept);});
 if(code!==0)process.exit(code||1);
}
