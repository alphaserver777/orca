// Run sequentially on fresh, private stock and combined profiles. No model prompt.
import {createRequire} from 'node:module';
import {readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import assert from 'node:assert/strict';
const root=path.resolve(process.env.ORCA_INTEGRATION_ROOT),directory=path.join(root,'instance');
const instance=JSON.parse(await readFile(path.join(directory,'instance.json'),'utf8'));
assert.equal(instance.profile,path.join(directory,'profile'));
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const env=Object.fromEntries(Object.entries(process.env).filter(([k])=>!k.startsWith('ORCA_')&&!k.startsWith('CODEX_')));
Object.assign(env,{HOME:instance.home,ORCA_USER_DATA_PATH:instance.profile,ORCA_INSTANCE_ID:'timeline-disposable-'+instance.port,COMPOSER_TEST_ROOT:root});
const cli=(...args)=>JSON.parse(execFileSync(path.join(instance.runtime,'bin/orca-ide'),[...args,'--json'],{env,encoding:'utf8'}));
const report={testOnly:true,stock:process.env.ORCA_RELOAD_STOCK==='1',nativeDispatch:false,phases:[],errors:[]};
const mark=(phase,since)=>report.phases.push({phase,elapsedMs:Math.round(performance.now()-since)});
const browser=await chromium.launchPersistentContext(path.join(directory,'browser'),{headless:true,executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH,viewport:{width:1440,height:1050}});
let page;
try{
  const fixtures=JSON.parse(await readFile(path.join(directory,'fixtures.json'),'utf8'));
  const card=fixtures.cards[0];
  let t=performance.now();
  const launched=cli('agent','launch','--agent','codex','--surface','chat','--worktree','id:'+card.id,'--focus');
  const session=launched.result.outcome.sessionId||launched.result.outcome.handle.replace(/^(?:orca_session_id:|structured-agent-session-)/,'');
  cli('chat','rename','--session',session,'--name','ТЕСТ reload');mark('native-chat-created',t);
  page=await browser.newPage();for(const restored of browser.pages())if(restored!==page)await restored.close();page.setDefaultTimeout(30000);
  page.on('pageerror',e=>report.errors.push(e.message.replace(/https?:\/\/\S+/g,'[private-url]')));
  page.on('response',r=>{if(r.url().includes('/assets/App-'))report.phases.push({phase:'static-app-response',status:r.status(),atMs:Math.round(performance.now())});});
  await page.addLocatorHandler(page.locator('[data-slot="dialog-overlay"][data-state="open"]').first(),async()=>{
    const d=page.locator('[role="dialog"][data-state="open"]').last();for(const name of ['Got it','Close','Skip']){const b=d.getByRole('button',{name,exact:true});if(await b.isVisible()){await b.click();return;}}await page.keyboard.press('Escape');
  });
  const log=await readFile(path.join(directory,'server.log'),'utf8');
  const authenticated=await readFile(path.join(root,'authenticated.json'),'utf8').then(()=>true,()=>false);
  t=performance.now();await page.goto(authenticated?`http://127.0.0.1:${instance.port}/web-index.html`:log.match(/Web client URL: (.+?)$/m)[1].trim(),{waitUntil:'domcontentloaded',timeout:30000});mark('paired-domcontentloaded',t);
  report.pendingPhase='select-native-card-and-chat';
  t=performance.now();await page.locator('[data-worktree-title-inline-rename]:visible').filter({hasText:'card-a'}).first().click();await page.getByText('ТЕСТ reload',{exact:true}).last().click();
  const composer=page.locator('[contenteditable=true]').first();await composer.fill('ТЕСТ: reload без отправки');mark('chat-mounted',t);await writeFile(path.join(root,'authenticated.json'),'true');
  if(!report.stock){t=performance.now();await page.getByRole('button',{name:'Создать задачу из обсуждения',exact:true}).click();await page.locator('dialog.oc-dialog').getByRole('textbox',{name:'Что сделать',exact:true}).waitFor();await page.getByRole('button',{name:'Закрыть форму',exact:true}).click();mark('form-mounted',t);}
  t=performance.now();await page.reload({waitUntil:'domcontentloaded',timeout:30000});mark('reload-domcontentloaded',t);
  t=performance.now();await page.locator('[data-worktree-title-inline-rename]:visible').filter({hasText:'card-a'}).first().click();await page.getByText('ТЕСТ reload',{exact:true}).last().click();assert.equal(await composer.innerText(),'ТЕСТ: reload без отправки');mark('reload-chat-mounted',t);
  t=performance.now();const reply=await page.evaluate(()=>window.api.runtime.call({method:'worktree.list',params:{}}));assert.equal(reply.ok,true);mark('reload-native-rpc',t);
  if(!report.stock){t=performance.now();await page.getByRole('button',{name:'Создать задачу из обсуждения',exact:true}).click();await page.locator('dialog.oc-dialog').getByRole('textbox',{name:'Что сделать',exact:true}).waitFor();mark('reload-form-mounted',t);}
  if(!report.stock && process.env.ORCA_RELOAD_HISTORY==='1'){
    await page.getByRole('button',{name:'Закрыть форму',exact:true}).click();
    await page.getByRole('button',{name:'Таймлайн',exact:true}).click();
    const panel=page.getByRole('complementary',{name:'Таймлайн задачи'});
    const contexts=panel.getByRole('combobox',{name:'Связанный запуск и задача',exact:true});
    await contexts.selectOption({label:'Реализация A (run_fixture_shared)'});
    const current=panel.locator('.gantt-row.is-current');
    await current.waitFor();assert.match(await current.innerText(),/Реализация/);
    const currentText=await current.innerText();
    await panel.getByTitle('Открыть детали «Утверждение плана»',{exact:true}).click();
    await panel.getByText('gate_fixture_early',{exact:false}).waitFor();
    assert.equal(await current.innerText(),currentText);
    assert.equal(await panel.getByRole('button',{name:'Принять план',exact:true}).count(),0);
    await panel.getByTitle('Открыть детали «Ревью»',{exact:true}).click();
    await panel.getByText('ctx_fixture_review',{exact:false}).waitFor();
    await panel.getByText('успех',{exact:true}).waitFor();
    await panel.getByRole('button',{name:'Первое ревью A · Попытка 1',exact:true}).click();
    await panel.getByText('ctx_fixture_a',{exact:false}).waitFor();await panel.getByText('ошибка',{exact:true}).waitFor();
    await page.screenshot({path:path.join(root,'05-parent-attempt.png'),animations:'disabled'});
    await panel.getByRole('button',{name:'Закрыть',exact:true}).click();
    await page.locator('[data-worktree-title-inline-rename]:visible').filter({hasText:'card-b'}).first().click();
    // Native fixture B has no chat, so launch one without a prompt.
    cli('agent','launch','--agent','codex','--surface','chat','--worktree','id:'+fixtures.cards[1].id,'--focus');
    await page.getByRole('button',{name:'Таймлайн',exact:true}).click();
    await panel.locator('.gantt-row').first().waitFor();assert.equal(await panel.getByText('ctx_fixture_a',{exact:false}).count(),0);
    await panel.getByRole('button',{name:'Закрыть',exact:true}).click();
    await page.locator('[data-worktree-title-inline-rename]:visible').filter({hasText:'card-a'}).first().click();await page.getByText('ТЕСТ reload',{exact:true}).last().click();
    await page.getByRole('button',{name:'Таймлайн',exact:true}).click();
    await panel.getByText('ctx_fixture_a',{exact:false}).waitFor();assert.equal(await current.innerText(),currentText);
    await page.reload({waitUntil:'domcontentloaded',timeout:30000});
    await page.locator('[data-worktree-title-inline-rename]:visible').filter({hasText:'card-a'}).first().click();await page.getByText('ТЕСТ reload',{exact:true}).last().click();
    await page.getByRole('button',{name:'Таймлайн',exact:true}).click();await panel.getByText('ctx_fixture_a',{exact:false}).waitFor();
    assert.equal(await current.innerText(),currentText);report.selectionRestoredAfterReload=true;
    assert.equal(await contexts.inputValue(),'0');
    await contexts.selectOption({label:'Другой запуск A (run_fixture_extra)'});
    await panel.locator('[data-task-title]').filter({hasText:'Другой запуск A'}).waitFor();
    await page.reload({waitUntil:'domcontentloaded',timeout:30000});
    await page.locator('[data-worktree-title-inline-rename]:visible').filter({hasText:'card-a'}).first().click();await page.getByText('ТЕСТ reload',{exact:true}).last().click();
    await page.getByRole('button',{name:'Таймлайн',exact:true}).click();
    await panel.locator('[data-task-title]').filter({hasText:'Другой запуск A'}).waitFor();
    assert.equal(await contexts.inputValue(),'1');assert.equal(await panel.getByText('ctx_fixture_a',{exact:false}).count(),0);
    report.contextBRestoredAfterReload=true;
    await contexts.selectOption({label:'Реализация A (run_fixture_shared)'});
    await panel.getByText('ctx_fixture_a',{exact:false}).waitFor();
    assert.equal(await current.innerText(),currentText);report.contextARestoredAfterReload=true;
    const foreign=await page.evaluate(async params=>window.api.runtime.call({method:'workflowPlan.read',params}),{workspaceId:card.id,instanceId:card.instanceId,run:'run_fixture_shared',task:'task_fixture_a'});
    assert.equal(foreign.ok,false);report.ancestorActionContextDenied=true;
    report.parentGateBeforeChild=true;report.attemptResults=['failed','succeeded'];report.selectionRestoredAfterContext=true;
  }
  if(!report.stock)assert.deepEqual(report.errors,[]);
  report.passed=true;
}catch(error){report.passed=false;report.failure={name:error.name,message:error.message.slice(0,1000).replace(/https?:\/\/\S+/g,'[private-url]')};process.exitCode=1;if(page)await page.screenshot({path:path.join(root,'selection-failure.png'),timeout:30000}).catch(()=>{});}
finally{await writeFile(path.join(root,'reload-result.json'),JSON.stringify(report,null,2));await browser.close();console.log(JSON.stringify(report));}
