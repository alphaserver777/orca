"""Compose the form and timeline renderer adapters for pinned Orca WEB 1.4.274.

Writes only a new overlay directory. No upstream bundles are stored in Git.
The native orchestration authorization boundary is unchanged.
"""
import argparse
import json
from pathlib import Path
import sys

sys.path.insert(0,str(Path(__file__).resolve().parent.parent/'timeline'))
from prepare import prepare as prepare_timeline, TASK, sha, cache_index

ADAPTER=r'''
function OrcaComposerAdapter(){
  return {
    workspaces:()=>Object.values(fp(X.getState())).flat().filter(w=>w.id&&w.instanceId&&w.repoId&&!w.isArchived),
    activeWorkspace:()=>document.querySelector('[data-workspace-board-sheet][data-state="open"]')?null:OrcaTimelineWorkspaceSelector(X.getState()),
    chatAgent:w=>{const state=X.getState(),tab=OrcaComposerAdapter().activeChat(w),agent=tab?.agentSessionAgent||state.settings?.defaultTuiAgent;return agent&&agent!=='blank'?agent:null;},
    chatAgents:()=>[...new Set(['claude','codex',...Object.keys(X.getState().settings?.nativeChatProviders||{})])],
    newNativeChat:async(w,agent)=>{
      const {S:launch}=await import('./worktree-activation-BqzX6JkP.js');
      const current=OrcaComposerAdapter().workspaces().find(value=>value.id===w.id&&value.instanceId===w.instanceId&&value.hostId===w.hostId);
      if(!current)return;
      const state=X.getState();state.setActiveWorktree(w.id,w.hostId);state.setActiveView('terminal');
      if(document.querySelector('[data-workspace-board-sheet][data-state="open"]'))window.dispatchEvent(new Event('orca:toggle-workspace-board'));
      return launch.launchAgentInNewTabWithOutcome({agent:agent||OrcaComposerAdapter().chatAgent(w),worktreeId:w.id,workspaceExecutionHostId:w.hostId,selectedExecutionHostId:w.hostId,requestedSurface:'chat',requestId:crypto.randomUUID(),launchSource:'sidebar-create-menu'});
    },
    projectName:w=>{const repo=Hu(X.getState().repos).get(w.repoId);return repo?.displayName||repo?.name||repo?.path?.split(/[\\/]/).filter(Boolean).at(-1)||w.repoId;},
    chats:w=>(X.getState().unifiedTabsByWorktree[w.id]||[]).filter(t=>t.contentType==='agent-session'),
    activeChat:w=>{const state=X.getState(),group=(state.groupsByWorktree[w.id]||[]).find(g=>g.id===state.activeGroupIdByWorktree[w.id]);return (state.unifiedTabsByWorktree[w.id]||[]).find(t=>t.contentType==='agent-session'&&t.id===group?.activeTabId);},
    sourceDraft:w=>{const tab=OrcaComposerAdapter().activeChat(w);return tab?OrcaComposerRead(OrcaComposerScope(tab.entityId)):null;},
    readNative:tab=>OrcaComposerRead(OrcaComposerScope(tab.entityId)),
    appendNative:(w,tab,prompt)=>{
      if(!OrcaComposerAdapter().chats(w).some(t=>t.entityId===tab.entityId))throw Error('Чат координатора закрыт.');
      OrcaComposerAppend(OrcaComposerScope(tab.entityId),prompt);
    },
    call:(w,request)=>w.runtimeOwnerEnvironmentId?window.api.runtimeEnvironments.call({selector:w.runtimeOwnerEnvironmentId,...request}):window.api.runtime.call(request),
    subscribe:(w,callback)=>{
      let closed=false,subscription;
      OrcaComposerCompletions(w.runtimeOwnerEnvironmentId?{kind:'environment',environmentId:w.runtimeOwnerEnvironmentId}:{kind:'local'},event=>{if(!closed)callback(event);},()=>{},()=>{})
        .then(handle=>{if(closed)handle.unsubscribe();else subscription=handle;}).catch(()=>{});
      return ()=>{closed=true;subscription?.unsubscribe();};
    },
    openTimeline:async(w,result)=>{
      const response=await OrcaComposerAdapter().call(w,{method:'worktree.activate',params:{worktree:`id:${result.workspaceId}`}});
      if(!response.ok)throw Error('Не удалось открыть созданное пространство.');
      X.getState().setActiveWorktree(result.workspaceId,w.hostId);
      if(result.targetSessionId){
        const tabs=await OrcaComposerAdapter().call(w,{method:'session.tabs.list',params:{worktree:`id:${result.workspaceId}`}});
        if(!tabs.ok||!tabs.result.tabs.some(t=>t.type==='agent-session'&&t.sessionId===result.targetSessionId))throw Error('Чат задачи не подтверждён созданным пространством.');
        await new Promise((resolve,reject)=>{
          let stop=()=>{};
          const timer=setTimeout(()=>{stop();reject(Error('Чат задачи ещё не появился. Повторите открытие задачи.'));},30000);
          const ready=()=>{
            const state=X.getState(),tab=(state.unifiedTabsByWorktree[result.workspaceId]||[]).find(t=>t.contentType==='agent-session'&&t.entityId===result.targetSessionId);
            if(!tab)return;
            stop();clearTimeout(timer);state.activateTab(tab.id,{worktreeId:result.workspaceId});
            if(tab.groupId)state.focusGroup(result.workspaceId,tab.groupId);
            state.setActiveTabType('agent-session',result.workspaceId);resolve();
          };
          stop=X.subscribe(ready);ready();
        });
      }
      window.dispatchEvent(new CustomEvent('orca-composer-open-timeline',{detail:{id:result.workspaceId,instanceId:result.instanceId,environmentId:w.runtimeOwnerEnvironmentId}}));
    },
    openWorkspace:()=>X.getState().openModal('new-workspace-composer',{telemetrySource:'task-composer'}),
    openChat:w=>{X.getState().openModal('new-workspace-composer',{telemetrySource:'task-composer',initialRepoId:w.repoId});},
  };
}
function OrcaComposerRoot(){
  const React=OrcaTimelineReact();
  React.useEffect(()=>OrcaComposerMount(OrcaComposerAdapter()),[]);
  return null;
}
'''

