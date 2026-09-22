import assert from 'node:assert/strict';
import { resolveDeliveryStatus } from './cept-preenchimento-import';

assert.deepEqual(resolveDeliveryStatus('', true), { status: 'na' });
assert.equal(resolveDeliveryStatus('SIM', false).status, 'delivered');
console.log('cept-preenchimento-import: OK');
