// A single shared stream per environment/workspace/instance, badge + open panel.
const overviewStreams=new Map();
export function observeWorkspaceTasks(call,subscribe,identity,onValue,onError){
  const key=JSON.stringify([identity.environmentId??'local',identity.id,identity.instanceId]);
  let stream=overviewStreams.get(key);
  if(!stream){
    stream={listeners:new Set(),disposed:false,subscription:null,value:null};overviewStreams.set(key,stream);
    const params={workspaceId:identity.id,instanceId:identity.instanceId};
    const publish=reply=>{if(stream.disposed)return;stream.error=!reply.ok;if(reply.ok){stream.value=reply.result;for(const l of stream.listeners)l.onValue(reply.result);}else for(const l of stream.listeners)l.onError();};
    if(subscribe)subscribe({method:'workflowTasks.subscribe',params},publish).then(s=>{if(stream.disposed)s.unsubscribe();else stream.subscription=s;}).catch(()=>publish({ok:false}));
    else call({method:'workflowTasks.read',params}).then(publish).catch(()=>publish({ok:false}));
  }
  const listener={onValue,onError};stream.listeners.add(listener);if(stream.value)onValue(stream.value);else if(stream.error)onError();
  return ()=>{stream.listeners.delete(listener);if(!stream.listeners.size){stream.disposed=true;stream.subscription?.unsubscribe();overviewStreams.delete(key);}};
}
export async function readWorkspaceTasks(call,identity){
  const reply=await call({method:'workflowTasks.read',params:{workspaceId:identity.id,instanceId:identity.instanceId}});
  if(!reply.ok)throw Error('Не удалось прочитать задачи пространства.');return reply.result;
}
export async function readWorkspaceHistory(call,identity,context){
  const reply=await call({method:'workflowTasks.history',params:{workspaceId:identity.id,instanceId:identity.instanceId,run:context.runId,task:context.taskId}});
  if(!reply.ok)throw Error('Не удалось прочитать историю задачи.');return reply.result;
}
