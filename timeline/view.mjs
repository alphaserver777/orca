import {timeline, stagesFor} from './model.mjs';
import {openPlan} from './decision-view.mjs';
import {mountAttemptDetails} from './attempt-view.mjs';
import {selectionKey,readSelection,saveSelection} from './selection.mjs';
import {taskAddress,chooseWorkspaceTask} from './overview.mjs';
import {observeWorkspaceTasks,readWorkspaceTasks,readWorkspaceHistory} from './overview-client.mjs';

const css = `
.orca-timeline{color:var(--foreground);background:var(--background);font:13px/1.45 system-ui}
.orca-timeline header{display:flex;justify-content:space-between;align-items:center;gap:12px}
.orca-timeline h2{font-size:16px;font-weight:600}
.orca-timeline button,.orca-timeline select{padding:4px 7px;border:1px solid var(--border);border-radius:5px;font:inherit}
.orca-timeline p,.orca-timeline label{margin:6px 0}
.orca-timeline select{max-width:100%}
.orca-timeline :focus-visible{outline:2px solid currentColor}
.orca-timeline .tl-row{border-top:1px solid var(--border);padding:8px 0}
.orca-timeline summary{cursor:pointer}
.orca-timeline .tl-track{height:12px;background:var(--muted);position:relative;border-radius:3px;overflow:hidden;margin:4px 0}
.orca-timeline .tl-bar{position:absolute;height:100%;min-width:2px;background:#71a5eb}
.orca-timeline .g-live,.g-wait-live{background:#b19af0}
.orca-timeline .tl-bar[data-failed=true]{background:#dd7685}
.orca-timeline .tl-bar[data-wait=true]{background:repeating-linear-gradient(130deg,#daac55 0 3px,#644c23 3px 6px)}
.orca-timeline .tl-axis{display:flex;justify-content:space-between;gap:8px;font-size:11px}
.orca-timeline .tl-note{color:var(--muted-foreground)}
.orca-timeline .tl-plan-text{white-space:pre-wrap;overflow-wrap:anywhere;font:inherit;margin:10px 0}
.orca-timeline textarea{width:100%;padding:8px;border:1px solid var(--border);border-radius:5px;background:var(--background);color:inherit;font:inherit;resize:vertical}
.orca-timeline .tl-plan-actions{display:flex;flex-wrap:wrap;gap:8px;margin:10px 0 18px}
.orca-timeline button:disabled{opacity:.6;cursor:wait}
`;

export function el(tag, text, attrs = {}) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  return node;
}
const clock = value => new Date(value).toLocaleString('ru-RU', {hour12: false});
const statuses = {waiting:'Ждёт решения',pending:'ожидает', ready:'готова к запуску', dispatched:'в работе', completed:'завершено', failed:'ошибка', blocked:'заблокировано', resolved:'решение принято', open:'ожидает решения', circuit_broken:'выполнение остановлено'};
export const statusText = value => statuses[value] || value;

// Stored selection contains IDs only; detail payloads are never persisted.
export function renderTimeline(container, data, taskId, now, options={}) {
  const workspaceHistory=options.context?.historyMode==='workspace';
  const model=timeline(data,taskId,now,workspaceHistory?data.tasks.map(t=>t.id):options.context?.actionTarget?.taskId??options.context?.taskId??taskId);
  if(!model)return;
  const bound=options.context?.actionTarget?.taskId??options.context?.taskId??taskId;
  const rows=stagesFor(model.rows,bound);
  model.currentStage=rows.find(r=>r.attempts.some(a=>a.running&&a.taskId===bound))?.id??
    (workspaceHistory?rows.find(r=>r.attempts.some(a=>a.running))?.id:null)??rows.find(r=>r.taskIds.includes(bound))?.id;
  const {call,identity,context}=options;
  const key=selectionKey(identity,context,'selected-stage');
  const read=readSelection,save=saveSelection;
  let state=container._timeline;
  if(!state){
    const chart=el('div',undefined,{'data-purpleflow':'Timeline',class:'tl-stages'}), detail=el('div',undefined,{class:'tl-detail'});
    container.replaceChildren(chart,detail);
    state=container._timeline={chart,detail,selected:read(key)?.id??model.currentStage??'approval',details:null};
    state.remember=()=>{if(state.details)save(selectionKey(identity,context,state.selected),state.details.snapshot());};
    state.dispose=()=>{state.remember();state.details?.dispose();state.chartStop?.();delete container._timeline;};
  }
  const show=id=>{
    state.remember();state.details?.dispose();state.details=null;state.selected=id;save(key,{id});
    state.chartStop?.update(model,rows,show,id);
    container.dataset.details='true';
    if(id==='approval' && rows.find(r=>r.id===id)?.attempts.some(a=>a.taskId===bound)){
      state.detail.replaceChildren(options.decision);return;
    }
    const stage=rows.find(r=>r.id===id);
    if(stage && call)state.details=mountAttemptDetails(state.detail,call,stage,{...read(selectionKey(identity,context,id)),relatedAttempts:rows.flatMap(row=>row.attempts),onSelection:selectedId=>save(selectionKey(identity,context,id),{selectedId}),onClose:()=>{state.remember();state.details=null;}});
  };
  if(state.chartStop){
    state.chartStop.update(model,rows,show,state.selected);
    state.details?.update(rows.find(r=>r.id===state.selected)??{label:'Нет данных',attempts:[]});
  }else{state.chartStop=OrcaPurpleflow.mountPurpleflowTimeline(state.chart,model,rows,show,state.selected);show(state.selected);}
}

