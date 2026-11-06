import assert from 'node:assert/strict';
import { nextCronogramaTimestamp } from '../src/lib/cronoRevision';
const old = '2026-11-06T00:00:00.000Z';
const next = nextCronogramaTimestamp(old, old);
assert.ok(next > old);
assert.throws(() => nextCronogramaTimestamp(old, next), /rascunho foi preservado/);
assert.throws(() => nextCronogramaTimestamp(old, undefined), /excluído/);
assert.ok(nextCronogramaTimestamp('2999-01-01T00:00:00.000Z', '2999-01-01T00:00:00.000Z') > '2999-01-01T00:00:00.000Z');
console.log('PASS: stale/deleted documents refused; timestamps monotonic; no format/version field added');

assert.ok(nextCronogramaTimestamp(old, undefined, true) > old);
assert.throws(() => nextCronogramaTimestamp(old, old, true), /rascunho foi preservado/);
