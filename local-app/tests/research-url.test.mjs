import test from 'node:test';
import assert from 'node:assert/strict';
import {acceptResearchUrl,researchUrlKey,publicResearchUrl} from '../../scripts/research-url.mjs';

test('research navigation keeps the official campus query and a complete relative hash route',()=>{
  const campus='https://app.mokahr.com/campus-recruitment/4paradigm/58145?edit=1&hireMode=2';
  assert.equal(acceptResearchUrl(campus).href,campus);
  assert.equal(researchUrlKey(campus),campus);
  assert.equal(publicResearchUrl(campus),campus,'the known public parameters can appear in the source correction');
  const route=acceptResearchUrl('../jobs?department=robotics&jobid=42#detail/42','https://careers.example.test/company/list');
  assert.equal(route.href,'https://careers.example.test/jobs?department=robotics&jobid=42#detail/42');
  const displayed=publicResearchUrl(route);
  assert.equal(displayed,'https://careers.example.test/jobs?jobid=42');
  assert.equal(route.href,'https://careers.example.test/jobs?department=robotics&jobid=42#detail/42','formatting must not mutate the navigation object');
});

test('different query or hash targets retain distinct identities even when their public display matches',()=>{
  const targets=[
    'https://careers.example.test/jobs?selection=first#detail/1',
    'https://careers.example.test/jobs?selection=second#detail/1',
    'https://careers.example.test/jobs?selection=first#detail/2'
  ];
  assert.equal(new Set(targets.map(value=>researchUrlKey(value))).size,3,'navigation deduplication cannot use the display value');
  assert.equal(new Set(targets.map(value=>publicResearchUrl(value))).size,1);
  const visited=new Set();
  const followed=targets.map(value=>acceptResearchUrl(value)).filter(url=>{if(visited.has(url.href))return false;visited.add(url.href);return true;}).map(url=>url.href);
  assert.deepEqual(followed,targets);
});

test('long targets remain complete for navigation while bounded public summaries omit private tracking',()=>{
  const marker='FICTIONAL_PRIVATE_TRACKING_ONLY';
  const first='https://careers.example.test/jobs?jobid='+('a'.repeat(700))+'&tracking='+marker+'#detail/one';
  const second=first.replace('#detail/one','#detail/two');
  assert.equal(acceptResearchUrl(first).href,first);
  assert.notEqual(researchUrlKey(first),researchUrlKey(second));
  const summary=publicResearchUrl(first);
  assert.ok(summary.length<=350);assert.ok(summary.endsWith('…'));
  assert.equal(summary.includes(marker),false);assert.equal(summary.includes('tracking'),false);
  assert.equal(publicResearchUrl(first,{maxLength:80}).length,80);
  assert.equal(researchUrlKey(first).length,first.length);
});

test('credentials and unsuitable destinations are refused before navigation and absent from public output',()=>{
  const marker='FICTIONAL_CREDENTIAL_VALUE';
  const refused=[
    'https://careers.example.test/jobs?access_token='+marker,
    'https://careers.example.test/jobs?%61ccess_token='+marker,
    'https://careers.example.test/jobs?authCode='+marker,
    'https://careers.example.test/jobs#access_token='+marker,
    'https://careers.example.test/jobs#/callback?session_id='+marker,
    'https://fictional:'+marker+'@careers.example.test/jobs',
    'http://careers.example.test/jobs','https://localhost/jobs','https://127.0.0.1/jobs',
    'https://careers.example.test:444/jobs','https://careers.example.test/application.pdf'
  ];
  for(const value of refused){
    assert.equal(acceptResearchUrl(value),null);assert.equal(researchUrlKey(value),null);
    assert.equal(publicResearchUrl(value),'[URL refused]');
    assert.equal(publicResearchUrl(value).includes(marker),false);
  }
});
