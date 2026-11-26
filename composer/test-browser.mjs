import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const directory=path.resolve(process.env.ORCA_COMPOSER_DISPOSABLE||'timeline/.local/composer/e2e');
const instance=JSON.parse(await readFile(path.join(directory,'instance.json'),'utf8'));
const fixtures=JSON.parse(await readFile(path.join(directory,'fixtures.json'),'utf8'));
assert.equal(instance.runtime,path.join(directory,'runtime'));
assert.equal(instance.profile,path.join(directory,'profile'));
const env=Object.fromEntries(Object.entries(process.env).filter(([key])=>!key.startsWith('ORCA_')));
env.ORCA_USER_DATA_PATH=instance.profile;env.ORCA_INSTANCE_ID='timeline-disposable-'+instance.port;

test('paired WEB composer: both entries, attachments, routes and A/B isolation without a model turn',async()=>{
  const launchCards=process.env.ORCA_COMPOSER_SKIP_LAUNCH?[]:(process.env.ORCA_COMPOSER_LAUNCH_CARDS?.split(',')||['card-a','card-b']);
  for(const name of launchCards){
    const launch=JSON.parse(execFileSync(path.join(instance.runtime,'bin/orca-ide'),['agent','launch','--agent','codex','--surface','chat','--worktree',`name:${name}`,'--focus','--json'],{env,encoding:'utf8'}));
    assert.equal(launch.result?.outcome?.kind,'structured');
  }
  const browser=await chromium.launchPersistentContext(path.join(directory,'browser'),{headless:true,viewport:{width:1370,height:950}});
  const errors=[];
  try{
    const statePath=path.join(directory,'browser-authenticated.json');
    let authenticated=false;try{authenticated=JSON.parse(await readFile(statePath,'utf8'));}catch{}
    const page=await browser.newPage();
    page.on('pageerror',error=>{errors.push(error.message);if(error.message!=='Unknown method: linear.onLinkedIssueUpdated')console.error('Renderer error:',error.message);});
    const onboarding=page.locator('[data-slot="dialog-overlay"][data-state="open"]').first();
    await page.addLocatorHandler(onboarding,async()=>{
      const dialog=page.locator('[role="dialog"][data-state="open"]').last();
      for(const name of ['Got it','Close','Skip']){const button=dialog.getByRole('button',{name,exact:true});if(await button.isVisible()){await button.click();return;}}
      await page.keyboard.press('Escape');
    });
    const log=await readFile(path.join(directory,'server.log'),'utf8');
    const invitation=log.match(/Web client URL: (.+?)$/m)?.[1]?.trim();
    assert.ok(invitation?.startsWith(`http://127.0.0.1:${instance.port}/`));await page.goto(authenticated?`http://127.0.0.1:${instance.port}/web-index.html`:invitation);
    await page.locator('[data-worktree-title-inline-rename]:visible').filter({hasText:'card-a'}).first().waitFor();
    await writeFile(statePath,'true');
    await page.evaluate(()=>new Promise((resolve,reject)=>{const request=indexedDB.open('orca-task-composer',1);request.onsuccess=()=>{const db=request.result;const tx=db.transaction('drafts','readwrite');tx.objectStore('drafts').clear();tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);};request.onerror=()=>reject(request.error);}));
    await page.locator('[data-worktree-title-inline-rename]:visible').filter({hasText:'card-a'}).first().click({noWaitAfter:true});
    if(!await page.getByRole('button',{name:'Создать задачу из обсуждения',exact:true}).isVisible())await page.getByText('Codex Chat',{exact:true}).last().click();
    const source=page.locator('[contenteditable="true"]').first();await source.fill('Исправь опечатку. Прямое поручение A');
    await page.getByRole('button',{name:'Создать задачу из обсуждения',exact:true}).click();
    const form=page.locator('dialog.oc-dialog');await form.waitFor();
    await form.getByRole('textbox',{name:'Что сделать',exact:true}).waitFor();
    await page.screenshot({path:path.join(directory,'composer-initial.png')});
    await writeFile(path.join(directory,'initial-controls.txt'),await form.innerText());
    assert.equal(await form.getByRole('textbox',{name:'Что сделать',exact:true}).inputValue(),'');
    await form.getByRole('textbox',{name:'Что сделать',exact:true}).fill('Исправь опечатку. Прямое поручение A');
    assert.equal(await form.locator('.oc-mode[data-mode=auto]').getAttribute('aria-pressed'),'true');
    assert.equal(await form.locator('.oc-step').count(),5);
    for(const [mode,count] of [['quick',5],['bug',9],['task',8],['epic',8],['refactor',9],['review',2]]){
      await form.locator(`.oc-mode[data-mode=${mode}]`).click();assert.equal(await form.locator('.oc-step').count(),count);
    }
    await form.locator('.oc-mode[data-mode=task]').click();await form.getByLabel('Визуальная проверка',{exact:true}).check();
    assert.equal(await form.locator('.oc-step').count(),9);assert.equal(await form.locator('.oc-step[data-decision=true]').count(),2);
    await form.getByLabel('Визуальная проверка',{exact:true}).uncheck();await form.locator('.oc-mode[data-mode=auto]').click();
    await form.getByRole('textbox',{name:'Что сделать',exact:true}).fill('Исправь ошибку');assert.equal(await form.locator('.oc-step').count(),9);
    await form.getByRole('textbox',{name:'Что сделать',exact:true}).fill('Исправь опечатку. Прямое поручение A');assert.equal(await form.locator('.oc-step').count(),5);
    await form.getByRole('textbox',{name:'Контекст обсуждения'}).fill('Договорённости только A');
    await form.getByLabel('Добавить файлы').setInputFiles({name:'proof.txt',mimeType:'text/plain',buffer:Buffer.from('Материал A')});
    await form.getByRole('button',{name:'Удалить proof.txt'}).waitFor();
    for(const type of ['drop','paste']){
      await form.evaluate((node,type)=>{const transfer=new DataTransfer();transfer.items.add(new File(['fixture'],`${type}.txt`,{type:'text/plain'}));node.dispatchEvent(type==='drop'?new DragEvent('drop',{dataTransfer:transfer,bubbles:true,cancelable:true}):new ClipboardEvent('paste',{clipboardData:transfer,bubbles:true,cancelable:true}));},type);
      await form.getByRole('button',{name:`Удалить ${type}.txt`}).click();
    }
    await form.getByRole('button',{name:'Закрыть форму'}).click();assert.equal(await source.innerText(),'Исправь опечатку. Прямое поручение A');
    await page.locator('[data-worktree-title-inline-rename]:visible').filter({hasText:'card-b'}).first().click();
    if(!await page.getByRole('button',{name:'Создать задачу из обсуждения',exact:true}).isVisible())await page.getByText('Codex Chat',{exact:true}).last().click();
    await page.getByRole('button',{name:'Создать задачу из обсуждения',exact:true}).click();
    assert.equal(await form.getByRole('textbox',{name:'Что сделать',exact:true}).inputValue(),'');
    assert.equal(await form.getByRole('button',{name:'Удалить proof.txt'}).count(),0);
    await form.getByRole('textbox',{name:'Что сделать',exact:true}).fill('Задача B');
    await form.getByRole('button',{name:'Закрыть форму'}).click();
    await page.locator('[data-worktree-title-inline-rename]:visible').filter({hasText:'card-a'}).first().click();
    await page.getByRole('button',{name:'Создать задачу из обсуждения',exact:true}).click();
    assert.equal(await form.getByRole('textbox',{name:'Контекст обсуждения'}).inputValue(),'Договорённости только A');
    await form.getByRole('button',{name:'Удалить proof.txt'}).waitFor();
    await form.getByRole('button',{name:'Закрыть форму'}).click();
    assert.equal(await source.innerText(),'Исправь опечатку. Прямое поручение A');
    // Board entrance uses the same saved form, without sending an existing direct request.
    await page.getByRole('button',{name:'Workspace board',exact:true}).first().click();
    await page.locator('button[data-oc-create-trigger]:visible').first().click();
    await page.getByRole('menuitem').filter({hasText:'Задача'}).click();
    const workspacePicker=page.locator('dialog.oc-context');
    await workspacePicker.waitFor();
    const workspaceOptions=await workspacePicker.getByRole('combobox',{name:'Рабочее пространство',exact:true}).locator('option').evaluateAll(nodes=>nodes.map(n=>({text:n.textContent,value:n.value})));
    await workspacePicker.getByRole('combobox',{name:'Рабочее пространство',exact:true}).selectOption(workspaceOptions.find(n=>n.text.includes('card-a')).value);
    await workspacePicker.getByRole('button',{name:'Открыть форму задачи',exact:true}).click();await form.waitFor();
    assert.equal(await form.getByRole('textbox',{name:'Контекст обсуждения'}).inputValue(),'Договорённости только A');
    await page.setViewportSize({width:390,height:844});await page.screenshot({path:path.join(directory,'composer-mobile.png')});
    const size=await form.boundingBox();assert.ok(size.width<=390);
    assert.deepEqual(errors.filter(message=>message!=='Unknown method: linear.onLinkedIssueUpdated'),[]);
  }finally{await browser.close();}
});
