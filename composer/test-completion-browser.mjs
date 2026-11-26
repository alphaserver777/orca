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

for(const phase of ['normal','sendRecorded','result'])test(`completion during ${phase} opens exactly one bound timeline without another send or reload`,async()=>{
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
  const browser=await chromium.launchPersistentContext(path.join(directory,'browser'),{headless:true,viewport:{width:1370,height:950}});
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
    await page.evaluate(async()=>{
      window.__events=[];
      window.__monitor=await window.api.runtime.subscribe({method:'agentSession.subscribeTurnCompletions',params:{includePrompts:true}},response=>{
        const event=response.result;
        window.__events.push({event,blocked:window.__blocked});
        if(event?.type==='completion'&&event.completion.sessionId===window.__sends?.[0]?.envelope.sessionId&&window.__blocked)window.__completionDuringBlock=true;
      });
    });
    await page.getByRole('button',{name:'Создать задачу из обсуждения',exact:true}).click();
    const form=page.locator('dialog.oc-dialog');
    assert.ok((await readFile(path.join(root,'fixture-methods.txt'),'utf8')).slice(fixtureBefore).includes('thread/start'),'This launch must start the deterministic provider before any send');
    assert.equal(await form.getByRole('textbox',{name:'Что сделать',exact:true}).inputValue(),'');
    await form.getByRole('textbox',{name:'Что сделать',exact:true}).fill('Исправь опечатку — подтверждённая постановка');
    await page.evaluate(phase=>{
      window.__sends=[];window.__opens=0;window.__calls=[];window.__completionDuringBlock=false;
      window.addEventListener('orca-composer-open-timeline',()=>window.__opens++);
      let released=false,release;const gate=new Promise(resolve=>{release=resolve;});
      window.__releaseCheck=()=>{released=true;release();};
      for(const api of [window.api.runtime,window.api.runtimeEnvironments]){
        const original=api.call;api.call=async request=>{
          window.__calls.push(request.method);
          if(request.method==='agentSession.send')window.__sends.push(request.params);
          const response=await original(request);
          const selected=phase==='sendRecorded'?request.method==='agentSession.sendRecorded':phase==='result'&&request.method==='files.readPreview'&&request.params.relativePath.endsWith('/result.json');
          if(selected&&!released){window.__heldResponse={ok:response.ok,method:request.method};window.__blocked=true;await gate;window.__blocked=false;}
          return response;
        };
      }
    },phase);
    await form.getByRole('button',{name:'Запустить',exact:true}).click();
    if(phase!=='normal')await page.waitForFunction(()=>window.__completionDuringBlock===true,{},{timeout:20000});
    if(phase==='result')assert.equal(await page.evaluate(()=>window.__heldResponse.ok),false,'Delay a real missing result, not an already completed result');
    await page.evaluate(()=>window.__releaseCheck());
    const panel=page.getByRole('complementary',{name:'Таймлайн задачи'});
    await panel.waitFor({timeout:10000});await form.waitFor({state:'detached',timeout:10000});
    assert.equal(await page.evaluate(()=>window.__opens),1);
    const sent=await page.evaluate(()=>window.__sends);assert.equal(sent.length,1);
    assert.ok(!JSON.stringify(sent).includes('НЕОТПРАВЛЕННЫЙ'));
    const result=JSON.parse(await readFile(path.join(root,'coordinator-result.json'),'utf8'));
    assert.match(result.runId,/^run_/);assert.match(result.taskId,/^task_/);
    await page.screenshot({path:path.join(root,`completion-${phase}.png`)});
    assert.ok((await panel.innerText()).includes('Таймлайн'));
    const calls=await page.evaluate(()=>window.__calls);
    assert.ok(calls.filter(method=>method==='agentSession.sendRecorded').length<=2);
    await page.locator('[data-worktree-title-inline-rename]:visible').filter({hasText:sourceName}).first().click();await page.getByText(chatName,{exact:true}).last().click();
    assert.equal(await owner.innerText(),'НЕОТПРАВЛЕННЫЙ ЧЕРНОВИК ВЛАДЕЛЬЦА');
    await writeFile(path.join(root,`completion-${phase}.json`),JSON.stringify({result,passed:true,sends:sent.length,opens:await page.evaluate(()=>window.__opens),completionDuringBlock:phase!=='normal',noReload:true,ownerDraftPreserved:true,calls},null,2));
  }catch(error){const page=browser.pages().at(-1);if(page){await writeFile(path.join(root,'rpc-trace.json'),JSON.stringify(await page.evaluate(()=>({calls:window.__calls,events:window.__events,blocked:window.__blocked,sends:window.__sends})).catch(()=>null)));await writeFile(path.join(root,'failure.txt'),await page.locator('body').innerText().catch(()=>''));await page.screenshot({path:path.join(root,'failure.png')}).catch(()=>{});}throw error;}finally{await browser.close();}
});
