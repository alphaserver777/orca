// Immutable plans live in native gate.question; native legacy text stays untouched.
export function planPerson(caller,clientKind,stockPerson,orchestrationCaller) {
  // Orca Web's generic bridge does not advertise person-approvals. Authorize only
  // this narrow operation for an authenticated, non-agent paired workspace client.
  if(caller?.kind==='local-cli'||caller?.kind==='paired-device'&&caller.agent===true||orchestrationCaller)return false;
  return stockPerson||caller?.kind==='paired-device'&&clientKind==='runtime';
}

export function planEnvelope(gate) {
  try {
    const p=JSON.parse(gate.question);
    if(p.kind!=='orca-plan'||p.schema!==1||!Number.isSafeInteger(p.revision)||p.revision<1
      ||typeof p.plan!=='string'||!p.plan.trim()||p.plan.length>100000
      ||!(p.previousGateId===null||typeof p.previousGateId==='string'))return null;
    return {revision:p.revision,previousGateId:p.previousGateId,plan:p.plan};
  } catch {return null;}
}

export function planAnswer(gate) {
  try {
    const a=JSON.parse(gate.resolution);
    return a.kind==='orca-plan-answer'&&a.schema===1&&['accept','return'].includes(a.decision)
      &&a.revision===planEnvelope(gate)?.revision&&typeof a.comment==='string' ? a : null;
  }catch{return null;}
}

export function planHistory(gates,run,task) {
  const entries=gates.filter(g=>g.run_id===run&&g.task_id===task)
    .flatMap(gate=>{const plan=planEnvelope(gate);return plan?[{gate,plan,answer:planAnswer(gate)}]:[];});
  const chain=[];
  for(let revision=1,previous=null;;revision++) {
    const matches=entries.filter(e=>e.plan.revision===revision&&e.plan.previousGateId===(previous?.gate.id??null));
    if(matches.length>1)return {entries,current:null,error:'Несколько редакций с одинаковым номером. Требуется проверка координатора.'};
    if(!matches.length)break;
    const next=matches[0];chain.push(next);previous=next;
  }
  if(chain.length!==entries.length)return {entries,current:null,error:'Нарушена связь редакций плана. Требуется проверка координатора.'};
  return {entries,current:chain.at(-1)??null,error:null};
}

export function decisionRequest(workspace,context,entry,decision,comment) {
  if(entry.gate.run_id!==context.runId || entry.gate.task_id!==context.taskId)
    throw Error('Решение относится к другому поручению.');
  if(!['accept','return'].includes(decision))throw Error('Неверное решение.');
  comment=comment.trim();
  if(comment.length>8000||decision==='return'&&!comment)throw Error('Для возврата напишите комментарий (до 8000 символов).');
  return {workspaceId:workspace.id,instanceId:workspace.instanceId,run:context.runId,task:context.taskId,
    gate:entry.gate.id,revision:entry.plan.revision,decision,comment};
}
