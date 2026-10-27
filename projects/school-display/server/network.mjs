import {readFileSync} from 'node:fs';
export function networkOptions(env=process.env){
 if(env.SCHOOL_TRUST_PROXY==='1'){
  const origin=new URL(env.SCHOOL_NETWORK_ORIGIN||'');
  if(origin.protocol!=='https:'||origin.username||origin.password||origin.pathname!=='/'||origin.search||origin.hash||!env.SCHOOL_SETUP_KEY||env.SCHOOL_SETUP_KEY.length<32)throw Error('Hosted mode requires an exact HTTPS origin and a setup key of at least 32 characters.');
  return {host:'0.0.0.0',port:Number(env.PORT||10000),publicOrigin:origin.origin,trustedProxy:true,setupKey:env.SCHOOL_SETUP_KEY};
 }
 if(!env.SCHOOL_NETWORK_ORIGIN)return {};
 const origin=new URL(env.SCHOOL_NETWORK_ORIGIN);if(origin.protocol!=='https:'||origin.username||origin.password||origin.pathname!=='/'||origin.search||origin.hash||!env.SCHOOL_TLS_CERT||!env.SCHOOL_TLS_KEY)throw Error('Set an HTTPS origin and TLS certificate/key files for school-network access.');
 return {host:env.SCHOOL_BIND_HOST||'0.0.0.0',publicOrigin:origin.origin,tls:{cert:readFileSync(env.SCHOOL_TLS_CERT),key:readFileSync(env.SCHOOL_TLS_KEY)},port:Number(origin.port||443)};
}
