import assert from 'node:assert/strict';
const { chromium } = await import(process.env.R4_PLAYWRIGHT || '../.r4/browser-tools/node_modules/playwright/index.mjs');
const browser = await chromium.launch({ executablePath: process.env.R4_BROWSER || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
await context.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
const page = await context.newPage();
page.setDefaultNavigationTimeout(180000); // First Vite transform of the real editor is large.
const errors = [];
page.on('pageerror', e => errors.push(e.message));
let accept = false, confirmations = 0;
page.on('dialog', async d => { confirmations++; await (accept ? d.accept() : d.dismiss()); });
const url = process.env.R4_FIXTURE_URL || 'http://127.0.0.1:2514/scripts/fixtures/project.html';
const activity = () => page.locator('[data-cronograma-grid]').getByPlaceholder('Nome da atividade', { exact: true }).first();
async function reset() {
  accept = true;
  await page.goto(url); await page.evaluate(() => localStorage.clear()); await page.reload();
  await page.getByRole('button', { name: 'Abrir nota fixture', exact: true }).click();
  await activity().waitFor(); accept = false; confirmations = 0;
  await activity().fill('Project ainda não salvo');
}
// Fixture buttons live behind the fullscreen editor, just like parent-driven
// App navigation/keyboard actions. Invoke their real React handlers.
const navigate = name => page.getByRole('button', { name, exact: true }).evaluate(button => button.click());
try {
  if (!process.env.R4_NAV_CASE || process.env.R4_NAV_CASE === 'tabs') {
    await reset();
    await navigate('Abrir cronograma fixture');
    assert.equal(confirmations, 1, 'App tab switch must confirm before unmounting a dirty Project');
    assert.equal(await activity().inputValue(), 'Project ainda não salvo', 'declining tab switch preserves the draft');
    await navigate('Trocar subaba fixture');
    assert.equal(confirmations, 2, 'App sub-tab switch must also confirm');
    assert.equal(await activity().inputValue(), 'Project ainda não salvo');
    accept = true; await navigate('Trocar subaba fixture');
    assert.equal(confirmations, 3);
    assert.equal(await page.locator('[data-cronograma-grid]').count(), 0, 'accepted navigation unmounts the editor');
    await navigate('Trocar subaba fixture'); await activity().waitFor();
    assert.equal(await activity().inputValue(), 'Tarefa 1', 'confirmed discard does not resurrect the draft');
    accept = false; confirmations = 0;
    await navigate('Abrir cronograma fixture');
    assert.equal(confirmations, 0, 'clean navigation must not prompt');
    await activity().waitFor();
    console.log('PASS navigation: tab/sub-tab cancel preserves draft, accept discards, clean navigation has no prompt');
  }
  if (!process.env.R4_NAV_CASE || process.env.R4_NAV_CASE === 'controlled') {
    await reset();
    await navigate('Abrir outra nota fixture');
    assert.equal(confirmations, 1);
    assert.equal(await activity().inputValue(), 'Project ainda não salvo');
    assert.equal(await page.getByLabel('Nota controlada').innerText(), 'fixture-note', 'cancelled controlled open must restore the parent selection');
    await navigate('Abrir outra nota fixture');
    assert.equal(confirmations, 2, 'a rejected request can be retried');
    accept = true; await navigate('Abrir outra nota fixture');
    assert.equal(await page.getByLabel('Nota controlada').innerText(), 'fixture-note-2');
    assert.equal(await activity().inputValue(), 'Tarefa 1');
    console.log('PASS controlled note: cancel rolls parent back; retry and accept open the requested note');
  }
  assert.deepEqual(errors, []);
} finally { await browser.close(); }
