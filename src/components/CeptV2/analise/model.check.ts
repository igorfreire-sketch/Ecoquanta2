// Uso: npx tsx src/components/CeptV2/analise/model.check.ts
import assert from 'node:assert/strict';
import { buildCeptModel, type CeptComponenteDoc } from '../../../lib/cept/rules';
import {
  applyFilters, contextRecords, dateFilterValid, deliverableKey, EMPTY_FILTERS, familyView, feedPage, kpis, parseDigitsDate,
  sortRows, statusPercentText, toRecords, detailSearch, type HistRow,
  matrixModel, historyRows, validationHistory, applyChip,
} from './model';

const doc = (p: string, d: string, label: string, type: string, row: number, status: CeptComponenteDoc['status'], dateRaw = ''): CeptComponenteDoc =>
  ({ osCode: '061', projectCode: p, disciplineCode: d, sourceLabel: label, sourceType: type, sourceRow: row, status, dateRaw });
const docs = [
  doc('001', 'ARQ', 'Modelo BIM', 'RVT', 1, 'delivered', '20/08/2026'),
  doc('001', 'ARQ', 'Prancha', 'PDF', 2, 'delivered', '10/08/2026'), // antes do corte -> amarelo
  doc('001', 'ARQ', 'Memorial Descritivo (Editável)', 'MD (DOCX)', 3, 'pending'),
  doc('001', 'ARQ', 'Memorial Descritivo', 'MD (PDF)', 4, 'na'),
  doc('002', 'ELET', 'Modelo BIM', 'RVT', 1, 'pending'),
  doc('002', 'ELET', 'Memorial de Cálculo', 'MC (PDF)', 5, 'delivered', '05/09/2026'),
];
const model = await buildCeptModel(docs);
const recs = toRecords(model);

// KPIs (E §5.1): conclusao so delivered+pending; alertas = V+A
const k = kpis(recs);
assert.deepEqual([k.delivered, k.pending, k.applicable, k.percent, k.projects, k.disciplines], [3, 2, 5, 60, 2, 2]);
assert.equal(k.yellow, 1);

// Chave de entregavel (E §3.4)
const byType = (t: string) => recs.find((r) => r.sourceType === t)!;
assert.equal(deliverableKey(byType('RVT'), model.familyCatalog), 'PRJ_EDIT');
assert.equal(deliverableKey(byType('MD (DOCX)'), model.familyCatalog), 'MD_EDIT');
assert.equal(byType('MC (PDF)').chartKey, 'MC_PDF');

// Data (E §3.3): 6/8 digitos, data real; between invertido = inativo
assert.equal(parseDigitsDate('150926'), '2026-09-15');
assert.equal(parseDigitsDate('31022026'), null);
assert.equal(parseDigitsDate('1509'), null);
assert.equal(dateFilterValid({ mode: 'between', from: '2026-09-10', to: '2026-09-01' }), false);
// sem dateIso sai com filtro ativo
const until = applyFilters(recs, { ...EMPTY_FILTERS, date: { mode: 'until', from: '2026-08-31', to: '' } });
assert.deepEqual(until.map((r) => r.sourceType).sort(), ['PDF', 'RVT']);
assert.equal(applyFilters(recs, { ...EMPTY_FILTERS, date: { mode: 'after', from: '2026-08-20', to: '' } }).length, 1); // > estrito

// Filtro de alerta tira N/A; natureza unknown sai com qualquer natureza (B12)
assert.ok(applyFilters(recs, { ...EMPTY_FILTERS, alert: ['none'] }).every((r) => r.status !== 'na'));

// Contextos e ordenacao (B1: data cronologica; status rank pending primeiro)
assert.equal(contextRecords(recs, { kind: 'applicable', title: '' }).length, 5);
assert.equal(sortRows(recs, 'status', 1)[0].status, 'pending');
assert.deepEqual(sortRows(recs.filter((r) => r.dateIso), 'date', 1).map((r) => r.dateIso), ['2026-08-10', '2026-08-20', '2026-09-05']);
assert.equal(detailSearch(recs, 'calculo').length, 1); // B3: sem acento

// Familia multi: parcial = fracao, todos entregues = data mais recente
const arq = recs.filter((r) => r.projectCode === '001' && r.family === 'MD');
assert.equal(familyView('MD', 'MD', arq).status, 'pending');
const two = [{ ...byType('RVT'), status: 'delivered' as const }, { ...byType('PDF'), family: 'RVT' }];
assert.equal(familyView('RVT', '', two).date, '20/08');

// % do donut: inteiro se diferenca < 0,05
assert.equal(statusPercentText(1, 3), '33,3%');
assert.equal(statusPercentText(1, 2), '50%');

// Feed agrupado: por grupo = floor(30/n), paginas = maior ceil
const h = (i: number, d: string): HistRow => ({ id: String(i), ms: 1000 - i, discipline: d } as HistRow);
const rows = [...Array.from({ length: 40 }, (_, i) => h(i, 'ARQ')), h(99, 'ELET')];
const fp = feedPage(rows, 'discipline', 30, 0);
assert.equal(fp.pages, 3); // 15 por grupo -> ARQ 40/15
assert.deepEqual(fp.blocks.map((b) => [b.label, b.rows.length]), [['ARQ', 15], ['ELET', 1]]);

// Every drill-down is a subset of the active universe; no context leaks other projects.
const contexts = [
  ['all', '', 6], ['clientDeliverables', '', 6], ['status', 'pending', 2], ['alerts', '', 1],
  ['alertSeverity', 'yellow', 1], ['applicable', '', 5], ['project', '001', 4], ['projectParent', '002', 2],
  ['deliverable', 'PRJ_EDIT', 2], ['deliverableComponent', 'MC_PDF', 1], ['deliverableGroup', 'MD', 2],
  ['family', '001|ARQ|MD', 2], ['familyAlerts', '001|ARQ|PDF', 1], ['discipline', 'ELET', 2], ['responsible', 'no-match', 0],
] as const;
for (const [kind, value, expected] of contexts) assert.equal(contextRecords(recs, { kind, value, title: '' }).length, expected, kind);
const filteredProject = applyFilters(recs, { ...EMPTY_FILTERS, project: ['002'] });
assert.deepEqual(matrixModel(model, recs, filteredProject, { ...EMPTY_FILTERS, project: ['002'] }).projects.map((p) => p.code), ['002']);
assert.ok(applyChip(recs, 'yellow').every((r) => r.sev === 'yellow'));
const unknown = { ...recs[0], status: 'unknown' as const, projectCode: '999', disciplineCode: 'NONE' };
assert.deepEqual([kpis([...recs, unknown]).projects, kpis([...recs, unknown]).disciplines], [2, 2]);
const log = historyRows([{ id: 'edit', colecao: 'cept2Componentes', docId: recs[0].recordKey, campo: 'dateRaw', antes: '', depois: '20/08/2026', userEmail: 'igor.freire@example.test', at: 1000 }], recs, (r) => r.recordKey);
assert.equal(log[0].famGroup, 'PRJ');
assert.match(log[0].change, /20\/08\/2026/);
assert.deepEqual(validationHistory([], recs[0].recordKey), []);

console.log('analise/model.check OK');
