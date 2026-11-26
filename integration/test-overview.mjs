// Disposable paired WEB; all gate answers below belong to this synthetic profile.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile,writeFile,access} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {selectionKey} from '../timeline/selection.mjs';
const root=process.env.ORCA_INTEGRATION_ROOT,require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE);
const instance=JSON.parse(await readFile(path.join(root,'instance/instance.json'))),fixtures=JSON.parse(await readFile(path.join(root,'overview-fixtures.json')));
const env=Object.fromEntries(Object.entries(process.env).filter(([k])=>!k.startsWith('ORCA_')&&!k.startsWith('CODEX_')));
Object.assign(env,{HOME:instance.home,ORCA_USER_DATA_PATH:instance.profile,ORCA_INSTANCE_ID:'timeline-disposable-'+instance.port,COMPOSER_TEST_ROOT:root});
const cli=(...args)=>JSON.parse(execFileSync(path.join(instance.runtime,'bin/orca-ide'),[...args,'--json'],{env,encoding:'utf8'}));
const rpc=(method,params)=>JSON.parse(execFileSync('python3',['-c',
  'import sys,json;sys.path.insert(0,"timeline");from bind import rpc;from pathlib import Path;print(json.dumps(rpc(Path(sys.argv[1]),sys.argv[2],json.loads(sys.argv[3]))))',
  path.join(instance.profile,'orca-runtime.json'),method,JSON.stringify(params)],{encoding:'utf8'}));
