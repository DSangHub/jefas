import {readdir} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
async function check(dir){for(const entry of await readdir(dir,{withFileTypes:true})){if(['node_modules','.git','.vercel'].includes(entry.name))continue;const file=dir+'/'+entry.name;if(entry.isDirectory())await check(file);else if(file.endsWith('.js'))execFileSync(process.execPath,['--check',file],{stdio:'inherit'});}}
await check('.');
