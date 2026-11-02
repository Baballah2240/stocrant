import {copyFileSync,mkdirSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
// The phone app runs the same teacher pages as /teacher, plus native notifications.
const mobile=fileURLToPath(new URL('..',import.meta.url)),project=join(mobile,'..'),www=join(mobile,'www');
rmSync(www,{recursive:true,force:true});mkdirSync(www,{recursive:true});
const copy=(from,to)=>copyFileSync(join(project,from),join(www,to));
for(const name of ['teacher.js','teacher.css','teacher-i18n.js'])copy('web/'+name,name);
for(const name of ['schedule.mjs','media.mjs','teacher-plan.mjs'])copy('shared/'+name,name);
copy('assets/icon.svg','icon.svg');
copyFileSync(join(mobile,'node_modules/@capacitor/core/dist/capacitor.js'),join(www,'capacitor-core.js'));
copyFileSync(join(mobile,'node_modules/@capacitor/local-notifications/dist/plugin.js'),join(www,'local-notifications.js'));
const page=readFileSync(join(project,'web/teacher.html'),'utf8');
const head=`<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src https:; base-uri 'none'; form-action 'none'; object-src 'none'"><script src="capacitor-core.js"></script><script src="local-notifications.js"></script>`;
const marker='<script type="module"';if(!page.includes(marker))throw Error('The teacher page layout changed.');
writeFileSync(join(www,'index.html'),page.replace(marker,head+marker));
console.log('Teacher app files copied to mobile/www.');
