import test from 'node:test';
import assert from 'node:assert/strict';
import {bindingCandidates,workspaceContexts} from './bindings.mjs';

const identity={id:'repo::/cards/a',instanceId:'instance-a',hostId:'local'};
const binding={schema:1,workspace:{id:identity.id,instanceId:identity.instanceId},links:[{runId:'run_shared',taskId:'task_a'},{runId:'run_extra',taskId:'task_extra'}]};
const tasks=[{id:'task_a',run_id:'run_shared'},{id:'task_child',run_id:'run_shared',parent_id:'task_a'},{id:'task_b',run_id:'run_shared'}];
const mock=(workspace,record=binding)=>async({method,params})=>{
  if(method==='worktree.show'){assert.equal(params.worktree,'id:'+identity.id);return {ok:true,result:{worktree:workspace}};}
  if(method==='files.readPreview')return record ? {ok:true,result:{content:JSON.stringify(record)}} : {ok:false,error:{code:'runtime_error',message:'ENOENT: fixture'}};
  if(method==='orchestration.taskList')return {ok:true,result:{tasks:params.run==='run_shared'?tasks:[{id:'task_extra',run_id:'run_extra'}]}};
  throw Error('Unscoped RPC '+method);
};
test('explicit binding uses exact card instance and only its two associated roots',async()=>{
  const result=await workspaceContexts(mock(identity),identity);
  assert.deepEqual(result.map(c=>c.taskId),['task_a','task_extra']);
  assert.deepEqual(result[0].tasks.map(t=>t.id),['task_a','task_child']);
});
test('another card, replaced instance and inherited binding do not expose Task A',async()=>{
  assert.deepEqual(bindingCandidates({...identity,id:'repo::/cards/b'},binding),[]);
  assert.deepEqual(bindingCandidates({...identity,instanceId:'replacement'},binding),[]);
  assert.deepEqual(await workspaceContexts(mock({...identity,instanceId:'replacement'}),identity),[]);
});
test('native explicit lineage binds a worker without inspecting its coordinator or comments',async()=>{
  const workspace={...identity,comment:'task_b run_other',parentWorktreeId:'different-top-card',lineage:{worktreeId:identity.id,worktreeInstanceId:identity.instanceId,origin:'orchestration',capture:{confidence:'explicit'},orchestrationRunId:'run_shared',taskId:'task_a'}};
  const result=await workspaceContexts(mock(workspace,null),identity);
  assert.deepEqual(result.map(c=>c.taskId),['task_a']);
  assert.deepEqual(bindingCandidates({...workspace,lineage:{...workspace.lineage,worktreeInstanceId:'old'}}),[]);
});
test('no durable evidence is empty even when comments and coordinator contain task IDs',async()=>{
  assert.deepEqual(await workspaceContexts(mock({...identity,comment:'task_a run_shared',parentWorktreeId:'coordinator'},null),identity),[]);
});
