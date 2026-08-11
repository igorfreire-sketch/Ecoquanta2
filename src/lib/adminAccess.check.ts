import assert from 'node:assert/strict';
import { getDisciplinePatch, getRoleTabs } from './adminAccess';

assert.deepEqual(getRoleTabs({ Engenheiro: ['registro', 'registro'] }, 'Engenheiro'), ['registro']);
assert.deepEqual(getRoleTabs({ Engenheiro: ['registro'] }, 'Sem preset'), []);
assert.deepEqual(getDisciplinePatch({ disciplinas: [] }), { disciplina: '', disciplinas: [] });
assert.deepEqual(getDisciplinePatch({ disciplinas: ['Arquitetura', 'Engenharia'] }), {
  disciplina: 'Arquitetura',
  disciplinas: ['Arquitetura', 'Engenharia'],
});

console.log('adminAccess: OK');
