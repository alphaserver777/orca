import assert from 'node:assert/strict';
import test from 'node:test';
import {newDraft,draftKey,requestEnvelope,prepareHandoff} from './draft.mjs';
const a={id:'repo::a',instanceId:'a',repoId:'repo'};
function fixture() {
  const draft={...newDraft(),description:'Исправь опечатку',files:[{id:'f',name:'note.txt',type:'text/plain',size:1,base64:'eA=='}]};
  let native={text:'Прямое поручение',images:[{path:'keep.png'}]},saved;const calls=[];
  return {draft,workspace:a,sessionId:'chat-a',calls,get native(){return native;},get saved(){return saved;},
    readNative:()=>native,save:async d=>{saved=structuredClone(d);},append:async text=>{native={...native,text:native.text+'\n'+text};},
    call:async request=>{calls.push(request);return {ok:true,result:{worktree:a}};}};
}
test('drafts are scoped to host, project and exact instance; quick has no plan',()=>{
  assert.notEqual(draftKey('host-a',a),draftKey('host-b',a));
  assert.notEqual(draftKey('host-a',a),draftKey('host-a',{...a,instanceId:'b'}));
  const request=requestEnvelope({...newDraft(),description:'Исправь опечатку'},a,'chat-a');
  assert.equal(request.mode,'quick');assert.ok(!request.steps.includes('plan'));
});
test('prepares once, preserves direct chat draft and attachments, never creates or sends as coordinator',async()=>{
  const f=fixture();await prepareHandoff(f);await prepareHandoff(f);
  assert.equal(f.native.text.match(/Идентификатор запроса:/g).length,1);
  assert.ok(f.native.text.startsWith('Прямое поручение'));assert.equal(f.native.images[0].path,'keep.png');
  assert.equal(f.calls.filter(c=>c.method==='files.writeBase64').length,1);
  const stored=JSON.parse(f.calls.find(c=>c.method==='files.write').params.content);
  assert.equal(stored.mode,'quick');assert.deepEqual(stored.steps,['implement','checks','review','acceptance','finish']);
  assert.equal(stored.status,'prepared-for-chat');assert.ok(!JSON.stringify(stored).includes('eA=='));
  assert.ok(f.calls.filter(c=>c.method.startsWith('files.')).every(c=>c.params.expectedExecutionHostId==='local'));
  assert.ok(f.calls.every(c=>!c.method.startsWith('orchestration.')));
  assert.equal(f.saved.status,'prepared');
});
test('denied access and stale workspace cannot append or upload',async()=>{
  for (const result of [{ok:false},{ok:true,result:{worktree:{...a,instanceId:'b'}}}]) {
    const f=fixture();f.call=async()=>result;f.append=async()=>assert.fail('must not append');
    await assert.rejects(prepareHandoff(f));assert.equal(f.draft.status,'draft');
  }
});
test('failed upload retains the draft and can retry, lost save after append cannot duplicate',async()=>{
  const f=fixture(),call=f.call;let fail=true;
  f.call=async r=>r.method==='files.writeBase64'&&fail?{ok:false}:call(r);
  await assert.rejects(prepareHandoff(f));assert.equal(f.saved.status,'preparing');assert.equal(f.native.text,'Прямое поручение');
  fail=false;await prepareHandoff(f);const text=f.native.text;
  f.draft.status='preparing';await prepareHandoff(f);assert.equal(f.native.text,text);
});
test('storage failure before handoff has no external effects; absent chat acknowledgement stays pending',async()=>{
  const f=fixture();f.save=async()=>{throw Error('quota');};
  await assert.rejects(prepareHandoff(f),/quota/);assert.equal(f.calls.length,1);assert.equal(f.native.text,'Прямое поручение');
  const g=fixture();g.append=async()=>{};await assert.rejects(prepareHandoff(g),/Чат не подтвердил/);
  assert.equal(g.saved.status,'preparing');assert.equal(g.native.text,'Прямое поручение');
});
test('a host move, a different project and unsafe path identifiers are refused before uploads',async()=>{
  const f=fixture();f.call=async()=>({ok:true,result:{worktree:{...a,repoId:'other'}}});
  await assert.rejects(prepareHandoff(f),/Проект/);
  const g=fixture();g.draft.files[0].id='../escape';await assert.rejects(prepareHandoff(g),/идентификатор/);assert.equal(g.calls.length,0);
  const h=fixture();h.workspace={...a,hostId:'local'};h.call=async()=>({ok:true,result:{worktree:{...a,hostId:'ssh:other'}}});
  await assert.rejects(prepareHandoff(h),/Проект/);
});
test('paired WEB display host is routed to its own server local workspace without impersonating a coordinator',async()=>{
  const f=fixture();f.workspace={...a,hostId:'runtime:paired-a',runtimeOwnerEnvironmentId:'paired-a'};
  const call=f.call;f.call=async r=>r.method==='worktree.show'?{ok:true,result:{worktree:{...a,hostId:'local'}}}:call(r);
  await prepareHandoff(f);assert.equal(f.saved.envelope.workspace.environmentId,'paired-a');
  assert.ok(f.calls.filter(c=>c.method.startsWith('files.')).every(c=>c.params.expectedExecutionHostId==='local'));
});
