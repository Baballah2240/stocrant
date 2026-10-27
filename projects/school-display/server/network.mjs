import {readFileSync} from 'node:fs';
export function networkOptions(env=process.env){
 if(!env.SCHOOL_NETWORK_ORIGIN)return {};
 const origin=new URL(env.SCHOOL_NETWORK_ORIGIN);if(origin.protocol!=='https:'||origin.username||origin.password||origin.pathname!=='/'||origin.search||origin.hash||!env.SCHOOL_TLS_CERT||!env.SCHOOL_TLS_KEY)throw Error('Set an HTTPS origin and TLS certificate/key files for school-network access.');
 return {host:env.SCHOOL_BIND_HOST||'0.0.0.0',publicOrigin:origin.origin,tls:{cert:readFileSync(env.SCHOOL_TLS_CERT),key:readFileSync(env.SCHOOL_TLS_KEY)},port:Number(origin.port||443)};
}
