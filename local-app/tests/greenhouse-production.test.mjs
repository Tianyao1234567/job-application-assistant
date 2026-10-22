import test from 'node:test';
import assert from 'node:assert/strict';
import {greenhouseQuestion,greenhouseAnswer} from '../greenhouse.mjs';
const site={adapter:'greenhouse-v1',origin:'https://job-boards.greenhouse.io',tenant:'mattermost'};
const task={jobId:'5381946008',url:site.origin+'/mattermost/jobs/5381946008'};
const q={key:'country',text:'Country*',scope:'greenhouse-v1:mattermost:5381946008:country:'+('a'.repeat(64)),version:'a'.repeat(64),source:task.url,purpose:'confirmed-profile-fact',type:'text',customControl:true,optionsComplete:false,required:true,options:[]};
test('dynamic choices remain unresolved until a concrete human-selected option is observed',()=>{
 assert.equal(greenhouseQuestion(site,task,q),null);
 assert.equal(greenhouseQuestion(site,task,{...q,manualSelection:true}),null);
 const observed=greenhouseQuestion(site,task,{...q,manualSelection:true,options:[{text:'Fictional observed country',disabled:false}]});
 assert.equal(observed.manualSelection,true);assert.equal(observed.optionsComplete,false);
 assert.equal(greenhouseAnswer(observed,'Fictional observed country'),'Fictional observed country');
 assert.throws(()=>greenhouseAnswer(observed,'Unobserved country'));
 assert.equal(greenhouseQuestion(site,task,{...q,manualSelection:true,options:[{text:'A'},{text:'B'}]}),null);
});
