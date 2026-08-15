import assert from 'node:assert/strict';
import { addDias, criarLinhaVazia, diffDias, proximoSeq, type CronoRow } from './cronoRow';

// Regra do padrão.md: linha nova recebe UUID novo e seq ACIMA do maior ja existente (nunca
// renumera as irmas) — vale igual pro "+ Linha" da tela Project e pro bloco Project da nota.
const rows: CronoRow[] = [criarLinhaVazia(1), criarLinhaVazia(7), criarLinhaVazia(3)];
assert.equal(proximoSeq(rows), 8);
assert.equal(proximoSeq([]), 1);
assert.equal(new Set(rows.map((r) => r.id)).size, 3);

const nova = criarLinhaVazia(proximoSeq(rows));
assert.equal(nova.seq, 8);
assert.deepEqual(rows.map((r) => r.seq), [1, 7, 3]);

// Datas: a duracao sempre deriva do intervalo; sem as duas pontas ela e nula (nao fica presa).
assert.equal(diffDias('2026-01-01', '2026-01-11'), 10);
assert.equal(diffDias('2026-01-01', ''), null);
assert.equal(addDias('2026-01-01', 10), '2026-01-11');
assert.equal(addDias('', 10), '');

console.log('cronoRow: OK');
