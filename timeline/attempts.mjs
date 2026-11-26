import {timestamp} from './model.mjs';

const text = value => typeof value === 'string' && /^[\w. :+-]{1,160}$/u.test(value) ? value : null;
const outcomes = new Set(['succeeded','failed','stopped','abandoned','in_progress','outcome_unknown']);

// workerShow is the existing workspace-authorized read. Do not read workerRead:
// it may fall back to the private terminal and contains prompts and tool arguments.
export async function readAttempt(call, attempt) {
  if (attempt.source !== 'Dispatch') return null;
  const reply = await call({method:'orchestration.workerShow',params:{dispatch:attempt.dispatchId}});
  if (!reply.ok) throw Error('Не удалось прочитать попытку.');
  const {dispatch:d, worker:w, projection:p, observation:o} = reply.result;
  if (!d || d.id !== attempt.dispatchId || d.runId !== attempt.runId || d.taskId !== attempt.taskId)
    throw Error('Привязка попытки изменилась.');
  const sameProjection = p?.dispatchId === d.id && p?.runId === d.runId && p?.taskId === d.taskId;
  const projection = sameProjection ? p : null;
  const events = [];
  const event = (value, label, source) => {
    const at = timestamp(value);
    if (at !== null) events.push({at,label,source});
  };
  event(d.createdAt,'Назначение создано','Dispatch.createdAt');
  event(d.dispatchedAt,'Попытка назначена','Dispatch.dispatchedAt');
  event(d.lastHeartbeatAt,'Последний heartbeat','Dispatch.lastHeartbeatAt');
  event(d.completedAt,'Назначение закрыто','Dispatch.completedAt');
  events.sort((a,b)=>a.at-b.at);
  const verdict = projection?.liveness?.verdict ?? (o?.exactWorker === true ? o.status : 'unverifiable');
  const activity = projection?.stage?.activity;
  let agentState = 'Статус агента недоступен';
  if (verdict === 'exited') agentState = 'Процесс агента завершён';
  if (verdict === 'live') {
    agentState = ['working','running','busy'].includes(activity) ? 'Агент работает'
      : ['waiting','idle','blocked'].includes(activity) || o?.agentWait
        ? 'Агент ожидает' : 'Процесс агента доступен; активность неизвестна';
  }
  return {
    id:d.id, status:d.status, open:['pending','dispatched'].includes(d.status), agentState,
    agent:text(projection?.provider?.id) ?? text(w?.startOptions?.agent),
    model:text(projection?.provider?.model) ?? text(w?.startOptions?.model),
    lastActivity:timestamp(d.lastHeartbeatAt),
    outcome:outcomes.has(projection?.outcome) ? projection.outcome : 'outcome_unknown',
    events, journalAvailable:false,
    journalNote:'Журнал попытки недоступен в безопасных структурированных read-данных.',
    reportNote:'Текст отчёта этой попытки недоступен. Общий результат задачи не подставляется.',
  };
}

// The generation is advanced on every selection, context update and disposal.
export function attemptSelection(read, changed, restoredId = null) {
  let generation=0, disposed=false, attempts=[], selectedId=restoredId, latest=null;
  const publish=value=>{latest=value;changed(value);};
  const signature=a=>JSON.stringify(a&&[a.id,a.source,a.dispatchId,a.runId,a.taskId,a.status,a.running,a.start,a.running?null:a.end]);
  const select = async id => {
    const token=++generation;
    const attempt=attempts.find(a=>a.id===id);
    selectedId=attempt?.id ?? null;
    if (disposed) return;
    publish({attempt,selectedId,loading:!!attempt,detail:null});
    if (!attempt) return;
    try {
      const detail=await read(attempt);
      if (!disposed && token===generation) publish({attempt,selectedId,loading:false,detail});
    } catch {
      if (!disposed && token===generation) publish({attempt,selectedId,loading:false,detail:null,error:'Не удалось прочитать попытку. Повторите выбор.'});
    }
  };
  return {
    select,
    update(next) {
      const before=attempts.find(a=>a.id===selectedId);attempts=next;
      const after=attempts.find(a=>a.id===selectedId);
      if(!disposed && latest && after && signature(before)===signature(after)) {publish({...latest,attempt:after});return;}
      return select(after?.id ?? attempts.at(-1)?.id);
    },
    snapshot() {return {selectedId};},
    dispose() {disposed=true;generation++;},
  };
}
