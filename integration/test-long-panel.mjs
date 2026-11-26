import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
const root=process.env.ORCA_INTEGRATION_ROOT;
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE);
const instance=JSON.parse(await readFile(path.join(root,'instance/instance.json')));
const browser=await chromium.launchPersistentContext(path.join(root,'instance/browser'),{headless:true,executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH,viewport:{width:1440,height:1050}});
const report={sizes:[]};let page;
try{
 page=await browser.newPage();for(const old of browser.pages())if(old!==page)await old.close();page.setDefaultTimeout(30000);
 await page.goto('http://127.0.0.1:'+instance.port+'/web-index.html',{waitUntil:'domcontentloaded'});
 await page.locator('[data-worktree-title-inline-rename]:visible').filter({hasText:'card-a'}).first().click();
 await page.getByRole('button',{name:'Таймлайн',exact:true}).click();
 await page.getByRole('combobox',{name:'Связанный запуск и задача',exact:true}).selectOption({label:'Реализация A (run_fixture_shared)'});
 await page.locator('.tl-plan-text').filter({hasText:'Синтетический длинный план'}).waitFor();
 for(const width of [1440,960]){
   await page.setViewportSize({width,height:1000});
   await page.waitForFunction(()=>document.querySelector('#orca-timeline-panel').getBoundingClientRect().width<=Math.max(280,innerWidth-640)+1);
   const footer=page.getByRole('button',{name:'Принять план',exact:true});
   const rect=await footer.boundingBox();assert.ok(rect&&rect.y>=0&&rect.y+rect.height<=1000,'Long plan decision stays in viewport');
   if(!await page.getByRole('textbox',{name:'Комментарий к редакции'}).isVisible())await page.getByRole('button',{name:'Вернуть с комментарием',exact:true}).click();
   await page.getByRole('textbox',{name:'Комментарий к редакции'}).fill('Черновик проверки длинного плана');
   const commentRect=await page.getByRole('textbox',{name:'Комментарий к редакции'}).boundingBox();
   assert.ok(commentRect.y+commentRect.height<=1000);
   if(width===960)await page.getByRole('button',{name:'Этапы',exact:true}).click();
   const scale=await page.locator('.gantt-axis span').evaluateAll(nodes=>nodes.map(n=>({text:n.textContent,x:n.getBoundingClientRect().x,right:n.getBoundingClientRect().right,height:n.getBoundingClientRect().height})));
   assert.match(scale.at(-1).text,/ч/);for(let i=1;i<scale.length;i++)assert.ok(scale[i].x>scale[i-1].right);
   assert.equal(await page.locator('.gantt-row').filter({hasText:'Приёмка'}).locator('.g-wait-live').count(),0);
   report.sizes.push({width,scale,footer:rect,comment:commentRect});
   await page.screenshot({path:path.join(root,'long-history-'+width+'.png'),animations:'disabled'});
   if(width===960){await page.getByTitle('Открыть детали «Утверждение плана»',{exact:true}).click();await footer.waitFor();}
 }
 report.passed=true;report.foreignPendingExcluded=true;report.longPlanDecisionsVisible=true;
 await writeFile(path.join(root,'long-panel-result.json'),JSON.stringify(report,null,2));
}catch(error){if(page)await page.screenshot({path:path.join(root,'long-panel-failure.png'),animations:'disabled'}).catch(()=>{});throw error;}
finally{await browser.close()}
