import {decisionRequest} from './decisions.mjs';
import {selectionKey,readSelection,saveSelection} from './selection.mjs';
import {el,statusText} from './view.mjs';

export function planTransport(api,selector) {
  return selector ? {
    call:request=>api.runtimeEnvironments.call({selector,...request}),
    subscribe:(request,onResponse)=>api.runtimeEnvironments.subscribe({selector,...request},{
      onResponse,onError:error=>onResponse({ok:false,error}),onClose:()=>onResponse({ok:false}),
    }),
  } : {
    call:request=>api.runtime.call(request),
    subscribe:(request,onResponse)=>api.runtime.subscribe(request,onResponse),
  };
}

export function watchPlan(subscribe,identity,context,onValue,onError) {
  let disposed=false,subscription;
  const params={workspaceId:identity.id,instanceId:identity.instanceId,run:context.runId,task:context.taskId};
  subscribe({method:'workflowPlan.subscribe',params},reply=>{
    if(disposed)return;
    if(reply.ok)onValue(reply.result);else onError();
  }).then(value=>{if(disposed)value.unsubscribe();else subscription=value;}).catch(()=>{if(!disposed)onError();});
  return ()=>{disposed=true;subscription?.unsubscribe();};
}

export function openPlan(call,subscribe,container,identity,context,onChange=()=>{}) {
  let disposed=false,mounted=null,last=null;
  const message=el("p","Загрузка решения…",{role:"status"}),body=el("div");
  container.replaceChildren(message,body);
  const storageKey=e=>"orca.plan.comment.v1:"+JSON.stringify([identity,context.runId,context.taskId,e.gate.id,e.plan.revision]);
  const draw=value=>{
    if(disposed)return;
    onChange(value);
    if(!value.current){mounted?.dispose();mounted=null;message.textContent=value.error||"План на согласование пока не передан.";return;}
    message.textContent="";
    const entry=value.current;
    let initialComment="",notice="",drafts={};
    try{for(const item of value.entries)drafts[item.gate.id]=localStorage.getItem(storageKey(item))?.trim()??"";initialComment=localStorage.getItem(storageKey(entry))??"";}catch{notice="Черновик комментария не сохраняется: хранилище недоступно.";}
    const revisionKey=selectionKey(identity,context,'plan-revision');
    const props={value,initialComment,notice,drafts,initialSelectedGateId:readSelection(revisionKey)?.gateId,
      onRevision:gateId=>saveSelection(revisionKey,{gateId}),
      onDraft:comment=>{try{localStorage.setItem(storageKey(entry),comment);return true;}catch{return false;}},
      onAnswer:async(decision,comment)=>{
        const params=decisionRequest(identity,context,entry,decision,comment);
        const reply=await call({method:"workflowPlan.respond",params});
        if(!reply.ok)throw Error(reply.error?.message?.includes("decision_conflict")?"Редакция уже закрыта или заменена. Комментарий сохранён.":"Ответ не подтверждён. Обновите панель перед повтором.");
        const confirmed=await call({method:"workflowPlan.read",params});
        if(confirmed.ok&&!disposed)draw(confirmed.result);
      }};
    if(mounted)mounted.update(props);else mounted=OrcaPurpleflow.mountPurpleflowDecision(body,props);
  };
  const stop=watchPlan(subscribe,identity,context,draw,()=>{if(!disposed)message.textContent="Согласование недоступно. Проверьте подключение и обновите панель.";});
  return ()=>{disposed=true;stop();mounted?.dispose();container.replaceChildren();};
}
