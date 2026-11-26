import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {execFileSync} from 'node:child_process';

const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const directory=path.resolve(process.env.ORCA_TIMELINE_DISPOSABLE || 'timeline/.local/e2e');
const instance=JSON.parse(await readFile(path.join(directory,'instance.json'),'utf8'));
const fixtures=JSON.parse(await readFile(path.join(directory,'fixtures.json'),'utf8'));
assert.equal(instance.runtime,path.join(directory,'runtime'),'Only the disposable runtime is used');
assert.equal(instance.profile,path.join(directory,'profile'),'Only the disposable profile is used');
test('paired Web preserves the workspace while opening its own timeline panel', async () => {
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('ORCA_')));
  env.ORCA_USER_DATA_PATH = instance.profile;
  env.ORCA_INSTANCE_ID = 'timeline-disposable-' + instance.port;
  const launch = JSON.parse(execFileSync(path.join(instance.runtime,'bin/orca-ide'),[
    'agent','launch','--agent','codex','--surface','chat','--worktree','name:card-a','--focus','--json',
  ],{env,encoding:'utf8'}));
  assert.equal(launch.result?.outcome?.kind,'structured','Open a Codex chat without sending a message');
  const browser = await chromium.launch({headless:true});
  try {
    const page = await browser.newPage({viewport:{width:1370,height:900}});
    page.on('pageerror', error => console.error(error.message));
    const onboarding = page.locator('[data-slot="dialog-overlay"][data-state="open"]').first();
    await page.addLocatorHandler(onboarding, async () => {
      const dialog = page.locator('[role="dialog"][data-state="open"]').last();
      for (const name of ['Got it','Close','Skip']) {
        const button = dialog.getByRole('button',{name,exact:true});
        if (await button.isVisible()) { await button.click(); return; }
      }
      await page.keyboard.press('Escape');
    });
    const base = 'http://127.0.0.1:' + instance.port + '/';
    const log = await readFile(path.join(directory,'server.log'),'utf8');
    const invitation = log.match(/Web client URL: (.+?)$/m)?.[1]?.trim();
    assert.ok(invitation?.startsWith(base));
    await page.goto(invitation);
    const select = card => page.getByText(card.displayName,{exact:true}).first().click();
    const [a,b] = fixtures.cards;
    const button = page.getByRole('button',{name:'Таймлайн',exact:true});
    const panel = page.getByRole('complementary',{name:'Таймлайн задачи'});
    await select(a);
    const draft = 'Черновик для проверки таймлайна';
    const composer = page.locator('[contenteditable="true"]').first();
    await composer.fill(draft);
    const toolbar = page.locator('.pane-title-bar[data-chromeless][data-active-pane] .pane-title-actions');
    await toolbar.getByRole('button',{name:'Таймлайн',exact:true}).waitFor({timeout:5000});
    assert.equal(await button.locator('svg').count(),1);
    assert.equal(await button.innerText(),'');
    assert.equal(await button.getAttribute('title'),'Таймлайн');
    const iconBox = await button.boundingBox();
    const settingsBox = await toolbar.getByRole('button',{name:'Chat settings',exact:true}).boundingBox();
    assert.ok(Math.abs((iconBox.y + iconBox.height / 2) - (settingsBox.y + settingsBox.height / 2)) <= 1);
    assert.ok(iconBox.x + iconBox.width <= settingsBox.x);
    const workbench = page.locator('[data-orca-timeline-workbench]');
    await workbench.evaluate(node => { node.dataset.beforeTimeline = 'preserved'; });
    await button.click();
    const launches = panel.getByRole('combobox');
    await launches.locator('option').nth(1).waitFor({state:'attached'});
    await launches.selectOption({label:'Задача A (run_fixture_shared)'});
    const review = panel.locator('[data-id="review"]');
    await review.locator('.tl-bar').first().waitFor();
    assert.equal(await panel.locator('.tl-row').count(),8);
    assert.equal(await review.locator('.tl-bar').count(),2);
    assert.equal(await review.locator('.tl-bar[data-failed=true]').count(),1);
    await review.locator('summary').click();
    await review.getByText('Повторное ревью A',{exact:false}).waitFor();
    assert.equal(await workbench.getAttribute('data-before-timeline'),'preserved');
    assert.equal(await composer.innerText(),draft);
    assert.equal(await page.locator('dialog.orca-timeline').count(),0);
    await panel.getByRole('button',{name:'Закрыть'}).click();
    await panel.waitFor({state:'detached'});
    assert.equal(await workbench.getAttribute('data-before-timeline'),'preserved');
    assert.equal(await composer.innerText(),draft);
    await select(b);
    await button.click();
    await panel.locator('.tl-bar').waitFor();
    assert.equal(await launches.isVisible(),false);
    await page.setViewportSize({width:390,height:800});
    await button.waitFor({state:'hidden'});
    await panel.waitFor({state:'hidden'});
  } finally {
    await browser.close();
  }
});
