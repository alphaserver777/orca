import test from 'node:test';
import assert from 'node:assert/strict';
import {historyContext,workspaceContexts} from './bindings.mjs';
import {timeline,reader,stagesFor,timestamp} from './model.mjs';
import {watchPlan} from './decision-view.mjs';
import {decisionRequest} from './decisions.mjs';

// Synthetic identities, real ordering: root approval resolved before child creation.
export const fixture={
  tasks:[
    {id:'task_a',run_id:'run_fixture',task_title:'Задача A',created_at:'2026-11-26 08:33:59'},
    {id:'task_plan',run_id:'run_fixture',parent_id:'task_a',task_title:'План',created_at:'2026-11-26 08:36:17'},
    {id:'task_current',run_id:'run_fixture',parent_id:'task_plan',task_title:'Реализация A',created_at:'2026-11-26 08:44:01'},
    {id:'task_future',run_id:'run_fixture',parent_id:'task_a',task_title:'Приёмка A',status:'pending'},
    {id:'task_b',run_id:'run_fixture',task_title:'Задача B'},
    {id:'task_b_child',run_id:'run_fixture',parent_id:'task_b',task_title:'Реализация B'},
    {id:'task_foreign',run_id:'run_elsewhere',parent_id:'task_a'},
  ],
  gates:[{id:'gate_early',run_id:'run_fixture',task_id:'task_a',question:'Согласовать план?',status:'resolved',created_at:'2026-11-26 08:34:00',resolved_at:'2026-11-26 08:35:47'},
    {id:'gate_b',run_id:'run_fixture',task_id:'task_b',status:'pending',created_at:'2026-11-26 08:34:00'}],
  dispatches:['failed','completed'].map((status,i)=>({id:'ctx_a'+i,runId:'run_fixture',taskId:'task_current',status,dispatchedAt:`2026-11-26 08:${45+i}:00`,completedAt:`2026-11-26 08:${45+i}:30`})),
};

test('child workspace retains action identity while history climbs multiple levels within one Run',async()=>{
  const identity={id:'repo::/child',instanceId:'child-instance'};
  const call=async({method})=>{
    if(method==='worktree.show')return {ok:true,result:{worktree:{...identity,lineage:{worktreeId:identity.id,worktreeInstanceId:identity.instanceId,origin:'orchestration',capture:{confidence:'explicit'},orchestrationRunId:'run_fixture',taskId:'task_current'}}}};
    if(method==='files.readPreview')return {ok:false,error:{code:'file_not_found'}};
    return {ok:true,result:{tasks:fixture.tasks}};
  };
  const [context]=await workspaceContexts(call,identity);
  assert.equal(context.taskId,'task_current');assert.equal(context.title,'Реализация A');
  assert.equal(context.historyRootId,'task_a');
  assert.deepEqual(context.tasks.map(t=>t.id),['task_a','task_plan','task_current','task_future']);
  assert.equal(context.historyWarning,'');
});

test('closed root decision predating child exists on shared clock; future stages have no invented intervals',()=>{
  const c=historyContext(fixture.tasks,'run_fixture','task_current');
  const model=timeline({...fixture,tasks:c.tasks},c.historyRootId,timestamp('2026-11-26 09:00:00'));
  const approval=model.rows.find(r=>r.id==='gate_early').attempts[0];
  assert.equal(approval.duration,'1 мин 47 с');
  assert.ok(approval.end<timestamp(fixture.tasks[1].created_at));
  assert.equal(model.start,timestamp('2026-11-26 08:33:59'));
  assert.equal(model.rows.some(r=>r.id==='gate_b'),false);
  assert.deepEqual(model.rows.find(r=>r.id==='task_future').attempts,[]);
  assert.deepEqual(stagesFor(model.rows).find(r=>r.id==='acceptance').attempts,[]);
  assert.ok(stagesFor(model.rows,'task_current').find(r=>r.id==='implementation').taskIds.includes('task_current'));
  assert.deepEqual(model.rows.find(r=>r.id==='task_current').attempts.map(a=>a.id),['ctx_a0','ctx_a1']);
});

test('untimed bound task retains a current stage without manufacturing an attempt',()=>{
  const rows=[{id:'child',label:'Проверка',source:'Task',attempts:[]},{id:'root',label:'Нестандартный этап',source:'Task',attempts:[]}];
  assert.ok(stagesFor(rows,'child').find(r=>r.id==='checks').taskIds.includes('child'));
  assert.equal(stagesFor(rows).some(r=>r.id==='other'),false);
  assert.deepEqual(stagesFor(rows,'root').find(r=>r.id==='other').attempts,[]);
});

test('missing, cross-run parents and cycles stop at a confirmed ancestor and explain partial history',()=>{
  for(const parent of [{id:'lost',run_id:'another'},null]){
    const tasks=[{id:'child',parent_id:'middle',run_id:'r'},{id:'middle',parent_id:'lost',run_id:'r'},...(parent?[parent]:[]),{id:'unrelated',run_id:'r'}];
    const c=historyContext(tasks,'r','child');
    assert.equal(c.historyRootId,'middle');assert.match(c.historyWarning,/Родитель отсутствует/);
    assert.deepEqual(c.tasks.map(t=>t.id),['child','middle']);
  }
  const c=historyContext([{id:'a',parent_id:'b',run_id:'r'},{id:'b',parent_id:'a',run_id:'r'},{id:'other',run_id:'r'}],'r','a');
  assert.match(c.historyWarning,/Цикл/);assert.deepEqual(c.tasks.map(t=>t.id),['a','b']);
});

test('history reader rejects foreign dispatch details and gates even with colliding task IDs',async()=>{
  const api=reader(async({method})=>({ok:true,result:method.endsWith('workerList') ? {workers:[{taskId:'task_current',dispatchId:'ctx_bad'}]} : method.endsWith('workerShow') ? {dispatch:{id:'ctx_bad',taskId:'task_current',runId:'run_elsewhere'}} : {gates:[{...fixture.gates[0],run_id:'run_elsewhere'}]}}));
  const result=await api.history('run_fixture',fixture.tasks,'task_a');
  assert.deepEqual(result.dispatches,[]);assert.deepEqual(result.gates,[]);
  assert.equal(result.tasks.some(t=>t.run_id==='run_elsewhere'),false);
});

test('expanded history never substitutes ancestor into subscription or answer context',async()=>{
  const identity={id:'repo::/child',instanceId:'child-instance'};
  const context={runId:'run_fixture',taskId:'task_current',...historyContext(fixture.tasks,'run_fixture','task_current')};
  let request;
  const stop=watchPlan(async value=>{request=value;return {unsubscribe(){}};},identity,context,()=>{},()=>{});
  assert.equal(request.params.task,'task_current');
  const rootEntry={gate:{id:'gate_early',run_id:'run_fixture',task_id:'task_a',status:'pending'},plan:{revision:1}};
  assert.throws(()=>decisionRequest(identity,context,rootEntry,'accept',''));
  stop();
});
