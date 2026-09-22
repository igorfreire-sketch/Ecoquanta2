import assert from 'node:assert/strict';
import { getMultiSelectPlacement } from './SearchableMultiSelect';

{
  const placement = getMultiSelectPlacement(
    { left: 100, top: 120, bottom: 164, width: 220 },
    { width: 1440, height: 900 },
  );
  assert.equal(placement.openUpward, false);
  assert.equal(placement.width, 260);
  assert.equal(placement.top, 170);
}

{
  const placement = getMultiSelectPlacement(
    { left: 1300, top: 760, bottom: 804, width: 240 },
    { width: 1440, height: 900 },
  );
  assert.equal(placement.openUpward, true);
  assert.ok(placement.left + placement.width <= 1428, 'painel deve permanecer dentro da viewport');
  assert.equal(placement.bottom, 146);
}

console.log('SearchableMultiSelect.check.ts: OK');
