// IDs are local to one execution environment. No matching by title or date.
export const taskAddress = c => JSON.stringify([c.environmentId??'local',c.runId,c.taskId]);
export function groupWorkspaceTasks(seeds, tasksForRun) {
  const groups=new Map(),anchors=new Set(seeds.filter(s=>s.launchRoot).map(taskAddress));
  for(const seed of seeds){
    const tasks=tasksForRun.get(seed.runId)??[], byId=new Map(tasks.map(t=>[t.id,t]));
    let root=byId.get(seed.taskId);if(!root)continue;
    const seen=new Set([root.id]);let warning='';
    while(root.parent_id){
      if(anchors.has(taskAddress({...seed,taskId:root.id})))break;
      const parent=byId.get(root.parent_id);
      if(!parent||seen.has(parent.id)){warning='История родителя неполна или содержит цикл.';break;}
      seen.add(parent.id);root=parent;
    }
    // An explicitly bound child keeps its own action target and ancestor history.
    const taskId=seed.self?seed.taskId:root.id,key=taskAddress({...seed,taskId});
    let group=groups.get(key);
    if(!group){group={...seed,taskId,title:byId.get(taskId).display_name||byId.get(taskId).task_title||taskId,
      status:byId.get(taskId).status,historyRootId:root.id,historyWarning:warning,
      excludedRoots:seeds.filter(s=>s.launchRoot&&s.runId===seed.runId&&(s.environmentId??'local')===(seed.environmentId??'local')&&s.taskId!==root.id).map(s=>s.taskId),targets:[]};groups.set(key,group);}
    group.targets.push({workspaceId:seed.workspaceId,instanceId:seed.instanceId,runId:seed.runId,taskId:seed.taskId});
  }
  return [...groups.values()];
}
export function chooseWorkspaceTask(contexts,previous){
  return contexts.find(c=>taskAddress(c)===previous?.address)??contexts.find(c=>c.waiting)??
    contexts.find(c=>['dispatched','blocked','ready'].includes(c.status))??contexts[0]??null;
}
