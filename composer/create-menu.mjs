// Compact PurpleFlow 0.10.0 Sidebar.tsx:133–168 create menu, adapted to Orca.
// MIT, Copyright (c) 2026 PurpleSchool; see integration/purpleflow/LICENSE.
const createMenuCSS=`
.oc-create-menu{position:fixed;inset:auto;margin:0;padding:5px;width:320px;max-width:calc(100vw - 16px);max-height:calc(100dvh - 16px);overflow:auto;border:1px solid var(--border);border-radius:8px;background:var(--popover,var(--background));color:var(--popover-foreground,var(--foreground));box-shadow:0 8px 24px #0003;font:inherit;z-index:100}
.oc-create-menu button{display:flex;align-items:center;gap:10px;width:100%;padding:9px 8px;border:0;border-radius:4px;background:transparent;color:inherit;text-align:left;cursor:pointer;font:inherit}
.oc-create-menu button:hover,.oc-create-menu button:focus{outline:none;background:var(--accent,var(--muted))}.oc-create-menu button:focus-visible{outline:2px solid var(--ring);outline-offset:-2px}
.oc-create-menu strong{display:block;font-size:13px;font-weight:550;line-height:1.5}.oc-create-menu small{display:block;color:var(--muted-foreground);font-size:11px;line-height:1.5}.oc-create-icon{display:grid;place-items:center;width:28px;height:28px;flex-shrink:0;border:1px solid var(--border);border-radius:6px;background:var(--muted)}.oc-create-icon svg{width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}
.oc-context{width:min(480px,calc(100vw - 32px))}.oc-context section{padding:20px 24px}.oc-context header{padding:16px 24px}.oc-context h1{font-size:17px}.oc-context footer{justify-content:flex-end}
`;

function createIcon(kind){
  const span=element('span',{class:'oc-create-icon','aria-hidden':'true'});
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 24 24');
  const paths={task:['M8 6h8M8 18h8M6 8v8m12-8v8','M4 3h4v5H4zM16 3h4v5h-4zM4 16h4v5H4zM16 16h4v5h-4z'],chat:['M21 11.5a8.5 8.5 0 0 1-8.5 8.5H3l2-4a8.5 8.5 0 1 1 16-4.5Z'],tree:['M6 3v12a4 4 0 0 0 4 4h8M6 9h8a4 4 0 0 0 4-4V3','M3 3h6M15 3h6M15 19h6']};
  for(const d of paths[kind]){const path=document.createElementNS(svg.namespaceURI,'path');path.setAttribute('d',d);svg.append(path);}span.append(svg);return span;
}

