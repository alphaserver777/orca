import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile,writeFile,access} from 'node:fs/promises';
import {writeFileSync} from 'node:fs';
import {watch} from 'node:fs';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {sendEnvelope} from '../composer/start.mjs';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(process.env.ORCA_INTEGRATION_ROOT||'integration/.local/flow1');
const directory=path.join(root,'instance');
const instance=JSON.parse(await readFile(path.join(directory,'instance.json'),'utf8'));
assert.equal(instance.profile,path.join(directory,'profile'));
assert.equal(instance.runtime,path.join(directory,'runtime'));
const exists=async file=>access(path.join(root,file)).then(()=>true,()=>false);
async function waitForMarker(){
  return new Promise((resolve,reject)=>{
    let stopped=false;
    const stop=()=>{stopped=true;clearTimeout(timer);watcher.close();};
    const read=async()=>{try{const value=JSON.parse(await readFile(path.join(root,'implementation-start.json'),'utf8'));if(!stopped){stop();resolve(value);}}catch{}};
    const watcher=watch(root,()=>read());
    const timer=setTimeout(()=>{stop();reject(Error('The bounded executor did not start after native acceptance'));},30000);
    read();
  });
}
const env=Object.fromEntries(Object.entries(process.env).filter(([k])=>!k.startsWith('ORCA_')&&!k.startsWith('CODEX_')));
env.HOME=instance.home;env.PATH=path.join(root,'bin')+path.delimiter+process.env.PATH;env.COMPOSER_TEST_ROOT=root;
env.ORCA_USER_DATA_PATH=instance.profile;env.ORCA_INSTANCE_ID='timeline-disposable-'+instance.port;
const cli=(...args)=>{
  const execute=extra=>JSON.parse(execFileSync(path.join(instance.runtime,'bin/orca-ide'),[...args,'--json',...extra],{env,encoding:'utf8'}));
  try{return execute([]);}catch(error){
    const reply=JSON.parse(error.stdout||'{}'),id=reply.error?.data?.operationId;
    if(args[0]==='agent'&&args[1]==='launch'&&reply.error?.code==='agent_session_operation_unknown'&&id){
      writeFileSync(path.join(root,'launch-recovery.json'),JSON.stringify({args,operationId:id}));
      return execute(['--retry-launch',id]); // Native receipt recovery; never a fresh retry.
    }
    throw error;
  }
};

