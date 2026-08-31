import assert from 'node:assert/strict';
import { applyLeaderEventsToActivities, hasOpenActivityIssue, type LeaderActivityEvent } from './leaderActivity';

const source = [
  { id: 'a', itemCodigo: 'A', keep: true },
  { id: 'b', itemCodigo: 'B', keep: true },
];
const events: LeaderActivityEvent[] = [
  { itemCodigo: 'A', autorEmail: 'x@example.com', criadoEm: '2026-08-11T10:00:00.000Z', executadoPor: ['Ana'], status: 'Bom', dificuldade: 'Fácil', percentual: 20, observacao: 'antigo' },
  { itemCodigo: 'A', autorEmail: 'x@example.com', criadoEm: '2026-08-11T09:00:00.000Z', executadoPor: ['Ana'], status: 'Problema', dificuldade: 'Difícil', percentual: 10, observacao: 'mais antigo' },
  { itemCodigo: 'A', autorEmail: 'x@example.com', criadoEm: '2026-08-11T11:00:00.000Z', executadoPor: ['Bia'], status: 'Regular', dificuldade: 'Regular', percentual: 40, observacao: 'mais recente' },
  { itemCodigo: 'unknown', autorEmail: 'x@example.com', criadoEm: '2026-08-11T12:00:00.000Z', executadoPor: [], status: 'Bom', dificuldade: 'Fácil', percentual: 100, observacao: 'ignorar' },
];

const reduced = applyLeaderEventsToActivities(source, events);
const first = reduced[0] as typeof reduced[0] & Record<string, unknown>;
assert.equal(first.statusDaAtividade, 'Regular');
assert.equal(first.porcentagemAtividade, 40);
assert.deepEqual(first.executadoPor, ['Bia']);
assert.equal(first.dificuldadeAtividade, 'Normal');
assert.deepEqual((applyLeaderEventsToActivities(source, [{ ...events[0], executadoPor: 'Ana' }])[0] as Record<string, unknown>).executadoPor, ['Ana']);
assert.equal(reduced.length, source.length);
assert.deepEqual(reduced[1], source[1]);
assert.deepEqual(applyLeaderEventsToActivities(source, []), source);
const openIssue = { itemCodigo: 'A', mensagens: [{ autor: 'Ana', mensagem: 'Problema', dataHora: '2026-08-11T12:00:00.000Z' }], resolvido: false };
assert.equal(hasOpenActivityIssue(openIssue), true);
assert.equal(hasOpenActivityIssue({ ...openIssue, resolvido: true }), false);
console.log('leaderActivity: OK');
