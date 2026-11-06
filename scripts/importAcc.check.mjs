import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import vm from 'node:vm';
import JSZip from 'jszip';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const source = readFileSync(new URL('../appsscript/ImportAcc.gs', import.meta.url), 'utf8');
const core = vm.createContext({ console });
vm.runInContext(source, core);
const digest = text => createHash('sha256').update(text).digest('hex');
const paths = process.argv.slice(2);
if (process.env.REQUIRE_SAMPLES === '1') {
  assert.equal(paths.length, 2, 'REQUIRE_SAMPLES=1 requires both real sample paths');
  for (const path of paths) assert(existsSync(path), `Required sample absent: ${path}`);
}
if (!paths.length) console.log('SKIP real samples: pass OS061.xlsx OS068.xlsx paths (files are never copied into the repository).');
const all = [];
for (const [index, path] of paths.entries()) {
  if (!existsSync(path)) { console.log(`SKIP absent sample: ${path}`); continue; }
  const start = performance.now();
  const zip = await JSZip.loadAsync(readFileSync(path));
  const files = {};
  for (const name of Object.keys(zip.files).filter(n => /^xl\/(sharedStrings\.xml|worksheets\/sheet\d+\.xml)$/.test(n))) files[name] = await zip.file(name).async('string');
  const parsed = core.accParse_(files);
  // The generic OS061 filename needs the OS from its email subject in production.
  const fallback = index === 0 ? 'MRK - OS061 - was shared with you' : path;
  const normalized = core.accNormalize_(parsed, fallback, {});
  assert.equal(parsed.rows.length, index === 0 ? 1298 : 125);
  assert.equal(normalized.errors.length, 0, JSON.stringify(normalized.errors.slice(0, 5)));
  assert.equal(normalized.issues.length, parsed.rows.length);
  assert.equal(parsed.avisos.length, 0, 'verified categories must not generate warnings');
  if (index === 0) {
    assert(normalized.issues.some(r => r.empresa === 'BLR Engenharia'));
    // This assignment belongs to non-Quality rows, deliberately filtered early.
    const text = Array.from(files['xl/sharedStrings.xml'].matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g), m => core.accTexts_(m[1])).find(s => s.startsWith('Yan Botelho\nMOB'));
    assert(text); const yan = core.accSplit_(text);
    assert.equal(yan.pessoa, 'Yan Botelho'); assert.match(yan.cargo, /^MOB/);
  } else {
    const raw = parsed.rows.find(r => r.linha === 29);
    const r = normalized.issues.find(r => r.id === raw.id);
    assert.equal(r.key, '068-#28'); assert.equal(r.setor, 'ARQ'); assert.equal(r.status, 'Fechado');
    assert.equal(r.pessoa, ''); assert.equal(r.cargo, 'Architect');
  }
  const pairs = parsed.rows.filter(r => r.fechadoEm && r.atualizadoEm).map(r => ({ linha: r.linha,
    delta: Date.parse(core.accDate_(r.fechadoEm, true)) - Date.parse(core.accDate_(r.atualizadoEm, true)) }));
  const sameEvent = pairs.filter(p => Math.abs(p.delta - 10800000) < 1000);
  assert(sameEvent.length > 0);
  // Updates after closure are different events; do not use them to infer offsets.
  console.log(JSON.stringify({ sample: index + 1, quality: normalized.issues.length, rows: parsed.total,
    jsonBytes: Buffer.byteLength(JSON.stringify(normalized.issues)), parseMs: +(performance.now() - start).toFixed(1),
    timezone: { closedAsUTC: true, otherDatesOffset: '-03:00', paired: pairs.length, sameEventPlus3h: sameEvent.length,
      examples: sameEvent.slice(0, 3), otherEvents: pairs.length - sameEvent.length }, unknownSectors: normalized.setoresDesconhecidos }));
  all.push(...normalized.issues);
  const invalid = { ...parsed.rows[0], status: 'unexpected' };
  assert.equal(core.accNormalize_({ rows: [invalid] }, fallback, {}).errors.length, 1);
}
for (const pair of core.ACC_STATUS) {
  assert.equal(pair.length, 2);
  for (const label of pair) {
    const row = { id: '#1', status: label, posicionamento: 'OS001_P01_ARQ_file.rvt', empresa: '', atribuido: '', criadoPor: '', fechadoPor: '' };
    assert.equal(core.accNormalize_({ rows: [row] }, '', {}).issues[0].status, pair[1]);
  }
}
const inline = { 'xl/worksheets/sheet1.xml': '<sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Title &amp; test</t></is></c></row></sheetData>' };
assert.equal(core.accCells_(inline['xl/worksheets/sheet1.xml'], {})['A'], 'Title & test');
assert.equal(core.accTexts_('<t>A</t><r><t>B</t></r>'), 'AB');
const unicode = '😀á'.repeat(350000);
assert.equal(core.accChunk_(unicode).join(''), unicode);
assert(core.accChunk_(unicode).every(s => Buffer.byteLength(s) <= 900000));
assert.equal(core.accBytes_(unicode), Buffer.byteLength(unicode));
assert.equal(core.accHash_('same', digest), digest('same'));
const summary = core.accSummary_(all);
assert.equal(Object.values(summary.totais).reduce((a, b) => a + b, 0), all.length);
const versions = Object.fromEntries([...new Set(all.map(r => r.os))].map(os => [os, digest(JSON.stringify(all.filter(r => r.os === os)))]));
console.log(`accResumo bytes=${Buffer.byteLength(JSON.stringify({ updatedAt: '2026-11-06T00:00:00.000Z', ...summary, osVersions: versions, ultimaImportacao: { lidos: all.length, novos: 2, alterados: 0, erros: [], avisos: [] } }))}`);
console.log('importAcc pure checks: OK');
assert(!/LockService/.test(source), 'ACC must never acquire the email grouper script lock');
assert(!/accEdicoes/i.test(source), 'importer must not read or write user overlays');

