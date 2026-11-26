import test from 'node:test';
import assert from 'node:assert/strict';
import {newDraft} from './draft.mjs';
import {sendEnvelope,launchTask,recoverTask} from './start.mjs';
const workspace={id:'repo::source',instanceId:'source-instance',repoId:'repo'};
function fixture(){
  const draft={...newDraft(),description:'Исправить подтверждённую постановку'};const sends=[];let receipt=null;
  const call=async({method,params})=>{
    if(method==='worktree.show')return {ok:true,result:{worktree:params.worktree==='id:'+workspace.id?workspace:{id:'repo::target',instanceId:'target-instance',repoId:'repo',hostId:'local'}}};
    if(method==='session.tabs.list')return {ok:true,result:{tabs:[{type:'agent-session',sessionId:'coordinator'}]}};
    if(method==='agentSession.history')return {ok:true,result:{page:{fence:7}}};
    if(method==='agentSession.send'){sends.push(structuredClone(params));return {ok:true,result:{ok:true,value:{}}};}
    if(method==='agentSession.sendRecorded')return {ok:true,result:{recorded:true}};
    if(method==='files.readPreview'&&params.relativePath.endsWith('result.json'))return receipt?{ok:true,result:{content:JSON.stringify(receipt)}}:{ok:false,error:{code:'file_not_found'}};
    if(method==='files.readPreview')return {ok:true,result:{content:JSON.stringify({schema:1,workspace:{id:'repo::target',instanceId:'target-instance'},links:[{runId:'run_real',taskId:'task_real'}]})}};
    if(method==='orchestration.runShow')return {ok:true,result:{run:{id:'run_real',objective:draft.id}}};
    if(method==='orchestration.taskList')return {ok:true,result:{tasks:[{id:'task_real',run_id:'run_real',spec:draft.id}]}};
    return {ok:true,result:{}};
  };
  return {draft,workspace,sessionId:'coordinator',call,save:async()=>{},sends,setReceipt:r=>{receipt=r;},receipt:()=>({schema:1,requestId:draft.id,coordinatorSessionId:'coordinator',sourceWorkspaceId:workspace.id,sourceInstanceId:workspace.instanceId,repoId:'repo',runId:'run_real',taskId:'task_real',workspaceId:'repo::target',instanceId:'target-instance'})};
}
test('native envelope is stable and sends only the confirmed form; reload never reissues a send',async()=>{
  const f=fixture();await launchTask(f);const transport=structuredClone(f.draft.transport);
  assert.equal(transport.envelope.expectedRuntimeFence,7);assert.equal(transport.envelope.payloadFingerprint.length,64);
  assert.match(transport.envelope.clientOperationId,/^\d{13}-[\da-f]{32}$/);
  await recoverTask(f);assert.equal(f.sends.length,1);
  await launchTask(f);assert.deepEqual(f.sends[1],f.sends[0]);
  f.setReceipt(f.receipt());const result=await recoverTask(f);assert.equal(result.taskId,'task_real');assert.equal(f.draft.status,'launched');
});
test('refusal leaves editable draft; transport loss freezes the exact operation for safe recovery',async()=>{
  const f=fixture(),original=f.call;f.call=async request=>request.method==='agentSession.send'?{ok:true,result:{ok:false,refusal:{code:'denied'}}}:original(request);
  await assert.rejects(launchTask(f),/отказал/);assert.equal(f.draft.status,'draft');assert.equal(f.draft.transport,undefined);
  f.call=async r=>r.method==='agentSession.send'?{ok:false,error:{code:'unauthorized'}}:original(r);
  await assert.rejects(launchTask(f),/отказал/);assert.equal(f.draft.transport,undefined);assert.equal(f.draft.status,'draft');
  const g=fixture(),call=g.call;g.call=async request=>{if(request.method==='agentSession.send')throw Error('connection lost');return call(request);};
  await assert.rejects(launchTask(g));const id=g.draft.transport.envelope.clientOperationId;await recoverTask({...g,call});assert.equal(g.draft.transport.envelope.clientOperationId,id);
});
test('another chat, another request or a replaced target cannot open the timeline',async()=>{
  const f=fixture(),call=f.call;
  await assert.rejects(launchTask({...f,sessionId:'foreign'}),/не принадлежит/);assert.equal(f.sends.length,0);
  await launchTask(f);f.setReceipt({...f.receipt(),requestId:'foreign'});await assert.rejects(recoverTask(f),/другому/);
  f.setReceipt(f.receipt());f.call=async request=>request.method==='worktree.show'&&request.params.worktree==='id:repo::target'?{ok:true,result:{worktree:{id:'repo::target',instanceId:'replaced',repoId:'repo',hostId:'local'}}}:call(request);
  await assert.rejects(recoverTask(f),/экземпляр/);assert.notEqual(f.draft.status,'launched');
});
test('unknown native outcome keeps its operation; SSH and failed directory preparation never send',async()=>{
  const f=fixture(),call=f.call;
  f.call=async r=>r.method==='agentSession.send'?{ok:true,result:{ok:false,refusal:{code:'agent_session_operation_unknown'}}}:call(r);
  await assert.rejects(launchTask(f),/неизвестен/);assert.equal(f.draft.status,'uncertain');assert.ok(f.draft.transport);
  const g=fixture(),original=g.call;
  g.call=async r=>r.method==='worktree.show'?{ok:true,result:{worktree:{...workspace,hostId:'ssh:foreign'}}}:original(r);
  await assert.rejects(launchTask(g),/SSH/);assert.equal(g.sends.length,0);
  const h=fixture(),base=h.call;
  h.call=async r=>['files.createDir','files.readDir'].includes(r.method)?{ok:false,error:{code:'denied'}}:base(r);
  await assert.rejects(launchTask(h));assert.equal(h.sends.length,0);assert.equal(h.draft.status,'draft');
});
test('a persisted launched result is revalidated before reopening',async()=>{
  const f=fixture();await launchTask(f);f.setReceipt(f.receipt());await recoverTask(f);
  f.setReceipt({...f.receipt(),repoId:'foreign'});
  await assert.rejects(launchTask(f),/другому/);assert.equal(f.sends.length,1);
});