export function mountCreateMenu(adapter,onTask){
  const style=element('style',{},createMenuCSS);document.head.append(style);
  let menu=null,trigger=null,picker=null,original=null;
  const valid=w=>adapter.workspaces().some(current=>current.id===w.id&&current.instanceId===w.instanceId&&current.hostId===w.hostId);
  function close(restore=true){
    if(!menu)return;menu.remove();menu=null;trigger?.setAttribute('aria-expanded','false');
    if(restore&&trigger?.isConnected)trigger.focus();
  }
  function position(){
    if(!menu)return;if(!trigger?.isConnected){close(false);return;}
    const r=trigger.getBoundingClientRect(),m=menu.getBoundingClientRect();
    menu.style.left=`${Math.max(8,Math.min(r.right-m.width,innerWidth-m.width-8))}px`;
    menu.style.top=`${r.bottom+6+m.height<=innerHeight-8?r.bottom+6:Math.max(8,r.top-m.height-6)}px`;
  }
  async function route(kind){
    close();
    if(kind==='tree'){original();return;}
    const active=adapter.activeWorkspace();
    if(active&&valid(active)){
      if(kind==='task'){onTask('board',active);return;}
      if(adapter.chatAgent(active)){adapter.newNativeChat(active);return;}
    }
    // No implicit "first workspace": a dashboard or ambiguous context needs a choice.
    choose(kind,active&&valid(active)?active:null);
  }
  function choose(kind,active){
    if(picker)return;
    const returnFocus=trigger,workspaces=adapter.workspaces();
    const box=element('dialog',{class:'oc-dialog oc-context',role:'dialog','data-state':'open','data-workspace-board-preserve-open':'','aria-labelledby':'oc-context-title'});picker=box;
    const dispose=()=>{box.close();box.remove();picker=null;returnFocus?.isConnected&&returnFocus.focus();};
    const select=element('select',{'aria-label':'Рабочее пространство'});
    const key=w=>JSON.stringify([w.id,w.instanceId,w.hostId]);
    select.append(element('option',{value:''},'Выберите рабочее пространство'),...workspaces.map(w=>element('option',{value:key(w)},`${adapter.projectName(w)} / ${w.displayName||w.name||w.path}${w.hostId?' · '+w.hostId:''}`)));
    if(active)select.value=key(active);
    const agents=element('select',{'aria-label':'Агент чата'});agents.append(element('option',{value:''},'Выберите агента'),...adapter.chatAgents().map(agent=>element('option',{value:agent},agent)));
    const message=element('p',{class:'oc-muted','aria-live':'polite'},workspaces.length?'Выберите контекст для продолжения.':'Нет доступных рабочих пространств. Создайте рабочее дерево штатным способом.');
    const next=element('button',{class:'oc-primary',type:'button',onClick:()=>{
      const w=workspaces.find(w=>key(w)===select.value);if(!w||!valid(w)){message.textContent='Пространство недоступно. Закройте окно и выберите снова.';return;}
      const agent=adapter.chatAgent(w)||agents.value;if(kind==='chat'&&!agent)return;
      dispose();if(kind==='task')onTask('board',w);else adapter.newNativeChat(w,agent);
    }},kind==='task'?'Открыть форму задачи':'Открыть чат');
    const update=()=>{const w=workspaces.find(w=>key(w)===select.value);agents.hidden=kind!=='chat'||Boolean(w&&adapter.chatAgent(w));next.disabled=!w||(kind==='chat'&&!adapter.chatAgent(w)&&!agents.value);};
    select.addEventListener('change',update);agents.addEventListener('change',update);update();
    box.addEventListener('cancel',event=>{event.preventDefault();dispose();});
    box.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();dispose();}});
    box.append(element('header',{},element('h1',{id:'oc-context-title'},'Выбор рабочего пространства'),element('button',{class:'oc-close',type:'button','aria-label':'Закрыть выбор пространства',onClick:dispose},'Закрыть')),
      element('section',{},message,element('label',{},'Рабочее пространство',select),agents),element('footer',{},element('button',{class:'oc-link',type:'button',onClick:()=>{dispose();original();}},'Рабочее дерево…'),next));
    document.body.append(box);box.showModal();select.focus();
  }
  function show(event){
    if(picker)return;
    if(menu){close();return;}
    trigger=event.detail.trigger;original=event.detail.original;
    menu=element('div',{id:'orca-sidebar-create-menu',class:'oc-create-menu',role:'menu','data-state':'open','data-workspace-board-preserve-open':'','aria-label':'Создать',popover:'manual'});
    for(const [kind,title,description] of [['task','Задача','План, реализация, тесты, ревью и приёмка'],['chat','Чат','Вопросы и небольшие правки без конвейера'],['tree','Рабочее дерево…','Проект, сервер, ветка и параметры пространства']]){
      menu.append(element('button',{type:'button',role:'menuitem',tabindex:'-1',onClick:()=>route(kind)},createIcon(kind),element('span',{},element('strong',{},title),element('small',{},description))));
    }
    menu.addEventListener('keydown',event=>{
      const items=[...menu.querySelectorAll('button')],index=items.indexOf(document.activeElement);
      if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){event.preventDefault();event.stopPropagation();items[event.key==='Home'?0:event.key==='End'?items.length-1:(index+(event.key==='ArrowUp'?-1:1)+items.length)%items.length].focus();}
      if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close();}
      if(event.key==='Tab')close();
    });
    document.body.append(menu);menu.showPopover();trigger.setAttribute('aria-expanded','true');position();
    menu.querySelector(event.detail.last?'button:last-child':'button').focus();
  }
  const outside=event=>{if(menu&&!menu.contains(event.target)&&!trigger?.contains(event.target))close(false);};
  const focusOutside=event=>{if(menu&&!menu.contains(event.target)&&!trigger?.contains(event.target))close(false);};
  const key=event=>{
    const button=event.target.closest?.('button[data-oc-create-trigger]');if(!button)return;
    if(['ArrowDown','ArrowUp'].includes(event.key)){event.preventDefault();event.stopPropagation();if(!menu){button.click();if(event.key==='ArrowUp')menu?.querySelector('button:last-child').focus();}}
  };
  window.addEventListener('orca-sidebar-create',show);document.addEventListener('pointerdown',outside,true);document.addEventListener('focusin',focusOutside,true);document.addEventListener('keydown',key,true);window.addEventListener('resize',position);document.addEventListener('scroll',position,true);
  return ()=>{close(false);picker?.remove();style.remove();window.removeEventListener('orca-sidebar-create',show);document.removeEventListener('pointerdown',outside,true);document.removeEventListener('focusin',focusOutside,true);document.removeEventListener('keydown',key,true);window.removeEventListener('resize',position);document.removeEventListener('scroll',position,true);};
}
