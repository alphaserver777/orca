import {family, reader} from './model.mjs';

export const bindingPath = '.orca-task-timeline.json';

// Viewing ancestry never changes the explicitly bound task used for actions.
export function historyContext(tasks, runId, taskId) {
  const sameRun=tasks.filter(t=>t.run_id===runId), byId=new Map(sameRun.map(t=>[t.id,t]));
  let root=byId.get(taskId), warning='';
  if(!root)return null;
  const seen=new Set([root.id]);
  while(root.parent_id){
    if(seen.has(root.parent_id)){warning='Цикл родства: показана только подтверждённая часть истории.';break;}
    const parent=byId.get(root.parent_id);
    if(!parent){warning='Родитель отсутствует в этом запуске: показана только подтверждённая часть истории.';break;}
    seen.add(parent.id);root=parent;
  }
  return {historyRootId:root.id,historyTitle:root.display_name || root.task_title || root.id,
    historyWarning:warning,tasks:family(sameRun,root.id)};
}

// No matching by titles, comments, parent paths or coordinator workspace.
export function bindingCandidates(workspace, binding) {
  const links = [], lineage = workspace.lineage;
  if (lineage?.worktreeId === workspace.id && lineage.worktreeInstanceId === workspace.instanceId
      && lineage.capture?.confidence === 'explicit' && lineage.origin === 'orchestration') {
    links.push({runId:lineage.orchestrationRunId,taskId:lineage.taskId});
  }
  if (binding?.schema === 1 && binding.workspace?.id === workspace.id
      && binding.workspace.instanceId === workspace.instanceId && Array.isArray(binding.links)) links.push(...binding.links.slice(0,100));
  const unique = new Map();
  for (const link of links) if (/^run_[\w-]+$/.test(link?.runId) && /^task_[\w-]+$/.test(link?.taskId)) {
    unique.set(`${link.runId}/${link.taskId}`,{runId:link.runId,taskId:link.taskId});
  }
  return [...unique.values()];
}

export async function workspaceContexts(call, identity) {
  if (!identity?.id || !identity.instanceId) return [];
  const shown = await call({method:'worktree.show',params:{worktree:`id:${identity.id}`}});
  if (!shown.ok) throw Error('Не удалось проверить карточку.');
  const workspace = shown.result.worktree;
  if (workspace.id !== identity.id || workspace.instanceId !== identity.instanceId || workspace.hostId && workspace.hostId !== 'local') return [];
  let binding;
  const file = await call({method:'files.readPreview',params:{worktree:`id:${identity.id}`,relativePath:bindingPath}});
  if (file.ok) {
    const content=file.result?.content;
    if (typeof content!=='string' || content.length>32768) throw Error('Неверная привязка карточки.');
    try {binding=JSON.parse(content);} catch {throw Error('Неверная привязка карточки.');}
  } else if (!(file.error?.code==='file_not_found' || /^ENOENT:/.test(file.error?.message || ''))) throw Error('Не удалось прочитать привязку карточки.');
  const api=reader(call), contexts=[], byRun=new Map();
  for (const link of bindingCandidates(workspace,binding)) {
    if (!byRun.has(link.runId)) byRun.set(link.runId,await api.tasks(link.runId));
    const tasks=byRun.get(link.runId).filter(t=>t.run_id===link.runId), root=tasks.find(t=>t.id===link.taskId);
    if (!root) continue;
    contexts.push({...link,title:root.display_name || root.task_title || root.id,...historyContext(tasks,link.runId,link.taskId)});
  }
  return contexts;
}
