import {purpleflowModeButtons} from './purpleflow-modes.mjs';
import {modes} from './routes.mjs';
import {draftKey,newDraft,resolvedRoute,openDraftStore,prepareHandoff} from './draft.mjs';
import {launchTask,recoverTask} from './start.mjs';
import {completionRecovery} from './completion.mjs';
import {mountCreateMenu} from './create-menu.mjs';

const composerCSS=`
.oc-entry{flex-shrink:0;padding:3px 8px;border:1px solid var(--border);border-radius:5px;font:inherit;font-size:12px;white-space:nowrap;color:var(--foreground);background:var(--background)}
.oc-dialog{position:fixed;inset:0;margin:auto;width:min(1080px,calc(100vw - 32px));max-height:calc(100dvh - 32px);padding:0;border:1px solid var(--border);border-radius:10px;background:var(--background);color:var(--foreground);font-family:var(--app-font-family,inherit);box-shadow:0 20px 80px #0006}
.oc-dialog::backdrop{background:#0007}.oc-dialog *{box-sizing:border-box}.oc-dialog header,.oc-dialog footer{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:18px 24px;border-bottom:1px solid var(--border)}
.oc-dialog h1{font-size:23px;font-weight:550;margin:0}.oc-dialog h2{font-size:14px;font-weight:600;margin:0 0 18px}.oc-dialog p{margin:5px 0;line-height:1.5}.oc-muted,.oc-dialog small{color:var(--muted-foreground);font-size:12px}
.oc-grid{display:grid;grid-template-columns:minmax(0,1fr) 300px;max-height:calc(100dvh - 220px);overflow:auto}.oc-fields{padding:22px 24px;min-width:0}.oc-preview{border-left:1px solid var(--border);padding:22px 24px;background:var(--sidebar-background,var(--background))}
.oc-dialog label{display:block;margin:0 0 16px;font-size:12px}.oc-dialog input:not([type=checkbox]),.oc-dialog textarea,.oc-dialog select{display:block;width:100%;margin-top:6px;border:1px solid var(--border);border-radius:5px;padding:9px 10px;background:var(--background);color:var(--foreground);font:inherit;font-size:13px}.oc-dialog textarea{resize:vertical;min-height:140px;line-height:1.6}.oc-dialog textarea.oc-context{min-height:75px}
.oc-dialog button{cursor:pointer;font:inherit;font-size:12px}.oc-dialog button:disabled{opacity:.5;cursor:default}.oc-dialog :focus-visible{outline:2px solid var(--ring,var(--foreground));outline-offset:2px}
.oc-modes{display:flex;gap:6px;flex-wrap:wrap;margin:10px 0}.oc-mode{padding:6px 9px;border:1px solid transparent;border-radius:6px;background:transparent;color:var(--muted-foreground)}.oc-mode[aria-pressed=true]{color:var(--foreground);background:var(--muted);border-color:var(--border)}
.oc-materials{border:1px dashed var(--border);border-radius:6px;padding:14px;margin-top:14px}.oc-files{list-style:none;padding:0;margin:8px 0}.oc-files li{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:4px 0;font-size:12px;overflow-wrap:anywhere}.oc-files button,.oc-link{color:var(--muted-foreground);background:transparent;border:0;text-decoration:underline}.oc-link{margin-right:12px;margin-bottom:6px}
.oc-dialog ol{padding:0;list-style:none;margin:0}.oc-step{position:relative;padding:0 0 20px 27px;border-left:1px solid var(--border);margin-left:8px;font-size:13px}.oc-step:last-child{border-left:0;padding-bottom:0}.oc-step:before{content:attr(data-number);position:absolute;left:-10px;top:0;display:grid;place-items:center;border-radius:50%;width:20px;height:20px;font-size:10px;background:var(--muted);color:var(--muted-foreground)}.oc-step[data-decision=true]:before{content:'Ⅱ';color:var(--foreground);font-weight:700}.oc-step small{display:block;margin-top:4px;line-height:1.5}
.oc-dialog footer{border-bottom:0;border-top:1px solid var(--border);align-items:center}.oc-primary{flex-shrink:0;padding:9px 15px;border:0;border-radius:6px;background:var(--primary);color:var(--primary-foreground)}.oc-close{padding:4px 8px;border:0;background:transparent;color:var(--muted-foreground)}.oc-status{font-size:12px;max-width:620px}.oc-status[role=alert]{color:var(--destructive,#db6464)}.oc-check{display:flex!important;align-items:center;gap:8px;margin-top:20px!important}.oc-coordinator{display:grid;grid-template-columns:1fr 1fr;gap:12px}
@media(max-width:760px){.oc-grid{grid-template-columns:1fr;max-height:calc(100dvh - 200px)}.oc-preview{border-left:0;border-top:1px solid var(--border)}.oc-dialog header,.oc-dialog footer{padding:14px 16px}.oc-fields,.oc-preview{padding:16px}.oc-dialog footer{align-items:stretch;flex-direction:column}.oc-coordinator{grid-template-columns:1fr}.oc-dialog h1{font-size:20px}}
`;

