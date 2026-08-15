import assert from 'node:assert/strict';
import { isValidCnpj } from './TerceirizadasCadastro';

assert.equal(isValidCnpj('04.252.011/0001-10'), true);
assert.equal(isValidCnpj('04252011000110'), true);
assert.equal(isValidCnpj('00.000.000/0000-00'), false);
assert.equal(isValidCnpj('04.252.011/0001-00'), false);
assert.equal(isValidCnpj('04.252.011/0001-11'), false);

console.log('TerceirizadasCadastro CNPJ: OK');
