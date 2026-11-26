// Structure adapted from PurpleFlow 0.10.0 StageDrawer: header, attempt tabs,
// selected-attempt body. MIT notice is retained in purpleflow-LICENSE.txt.
import {readAttempt, attemptSelection} from './attempts.mjs';

const node=(tag,text,attrs={})=>{
  const element=document.createElement(tag);
  if(text!==undefined)element.textContent=text;
  for(const [key,value] of Object.entries(attrs))element.setAttribute(key,String(value));
  return element;
};
const moment=value=>value===null || value===undefined ? 'Нет данных' : new Date(value).toLocaleString('ru-RU',{hour12:false});
const state=value=>({pending:'ожидает запуска',dispatched:'поручение открыто',completed:'завершено',failed:'ошибка',circuit_broken:'остановлено',resolved:'решение принято',timeout:'закрыто',open:'ожидает решения'}[value] ?? value ?? 'Нет данных');
const outcome=value=>({succeeded:'успех',failed:'ошибка',stopped:'остановлено',abandoned:'прервано',in_progress:'результат ещё не получен',outcome_unknown:'нет подтверждённого результата'}[value] ?? 'Нет данных');

// One controller per panel/context. Keep snapshot() under the exact workspace,
// instance, run, task and stage identity; never persist fetched details.
// In show(stageId):
//   details?.dispose();
//   details = mountAttemptDetails(detail, call, rows.find(r=>r.id===stageId),
//     {selectedId: savedByContextAndStage.get(contextKey)?.selectedId});
// Before replacing context/closing, save details.snapshot(), then dispose().
// On fresh history for the same stage call details.update(nextStage).
export function mountAttemptDetails(container, call, stage, options={}) {
  const heading=node('strong',stage.label), tabs=node('nav',undefined,{'aria-label':'Попытки этапа'});
  const body=node('div',undefined,{'aria-live':'polite',class:'drawer-body'});
  const close=node('button','Закрыть детали',{type:'button'});
  const header=node('header',undefined,{class:'drawer-head'});
  header.append(heading,tabs,close);
  container.replaceChildren(header,body);
  let currentStage=stage;
  const controller=attemptSelection(a=>readAttempt(call,a), value=>{
    options.onSelection?.(value.selectedId);
    for(const button of tabs.children)button.setAttribute('aria-pressed',String(button.dataset.id===value.selectedId));
    body.replaceChildren();
    const a=value.attempt;
    body.append(node('p',`Состояние этапа: ${currentStage.attempts.some(a=>a.running) ? 'есть открытое поручение или ожидание решения' : currentStage.attempts.length ? 'нет открытых попыток' : 'нет данных'}`));
    if(!a){body.append(node('p','У этапа нет записанных попыток.'));return;}
    body.append(node('p',`${a.label} · ${state(a.status)} · ${a.duration}`),
      node('p',`Начало: ${moment(a.start)}`),
      node('p',`Окончание: ${a.running ? 'Поручение ещё открыто' : moment(a.end)}`),
      node('p',`Задача: ${a.label} · ${a.taskId ?? 'Нет данных'}`),
      node('p',`ID: ${a.dispatchId ?? a.gateId ?? a.id}`));
    const concurrent=(options.relatedAttempts??[]).filter(other=>other.id!==a.id
      && a.start!==null&&a.end!==null&&other.start!==null&&other.end!==null
      && other.start<a.end&&a.start<other.end);
    if(concurrent.length)body.append(node('p','Одновременно по записанным событиям: '+concurrent.map(other=>`${other.label} (${other.taskId}, ${other.id})`).join('; ')));
    if(value.loading){body.append(node('p','Чтение выбранной попытки…'));return;}
    if(value.error){body.append(node('p',value.error,{role:'alert'}));return;}
    const d=value.detail;
    if(!d){body.append(node('p','Исполнитель: человек'),node('p','Событие решения из нативной истории. Действия доступны только в панели согласования привязанной задачи.'));return;}
    body.append(node('p',`Назначение: ${d.open ? 'поручение открыто' : 'поручение закрыто'}`),
      node('p',d.agentState),node('p',`Исполнитель: ${d.agent ?? 'Нет данных'}`),
      node('p',`Модель: ${d.model ?? 'Нет данных'}`),
      node('p',`Последняя активность (heartbeat): ${moment(d.lastActivity)}`),
      node('h4','Результат'),node('p',outcome(d.outcome)),node('p',d.reportNote),node('h4','События'));
    const events=node('ol');
    for(const event of d.events)events.append(node('li',`${moment(event.at)} · ${event.label} · ${event.source}`));
    body.append(events);
    if(!d.events.length)body.append(node('p','Нет записанных событий.'));
    body.append(node('h4','Журнал выбранной попытки'),node('p',d.journalNote));
  },options.selectedId);
  let tabSignature='';
  const update=next=>{
    currentStage=next;heading.textContent=next.label;
    const signature=JSON.stringify(next.attempts.map(a=>[a.id,a.attemptNumber]));
    if(signature!==tabSignature){tabSignature=signature;tabs.replaceChildren();
    next.attempts.forEach((attempt,index)=>{
      const button=node('button',`${attempt.label} · Попытка ${attempt.attemptNumber ?? index+1}`,{type:'button','aria-pressed':'false'});
      button.dataset.id=attempt.id;button.onclick=()=>controller.select(attempt.id);tabs.append(button);
    });
    }
    return controller.update(next.attempts);
  };
  const dispose=()=>{controller.dispose();container.replaceChildren();};
  close.onclick=()=>{dispose();options.onClose?.();};
  update(currentStage);
  return {update,dispose,snapshot:()=>controller.snapshot(),select:controller.select};
}
