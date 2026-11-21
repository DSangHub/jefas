import {readdir} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
// Keep tests deterministic in Vercel builds; never use live credentials in tests.
const env={...process.env,NODE_ENV:'test'};
for(const key of ['VERCEL','APP_ORIGIN','DATABASE_URL','OPENAI_API_KEY','GEMINI_API_KEY','ANTHROPIC_API_KEY','PROXIC_API_KEY','SKORUP_API_KEY','PHOTO_LAB_ERAS'])delete env[key];
const files=(await readdir('test')).filter(name=>name.endsWith('.test.js')).map(name=>'test/'+name);
const result=spawnSync(process.execPath,['--test',...files],{env,stdio:'inherit'});process.exitCode=result.status??1;
