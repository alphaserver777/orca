import test from 'node:test';
import assert from 'node:assert/strict';
import {planEnvelope, planHistory, decisionRequest,planPerson} from './decisions.mjs';
import {planTransport} from './decision-view.mjs';
const plan=(revision,previousGateId=null)=>JSON.stringify({kind:'orca-plan',schema:1,revision,previousGateId,plan:'Проверяемый план '+revision});
const gate=(id,revision,status='pending',previous=null)=>({id,run_id:'run_a',task_id:'task_a',status,question:plan(revision,previous)});
test('legacy gates remain readable and cannot be mistaken for a plan',()=>{
  assert.equal(planEnvelope({question:'Согласовать план?'}),null);
  assert.equal(planEnvelope({question:JSON.stringify({kind:'orca-plan',schema:2})}),null);
});
test('new revision links its exact predecessor; other tasks stay isolated',()=>{
  const a=gate('gate_a',1,'resolved');a.resolution=JSON.stringify({kind:'orca-plan-answer',schema:1,revision:1,decision:'return',comment:'Добавить тест'});
  const b=gate('gate_b',2,'pending','gate_a');
  const other={...gate('foreign',99),task_id:'task_b'};
  const history=planHistory([a,b,other],'run_a','task_a');
  assert.equal(history.current.gate.id,'gate_b');assert.equal(history.entries.length,2);
  assert.equal(planHistory([gate('bad',2)],'run_a','task_a').current,null);
});
test('ambiguous forks fail closed and never approve an old revision',()=>{
  assert.equal(planHistory([gate('one',1),gate('two',1)],'run_a','task_a').current,null);
  const p=gate('one',1,'resolved');p.resolution='Принять';
  assert.equal(planHistory([p,gate('two',2,'pending','one')],'run_a','task_a').current.gate.id,'two');
});
test('new revision always needs a new answer, even after acceptance or while pending',()=>{
  const previous=gate('one',1,'resolved');previous.resolution=JSON.stringify({kind:'orca-plan-answer',schema:1,revision:1,decision:'accept',comment:''});
  const next=gate('two',2,'pending','one');
  const current=planHistory([previous,next],'run_a','task_a').current;
  assert.equal(current.answer,null);assert.equal(current.gate.status,'pending');
  previous.status='pending';assert.equal(planHistory([previous,next],'run_a','task_a').current.gate.id,'two');
});
test('return requires a comment, answer carries all immutable identities',()=>{
  const context={runId:'run_a',taskId:'task_a'},workspace={id:'w',instanceId:'i'};
  const entry={gate:gate('one',1),plan:planEnvelope(gate('one',1))};
  assert.throws(()=>decisionRequest(workspace,context,entry,'return','   '));
  assert.deepEqual(decisionRequest(workspace,context,entry,'accept',' Хорошо '),{
    workspaceId:'w',instanceId:'i',run:'run_a',task:'task_a',gate:'one',revision:1,decision:'accept',comment:'Хорошо',
  });
});
test('paired environment subscription uses its onResponse observer contract',async()=>{
  let value,error,seen;
  const transport=planTransport({runtimeEnvironments:{subscribe:async(request,observer)=>{
    seen=request;observer.onResponse({ok:true,result:'native event'});observer.onError({code:'closed'});return {unsubscribe(){}};
  }}},'paired-owner');
  await transport.subscribe({method:'workflowPlan.subscribe',params:{task:'a'}},reply=>{if(reply.ok)value=reply.result;else error=reply.error.code;});
  assert.equal(seen.selector,'paired-owner');assert.equal(value,'native event');assert.equal(error,'closed');
});
test('narrow plan writes allow authenticated browser people and fence agents',()=>{
  assert.equal(planPerson({kind:'paired-device'},'runtime',false,undefined),true);
  assert.equal(planPerson({kind:'desktop'},undefined,true,undefined),true);
  assert.equal(planPerson({kind:'local-cli'},undefined,false,undefined),false);
  assert.equal(planPerson({kind:'paired-device',agent:true},'runtime',false,undefined),false);
  assert.equal(planPerson({kind:'paired-device'},'runtime',false,{kind:'peer'}),false);
  assert.equal(planPerson(undefined,'runtime',false,undefined),false);
});
