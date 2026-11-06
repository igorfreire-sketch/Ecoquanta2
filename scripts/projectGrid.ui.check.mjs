const { chromium } = await import(process.env.R4_PLAYWRIGHT || '../.r4/browser-tools/node_modules/playwright/index.mjs');
import assert from 'node:assert/strict';
const browser = await chromium.launchPersistentContext('.r4/browser', { executablePath: process.env.R4_BROWSER || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless:true, viewport:{width:1600,height:1000} });
await browser.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
const page = await browser.newPage();
const pageErrors=[];
page.on('pageerror',e=>pageErrors.push(e.message));
page.on('dialog',d=>d.accept());
const url='http://127.0.0.1:2514/scripts/fixtures/project.html';
const grid=()=>page.locator('[data-cronograma-grid]');
const row=n=>grid().locator('tbody tr').nth(n);
async function dialog(name,value) { await page.getByLabel(name,{exact:true}).fill(value);await page.getByRole('button',{name:'Confirmar',exact:true}).click(); }
async function open(mode) { await page.getByRole('button',{name:mode==='note'?'Abrir nota fixture':'Abrir cronograma fixture',exact:true}).click(); await grid().waitFor(); }
try {
for (const mode of ['note','cronograma']) {
 await page.goto(url);await page.evaluate(()=>localStorage.clear());await page.reload();await open(mode);
 await row(0).locator('td').nth(8).getByRole('button').click();
 assert.equal(await page.getByRole('option',{name:'+ Criar nova nota',exact:true}).count(),mode==='note'?0:1);
 await page.getByRole('option',{name:'Nota local',exact:true}).click();
 await grid().getByRole('button',{name:'+ Coluna',exact:true}).click();await dialog('Nome da coluna','Detalhe teste');
 await grid().getByRole('columnheader',{name:'Detalhe teste',exact:true}).click({button:'right'});
 await page.getByRole('button',{name:'Renomear coluna',exact:true}).click();await dialog('Nome da coluna','Detalhe final');
 await row(0).locator('td').nth(10).locator('input').fill('Persistir detalhe');
 await grid().getByRole('button',{name:'+ Coluna',exact:true}).click();await dialog('Nome da coluna','Descartar');
 await grid().getByRole('columnheader',{name:'Descartar',exact:true}).click({button:'right'});await page.getByRole('button',{name:'Remover coluna',exact:true}).click();
 assert.equal(await grid().getByRole('columnheader',{name:'Descartar',exact:true}).count(),0);
 await grid().getByRole('button',{name:'+ Linha',exact:true}).click();assert.equal(await grid().locator('tbody tr').count(),4);
 await row(3).getByTitle('Excluir',{exact:true}).click();assert.equal(await grid().locator('tbody tr').count(),3);
 await row(1).getByTitle('Indentar (tab)',{exact:true}).click();assert.ok((await row(1).innerText()).includes('#1.2'));
 await row(0).getByTitle('Retrair',{exact:true}).click();assert.equal(await grid().locator('tbody tr').count(),2);
 await row(0).getByTitle('Expandir',{exact:true}).click();assert.equal(await grid().locator('tbody tr').count(),3);
 await row(1).getByTitle('Promover (shift+tab)',{exact:true}).click();assert.ok((await row(1).innerText()).includes('#2'));
 await row(1).getByTitle('Indentar (tab)',{exact:true}).click();
 await row(0).locator('td').nth(6).locator('select').selectOption('fixture@example.test');
 await row(0).locator('td').nth(3).locator('input').fill('2026-11-06');await row(0).locator('td').nth(4).locator('input').fill('4');
 assert.equal(await row(0).locator('td').nth(5).locator('input').inputValue(),'2026-11-10');
 await row(1).locator('td').nth(2).locator('select').selectOption('row-1');assert.equal(await row(1).locator('td').nth(3).locator('input').inputValue(),'2026-11-10');
 await row(0).locator('td').nth(1).click({button:'right'});await page.getByTitle('Azul',{exact:true}).click();
 await row(0).locator('td').nth(1).click({button:'right'});await page.getByRole('button',{name:'Hiperlink',exact:true}).click();
 await page.getByLabel('Endereço do link (URL)',{exact:true}).fill('https://example.test/project');await page.getByLabel('Texto do link',{exact:true}).fill('Referência');await page.getByRole('button',{name:'Confirmar',exact:true}).click();
 await grid().getByLabel('Filtrar por responsável',{exact:true}).selectOption('fixture@example.test');assert.equal(await grid().locator('tbody tr').count(),1);await grid().getByLabel('Filtrar por responsável',{exact:true}).selectOption('');
 const handle=grid().getByRole('columnheader',{name:'Atividade',exact:true}).locator('div').last();await handle.scrollIntoViewIfNeeded();const box=await handle.boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+70,box.y+box.height/2,{steps:6});await page.mouse.up();
 await grid().getByRole('button',{name:'Tela cheia',exact:true}).click();assert.ok(await grid().evaluate(e=>e.classList.contains('fixed')));await page.screenshot({path:`.r4/${mode}-fullscreen.png`});await grid().getByRole('button',{name:'Sair da tela cheia',exact:true}).click();
 const scroll=grid().locator('div.overflow-auto');assert.ok(await scroll.evaluate(e=>e.scrollWidth>e.clientWidth));
 await row(0).getByTitle('Retrair',{exact:true}).click();
 await page.getByRole('button',{name:mode==='note'?'Salvar Project':'Salvar',exact:true}).click();
 const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('r4-project')));assert.equal(saved.rows[0].noteId,'fixture-note');assert.equal(saved.colunasCustom[0].nome,'Detalhe final');assert.equal(saved.rows[0].custom[saved.colunasCustom[0].id],'Persistir detalhe');assert.equal(saved.rows[0].corLinha,'#DBEAFE');assert.ok(saved.rows[0].nome.includes('https://example.test/project'));assert.ok(saved.colWidths.nome>260);assert.equal(saved.rows[1].parentId,'row-1');assert.equal(saved.rows[0].colapsada,true);assert.equal(saved.rows[0].responsavelEmail,'fixture@example.test');assert.equal(saved.rows[1].predecessoraId,'row-1');assert.equal(saved.rows[1].dataInicio,'2026-11-10');
 await page.reload();await open(mode);assert.equal(await grid().locator('tbody tr').count(),2);await row(0).getByTitle('Expandir',{exact:true}).click();assert.equal(await grid().getByRole('columnheader',{name:'Detalhe final',exact:true}).count(),1);assert.equal(await row(0).locator('td').nth(10).locator('input').inputValue(),'Persistir detalhe');await page.screenshot({path:`.r4/${mode}-reopened.png`});
 if(mode==='note') { await page.getByRole('button',{name:'Fechar',exact:true}).click();await page.getByRole('button',{name:'Copiar nota fixture',exact:true}).click();assert.equal(await grid().count(),0);await page.getByRole('button',{name:'Salvar',exact:true}).click();const notes=await page.evaluate(()=>JSON.parse(localStorage.getItem('r4-notes')));assert.equal(notes.length,2);assert.equal(notes[1].projectId,undefined);assert.ok(notes[1].titulo.includes('cópia')); }
 console.log('PASS UI',mode,': columns add/rename/delete, rows add/delete, indent/outdent/collapse, responsible, predecessor/dates, colour/link, filter, resize, scroll/fullscreen, save/reopen',mode==='note'?', copy note':'');
}

