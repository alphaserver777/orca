// Embedded only into the version-pinned native RPC registry. No HTTP endpoint,
// browser credentials, shell execution, coordinator impersonation or general grants.
async function orcaPlanContext(params,ctx) {
  const workspace=await ctx.runtime.showManagedWorktree('id:'+params.workspaceId);
  if(workspace.id!==params.workspaceId||workspace.instanceId!==params.instanceId
    ||workspace.hostId&&workspace.hostId!=='local')throw Error('workspace_changed');
  const fs=require('node:fs'),path=require('node:path');
  let binding;
  try{
    const fd=fs.openSync(path.join(workspace.path,'.orca-task-timeline.json'),fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);
    try{if(fs.fstatSync(fd).size>32768)throw Error('invalid_binding');binding=JSON.parse(fs.readFileSync(fd,'utf8'));}finally{fs.closeSync(fd);}
  }catch(error){if(error.code!=='ENOENT')throw error;}
  if(!bindingCandidates(workspace,binding).some(link=>link.runId===params.run&&link.taskId===params.task))throw Error('task_not_bound');
  const db=ctx.runtime.getOrchestrationDb(),task=db.getTask(params.task);
  if(!task||task.run_id!==params.run)throw Error('task_not_found');
  return db;
}

function orcaPlanRead(db,params) {
  // No specs, launch options, paths, worker tokens or terminal contents leave here.
  return planHistory(db.listGates({taskId:params.task}),params.run,params.task);
}

async function orcaPlanRespond(params,ctx) {
  if(!planPerson(ctx.caller,ctx.clientKind,_Js(ctx),ctx.orchestrationCaller))throw Error('person_required');
  const db=await orcaPlanContext(params,ctx);
  let message,result;
  // Synchronous native SQLite transaction: re-read after async identity validation.
  db.db.exec('SAVEPOINT workflow_plan_answer');
  try{
    const current=orcaPlanRead(db,params).current;
    if(!current||current.gate.id!==params.gate||current.plan.revision!==params.revision
      ||current.gate.status!=='pending')throw Error('decision_conflict');
    // Use only the entry re-read and verified inside this transaction.
    const request=decisionRequest({id:params.workspaceId,instanceId:params.instanceId},
      {runId:params.run,taskId:params.task},current,params.decision,params.comment);
    const answer={kind:'orca-plan-answer',schema:1,revision:params.revision,decision:request.decision,comment:request.comment};
    const gate=db.resolveGate(params.gate,JSON.stringify(answer));
    if(request.decision==='return')db.updateTaskStatus(params.task,'blocked');
    message=db.insertMessage({from:'workflow-plan',to:'run:'+params.run,type:'status',
      subject:request.decision==='accept'?'План принят':'План возвращён',
      body:JSON.stringify({runId:params.run,taskId:params.task,gateId:params.gate,...answer}),runId:params.run,taskId:params.task});
    result={gateId:gate.id,revision:params.revision,decision:request.decision,messageId:message.id};
    db.db.exec('RELEASE workflow_plan_answer');
  }catch(error){db.db.exec('ROLLBACK TO workflow_plan_answer');db.db.exec('RELEASE workflow_plan_answer');throw error;}
  ctx.runtime.notifyMessageArrived(message.to_handle,message.type);
  return result;
}

function orcaPlanMethods() {
  const context={workspaceId:g.string().min(1),instanceId:g.string().min(1),run:g.string().min(1),task:g.string().min(1)};
  const params=g.object(context);
  return [
    {name:'workflowPlan.read',permission:'workspace',params,handler:async(e,c)=>orcaPlanRead(await orcaPlanContext(e,c),e)},
    {name:'workflowPlan.respond',permission:'workspace',params:g.object({...context,gate:g.string().min(1),revision:g.number().int().positive(),decision:g.enum(['accept','return']),comment:g.string().max(8000)}),handler:orcaPlanRespond},
    Ji({name:'workflowPlan.subscribe',permission:'workspace',params,handler:async(e,c,emit)=>{
      const db=await orcaPlanContext(e,c),runtime=c.runtime;
      let stopped=false,queued=false,last='';
      const send=()=>{if(stopped)return;const value=orcaPlanRead(db,e),key=JSON.stringify(value);if(key!==last){last=key;emit(value);}};
      const watch=runtime.orchestrationDbChanges.subscribe(()=>{if(!queued){queued=true;queueMicrotask(()=>{queued=false;send();});}});
      // A badge and panel can observe the same Task on one connection. Generic
      // bridges may omit requestId; cleanup must never replace another stream.
      const id='workflow-plan:'+c.connectionId+':'+require('node:crypto').randomUUID();
      const stop=()=>runtime.cleanupSubscription(id);
      runtime.registerSubscriptionCleanup(id,()=>{stopped=true;watch();c.signal?.removeEventListener('abort',stop);},c.connectionId);
      c.signal?.addEventListener('abort',stop,{once:true});
      if(c.signal?.aborted)stop();else send();
    }}),
  ];
}