function element(tag,attrs={},...children) {
  const node=document.createElement(tag);
  for (const [key,value] of Object.entries(attrs)) {
    if(key.startsWith('on'))node.addEventListener(key.slice(2).toLowerCase(),value);
    else if(value!==undefined)node.setAttribute(key,String(value));
  }
  for(const child of children.flat())node.append(child instanceof Node?child:document.createTextNode(String(child)));
  return node;
}

export function mountComposer(adapter) {
  const store=openDraftStore();
  const style=element('style',{},composerCSS);document.head.append(style);
  const entries=new Map();let dialog=null,opening=false,disposeForm=()=>{};
  const disposeMenu=mountCreateMenu(adapter,(source,workspace)=>open(source,workspace));
  async function open(source,selectedWorkspace) {
    if(dialog||opening)return;opening=true;
    const returnFocus=document.activeElement;
    let workspaces=adapter.workspaces(),workspace=selectedWorkspace||adapter.activeWorkspace()||workspaces[0];
    const sourceWorkspace=source==='chat'?workspace:null;
    if(!workspace){opening=false;adapter.openWorkspace();return;}
    let draft,key,loading=false,busy=false,pending=Promise.resolve(),generation=0,error='',storageError=false,unsubscribe=()=>{};
    const box=element('dialog',{class:'oc-dialog',role:'dialog','data-state':'open','data-workspace-board-preserve-open':'','aria-labelledby':'oc-title'});dialog=box;
    let navigationStarted=false;
    const operationScope=()=>dialog===box&&!loading&&draft?.transport?{
      key:JSON.stringify([key,generation,draft.id,draft.transport.envelope.sessionId,draft.transport.envelope.clientOperationId]),
      sessionId:draft.transport.envelope.sessionId,
    }:null;
    const completions=completionRecovery({current:operationScope,isBusy:()=>busy,run:()=>recover()});
    disposeForm=()=>{++generation;unsubscribe();completions.dispose();};
    const message=element('p',{class:'oc-status','aria-live':'polite'});
    const announce=(text,isError=false)=>{message.textContent=text;message.setAttribute('role',isError?'alert':'status');};
    const persist=()=>{
      const value=structuredClone(draft),target=key;
      pending=pending.catch(()=>{}).then(()=>store(target,value));
      pending.then(()=>{storageError=false;},()=>{storageError=true;error='Не удалось сохранить черновик. Не закрывайте форму; повторите сохранение.';announce(error,true);});
      return pending;
    };
    const close=async()=>{
      if(busy)return false;
      busy=true;if(draft)render();
      try{await pending;}catch{busy=false;if(draft)render();announce(error,true);return false;}
      if(storageError){busy=false;announce(error,true);return false;}
      disposeForm();box.close();box.remove();dialog=null;returnFocus?.isConnected&&returnFocus.focus();
      return true;
    };
    box.addEventListener('cancel',event=>{event.preventDefault();close();});
    box.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close();}});
    const title=element('input',{maxlength:160,'aria-label':'Название задачи'});
    const description=element('textarea',{'aria-label':'Что сделать',placeholder:'Опишите результат и критерии готовности',maxlength:60000});
    const context=element('textarea',{class:'oc-context','aria-label':'Контекст обсуждения',placeholder:'Уточнения, ссылки и важные договорённости',maxlength:60000});
    const project=element('select',{'aria-label':'Проект'}),place=element('select',{'aria-label':'Рабочее пространство координатора'}),chat=element('select',{'aria-label':'Чат координатора'});
    const modesBox=element('div',{class:'oc-modes','aria-label':'Режим работы'}),reason=element('p',{class:'oc-muted'}),preview=element('ol',{'aria-label':'Этапы задачи'}),files=element('ul',{class:'oc-files'}),ownerNote=element('p',{class:'oc-muted'});
    const visual=element('input',{type:'checkbox'}),chooser=element('input',{type:'file',multiple:'','aria-label':'Добавить файлы'});
    const launch=element('button',{class:'oc-primary',type:'button',disabled:''},'Запустить');
    const check=element('button',{class:'oc-link',type:'button',onClick:()=>recover()},'Проверить запуск');
    const newRequest=element('button',{class:'oc-link',type:'button',onClick:async()=>{
      if(busy)return;draft={...draft,id:crypto.randomUUID(),status:'draft'};delete draft.envelope;delete draft.transport;delete draft.result;error='';await persist();render();
    }},'Изменить как новую задачу');
    const change=(field,value)=>{if(!draft||loading||draft.transport)return;draft[field]=value;error='';persist();renderRoute();};
    title.addEventListener('input',()=>change('title',title.value));description.addEventListener('input',()=>change('description',description.value));context.addEventListener('input',()=>change('context',context.value));visual.addEventListener('change',()=>change('visual',visual.checked));
    const modeButtons=purpleflowModeButtons(element,modesBox,[{id:'auto',title:'Авто'},...Object.entries(modes).map(([id,value])=>({id,title:value.title}))],mode=>change('mode',mode));
    function renderRoute(){
      const route=resolvedRoute(draft);reason.textContent=`${modes[route.mode].title}. ${route.reason}`;
      ownerNote.textContent=(route.steps.includes('approval')?'Согласование до реализации и приёмка требуют вашего решения. ':'Приёмка требует вашего решения. ')+'До двух раундов исправлений и повторной проверки; затем решение владельца.';
      modeButtons.forEach(button=>button.setAttribute('aria-pressed',button.dataset.mode===draft.mode));
      preview.replaceChildren(...route.details.map((step,index)=>element('li',{class:'oc-step','data-stage':step.id,'data-conditional':Boolean(step.conditional),'data-number':index+1,'data-decision':['approval','acceptance'].includes(step.id)},step.title,element('small',{},step.detail))));
      launch.textContent=draft.status==='launched'?'Открыть таймлайн':draft.transport?'Повторить отправку':'Запустить';
      launch.disabled=busy||!draft.description.trim()||!chat.value;
    }
    function render(){
      title.value=draft.title;description.value=draft.description;context.value=draft.context;visual.checked=draft.visual;
      const locked=busy||loading||Boolean(draft.transport);
      for(const input of [title,description,context,visual,chooser,project,place,chat,...modeButtons])input.disabled=locked;
      newRequest.hidden=draft.status!=='launched';check.hidden=!draft.transport||draft.status==='launched';check.disabled=busy;
      files.replaceChildren(...draft.files.map(file=>element('li',{},`${file.name} · ${Math.ceil(file.size/1024)} КБ`,element('button',{type:'button',disabled:locked?'':undefined,'aria-label':`Удалить ${file.name}`,onClick:()=>{draft.files=draft.files.filter(f=>f.id!==file.id);persist();render();}},'Удалить'))));
      renderRoute();
      announce(draft.status==='launched'?`Созданы ${draft.result.runId} / ${draft.result.taskId}. Выполнение маршрута пока не подтверждено.`:draft.transport?'Поручение отправлено или ожидает подтверждения. Повтор использует тот же запрос.':'Черновик сохраняется в этом браузере. «Запустить» отправит только постановку этой формы.');
    }
    function chats(){
      chat.replaceChildren(element('option',{value:''},'Выберите чат координатора'),...adapter.chats(workspace).map(tab=>element('option',{value:tab.entityId},`${tab.title||tab.agentSessionAgent} (${tab.entityId.slice(0,8)})`)));
      // Selection is deliberate. Opening from a chat may select only that exact native chat.
      const current=source==='chat'?adapter.activeChat(workspace):null;
      if(draft.transport)chat.value=draft.transport.envelope.sessionId;
      else if(current)chat.value=current.entityId;
    }
    async function load(){
      const turn=++generation;loading=true;unsubscribe();
      for(const input of [title,description,context,visual,chooser,project,place,chat,...modeButtons,launch])input.disabled=true;
      const targetKey=draftKey(location.origin,workspace);const saved=await store(targetKey);if(turn!==generation)return;
      key=targetKey;
      draft=saved||newDraft();
      if(!saved&&source==='chat'&&workspace.id===sourceWorkspace.id&&workspace.instanceId===sourceWorkspace.instanceId){
        draft.context=window.getSelection()?.toString()||'';
        draft.source={kind:'chat',workspaceId:workspace.id,instanceId:workspace.instanceId,sessionId:adapter.activeChat(workspace)?.entityId||null};
      }
      loading=false;chats();render();await persist();
      if(turn!==generation||dialog!==box)return;
      unsubscribe=adapter.subscribe(workspace,event=>{if(event.type==='completion')completions.notify(event.completion.sessionId);});
      if(draft.transport)await recover();
    }
    function places(){
      const options=workspaces.filter(w=>`${w.runtimeOwnerEnvironmentId||'local'}/${w.repoId}`===project.value);
      if(!options.some(w=>w.id===workspace.id&&w.instanceId===workspace.instanceId))workspace=options[0];
      place.replaceChildren(...options.map(w=>element('option',{value:w.id},w.displayName||w.name||w.path)));
      place.value=workspace.id;
    }
    const projects=new Map(workspaces.map(w=>[`${w.runtimeOwnerEnvironmentId||'local'}/${w.repoId}`,w]));
    project.append(...[...projects].map(([id,w])=>element('option',{value:id},adapter.projectName(w))));
    project.value=`${workspace.runtimeOwnerEnvironmentId||'local'}/${workspace.repoId}`;places();
    project.addEventListener('change',async()=>{await pending.catch(()=>{});places();await load();});
    place.addEventListener('change',async()=>{await pending.catch(()=>{});workspace=workspaces.find(w=>w.id===place.value&&`${w.runtimeOwnerEnvironmentId||'local'}/${w.repoId}`===project.value);await load();});
    chat.addEventListener('change',renderRoute);
    async function addFiles(list){
      if(busy||draft.transport)return;
      busy=true;render();
      try{
        const batch=[...list];if(draft.files.length+batch.length>12||draft.files.reduce((n,f)=>n+f.size,0)+batch.reduce((n,f)=>n+f.size,0)>12*1024*1024)throw Error('До 12 файлов общим размером 12 МБ.');
        // Read every file before changing the draft; an oversized batch stays intact for correction.
        const added=[];
        for(const file of batch){if(file.size>5*1024*1024)throw Error('Один файл должен быть не больше 5 МБ.');const data=new Uint8Array(await file.arrayBuffer());let binary='';for(let offset=0;offset<data.length;offset+=16384)binary+=String.fromCharCode(...data.subarray(offset,offset+16384));added.push({id:crypto.randomUUID(),name:file.name,type:file.type,size:file.size,base64:btoa(binary)});}
        draft.files.push(...added);await persist();render();
      }catch(e){error=e.message;}finally{busy=false;chooser.value='';render();if(error)announce(error,true);}
    }
    chooser.addEventListener('change',()=>addFiles(chooser.files));
    box.addEventListener('dragover',event=>{event.preventDefault();event.stopPropagation();});
    box.addEventListener('drop',event=>{event.preventDefault();event.stopPropagation();addFiles(event.dataTransfer.files);});
    box.addEventListener('paste',event=>{if(event.clipboardData.files.length){event.preventDefault();event.stopPropagation();addFiles(event.clipboardData.files);}});
    async function openResult(scope=operationScope()){
      if(navigationStarted||!scope||operationScope()?.key!==scope.key)return;
      navigationStarted=true;
      try{await adapter.openTimeline(workspace,draft.result);busy=false;await close();}
      catch(e){navigationStarted=false;throw e;}
    }
    async function recover(){
      if(busy||!draft?.transport)return;busy=true;render();
      const scope=operationScope(),recoverDraft=draft,recoverWorkspace=workspace;
      const current=()=>scope&&operationScope()?.key===scope.key;
      try{const result=await recoverTask({draft:recoverDraft,workspace:recoverWorkspace,call:r=>adapter.call(recoverWorkspace,r),save:()=>current()?persist():Promise.resolve()});if(!current())return;if(result){await openResult(scope);return;}error='';}
      catch(e){if(current())error=e.message;}finally{busy=false;if(dialog===box){render();if(error)announce(error,true);void completions.idle();}}
    }
    launch.addEventListener('click',async()=>{
      if(busy)return;
      if(draft.status==='launched'){await recover();return;}
      busy=true;render();const selected=chat.value,selectedWorkspace={...workspace};
      try{
        await pending;const tab=adapter.chats(selectedWorkspace).find(t=>t.entityId===selected);
        if(!tab)throw Error('Выбранный чат закрыт. Откройте его и повторите передачу.');
        if(!navigator.locks)throw Error('Браузер не поддерживает защиту от повторной передачи. Используйте актуальный браузер.');
        await navigator.locks.request(`orca-task-handoff:${key}`,async()=>{
          const latest=await store(key);
          if(latest?.id===draft.id&&latest.transport)draft=latest;
          await launchTask({draft,workspace:selectedWorkspace,sessionId:selected,call:r=>adapter.call(selectedWorkspace,r),save:()=>persist()});
        });
        error='';if(draft.status==='launched')await openResult();
      }catch(e){error=e.message;}finally{busy=false;if(dialog===box){render();if(error)announce(error,true);void completions.idle();}}
    });
    const refresh=element('button',{type:'button',class:'oc-link',onClick:()=>{chats();renderRoute();}},'Обновить список чатов');
    box.append(element('header',{},element('div',{},element('h1',{id:'oc-title'},'Новая задача'),element('p',{class:'oc-muted'},source==='chat'?'Из обсуждения в чате':'Постановка и маршрут работы')),element('button',{class:'oc-close',type:'button','aria-label':'Закрыть форму',onClick:close},'✕')),
      element('div',{class:'oc-grid'},element('div',{class:'oc-fields'},element('div',{class:'oc-coordinator'},element('label',{},'Проект',project),element('label',{},'Пространство координатора',place)),element('label',{},'Чат координатора',chat),refresh,
        element('button',{type:'button',class:'oc-link',onClick:async()=>{if(busy||storageError)return;if(await close())adapter.openChat(workspace);}},'Открыть создание пространства и чата'),
        modesBox,reason,element('label',{},'Название',title),element('label',{},'Что сделать',description),element('label',{},'Контекст обсуждения',context),element('section',{class:'oc-materials'},element('strong',{},'Материалы к задаче'),element('p',{class:'oc-muted'},'Перетащите, вставьте или выберите файлы. До 5 МБ на файл.'),chooser,files)),
        element('aside',{class:'oc-preview'},element('h2',{},'Как пойдёт задача'),preview,element('label',{class:'oc-check'},visual,'Визуальная проверка'),ownerNote,element('p',{class:'oc-muted'},'После подтверждения запуска координатор вернёт Run/Task и переход к таймлайну.'))),
      element('footer',{},element('div',{},message,newRequest,check),launch));
    document.body.append(box);box.showModal();
    try{await load();description.focus();}catch(e){announce(e.message,true);}finally{opening=false;}
  }
  function scan(){
    const toolbar=document.querySelector('.pane-title-bar[data-chromeless][data-active-pane]:not([data-terminal-tab-id]) .pane-title-actions');
    for(const [kind,target,label] of [['chat',toolbar,'Создать задачу из обсуждения']]){
      const old=entries.get(kind);
      if(old?.parentElement===target)continue;old?.remove();entries.delete(kind);
      if(target){const button=element('button',{type:'button',class:'oc-entry','data-oc-entry':kind,onPointerDown:event=>event.stopPropagation(),onClick:event=>{event.preventDefault();event.stopPropagation();open(kind);}},label);target.prepend(button);entries.set(kind,button);}
    }
  }
  let frame=null;
  const observer=new MutationObserver(()=>{if(frame===null)frame=requestAnimationFrame(()=>{frame=null;scan();});});
  observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['data-active-pane']});scan();
  return ()=>{disposeMenu();disposeForm();observer.disconnect();if(frame!==null)cancelAnimationFrame(frame);for(const button of entries.values())button.remove();dialog?.remove();dialog=null;style.remove();};
}
