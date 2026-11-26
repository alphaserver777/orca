import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm,mkdir,symlink,readFile} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {bindingCandidates} from './bindings.mjs';
import {family} from './model.mjs';
import {taskAddress,groupWorkspaceTasks} from './overview.mjs';
import {planEnvelope,planPerson} from './decisions.mjs';

test('purpose-specific discovery, scope and lifecycle use exact instances; no project or Run scan',async()=>{
  const dir=await mkdtemp(path.join(tmpdir(),'orca-overview-'));
  try{
    const root={id:'parent',instanceId:'p1',repoId:'repo',projectId:'project',path:path.join(dir,'parent'),childWorktreeIds:['a','review','foreign','stale']};
    const child=id=>({id,instanceId:id+'1',repoId:'repo',projectId:'project',parentWorktreeId:'parent',path:path.join(dir,id),lineage:{worktreeId:id,worktreeInstanceId:id+'1',parentWorktreeId:'parent',parentWorktreeInstanceId:'p1',capture:{confidence:'explicit'}}});
    const a=child('a'),review=child('review'),foreign={...child('foreign'),repoId:'other'},stale=child('stale');stale.lineage.parentWorktreeInstanceId='old';
    const cards=new Map([root,a,review,foreign,stale].map(w=>[w.id,w]));
    for(const w of cards.values())await mkdir(w.path);
    const bind=async(w,task)=>writeFile(path.join(w.path,'.orca-task-timeline.json'),JSON.stringify({schema:1,workspace:{id:w.id,instanceId:w.instanceId},links:[{runId:'run_one',taskId:task}]}));
    await bind(a,'task_a');await bind(review,'task_review');await bind(foreign,'task_secret');await bind(stale,'task_secret');
    const tasks=[{id:'task_a',run_id:'run_one',status:'dispatched'},{id:'task_review',run_id:'run_one',parent_id:'task_a',status:'completed'},{id:'task_secret',run_id:'run_one'}];
    const db={listTasksWithDispatch:({runId})=>{assert.equal(runId,'run_one');return tasks;},getTask:id=>({...tasks.find(t=>t.id===id),spec:'request-2'}),getRun:()=>({objective:'request-2'}),listGates:()=>[],db:{prepare:()=>({all:()=>[]})}};
    const changes=new Set(),layouts=new Set(),cleanups=new Map();let shows=0;
    const runtime={showManagedWorktree:async selector=>{shows++;return cards.get(selector.slice(3));},getOrchestrationDb:()=>db,
      orchestrationDbChanges:{subscribe:cb=>{changes.add(cb);return()=>changes.delete(cb);}},
      subscribeWorkspaceLayouts:cb=>{layouts.add(cb);return {unsubscribe:()=>layouts.delete(cb)};},
      registerSubscriptionCleanup:(id,fn)=>cleanups.set(id,fn),cleanupSubscription:id=>{cleanups.get(id)?.();cleanups.delete(id);}};
    const schema=()=>({min(){return this;}});
    const ctx=vm.createContext({require:createRequire(import.meta.url),bindingCandidates,family,groupWorkspaceTasks,taskAddress,planEnvelope,planPerson,_Js:()=>false,queueMicrotask,
      g:{string:schema,object:schema},Ji:value=>value});
    vm.runInContext(await readFile(new URL('./overview-server.mjs',import.meta.url),'utf8'),ctx);
    const params={workspaceId:root.id,instanceId:root.instanceId};
    const caller={runtime,caller:{kind:'paired-device'},clientKind:'runtime'};
    const result=await ctx.overviewRead(params,caller);
    assert.deepEqual(Array.from(result.contexts,c=>c.taskId),['task_a']);
    assert.ok(result.warnings.length);assert.equal(shows,6);
    await assert.rejects(ctx.overviewRead({...params,instanceId:'old'},caller),/workspace_changed/);
    await assert.rejects(ctx.overviewHistory({...params,run:'run_one',task:'task_secret'},caller),/task_not_bound/);
    await assert.rejects(ctx.overviewRead(params,{...caller,orchestrationCaller:{}}),/person_required/);
    await assert.rejects(ctx.overviewRead(params,{...caller,caller:{kind:'paired-device',agent:true}}),/person_required/);
    const methods=ctx.overviewMethods(),controller=new AbortController(),values=[];
    await methods.find(m=>m.name==='workflowTasks.subscribe').handler(params,{...caller,signal:controller.signal,connectionId:'one'},v=>values.push(v));
    assert.equal(changes.size,1);assert.equal(layouts.size,1);assert.equal(values.length,1);
    controller.abort();assert.equal(changes.size,0);assert.equal(layouts.size,0);assert.equal(cleanups.size,0);
    const receiptDir=path.join(root.path,'.orca-task-materials','request-2');await mkdir(receiptDir,{recursive:true});
    const request={schema:1,requestId:'request-2',workspace:{id:root.id,instanceId:root.instanceId},coordinatorSessionId:'second-chat'};
    const receipt={schema:1,requestId:'request-2',sourceWorkspaceId:root.id,sourceInstanceId:root.instanceId,repoId:root.repoId,workspaceId:review.id,instanceId:review.instanceId,runId:'run_one',taskId:'task_review',coordinatorSessionId:'second-chat'};
    await writeFile(path.join(receiptDir,'request.json'),JSON.stringify(request));await writeFile(path.join(receiptDir,'result.json'),JSON.stringify(receipt));
    const launched=await ctx.overviewRead(params,caller);
    assert.deepEqual(Array.from(launched.contexts,c=>c.taskId),['task_a','task_review']);
    const history=await ctx.overviewHistory({...params,run:'run_one',task:'task_a'},caller);
    assert.deepEqual(Array.from(history.tasks,t=>t.id),['task_a'],'Independent launch is excluded from umbrella history');
    await writeFile(path.join(receiptDir,'request.json'),JSON.stringify({...request,workspace:{id:root.id,instanceId:'old'}}));
    assert.equal((await ctx.overviewRead(params,caller)).contexts.length,1,'Stale receipt cannot create an independent task');
    await symlink(path.join(a.path,'.orca-task-timeline.json'),path.join(root.path,'.orca-task-timeline.json'));
    await assert.rejects(ctx.overviewRead(params,caller),/ELOOP/);
  }finally{await rm(dir,{recursive:true,force:true});}
});
