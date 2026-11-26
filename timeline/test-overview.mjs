import test from 'node:test';
import assert from 'node:assert/strict';
import {groupWorkspaceTasks,chooseWorkspaceTask,taskAddress} from './overview.mjs';
import {observeWorkspaceTasks} from './overview-client.mjs';
import {timeline} from './model.mjs';

test('native parent IDs group attempts and review, unrelated same-Run roots stay separate',()=>{
  const tasks=[{id:'task_a',status:'completed'},{id:'task_review',parent_id:'task_a'},{id:'task_b',status:'dispatched'}];
  const seed=id=>({runId:'run_one',taskId:id,workspaceId:id,instanceId:id,environmentId:'one'});
  const result=groupWorkspaceTasks([seed('task_a'),seed('task_a'),seed('task_review'),seed('task_b')],new Map([['run_one',tasks]]));
  assert.deepEqual(result.map(c=>c.taskId),['task_a','task_b']);
  assert.equal(groupWorkspaceTasks([{...seed('task_review'),self:true}],new Map([['run_one',tasks]]))[0].taskId,'task_review');
});
test('environment and Run isolate IDs; missing parents/cycles never infer by name',()=>{
  const seed={runId:'run_a',taskId:'task_same',environmentId:'a'};
  const runs=new Map([['run_a',[{id:'task_same',parent_id:'missing',task_title:'Same'}]],['run_b',[{id:'task_same',task_title:'Same'}]]]);
  const result=groupWorkspaceTasks([seed,{...seed,environmentId:'b'},{...seed,runId:'run_b'}],runs);
  assert.equal(result.length,3);assert.match(result[0].historyWarning,/неполна/);
});
test('composer launch roots keep separate chat requests apart even under a shared native parent',()=>{
  const seed=id=>({runId:'run_one',taskId:id,environmentId:'local'});
  const tasks=[{id:'task_umbrella'},{id:'task_a',parent_id:'task_umbrella'},{id:'task_review',parent_id:'task_a'},{id:'task_b',parent_id:'task_umbrella'}];
  const result=groupWorkspaceTasks([{...seed('task_a'),launchRoot:true},seed('task_review'),{...seed('task_b'),launchRoot:true}],new Map([['run_one',tasks]]));
  assert.deepEqual(result.map(c=>c.taskId),['task_a','task_b']);
  assert.deepEqual(result[0].excludedRoots,['task_b']);
  assert.equal(result[0].targets.length,2);
});
test('waiting first by default; deliberate selected ID survives reorder and new waits',()=>{
  const a={runId:'r',taskId:'a',status:'completed'},b={runId:'r',taskId:'b',waiting:true},c={runId:'r',taskId:'c',status:'dispatched'};
  assert.equal(chooseWorkspaceTask([a,c,b]),b);
  assert.equal(chooseWorkspaceTask([b,c,a],{address:taskAddress(a)}),a);
  assert.equal(chooseWorkspaceTask([],null),null);
  assert.equal(chooseWorkspaceTask([c]),c);
});
test('one stream for badge and panel; dispose fences late subscription and replies',async()=>{
  let resolve,callback,subscriptions=0,stops=0;
  const subscribe=async(req,onValue)=>{subscriptions++;callback=onValue;return new Promise(r=>resolve=r);};
  const identity={id:'repo::a',instanceId:'one',environmentId:'env'};
  const a=[],b=[];
  const stopA=observeWorkspaceTasks(null,subscribe,identity,v=>a.push(v),()=>{});
  const stopB=observeWorkspaceTasks(null,subscribe,identity,v=>b.push(v),()=>{});
  callback({ok:true,result:{contexts:[]}});assert.equal(subscriptions,1);assert.equal(b.length,1);
  stopA();callback({ok:true,result:{contexts:[{taskId:'new'}]}});assert.equal(a.length,1);assert.equal(b.length,2);
  stopB();resolve({unsubscribe:()=>stops++});await new Promise(setImmediate);
  assert.equal(stops,1);callback({ok:true,result:{contexts:[]}});assert.equal(b.length,2);
});
test('panel opened after badge subscription failure gets an actionable error',async()=>{
  let reply;
  const subscribe=async(_,callback)=>{reply=callback;return {unsubscribe(){}};};
  const identity={id:'broken',instanceId:'one'};
  const first=observeWorkspaceTasks(null,subscribe,identity,()=>{},()=>{});reply({ok:false});
  let errors=0;const second=observeWorkspaceTasks(null,subscribe,identity,()=>{},()=>errors++);
  assert.equal(errors,1);first();second();
});
test('parent group shows real child waits; bound child history still excludes an open ancestor',()=>{
  const tasks=[{id:'root',run_id:'r'},{id:'child',run_id:'r',parent_id:'root'}],gates=[{id:'g',run_id:'r',task_id:'child',status:'pending',created_at:'2026-11-26 08:00:00'}];
  const data={tasks,gates,dispatches:[]};
  assert.equal(timeline(data,'root',Date.now(),['root','child']).rows.some(r=>r.id==='g'),true);
  assert.equal(timeline(data,'root',Date.now(),'root').rows.some(r=>r.id==='g'),false);
});