for (const mode of ['note','cronograma']) {
 await page.goto(url);await page.evaluate(()=>localStorage.clear());await page.reload();await open(mode);
 await row(0).getByPlaceholder('Nome da atividade',{exact:true}).fill('Rascunho local');
 const other=await browser.newPage();await other.goto(url);
 await other.getByRole('button',{name:/Simular/}).click();await other.close();
 await page.getByRole('button',{name:mode==='note'?'Salvar Project':'Salvar',exact:true}).click();
 await page.getByText(/Seu rascunho foi preservado/).waitFor();
 assert.equal(await row(0).getByPlaceholder('Nome da atividade',{exact:true}).inputValue(),'Rascunho local');
 const stored=await page.evaluate(()=>JSON.parse(localStorage.getItem('r4-project')));
 assert.ok(stored.rows.some(r=>r.id==='external'));assert.equal(stored.rows[0].nome,'Tarefa 1');
 console.log('PASS CONCURRENCY',mode,': stale draft refused, warning visible, local draft and external rows preserved');
}

 await page.goto(url);await page.evaluate(()=>localStorage.clear());await page.reload();
 await page.getByRole('button',{name:'Novo cronograma fixture',exact:true}).click();
 assert.equal(await grid().locator('tbody tr').count(),1);
 await row(0).getByPlaceholder('Nome da atividade',{exact:true}).fill('Primeiro salvamento');
 await page.getByRole('button',{name:'Salvar',exact:true}).click();
 assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('r4-project')).rows[0].nome),'Primeiro salvamento');
 console.log('PASS CREATE: empty standalone Project starts with one row and saves first document');
 assert.deepEqual(pageErrors, []);
} finally {await browser.close();}
