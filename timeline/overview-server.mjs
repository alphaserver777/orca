// Purpose-specific workspace read surface. Parenthood grants no mutation rights.
function overviewJSON(directory,name){
  const fs=require('node:fs'),path=require('node:path');
  const dir=fs.openSync(directory,fs.constants.O_RDONLY|fs.constants.O_DIRECTORY|fs.constants.O_NOFOLLOW);
  try{
    const fd=fs.openSync(path.join('/proc/self/fd',String(dir),name),fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);
    try{if(!fs.fstatSync(fd).isFile()||fs.fstatSync(fd).size>32768)throw Error('invalid_binding');return JSON.parse(fs.readFileSync(fd,'utf8'));}finally{fs.closeSync(fd);}
  }catch(e){if(e.code==='ENOENT')return null;throw e;}finally{fs.closeSync(dir);}
}
async function overviewWorkspace(params,ctx){
  // This human sidebar is not an alternative route around native agent Run ACLs.
  if(!planPerson(ctx.caller,ctx.clientKind,_Js(ctx),ctx.orchestrationCaller))throw Error('person_required');
  const w=await ctx.runtime.showManagedWorktree('id:'+params.workspaceId);
  if(w.id!==params.workspaceId||w.instanceId!==params.instanceId||(w.hostId&&w.hostId!=='local'))throw Error('workspace_changed');
  return w;
}
async function overviewRead(params,ctx){
  const w=await overviewWorkspace(params,ctx),db=ctx.runtime.getOrchestrationDb(),seeds=[],warnings=[];
  const binding=card=>overviewJSON(card.path,'.orca-task-timeline.json');
  const add=(card,self=false)=>{for(const link of bindingCandidates(card,binding(card)))seeds.push({...link,workspaceId:card.id,instanceId:card.instanceId,environmentId:'local',self});};
  add(w,true);
  // Follow only native child IDs, never enumerate projects or Runs.
  const visited=new Set([w.id]),queue=[w];let count=0;
  while(queue.length){
    const parent=queue.shift();
    for(const id of parent.childWorktreeIds??[]){
      if(visited.has(id))continue;visited.add(id);
      if(++count>200){warnings.push('Показаны первые 200 потомков. Уточните явные привязки.');queue.length=0;break;}
      let child;try{child=await ctx.runtime.showManagedWorktree('id:'+id);}catch{warnings.push('Часть дочерних пространств недоступна.');continue;}
      const l=child.lineage;
      if(child.repoId!==w.repoId||child.projectId!==w.projectId||(child.hostId??'local')!=='local')continue;
      if(child.parentWorktreeId!==parent.id||l?.parentWorktreeId!==parent.id||l?.parentWorktreeInstanceId!==parent.instanceId
        ||l?.worktreeId!==child.id||l.worktreeInstanceId!==child.instanceId||l.capture?.confidence!=='explicit'){
        warnings.push('Есть исторические дочерние пространства без подтверждённой связи экземпляров.');continue;
      }
      queue.push(child);try{add(child);}catch{warnings.push('Привязка дочернего пространства недоступна.');}
    }
  }
  // Composer receipts are confined to this exact source workspace/instance and
  // corroborated against request, target binding and native Run/Task request IDs.
  const fs=require('node:fs'),path=require('node:path'),materials=path.join(w.path,'.orca-task-materials');let materialFd;
  try{
    materialFd=fs.openSync(materials,fs.constants.O_RDONLY|fs.constants.O_DIRECTORY|fs.constants.O_NOFOLLOW);
    const materialRoot=path.join('/proc/self/fd',String(materialFd));
    const entries=fs.readdirSync(materialRoot,{withFileTypes:true}).filter(d=>d.isDirectory()&&!d.isSymbolicLink());
    if(entries.length>200)warnings.push('Показаны первые 200 квитанций запуска.');
    const dirs=entries.slice(0,200);
    for(const dir of dirs){try{
      const folder=path.join(materialRoot,dir.name),r=overviewJSON(folder,'result.json'),q=overviewJSON(folder,'request.json');
      if(!r||!q||r.schema!==1||q.schema!==1||r.requestId!==dir.name||q.requestId!==dir.name||q.workspace?.id!==w.id||q.workspace?.instanceId!==w.instanceId||r.sourceWorkspaceId!==w.id||r.sourceInstanceId!==w.instanceId
        ||r.repoId!==w.repoId||r.coordinatorSessionId!==q.coordinatorSessionId)continue;
      const task=db.getTask(r.taskId),run=db.getRun(r.runId);
      if(task?.run_id!==r.runId||!task.spec?.includes(dir.name)||!run?.objective?.includes(dir.name))continue;
      const target=await ctx.runtime.showManagedWorktree('id:'+r.workspaceId);
      if(target.instanceId!==r.instanceId||target.repoId!==w.repoId||target.projectId!==w.projectId||(target.hostId??'local')!=='local')continue;
      if(bindingCandidates(target,binding(target)).some(l=>l.runId===r.runId&&l.taskId===r.taskId))seeds.push({runId:r.runId,taskId:r.taskId,workspaceId:target.id,instanceId:target.instanceId,environmentId:'local',launchRoot:true});
    }catch{warnings.push('Часть квитанций запуска не подтверждена.');}}
  }catch(e){if(e.code!=='ENOENT')warnings.push('Квитанции запуска недоступны.');}finally{if(materialFd!==undefined)fs.closeSync(materialFd);}
  const runs=new Map();
  for(const s of seeds)if(!runs.has(s.runId))runs.set(s.runId,db.listTasksWithDispatch({runId:s.runId}).filter(t=>t.run_id===s.runId));
  const contexts=groupWorkspaceTasks(seeds,runs);
  for(const c of contexts){
    const excluded=new Set(c.excludedRoots.flatMap(id=>family(runs.get(c.runId),id).map(t=>t.id)));
    const tasks=family(runs.get(c.runId),c.historyRootId).filter(t=>!excluded.has(t.id)),ids=new Set(tasks.map(t=>t.id));
    const gates=tasks.flatMap(t=>db.listGates({taskId:t.id})).filter(g=>g.run_id===c.runId&&ids.has(g.task_id));
    c.waiting=gates.some(g=>g.status==='pending'||g.status==='open');
    const live=tasks.find(t=>t.status==='dispatched');c.active=!!live;
    c.taskStatus=c.status;c.status=c.waiting?'waiting':live?'dispatched':c.status;
    c.historyVersion=require('node:crypto').createHash('sha256').update(JSON.stringify(tasks.map(t=>[t.id,t.status,t.completed_at,
      db.db.prepare('SELECT id,status,dispatched_at,completed_at FROM dispatch_contexts WHERE run_id = ? AND task_id = ?').all(c.runId,t.id),
      gates.filter(g=>g.task_id===t.id).map(g=>[g.id,g.status,g.resolved_at])]))).digest('hex');
    // Exact currently bound target for plan authority. Ancestor history remains read-only.
    const planTarget=c.targets.find(t=>t.taskId===c.taskId);
    c.actionTarget=planTarget;
    c.unavailableDecision=gates.some(g=>g.status==='pending'&&!planEnvelope(g))?'Для этого вида решения управление в WEB-панели недоступно. Ответьте через штатное согласование координатора.':'';
    if(gates.some(g=>g.status==='pending'&&planEnvelope(g)&&(!planTarget||g.task_id!==planTarget.taskId)))
      c.unavailableDecision+=' План другой задачи в этой истории доступен только для чтения: выберите её явно связанное пространство для согласования.';
    c.historyMode=c.self?'bound':'workspace';delete c.targets;delete c.self;delete c.launchRoot;
  }
  contexts.sort((a,b)=>Number(b.waiting)-Number(a.waiting)||Number(b.active)-Number(a.active));
  // Revalidate the requested generation after asynchronous discovery.
  await overviewWorkspace(params,ctx);
  return {contexts,warnings:[...new Set(warnings)]};
}
async function overviewHistory(params,ctx){
  const value=await overviewRead(params,ctx),c=value.contexts.find(c=>c.runId===params.run&&c.taskId===params.task);
  if(!c)throw Error('task_not_bound');
  const db=ctx.runtime.getOrchestrationDb(),all=db.listTasksWithDispatch({runId:c.runId}).filter(t=>t.run_id===c.runId);
  const excluded=new Set(c.excludedRoots.flatMap(id=>family(all,id).map(t=>t.id)));
  const tasks=family(all,c.historyRootId).filter(t=>!excluded.has(t.id)),pick=(o,keys)=>Object.fromEntries(keys.map(k=>[k,o[k]]));
  const dispatches=[],gates=[];
  for(const t of tasks){
    // Prepared native SQLite read, strictly confined to confirmed task identities.
    for(const d of db.db.prepare('SELECT id,run_id,task_id,status,dispatched_at,completed_at FROM dispatch_contexts WHERE run_id = ? AND task_id = ?').all(c.runId,t.id))
      dispatches.push({id:d.id,runId:d.run_id,taskId:d.task_id,status:d.status,dispatchedAt:d.dispatched_at,completedAt:d.completed_at});
    gates.push(...db.listGates({taskId:t.id}).filter(g=>g.run_id===c.runId).map(g=>pick(g,['id','run_id','task_id','status','question','created_at','resolved_at'])));
  }
  return {tasks:tasks.map(t=>pick(t,['id','run_id','parent_id','display_name','task_title','status','created_at','completed_at'])),dispatches,gates};
}
function overviewMethods(){
  const identity={workspaceId:g.string().min(1),instanceId:g.string().min(1)};
  return [
    {name:'workflowTasks.read',permission:'workspace',params:g.object(identity),handler:overviewRead},
    {name:'workflowTasks.history',permission:'workspace',params:g.object({...identity,run:g.string().min(1),task:g.string().min(1)}),handler:overviewHistory},
    Ji({name:'workflowTasks.subscribe',permission:'workspace',params:g.object(identity),handler:async(e,c,emit)=>{
      await overviewWorkspace(e,c);
      let stopped=false,busy=false,dirty=false,last='';const runtime=c.runtime;
      const send=async()=>{if(stopped)return;if(busy){dirty=true;return;}busy=true;
        try{const value=await overviewRead(e,c),key=JSON.stringify(value);if(!stopped&&key!==last){last=key;emit(value);}}
        catch{if(!stopped)emit({contexts:[],warnings:['Связь пространства изменилась. Обновите панель.']});}
        finally{busy=false;if(dirty){dirty=false;queueMicrotask(send);}}};
      const unwatch=runtime.orchestrationDbChanges.subscribe(send);
      const layouts=runtime.subscribeWorkspaceLayouts(()=>send());
      const id='workflow-tasks:'+c.connectionId+':'+require('node:crypto').randomUUID(),stop=()=>runtime.cleanupSubscription(id);
      runtime.registerSubscriptionCleanup(id,()=>{stopped=true;unwatch();layouts.unsubscribe();c.signal?.removeEventListener('abort',stop);},c.connectionId);
      c.signal?.addEventListener('abort',stop,{once:true});if(c.signal?.aborted)stop();else await send();
    }}),
  ];
}
