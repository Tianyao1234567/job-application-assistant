// Hosted lifecycle test process. It runs the normal loopback API and Store.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createApp} from '../../server.mjs';
import {fixtureFaultJobs} from './greenhouse-native-gate-fixture.mjs';

assert.ok(process.send,'The fixture backend needs a parent test process');
const [dataDir,testKey]=process.argv.slice(2);
assert.ok(dataDir&&testKey,'The fixture backend needs isolated data and a test key');
const app=await createApp({dataDir,startFixture:false,testMode:true,testKey});
const pending=new Map(),heldJobs=new Set(Object.values(fixtureFaultJobs));

// Delay delivery of the real final authorization. The backend has already
// authorized and saved the task before the test changes the browser state.
app.server.prependListener('request',(request,response)=>{
  const command=app.store.command;
  if(request.method!=='POST'||request.url!=='/api/bridge/authorize'||command?.op!=='submit')return;
  const job=app.store.task(command.taskId);
  if(!heldJobs.has(job.jobId))return;
  const end=response.end.bind(response);
  response.end=(body,...args)=>{
    if(response.statusCode!==200||JSON.parse(body).allowed!==true||!job.submitAuthorizedAt||
      !heldJobs.delete(job.jobId))return end(body,...args);
    pending.set(job.jobId,()=>{
      if(!response.destroyed)end(body,...args);
      return response.destroyed;
    });
    process.send({type:'authorization-held',jobId:job.jobId,taskId:job.id,commandId:command.id});
    return response;
  };
});

let stopping=false;
async function stop(){
  if(stopping)return;
  stopping=true;
  const closing=app.close();
  app.server.closeAllConnections();
  await closing;
  process.exit(0);
}
process.on('message',message=>{
  if(message.type==='stop')return stop();
  if(message.type==='deliver-authorization'){
    const deliver=pending.get(message.jobId);
    assert.ok(deliver,'Expected an outstanding final authorization response');
    pending.delete(message.jobId);
    process.send({type:'authorization-finished',jobId:message.jobId,clientDisconnected:deliver()});
  }
});
process.once('disconnect',stop);
process.send({type:'ready',pid:process.pid,bootId:randomUUID()});
