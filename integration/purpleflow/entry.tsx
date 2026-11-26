import React, {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {Timeline} from './Timeline';
import {GateBar} from './GateBar';

// StageDrawer.tsx derivative: same drawer-head/title, revision tabs and drawer-body
// composition. Orca gates replace RunFile attempts; unsupported output views omitted.
export function PlanStageDrawer({entry,entries,pending,drafts,children,selectedGateId,onRevision}:any) {
  const item=entries.find((e:any)=>e.gate.id===(selectedGateId??entry.gate.id))||entry;
  return <div className="details" data-purpleflow="StageDrawer">
    <header className="drawer-head">
      <div className="drawer-title"><strong>Утверждение плана</strong><span>{pending?'Ждёт вашего решения':entry.answer?.decision==='accept'?'План принят':'Ожидается новая редакция'}</span></div>
    </header>
    {entries.length>1&&<nav className="attempts" aria-label="Редакции плана">{entries.map((e:any)=><button key={e.gate.id} aria-label={'Редакция '+e.plan.revision} aria-pressed={item===e} onClick={()=>onRevision(e.gate.id)}>{e.plan.revision}</button>)}</nav>}
    <div className="drawer-body"><article className="doc"><header className="doc-head"><h3>Редакция {item.plan.revision}</h3><span>{item.answer?.decision==='return'?'Возвращена':item.answer?.decision==='accept'?'Принята':item.gate.status==='pending'?'На согласовании':'Заменена'}</span></header><pre className="tl-plan-text">{item.plan.plan}</pre>{item.answer?.comment&&<p>Комментарий: {item.answer.comment}</p>}{item.gate.id!==entry.gate.id&&drafts?.[item.gate.id]&&drafts[item.gate.id]!==item.answer?.comment&&<p>Черновик комментария (не отправлен): {drafts[item.gate.id]}</p>}</article></div>
    {item.gate.id===entry.gate.id&&children}
  </div>;
}

export function mountPurpleflowTimeline(container:any,model:any,rows:any,onSelect:any,selected:any=null) {
  const root=createRoot(container);
  const draw=(model:any,rows:any,onSelect:any,nextSelected:any=selected)=>{
    selected=nextSelected;
    const run={model,rows,status:rows.some((r:any)=>r.attempts.some((a:any)=>a.running))?'waiting':'stopped',next:rows.find((r:any)=>r.attempts.some((a:any)=>a.running))?.id};
    root.render(<Timeline run={run} current={model.currentStage??run.next} selected={selected} compact={selected!==null} onSelect={onSelect}/>);
  };
  draw(model,rows,onSelect);
  const stop:any=()=>root.unmount();stop.update=draw;return stop;
}

function PlanDecision({value,initialComment,onDraft,onAnswer,notice,drafts,initialSelectedGateId,onRevision}:any) {
  const [comment,setComment]=useState(initialComment),[busy,setBusy]=useState<string|null>(null),[error,setError]=useState<string|null>(null),[draftError,setDraftError]=useState('');
  const [selectedGateId,setSelectedGateId]=useState(initialSelectedGateId);
  const entry=value.current,pending=entry.gate.status==='pending';
  async function answer(decision:string) {
    if(busy)return;
    setBusy(decision==='accept'?'approve':'reject');setError(null);
    try{await onAnswer(decision,comment);}catch(e:any){setError(e.message);}finally{setBusy(null);}
  }
  return <PlanStageDrawer key={entry.gate.id} entry={entry} entries={value.entries} pending={pending} drafts={drafts} selectedGateId={selectedGateId} onRevision={(id:string)=>{setSelectedGateId(id);onRevision(id);}}>
    {pending&&<GateBar gate="gate1" comment={comment} setComment={s=>{setComment(s);setDraftError(onDraft(s)===false?'Не удалось сохранить черновик комментария.':'');}} lineCount={0} busy={busy} error={error}
      diffShown={true} onApprove={()=>answer('accept')} onReject={()=>answer('return')} onCancel={()=>{}} onOpenAccept={()=>{}}/>}
    {!pending&&<p role="status">{entry.answer?.decision==='accept'?'План принят':'План возвращён. Ожидается новая редакция.'}</p>}
    {(notice||draftError)&&<p className="tl-note" role="status">{draftError||notice}</p>}
  </PlanStageDrawer>;
}
export function mountPurpleflowDecision(container:any,props:any) {
  const root=createRoot(container);root.render(<PlanDecision key={props.value.current.gate.id} {...props}/>);
  return {update:(next:any)=>root.render(<PlanDecision key={next.value.current.gate.id} {...next}/>),dispose:()=>root.unmount()};
}
