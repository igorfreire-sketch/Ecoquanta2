// Uso: npx tsx src/components/CeptV2/preenchimento/parse.check.ts
import assert from 'node:assert/strict';
import { diasUteis } from '../../../lib/cept/rules';
import { parseBool, parseDate, parseDays, parseFinal, parseModo, parseNota, parseStatus, parseTsv } from './parse';

assert.equal(parseStatus('TRUE').value, 'delivered');
assert.equal(parseStatus('x').value, 'delivered');
assert.equal(parseStatus('').value, 'pending');
assert.equal(parseStatus('FALSO').value, 'pending');
assert.equal(parseStatus('-').value, 'na');
assert.ok(parseStatus('talvez').error);
assert.equal(parseBool('VERDADEIRO').value, true);

assert.equal(parseDate('15/09/2026').value, '15/09/2026');
assert.equal(parseDate('150926').value, '15/09/2026');
assert.equal(parseDate('15092026').value, '15/09/2026');
assert.equal(parseDate('5/6').value, '05/06'); // P5: aceito sem ano
assert.equal(parseDate('46280').value, '15/09/2026'); // serial Excel
assert.ok(parseDate('31/02/2026').error);
assert.ok(parseDate('32/01').error);
assert.equal(parseDate('').value, '');

assert.ok(parseNota('7').error); // P7
assert.equal(parseNota('').value, null);
assert.equal(parseNota('6').value, 6);
assert.equal(parseModo('q').value, 'Quanta');
assert.equal(parseModo('').value, null);
assert.ok(parseModo('Outro').error);
assert.ok(parseDays('1.5').error);
assert.equal(parseDays('24').value, 24);
assert.deepEqual(parseFinal('TALVEZ TODOS ANTES?').value, { final: null, finalNota: 'TALVEZ TODOS ANTES?' });
assert.deepEqual(parseFinal('21').value, { final: 21, finalNota: '' });

// P8/P9 (soma vem de rules.ts): texto em O fora da soma; I101/I102 sem J,K.
assert.equal(diasUteis({ '100': 10, '200': 20, '300': 50, final: null }, []), 80);
assert.equal(diasUteis({ '100': 10, '200': 20, '300': 51 }, ['100', '200']), 51);
assert.equal(diasUteis({ '100': 10 }, null), null);

assert.deepEqual(parseTsv('a\tb\r\nc\td\r\n'), [['a', 'b'], ['c', 'd']]);
console.log('parse.check OK');
