import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { parseBim360Workbook, syncBim360Quality, type Bim360ImportResult } from './bim360Import';
import type { Nc2Record } from '../components/NaoConformidade2/ncStore';

const file = 'n\u00e3ocommit/exemplos/Resumo do problema-202607271730.xlsx';
const parsed = await parseBim360Workbook(await fs.readFile(file));
assert.equal(parsed.osCodigo, 'OS061');
assert.ok(parsed.issues.length > 0 && parsed.issues.length < 1426);
assert.equal(new Set(parsed.issues.map((issue) => issue.issueId)).size, parsed.issues.length);

const store: Nc2Record[] = [];
const deps = {
  list: async () => store,
  save: async (id: string, record: Nc2Record) => {
    const index = store.findIndex((item) => item.id === id);
    if (index === -1) store.push(record); else store[index] = record;
  },
};
const first = await syncBim360Quality(parsed, deps);
const second = await syncBim360Quality(parsed, deps);
assert.equal(first.created, parsed.issues.length);
assert.equal(second.created, 0);
assert.equal(second.updated, parsed.issues.length);
assert.equal(store.length, parsed.issues.length);
console.log(`bim360Import: OK (${parsed.issues.length} Quality, ${first.created} criados, ${second.updated} atualizados)`);
