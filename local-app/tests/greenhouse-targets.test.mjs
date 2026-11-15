import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {Store} from '../model.mjs';
import {ROOT} from '../paths.mjs';
import {checkOfficialTarget,parseTargetCSV} from '../greenhouse-targets.mjs';

const origin='https://job-boards.greenhouse.io',base=origin+'/mattermost/jobs/';
const site={id:'test-greenhouse',name:'Synthetic target table',company:'Mattermost',adapter:'greenhouse-v1',
  tenant:'mattermost',origin,expectedAccount:'fictional-target@example.test',mode:'real',enabled:true};
const header='公司,岗位,地点,官方链接,来源,核实时间,有效状态,原因';
const row=(name,job,extra='')=>['Mattermost',name,'Tokyo',job,'官网','2026-11-15','有效',extra].join(',');
const table=(...rows)=>[header,...rows].join('\n');

test('target CSV accepts BOM, quoted values and a direction without a link',()=>{
  const rows=parseTargetCSV('\ufeff'+table(row('"Platform, ""services"""',base+'100'),row('Direction','','"No source\nyet"')));
  assert.equal(rows[0].title,'Platform, "services"');
  assert.equal(rows[1].url,'');
  assert.equal(rows[1].note,'No source\nyet');
  assert.equal(rows[0].checkedAt,'2026-11-15');
  for(const csv of [
    'company,title,url,email\nFoo,Title,,private',
    'company,title,url,company\nFoo,Title,,Foo',
    'company,title,url\nFoo,Title',
    'company,title,url\nFoo,"Title',
    'company,title,url\nFoo,Title,\ufffd',
    [header,...Array.from({length:41},()=>row('Direction',''))].join('\n')
  ])assert.throws(()=>parseTargetCSV(csv));
});

test('public probe accepts only a bound official, supported, still-open form',async()=>{
  const jobId='5381946008',url=base+jobId,identity={jobId,url};
  const questions=JSON.parse(fs.readFileSync(new URL('fixtures/greenhouse-current-questions.json',import.meta.url),'utf8'));
  function html(patch={}){
    const jobPost={...questions,language:'en',public_url:url,company_name:'Mattermost',title:'Fictional Target','job_post_location':'Tokyo',...patch};
    const loaderData={root:{boardConfiguration:{disable_captcha:false}},
      'routes/$url_token_.jobs_.$job_post_id':{jobPost,urlToken:'mattermost',jobPostId:jobId}};
    return '<link rel="modulepreload" href="https://job-boards.cdn.greenhouse.io/assets/entry.client-HYmR2EDs.js">'+
      '<script>window.__remixContext = '+JSON.stringify({state:{loaderData}})+'</script>';
  }
  const fetched=(body,options={})=>new Response(body,{headers:{'content-type':'text/html',...options.headers},status:options.status||200});
  const check=response=>checkOfficialTarget(site,identity,{fetchPage:async (address,request)=>{
    assert.equal(address,url);
    assert.equal(request.redirect,'manual');
    assert.equal(request.method,undefined);
    assert.equal(request.headers.Authorization,undefined);
    return response;
  }});
  assert.deepEqual(await check(fetched(html())),{status:'ready',title:'Fictional Target',location:'Tokyo'});
  assert.equal((await check(fetched(null,{status:404}))).status,'closed');
  assert.equal((await check(fetched(null,{status:302,headers:{location:'/mattermost'}}))).status,'closed');
  assert.equal((await check(fetched(null,{status:302,headers:{location:'https://careers.example.invalid/private'}}))).status,'unverified');
  assert.equal((await check(fetched(html({company_name:'Other company'})))).status,'unverified');
  assert.equal((await check(fetched(html({questions:[]})))).status,'unsupported');
  assert.equal((await check(fetched(html({application_deadline:'1999-01-01T00:00:00Z'})))).status,'closed');
});

test('preview preserves blocked rows and confirmed batch reuses the queue and unknown record',async t=>{
  const parent=path.join(ROOT,'.runtime/tests');fs.mkdirSync(parent,{recursive:true});
  const data=fs.mkdtempSync(path.join(parent,'targets-'));t.after(()=>fs.rmSync(data,{recursive:true,force:true}));
  const store=new Store({data});
  store.setSettings({settings:{...store.state.settings,mode:'real'},sites:[site]});
  const existing=store.manual(base+'101').task;
  Object.assign(existing,{status:'unknown',phase:'verify',submissionStarted:true,submitDay:'2026-11-14',
    answers:{legacy:{confirmed:true,value:'kept'}},resumeSnapshot:{sha256:'old'}});
  const stable=structuredClone(existing),visited=[];
  const csv=table(row('Already queued',base+'101?gh_src=other'),row('New',base+'102'),row('Another',base+'103'),
    row('Same job','https://boards.greenhouse.io/mattermost/jobs/102?source=table'),row('Missing','','Waiting for a link'),
    row('Other ATS','https://careers.example.invalid/jobs/104'),row('Closed',base+'105'));
  async function probe(_site,identity){
    visited.push(identity.jobId);
    return identity.jobId==='105'?{status:'closed',reason:'Gone'}:{status:'ready',title:'Verified '+identity.jobId,location:'Tokyo'};
  }
  const preview=await store.previewTargetTable(csv,probe);
  assert.deepEqual(preview.rows.map(row=>row.status),['duplicate','ready','ready','duplicate','missing','unsupported','closed']);
  assert.deepEqual(visited.sort(),['102','103','105']);
  assert.equal(store.state.tasks.length,1);
  assert.throws(()=>store.confirmTargetTable({id:preview.id,selected:[2,7]}),/已核实/);
  assert.equal(store.state.tasks.length,1);
  assert.deepEqual(store.confirmTargetTable({id:preview.id,selected:[2,3]}),{added:2,duplicates:0});
  assert.deepEqual(store.task(existing.id),stable);
  const imported=store.state.tasks.slice(1);
  assert.ok(imported.every(task=>task.status==='waiting_user'&&task.phase==='inspect'&&!task.confirmation&&!task.submissionStarted));
  assert.throws(()=>store.action({action:'task-resume',taskId:existing.id}),/只能核对/);
  assert.throws(()=>store.confirmTargetTable({id:preview.id,selected:[2]}),/已失效/);
  const reopened=new Store({data}),repeated=await reopened.previewTargetTable(csv,probe);
  assert.deepEqual(repeated.rows.slice(0,3).map(row=>row.status),['duplicate','duplicate','duplicate']);
  assert.deepEqual(reopened.task(existing.id),stable);
  assert.deepEqual(reopened.state.tasks.slice(1).map(task=>task.id),imported.map(task=>task.id));
});