// Service-boundary tests: no network, mailbox, credentials, or production access.
function harness({ dry = false, fail = false, previous = null, queue = null } = {}) {
  const values = new Map(dry ? [] : [['DRY_RUN', 'false']]);
  const calls = { propertyWrites: 0, propertyBatches: 0, triggers: 0, commits: 0, downloads: 0, auth: 0, plans: [] };
  const props = { getProperty: k => values.get(k) ?? null,
    setProperty(k, v) { calls.propertyWrites++; values.set(k, v); return props; },
    setProperties(updates) { calls.propertyBatches++; calls.propertyWrites++; for (const [k,v] of Object.entries(updates)) values.set(k,v); return props; },
    deleteProperty(k) { calls.propertyWrites++; values.delete(k); return props; } };
  const c = vm.createContext({ console: { log() {} }, PropertiesService: { getScriptProperties: () => props },
    LockService: { getScriptLock: () => { throw Error('Never take the shared email grouper lock'); } },
    ScriptApp: { getProjectTriggers: () => [], newTrigger: () => ({ timeBased: () => ({ after: () => ({ create() { calls.triggers++; } }) }) }) },
    UrlFetchApp: { fetch: () => ({ getResponseCode: () => 200, getContentText: () => '{}' }) } });
  vm.runInContext(source, c);
  const item = { id: 'synthetic-message', link: 'synthetic-link', os: 'OS001', date: '2026-11-06T00:00:00.000Z', attempts: 0 };
  c.accDiscover_ = () => ({ items: [item, { ...item }], next: 0, query: 'synthetic' });
  c.accAuth_ = () => { calls.auth++; return { root: 'unused' }; };
  c.buscarDownloadAutodesk_ = () => { calls.downloads++; if (fail) throw Error('synthetic download failure'); return { resposta: {
    getResponseCode: () => 200, getBlob: () => ({}), getHeaders: () => ({}) } }; };
  c.accUnzip_ = () => ({});
  c.accParse_ = () => ({ rows: [{ id: '#1', linha: 2, status: 'Open', posicionamento: 'OS001_P01_ARQ.pdf', empresa: '', atribuido: '', criadoPor: '', fechadoPor: '' }] });
  c.accDigest_ = digest;
  c.accRead_ = (_, path) => path === 'accOs/001' ? previous : null;
  c.accCommit_ = (_, plans, budget) => {
    assert(plans.every(p => /^(accOs|accResumo)\//.test(p.path)), 'no writes to other collections');
    calls.commits++; calls.plans.push(...plans); budget.remaining -= plans.length;
  };
  if (queue) c.accQueueSave_(props, queue);
  return { c, props, calls, item };
}
{
  const h = harness({ dry: true });
  const r = h.c.accTesteSimulacao();
  assert.equal(r.files.length, 1); // Duplicate links and the same OS version are skipped.
  assert.equal(h.calls.downloads, 1);
  assert.equal(h.calls.propertyWrites, 0); assert.equal(h.calls.triggers, 0);
  assert.equal(h.calls.commits, 0); assert.equal(h.calls.auth, 0);
}
{
  const h = harness();
  const r = h.c.accImportarDiario();
  assert.equal(r.novos, 1); assert.equal(h.calls.commits, 1);
  assert.equal(h.calls.downloads, 1); assert.equal(h.c.accQueueRead_(h.props).length, 0);
}
{
  const h = harness({ dry: true });
  const row = h.c.accNormalize_(h.c.accParse_(), 'OS001', {}).issues;
  const previous = { hash: digest(JSON.stringify(row)), sourceFile: { date: h.item.date } };
  const unchanged = harness({ previous }); unchanged.c.accImportarDiario();
  assert.equal(unchanged.calls.commits, 0, 'unchanged hash must not write');
  const newer = harness({ previous: { hash: 'different', sourceFile: { date: '2027-01-01' } } });
  newer.c.accCargaHistorica(); assert.equal(newer.calls.commits, 0, 'old mail cannot replace newer data');
}
{
  const h = harness({ fail: true });
  h.c.accImportarDiario(); assert.equal(h.c.accQueueRead_(h.props)[0].attempts, 1);
  h.c.accContinuar_(); assert.equal(h.c.accQueueRead_(h.props)[0].attempts, 2);
  h.c.accContinuar_();
  // Two independently discovered items each exhaust three attempts.
  for (let i = 0; i < 3; i++) h.c.accContinuar_();
  assert.equal(h.c.accQueueRead_(h.props).length, 0);
  assert.equal(h.calls.commits, 0);
  const longQueue = Array.from({ length: 50 }, (_, i) => ({ ...h.item, id: String(i), link: 'x'.repeat(2000) }));
  h.c.accQueueSave_(h.props, longQueue);
  assert.equal(h.c.accQueueRead_(h.props).length, 50);
}
{
  const plan = core.accPlan_('accOs/001', { json: unicode, hash: 'test', os: '001', updatedAt: 'test' }, { chunkCount: 20 });
  const pointer = plan.find(p => p.path === 'accOs/001').data;
  assert(pointer.chunked);
  const reconstructed = JSON.parse(plan.filter(p => p.data?.value).map(p => p.data.value).join(''));
  assert.equal(reconstructed.json, unicode);
  assert.equal(plan.filter(p => p.remove).length, 20 - pointer.chunkCount);
  const h = harness();
  assert.throws(() => core.accCommit_({}, [{ path: 'x', data: {} }], { remaining: 0 }), /Limite/);
  const missingOS = h.c.accNormalize_({ rows: [{ ...h.c.accParse_().rows[0], posicionamento: '' }] }, '', {});
  assert.equal(missingOS.errors.length, 1);
}
console.log('importAcc service boundary checks: OK (dry-run, deduplication, unchanged hash, latest wins, retries, queue, chunks, write cap)');

// Audit regressions: fixtures cross the same Apps Script boundaries as production.
{
  const h = harness();
  h.c.accQueueSave_(h.props, [h.item]);
  const owner = JSON.stringify({ timestamp: Date.now(), token: 'another-ACC-run' });
  h.props.setProperty('ACC_RUNNING', owner);
  const result = h.c.accContinuar_();
  assert.equal(result.busy, true); assert.equal(h.calls.auth, 0);
  assert.equal(h.calls.triggers, 1, 'busy one-shot continuation must reschedule');
  assert.equal(h.props.getProperty('ACC_RUNNING'), owner, 'busy invocation cannot release the other owner');
  h.props.setProperty('ACC_RUNNING', JSON.stringify({ timestamp: Date.now() - 600001, token: 'expired' }));
  h.c.accContinuar_();
  assert.equal(h.calls.commits, 1, 'expired lease must allow recovery');
  assert.equal(h.props.getProperty('ACC_RUNNING'), null);
}
for (const boundary of ['auth', 'summary', 'registry', 'status']) {
  const h = harness();
  h.c.accQueueSave_(h.props, [h.item]);
  if (boundary === 'auth') h.c.accAuth_ = () => { throw Error('injected auth failure'); };
  if (boundary === 'summary') h.c.accRead_ = () => { throw Error('injected summary failure'); };
  if (boundary === 'registry') h.c.UrlFetchApp.fetch = () => ({ getResponseCode: () => 503 });
  if (boundary === 'status') {
    const setProperty = h.props.setProperty;
    h.props.setProperty = (k, v) => { if (k === 'ACC_LAST') throw Error('injected status failure'); return setProperty(k, v); };
    h.c.buscarDownloadAutodesk_ = () => { throw Error('injected download failure'); };
  }
  assert.throws(() => h.c.accContinuar_(), /failure|503/);
  assert(h.c.accQueueRead_(h.props).length, `${boundary}: queue must survive`);
  assert.equal(h.calls.triggers, 1, `${boundary}: finally must restore continuation`);
  assert.equal(h.props.getProperty('ACC_RUNNING'), null);
}
{
  const h = harness({ dry: true });
  h.props.setProperty('ACC_RUNNING', JSON.stringify({ timestamp: Date.now() }));
  const before = h.calls.propertyWrites;
  h.c.accTesteSimulacao();
  assert.equal(h.calls.propertyWrites, before); assert.equal(h.calls.triggers, 0);
}
{
  const h = harness();
  h.props.setProperty('original-email-grouper', 'preserve');
  const before = h.calls.propertyBatches;
  h.c.accQueueSave_(h.props, Array.from({length: 20}, (_, i) => ({...h.item, id: String(i), link: 'x'.repeat(3000)})));
  assert.equal(h.calls.propertyBatches - before, 1, 'queue parts use one setProperties call');
  assert.equal(h.props.getProperty('original-email-grouper'), 'preserve');
  assert.equal(h.c.accQueueRead_(h.props).length, 20);
}
{
  const props = { getProperty: () => null };
  let query;
  core.PropertiesService = { getScriptProperties: () => props };
  core.GmailApp = { search: q => { query = q; return []; } };
  core.accDiscover_('daily', null, Date.now() + 1000);
  assert.match(query, /subject:MRK/); assert.match(query, /was shared with you/); assert.match(query, /newer_than:2d/);
}
const headers = ['ID','Title','Status','Category','Type','Description','Assigned to','Company','Watchers','Created by','Created on','Due date','Placement','Updated on','Closed by','Closed at','Comments'];
const escapeXml = text => String(text).replaceAll('&', '&amp;').replaceAll('<', '&lt;');
function xmlRow(line, values) {
  return `<row r="${line}">${values.map((v,i) => `<c r="${String.fromCharCode(65+i)}${line}" t="inlineStr"><is><t>${escapeXml(v)}</t></is></c>`).join('')}</row>`;
}
const sheet = rows => ({ 'xl/worksheets/sheet1.xml': `<sheetData>${xmlRow(1, headers)}${rows}</sheetData>` });
function sampleRow(id = '#1', category = 'Quality', status = 'Open') {
  return [id, 'Synthetic title', status, category, 'Drawing', '', 'Architect', '', '', 'Person (Removed)\nCompany', '', '', 'OS001_P01_ARQ.pdf', '', '', '', ''];
}
{
  const parsed = core.accParse_(sheet('<row r="2"/>' + xmlRow(3, sampleRow())));
  assert.equal(parsed.rows.length, 1); assert.equal(parsed.rows[0].linha, 3, 'self-closing row cannot consume the next row');
  const normalized = core.accNormalize_(parsed, '', {});
  assert.equal(normalized.issues[0].criadoPor, 'Person');
  const missingHeader = sheet(xmlRow(2, sampleRow()));
  missingHeader['xl/worksheets/sheet1.xml'] = missingHeader['xl/worksheets/sheet1.xml'].replace('<t>Status</t>', '<t>Missing status</t>');
  assert.throws(() => core.accParse_(missingHeader), /Coluna ausente: status/);
}
for (const category of ['Design', 'Unexpected category', '__proto__']) {
  const parsed = core.accParse_(sheet(xmlRow(2, sampleRow('#1', category))));
  assert.equal(parsed.rows.length, 0);
  assert(parsed.avisos.some(w => /sem linhas Quality/.test(w.aviso)));
  if (category !== 'Design') assert(parsed.avisos.some(w => /Categoria desconhecida/.test(w.aviso)));
  const h = harness(); h.c.accParse_ = () => parsed;
  const report = h.c.accImportarDiario();
  assert(report.avisos.length);
  assert(h.calls.plans.every(p => p.path.startsWith('accResumo/')), 'zero Quality must preserve existing OS');
  assert(h.calls.plans.find(p => p.path === 'accResumo/atual').data.ultimaImportacao.avisos.length);
}
{
  const parsed = core.accParse_(sheet(xmlRow(2, sampleRow('#1')) + xmlRow(3, sampleRow('#2', 'Quality', 'unexpected'))));
  const h = harness(); h.c.accParse_ = () => parsed;
  const report = h.c.accImportarDiario();
  assert(report.erros.some(e => e.linha === 3));
  const data = h.calls.plans.find(p => p.path === 'accOs/001').data;
  assert.equal(JSON.parse(data.json).length, 1); assert.equal(JSON.parse(data.json)[0].key, '001-#1');
  assert(h.calls.plans.find(p => p.path === 'accResumo/atual').data.ultimaImportacao.erros.some(e => e.linha === 3));
}
{
  const h = harness(); h.c.accParse_ = () => { throw Error('Coluna ausente: status'); };
  const report = h.c.accImportarDiario();
  assert(report.erros.some(e => /Coluna ausente/.test(e.erro)));
  assert.equal(h.calls.commits, 0, 'required header failure rejects the file');
  assert.equal(h.calls.triggers, 1);
}
{
  let contentType = '', unzipCalls = 0;
  const entry = (name, value = '') => ({ getName: () => name, getDataAsString: () => value });
  core.Utilities = { unzip: blob => { unzipCalls++; assert.equal(contentType, 'application/zip'); return [
    entry('[Content_Types].xml','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml'),
    entry('xl/workbook.xml'), entry('xl/worksheets/sheet1.xml', '<sheetData/>') ]; } };
  const blob = { getBytes: () => [80,75,3,4], setContentType(value) { contentType = value; return this; } };
  assert(core.accUnzip_(blob)['xl/worksheets/sheet1.xml']); assert.equal(unzipCalls, 1);
  assert.throws(() => core.accUnzip_({ getBytes: () => [60,104,116,109,108] }), /link Autodesk pode ter expirado/);
  core.Utilities.unzip = () => { throw Error('bad archive'); };
  assert.throws(() => core.accUnzip_(blob), /link Autodesk pode ter expirado/);
  core.Utilities.unzip = () => [entry('word/document.xml')];
  assert.throws(() => core.accUnzip_(blob), /link Autodesk pode ter expirado/);
}
if (!process.env.ACC_CHECK_CHILD) {
  for (const args of [[], ['missing-sample-one.xlsx', 'missing-sample-two.xlsx']]) {
    const result = spawnSync(process.execPath, [fileURLToPath(import.meta.url), ...args], { env: { ...process.env, REQUIRE_SAMPLES: '1', ACC_CHECK_CHILD: '1' }, encoding: 'utf8' });
    assert.notEqual(result.status, 0, 'REQUIRE_SAMPLES must fail for omitted or absent samples');
    assert.match(result.stderr, /requires both real sample paths|Required sample absent/);
  }
}
console.log('importAcc audit checks: OK (ACC lease, busy recovery, finally recovery, categories, partial rows, headers, ZIP, removed authors, required samples, batched properties)');