const report={errors:[],sizes:[]};
const parent=fixtures.parent;
const chat=title=>{
  const existing=rpc('session.tabs.list',{worktree:'id:'+parent.id}).tabs.find(t=>t.type==='agent-session'&&t.title===title);
  if(existing)return existing.sessionId;
  const launch=cli('agent','launch','--agent','codex','--surface','chat','--worktree','id:'+parent.id);
  const id=launch.result.outcome.sessionId||launch.result.outcome.handle.replace(/^(?:orca_session_id:|structured-agent-session-)/,'');
  cli('chat','rename','--session',id,'--name',title);return id;
};
const sessionId=chat('ТЕСТ: родительский чат'),secondId=chat('ТЕСТ: второй чат');
const browser=await chromium.launchPersistentContext(path.join(root,'instance/overview-browser'),{headless:true,executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH,viewport:{width:1440,height:1000}});
let page;
try{
  page=await browser.newPage();page.setDefaultTimeout(120000);page.on('pageerror',e=>report.errors.push(e.message));
  await page.addLocatorHandler(page.locator('[data-slot="dialog-overlay"][data-state="open"]').first(),async()=>{
    const dialog=page.locator('[role="dialog"][data-state="open"]').last();
    for(const name of ['Got it','Close','Skip']){const button=dialog.getByRole('button',{name,exact:true});if(await button.isVisible()){await button.click();return;}}
    await page.keyboard.press('Escape');
  });
  const log=await readFile(path.join(root,'instance/server.log'),'utf8');
  const authenticated=await access(path.join(root,'overview-authenticated.json')).then(()=>true,()=>false);
  await page.goto(authenticated?'http://127.0.0.1:'+instance.port+'/web-index.html':log.match(/Web client URL: (.+?)$/m)[1].trim(),{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.api?.runtime?.call);
  await page.evaluate(()=>window.api.runtime.call({method:'worktree.list',params:{}}));
  await writeFile(path.join(root,'overview-authenticated.json'),'true');
  const card=name=>page.locator('[data-worktree-title-inline-rename]:visible').filter({hasText:name}).first();
  await card('overview-parent').click();await page.getByText('ТЕСТ: родительский чат',{exact:true}).last().click();
  const editor=page.locator('[contenteditable=true]').first();await editor.fill('ТЕСТ: черновик родителя');
  await page.evaluate(()=>window.__overviewEditor=document.querySelector('[contenteditable=true]'));
  const toggle=()=>page.getByRole('button',{name:'Таймлайн',exact:true});
  const choiceKey=selectionKey({id:parent.id,instanceId:parent.instanceId,environmentId:'local'},null,'workspace-task');
  await page.evaluate(key=>sessionStorage.removeItem(key),choiceKey);
  await toggle().click();const panel=page.locator('#orca-timeline-panel');
  await panel.getByRole('heading',{name:'Задачи пространства',exact:true}).waitFor();await panel.locator('.tl-task').nth(2).waitFor({state:'attached'});
  assert.equal(await panel.locator('.tl-task').count(),3,'Review tree is grouped; unrelated same-Run task is absent');
  assert.match(await panel.locator('.tl-task').first().textContent(),/первая задача/);
  assert.match(await panel.locator('[data-task-title]').innerText(),/первая задача/);
  assert.equal(await page.evaluate(key=>sessionStorage.getItem(key),choiceKey),null,'An automatic default is not a deliberate selection');report.automaticDefault=true;
  assert.equal(await page.evaluate(()=>window.__overviewEditor===document.querySelector('[contenteditable=true]')),true);
  assert.equal(await editor.innerText(),'ТЕСТ: черновик родителя');
  assert.equal(await card('overview-parent').count(),1);
  await panel.getByTitle('Открыть детали «Ревью»',{exact:true}).click();await panel.getByText('ctx_overview_r2',{exact:false}).waitFor();
  assert.equal(await panel.getByRole('button',{name:/Попытка/}).count(),2);
  assert.match(await panel.locator('.gantt-row.is-current').innerText(),/Утверждение плана/);
  report.reviewAttempts=true;
  const choose=async text=>{await panel.locator('.tl-picker>summary').click();await panel.locator('.tl-task').filter({hasText:text}).click();await page.waitForFunction(t=>document.querySelector('[data-task-title]')?.textContent===t,text);};
  await choose('ТЕСТ: другой Run');await panel.locator('[data-decision-boundary]').filter({hasText:'недоступно'}).waitFor();
  assert.equal(await panel.getByRole('button',{name:'Принять план',exact:true}).count(),0);report.acceptanceBoundary=true;
  await choose('ТЕСТ: соседняя задача того же Run');
  await page.reload({waitUntil:'domcontentloaded'});await card('overview-parent').click();await page.getByText('ТЕСТ: родительский чат',{exact:true}).last().click();
  await toggle().click();await panel.locator('[data-task-title]').filter({hasText:'соседняя задача'}).waitFor();
  assert.equal(await editor.innerText(),'ТЕСТ: черновик родителя');report.reloadSelection=true;
  await page.getByText('ТЕСТ: второй чат',{exact:true}).last().click();await panel.locator('[data-task-title]').filter({hasText:'соседняя задача'}).waitFor();
  await editor.fill('ТЕСТ: другой черновик');await page.getByText('ТЕСТ: родительский чат',{exact:true}).last().click();
  assert.equal(await editor.innerText(),'ТЕСТ: черновик родителя');report.twoChats=true;
  // Delay A history in the browser; switch to B before releasing that reply.
  await page.evaluate(()=>{
    window.__overviewCalls=[];
    for(const api of [window.api.runtime,window.api.runtimeEnvironments]){
      const original=api.call.bind(api);
      api.call=async request=>{window.__overviewCalls.push({method:request.method,task:request.params?.task});const reply=await original(request);if(window.__overviewDelay&&request.method==='workflowTasks.history'&&request.params.task==='task_overview_a')return new Promise(resolve=>window.__overviewRelease=()=>resolve(reply));return reply;};
    }
    window.__overviewDelay=true;
  });
  await choose('ТЕСТ: первая задача');await page.waitForFunction(()=>typeof window.__overviewRelease==='function');
  await choose('ТЕСТ: соседняя задача того же Run');await page.evaluate(()=>{window.__overviewDelay=false;window.__overviewRelease();});
  assert.match(await panel.locator('[data-task-title]').innerText(),/соседняя задача/);report.lateResponse=true;
  await choose('ТЕСТ: первая задача');await panel.getByTitle('Открыть детали «Утверждение плана»',{exact:true}).click();
  await panel.getByRole('button',{name:'Принять план',exact:true}).waitFor();
  const context=await page.evaluate(async identity=>window.api.runtime.call({method:'workflowTasks.read',params:identity}),{workspaceId:parent.id,instanceId:parent.instanceId});
  assert.equal(context.ok,true);assert.equal(context.result.contexts.length,3);
  const request={workspaceId:fixtures.a.id,instanceId:fixtures.a.instanceId,run:'run_overview',task:'task_overview_a',gate:'gate_overview_plan',revision:1,decision:'accept',comment:'ТЕСТ: одноразовое решение'};
  const call=async params=>page.evaluate(params=>window.api.runtime.call({method:'workflowPlan.respond',params}),params);
  assert.equal((await call({...request,workspaceId:parent.id,instanceId:parent.instanceId})).ok,false,'Parenthood is not mutation authority');
  assert.equal((await call({...request,instanceId:'old-instance'})).ok,false);
  const wrong=await page.evaluate(async identity=>window.api.runtime.call({method:'workflowTasks.history',params:{...identity,run:'run_overview',task:'task_unrelated'}}),{workspaceId:parent.id,instanceId:parent.instanceId});
  assert.equal(wrong.ok,false);report.scopedRead=true;
  // Use real panel action and capture the immutable exact target.
  await page.evaluate(()=>{for(const api of [window.api.runtime,window.api.runtimeEnvironments]){const original=api.call.bind(api);api.call=async request=>{const reply=await original(request);if(request.method==='workflowPlan.respond'){window.__overviewAnswer=request.params;window.__overviewResponse=reply;}return reply;};}});
  for(const width of [1440,1280,960]){
    await page.setViewportSize({width,height:1000});
    await page.waitForFunction(()=>document.querySelector('#orca-timeline-panel').getBoundingClientRect().width<=Math.max(280,innerWidth-640)+1);
    const box=await panel.boundingBox(),chatBox=await editor.boundingBox();report.sizes.push({width,panel:box.width,chat:chatBox.width});
    assert.ok(chatBox.width>180);assert.ok(chatBox.x+chatBox.width<=box.x+1);
    assert.equal(await panel.evaluate(n=>n.scrollWidth<=n.clientWidth+1),true);
    await page.screenshot({path:path.join(root,'overview-'+width+'.png'),animations:'disabled'});
  }
  await page.setViewportSize({width:1440,height:1000});
  await panel.getByRole('button',{name:'Принять план',exact:true}).click();
  await page.waitForFunction(()=>window.__overviewAnswer);const actual=await page.evaluate(()=>window.__overviewAnswer);
  assert.equal((await page.evaluate(()=>window.__overviewResponse)).ok,true,JSON.stringify(await page.evaluate(()=>window.__overviewResponse)));
  for(const field of ['workspaceId','instanceId','run','task','gate','revision'])assert.equal(actual[field],request[field]);
  assert.equal((await call(request)).ok,false,'Repeated answer is stale');report.exactDecision=actual;
  await page.waitForFunction(()=>document.querySelector('.tl-task')?.textContent.includes('другой Run'));
  assert.match(await panel.locator('[data-task-title]').innerText(),/первая задача/);report.eventReorderPreservesChoice=true;
  const added=rpc('worktree.list',{limit:200}).worktrees.find(w=>w.displayName==='overview-added')??rpc('worktree.create',{repo:'id:'+parent.repoId,name:'overview-added',baseBranch:'master',setup:'skip',parentWorktree:'id:'+parent.id,activate:false}).worktree;
  rpc('files.write',{worktree:'id:'+added.id,expectedExecutionHostId:'local',relativePath:'.orca-task-timeline.json',content:JSON.stringify({schema:1,workspace:{id:added.id,instanceId:added.instanceId},links:[{runId:'run_overview',taskId:'task_unrelated'}]})});
  const eventReply=await call({workspaceId:added.id,instanceId:added.instanceId,run:'run_overview',task:'task_unrelated',gate:'gate_overview_event',revision:1,decision:'accept',comment:'ТЕСТ: штатное событие новой задачи'});
  assert.equal(eventReply.ok,true,JSON.stringify(eventReply));
  await panel.locator('.tl-task').nth(3).waitFor({state:'attached'});assert.equal(await panel.locator('.tl-task').count(),4);
  assert.match(await panel.locator('[data-task-title]').innerText(),/первая задача/);report.newTaskEvent=true;
  await card('overview-empty').click();await toggle().click();await panel.getByText('У этого пространства пока нет связанной задачи.',{exact:true}).waitFor();
  await card('overview-one').click();await toggle().click();await panel.locator('.gantt-row').first().waitFor();
  assert.equal(await panel.locator('.tl-tasks').isVisible(),false);report.singleAndEmpty=true;
  await page.setViewportSize({width:390,height:844});assert.equal(await toggle().count(),0);report.mobilePreserved=true;
  assert.deepEqual(report.errors,[]);report.passed=true;
  await writeFile(path.join(root,'overview-result.json'),JSON.stringify(report,null,2));
}catch(e){await writeFile(path.join(root,'overview-failure-report.json'),JSON.stringify(report,null,2));if(page){await writeFile(path.join(root,'overview-trace.json'),JSON.stringify(await page.evaluate(()=>({calls:window.__overviewCalls,release:typeof window.__overviewRelease,title:document.querySelector('[data-task-title]')?.textContent})).catch(()=>null)));await writeFile(path.join(root,'overview-failure.txt'),await page.locator('body').innerText().catch(()=>''));await page.screenshot({path:path.join(root,'overview-failure.png')}).catch(()=>{});}throw e;}
finally{await browser.close();}
