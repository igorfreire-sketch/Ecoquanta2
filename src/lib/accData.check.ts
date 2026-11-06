import assert from 'node:assert/strict';
import fixture from '../../scripts/fixtures/accOs';
import { countBy, filterAccIssues, loadAccOsWith, parseAccJson, type AccIssue } from './accData';

const all = [...fixture['061'], ...fixture['068']];
const outsourced = new Set(['projetos alfa', 'projetos beta']);
assert.equal(filterAccIssues(all, { os: '061' }, outsourced).length, 3);
assert.equal(filterAccIssues(all, { mes: '2026-11', status: 'Aberto' }, outsourced).length, 1);
assert.equal(filterAccIssues(all, { setor: 'Arquitetura', tipo: 'Desenho' }, outsourced).length, 2);
assert.equal(filterAccIssues(all, { terceirizada: 'sim' }, outsourced).length, 3);
assert.deepEqual(countBy(all, 'os'), [{ name: '061', value: 3 }, { name: '068', value: 2 }]);

let fetches = 0;
let cache: { hash: string; issues: AccIssue[] } | null = null;
const deps = {
  readCache: async () => cache,
  writeCache: async (_os: string, entry: { hash: string; issues: AccIssue[] }) => { cache = entry; },
  fetchOs: async () => { fetches += 1; return { json: JSON.stringify(fixture['061']) }; },
  fetchChunks: async () => [],
};
assert.equal((await loadAccOsWith('061', 'v1', deps)).length, 3);
assert.equal((await loadAccOsWith('061', 'v1', deps)).length, 3);
assert.equal(fetches, 1, 'hash igual deve reutilizar cache');
assert.equal((await loadAccOsWith('061', 'v2', deps)).length, 3);
assert.equal(fetches, 2, 'hash alterado deve buscar somente a OS solicitada');
assert.equal(parseAccJson('[]').length, 0);
assert.throws(() => parseAccJson('{}'), /lista/);
console.log('accData.check: OK');
