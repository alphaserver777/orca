import test from 'node:test';
import assert from 'node:assert/strict';
import {readAttempt,attemptSelection} from './attempts.mjs';
import {timeline,stagesFor} from './model.mjs';

const a={id:'a',dispatchId:'a',runId:'r',taskId:'t',source:'Dispatch'};
const b={...a,id:'b',dispatchId:'b'};
const response=(attempt,status,heartbeat)=>({ok:true,result:{
  dispatch:{id:attempt.id,runId:'r',taskId:'t',status,dispatchedAt:'2026-11-25 12:00:00',lastHeartbeatAt:heartbeat},
  projection:{dispatchId:attempt.id,runId:'r',taskId:'t',provider:{id:'codex',model:'gpt-6'},outcome:status==='failed'?'failed':'succeeded',liveness:{verdict:'live'},stage:{activity:'working'}},
  terminal:{contents:'PRIVATE PROMPT'},worker:{startOptions:{prompt:'PRIVATE PROMPT',token:'SECRET'}},
}});

test('two attempts retain original identity, independent result and event times',async()=>{
  const model=timeline({tasks:[{id:'t',run_id:'r',task_title:'Реализация'}],gates:[],dispatches:[
    {id:'a',runId:'r',taskId:'t',status:'failed'},{id:'b',runId:'r',taskId:'t',status:'completed'}]},'t');
  const attempts=stagesFor(model.rows).find(r=>r.id==='implementation').attempts;
  assert.deepEqual(attempts.map(x=>[x.id,x.dispatchId,x.runId,x.taskId,x.attemptNumber]),[['a','a','r','t',1],['b','b','r','t',2]]);
  const first=await readAttempt(async()=>response(a,'failed','2026-11-25 12:01:00'),attempts[0]);
  const second=await readAttempt(async()=>response(b,'completed','2026-11-25 12:03:00'),attempts[1]);
  assert.equal(first.outcome,'failed');assert.equal(second.outcome,'succeeded');
  assert.notEqual(first.lastActivity,second.lastActivity);
  assert.notDeepEqual(first.events,second.events);
  assert.equal(JSON.stringify([first,second]).includes('PRIVATE'),false);
  assert.equal(JSON.stringify([first,second]).includes('SECRET'),false);
});

test('old task has no invented activity, report, journal or event timestamp',async()=>{
  const detail=await readAttempt(async()=>({ok:true,result:{dispatch:{id:'a',runId:'r',taskId:'t',status:'dispatched'}}}),a);
  assert.equal(detail.open,true);assert.equal(detail.agentState,'Статус агента недоступен');
  assert.equal(detail.agent,null);assert.equal(detail.model,null);assert.equal(detail.lastActivity,null);
  assert.deepEqual(detail.events,[]);assert.equal(detail.journalAvailable,false);
  assert.equal(detail.outcome,'outcome_unknown');
});

test('waiting, work and lost observation are different from open assignment',async()=>{
  const r=response(a,'dispatched',null);r.result.projection.stage.activity='idle';
  assert.equal((await readAttempt(async()=>r,a)).agentState,'Агент ожидает');
  r.result.projection.liveness.verdict='unverifiable';
  assert.equal((await readAttempt(async()=>r,a)).agentState,'Статус агента недоступен');
  r.result.projection.liveness.verdict='exited';
  const d=await readAttempt(async()=>r,a);assert.equal(d.open,true);assert.equal(d.agentState,'Процесс агента завершён');
});

test('identity mismatch and authorization errors cannot leak server data',async()=>{
  await assert.rejects(readAttempt(async()=>response(b,'failed',null),a),/Привязка/);
  await assert.rejects(readAttempt(async()=>({ok:false,error:'SECRET'}),a),/Не удалось/);
});

test('late A does not replace B; selected ID survives reorder and controller restoration',async()=>{
  const pending=new Map, seen=[];
  const selection=attemptSelection(attempt=>new Promise(resolve=>pending.set(attempt.id,resolve)),v=>seen.push(v),'a');
  const initial=selection.update([a,b]);
  const next=selection.select('b');
  pending.get('b')({id:'b',outcome:'succeeded'});await next;
  pending.get('a')({id:'a',outcome:'failed'});await initial;
  assert.equal(seen.at(-1).detail.id,'b');
  const updated=selection.update([b,a]);pending.get('b')({id:'b'});await updated;
  assert.equal(selection.snapshot().selectedId,'b');
  let restored;
  const again=attemptSelection(async a=>a,v=>{restored=v;},selection.snapshot().selectedId);
  await again.update([a,b]);assert.equal(restored.detail.id,'b');
});

test('context clear and disposal invalidate pending replies, including rejection',async()=>{
  let resolve;const seen=[];
  const selection=attemptSelection(()=>new Promise(r=>{resolve=r;}),v=>seen.push(v));
  const pending=selection.update([a]);await selection.update([]);
  resolve({id:'a'});await pending;assert.equal(seen.at(-1).attempt,undefined);
  const last=selection.update([b]);const count=seen.length;selection.dispose();
  resolve({id:'b'});await last;assert.equal(seen.length,count);
});

test('unchanged attempt identity does not refetch on live ticks or reorder',async()=>{
  let reads=0,last;
  const controller=attemptSelection(async a=>{reads++;return {id:a.id};},v=>{last=v;});
  await controller.update([{...a,running:true,duration:'1 с',end:1}]);
  await controller.update([{...a,running:true,duration:'2 с',end:2}]);
  assert.equal(reads,1);assert.equal(last.attempt.duration,'2 с');assert.equal(last.detail.id,'a');
  await controller.update([{...a,running:false,status:'completed',end:3}]);
  assert.equal(reads,2);controller.dispose();
});
