import assert from 'node:assert/strict';
import { mergePendingAuthUsersIntoAdmin, mergePublishedRegistro, nextDocumentVersion } from './firebaseDb';

assert.equal(nextDocumentVersion(0, 0), 1);
assert.equal(nextDocumentVersion(4, 4), 5);
assert.throws(() => nextDocumentVersion(1, 2), /alterado por outra pessoa/);
assert.throws(() => nextDocumentVersion(-1, 0), /Versão esperada inválida/);
const reconciled = mergePendingAuthUsersIntoAdmin(
  { users: [{ email: 'ana@quantaconsultoria.com', cargo: 'Antigo', allowedTabs: ['registro'] }] },
  { users: [{ email: 'ana@quantaconsultoria.com', cargo: 'Atual', allowedTabs: ['solucoes'] }, { email: 'bia@quantaconsultoria.com', cargo: 'Nova' }] },
);
assert.deepEqual(reconciled.users.map((user: any) => [user.email, user.cargo, user.allowedTabs]), [
  ['ana@quantaconsultoria.com', 'Atual', ['solucoes']],
  ['bia@quantaconsultoria.com', 'Nova', undefined],
]);
console.log('firebaseDb versioning: OK');

// childrenByParent deixou de ser publicado: tem que ser derivado de hierarchyNodes.
const derived = mergePublishedRegistro({ hierarchyNodes: [{ codigo: '2', parentCodigo: '' }, { codigo: '2.1', parentCodigo: '2' }] });
assert.deepEqual(Object.keys(derived.childrenByParent).sort(), ['2', 'ROOT']);
assert.equal(derived.childrenByParent['2'][0].codigo, '2.1');
