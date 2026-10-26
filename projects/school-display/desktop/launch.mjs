import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
const child=spawn(require('electron'),['.',...process.argv.slice(2)],{env,stdio:'inherit'});child.on('exit',code=>process.exit(code||0));
