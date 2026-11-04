// Local fixture only: node --import tsx src/components/CeptV2/analise/ui.check.ts --serve
// Does not mount the Firebase-backed page or call any remote service.
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DetailModal, HistoryModal } from './Modals';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';

const html = renderToStaticMarkup(createElement(DetailModal, {
  ctx: { kind: 'all', title: 'Detalhe' }, records: [], canEdit: false, subtitle: '',
  onClose() {}, onOpenValidation() {}, onBatch: async () => null, requestPdf() {}, exportPdf() {},
}));
assert.ok(html.includes('Nenhum registro para os filtros selecionados.'));
assert.ok(!html.includes('Selecionar visíveis'));
const history = renderToStaticMarkup(createElement(HistoryModal, {
  rows: [], start: { level: 'general' }, onClose() {}, onCsv() {}, requestPdf() {}, exportPdf() {},
}));
assert.ok(history.includes('Histórico de modificações'));
console.log('analise/ui.check OK (SSR: empty/read-only)');

if (process.argv.includes('--serve')) {
  const { createServer, transformWithEsbuild } = await import('vite');
  const source = `
import React, {useState} from 'react';
import {createRoot} from 'react-dom/client';
import '/src/index.css';
import {buildCeptModel} from '/src/lib/cept/rules';
import {toRecords,EMPTY_FILTERS,historyRows} from '/src/components/CeptV2/analise/model';
import {DetailModal,HistoryModal,ValidationModal} from '/src/components/CeptV2/analise/Modals';
import {Matrix} from '/src/components/CeptV2/analise/Matrix';
import {ProjectBars,DeliverableBars,GroupBars,StatusCharts,ChartCard,disciplineHeight} from '/src/components/CeptV2/analise/Charts';
import {MultiFilter,DateFilterControl} from '/src/components/CeptV2/analise/Ui';
import PdfOptions from '/src/components/CeptV2/analise/PdfOptions';
const docs=[['RVT','Modelo BIM','delivered','20/08/2026'],['PDF','Prancha','delivered','10/08/2026'],['MD (DOCX)','Memorial Descritivo (Editável)','pending',''],['MD (PDF)','Memorial Descritivo','na','']].map(([sourceType,sourceLabel,status,dateRaw],i)=>({osCode:'061',projectCode:'001',disciplineCode:'ARQ',sourceRow:i+1,sourceType,sourceLabel,status,dateRaw}));
const model=await buildCeptModel(docs);
const recs=toRecords(model).map(r=>({...r,responsible:'Coordenação técnica'}));
const hist=historyRows([{id:'h1',colecao:'cept2Componentes',docId:recs[0].recordKey,campo:'dateRaw',antes:'19/08/2026',depois:'20/08/2026',userEmail:'igor.freire@example.test',at:Date.now()}],recs,r=>r.recordKey);
function App(){
const [modal,setModal]=useState(''),[pdf,setPdf]=useState(false),[filter,setFilter]=useState(false),[values,setValues]=useState([]),[date,setDate]=useState(EMPTY_FILTERS.date),[dateOpen,setDateOpen]=useState(false),[message,setMessage]=useState('');
const requestPdf=()=>setPdf(true);
const detail=(kind,value,title)=>setModal('detail');
return <main className="space-y-4 bg-[#F8F9FA] p-4 text-[#2D2D2D]">
<h1 className="text-xl font-bold">CEPT F4 · verificação local</h1><p>Dados fictícios · nenhuma conexão remota</p>
<div className="flex flex-wrap gap-3">{['detail','history','validation'].map(m=><button key={m} className="rounded border p-2" onClick={()=>setModal(m)}>{m}</button>)}<output>{message}</output></div>
<div className="grid grid-cols-2 gap-3"><MultiFilter label="Projeto" value={values} options={['001','002']} open={filter} onOpen={setFilter} onChange={setValues}/><DateFilterControl value={date} onChange={setDate} open={dateOpen} onOpen={setDateOpen}/></div>
<ChartCard id="project" title="Conclusão por projeto" onList={()=>setModal('detail')}><ProjectBars records={recs} projectName={()=>'Implantação'} onSelect={()=>setModal('detail')}/></ChartCard>
<ChartCard id="deliverable" title="Conclusão por tipo de entregável" onList={()=>setModal('detail')}><DeliverableBars records={recs} onComponent={()=>setModal('detail')} onGroup={()=>setModal('detail')}/></ChartCard>
<StatusCharts records={recs} onStatus={()=>setModal('detail')} onSeverity={()=>setModal('detail')}/>
<Matrix model={model} all={recs} filtered={recs} filters={EMPTY_FILTERS} onDetail={detail} onFamilyAlert={()=>setModal('validation')} onExport={requestPdf}/>
{modal==='detail'&&<DetailModal ctx={{kind:'all',title:'Detalhe dos entregáveis'}} records={recs} canEdit={false} subtitle="Todos" onClose={()=>setModal('')} onOpenValidation={()=>setModal('validation')} onBatch={async()=>null} requestPdf={requestPdf} exportPdf={()=>{}}/>}
{modal==='history'&&<HistoryModal rows={hist} start={{level:'general',group:{key:'',label:''}}} onClose={()=>setModal('')} onCsv={()=>setMessage('CSV')} requestPdf={requestPdf} exportPdf={()=>{}}/>}
{modal==='validation'&&<ValidationModal rec={recs.find(r=>r.sev!=='none')} canEdit={false} userEmail="teste@example.test" history={[]} onClose={()=>setModal('')} onSubmit={async()=>{throw Error('Writes disabled')}} requestPdf={requestPdf} exportPdf={()=>{}}/>}
{pdf&&<PdfOptions title="Exportar PDF local" onCancel={()=>setPdf(false)} onConfirm={()=>{setPdf(false);setMessage('PDF confirmado')}}/>}
</main>}
createRoot(document.getElementById('root')).render(<App/>);
`;
  const server = await createServer({ server: { host: '127.0.0.1', port: 2511, strictPort: true }, plugins: [{
    name: 'cept-f4-local-fixture',
    resolveId(id) { if (id === '/r1-fixture.tsx') return '\0r1-fixture.tsx'; },
    async load(id) { if (id === '\0r1-fixture.tsx') return (await transformWithEsbuild(source, 'r1-fixture.tsx', { loader: 'tsx', jsx: 'automatic' })).code; },
    configureServer(s) { s.middlewares.use(async (req, res, next) => {
      if (req.url !== '/r1-fixture') return next();
      res.setHeader('Content-Type', 'text/html');
      res.end(await s.transformIndexHtml('/r1-fixture', '<html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/r1-fixture.tsx"></script></body></html>'));
    }); },
  }] });
  await server.listen();
  console.log('Fixture: http://127.0.0.1:2511/r1-fixture');
}

