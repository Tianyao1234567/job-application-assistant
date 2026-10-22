// Controlled task inputs for the new PDF/batch flow only. Never contacts a site.
import fs from 'node:fs';
import path from 'node:path';
import {Store,FIXTURE,hash} from '../model.mjs';
import {ROOT} from '../paths.mjs';
export const client={clientId:'fictional-profile-client',profileId:'fictional-profile-browser',extensionId:'b'.repeat(32)};
export function temporary(t,prefix){const parent=path.join(ROOT,'.runtime/tests');fs.mkdirSync(parent,{recursive:true});const directory=fs.mkdtempSync(path.join(parent,prefix+'-'));t?.after(()=>fs.rmSync(directory,{recursive:true,force:true}));return directory;}
export function taskEnvironment(store){
 const site={id:'profile-replay',name:'Fictional Profile Replay',company:'Fictional Profile Replay',adapter:'greenhouse-replay-v1',origin:FIXTURE,tenant:'mattermost-replay',expectedAccount:store.state.profile.data.personal.email.zh,mode:'demo',enabled:true,skipped:false,listUrl:FIXTURE+'/greenhouse/mattermost-replay',loginUrl:FIXTURE+'/greenhouse/mattermost-replay'};
 store.setSettings({settings:{...store.state.settings,keywords:['Fictional'],cities:['Fictional City'],mode:'demo'},sites:[site]});store.heartbeat(client);
 const add=id=>store.manual(site.listUrl+'/jobs/'+id).task;
 const confirm=task=>{store.heartbeat(client);return store.action({action:'task-confirm',taskId:task.id,jobId:task.jobId,profileVersion:store.state.profile.version,resumeVersion:store.state.resume.version,profileId:client.profileId,submitConfirmed:true});};
 const take=()=>store.poll(client).command;
 const send=(c,r)=>store.result({clientId:client.clientId,commandId:c.id,result:r});
 const prepare=(task,questions)=>{
  const inspect=take();if(inspect?.op!=='inspect'||inspect.task.id!==task.id)throw new Error('Expected the original task inspection');send(inspect,{ok:true,layout:'fictional-profile-layout',questions,login:{status:'ready',account:site.expectedAccount,tenant:site.tenant,identitySource:'confirmed-anonymous-applicant'}});
  const fill=take();if(fill?.op!=='fill')throw new Error('Expected fill');send(fill,{ok:true,layout:'fictional-profile-layout'});
  const upload=take();if(upload?.op!=='upload')throw new Error('Expected upload');const file=upload.payload.file;send(upload,{ok:true,layout:'fictional-profile-layout',fileName:file.name,fileSize:file.size,sha256:file.sha256});
 };
 const q=(task,key,text,purpose='site-specific-question',extra={})=>{const version=hash(Buffer.from(key+text+JSON.stringify(extra)));return {key,text,purpose,scope:`greenhouse-v1:${site.tenant}:${task.jobId}:${key}:${version}`,version,source:task.url,options:[],optionsComplete:true,type:'text',required:true,...extra};};
 return {store,site,add,confirm,take,send,prepare,q};
}
export function demoStore(t){const data=temporary(t,'profile-model'),store=new Store({data});store.demo();return store;}
