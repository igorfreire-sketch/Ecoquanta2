// node --import tsx src/components/CeptV2/analise/exports.check.ts
// Optional R1_PDF_OUTPUT writes verification PDFs outside the source tree.
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { jsPDF } from 'jspdf';
import { buildCeptModel, type CeptComponenteDoc } from '../../../lib/cept/rules';
import { EMPTY_FILTERS, historyRows, toRecords } from './model';
import { exportDetailPdf, exportExecutivePdf, exportHistoryPdf, exportMatrixPdf, exportOverviewPdf, exportValidationPdf, historyCsv } from './exports';

const docs: CeptComponenteDoc[] = Array.from({ length: 80 }, (_, i) => ({
  osCode: '061', projectCode: i < 40 ? '001' : '002', disciplineCode: `D${String(i % 40).padStart(2, '0')}`,
  sourceRow: i + 1, sourceLabel: 'Modelo BIM', sourceType: 'RVT', status: i % 2 ? 'pending' : 'delivered', dateRaw: '20/08/2026',
}));
const model = await buildCeptModel(docs);
const records = toRecords(model).map((r) => ({ ...r, responsible: 'Coordenação técnica' }));
const rows = historyRows(Array.from({ length: 90 }, (_, i) => ({
  id: String(i), colecao: 'cept2Componentes', docId: records[i % records.length].recordKey, campo: 'dateRaw',
  antes: '19/08/2026', depois: '20/08/2026', userEmail: 'igor.freire@example.test', at: Date.now() - i * 1000,
})), records, (r) => r.recordKey);
const csv = historyCsv(rows);
assert.ok(csv.startsWith('\ufeff"Data / hora";"Autor";'));
assert.ok(csv.includes('\r\n')); assert.ok(csv.includes(' -> ')); assert.ok(!csv.includes('→'));
assert.ok(historyCsv([{ ...rows[0], user: '=HYPERLINK("x")' }]).includes("'=HYPERLINK"));

const captured: Array<{ name: string; pages: number; bytes: number }> = [];
const api = jsPDF.API as typeof jsPDF.API & { save: jsPDF['save'] };
const save = api.save;
api.save = function (name: string) {
  const bytes = new Uint8Array(this.output('arraybuffer'));
  captured.push({ name, pages: this.getNumberOfPages(), bytes: bytes.length });
  assert.ok(bytes.length > 1000);
  if (process.env.R1_PDF_OUTPUT) {
    mkdirSync(process.env.R1_PDF_OUTPUT, { recursive: true });
    writeFileSync(join(process.env.R1_PDF_OUTPUT, `${captured.length}-${name}`), bytes);
  }
  return this;
};
try {
  for (const orientation of ['landscape', 'portrait'] as const) {
    const opts = { orientation, format: 'a4' as const };
    exportHistoryPdf(rows, 'Histórico de modificações', opts);
    assert.ok(captured.at(-1)!.pages > 1, 'history must paginate');
    await exportExecutivePdf(records, 'Todos os filtros', '04/11/2026 10:00', opts);
    assert.equal(captured.at(-1)!.pages, 6, 'executive report must keep its six sections/pages without chart DOM');
    exportValidationPdf(records[0], [{ when: '04/11/2026 10:00', user: 'Igor', action: 'Resolvido', severity: 'Amarelo', fileDate: '20/08/2026', counterpart: '21/08/2026', reasons: 'Arquivo atualizado', observation: 'Conferido' }], opts);
    exportMatrixPdf(model, records, records, EMPTY_FILTERS, true, 'Matriz completa', '', opts);
    assert.ok(captured.at(-1)!.pages >= 4, '40 disciplines require two overview chunks and project sections');
    exportOverviewPdf('projects', [], () => 0, 'Todos', '', opts);
    assert.match(captured.at(-1)!.name, /_Projetos_Resumo\.pdf$/);
    exportDetailPdf('Detalhe', 'Filtro', 'Busca atual', records.slice(0, 3), '', opts);
  }
  assert.throws(() => exportDetailPdf('Vazio', '', '', [], ''), /Não há dados/);
  assert.throws(() => exportMatrixPdf(model, records, [], { ...EMPTY_FILTERS, project: ['999'] }, false, '', ''), /Não há dados/);
  console.log('analise/exports.check OK', JSON.stringify(captured));
} finally { api.save = save; }
