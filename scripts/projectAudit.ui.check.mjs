const { chromium } = await import(process.env.R4_PLAYWRIGHT || '../.r4/browser-tools/node_modules/playwright/index.mjs');
import assert from 'node:assert/strict';
const context = await chromium.launchPersistentContext('.r4/audit-browser', { executablePath: process.env.R4_BROWSER || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless:true, viewport:{width:1600,height:1000} });
await context.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
const page = await context.newPage();
const fixtureUrl = process.env.R4_FIXTURE_URL || 'http://127.0.0.1:2514/scripts/fixtures/project.html';
const errors=[];page.on('pageerror', e=>errors.push(e.message));
let accept=false;let confirmations=0;
page.on('dialog', async d=>{confirmations++; await (accept?d.accept():d.dismiss());});
const grid=()=>page.locator('[data-cronograma-grid]');
const name=()=>grid().getByPlaceholder('Nome da atividade',{exact:true}).first();
async function reset() { accept=true; await page.goto(fixtureUrl);await page.evaluate(()=>localStorage.clear());await page.reload(); confirmations=0;accept=false; }
async function open() {await page.getByRole('button',{name:'Abrir nota fixture',exact:true}).click();await name().waitFor();}
const which=process.env.R4_AUDIT_CASE;
try {
 if(!which || which==='D1') {
  await reset();await open();await name().fill('Rascunho D1');
  await page.getByRole('button',{name:'Fechar',exact:true}).click();
  assert.equal(confirmations,1,'D1: closing a dirty Project must request confirmation');
  assert.equal(await name().inputValue(),'Rascunho D1','D1: cancel close preserves draft');
  await page.getByRole('button',{name:'Desvincular',exact:true}).click();
  assert.equal(confirmations,2,'D1: unlink must confirm');assert.equal(await name().inputValue(),'Rascunho D1');
  await page.getByRole('button',{name:'Trocar',exact:true}).click();
  await page.getByRole('button',{name:/Outro Project/}).click();
  assert.equal(confirmations,3,'D1: changing/relinking Project must confirm');assert.equal(await name().inputValue(),'Rascunho D1');
  await page.getByRole('dialog',{name:'Vincular Project'}).locator('xpath=..').click({position:{x:2,y:2}});
  // Parent-controlled navigation without unmounting the editor must also be guarded.
  await page.getByRole('button',{name:'Abrir outra nota fixture',exact:true}).evaluate(b=>b.click());
  assert.equal(confirmations,4,'D1: changing note must confirm');assert.equal(await name().inputValue(),'Rascunho D1');
  accept=true;await page.getByRole('button',{name:'Fechar',exact:true}).click();await open();
  assert.equal(await name().inputValue(),'Tarefa 1','D1: confirmed discard must clear the draft on reopen');
  assert.equal(await page.getByText('Project com alterações não salvas.',{exact:true}).count(),0);
  await name().fill('Descartar na troca de nota');
  await page.getByRole('button',{name:'Abrir outra nota fixture',exact:true}).evaluate(b=>b.click());
  assert.equal(await name().inputValue(),'Tarefa 1','D1: the next note must not inherit the previous draft');
  await name().fill('Descartar ao trocar Project');
  await page.getByRole('button',{name:'Trocar',exact:true}).click();
  await page.getByRole('button',{name:/Outro Project/}).click();
  await name().waitFor();
  assert.equal(await page.getByText('Project com alterações não salvas.',{exact:true}).count(),0);
  await page.getByRole('button',{name:'Trocar',exact:true}).click();
  await page.getByRole('dialog').getByRole('button',{name:/Project local/}).click();
  assert.equal(await name().inputValue(),'Tarefa 1','D1: switching back must not resurrect discarded edits');
  await name().fill('Descartar ao desvincular');await page.getByRole('button',{name:'Desvincular',exact:true}).click();
  assert.equal(await grid().count(),0);
  await page.getByRole('button',{name:'Configuração',exact:true}).click();
  await page.getByRole('button',{name:'+ Project',exact:true}).click();
  await page.getByRole('dialog').getByRole('button',{name:/Project local/}).click();
  assert.equal(await name().inputValue(),'Tarefa 1','D1: unlink and relink must start with a clean snapshot');
  console.log('PASS D1: cancel/confirm close, switch/unlink Project, note switch and draft cleanup');
 }
 if(!which || which==='D2') {
  await reset();await open();await name().fill('Salvar tudo D2');
  await page.getByRole('button',{name:'Salvar',exact:true}).click();
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('r4-project')||'null')?.rows[0].nome),'Salvar tudo D2','D2: note Save must persist the Project');
  assert.equal(await page.getByText('Project com alterações não salvas.',{exact:true}).count(),0);
  await name().fill('Conflito D2');
  const other=await context.newPage();await other.goto(fixtureUrl);await other.getByRole('button',{name:/Simular/}).click();await other.close();
  const before=await page.evaluate(()=>localStorage.getItem('r4-notes'));
  await page.getByRole('button',{name:'Salvar',exact:true}).click();
  await page.getByRole('alert').filter({hasText:/rascunho foi preservado/}).first().waitFor();
  assert.equal(await name().inputValue(),'Conflito D2');assert.equal(await page.evaluate(()=>localStorage.getItem('r4-notes')),before,'D2: no false successful note save after Project conflict');
  assert.equal(await page.getByText('Project com alterações não salvas.',{exact:true}).count(),1);
  console.log('PASS D2: note Save persists Project; conflict remains visible and draft stays dirty');
 }
 if(!which || which==='D4') {
  await reset();
  // An external save while the App cache remains deliberately stale.
  const other=await context.newPage();await other.goto(fixtureUrl);
  await other.getByRole('button',{name:'Abrir cronograma fixture',exact:true}).click();
  await other.locator('[data-cronograma-grid]').getByPlaceholder('Nome da atividade',{exact:true}).first().fill('Salvo pelo Cronograma');
  await other.getByRole('button',{name:'Salvar',exact:true}).click();await other.close();
  await open();
  assert.equal(await name().inputValue(),'Salvo pelo Cronograma','D4: opening a note must fetch the fresh Project');
  await name().fill('Nota sobre versão atual');await page.getByRole('button',{name:'Salvar Project',exact:true}).click();
  assert.equal(await page.getByRole('alert').count(),0,'D4: no false conflict after fresh open');
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('r4-project')).rows[0].nome),'Nota sobre versão atual');
  // Same-window cache notification from the actual Cronogramas component.
  await page.getByRole('button',{name:'Fechar',exact:true}).click();
  await page.getByRole('button',{name:'Tela Cronogramas fixture',exact:true}).click();
  await page.getByRole('button',{name:/Project local/}).first().click();
  await name().fill('Notificar cache D4');await page.getByRole('button',{name:'Salvar',exact:true}).click();
  assert.equal(await page.getByLabel('Atualizações do cache').innerText(),'1','D4: Cronogramas must notify the shared cache after a successful checked save');
  await page.getByRole('button',{name:'Fechar',exact:true}).click();
  await page.getByRole('button',{name:'Abrir nota fixture',exact:true}).click();
  assert.equal(await name().inputValue(),'Notificar cache D4');
  await name().fill('Preservar rascunho D4');
  await page.getByRole('button',{name:/Simular/}).evaluate(b=>b.click());
  assert.equal(await name().inputValue(),'Preservar rascunho D4','D4: live cache refresh must not replace a dirty draft');
  console.log('PASS D4: fresh Project loaded from storage when opening note after Cronograma save');
 }
 assert.deepEqual(errors,[]);
} finally {await context.close();}
