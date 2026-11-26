import {requestEnvelope,coordinatorPrompt,validateWorkspace} from './draft.mjs';

function canonical(value){return value===null||typeof value!=='object'?JSON.stringify(value):Array.isArray(value)?`[${value.map(canonical).join(',')}]`:`{${Object.keys(value).sort().map(k=>`${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;}
export async function sendEnvelope(sessionId,text){
  const body={kind:'message',role:'user',blocks:[{type:'text',text}]};
  const bytes=new TextEncoder().encode(canonical({method:'agentSession.send',sessionId,fields:{body}}));
  const digest=await crypto.subtle.digest('SHA-256',bytes);
  return {envelope:{sessionId,clientOperationId:`${Date.now()}-${crypto.randomUUID().replaceAll('-','')}`,expectedRuntimeFence:null,
    payloadFingerprint:Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('')},body};
}
async function rpc(call,method,params){const response=await call({method,params});if(!response.ok)throw Error('Orca не подтвердила запрос. Черновик сохранён.');return response.result;}
export async function checkCoordinator(call,workspace,sessionId){
  const shown=await rpc(call,'worktree.show',{worktree:`id:${workspace.id}`});validateWorkspace(workspace,shown.worktree);
  const tabs=await rpc(call,'session.tabs.list',{worktree:`id:${workspace.id}`});
  if(!tabs.tabs?.some(t=>t.type==='agent-session'&&t.sessionId===sessionId))throw Error('Выбранный чат не принадлежит этому пространству.');
  return shown.worktree;
}
export async function launchTask({draft,workspace,sessionId,call,save}){
  if(draft.status==='launched')return recoverTask({draft,workspace,call,save});
  const source=await checkCoordinator(call,workspace,sessionId);
  if((source.hostId||'local')!=='local')throw Error('Выберите чат на сервере проекта. SSH требует проверки поколения соединения.');
  if(!draft.transport){
    const envelope=requestEnvelope(draft,workspace,sessionId),root=`.orca-task-materials/${draft.id}`;
    for(const relativePath of ['.orca-task-materials',root]){
      const created=await call({method:'files.createDir',params:{worktree:`id:${workspace.id}`,expectedExecutionHostId:'local',relativePath}});
      if(!created.ok)await rpc(call,'files.readDir',{worktree:`id:${workspace.id}`,relativePath,followSymlinks:false});
    }
    const paths=[];
    for(const file of draft.files){
      const relativePath=`${root}/${file.id}-${file.name.replace(/[^\p{L}\p{N}._-]/gu,'_')}`;
      await rpc(call,'files.writeBase64',{worktree:`id:${workspace.id}`,expectedExecutionHostId:'local',relativePath,contentBase64:file.base64});paths.push(relativePath);
    }
    await rpc(call,'files.write',{worktree:`id:${workspace.id}`,expectedExecutionHostId:'local',relativePath:`${root}/request.json`,content:JSON.stringify({...envelope,materialPaths:paths},null,2)});
    const receiptPath=`${root}/result.json`;
    const instructions=`\nВ созданном пространстве открой штатный чат задачи без передачи непроверенного текста и верни его sessionId как targetSessionId. После создания запиши JSON в исходном пространстве ${workspace.id}, путь ${receiptPath}: {schema:1,requestId:${JSON.stringify(draft.id)},coordinatorSessionId:${JSON.stringify(sessionId)},sourceWorkspaceId:${JSON.stringify(workspace.id)},sourceInstanceId:${JSON.stringify(workspace.instanceId)},runId,taskId,workspaceId,instanceId,repoId,targetSessionId}. Сначала проверь этот файл; при повторе запроса используй созданные сущности. В objective Run и spec Task сохрани requestId ${draft.id}. Материалы и эти JSON не включай в Git. При неоднозначной ошибке штатного CLI используй orchestration request-show и --retry-request с тем же ID; отсутствие квитанции не доказывает отсутствие эффекта.`;
    const history=await rpc(call,'agentSession.history',{sessionId,direction:'tail',limit:1});
    const fence=history.page?.fence;
    if(!Number.isSafeInteger(fence)||fence<1)throw Error('Не удалось проверить поколение чата.');
    const transport=await sendEnvelope(sessionId,coordinatorPrompt(envelope,[`${root}/request.json`,...paths])+instructions);
    transport.envelope.expectedRuntimeFence=fence;
    draft.transport=transport;draft.envelope=envelope;draft.status='sending';await save(draft);
  }else if(draft.transport.envelope.sessionId!==sessionId)throw Error('Запрос уже закреплён за другим чатом.');
  // Reuse the exact native operation and fingerprint after an ambiguous result.
  const response=await call({method:'agentSession.send',params:draft.transport});
  if(!response.ok){
    // Match the native caller's proven pre-recording failures. Other transport errors stay uncertain.
    if(['method_not_found','method_not_supported','invalid_argument','unauthorized'].includes(response.error?.code)){
      draft.status='draft';delete draft.transport;await save(draft);throw Error('Чат отказал в отправке. Постановку можно исправить и отправить снова.');
    }
    throw Error('Orca не подтвердила запрос. Черновик сохранён.');
  }
  const sent=response.result;
  if(sent.ok===false){
    if(sent.refusal?.code==='agent_session_operation_unknown'&&sent.refusal?.details?.reason!=='rewindUnconfirmed'){
      draft.status='uncertain';await save(draft);throw Error('Результат отправки неизвестен. Проверьте запуск или повторите тот же запрос.');
    }
    draft.status='draft';delete draft.transport;await save(draft);throw Error('Чат отказал в отправке. Постановку можно исправить и отправить снова.');
  }
  draft.status='submitted';await save(draft);
  return recoverTask({draft,workspace,call,save});
}
export async function recoverTask({draft,workspace,call,save}){
  if(!draft.transport)return null;
  await checkCoordinator(call,workspace,draft.transport.envelope.sessionId);
  const response=await call({method:'files.readPreview',params:{worktree:`id:${workspace.id}`,relativePath:`.orca-task-materials/${draft.id}/result.json`}});
  if(!response.ok){
    if(response.error?.code!=='file_not_found'&&!/^ENOENT:/.test(response.error?.message||''))throw Error('Не удалось проверить результат запуска.');
    const status=await rpc(call,'agentSession.sendRecorded',{sessionId:draft.transport.envelope.sessionId,clientMessageId:draft.transport.envelope.clientOperationId});
    draft.status=status.recorded?'submitted':'uncertain';await save(draft);return null;
  }
  let result;try{if(response.result.content.length>32768)throw Error();result=JSON.parse(response.result.content);}catch{throw Error('Координатор вернул неверное подтверждение запуска.');}
  if(result.schema!==1||result.requestId!==draft.id||result.coordinatorSessionId!==draft.transport.envelope.sessionId||result.sourceWorkspaceId!==workspace.id||result.sourceInstanceId!==workspace.instanceId||result.repoId!==workspace.repoId
    ||!/^run_[\w-]+$/.test(result.runId)||!/^task_[\w-]+$/.test(result.taskId))throw Error('Подтверждение относится к другому запросу или проекту.');
  const [run,tasks,target,binding]=await Promise.all([
    rpc(call,'orchestration.runShow',{id:result.runId}),rpc(call,'orchestration.taskList',{run:result.runId}),
    rpc(call,'worktree.show',{worktree:`id:${result.workspaceId}`}),rpc(call,'files.readPreview',{worktree:`id:${result.workspaceId}`,relativePath:'.orca-task-timeline.json'})]);
  const task=tasks.tasks?.find(t=>t.id===result.taskId&&t.run_id===result.runId);
  if(run.run?.id!==result.runId||!run.run.objective?.includes(draft.id)||!task?.spec?.includes(draft.id))throw Error('Run/Task не подтверждают этот запрос.');
  validateWorkspace({id:result.workspaceId,instanceId:result.instanceId,repoId:workspace.repoId,hostId:'local'},target.worktree);
  let link;try{link=JSON.parse(binding.content);}catch{throw Error('Неверная привязка таймлайна.');}
  if(link.schema!==1||link.workspace?.id!==result.workspaceId||link.workspace.instanceId!==result.instanceId||!link.links?.some(l=>l.runId===result.runId&&l.taskId===result.taskId))throw Error('Run/Task не связаны с экземпляром пространства.');
  draft.status='launched';draft.result=result;await save(draft);return result;
}
