import assert from 'node:assert/strict';
import {
  applyUserAccessPatch,
  getDisciplinePatch,
  getRoleTabs,
  hasPersistedTabAccess,
  mergeDirtyUserRecords,
} from './adminAccess';

assert.deepEqual(getRoleTabs({ Engenheiro: ['registro', 'registro'] }, 'Engenheiro'), ['registro']);
assert.deepEqual(getRoleTabs({ Engenheiro: ['registro'] }, 'Sem preset'), []);
assert.deepEqual(getDisciplinePatch({ disciplinas: [] }), { disciplina: '', disciplinas: [] });
assert.deepEqual(getDisciplinePatch({ disciplinas: ['Arquitetura', 'Engenharia'] }), {
  disciplina: 'Arquitetura',
  disciplinas: ['Arquitetura', 'Engenharia'],
});

const baseUser = {
  id: 'ana@example.com',
  email: 'ana@example.com',
  nome: 'Ana',
  cargo: 'Analista',
  contrato: 'A',
  allowedTabs: ['registro'],
};
const cargoChanged = applyUserAccessPatch(baseUser, { cargo: 'Lider' });
assert.deepEqual(cargoChanged.allowedTabs, ['registro']);
assert.equal(hasPersistedTabAccess(cargoChanged.allowedTabs, 'banco-links'), false);
assert.equal(hasPersistedTabAccess(cargoChanged.allowedTabs, 'cronograma'), false);
const tabsRemoved = applyUserAccessPatch(cargoChanged, { allowedTabs: [] });
assert.deepEqual(tabsRemoved.allowedTabs, []);

const merged = mergeDirtyUserRecords({
  remoteUsers: [
    { ...baseUser, nome: 'Ana Remota', contrato: 'B' },
    { ...baseUser, id: 'bia@example.com', email: 'bia@example.com', nome: 'Bia' },
  ],
  baseUsers: [baseUser],
  draftUsers: [tabsRemoved],
  dirtyUserIds: [baseUser.id],
  deletedUserEmails: [],
});
assert.deepEqual(merged[0], { ...baseUser, nome: 'Ana Remota', contrato: 'B', cargo: 'Lider', allowedTabs: [] });
assert.equal(merged[1].email, 'bia@example.com');

console.log('adminAccess: OK');
