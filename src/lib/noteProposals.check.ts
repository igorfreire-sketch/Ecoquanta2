import assert from 'node:assert/strict';
import {
  acceptNoteProposal,
  applyNoteSave,
  diffNoteProposal,
  previewNoteProposal,
  rejectNoteProposal,
} from './noteProposals';
import type { AnnotationSheet } from '../components/CoordenacaoEngenharia/Anotacoes';

const base: AnnotationSheet = {
  id: 'note-1',
  disciplina: 'Hidro',
  titulo: 'Original',
  bancos: [{ id: 'bank-1', colCount: 2, rows: [['A', 'B'], ['C', 'D']] }],
  textos: [{ id: 'text-1', texto: 'Texto original' }],
  checklists: [{ id: 'check-1', itens: [{ id: 'item-1', texto: 'Item', feito: false }] }],
  autorNome: 'Dona',
  autorEmail: 'dona@quanta.com',
  marcadosUsuarios: ['ligado@quanta.com'],
  criadoEm: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-02T00:00:00.000Z',
};

const identical = structuredClone(base);
assert.deepEqual(diffNoteProposal(base, identical), {
  candidateJson: diffNoteProposal(base, identical).candidateJson,
  changedFields: [],
  changedTextBlockIds: [],
  changedChecklistBlockIds: [],
  changedBancoBlockIds: [],
  changedBancoCells: [],
});

const draft = structuredClone(base);
draft.titulo = 'Proposto';
draft.textos![0].texto = 'Texto proposto';
draft.bancos![0].rows[1][0] = 'Celula proposta';
const diff = diffNoteProposal(base, draft);
assert(diff.changedFields.includes('titulo'));
assert.deepEqual(diff.changedTextBlockIds, ['text-1']);
assert.deepEqual(diff.changedBancoCells, [{ bancoId: 'bank-1', row: 1, col: 0 }]);

const proposed = applyNoteSave(base, draft, { nome: 'Ligado', email: 'LIGADO@quanta.com' }, '2026-01-03T00:00:00.000Z');
assert.equal(proposed.titulo, base.titulo);
assert.deepEqual(proposed.bancos, base.bancos);
assert.equal(previewNoteProposal(proposed).titulo, 'Proposto');
assert.throws(
  () => applyNoteSave(proposed, draft, { nome: 'Ligado', email: 'ligado@quanta.com' }, '2026-01-03T01:00:00.000Z'),
  /ja possui uma proposta/,
);
assert.throws(
  () => applyNoteSave(base, draft, { nome: 'Admin', email: 'admin@quanta.com' }, '2026-01-03T01:00:00.000Z'),
  /Apenas o autor ou um usuario vinculado/,
);

const accepted = acceptNoteProposal(proposed, 'dona@quanta.com', '2026-01-04T00:00:00.000Z');
assert.equal(accepted.titulo, 'Proposto');
assert.equal(accepted.pendingProposal, undefined);
assert.equal(accepted.autorEmail, base.autorEmail);
assert.equal(accepted.criadoEm, base.criadoEm);

const rejected = rejectNoteProposal(proposed, 'DONA@quanta.com');
assert.equal(rejected.titulo, base.titulo);
assert.equal(rejected.pendingProposal, undefined);

assert.throws(
  () => acceptNoteProposal({ ...proposed, updatedAt: '2026-01-03T12:00:00.000Z' }, 'dona@quanta.com', '2026-01-04T00:00:00.000Z'),
  /Conflito/,
);

const legacy: AnnotationSheet = {
  id: 'legacy',
  disciplina: '',
  titulo: 'Legada',
  colCount: 1,
  rows: [['valor']],
  texto: 'texto legado',
  autorEmail: 'dona@quanta.com',
  updatedAt: '2025-01-01T00:00:00.000Z',
};
assert.equal(legacy.pendingProposal, undefined);
assert.equal(legacy.projectId, undefined);
assert.deepEqual(diffNoteProposal(legacy, structuredClone(legacy)).changedFields, []);

console.log('noteProposals: OK');
