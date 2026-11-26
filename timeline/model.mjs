// UTC is explicit: SQLite datetime('now') is UTC, unlike Date.parse of bare dates.
export function timestamp(value) {
  if (typeof value !== 'string' || !value) return null;
  const text = /^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d(?:\.\d+)?$/.test(value)
    ? value.replace(' ', 'T') + 'Z' : value;
  const n = Date.parse(text);
  return Number.isFinite(n) ? n : null;
}

export function duration(ms) {
  if (ms >= 0 && ms < 1000) return `${Math.floor(ms)} мс`;
  const seconds = Math.floor(Math.max(0, ms) / 1000);
  const h = Math.floor(seconds / 3600), m = Math.floor(seconds % 3600 / 60), s = seconds % 60;
  return [h ? `${h} ч` : '', m ? `${m} мин` : '', `${s} с`].filter(Boolean).join(' ');
}

export function family(tasks, id) {
  const ids = new Set([id]);
  for (let changed = true; changed;) {
    changed = false;
    for (const task of tasks) if (ids.has(task.parent_id) && !ids.has(task.id)) {
      ids.add(task.id); changed = true;
    }
  }
  return tasks.filter(t => ids.has(t.id));
}

export function timeline({tasks, dispatches, gates}, taskId, now = Date.now(), activeTaskId = taskId) {
  const root = tasks.find(t => t.id === taskId);
  if (!root) return null;
  const selected = family(tasks.filter(t => t.run_id === root.run_id), taskId);
  const ids = new Set(selected.map(t => t.id));
  const activeIds=new Set(Array.isArray(activeTaskId)?activeTaskId:[activeTaskId]);
  const rows = selected.map(task => {
    const attempts = dispatches.filter(d => d.taskId === task.id && d.runId === root.run_id)
      .sort((a, b) => (timestamp(a.dispatchedAt) ?? Infinity) - (timestamp(b.dispatchedAt) ?? Infinity))
      .map((d, i) => ({...interval(d.id, `Попытка ${i + 1}`, d.dispatchedAt, d.completedAt,
        ['pending', 'dispatched'].includes(d.status), d.status, 'Dispatch', now),
        runId:d.runId, taskId:d.taskId, dispatchId:d.id, attemptNumber:i+1}));
    return {id: task.id, label: task.display_name || task.task_title || task.id, attempts,
      status: task.status, source: 'Task', createdAt: task.created_at, completedAt: task.completed_at};
  });
  for (const gate of gates.filter(g => ids.has(g.task_id) && g.run_id === root.run_id
    && (!['pending','open'].includes(g.status) || activeIds.has(g.task_id)))) {
    rows.push({id: gate.id, label: 'Ожидание решения человека', status: gate.status, question: gate.question,
      attempts: [{...interval(gate.id, 'Решение человека', gate.created_at, gate.resolved_at,
        gate.status === 'pending' || gate.status === 'open', gate.status, 'Gate', now),
        gateId:gate.id, runId:gate.run_id, taskId:gate.task_id}]});
  }
  rows.sort((a, b) => (a.attempts.find(t => t.start !== null)?.start ?? timestamp(a.createdAt) ?? Infinity)
    - (b.attempts.find(t => t.start !== null)?.start ?? timestamp(b.createdAt) ?? Infinity));
  const timed = rows.flatMap(r => r.attempts).filter(a => a.start !== null && a.end !== null);
  const start = Math.min(timestamp(root.created_at) ?? now, ...timed.map(a => a.start));
  const end = Math.max(start + 1000, timestamp(root.completed_at) ?? start, ...timed.map(a => a.end));
  const current = rows.filter(r => r.attempts.some(a => a.running)).map(r => r.label);
  const taskStart = timestamp(root.created_at), taskEnd = timestamp(root.completed_at);
  return {rows, start, end, current, hasHistory: timed.length > 0,
    lifetime: taskStart !== null && taskEnd !== null && taskEnd >= taskStart ? duration(taskEnd - taskStart) : null,
    status: root.status, unknown: 'Тесты и прочие стадии: отдельные метки времени отсутствуют.'};
}