export function openTimeline(call,panel,identity,onClose,subscribe){
  const contextKey=selectionKey(identity,null,'workspace-task');
  const header=el('header',undefined,{class:'tl-toolbar'}),heading=el('h2','Задачи пространства');
  const count=el('span','',{class:'tl-note'}),back=el('button','Этапы',{type:'button',class:'tl-back'});
  const refresh=el('button','Обновить',{type:'button'}),close=el('button','К файлам',{type:'button'});
  header.append(heading,count,back,refresh,close);
  const list=el('nav',undefined,{class:'tl-tasks','aria-label':'Задачи пространства'}),title=el('h3','',{'data-task-title':''});
  const message=el('p','Проверка задач пространства…',{role:'status'}),boundary=el('p','',{class:'tl-note','data-decision-boundary':''});
  const content=el('div',undefined,{class:'tl-workspace'}),decision=el('section',undefined,{'aria-label':'Согласование плана'});
  panel.replaceChildren(el('style',css+OrcaPurpleflowStyles+`
    .orca-timeline .tl-toolbar h2{font-size:15px;margin:0 auto 0 0}
    .orca-timeline .tl-tasks{flex:none;max-height:180px;overflow:auto;scrollbar-width:thin;display:flex;flex-direction:column;gap:2px}
    .orca-timeline .tl-tasks[hidden]{display:none}
    .orca-timeline .tl-task{display:flex;align-items:center;gap:8px;text-align:left;min-height:34px;padding:6px 8px;border:1px solid transparent;background:transparent;color:inherit}
    .orca-timeline .tl-task:hover,.orca-timeline .tl-task[aria-pressed=true]{background:var(--muted);border-color:var(--border)}
    .orca-timeline .tl-task strong{font-weight:500;overflow-wrap:anywhere;flex:1;min-width:0}
    .orca-timeline .tl-task small{color:var(--muted-foreground);flex:none;max-width:38%;text-align:right}
    .orca-timeline .tl-task i{width:7px;height:7px;border-radius:50%;background:var(--muted-foreground);flex:none}
    .orca-timeline .tl-task[data-status=waiting] i{background:var(--wait)}
    .orca-timeline .tl-task[data-status=dispatched] i{background:var(--ok)}
    .orca-timeline [data-task-title]{border-top:1px solid var(--border);padding-top:10px}
    .orca-timeline .tl-toolbar{flex-wrap:wrap}
    .orca-timeline [data-decision-boundary]{font-size:12px;margin:0;overflow-wrap:anywhere}
  `),header,list,title,message,boundary,content);
  let disposed=false,generation=0,historyGeneration=0,refreshGeneration=0,contexts=[],current=null,data=null,stopPlan=()=>{},historySignature='';
  const draw=()=>{if(!disposed&&data&&current)renderTimeline(content,data,current.historyRootId,Date.now(),{call,identity,context:current,decision});};
  const buttons=new Map();
  const showList=()=>{
    list.hidden=contexts.length<2;count.textContent=String(contexts.length);
    const keep=new Set();
    const scroll=list.scrollTop,focused=list.contains(document.activeElement)?document.activeElement:null;let position=0;
    for(const c of contexts){const key=taskAddress(c);keep.add(key);let b=buttons.get(key);
      if(!b){b=el('button',undefined,{class:'tl-task',type:'button'});b.append(el('i'),el('strong'),el('small'));b.onclick=()=>selectTask(key,true);buttons.set(key,b);}
      b.querySelector('strong').textContent=c.title;b.querySelector('small').textContent=statusText(c.status);
      b.dataset.status=c.status;b.setAttribute('aria-pressed',String(key===taskAddress(current??{})));
      b.title=c.title+' · '+c.runId+' · '+c.taskId+' · Task: '+statusText(c.taskStatus??c.status);
      if(list.children[position]!==b)list.insertBefore(b,list.children[position]??null);position++;
    }
    for(const [key,b] of buttons)if(!keep.has(key)){b.remove();buttons.delete(key);}
    if(focused?.isConnected&&document.activeElement!==focused)focused.focus({preventScroll:true});list.scrollTop=scroll;
  };
  const history=async(token,context)=>{
    const request=++historyGeneration;
    try{const next=await readWorkspaceHistory(call,identity,context);if(!disposed&&token===generation&&request===historyGeneration){data=next;draw();}}
    catch{if(!disposed&&token===generation&&request===historyGeneration)message.textContent='Не удалось загрузить историю. Нажмите «Обновить».';}
  };
  const selectTask=(key,deliberate=false)=>{
    const next=contexts.find(c=>taskAddress(c)===key);if(!next)return;
    const changed=!current||taskAddress(next)!==taskAddress(current)||JSON.stringify(next.actionTarget)!==JSON.stringify(current.actionTarget);
    current=next;if(deliberate)saveSelection(contextKey,{address:key});showList();title.textContent=next.title;boundary.textContent=next.unavailableDecision??'';
    if(!changed)return;
    const token=++generation;stopPlan();stopPlan=()=>{};data=null;content._timeline?.dispose();content.replaceChildren();decision.replaceChildren();
    const target=next.actionTarget;
    if(subscribe&&target)stopPlan=openPlan(call,subscribe,decision,{id:target.workspaceId,instanceId:target.instanceId,hostId:identity.hostId,...(identity.environmentId&&identity.environmentId!=='local'?{environmentId:identity.environmentId}:{})},
      {runId:target.runId,taskId:target.taskId},()=>history(token,next));
    history(token,next);
  };
  const accept=value=>{
    if(disposed)return;
    const previous=readSelection(contextKey),oldSignature=historySignature;
    contexts=value.contexts??[];historySignature=JSON.stringify(value);
    message.textContent=(value.warnings??[]).join(' ');
    const chosen=chooseWorkspaceTask(contexts,previous);
    if(!chosen){++generation;current=null;data=null;stopPlan();stopPlan=()=>{};content._timeline?.dispose();content.replaceChildren();decision.replaceChildren();title.textContent='';boundary.textContent='';showList();message.textContent='У этого пространства пока нет связанной задачи.'+(message.textContent?' '+message.textContent:'');return;}
    const was=current&&taskAddress(current)===taskAddress(chosen),token=generation;
    selectTask(taskAddress(chosen));
    if(was&&token===generation&&oldSignature!==historySignature)history(generation,current);
  };
  const load=async()=>{
    const token=++refreshGeneration;
    try{const value=await readWorkspaceTasks(call,identity);if(!disposed&&token===refreshGeneration){accept(value);if(current)await history(generation,current);}}
    catch{if(!disposed&&token===refreshGeneration)message.textContent='Не удалось проверить задачи. Проверьте подключение и нажмите «Обновить».';}
  };
  const stop=observeWorkspaceTasks(call,subscribe,identity,value=>{refreshGeneration++;accept(value);},()=>{if(!disposed)message.textContent='События задач недоступны. Нажмите «Обновить».';});
  const finish=()=>{onClose();queueMicrotask(()=>document.querySelector('button:has([data-orca-timeline-icon])')?.focus());};
  const remember=()=>{if(current)saveSelection(contextKey,{address:taskAddress(current)});};
  content.addEventListener('pointerdown',remember);content.addEventListener('focusin',remember);
  back.onclick=()=>{content.dataset.details='false';content.querySelector('.gantt-row[aria-pressed=true]')?.focus();};
  refresh.onclick=load;close.onclick=finish;
  const timer=setInterval(()=>{if(content.querySelector('.g-live,.g-wait-live'))draw();},1000);
  const escape=e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();finish();}};panel.addEventListener('keydown',escape);
  return()=>{disposed=true;generation++;refreshGeneration++;clearInterval(timer);stop();stopPlan();content._timeline?.dispose();content.removeEventListener('pointerdown',remember);content.removeEventListener('focusin',remember);panel.removeEventListener('keydown',escape);panel.replaceChildren();};
}
