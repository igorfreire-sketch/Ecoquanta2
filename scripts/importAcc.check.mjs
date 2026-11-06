import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import vm from 'node:vm';
import JSZip from 'jszip';

const source = readFileSync(new URL('../appsscript/ImportAcc.gs', import.meta.url), 'utf8');
const core = vm.createContext({ console });
vm.runInContext(source, core);
const digest = text => createHash('sha256').update(text).digest('hex');
const paths = process.argv.slice(2);
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
console.log(`accResumo bytes=${Buffer.byteLength(JSON.stringify({ updatedAt: '2026-11-06T00:00:00.000Z', ...summary, osVersions: versions, ultimaImportacao: { lidos: all.length, novos: 2, alterados: 0, erros: [] } }))}`);
console.log('importAcc pure checks: OK');

// Service-boundary tests: no network, mailbox, credentials, or production access.
function harness({ dry = false, fail = false, previous = null, queue = null } = {}) {
  const values = new Map(dry ? [] : [['DRY_RUN', 'false']]);
  const calls = { propertyWrites: 0, triggers: 0, commits: 0, downloads: 0, auth: 0 };
  const props = { getProperty: k => values.get(k) ?? null,
    setProperty(k, v) { calls.propertyWrites++; values.set(k, v); return props; },
    deleteProperty(k) { calls.propertyWrites++; values.delete(k); return props; } };
  const c = vm.createContext({ console: { log() {} }, PropertiesService: { getScriptProperties: () => props },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) },
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
  c.accCommit_ = (_, plans, budget) => { calls.commits++; budget.remaining -= plans.length; };
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
