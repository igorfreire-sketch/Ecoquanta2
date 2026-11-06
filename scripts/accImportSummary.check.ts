import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import JSZip from 'jszip';
import { resumoRows, filterAccIssues, issueWeight, type AccResumo } from '../src/lib/accData';
const core = vm.createContext({});
vm.runInContext(readFileSync(new URL('../appsscript/ImportAcc.gs', import.meta.url), 'utf8'), core);
function check(issues: any[], label: string) {
  const summary = JSON.parse(JSON.stringify(core.accSummary_(issues)));
  const resumo: AccResumo = { ...summary, osVersions: Object.fromEntries(issues.map(issue => [issue.os, 'test-hash'])) };
  const rows = resumoRows(resumo);
  assert.equal(rows.reduce((sum, row) => sum + issueWeight(row), 0), issues.length, label);
  for (const os of Object.keys(resumo.osVersions)) assert.equal(filterAccIssues(rows, { os }, new Set()).reduce((sum, row) => sum + issueWeight(row), 0), issues.filter(issue => issue.os === os).length);
  console.log(`accImportSummary: ${label} OK (${issues.length} issues, ${rows.length} cruzamentos)`);
  return rows;
}
const rows = [
  { id: '#1', titulo: 'Synthetic one', status: 'Open', posicionamento: 'OS061_P01_ARQ_model.rvt', criadoEm: '2026-11-06T12:00:00-03:00', empresa: 'Synthetic company' },
  { id: '#2', titulo: 'Synthetic two', status: 'Closed', posicionamento: 'OS061_P01_ELET_model.pdf', criadoEm: '2026-11-07T12:00:00-03:00', empresa: '' },
  { id: '#3', titulo: 'Synthetic three', status: 'Pending', posicionamento: 'OS068_P01_UNKNOWN_model.rvt', criadoEm: '2026-10-06T12:00:00-03:00', empresa: '' },
].map(row => ({ ...row, atribuido: '', seguidores: '', criadoPor: '', atualizadoEm: '', vencimento: '', fechadoPor: '', fechadoEm: '', descricao: '', comentarios: '' }));
const normalized = core.accNormalize_({ rows }, '', {});
assert.equal(normalized.errors.length, 0);
check(normalized.issues, 'synthetic XLSX-free real normalize -> summary -> screen');
for (const [index, path] of process.argv.slice(2).entries()) {
  const zip = await JSZip.loadAsync(readFileSync(path));
  const files: Record<string, string> = {};
  for (const name of Object.keys(zip.files).filter(name => /^xl\/(sharedStrings\.xml|worksheets\/sheet\d+\.xml)$/.test(name))) files[name] = await zip.file(name)!.async('string');
  const parsed = core.accParse_(files);
  const real = core.accNormalize_(parsed, index === 0 ? 'OS061' : 'OS068', {});
  assert.equal(real.errors.length, 0);
  check(real.issues, `real sample ${index + 1}`);
}
