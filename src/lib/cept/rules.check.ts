// Uso: npx tsx src/lib/cept/rules.check.ts "<pasta com os 3 xlsx do CEPT>"
// Sem a pasta roda so os casos unitarios (fixtures ficam SKIPPED, nunca "OK").
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import JSZip from 'jszip';
import {
  applyResponsibilities, buildCeptModel, buildResponsibilityMap, classifyDeliverable, cleanOwnerName,
  dateDiffDaysIso, determineSheetStatus, diasUteis, mapResponsibilityDiscipline, normalizeProjectCode,
  parseDateInfo, planValidationBatch, sha256Hex, allComponents,
  type CeptComponenteDoc, type CeptLodKey, type CeptValidacaoDoc,
} from './rules';

// ---------- unitarios (sem fixture) ----------
assert.equal(await sha256Hex('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
assert.deepEqual(classifyDeliverable('Memorial de Cálculo (Editável)', 'MC (DOCX/XLSX)'), { family: 'MC', familyLabel: 'Memorial de Cálculo', format: 'DOCX/XLSX', editable: true, variantLabel: 'Editável' });
assert.equal(classifyDeliverable('Prancha', 'PDF').family, 'PDF');
assert.equal(classifyDeliverable('Outro', 'PDF').family, 'PDF'); // cai no else: tipo sem parentese
assert.equal(classifyDeliverable('X', 'ZIP (ABC)').editable, null);
assert.equal(classifyDeliverable('Modelo OpenBIM', 'IFC').editable, false);
assert.equal(determineSheetStatus(null, '', true, false), 'unknown');
assert.equal(determineSheetStatus(null, '', false, true), 'na');
assert.equal(determineSheetStatus(null, '-', false, true), 'na');
assert.equal(determineSheetStatus(null, 'VERDADEIRO', false, false), 'delivered');
assert.deepEqual(parseDateInfo('05/06'), { short: '05/06', full: '05/06', iso: '' }); // P5: sem ano nao alerta
assert.equal(parseDateInfo('5/6/26').iso, '2026-06-05');
assert.equal(parseDateInfo('31/02/2026').iso, '');
assert.equal(dateDiffDaysIso('2026-08-31', '2026-09-11'), 11);
assert.equal(normalizeProjectCode('4'), '004');
assert.deepEqual(mapResponsibilityDiscipline('Hidrossanitário'), ['HIDA', 'ESG']);
assert.deepEqual(mapResponsibilityDiscipline('*Drenagem'), ['DREN']);
assert.deepEqual(mapResponsibilityDiscipline('Logica, automação e CFTV'), ['TELE']);
assert.deepEqual(mapResponsibilityDiscipline('Iluminação de projeção'), ['LUM']);
assert.deepEqual(mapResponsibilityDiscipline('TODAS'), ['__ALL__']);
assert.equal(cleanOwnerName('  yan   mob '), 'YAN / MOB');
assert.equal(diasUteis({ '100': 10, '200': 17, '300': 15, '350': 21, '400': 15 }, ['100', '200']), 51);
assert.equal(diasUteis({}, []), 0);
assert.equal(diasUteis({ '100': 5 }, null), null);
{
  // responsavel: coringa, linha especifica prevalece, conflito, hidraulica
  const { map, audit } = buildResponsibilityMap([
    { projectCode: '009', disciplinaTexto: 'TODAS', modo: 'Terceirizado', terceirizado: 'Rio Ramp', sourceRow: 3 },
    { projectCode: '009', disciplinaTexto: 'ARQ', modo: 'Quanta', terceirizado: '', sourceRow: 4 },
    { projectCode: '002', disciplinaTexto: 'Hidrossanitário', modo: 'Terceirizado', terceirizado: 'yan mob', sourceRow: 5 },
    { projectCode: '002', disciplinaTexto: 'ESGOTO', modo: 'Quanta', terceirizado: '', sourceRow: 6 },
    { projectCode: '002', disciplinaTexto: 'PCI', modo: 'Terceirizado', terceirizado: '', sourceRow: 7 },
  ]);
  assert.equal(map['009'].__ALL__.responsible, 'Rio Ramp');
  assert.equal(map['002'].ESG.responsible, 'YAN / MOB'); // conflito vira 'nao identificado' e a regra hidraulica sobrescreve com HIDA (CEPT:1199-1236)
  assert.equal(map['002'].DREN.responsible, 'YAN / MOB'); // herdou HIDA
  assert.equal(map['002'].PCI.kind, 'unidentified');
  assert.equal(audit.conflicts.length, 2);
  const projects = [{ code: '009', name: '', deliverableTypes: [], disciplines: {
    ARQ: { code: 'ARQ', responsible: '', responsibleKind: '' as const, responsibilitySource: '', items: { RVT: { status: 'delivered' } as never } },
    SOM: { code: 'SOM', responsible: '', responsibleKind: '' as const, responsibilitySource: '', items: { RVT: { status: 'delivered' } as never } },
  } }];
  applyResponsibilities(projects, map);
  assert.equal(projects[0].disciplines.ARQ.responsible, 'Equipe interna - Arquitetura');
  assert.equal(projects[0].disciplines.SOM.responsible, 'Rio Ramp');
}
{
  const doc = (sourceType: string, label: string, dateRaw: string, row: number): CeptComponenteDoc =>
    ({ osCode: '061', projectCode: '001', disciplineCode: 'URB', sourceLabel: label, sourceType, sourceRow: row, status: 'delivered', dateRaw });
  const model = await buildCeptModel([doc('MD (PDF)', 'Memorial Descritivo', '11/09/2026', 1), doc('MD (DOCX)', 'Memorial Descritivo (Editável)', '15/09/2026', 2), doc('RVT', 'Modelo BIM', '20/09/2026', 3)]);
  const pdf = model.byRecordKey.get('001|URB|MD|MD (PDF)')!;
  assert.equal(pdf.alert.autoSeverity, 'red');
  const base = { userEmail: 'Tarcisio.Marques@quantaconsultoria.com', validators: ['tarcisio.marques@quantaconsultoria.com'], live: model.byRecordKey, batchId: 'BATCH-x' };
  const item = { projectCode: '001', discipline: 'URB', family: 'MD', sourceType: 'MD (PDF)', signature: pdf.signature };
  const ok = planValidationBatch({ ...base, action: 'resolved', items: [item], observation: ' obs ' });
  assert.equal(ok.savedCount, 1);
  assert.equal(ok.rows[0].counterpartDates, '15/09/2026');
  assert.equal(ok.rows[0].observation, 'obs');
  assert.equal(planValidationBatch({ ...base, action: 'REOPENED', items: [{ ...item, signature: 'x' }] }).staleCount, 1);
  const rvt = model.byRecordKey.get('001|URB|RVT|RVT')!;
  assert.equal(planValidationBatch({ ...base, action: 'RESOLVED', items: [{ ...item, family: 'RVT', sourceType: 'RVT', signature: rvt.signature }] }).skippedCount, 1);
  assert.throws(() => planValidationBatch({ ...base, userEmail: 'outro@quantaconsultoria.com', action: 'RESOLVED', items: [item] }), /permissão/);
  assert.throws(() => planValidationBatch({ ...base, action: 'DELETE', items: [item] }), /inválida/);
  assert.throws(() => planValidationBatch({ ...base, action: 'RESOLVED', items: Array(501).fill(item) }), /500/);
  assert.throws(() => planValidationBatch({ ...base, action: 'RESOLVED', items: [{ ...item, recordKey: 'a|b|c|d' }] }), /inconsistente/);
}
console.log('cept rules (unit): OK');

// ---------- leitor xlsx minimo (export do Google Sheets) ----------
type Cell = { v: string | number | boolean | null; display: string; f: string | null; fmt: string };
const decode = (s: string) => s.replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
const colIndex = (letters: string) => [...letters].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);
const serialToDate = (serial: number) => new Date(Math.round((serial - 25569) * 86400000));
const ddmmyyyy = (d: Date) => `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`;

async function readXlsx(path: string) {
  const zip = await JSZip.loadAsync(readFileSync(path));
  const text = (p: string) => zip.file(p)?.async('string') ?? Promise.resolve('');
  const shared = [...(await text('xl/sharedStrings.xml')).matchAll(/<si>([\s\S]*?)<\/si>/g)]
    .map((m) => [...m[1].matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((t) => decode(t[1])).join(''));
  const styles = await text('xl/styles.xml');
  const numFmts = new Map([...styles.matchAll(/<numFmt numFmtId="(\d+)" formatCode="([^"]*)"/g)].map((m) => [m[1], decode(m[2])]));
  const xfs = [...(styles.match(/<cellXfs[^>]*>([\s\S]*?)<\/cellXfs>/)?.[1] || '').matchAll(/<xf\b[^>]*>/g)]
    .map((m) => { const id = m[0].match(/numFmtId="(\d+)"/)?.[1] || '0'; return numFmts.get(id) || (id === '14' ? 'dd/mm/yyyy' : id === '10' ? '0.00%' : ''); });
  const wb = await text('xl/workbook.xml');
  const rels = await text('xl/_rels/workbook.xml.rels');
  const sheets: Record<string, { cells: Map<string, Cell>; merges: Array<[number, number, number, number]>; maxRow: number }> = {};
  for (const m of wb.matchAll(/<sheet [^>]*name="([^"]+)"[^>]*r:id="([^"]+)"/g)) {
    const target = rels.match(new RegExp(`Id="${m[2]}"[^>]*Target="([^"]+)"`))?.[1] || rels.match(new RegExp(`Target="([^"]+)"[^>]*Id="${m[2]}"`))?.[1];
    const xml = await text('xl/' + String(target).replace(/^\/?xl\//, ''));
    const cells = new Map<string, Cell>();
    const sharedF = new Map<string, string>();
    let maxRow = 0;
    for (const c of xml.matchAll(/<c r="([A-Z]+)(\d+)"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = c[3];
      const inner = c[4] || '';
      const t = attrs.match(/\bt="(\w+)"/)?.[1] || 'n';
      const fmt = xfs[Number(attrs.match(/\bs="(\d+)"/)?.[1] || 0)] || '';
      const vRaw = inner.match(/<v>([\s\S]*?)<\/v>/)?.[1];
      const fTag = inner.match(/<f([^>]*)(?:\/>|>([\s\S]*?)<\/f>)/);
      let f: string | null = null;
      if (fTag) {
        const si = fTag[1].match(/si="(\d+)"/)?.[1];
        f = fTag[2] ? decode(fTag[2]) : sharedF.get(String(si)) || '?';
        if (si && fTag[2]) sharedF.set(si, f);
      }
      let v: Cell['v'] = null;
      let display = '';
      if (t === 's' && vRaw !== undefined) { v = shared[Number(vRaw)]; display = v; }
      else if (t === 'b' && vRaw !== undefined) { v = vRaw === '1'; display = v ? 'TRUE' : 'FALSE'; }
      else if ((t === 'str' || t === 'inlineStr') && (vRaw !== undefined || inner.includes('<t'))) { v = decode(vRaw ?? inner.match(/<t[^>]*>([\s\S]*?)<\/t>/)?.[1] ?? ''); display = v; }
      else if (vRaw !== undefined) {
        v = Number(vRaw);
        display = /^0+#$/.test(fmt) ? String(v).padStart(fmt.length, '0')
          : /[dy]/i.test(fmt) && !/%/.test(fmt) ? ddmmyyyy(serialToDate(v)) : String(v);
      }
      if (v !== null || f) maxRow = Math.max(maxRow, Number(c[2]));
      cells.set(c[1] + c[2], { v, display, f, fmt });
    }
    const merges = [...xml.matchAll(/<mergeCell ref="([A-Z]+)(\d+):([A-Z]+)(\d+)"/g)]
      .map((mm) => [Number(mm[2]), colIndex(mm[1]), Number(mm[4]), colIndex(mm[3])] as [number, number, number, number]);
    sheets[decode(m[1])] = { cells, merges, maxRow };
  }
  return sheets;
}
const colLetters = (n: number) => { let s = ''; for (; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s; return s; };

// ---------- fixtures ----------
const dir = process.argv[2] || process.env.CEPT_FIXTURES_DIR || '';
const fx = (name: string) => join(dir, name);
if (!dir || !existsSync(fx('CEPT - Acompanhamento de entregáveis.xlsx'))) {
  console.log('cept fixtures: SKIPPED (passe a pasta dos 3 xlsx como argumento)');
  process.exit(0);
}

// Entregaveis V2 -> docs (mesma leitura de CEPT:243-547, hasCheckbox=false: o export perdeu a DV)
const ent = Object.values(await readXlsx(fx('CEPT - Acompanhamento de entregáveis.xlsx')))[0];
const at = (col: number, row: number) => ent.cells.get(colLetters(col) + row);
const isMerged = (row: number, col: number) => ent.merges.some(([r1, c1, r2, c2]) => row >= r1 && row <= r2 && col >= c1 && col <= c2);
const projectCols: Array<{ code: string; statusCol: number }> = [];
for (let col = 4; col < 40; col++) {
  const code = String(at(col, 1)?.display || '').trim().match(/^\s*(\d{3})\s*[-–—]/)?.[1];
  if (code && /DATA ENTREGA/.test(String(at(col + 1, 1)?.display || '').toUpperCase())) { projectCols.push({ code, statusCol: col }); col++; }
}
assert.equal(projectCols.length, 9);
const docs: CeptComponenteDoc[] = [];
let discipline = '';
for (let row = 2; row <= ent.maxRow; row++) {
  const a = String(at(1, row)?.display || '').trim();
  if (a) discipline = a.toUpperCase() === 'ELE' ? 'ELET' : a.toUpperCase();
  const sourceType = String(at(3, row)?.display || '').trim();
  if (!discipline || !sourceType) continue;
  for (const p of projectCols) {
    const cell = at(p.statusCol, row);
    docs.push({
      osCode: '061', projectCode: p.code, disciplineCode: discipline, sourceLabel: String(at(2, row)?.display || '').trim(), sourceType,
      sourceRow: row, status: determineSheetStatus(cell?.v ?? null, cell?.display ?? '', false, isMerged(row, p.statusCol)),
      dateRaw: String(at(p.statusCol + 1, row)?.display || ''),
    });
  }
}
// T2
const statusCount = (s: string) => docs.filter((d) => d.status === s).length;
assert.equal(docs.length, 1926, 'T2 celulas');
assert.deepEqual([statusCount('delivered'), statusCount('pending'), statusCount('na'), statusCount('unknown')], [727, 15, 1184, 0], 'T2 status');

// Validacoes -> docs (tipos corrigidos, T6)
const val = Object.values(await readXlsx(fx('CEPT - Alertas e Validações.xlsx')))[0];
const vcell = (col: string, row: number) => val.cells.get(col + row);
const validations: CeptValidacaoDoc[] = [];
for (let row = 2; row <= val.maxRow; row++) {
  const s = (col: string) => String(vcell(col, row)?.v ?? '').trim();
  validations.push({
    osCode: '061', at: serialToDate(Number(vcell('A', row)?.v)), usuarioEmail: s('B'), action: s('C') as CeptValidacaoDoc['action'],
    projectCode: normalizeProjectCode(s('D')), disciplineCode: s('E'), family: s('F'), sourceType: s('G'), format: s('H'), nature: s('I'),
    signature: s('J'), severity: s('K'), reasons: s('L'), fileDate: vcell('M', row)?.display || '', counterpartDates: vcell('N', row)?.display || '',
    observation: s('O'), appVersion: '3.2.3', batchId: s('Q'), recordKey: '',
  });
}
assert.equal(validations.length, 41);
assert.equal(validations[0].projectCode, '002');
assert.ok(validations.every((v) => /^[0-9a-f]{64}$/.test(v.signature)));
assert.ok(validations.every((v, i) => i === 0 || (v.at as Date) >= (validations[i - 1].at as Date)), 'validacoes fora de ordem cronologica');

const model = await buildCeptModel(docs, validations);
assert.ok(allComponents(model.projects).every((c) => !['TOPO', 'TSD'].includes(c.disciplineCode) || c.projectCode === '001'), 'TOPO/TSD fora de 001');
const allLive = [...model.byRecordKey.values()];

// T1 - B §A8: 21 componentes, 5 vermelhos, 16 amarelos, mesmas celulas e assinaturas
const expectedA8: Record<string, [string, string]> = {
  '001|APS|RVT': ['yellow', '5e6d6176741d'], '001|APS|IFC': ['yellow', 'bf32a0778395'], '001|TERR|IFC': ['yellow', '1ea1c6dda17d'],
  '001|URB|MD (PDF)': ['red', '73118413cfa3'], '001|VPAV|IFC': ['yellow', '5b3a9007551c'], '002|IMPE|IFC': ['yellow', '6938217c5856'],
  '002|PCI|PDF': ['yellow', '9e2cd495a598'], '002|PCI|RVT': ['yellow', 'f7e719ba392d'], '002|PCI|IFC': ['yellow', '5e96fb616ec2'],
  '002|SCO|MD (DOCX)': ['yellow', 'bbcaca9a3fcf'], '003|AVAC|ET/RT (PDF)': ['yellow', '9f75e73131e5'], '003|EREN|ET/RT (PDF)': ['red', '2eb0fdb6c603'],
  '003|PCI|PDF': ['yellow', 'bed880f3e0fa'], '003|PCI|RVT': ['yellow', '000c5af99047'], '003|PCI|IFC': ['yellow', '450e15a96931'],
  '004|PCI|PDF': ['yellow', 'afd114d75873'], '004|PCI|MC (PDF)': ['red', 'ef8b45347a8f'], '007|SOM|ET/RT (PDF)': ['yellow', 'fba5f924d60e'],
  '008|AVAC|MD (DOCX)': ['yellow', '9d7efea924cf'], '008|SPDA|MC (PDF)': ['red', '1f882c8d73fa'], '008|SPDA|MD (PDF)': ['red', 'f9085958619b'],
};
const alerted = allLive.filter((c) => c.alert.autoSeverity !== 'none');
const red = alerted.filter((c) => c.alert.autoSeverity === 'red').length;
console.log(`T1: ${alerted.length} alertas (${red} vermelhos, ${alerted.length - red} amarelos)`);
assert.equal(alerted.length, 21, 'T1 total');
assert.equal(red, 5, 'T1 vermelhos');
const got = Object.fromEntries(alerted.map((c) => [`${c.projectCode}|${c.disciplineCode}|${c.sourceType}`, [c.alert.autoSeverity, c.signature.slice(0, 12)]]));
assert.deepEqual(got, expectedA8, 'T1 celulas/severidade/assinatura = B §A8');

// T3 - assinatura recalculada x coluna J: 14 de 41; verdes = os 12 "sim" de B §A8
const liveSigs = new Set(allLive.map((c) => c.signature));
const matched = validations.filter((v) => liveSigs.has(v.signature)).length;
const greens = allLive.filter((c) => c.alert.displaySeverity === 'green').map((c) => `${c.projectCode}|${c.disciplineCode}|${c.sourceType}`).sort();
console.log(`T3: ${matched} de ${validations.length} assinaturas batem; ${greens.length} verdes`);
assert.equal(matched, 14, 'T3 assinaturas');
assert.deepEqual(greens, ['001|APS|IFC', '001|APS|RVT', '001|TERR|IFC', '001|URB|MD (PDF)', '001|VPAV|IFC', '002|IMPE|IFC', '002|SCO|MD (DOCX)',
  '003|AVAC|ET/RT (PDF)', '003|EREN|ET/RT (PDF)', '007|SOM|ET/RT (PDF)', '008|AVAC|MD (DOCX)', '008|SPDA|MD (PDF)'], 'T3 verdes');
assert.deepEqual(model.counts, { red: 2, yellow: 7, green: 12, none: allLive.length - 21, active: 9 });

// T4 - Planilha1 coluna I: 62 formulas = cache; T5 linhas sem formula = vazio
const planilha = (await readXlsx(fx('CEPT.xlsx')))['Planilha1'];
const lodCols: Record<CeptLodKey, string> = { '100': 'J', '200': 'K', '300': 'L', '350': 'M', '400': 'N', final: 'O' };
let formulas = 0;
const mismatches: string[] = [];
for (let row = 3; row <= 113; row++) {
  const i = planilha.cells.get('I' + row);
  const lod = Object.fromEntries(Object.entries(lodCols).map(([k, col]) => {
    const v = planilha.cells.get(col + row)?.v;
    return [k, typeof v === 'number' ? v : null];
  })) as Record<CeptLodKey, number | null>;
  // migracao: a formula vira a flag (D §1.1)
  const flag = !i?.f ? null : /-J\d+-K\d+$/.test(i.f.replace(/\s/g, '')) ? ['100', '200'] : [];
  if (i?.f) {
    formulas++;
    assert.match(i.f, /^SUM\(J\d+:O\d+\)(-J\d+-K\d+)?$/, `formula inesperada I${row}`);
    if (diasUteis(lod, flag) !== i.v) mismatches.push(`I${row}: ${diasUteis(lod, flag)} != ${i.v}`);
  } else {
    assert.equal(diasUteis(lod, flag), null, `T5 I${row}`);
    assert.ok(i?.v == null || i.v === '', `T5 I${row} tem valor sem formula`);
  }
}
console.log(`T4: ${formulas} formulas, ${mismatches.length} divergencias`);
assert.equal(formulas, 62, 'T4 qtd formulas');
assert.deepEqual(mismatches, [], 'T4 divergencias');
assert.equal(planilha.cells.get('I101')?.v, 51);
assert.equal(planilha.cells.get('I113')?.v, 0);

// Responsaveis sobre a Planilha1 real (informativo + invariantes)
const respRows: Parameters<typeof buildResponsibilityMap>[0] = [];
let proj = '';
for (let row = 3; row <= planilha.maxRow; row++) {
  const a = planilha.cells.get('A' + row)?.display || '';
  if (a.trim()) proj = normalizeProjectCode(a);
  respRows.push({ projectCode: proj, disciplinaTexto: String(planilha.cells.get('C' + row)?.v ?? ''), modo: String(planilha.cells.get('E' + row)?.v ?? '') || null, terceirizado: String(planilha.cells.get('G' + row)?.v ?? ''), sourceRow: row });
}
const resp = buildResponsibilityMap(respRows);
applyResponsibilities(model.projects, resp.map);
const unidentified = model.projects.flatMap((p) => Object.values(p.disciplines)).filter((d) => d.responsibleKind === 'unidentified').length;
console.log(`responsaveis: ${resp.audit.mappedRows}/${resp.audit.sourceRows} linhas mapeadas, ${resp.audit.ignoredRows.length} ignoradas, ${resp.audit.conflicts.length} conflitos, ${unidentified} disciplinas sem responsavel`);
assert.ok(model.projects.every((p) => Object.values(p.disciplines).every((d) => d.responsible)), 'disciplina ativa sem rotulo de responsavel');
console.log('cept fixtures: OK');
