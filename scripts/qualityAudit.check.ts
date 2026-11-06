import assert from 'node:assert/strict';
import { validateIssue } from '../src/components/NaoConformidade2/Preenchimento';
const issue = { id: '#1', os: '061', titulo: 'Synthetic issue', status: 'Aberto', tipo: 'Desenho', setor: 'ARQ', criadoEm: '2026-11-06T12:00:00Z', origem: 'acc' as const };
assert.doesNotThrow(() => validateIssue(issue), 'ACC does not supply contratoCodigo');
assert.throws(() => validateIssue({ ...issue, origem: 'manual' }), /Contrato/);
console.log('qualityAudit: ACC edit without contract OK');
import { qualitySectorLabel, filterAccIssues, countBy } from '../src/lib/accData';
assert.deepEqual(countBy([issue], 'setor'), [{ name: 'Arquitetura', value: 1 }]);

assert.equal(qualitySectorLabel('ZZZ'), 'ZZZ');
assert.equal(qualitySectorLabel(''), 'Setor nao informado');
assert.equal(filterAccIssues([issue], { setor: 'Arquitetura' }, new Set()).length, 1);
console.log('qualityAudit: shared sector labels, unknown and absent OK');
