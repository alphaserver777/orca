// Execute the actual purpose-specific handler with real SQLite savepoints.
// Runtime routing/person authority is independently checked by paired browser E2E.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {DatabaseSync} from 'node:sqlite';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {createRequire} from 'node:module';
import path from 'node:path';
import {bindingCandidates} from './bindings.mjs';
import {decisionRequest,planHistory,planPerson} from './decisions.mjs';
async function fixture(){
 const directory=await mkdtemp(path.join(tmpdir(),'orca-respond-'));
 const workspace={id:'fixture',instanceId:'instance',path:directory};
 await writeFile(path.join(directory,'.orca-task-timeline.json'),JSON.stringify({schema:1,workspace:{id:workspace.id,instanceId:workspace.instanceId},links:[{runId:'run_fixture',taskId:'task_fixture'}]}));
 const sql=new DatabaseSync(':memory:');
 sql.exec('CREATE TABLE tasks(id TEXT,run_id TEXT,status TEXT); CREATE TABLE gates(id TEXT,run_id TEXT,task_id TEXT,status TEXT,question TEXT,resolution TEXT); CREATE TABLE messages(body TEXT); INSERT INTO tasks VALUES(\'task_fixture\',\'run_fixture\',\'blocked\')');
 sql.prepare('INSERT INTO gates VALUES(?,?,?,?,?,NULL)').run('g','run_fixture','task_fixture','pending',JSON.stringify({kind:'orca-plan',schema:1,revision:1,previousGateId:null,plan:'Actual fixture plan'}));
 let notifications=0,failMessage=false;
 const db={db:sql,getTask:id=>sql.prepare('SELECT * FROM tasks WHERE id=?').get(id),listGates:()=>sql.prepare('SELECT * FROM gates').all(),
  resolveGate:(id,resolution)=>{sql.prepare("UPDATE gates SET status='resolved',resolution=? WHERE id=? AND status='pending'").run(resolution,id);sql.prepare("UPDATE tasks SET status='ready' WHERE id='task_fixture'").run();return {id};},
  updateTaskStatus:(id,status)=>sql.prepare('UPDATE tasks SET status=? WHERE id=?').run(status,id),
  insertMessage:message=>{if(failMessage)throw Error('injected_message_failure');sql.prepare('INSERT INTO messages VALUES(?)').run(message.body);return {id:'m',to_handle:message.to,type:message.type};}};
 const context=vm.createContext({require:createRequire(import.meta.url),bindingCandidates,decisionRequest,planHistory,planPerson,_Js:()=>false});
 vm.runInContext(await readFile(new URL('./decision-server.mjs',import.meta.url),'utf8')+'\nglobalThis.respond=orcaPlanRespond;',context);
 const caller={caller:{kind:'paired-device'},clientKind:'runtime',runtime:{showManagedWorktree:async()=>workspace,getOrchestrationDb:()=>db,notifyMessageArrived:()=>notifications++}};
 const params={workspaceId:'fixture',instanceId:'instance',run:'run_fixture',task:'task_fixture',gate:'g',revision:1,decision:'accept',comment:' comment '};
 return {sql,params,caller,respond:context.respond,fail:()=>{failMessage=true;},notifications:()=>notifications,close:async()=>{sql.close();await rm(directory,{recursive:true,force:true});}};
}
for(const decision of ['accept','return'])test('real respond handler commits '+decision+' exactly once',async()=>{
 const f=await fixture();try{
  const p={...f.params,decision};const reply=await f.respond(p,f.caller);
  assert.equal(reply.decision,decision);assert.equal(f.sql.prepare('SELECT status FROM tasks').get().status,decision==='accept'?'ready':'blocked');
  const gate=f.sql.prepare('SELECT * FROM gates').get();assert.equal(gate.status,'resolved');assert.equal(JSON.parse(gate.resolution).comment,'comment');
  assert.equal(f.sql.prepare('SELECT count(*) n FROM messages').get().n,1);assert.equal(f.notifications(),1);
  await assert.rejects(f.respond(p,f.caller),/decision_conflict/);
  assert.equal(f.sql.prepare('SELECT count(*) n FROM messages').get().n,1);assert.equal(f.notifications(),1);
 }finally{await f.close();}
});
for(const [name,patch,caller] of [['foreign-task',{task:'foreign'}],['foreign-instance',{instanceId:'foreign'}],['stale-gate',{gate:'old'}],['stale-revision',{revision:2}],['empty-return',{decision:'return',comment:' '}],['agent',{}, {caller:{kind:'paired-device',agent:true}}]])test('real respond handler denies '+name+' without transition or message',async()=>{
 const f=await fixture();try{
  await assert.rejects(f.respond({...f.params,...patch},{...f.caller,...caller}));
  assert.equal(f.sql.prepare('SELECT status FROM tasks').get().status,'blocked');assert.equal(f.sql.prepare('SELECT status FROM gates').get().status,'pending');
  assert.equal(f.sql.prepare('SELECT count(*) n FROM messages').get().n,0);assert.equal(f.notifications(),0);
 }finally{await f.close();}
});
test('real SQLite rolls back gate, Task and message on failure after resolveGate',async()=>{
 const f=await fixture();try{
  f.fail();await assert.rejects(f.respond(f.params,f.caller),/injected_message_failure/);
  assert.equal(f.sql.prepare('SELECT status FROM gates').get().status,'pending');assert.equal(f.sql.prepare('SELECT status FROM tasks').get().status,'blocked');
  assert.equal(f.sql.prepare('SELECT count(*) n FROM messages').get().n,0);assert.equal(f.notifications(),0);
 }finally{await f.close();}
});
