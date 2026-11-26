import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import {bindingCandidates} from './bindings.mjs';
import {planHistory,decisionRequest,planPerson} from './decisions.mjs';

test('badge and panel streams without requestId stay independent and both clean up',async()=>{
  const directory=await mkdtemp(path.join(tmpdir(),'orca-plan-stream-'));
  try{
    const workspace={id:'fixture-workspace',instanceId:'instance',path:directory};
    await writeFile(path.join(directory,'.orca-task-timeline.json'),JSON.stringify({schema:1,workspace:{id:workspace.id,instanceId:workspace.instanceId},links:[{runId:'run_stream',taskId:'task_stream'}]}));
    const rows=[{id:'gate_stream',run_id:'run_stream',task_id:'task_stream',status:'pending',question:JSON.stringify({kind:'orca-plan',schema:1,revision:1,previousGateId:null,plan:'Test plan'})}];
    const db={getTask:()=>({id:'task_stream',run_id:'run_stream'}),listGates:()=>structuredClone(rows)};
    const listeners=new Set(),cleanups=new Map();
    const runtime={showManagedWorktree:async()=>workspace,getOrchestrationDb:()=>db,
      orchestrationDbChanges:{subscribe:callback=>{listeners.add(callback);return()=>listeners.delete(callback);}},
      registerSubscriptionCleanup:(id,cleanup)=>{assert.equal(cleanups.has(id),false,'Another stream must never be replaced');cleanups.set(id,cleanup);},
      cleanupSubscription:id=>{const cleanup=cleanups.get(id);cleanups.delete(id);cleanup?.();}};
    // Schema registration is outside this focused lifecycle test; authorization,
    // filesystem bindings, plan selection and stream handler are the real code.
    const schema=()=>({min(){return this;},max(){return this;},int(){return this;},positive(){return this;}});
    const context=vm.createContext({require:createRequire(import.meta.url),queueMicrotask,bindingCandidates,planHistory,decisionRequest,planPerson,
      g:{string:schema,number:schema,enum:schema,object:schema},Ji:value=>value});
    vm.runInContext(await readFile(new URL('./decision-server.mjs',import.meta.url),'utf8')+'\nglobalThis.methods=orcaPlanMethods();',context);
    const subscribe=context.methods.find(method=>method.name==='workflowPlan.subscribe').handler;
    const params={workspaceId:workspace.id,instanceId:workspace.instanceId,run:'run_stream',task:'task_stream'};
    const first=new AbortController(),second=new AbortController(),badge=[],panel=[];
    await subscribe(params,{runtime,connectionId:'same-connection',signal:first.signal},value=>badge.push(value));
    await subscribe(params,{runtime,connectionId:'same-connection',signal:second.signal},value=>panel.push(value));
    assert.equal(cleanups.size,2);assert.equal(listeners.size,2);
    first.abort();assert.equal(cleanups.size,1);assert.equal(listeners.size,1);
    rows[0].status='resolved';for(const listener of listeners)listener();
    await new Promise(resolve=>queueMicrotask(resolve));
    assert.equal(badge.length,1);assert.equal(panel.length,2);assert.equal(panel[1].current.gate.status,'resolved');
    second.abort();assert.equal(cleanups.size,0);assert.equal(listeners.size,0);
  }finally{await rm(directory,{recursive:true,force:true});}
});
