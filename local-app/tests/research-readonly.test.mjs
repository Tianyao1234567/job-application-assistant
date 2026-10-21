import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyObservedMokaRead} from '../../scripts/research-readonly.mjs';

const root='https://app.mokahr.com';
const feature='/api/outer/ats-jc-apply/website/feature-switches';
const group='/api/outer/ats-apply/website/group-by-job';
const modulePath='/api/outer/ats-apply/website/jobs/module';
const scope={orgId:'4paradigm',siteId:102013,locale:'zh-CN'};
const request=(pathname,body,extra={})=>({url:root+pathname,method:'POST',resourceType:'xhr',contentType:'application/json',postData:JSON.stringify(body),...extra});
const classify=(pathname,body,extra)=>classifyObservedMokaRead(request(pathname,body,extra));

// These are policy tests for observed public queries; they do not claim any
// fixture response, API replay or real Moka job-discovery result.
test('observed public configuration and tenant-scoped list queries can continue',()=>{
  assert.equal(classify(feature,{orgId:'4paradigm'}).allowed,true);
  assert.equal(classify('/api/outer/ats-apply/website/listCountryCallingCodes',{orgId:'4paradigm'}).allowed,true);
  assert.equal(classify(group,scope).allowed,true);
  for(const pathname of ['/api/outer/ats-apply/website/jobs/departments/flat','/api/outer/ats-apply/website/jobs/departments/structure'])assert.equal(classify(pathname,scope).allowed,true);
  const body={...scope,keyword:'',limit:10,offset:0,departmentIds:[],commitments:[]};
  assert.equal(classify(modulePath,body).allowed,true);
  assert.deepEqual(body,{...scope,keyword:'',limit:10,offset:0,departmentIds:[],commitments:[]},'classification does not mutate the browser request');
});

test('public queries remain bound to the observed company and site',()=>{
  for(const orgId of ['another-company','4paradigm.example',null,{}])assert.equal(classify(feature,{orgId}).allowed,false);
  for(const body of [{...scope,orgId:'another-company'},{...scope,siteId:58145},{...scope,siteId:'102013/other'},{...scope,siteId:{toString:null,valueOf:null}},{orgId:'4paradigm',locale:'zh-CN'}])assert.equal(classify(group,body).allowed,false);
});

test('an endpoint outside the exact observed read routes cannot become an allowed write',()=>{
  for(const pathname of ['/api/outer/ats-apply/application/submit','/api/outer/ats-apply/login','/api/outer/ats-apply/resume/upload','/api/outer/ats-apply/website/jobs/module/submit',feature+'/'])assert.equal(classify(pathname,{orgId:'4paradigm'}).allowed,false);
  for(const url of ['http://app.mokahr.com'+feature,'https://app.mokahr.com.evil.example'+feature,'https://user:password@app.mokahr.com'+feature,root+':444'+feature,root+feature+'?token=FICTIONAL_TOKEN',root+feature+'#callback'])assert.equal(classify(feature,{orgId:'4paradigm'},{url}).allowed,false);
});

test('private fields and unexpected request data are rejected without echoing their values',()=>{
  const marker='FICTIONAL_SECRET_DO_NOT_PUBLISH';
  for(const key of ['password','resume','email','authorization','attachment','accountId','unexpected']){
    const result=classify(feature,{orgId:'4paradigm',[key]:marker});
    assert.equal(result.allowed,false,key);
    assert.equal(JSON.stringify(result).includes(marker),false,'a rejection must not include request values');
  }
  const poisoned='{"orgId":"4paradigm","__proto__":{"polluted":true}}';
  assert.equal(classifyObservedMokaRead(request(feature,null,{postData:poisoned})).allowed,false);
  assert.equal({}.polluted,undefined);
});

test('query allowance requires JSON browser XHR/fetch with the expected method',()=>{
  for(const extra of [{method:'GET'},{method:'PUT'},{resourceType:'document'},{contentType:'multipart/form-data'},{postData:'orgId=4paradigm'},{postData:'null'},{postData:'[]'},{postData:'true'},{postData:''}])assert.equal(classify(feature,{orgId:'4paradigm'},extra).allowed,false);
  assert.equal(classify(feature,{orgId:'4paradigm'},{resourceType:'fetch'}).allowed,true);
});

test('list pagination and filters stay bounded and cannot carry object-shaped private data',()=>{
  const body={...scope,keyword:'',limit:10,offset:0,departmentIds:[],commitments:[]};
  for(const patch of [{limit:1000000},{offset:-1},{offset:'all'},{departmentIds:[{email:'fictional@example.test'}]},{commitments:[{password:'FICTIONAL'}]},{keyword:'x'.repeat(10000)}])assert.equal(classify(modulePath,{...body,...patch}).allowed,false);
});

// The fourth actual hosted observation showed needGroupType is a string.
// This verifies its bounded selector type, not a claim about its remote value.
test('the observed module grouping selector accepts bounded strings and rejects private objects',()=>{
  const body={...scope,keyword:'',limit:10,offset:0,departmentIds:[],commitments:[]};
  for(const needGroupType of ['', 'department',true,false])assert.equal(classify(modulePath,{...body,needGroupType}).allowed,true);
  for(const needGroupType of [{email:'fictional@example.test'},'x'.repeat(81),'https://example.test/'])assert.equal(classify(modulePath,{...body,needGroupType}).allowed,false);
});

// The fifth hosted browser actually emitted jobs/v2 from the observed list
// menu. Only the initial unfiltered public query is authorized here.
test('observed list and recent queries accept their public scope while custom objects remain closed',()=>{
  const pathname='/api/outer/ats-apply/website/jobs/v2';
  const body={...scope,limit:20,offset:0,needStat:true,jobIdTopList:[],customFields:{},site:'social-recruitment'};
  assert.equal(classify(pathname,body).allowed,true);
  assert.equal(classify('/api/outer/ats-apply/website/jobs/recent',scope).allowed,true);
  for(const patch of [{orgId:'other'},{siteId:58145},{limit:100000},{needStat:'yes'},{jobIdTopList:[{email:'fictional@example.test'}]},{customFields:{email:'fictional@example.test'}},{customFields:[]},{customFields:null},{site:'https://example.test/'},{password:'FICTIONAL'}])assert.equal(classify(pathname,{...body,...patch}).allowed,false);
  assert.equal(classify('/api/outer/ats-apply/store/filters',scope).allowed,false,'an ambiguous newly observed route is not authorized merely by a similar body');
});

test('public commitment filters can use observed Chinese labels without accepting private objects',()=>{
  const body={...scope,keyword:'',limit:10,offset:0,departmentIds:[],commitments:['全职','兼职','实习','其他']};
  assert.equal(classify(modulePath,body).allowed,true);
  for(const commitments of [[{email:'fictional@example.test'}],['fictional@example.test'],['https://example.test/'],['x'.repeat(81)],['unsafe\nvalue']])assert.equal(classify(modulePath,{...body,commitments}).allowed,false);
});
