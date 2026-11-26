// Orca data projection only. No mutations, model calls, invented stage timestamps,
// compressed waits, or execution authority are provided by PurpleFlow components.
import React from 'react';
export const bridge={platform:'linux'};
export const ms=(value:number)=>value<1000?`${Math.floor(value)}\u00a0мс`:value<60000?`${+(value/1000).toFixed(1)}\u00a0с`:value<3600000?`${+(value/60000).toFixed(1)}\u00a0мин`:`${+(value/3600000).toFixed(1)}\u00a0ч`;
export const activeClock=(run:any,now:number)=>({total:Math.max(1000,run.model.end-run.model.start),gaps:[],paused:0});
export const runStages=(run:any)=>run.rows.map((r:any)=>({id:r.id,title:r.label,gate:r.id==='approval'||r.id==='acceptance',hint:'Нет подтверждённых событий'}));
export const nodeState=(run:any,id:string)=>{
  const attempts=run.rows.find((r:any)=>r.id===id)?.attempts||[];
  if(attempts.some((a:any)=>a.running&&a.source==='Gate'))return 'waiting';
  if(attempts.some((a:any)=>a.running))return 'active';
  return attempts.length?'done':'idle';
};
export const plannedRoute=()=>({});
export const stageBars=(run:any,clock:any,id:string)=>{
  const span=Math.max(1000,run.model.end-run.model.start);
  return (run.rows.find((r:any)=>r.id===id)?.attempts||[]).filter((a:any)=>a.start!==null&&a.end!==null).map((a:any,i:number)=>({
    attempt:{attempt:i+1,stage:a.source==='Gate'?'gate1':id},
    kind:a.source==='Gate'?(a.running?'wait-live':'wait'):a.status==='failed'?'fail':a.running?'live':'done',
    left:100*(a.start-run.model.start)/span,width:100*(a.end-a.start)/span,
    took:a.duration,tip:a.source==='Gate'?`Решение по плану · ${a.duration}`:`${a.label} · ${a.duration}`,
  }));
};
export const STAGE_ICON=new Proxy({}, {get:(_,id)=>id==='approval'?'◇':id==='acceptance'?'✓':'·'});
