import {t as requireReact} from './react-DvvP-0SR.js';
import {openTimeline} from './view.mjs';
import {planTransport} from './decision-view.mjs';
import {observeWorkspaceTasks} from './overview-client.mjs';

// Native right-sidebar content; no second pane and no chat fallback.
export function TimelineLaunch({workspace,onClose}) {
  const React=requireReact(),panel=React.useRef(null);
  const {id,instanceId,hostId,runtimeOwnerEnvironmentId}=workspace??{};
  React.useEffect(()=>{
    if(!panel.current||!id||!instanceId)return;
    const {call,subscribe}=planTransport(window.api,runtimeOwnerEnvironmentId);
    return openTimeline(call,panel.current,{id,instanceId,hostId,environmentId:runtimeOwnerEnvironmentId??'local'},onClose,subscribe);
  },[id,instanceId,hostId,runtimeOwnerEnvironmentId]);
  return React.createElement('aside',{ref:panel,id:'orca-timeline-panel',className:'orca-timeline',
    'aria-label':'Таймлайн задачи',tabIndex:-1});
}
export function TimelineIcon(props) {
  const React=requireReact(),{workspace,...iconProps}=props,[pending,setPending]=React.useState(false);
  const {id,instanceId,hostId,runtimeOwnerEnvironmentId}=workspace??{};
  React.useEffect(()=>{
    setPending(false);if(!id||!instanceId)return;
    const identity={id,instanceId,hostId,environmentId:runtimeOwnerEnvironmentId??'local'};
    const {call,subscribe}=planTransport(window.api,runtimeOwnerEnvironmentId);
    return observeWorkspaceTasks(call,subscribe,identity,value=>setPending(value.contexts.some(c=>c.waiting)),()=>setPending(false));
  },[id,instanceId,hostId,runtimeOwnerEnvironmentId]);
  return React.createElement('svg',{...iconProps,width:props.size??16,height:props.size??16,'data-orca-timeline-icon':true,viewBox:'0 0 16 16',fill:'none',stroke:'currentColor',strokeWidth:1.55,strokeLinecap:'round','aria-hidden':true},
    React.createElement('path',{d:'M2.5 2.5v11h11 M5.5 4h3 M7 11h4'}),
    React.createElement('path',{d:'M8 7.5h5.5',stroke:'var(--orca-timeline-accent,#3fa973)'}),
    pending&&React.createElement('circle',{'data-pending-decision':true,cx:13,cy:2.5,r:2.5,fill:'var(--foreground)',stroke:'var(--background)',strokeWidth:1}));
}
