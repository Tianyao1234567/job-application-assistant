import test from 'node:test';
import assert from 'node:assert/strict';
import {Store} from '../model.mjs';
import {demoStore} from './profile-test-runtime.mjs';

test('daily edit retires only explicitly chosen old English with a persistent backup',t=>{
 const store=demoStore(t),initial=structuredClone(store.state.profile.data);
 const oldEnglish=initial.personal.name.en;assert.ok(oldEnglish);
 const version=store.state.profile.version,edited=structuredClone(initial);edited.personal.name.zh='修改后的姓名';
 assert.throws(()=>store.setProfile({data:edited,mode:'demo',confirmed:true,baseVersion:version}),/旧英文/);
 assert.throws(()=>store.setProfile({data:edited,mode:'demo',confirmed:true,baseVersion:version-1,retireEnglish:['personal.name']}),/变化/);
 assert.throws(()=>store.setProfile({data:edited,mode:'demo',confirmed:true,baseVersion:version,retireEnglish:['personal.name','personal.phone']}),/过期/);
 store.setProfile({data:edited,mode:'demo',confirmed:true,baseVersion:version,retireEnglish:['personal.name']});
 assert.equal(store.state.profile.data.personal.name.en,null);
 const reopened=new Store(store.paths),backup=reopened.state.profileImportHistory.at(-1).pendingChanges[0];
 assert.equal(backup.target,'personal.name');assert.equal(backup.value.en,oldEnglish);assert.equal(reopened.state.profile.data.personal.name.zh,'修改后的姓名');
});

test('failure to save keeps both profile and old translation unchanged',t=>{
 const store=demoStore(t),initial=structuredClone(store.state.profile.data);assert.ok(initial.personal.name.en);
 const before=structuredClone(store.state),version=store.state.profile.version,changed=structuredClone(initial);changed.personal.name.zh='新姓名';
 const save=store.save;store.save=()=>{throw new Error('simulated disk failure');};
 assert.throws(()=>store.setProfile({data:changed,mode:'demo',confirmed:true,baseVersion:version,retireEnglish:['personal.name']}),/disk failure/);
 store.save=save;assert.deepEqual(store.state,before);
});
