// Self-check: readChunkedAppData so le os chunks declarados pelo pai, nunca os orfaos da colecao.
// Rodar: node scripts/check-appdata-chunks.mjs
// ponytail: extrai a funcao do firebaseDb.ts em vez de importar (puxa Firebase/browser).
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { transformSync } from 'esbuild';

const src = fs.readFileSync(new URL('../src/lib/firebaseDb.ts', import.meta.url), 'utf8');
const start = src.indexOf('async function readChunkedAppData(');
assert.ok(start >= 0, 'funcao nao encontrada');
const body = src.slice(start, start + src.slice(start).search(/\r?\n\}\r?\n/)) + '\n}\n';
const code = transformSync(body + '\nreturn readChunkedAppData;', { loader: 'ts' }).code;

const make = (chunks) => new Function('doc', 'getDoc', 'getDocs', 'collection', code)(
  (_db, _a, _n, _c, id) => id,
  async (id) => ({ exists: () => id in chunks, data: () => ({ value: chunks[id] }) }),
  async () => ({ docs: Object.entries(chunks).map(([id, v]) => ({ id, data: () => ({ value: v }) })) }),
  () => null,
);

// pai declara 2; colecao tem 3 (00002 e lixo antigo)
const ok = await make({ '00000': 'a', '00001': 'b', '00002': 'LIXO' })(null, 'x', 2);
assert.deepEqual(ok, ['a', 'b']);
// chunk declarado ausente => erro, nao concatena os demais
await assert.rejects(make({ '00000': 'a', '00002': 'LIXO' })(null, 'x', 2), /ausentes/);
console.log('ok');
