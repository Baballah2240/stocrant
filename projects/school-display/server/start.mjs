import {startServer} from './server.mjs';
import {fileURLToPath} from 'node:url';
const app=await startServer({directory:process.env.SCHOOL_DATA_DIR||fileURLToPath(new URL('../runtime/',import.meta.url)),port:Number(process.env.PORT||4318)});
console.log(`School Display control panel: ${app.origin}/control`);
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,async()=>{await app.close();process.exit(0);});