test('native composer → plan return → revision → one implementation; PurpleFlow shipped in paired browser', {timeout:600000},async()=>{
  assert.equal(await readFile(path.join(root,'bin/codex'),'utf8'),await readFile(new URL('./test-coordinator.py',import.meta.url),'utf8'));
  const fixtures=JSON.parse(await readFile(path.join(directory,'fixtures.json'),'utf8'));
  const name='integration-'+Date.now();
  const source=cli('worktree','create','--repo','id:'+fixtures.cards[0].id.split('::')[0],'--name',name,'--no-parent','--setup','skip').result.worktree;
  const launch=cli('agent','launch','--agent','codex','--surface','chat','--worktree','id:'+source.id,'--focus');
  assert.equal(launch.result.outcome.kind,'structured');
  const chatName=name+' coordinator';
  const sessionId=launch.result.outcome.sessionId||launch.result.outcome.handle.replace(/^(?:orca_session_id:|structured-agent-session-)/,'');
  cli('chat','rename','--session',sessionId,'--name',chatName);
  const browser=await chromium.launchPersistentContext(path.join(directory,'browser'),{headless:true,executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH,viewport:{width:1440,height:1050}});
  let page;
  try{
    page=await browser.newPage();for(const restored of browser.pages())if(restored!==page)await restored.close();page.setDefaultTimeout(180000);const errors=[];
    page.on('console',m=>{if(m.type()==='error')console.error('Console:',m.text().slice(0,500));});
    page.on('pageerror',error=>{errors.push(error.message);console.error('Page:',error.message);});
    await page.addLocatorHandler(page.locator('[data-slot="dialog-overlay"][data-state="open"]').first(),async()=>{
      const d=page.locator('[role="dialog"][data-state="open"]').last();for(const name of ['Got it','Close','Skip']){const b=d.getByRole('button',{name,exact:true});if(await b.isVisible()){await b.click();return;}}await page.keyboard.press('Escape');
    });
    const log=await readFile(path.join(directory,'server.log'),'utf8');
    await page.goto(await exists('authenticated.json')?`http://127.0.0.1:${instance.port}/web-index.html`:log.match(/Web client URL: (.+?)$/m)[1].trim(),{waitUntil:'domcontentloaded',timeout:120000});
    await page.locator('[data-worktree-title-inline-rename]:visible').filter({hasText:name}).first().click();
    await writeFile(path.join(root,'authenticated.json'),'true');await page.getByText(chatName,{exact:true}).last().click();
    const owner=page.locator('[contenteditable=true]').first();await owner.fill('ТЕСТ: сохранённый черновик обсуждения');
    await page.getByRole('button',{name:'Создать задачу из обсуждения',exact:true}).click();
    const form=page.locator('dialog.oc-dialog');
    assert.equal(await form.locator('[data-purpleflow=NewTaskModes] .oc-mode').count(),7);
    assert.equal(await form.getByRole('combobox',{name:'Рабочее пространство координатора',exact:true}).inputValue(),source.id);
    assert.equal(await form.getByRole('combobox',{name:'Чат координатора',exact:true}).inputValue(),sessionId);
    assert.ok((await form.getByRole('combobox',{name:'Проект',exact:true}).inputValue()).endsWith('/'+source.repoId));
    await form.locator('.oc-mode[data-mode=task]').click();
    await form.getByRole('textbox',{name:'Название задачи',exact:true}).fill('ТЕСТ: план с возвратом');
    await form.getByRole('textbox',{name:'Что сделать',exact:true}).fill('Проверить согласование плана в изолированной задаче. Это тест, а не решение владельца по рабочему проекту.');
    await page.screenshot({animations:'disabled',timeout:90000,path:path.join(root,'01-before-launch.png')});
    await form.getByRole('button',{name:'Закрыть форму',exact:true}).click();
    await page.reload({waitUntil:'domcontentloaded'});await page.locator('[data-worktree-title-inline-rename]:visible').filter({hasText:name}).first().click();
    await page.getByText(chatName,{exact:true}).last().click();
    assert.equal(await owner.innerText(),'ТЕСТ: сохранённый черновик обсуждения');
    await page.getByRole('button',{name:'Создать задачу из обсуждения',exact:true}).click();
    assert.match(await form.getByRole('textbox',{name:'Что сделать',exact:true}).inputValue(),/изолированной/);
    assert.equal(await form.locator('.oc-mode[data-mode=task]').getAttribute('aria-pressed'),'true');
    const configuration=await page.evaluate(()=>window.api.runtime.call({method:'settings.getAgentLaunch',params:null}));
    assert.equal(configuration.result.settings.agentCmdOverrides.codex,path.join(root,'bin/codex'),'Only the explicit deterministic native command may receive a test prompt');
    await form.getByRole('button',{name:'Запустить',exact:true}).dblclick();
    const panel=page.getByRole('complementary',{name:'Таймлайн задачи'}),decision=panel.getByRole('region',{name:'Согласование плана'});
    await panel.waitFor({timeout:60000});await form.waitFor({state:'detached'});
    await decision.getByText('Ждёт вашего решения',{exact:true}).waitFor({timeout:30000});
    await decision.getByRole('heading',{name:'Редакция 1',exact:true}).waitFor();
    const result=JSON.parse(await readFile(path.join(root,'coordinator-result.json'),'utf8'));
    assert.equal(result.coordinatorSessionId,sessionId);
    const call=(method,params)=>page.evaluate(({method,params})=>window.api.runtime.call({method,params}),{method,params});
    const params={workspaceId:result.workspaceId,instanceId:result.instanceId,run:result.runId,task:result.taskId};
    const task=async()=>{const r=await call('orchestration.taskList',{run:result.runId});assert.equal(r.ok,true);return r.result.tasks.find(t=>t.id===result.taskId);};
    assert.equal((await task()).status,'blocked');assert.equal(await exists('implementation-start.json'),false);
    assert.equal(await panel.locator('[data-purpleflow=Timeline]').count(),1);
    assert.equal(await panel.locator('.gantt-row').count(),8);
    assert.equal(await panel.locator('.gatebar').count(),1);
    const packageManifest=JSON.parse(await readFile(path.join(root,'overlay/combined.json'),'utf8'));
    const moduleURL=await page.evaluate(()=>{const mapping=JSON.parse(document.querySelector('script[data-orca-timeline-cache]').textContent).imports['./assets/App-CTRL5owY.js'];return new URL(mapping,location.href).href;});
    assert.ok(moduleURL);assert.equal(new URL(moduleURL).searchParams.get('timeline'),packageManifest.renderer['assets/App-CTRL5owY.js']);
    const deliveredHash=await page.evaluate(async url=>{
      const response=await fetch(url,{cache:'force-cache'});
      if(!response.ok)throw Error('Module delivery failed');
      const digest=await crypto.subtle.digest('SHA-256',await response.arrayBuffer());
      return Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
    },moduleURL);
    assert.equal(deliveredHash,packageManifest.renderer['assets/App-CTRL5owY.js']);
    assert.equal(await panel.locator('[data-purpleflow=StageDrawer]').count(),1);
    assert.equal(await decision.getByRole('button',{name:'Отменить задачу'}).count(),0);
    assert.equal(await decision.getByRole('button',{name:'Принять',exact:true}).count(),0);
    const targetDraft=page.locator('[contenteditable=true]').first();await targetDraft.fill('ТЕСТ: черновик в пространстве задачи');
    await page.screenshot({animations:'disabled',timeout:90000,path:path.join(root,'02-waiting-decision.png')});
    await page.emulateMedia({colorScheme:'dark'});
    await page.waitForFunction(()=>document.documentElement.classList.contains('dark'));
    await page.screenshot({animations:'disabled',timeout:90000,path:path.join(root,'02-waiting-dark.png')});
    await page.emulateMedia({colorScheme:'light'});
    await page.waitForFunction(()=>!document.documentElement.classList.contains('dark'));
    await decision.getByRole('button',{name:'Вернуть с комментарием'}).click();
    const comment=decision.getByRole('textbox',{name:'Комментарий к редакции'});
    await comment.fill('Добавить проверку восстановления после reload');
    await page.reload({waitUntil:'domcontentloaded'});await page.getByText('ТЕСТ: чат задачи',{exact:true}).last().click();await page.getByRole('button',{name:'Таймлайн',exact:true}).click();
    await comment.waitFor();assert.equal(await comment.inputValue(),'Добавить проверку восстановления после reload');
    assert.equal(await targetDraft.innerText(),'ТЕСТ: черновик в пространстве задачи');
    // Keyboard from the comment follows upstream GateBar: Ctrl+Enter returns with comment.
    await comment.focus();await page.keyboard.press('Control+Enter');
    await decision.getByText('План возвращён. Ожидается новая редакция.',{exact:true}).waitFor();
    await page.getByRole('button',{name:'Таймлайн',exact:true}).locator('[data-pending-decision]').waitFor({state:'detached'});
    assert.equal((await task()).status,'blocked');assert.equal(await exists('implementation-start.json'),false);
    const old=await call('workflowPlan.read',params);assert.equal(old.result.current.answer.decision,'return');
    async function advance(text){
      const history=await call('agentSession.history',{sessionId,direction:'tail',limit:1});
      const transport=await sendEnvelope(sessionId,text);transport.envelope.expectedRuntimeFence=history.result.page.fence;
      const r=await call('agentSession.send',transport);assert.equal(r.ok,true);assert.notEqual(r.result.ok,false);
    }
    // Deterministic coordinator consumes the native answer; only its timing is released by the test.
    await advance('fixture: next revision');
    await decision.getByRole('heading',{name:'Редакция 2',exact:true}).waitFor({timeout:45000});
    await page.getByRole('button',{name:'Таймлайн',exact:true}).locator('[data-pending-decision]').waitFor();
    assert.match(await decision.locator('.tl-plan-text').innerText(),/Учтён комментарий: Добавить проверку восстановления после reload/);
    assert.equal((await task()).status,'blocked');assert.equal(await exists('implementation-start.json'),false);
    await page.screenshot({animations:'disabled',timeout:90000,path:path.join(root,'03-new-revision.png')});
    await decision.getByRole('button',{name:'Редакция 1',exact:true}).click();
    await decision.getByRole('heading',{name:'Редакция 1',exact:true}).waitFor();
    assert.match(await decision.innerText(),/Комментарий: Добавить проверку восстановления/);
    assert.equal(await decision.getByRole('button',{name:'Принять план'}).count(),0);
    // Historical revision selection survives a real remount/reload; it grants no action.
    await page.reload({waitUntil:'domcontentloaded'});await page.getByText('ТЕСТ: чат задачи',{exact:true}).last().click();await page.getByRole('button',{name:'Таймлайн',exact:true}).click();
    await decision.getByRole('heading',{name:'Редакция 1',exact:true}).waitFor();
    assert.equal(await decision.getByRole('button',{name:'Принять план'}).count(),0);
    assert.equal(await decision.getByRole('button',{name:'Вернуть с комментарием'}).count(),0);
    assert.equal((await call('workflowPlan.read',params)).result.current.plan.revision,2);
    await page.screenshot({animations:'disabled',timeout:90000,path:path.join(root,'06-historical-revision-reload.png')});
    await decision.getByRole('button',{name:'Редакция 2',exact:true}).click();
    const stale=await call('workflowPlan.respond',{...params,gate:result.gateId,revision:1,decision:'accept',comment:''});assert.equal(stale.ok,false);
    const invalid=await call('workflowPlan.respond',{...params,instanceId:'stale',gate:result.gateId,revision:1,decision:'accept',comment:''});assert.equal(invalid.ok,false);
    const foreign=await call('workflowPlan.read',{...params,workspaceId:fixtures.cards[1].id,instanceId:fixtures.cards[1].instanceId});assert.equal(foreign.ok,false);
    // Native generic WEB mutations retain their stock authorization boundary.
    assert.equal((await call('orchestration.gateResolve',{run:result.runId,id:result.gateId,resolution:'overwrite'})).ok,false);
    await page.setViewportSize({width:1100,height:900});
    await decision.getByRole('button',{name:'Принять план'}).focus();await page.keyboard.press('Tab');
    const geometry=await page.evaluate(()=>{const panel=document.querySelector('.orca-timeline'),chat=document.querySelector('[contenteditable=true]');const p=panel.getBoundingClientRect(),c=chat.getBoundingClientRect();return {panelLeft:p.left,chatRight:c.right,panelWidth:p.width,viewport:innerWidth,scroll:panel.scrollWidth,width:panel.clientWidth};});
    assert.ok(geometry.panelLeft>=geometry.chatRight-1);assert.ok(geometry.panelWidth>=290);assert.ok(geometry.scroll<=geometry.width+1);
    await page.screenshot({animations:'disabled',timeout:90000,path:path.join(root,'04-narrow-desktop.png')});
    await page.setViewportSize({width:390,height:844});assert.equal(await panel.isVisible(),false);assert.equal(await page.getByRole('button',{name:'Таймлайн',exact:true}).isVisible(),false);
    await page.setViewportSize({width:1440,height:1050});
    await page.evaluate(()=>{window.__raceInjected=false;window.__raceReplies=[];for(const api of [window.api.runtime,window.api.runtimeEnvironments]){const original=api.call;api.call=async request=>{if(request.method!=='workflowPlan.respond'||window.__raceInjected)return original(request);window.__raceInjected=true;const replies=await Promise.all([original(request),original(request)]);window.__raceReplies=replies.map(r=>({ok:r.ok,code:r.error?.code}));return replies[0];};}});
    await decision.getByRole('button',{name:'Принять план'}).dblclick();
    await decision.getByText('План принят',{exact:true}).first().waitFor();
    const raceReplies=await page.evaluate(()=>window.__raceReplies);assert.equal(raceReplies.filter(r=>r.ok).length,1);assert.equal(raceReplies.filter(r=>!r.ok).length,1);
    const statusAfterAcceptance=(await task()).status;
    const accepted=await call('workflowPlan.read',params),current=accepted.result.current;
    assert.equal(current.plan.revision,2);assert.equal(current.answer.decision,'accept');
    const repeated=await Promise.all([1,2].map(()=>call('workflowPlan.respond',{...params,gate:current.gate.id,revision:2,decision:'accept',comment:''})));
    assert.equal(repeated.filter(r=>r.ok).length,0);
    // Repeat an executor wake as well: one accepted native gate permits one test start.
    await advance('fixture: consume current decision');
    const marker=await waitForMarker();assert.equal((await task()).status,'ready');
    await advance('fixture: repeated wake');
    await page.reload({waitUntil:'domcontentloaded'});await page.getByText('ТЕСТ: чат задачи',{exact:true}).last().click();await page.getByRole('button',{name:'Таймлайн',exact:true}).click();
    await decision.getByText('План принят',{exact:true}).first().waitFor();
    assert.equal(await targetDraft.innerText(),'ТЕСТ: черновик в пространстве задачи');
    assert.equal(marker.count,1);assert.equal(marker.revision,2);assert.equal(marker.nativeDispatch,false);
    assert.equal((await call('workflowPlan.read',params)).result.entries.length,2);
    const evidence=(await readFile(path.join(root,'cli-evidence.jsonl'),'utf8')).trim().split('\n').map(line=>JSON.parse(line));
    assert.equal(evidence.filter(e=>e.command[1]==='task-update'||e.command[1]==='dispatch'||e.command[1]==='worker-start').length,0,'No real Dispatch is impersonated by the bounded executor');
    assert.deepEqual(errors,[]);
    await writeFile(path.join(root,'e2e-result.json'),JSON.stringify({passed:true,testOnly:true,result,transitions:['blocked/pending-v1','blocked/returned-v1','blocked/pending-v2',`${statusAfterAcceptance}/accepted-v2`,'ready/bounded-test-executor-once'],nativeDispatch:false,historicalRevisionRestoredAfterReload:true,implementationStarts:marker.count,raceReplies,staleRejected:!stale.ok,repeatRejected:repeated.length,wrongInstanceRejected:!invalid.ok,foreignBindingRejected:!foreign.ok,geometry,errors},null,2));
  }catch(error){if(page){await writeFile(path.join(root,'failure.txt'),await page.locator('body').innerText().catch(()=>''));await page.screenshot({animations:'disabled',timeout:90000,path:path.join(root,'failure.png')}).catch(()=>{});}throw error;}
  finally{await browser.close();}
});
