// Real paired WEB acceptance, after test-browser.mjs on the same isolated profile.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
const root=process.env.ORCA_INTEGRATION_ROOT;
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE);
const instance=JSON.parse(await readFile(path.join(root,'instance/instance.json')));
const result=JSON.parse(await readFile(path.join(root,'coordinator-result.json')));
const report={sizes:[],switches:[],errors:[]};
const browser=await chromium.launchPersistentContext(path.join(root,'instance/browser'),{headless:true,executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH,viewport:{width:1440,height:1050}});
let page;
try{
 page=await browser.newPage();for(const old of browser.pages())if(old!==page)await old.close();page.setDefaultTimeout(30000);
 page.on('pageerror',e=>report.errors.push(e.message));
 await page.addLocatorHandler(page.locator('[data-slot="dialog-overlay"][data-state="open"]').first(),async()=>{await page.keyboard.press('Escape')});
 await page.goto('http://127.0.0.1:'+instance.port+'/web-index.html',{waitUntil:'domcontentloaded'});
 const targetName=path.basename(result.workspaceId.split('::')[1]);
 await page.locator('[data-worktree-title-inline-rename]:visible').filter({hasText:targetName}).first().click();
 await page.getByText('ТЕСТ: чат задачи',{exact:true}).last().click();
 const toggle=()=>page.getByRole('button',{name:'Таймлайн',exact:true});
 const open=async()=>{await toggle().click();await page.locator('.gantt-row').first().waitFor();await page.getByTitle('Открыть детали «Утверждение плана»',{exact:true}).click();};
 await open();
 await page.locator('#orca-timeline-panel').press('Escape');
 await page.locator('#orca-timeline-panel').waitFor({state:'detached'});
 assert.equal(await toggle().evaluate(n=>n===document.activeElement),true);
 await page.keyboard.press('Enter');await page.locator('.gantt-row').first().waitFor();
 const editor=page.locator('[contenteditable=true]').first();
 await editor.fill('Проверка: ввод и фокус сохраняются при выборе правой вкладки');
 await page.evaluate(()=>window.__sidebarEditor=document.querySelector('[contenteditable=true]'));
 const native=page.locator('button.right-sidebar-header-no-drag');
 const row=await native.evaluateAll(nodes=>nodes.filter(n=>n.getBoundingClientRect().width).map(n=>({label:n.getAttribute('aria-label'),x:n.getBoundingClientRect().x,y:n.getBoundingClientRect().y,width:n.getBoundingClientRect().width,height:n.getBoundingClientRect().height})));
 const timeline=row.findIndex(n=>n.label==='Таймлайн'),checks=row.findIndex(n=>n.label==='Checks');
 assert.equal(timeline,checks+1);assert.equal(row.filter(n=>n.label==='Таймлайн').length,1);
 assert.equal(await page.locator('.pane-title-actions [data-orca-timeline-icon]').count(),0);
 report.row=row;
 for(const name of [/^Explorer/,/^Agents$/,/^Source Control/,/^Checks$/]){
   await page.getByRole('button',{name}).click();await page.locator('#orca-timeline-panel').waitFor({state:'detached'});
   assert.equal(await page.evaluate(()=>window.__sidebarEditor===document.querySelector('[contenteditable=true]')),true);
   await open();report.switches.push(String(name));
 }
 // Native collapse/reopen controls remain discoverable; chat node stays mounted.
 await page.getByRole('button',{name:'Toggle right sidebar',exact:true}).last().click();
 await page.locator('#orca-timeline-panel').waitFor({state:'detached'});
 await page.getByRole('button',{name:'Toggle right sidebar',exact:true}).last().click();
 await page.locator('#orca-timeline-panel').waitFor();
 await editor.focus();assert.equal(await editor.evaluate(n=>n===document.activeElement),true);
 await page.keyboard.type(' · продолжение');
 for(const width of [1440,1280,960]){
   await page.setViewportSize({width,height:1000});
   await page.waitForFunction(()=>document.querySelector('#orca-timeline-panel').getBoundingClientRect().width<=Math.max(280,innerWidth-640)+1);
   if(width===960){
     const box=await page.locator('#orca-timeline-panel').boundingBox();
     await page.mouse.move(box.x,box.y+400);await page.mouse.down();await page.mouse.move(400,box.y+400,{steps:12});await page.mouse.up();
   }
   const geometry=await page.evaluate(()=>{
     const panel=document.querySelector('#orca-timeline-panel'),p=panel.getBoundingClientRect(),e=document.querySelector('[contenteditable=true]').getBoundingClientRect();
     const items=[...panel.querySelectorAll('.tl-detail,.gate-actions,.details')].filter(n=>n.getBoundingClientRect().width).map(n=>({class:n.className,width:n.clientWidth,scroll:n.scrollWidth}));
     return {viewport:innerWidth,panel:{x:p.x,y:p.y,width:p.width,height:p.height},chat:{right:e.right,width:e.width},items,stages:getComputedStyle(panel.querySelector('.tl-stages')).display};
   });
   assert.ok(geometry.chat.right<=geometry.panel.x+1);assert.ok(geometry.chat.width>180);
   for(const item of geometry.items)assert.ok(item.scroll<=item.width+1,JSON.stringify(item));
   if(width>=1280)assert.notEqual(geometry.stages,'none');
   else{
     await page.getByRole('button',{name:'Этапы',exact:true}).click();await page.locator('.tl-stages').waitFor();
     await page.getByTitle('Открыть детали «Утверждение плана»',{exact:true}).click();
     await page.getByRole('button',{name:'Редакция 1',exact:true}).focus();await page.keyboard.press('Enter');
     await page.getByRole('heading',{name:'Редакция 1',exact:true}).waitFor();
     assert.equal(await page.getByRole('button',{name:'Принять план',exact:true}).count(),0);
   }
   report.sizes.push(geometry);
   await page.screenshot({path:path.join(root,'sidebar-'+width+'.png'),animations:'disabled'});
 }
 await page.setViewportSize({width:1440,height:1050});
 await page.emulateMedia({colorScheme:'dark'});await page.waitForFunction(()=>document.documentElement.classList.contains('dark'));
 await page.screenshot({path:path.join(root,'sidebar-history-dark.png'),animations:'disabled'});
 await page.setViewportSize({width:390,height:844});
 assert.equal(await toggle().count(),0);assert.equal(await page.locator('#orca-timeline-panel').count(),0);
 await page.setViewportSize({width:1440,height:1050});await page.emulateMedia({colorScheme:'light'});
 await page.locator('[data-worktree-title-inline-rename]:visible').filter({hasText:'card-empty'}).first().click();
 await toggle().click();await page.getByText('У этого пространства пока нет связанной задачи.',{exact:true}).waitFor();
 assert.equal(await page.locator('.tl-plan-text').count(),0);
 await page.locator('[data-worktree-title-inline-rename]:visible').filter({hasText:targetName}).first().click();
 await page.getByText('ТЕСТ: чат задачи',{exact:true}).last().click();await open();
 assert.match(await editor.innerText(),/продолжение/);
 // Terminal and chat use the same sidebar slot; no title-bar fallback appears.
 await page.locator('.tab-label:visible').filter({hasText:/^Terminal$/}).first().click();
 assert.equal(await toggle().count(),1);assert.equal(await page.locator('.pane-title-actions [data-orca-timeline-icon]').count(),0);
 await page.getByText('ТЕСТ: чат задачи',{exact:true}).last().click();
 assert.match(await editor.innerText(),/продолжение/);
 const sourceName=path.basename(result.sourceWorkspaceId.split('::')[1]);
 await page.locator('[data-worktree-title-inline-rename]:visible').filter({hasText:sourceName}).first().click();
 await page.getByText(sourceName+' coordinator',{exact:true}).last().click();
 await toggle().click();await page.locator('#orca-timeline-panel').waitFor();
 const scroll=await page.evaluate(()=>{
   const left=document.querySelector('#orca-timeline-panel').getBoundingClientRect().left;
   const node=[...document.querySelectorAll('*')].find(n=>{const r=n.getBoundingClientRect();return r.x>=320&&r.right<=left+1&&r.height>100&&n.scrollHeight>n.clientHeight+50&&/auto|scroll/.test(getComputedStyle(n).overflowY)});
   if(!node)return null;node.scrollTop=Math.floor((node.scrollHeight-node.clientHeight)/2);window.__sidebarScroll={node,top:node.scrollTop};return {top:node.scrollTop,range:node.scrollHeight-node.clientHeight};
 });
 assert.ok(scroll&&scroll.top>0,'Use the real, scrollable coordinator conversation');
 await page.getByRole('button',{name:/^Explorer/}).click();await toggle().click();
 assert.equal(await page.evaluate(()=>window.__sidebarScroll.node.isConnected&&window.__sidebarScroll.node.scrollTop===window.__sidebarScroll.top),true);
 report.scrollPreserved=scroll;
 report.workspaceIsolation=true;report.terminalChat=true;report.inputPreserved=true;report.phoneHidden=true;
 assert.deepEqual(report.errors,[]);report.passed=true;
 await writeFile(path.join(root,'sidebar-result.json'),JSON.stringify(report,null,2));
}catch(error){if(page){await writeFile(path.join(root,'sidebar-failure.txt'),await page.locator('body').innerText().catch(()=>''));await page.screenshot({path:path.join(root,'sidebar-failure.png'),animations:'disabled'}).catch(()=>{});}throw error;}
finally{await browser.close()}
