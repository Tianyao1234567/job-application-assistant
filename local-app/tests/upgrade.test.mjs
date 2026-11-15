import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {prepareDependencies,dependencyStatus} from '../../scripts/prepare-deps.mjs';
import {SOURCE_PATHS} from '../../scripts/package-candidate.mjs';
import {Store} from '../model.mjs';
import {ROOT} from '../paths.mjs';
import {temporary} from './profile-test-runtime.mjs';
const write=(file,data)=>{fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,data);};
function nativeFixture(root){write(path.join(root,'runtime-deps/node_modules/@napi-rs/canvas/package.json'),JSON.stringify({main:'index.js'}));write(path.join(root,'runtime-deps/node_modules/@napi-rs/canvas/index.js'),'exports.DOMMatrix=class FictionalMatrix {};');}
function installation(t,{pdf=true,native=true}={}){
 const root=temporary(t,'upgrade original folder '),browser=path.join(root,'.runtime/browsers/chromium/executable');
 write(path.join(root,'runtime-deps/package.json'),JSON.stringify({dependencies:{playwright:'1.58.2','pdfjs-dist':'5.4.296'}}));
 write(path.join(root,'runtime-deps/node_modules/playwright/package.json'),JSON.stringify({version:'1.58.2',main:'index.js'}));write(path.join(root,'runtime-deps/node_modules/playwright/index.js'),'exports.chromium={executablePath:()=>'+JSON.stringify(browser)+'};');write(browser,'FICTIONAL EXISTING BROWSER');
 if(pdf)write(path.join(root,'runtime-deps/node_modules/pdfjs-dist/package.json'),JSON.stringify({version:'5.4.296'}));if(native)nativeFixture(root);return {root,browser};
}
test('documented merge into original folder keeps resumes, profile, answers, tasks, login profile, key and browsers byte-for-byte',t=>{
 const {root,browser}=installation(t),data=path.join(root,'.runtime/data'),store=new Store({data});store.demo();
 const task=store.manual('http://127.0.0.1:17322/site/alpha/jobs/cpp-001').task;task.status='unknown';task.submissionStarted=true;task.phase='verify';task.result={receiptId:'fictional-prior-receipt'};store.state.answers=[{scope:'fictional-memory',value:'Keep me'}];store.save();
 const privateFiles=[store.file,store.state.resume.file,browser,path.join(root,'.runtime/data/local-key'),path.join(root,'.runtime/browser/production/Default/Cookies'),path.join(root,'runtime-deps/node_modules/playwright/index.js')];
 write(privateFiles[3],'FICTIONAL LOCAL KEY');write(privateFiles[4],'FICTIONAL LOGIN SESSION');const before=new Map(privateFiles.map(file=>[file,fs.readFileSync(file)]));
 // This is exactly the documented source-only folder merge, in place. The
 // separate package test verifies committed manifest/ZIP checksums and scope.
 for(const file of SOURCE_PATHS)write(path.join(root,file),fs.readFileSync(path.join(ROOT,file)));
 for(const [file,bytes]of before)assert.deepEqual(fs.readFileSync(file),bytes,file);
 const old=structuredClone(store.state),restarted=new Store({data});assert.deepEqual(restarted.state.profile,old.profile);assert.deepEqual(restarted.state.resume,old.resume);assert.deepEqual(restarted.state.answers,old.answers);assert.equal(restarted.task(task.id).status,'unknown');assert.equal(restarted.canResumeTask(restarted.task(task.id)),false);
 assert.deepEqual(fs.readFileSync(restarted.state.resume.file),before.get(old.resume.file));
});
test('compatible dependencies and existing browser are reused with no install or download',t=>{
 const {root}=installation(t);const result=prepareDependencies({projectRoot:root,run(){assert.fail('No install is needed');}});assert.deepEqual(result,{installed:[],reusedBrowser:true,browserDownload:false});
});
test('only missing PDF dependency is prepared with browser downloads/scripts disabled and existing files preserved',t=>{
 const {root,browser}=installation(t,{pdf:false}),original=fs.readFileSync(browser);let calls=0;
 const result=prepareDependencies({projectRoot:root,run(command,args,options){calls++;assert.ok(args.includes('install'));assert.equal(args.includes('ci'),false);assert.ok(args.includes('--ignore-scripts'));assert.equal(options.shell,false);assert.equal(options.env.PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD,'1');assert.equal(options.cwd,path.join(root,'runtime-deps'));write(path.join(root,'runtime-deps/node_modules/pdfjs-dist/package.json'),JSON.stringify({version:'5.4.296'}));return {status:0};}});
 assert.equal(calls,1);assert.deepEqual(result.installed,['pdfjs-dist']);assert.equal(result.reusedBrowser,true);assert.deepEqual(fs.readFileSync(browser),original);assert.deepEqual(dependencyStatus(root).missing,[]);
});
test('failed dependency preparation preserves data/browser and clearly reports retry without reinstall',t=>{
 const {root,browser}=installation(t,{pdf:false});write(path.join(root,'.runtime/data/state.json'),'FICTIONAL PERSISTED STATE');const original=fs.readFileSync(browser);
 assert.throws(()=>prepareDependencies({projectRoot:root,run:()=>({status:1})}),/原资料、浏览器及任务保留/);assert.equal(fs.readFileSync(path.join(root,'.runtime/data/state.json'),'utf8'),'FICTIONAL PERSISTED STATE');assert.deepEqual(fs.readFileSync(browser),original);
});
test('a current PDF package with a missing native optional component is repaired, never falsely reported ready',t=>{
 const {root,browser}=installation(t,{native:false}),original=fs.readFileSync(browser);assert.deepEqual(dependencyStatus(root).missing,['PDF本机平台组件']);
 const result=prepareDependencies({projectRoot:root,run(command,args){assert.ok(args.includes('--include=optional'));nativeFixture(root);return {status:0};}});assert.deepEqual(result.installed,['PDF本机平台组件']);assert.equal(result.reusedBrowser,true);assert.deepEqual(fs.readFileSync(browser),original);
 const broken=installation(t,{native:false});assert.throws(()=>prepareDependencies({projectRoot:broken.root,run:()=>({status:0})}),/版本仍不完整/);
});
