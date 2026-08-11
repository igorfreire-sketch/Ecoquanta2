import assert from 'node:assert/strict';
import { truncateAfterRealCompletion } from './curvaS';

const p = (real: number) => ({ real });
const cut = (values: number[]) => truncateAfterRealCompletion(values.map(p), (item) => item.real).map((item) => item.real);

assert.deepEqual(cut([]), []);
assert.deepEqual(cut([0, 40, 99]), [0, 40, 99]);
assert.deepEqual(cut([80, 100, 120]), [80, 100]);
assert.deepEqual(cut([100, 120]), [100]);
assert.deepEqual(cut([80, 101, 120]), [80, 101]);
