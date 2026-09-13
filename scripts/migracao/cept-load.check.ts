// Checks das funcoes puras de cept-load.ts. Sem framework, mesmo padrao de cept-import.check.ts.
// Rodar: npx tsx scripts/migracao/cept-load.check.ts

import assert from 'node:assert/strict';
import { assertSemDuplicatas, assertValidDocId, chunk } from './cept-load.ts';

// assertValidDocId aceita o formato real de recordKey do ADR §1
assert.equal(assertValidDocId('001|ARQ|RVT|RVT'), '001|ARQ|RVT|RVT');

// e recusa tudo que o Firestore recusaria como ID
assert.throws(() => assertValidDocId(''), /vazio/);
assert.throws(() => assertValidDocId('001/ARQ'), /proibido em ID/);
assert.throws(() => assertValidDocId('.'), /invalido/);
assert.throws(() => assertValidDocId('..'), /invalido/);
assert.throws(() => assertValidDocId('__name__'), /reservado/);
assert.throws(() => assertValidDocId('x'.repeat(1501)), /1500 bytes/);

// limite e em BYTES, nao em caracteres: 800 acentos = 1600 bytes
assert.throws(() => assertValidDocId('á'.repeat(800)), /1500 bytes/);

// chunk respeita o limite de 500 do batch do Firestore
assert.deepEqual(chunk([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
assert.deepEqual(chunk([], 500), []);
assert.equal(chunk(Array.from({ length: 1000 }, (_, i) => i), 500).length, 2);
assert.equal(chunk(Array.from({ length: 501 }, (_, i) => i), 500).length, 2);

// duplicata sobrescreveria silenciosamente (recordKey e o ID do doc) — tem que falhar antes
assert.throws(
  () => assertSemDuplicatas([{ recordKey: 'a' }, { recordKey: 'b' }, { recordKey: 'a' }]),
  /duplicado/,
);
assertSemDuplicatas([{ recordKey: 'a' }, { recordKey: 'b' }]);

console.log('cept-load.check: OK');
