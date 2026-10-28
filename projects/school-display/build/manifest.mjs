import {readFileSync,writeFileSync,statSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {join} from 'node:path';
const pkg=JSON.parse(readFileSync('package.json','utf8'));
const artifacts=[`Qatar-School-Time-Table-Setup-${pkg.version}-x64.exe`,`Qatar-School-Time-Table-Portable-${pkg.version}-x64.exe`].map(file=>({file,bytes:statSync(join('releases',file)).size,sha256:createHash('sha256').update(readFileSync(join('releases',file))).digest('hex')}));
const manifest={version:pkg.version,sourceCommit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),builtAt:new Date().toISOString(),signedBuild:process.env.SCHOOL_SIGNED_BUILD==='true',artifacts};
writeFileSync('releases/build-manifest.json',JSON.stringify(manifest,null,2));
writeFileSync('releases/SHA256SUMS.txt',artifacts.map(a=>a.sha256+'  '+a.file).join('\n')+'\n');
if(process.env.SCHOOL_RELEASE_BASE_URL){const base=new URL(process.env.SCHOOL_RELEASE_BASE_URL);if(base.protocol!=='https:')throw Error('Release downloads require HTTPS.');writeFileSync('releases/latest.json',JSON.stringify({version:pkg.version,url:new URL(artifacts[0].file,base).href,sha256:artifacts[0].sha256,bytes:artifacts[0].bytes},null,2));}
console.log(`Created manifest and checksums for School Display ${pkg.version}.`);