// Optional browser regression; install Playwright outside this worktree and point to it.
if (process.argv.includes('--browser')) {
  if (!process.env.R1_PLAYWRIGHT || !process.env.R1_CHROME) throw new Error('Set R1_PLAYWRIGHT (module path) and R1_CHROME (executable). Start --serve separately.');
  const { chromium } = await import(pathToFileURL(process.env.R1_PLAYWRIGHT).href);
  const browser = await chromium.launch({ headless: true, executablePath: process.env.R1_CHROME });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
    const errors: string[] = [];
    page.on('pageerror', (e: Error) => errors.push(e.message));
    await page.route('**/*', (route: any) => route.request().url().startsWith('http://127.0.0.1:2511') ? route.continue() : route.abort());
    await page.goto('http://127.0.0.1:2511/r1-fixture');
    await page.locator('h1').filter({ hasText: 'CEPT F4' }).waitFor();
    await page.locator('svg [role=button]').first().waitFor();
    if (process.env.R1_PDF_OUTPUT) await page.screenshot({ path: join(process.env.R1_PDF_OUTPUT, 'ui-desktop.png'), fullPage: true });
    await page.getByRole('button', { name: 'detail', exact: true }).click();
    await page.getByRole('button', { name: 'Exportar PDF', exact: true }).click();
    assert.equal(await page.locator('dialog[open]').count(), 2);
    await page.getByRole('button', { name: 'Exportar', exact: true }).click();
    assert.equal(await page.locator('dialog[open]').count(), 1);
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('dialog[open]').count(), 0);
    await page.getByRole('button', { name: 'history', exact: true }).click();
    await page.getByRole('dialog').getByText(/^1 alterações no filtro atual/).waitFor();
    await page.getByRole('dialog').getByRole('button', { name: /\d\d\/\d\d\/2026/ }).click();
    await page.getByRole('dialog').locator('h2').filter({ hasText: 'PRJ' }).waitFor();
    await page.keyboard.press('Escape');
    await page.locator('svg [role=button]').first().focus();
    await page.keyboard.press('Enter');
    await page.getByRole('heading', { name: 'Detalhe dos entregáveis' }).waitFor();
    await page.keyboard.press('Escape');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('button', { name: 'detail', exact: true }).click();
    if (process.env.R1_PDF_OUTPUT) await page.screenshot({ path: join(process.env.R1_PDF_OUTPUT, 'ui-mobile-modal.png') });
    await page.keyboard.press('Escape');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'mobile body overflows');
    assert.deepEqual(errors, []);
    console.log('BROWSER PASS: keyboard chart, nested PDF, history, Escape, mobile 390px');
  } finally { await browser.close(); }
}
