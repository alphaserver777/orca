// Orca data projection only. No mutations, model calls, invented stage timestamps,
// compressed waits, or execution authority are provided by PurpleFlow components.
import React from 'react';
import {MessageCircleQuestion,Map as MapIcon,UserRoundCheck,Hammer,FlaskConical,ScanEye,ClipboardCheck,Archive,Globe} from './stage-icons';
export const bridge={platform:'linux'};
export const ms=(value:number)=>value<1000?`${Math.floor(value)}\u00a0мс`:value<60000?`${+(value/1000).toFixed(1)}\u00a0с`:value<3600000?`${+(value/60000).toFixed(1)}\u00a0мин`:`${+(value/3600000).toFixed(1)}\u00a0ч`;
export const activeClock=(run:any,now:number)=>({total:Math.max(1000,run.model.end-run.model.start),gaps:[],paused:0});
export const runStages=(run:any)=>run.rows.map((r:any)=>({id:r.id,title:r.label,gate:r.id==='approval'||r.id==='acceptance',hint:'Нет подтверждённых событий'}));
export const nodeState=(run:any,id:string)=>{
  const attempts=run.rows.find((r:any)=>r.id===id)?.attempts||[];
  if(attempts.some((a:any)=>a.running&&a.source==='Gate'))return 'waiting';
  if(attempts.some((a:any)=>a.running))return 'active';
  const latest=attempts.at(-1);
  if(['failed','circuit_broken'].includes(latest?.status))return 'failed';
  if(['stopped','abandoned','timeout'].includes(latest?.status))return 'stopped';
  return latest&&['completed','resolved','accepted'].includes(latest.status)?'done':attempts.length?'unknown':'idle';
};
export const plannedRoute=()=>({});
export const stageBars=(run:any,clock:any,id:string)=>{
  const span=Math.max(1000,run.model.end-run.model.start);
  return (run.rows.find((r:any)=>r.id===id)?.attempts||[]).filter((a:any)=>a.start!==null&&a.end!==null).map((a:any,i:number)=>({
    attempt:{attempt:i+1,stage:a.source==='Gate'?'gate1':id},
    kind:a.source==='Gate'?(a.running?'wait-live':'wait'):a.status==='failed'?'fail':a.running?'live':'done',
    left:100*(a.start-run.model.start)/span,width:100*(a.end-a.start)/span,
    took:a.duration,tip:a.source==='Gate'?`${id==='approval'?'Утверждение плана':id==='acceptance'?'Приёмка':'Решение человека'} · ${a.duration}`:`${a.label} · ${a.duration}`,
  }));
};
// Same stage/icon mapping as PurpleFlow 0.10.0 StageRail (MIT).
export const STAGE_ICON={clarify:<MessageCircleQuestion size={16}/>,plan:<MapIcon size={16}/>,approval:<UserRoundCheck size={16}/>,implementation:<Hammer size={16}/>,checks:<FlaskConical size={16}/>,review:<ScanEye size={16}/>,acceptance:<ClipboardCheck size={16}/>,commit:<Archive size={16}/>,other:<Globe size={16}/>};
