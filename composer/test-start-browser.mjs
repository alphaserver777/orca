import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(process.env.ORCA_START_FIXTURE||'timeline/.local/composer-start');
const directory=path.join(root,'instance');
const instance=JSON.parse(await readFile(path.join(directory,'instance.json'),'utf8'));
assert.equal(instance.runtime,path.join(directory,'runtime'));
const env=Object.fromEntries(Object.entries(process.env).filter(([key])=>!key.startsWith('ORCA_')));
env.ORCA_USER_DATA_PATH=instance.profile;env.ORCA_INSTANCE_ID='timeline-disposable-'+instance.port;

test('paired WEB sends once through native chat, genuine coordinator creates native entities, reload opens verified timeline',async()=>{
  assert.equal(await readFile(path.join(root,'bin/codex'),'utf8'),await readFile(new URL('./test-codex.py',import.meta.url),'utf8'),'Only the deterministic provider may be tested');
  const fixtureBefore=(await readFile(path.join(root,'fixture-methods.txt'),'utf8').catch(()=>'')).length;
  const sourceName='start-fixture-'+Date.now();
  const chatName=sourceName+' coordinator';
  const fixtures=JSON.parse(await readFile(path.join(directory,'fixtures.json'),'utf8'));
  const repoId=fixtures.cards[0].id.split('::')[0];
  const source=JSON.parse(execFileSync(path.join(instance.runtime,'bin/orca-ide'),['worktree','create','--repo','id:'+repoId,'--name',sourceName,'--no-parent','--setup','skip','--json'],{env,encoding:'utf8'}));
  assert.equal(source.ok,true);
  {
    const launch=JSON.parse(execFileSync(path.join(instance.runtime,'bin/orca-ide'),['agent','launch','--agent','codex','--surface','chat','--worktree','name:'+sourceName,'--focus','--json'],{env,encoding:'utf8'}));
    assert.equal(launch.result?.outcome?.kind,'structured');
    const sessionId=launch.result.outcome.sessionId||launch.result.outcome.handle.replace(/^(?:orca_session_id:|structured-agent-session-)/,'');
    const renamed=JSON.parse(execFileSync(path.join(instance.runtime,'bin/orca-ide'),['chat','rename','--session',sessionId,'--name',chatName,'--json'],{env,encoding:'utf8'}));
    assert.equal(renamed.ok,true);
  }
  const browser=await chromium.launchPersistentContext(path.join(directory,'browser'),{headless:true,executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH,viewport:{width:1370,height:950}});
  try{
    const page=await browser.newPage();
    page.on('pageerror',e=>console.error('Page:',e.message));
    page.on('console',message=>{if(message.type()==='error')console.error('Console:',message.text().slice(0,1200));});
    const onboarding=page.locator('[data-slot="dialog-overlay"][data-state="open"]').first();
    await page.addLocatorHandler(onboarding,async()=>{const dialog=page.locator('[role="dialog"][data-state="open"]').last();for(const name of ['Got it','Close','Skip']){const b=dialog.getByRole('button',{name,exact:true});if(await b.isVisible()){await b.click();return;}}await page.keyboard.press('Escape');});
    let authenticated=false;try{authenticated=JSON.parse(await readFile(path.join(directory,'authenticated.json'),'utf8'));}catch{}
    const log=await readFile(path.join(directory,'server.log'),'utf8'),invitation=log.match(/Web client URL: (.+?)$/m)?.[1]?.trim();
    await page.goto(authenticated?`http://127.0.0.1:${instance.port}/web-index.html`:invitation);
    await page.locator('[data-worktree-title-inline-rename]:visible').filter({hasText:sourceName}).first().click();await writeFile(path.join(directory,'authenticated.json'),'true');
    await page.evaluate(()=>new Promise((resolve,reject)=>{const request=indexedDB.open('orca-task-composer',1);request.onsuccess=()=>{const db=request.result;const tx=db.transaction('drafts','readwrite');tx.objectStore('drafts').clear();tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);};request.onerror=()=>reject(request.error);}));
    await page.getByText(chatName,{exact:true}).last().click();
    const owner=page.locator('[contenteditable="true"]').first();await owner.fill('НЕОТПРАВЛЕННЫЙ ЧЕРНОВИК ВЛАДЕЛЬЦА');
    await page.getByRole('button',{name:'Создать задачу из обсуждения',exact:true}).click();
    const form=page.locator('dialog.oc-dialog');
    assert.ok((await readFile(path.join(root,'fixture-methods.txt'),'utf8')).slice(fixtureBefore).includes('thread/start'),'This launch must start the deterministic provider before any send');
    assert.equal(await form.getByRole('textbox',{name:'Что сделать',exact:true}).inputValue(),'');
    await form.getByRole('textbox',{name:'Что сделать',exact:true}).fill('Исправь опечатку — подтверждённая постановка');
    assert.equal(await form.locator('.oc-step[data-stage=review][data-conditional=true]').count(),1);
    assert.match(await form.locator('.oc-step[data-stage=review]').innerText(),/diff > 120/);
    await form.locator('.oc-mode[data-mode=epic]').click();
    assert.match(await form.locator('.oc-step[data-stage=milestones]').innerText(),/после каждого этапа/);
    assert.match(await form.locator('.oc-step[data-stage=checks]').innerText(),/Итоговые проверки/);
    await form.locator('.oc-mode[data-mode=bug]').click();
    assert.match(await form.locator('.oc-step[data-stage=clarify]').innerText(),/Уточнение симптомов/);
    assert.match(await form.locator('.oc-step[data-stage=approval]').innerText(),/Согласование причины/);
    await form.locator('.oc-mode[data-mode=quick]').click();
    // Refuse the native send before dispatch: no model or coordinator action may occur.
    await page.evaluate(()=>{window.__fixtureCalls=[];window.__rpcTrace=[];for(const api of [window.api.runtime,window.api.runtimeEnvironments]){const original=api.call;api.call=async request=>{if(request.method==='agentSession.send'){window.__fixtureCalls.push(request.params);return {ok:true,result:{ok:false,refusal:{code:'fixture-refused'}}};}const result=await original(request);window.__rpcTrace.push({method:request.method,ok:result.ok,error:result.error});return result;};}});
    await form.getByRole('button',{name:'Запустить',exact:true}).click();await form.getByRole('alert').waitFor();assert.match(await form.getByRole('alert').innerText(),/отказал/);
    assert.ok(await form.getByRole('textbox',{name:'Что сделать',exact:true}).isEditable());assert.equal(await owner.innerText(),'НЕОТПРАВЛЕННЫЙ ЧЕРНОВИК ВЛАДЕЛЬЦА');
    await page.reload();await page.locator('[data-worktree-title-inline-rename]:visible').filter({hasText:sourceName}).first().click();await page.getByText(chatName,{exact:true}).last().click();
    await page.getByRole('button',{name:'Создать задачу из обсуждения',exact:true}).click();
    assert.equal(await form.getByRole('textbox',{name:'Что сделать',exact:true}).inputValue(),'Исправь опечатку — подтверждённая постановка');
    // Count genuine sends and deliberately lose the first acknowledgement after acceptance.
    await page.evaluate(()=>{window.__sends=[];window.__rpcTrace=[];for(const api of [window.api.runtime,window.api.runtimeEnvironments]){const original=api.call;api.call=async request=>{if(request.method==='agentSession.send'){window.__sends.push(request.params);const result=await original(request);throw Error('fixture: acknowledgement lost');}const result=await original(request);window.__rpcTrace.push({method:request.method,ok:result.ok,error:result.error});return result;};}});
    await form.getByRole('button',{name:'Запустить',exact:true}).dblclick();
    await form.getByRole('alert').waitFor({timeout:45000});
    const sent=await page.evaluate(()=>window.__sends);assert.equal(sent.length,1);assert.ok(!JSON.stringify(sent).includes('НЕОТПРАВЛЕННЫЙ'));
    assert.match(sent[0].body.blocks[0].text,/двух раундов исправлений/);
    assert.match(sent[0].body.blocks[0].text,/приёмка владельцем/);
    assert.match(sent[0].body.blocks[0].text,/diff > 120/);
    assert.match(sent[0].body.blocks[0].text,/Создание Run\/Task не подтверждает выполнение/);
    await writeFile(path.join(root,'sent-envelope.json'),JSON.stringify(sent[0],null,2));
    await page.reload();await page.locator('[data-worktree-title-inline-rename]:visible').filter({hasText:sourceName}).first().click();await page.getByText(chatName,{exact:true}).last().click();
    await page.getByRole('button',{name:'Создать задачу из обсуждения',exact:true}).click();
    const panel=page.getByRole('complementary',{name:'Таймлайн задачи'});
    await panel.waitFor({timeout:45000});await form.waitFor({state:'detached'});
    const result=JSON.parse(await readFile(path.join(root,'coordinator-result.json'),'utf8'));
    assert.match(result.runId,/^run_/);assert.match(result.taskId,/^task_/);
    const native=await page.evaluate(async({sent,runId})=>{
      const replay=await window.api.runtime.call({method:'agentSession.send',params:sent});
      const runs=await window.api.runtime.call({method:'orchestration.runList',params:{limit:100}});
      const tasks=await window.api.runtime.call({method:'orchestration.taskList',params:{run:runId}});
      return {replay,runs,tasks};
    },{sent:sent[0],runId:result.runId});
    assert.equal(native.replay.ok,true);assert.equal(native.replay.result.ok,true);
    assert.equal(native.runs.result.runs.filter(run=>run.objective.includes(result.requestId)).length,1);
    assert.equal(native.tasks.result.tasks.filter(task=>task.spec.includes(result.requestId)).length,1);
    const stored=JSON.parse(native.tasks.result.tasks.find(task=>task.id===result.taskId).spec);
    assert.equal(stored.routePolicy.independentReview.lines,120);assert.equal(stored.routePolicy.correctionRounds,2);
    assert.equal(stored.routePolicy.acceptance,'owner');assert.ok(stored.steps.includes('review'));
    await page.screenshot({path:path.join(root,'launched-timeline.png')});
    assert.ok((await panel.innerText()).includes('Таймлайн'));
    await writeFile(path.join(root,'e2e-result.json'),JSON.stringify({result,passed:true},null,2));
  }catch(error){const page=browser.pages().at(-1);if(page){await writeFile(path.join(root,'rpc-trace.json'),JSON.stringify(await page.evaluate(()=>window.__rpcTrace||null).catch(()=>null)));await writeFile(path.join(root,'failure.txt'),await page.locator('body').innerText().catch(()=>''));await page.screenshot({path:path.join(root,'failure.png')}).catch(()=>{});}throw error;}finally{await browser.close();}
});
