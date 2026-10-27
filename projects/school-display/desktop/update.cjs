const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const run=promisify(execFile);
async function verifyInstaller(file){
 // Pass the path through the environment, never interpolate it into PowerShell code.
 const script="$signature=Get-AuthenticodeSignature -LiteralPath $env:SCHOOL_VERIFY_INSTALLER;[ordered]@{valid=($signature.Status -eq 'Valid');thumbprint=$signature.SignerCertificate.Thumbprint}|ConvertTo-Json -Compress";
 const result=await run('powershell.exe',['-NoProfile','-NonInteractive','-Command',script],{windowsHide:true,timeout:30000,env:{...process.env,SCHOOL_VERIFY_INSTALLER:file}});
 return JSON.parse(result.stdout);
}
module.exports={verifyInstaller};
