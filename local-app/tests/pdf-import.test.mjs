import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {extractResume,resumeCandidates} from '../resume-import.mjs';
import {applyProfileDraft,importedCandidates} from '../profile-draft.mjs';
import {emptyProfile} from '../../autofill-extension/shared/schema.js';
import {Store,hash} from '../model.mjs';
import {createApp} from '../server.mjs';
import {fictionalPDF} from './pdf-fixture.mjs';
import {temporary,demoStore} from './profile-test-runtime.mjs';
const lines=['Name: Fictional Applicant','Email: fictional@example.invalid','Phone: +1 2025550100','Current city: Fictional City','GitHub: https://github.com/fictional-test','Education','School: Fictional University','Degree: Fictional degree','Major: Fictional studies','Experience','Company: Fictional Company','Role: Fictional developer','Skills','JavaScript','Local testing'];
const accept=draft=>draft.candidates.map(c=>({key:c.key,action:'import',value:c.values[0].value}));
const field=(zh,en=null)=>({zh,en,confirmed:true,source:'Fictional unit fixture'});
test('actual local PDF text extraction produces unconfirmed candidates and preserves original bytes/hash',async t=>{
 const store=new Store({data:temporary(t,'pdf-bytes')}),bytes=fictionalPDF(lines),sha=hash(bytes);
 store.setResume({name:'fictional.pdf',mime:'application/pdf',base64:bytes.toString('base64'),mode:'demo'});
 const result=await extractResume(bytes,sha);assert.equal(result.status,'ready');assert.equal(result.pageCount,1);
 assert.equal(result.draft.personal.name.zh,'Fictional Applicant');assert.equal(result.draft.personal.name.confirmed,false);assert.equal(result.draft.personal.firstName,undefined);
 assert.equal(result.draft.education[0].school.zh,'Fictional University');assert.equal(result.draft.skills.description.zh,'JavaScript Local testing');
 assert.equal(store.state.profile.version,0);assert.deepEqual(fs.readFileSync(store.state.resume.file),bytes);assert.equal(store.state.resume.sha256,sha);
 const binding={resumeVersion:store.state.resume.version,sha256:sha,profileVersion:0};store.saveResumeImport(result,binding);
 store.confirmResumeImport({id:store.state.resumeImport.id,profileVersion:0,confirmed:true,selections:accept(result)});
 assert.equal(store.state.profile.version,1);assert.equal(store.state.profile.data.personal.name.confirmed,true);assert.equal(store.state.resume.version,1);assert.deepEqual(fs.readFileSync(store.state.resume.file),bytes);
});
test('Chinese compact contacts and ambiguous emails are parsed without guessing or fabricated dates/name splits',()=>{
 const result=resumeCandidates([{page:2,lines:['姓名：虚构甲 | 手机：13800000000 | 邮箱：fictional@example.invalid','备用邮箱: second@example.invalid','教育背景','学校：虚构大学','2020-09 - 2024-06']}],'a'.repeat(64));
 assert.equal(result.draft.personal.name.zh,'虚构甲');assert.equal(result.draft.personal.phone.zh,'13800000000');assert.equal(result.draft.personal.email,undefined);
 assert.equal(result.candidates.find(c=>c.key==='personal.email').values.length,2);assert.equal(result.draft.personal.firstName,undefined);assert.equal(result.draft.education[0].startDate,undefined);
 assert.ok(result.candidates.every(c=>c.values.every(v=>v.page===2)));
});
test('same company/school names retain separate entry identities and repeat import merges only exact IDs',()=>{
 const profile=emptyProfile();profile.experience=[{id:'old-role',company:field('Fictional Company'),role:field('Former role')}];
 const parsed=resumeCandidates([{page:1,lines:['Company: Fictional Company','Role: New role','Company: Fictional Company','Role: Another role']}],'b'.repeat(64));
 const draft={candidates:importedCandidates(parsed.candidates,profile)};const result=applyProfileDraft(profile,draft,accept(draft)).data;
 assert.equal(result.experience.length,3);assert.equal(result.experience[0].role.zh,'Former role');assert.equal(new Set(result.experience.map(e=>e.id)).size,3);
 assert.equal(applyProfileDraft(result,draft,accept(draft)).data.experience.length,3);
});
test('confirmed conflicts require explicit replacement, old translation is cleared and rejection is atomic',()=>{
 const profile=emptyProfile();profile.personal.name=field('Old fictional name','Old English');
 const draft={candidates:[{key:'personal.name',values:[{value:'New fictional name',page:1}]}]};const before=structuredClone(profile);
 assert.throws(()=>applyProfileDraft(profile,draft,accept(draft)),/明确/);assert.deepEqual(profile,before);
 assert.equal(applyProfileDraft(profile,draft,[{...accept(draft)[0],replace:true}]).data.personal.name.en,null);
 assert.deepEqual(applyProfileDraft(profile,draft,[{key:'personal.name',action:'keep'}]).data,profile);
 assert.throws(()=>applyProfileDraft(profile,draft,[]),/遗漏/);
});
test('scanned/invalid PDF explicitly fails without changing saved profile, answers or original attachment',async t=>{
 const store=demoStore(t),before=structuredClone(store.state.profile),answers=structuredClone(store.state.answers);
 for(const [bytes,status]of [[fictionalPDF([],{blank:true}),'no-text'],[fictionalPDF(['Unmapped fictional document content']),'unmapped'],[Buffer.from('%PDF-1.4\nnot a document'),'invalid'],[Buffer.from('not PDF'),'invalid']]){
  store.setResume({name:'fictional.pdf',mode:'demo',base64:bytes.toString('base64')});const result=await extractResume(bytes,hash(bytes));assert.equal(result.status,status);
  store.saveResumeImport(result,{resumeVersion:store.state.resume.version,sha256:hash(bytes),profileVersion:store.state.profile.version});
  assert.deepEqual(store.state.profile,before);assert.deepEqual(store.state.answers,answers);assert.deepEqual(fs.readFileSync(store.state.resume.file),bytes);
 }
});
test('stale extraction/review never overwrites newer resume or edited profile',async t=>{
 const store=demoStore(t),bytes=fictionalPDF(lines),result=await extractResume(bytes,hash(bytes));
 store.setResume({name:'fictional.pdf',mode:'demo',base64:bytes.toString('base64')});const binding={resumeVersion:store.state.resume.version,sha256:hash(bytes),profileVersion:store.state.profile.version};
 store.saveResumeImport(result,binding);const draft=structuredClone(store.state.resumeImport);store.setProfile({data:store.state.profile.data,mode:'demo',confirmed:true});
 assert.throws(()=>store.confirmResumeImport({id:draft.id,profileVersion:store.state.profile.version,confirmed:true,selections:accept(draft)}),/版本/);
 store.setResume({name:'new-fictional.txt',mode:'demo',base64:Buffer.from('new fixture').toString('base64')});assert.equal(store.saveResumeImport(result,binding).status,'stale');assert.equal(store.state.resumeImport,null);
});
test('switching profile purpose archives the old profile and does not carry hidden demo history',async t=>{
 const store=demoStore(t),prior=structuredClone(store.state.profile),bytes=fictionalPDF(['Name: Synthetic Applicant','Email: synthetic@example.test']);
 store.setResume({name:'synthetic.pdf',mode:'real',base64:bytes.toString('base64')});store.saveResumeImport(await extractResume(bytes,hash(bytes)),{resumeVersion:store.state.resume.version,sha256:hash(bytes),profileVersion:store.state.profile.version});
 const draft=store.state.resumeImport,body={id:draft.id,profileVersion:prior.version,confirmed:true,selections:accept(draft)};
 assert.throws(()=>store.confirmResumeImport(body),/用途/);assert.deepEqual(store.state.profile,prior);assert.equal(store.state.profileArchives,undefined);
 store.confirmResumeImport({...body,replaceMode:true});assert.equal(store.state.profile.mode,'real');assert.deepEqual(store.state.profile.data.education,[]);assert.deepEqual(store.state.profileArchives.demo,prior);
});
test('new PDF HTTP routes keep local-key/Origin guards and never expose original storage path',async t=>{
 const app=await createApp({dataDir:temporary(t,'pdf-http'),port:0,startFixture:false,testMode:true});t.after(()=>app.close());
 const html=await(await fetch(app.url)).text(),key=/name="local-key" content="([A-Za-z0-9_-]+)"/.exec(html)[1];
 const post=(route,body,headers={})=>fetch(app.url+route,{method:'POST',headers:{'Content-Type':'application/json','X-Local-Key':key,Origin:app.url,...headers},body:JSON.stringify(body)});
 for(const route of ['/api/resume/extract','/api/resume/confirm']){assert.equal((await post(route,{}, {'X-Local-Key':'wrong'})).status,401);assert.equal((await post(route,{}, {Origin:'https://foreign.invalid'})).status,403);}
 const bytes=fictionalPDF(lines),response=await post('/api/resume',{name:'fictional.pdf',mode:'demo',base64:bytes.toString('base64')});assert.equal(response.status,200);
 const state=await(await fetch(app.url+'/api/state',{headers:{'X-Local-Key':key}})).json();assert.equal(state.resumeImport.status,'ready');assert.equal(state.resume.file,undefined);assert.equal(JSON.stringify(state).includes(app.store.state.resume.file),false);
 const result=await post('/api/resume/confirm',{id:state.resumeImport.id,profileVersion:state.profile.version,confirmed:true,selections:accept(state.resumeImport)});assert.equal(result.status,200);assert.equal(app.store.state.profile.data.personal.email.zh,'fictional@example.invalid');
});