// PurpleFlow groups attempts by stage. Orca supplies the wall-clock intervals.
const stages = [
  ['clarify', 'Уточнение', /уточнен|уточнить|clarif/iu],
  ['plan', 'План', /(?:^|\s)(?:план(?:ирование)?|plan)(?:$|[\s:])/iu],
  ['approval', 'Утверждение плана', /план|plan|^согласовать реализацию/iu],
  ['implementation', 'Реализация', /реализац|реализова|исправлен|исправить|implement|^раунд \d+:/iu],
  ['checks', 'Проверки', /проверк[аи]|тест[ыов]|тестировани[ея]|\btests?\b/iu],
  ['review', 'Ревью', /ревью|независимая проверка|\breview\b/iu],
  ['acceptance', 'Приёмка', /принимаете|принять результат|при[её]мк|accept/iu],
  ['commit', 'Коммит', /коммит|commit|архивирован/iu],
];

export function stagesFor(rows, currentTaskId) {
  const result = stages.map(([id,label]) => ({id,label,attempts:[],taskIds:[]}));
  const other = {id:'other',label:'Прочие события',attempts:[],taskIds:[]};
  const ordered = [2,6,5,7,0,1,3,4];
  for (const row of rows) {
    const gate = row.attempts[0]?.source === 'Gate';
    const title = gate ? row.question : row.label;
    let planGate=false;
    if(gate){try{const value=JSON.parse(title);planGate=value?.kind==='orca-plan'&&value.schema===1;}catch{}}
    // Structured plan text is content, never a stage classifier. A result gate
    // may mention the word plan too: its explicit acceptance question wins.
    const stage = planGate?2:[6,...ordered.filter(index=>index!==6)].find(index => ([2,6].includes(index) === gate)
      && stages[index][2].test(title ?? ''));
    const group = stage === undefined ? other : result[stage];
    if(!gate && row.id!==undefined)group.taskIds.push(row.id);
    for (const attempt of row.attempts) {
      group.attempts.push({...attempt,label:gate ? title || row.label : row.label});
    }
  }
  return other.attempts.length || other.taskIds.includes(currentTaskId) ? [...result,other] : result;
}

function interval(id, label, from, to, active, status, source, now) {
  const start = timestamp(from), recordedEnd = timestamp(to);
  const running = active && recordedEnd === null;
  const end = recordedEnd ?? (running ? now : null);
  const valid = start !== null && end !== null && end >= start;
  return {id, label, start, end: valid ? end : null, running: valid && running, status, source,
    duration: valid ? duration(end - start) : 'Нет данных о длительности'};
}

// Only the documented read methods; the paired web client owns authentication.
export function reader(call) {
  const request = async (method, params) => {
    const reply = await call({method, params});
    if (!reply.ok) throw new Error('Не удалось прочитать историю. Проверьте подключение и повторите.');
    return reply.result;
  };
  const pages = async (method, params, key) => {
    const items = [], seen = new Set();
    let cursor;
    do {
      const result = await request(method, {...params, limit: 100, ...(cursor ? {cursor} : {})});
      items.push(...result[key]);
      cursor = result.nextCursor ?? result.page?.nextCursor;
      if (cursor && seen.has(cursor)) throw new Error('История неполна: повтор курсора.');
      seen.add(cursor);
    } while (cursor);
    return items;
  };
  return {
    tasks: async run => (await request('orchestration.taskList', {run})).tasks.map(t =>
      Object.fromEntries(['id', 'run_id', 'parent_id', 'display_name', 'task_title', 'status', 'created_at', 'completed_at']
        .map(k => [k, t[k]]))),
    history: async (run, tasks, taskId) => {
      const scoped=family(tasks.filter(t=>t.run_id===run),taskId);
      const ids = new Set(scoped.map(t => t.id));
      const workers = await pages('orchestration.workerList', {run}, 'workers');
      const dispatches = [];
      for (const w of workers.filter(w => ids.has(w.taskId))) {
        const result = await request('orchestration.workerShow', {dispatch: w.dispatchId});
        // Never retain worker start options, terminal contents, paths or capability fields.
        const d = result.dispatch;
        if(d.runId!==run || !ids.has(d.taskId)) continue;
        dispatches.push(Object.fromEntries(['id', 'taskId', 'runId', 'status', 'dispatchedAt', 'completedAt']
          .map(k => [k, d[k]])));
      }
      const gates = (await request('orchestration.gateList', {run})).gates
        .filter(g => g.run_id===run && ids.has(g.task_id)).map(g => Object.fromEntries(
          ['id', 'task_id', 'run_id', 'status', 'question', 'created_at', 'resolved_at'].map(k => [k, g[k]])));
      return {tasks:scoped, dispatches, gates};
    }
  };
}