def prepare_composer(runtime,output):
    prepare_timeline(runtime,output)
    target=output/TASK
    code=target.read_text()
    # Only SidebarHeader's native workspace-create control; other pluses and
    # the workspace.create keybinding continue to invoke the original XYe.
    anchor='let c=s,l=XYe,u=n?``:void 0'
    if code.count(anchor)!=1: raise ValueError('Native sidebar create handler anchor changed')
    code=code.replace(anchor,"let c='Создать',l=OrcaSidebarCreateRequest,u=n?``:void 0",1)
    anchor='"data-contextual-tour-target":`workspace-create-control`,onClick:l'
    if code.count(anchor)!=1: raise ValueError('Native sidebar create control anchor changed')
    code=code.replace(anchor,'"data-contextual-tour-target":`workspace-create-control`,"data-oc-create-trigger":"","aria-haspopup":"menu","aria-controls":"orca-sidebar-create-menu","aria-expanded":false,onClick:l',1)
    # Stock paired WEB exposes a generic facade for this desktop-only event.
    # Its rejected Promise is not an unsubscribe function. Keep real event
    # failures visible; only the exact stock unsupported-method case is optional.
    anchor='let i=window.api.linear?.onLinkedIssueUpdated?.(e=>r.handle({kind:`local`},e));return i&&e.push(i),r'
    if code.count(anchor)!=1: raise ValueError('Native optional Linear event anchor changed')
    code=code.replace(anchor,'let i=window.api.linear?.onLinkedIssueUpdated?.(e=>r.handle({kind:`local`},e));return i&&typeof i.then===`function`?(i.then(unsubscribe=>{if(typeof unsubscribe===`function`)e.push(unsubscribe)}).catch(error=>{if(!String(error).includes(`Unknown method: linear.onLinkedIssueUpdated`))queueMicrotask(()=>{throw error})}),r):(i&&e.push(i),r)',1)
    anchor='(0,$.jsx)(_He,{})'
    if code.count(anchor)!=1: raise ValueError('Native global overlay integration anchor changed')
    code=code.replace(anchor,'(0,$.jsxs)($.Fragment,{children:[(0,$.jsx)(_He,{}),(0,$.jsx)(OrcaComposerRoot,{})]})',1)
    modules=[]
    for name in ('routes','draft','start','completion','purpleflow-modes','create-menu','view'):
        text=(Path(__file__).parent/f'{name}.mjs').read_text()
        text='\n'.join(line for line in text.splitlines() if not line.startswith('import '))
        text=text.replace('export function ','function ').replace('export async function ','async function ').replace('export const ','const ')
        modules.append(text)
    prefix='import {st as OrcaComposerAppend} from "./use-new-tab-agent-menu-rows-BAs_ZV_6.js";\n'
    prefix+="function OrcaSidebarCreateRequest(event){window.dispatchEvent(new CustomEvent('orca-sidebar-create',{detail:{trigger:event.currentTarget,original:()=>XYe()}}));}\n"
    prefix+='import {vp as OrcaComposerRead,sp as OrcaComposerScope,da as OrcaComposerCompletions} from "./repo-removal-OHmyPL0w.js";\n'
    prefix+='let OrcaComposerTimelineTarget=null;\nconst OrcaComposerMount=(()=>{\n'+'\n'.join(modules)+'\nreturn mountComposer;})();\n'+ADAPTER
    target.write_text(prefix+code)
    (output/'web-index.html').write_text(cache_index((output/'web-index.html').read_text(),sha(target)))
    manifest=json.loads((output/'overlay.json').read_text())
    manifest['files']={name:sha(output/name) for name in manifest['files']}
    manifest['composer']={'schema':2,'launch':'agentSession.send','confirmation':'native-run-task-workspace-binding'}
    (output/'overlay.json').write_text(json.dumps(manifest,indent=2)+'\n')
    return manifest

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--runtime',type=Path,required=True);p.add_argument('--output',type=Path,required=True)
    a=p.parse_args();prepare_composer(a.runtime.resolve(),a.output.resolve())
    print('Composer + timeline overlay prepared; runtime and authorization unchanged')
