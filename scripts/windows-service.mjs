// Windows launcher wrapper: close through the application API before exiting.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createApp} from '../local-app/server.mjs';

const root=path.resolve(fileURLToPath(new URL('..',import.meta.url)));
const runtime=path.join(root,'.runtime'),stopFile=path.join(runtime,'server.stop'),closedFile=path.join(runtime,'server.stopped');
await fs.mkdir(runtime,{recursive:true});
await fs.rm(closedFile,{force:true});
const app=await createApp();
let closing=false;
async function close(){
  if(closing)return;closing=true;clearInterval(timer);
  try{await app.close();await fs.writeFile(closedFile,'closed',{mode:0o600});await fs.rm(stopFile,{force:true});process.exit(0);}
  catch{console.error('SERVER_CLOSE_FAILED: 后台未能正常保存并关闭，请保留数据后检查。');process.exit(1);}
}
const timer=setInterval(async()=>{try{await fs.access(stopFile);}catch{return;}await close();},200);
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,close);
console.log('SERVER_READY: 本地后台与虚构测试站仅监听loopback；任务数据保存在本项目.runtime。');
