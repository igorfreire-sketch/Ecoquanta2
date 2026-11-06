// Self-check: registro vazio do appData/admin (Apps Script) nao pode apagar o acesso do appData/auth.
// Rodar: node scripts/check-merge-acesso.mjs
// ponytail: extrai as funcoes do App.tsx em vez de importar (App.tsx puxa React/Firebase/CSS).
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { transformSync } from 'esbuild';

const src = fs.readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
const fn = (name) => {
  const start = src.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `funcao ${name} nao encontrada`);
  const end = src.slice(start).search(/\r?\n\}\r?\n/);
  return src.slice(start, start + end) + '\n}\n';
};
const code = transformSync(
  ['getRecordSessionVersion', 'normalizeUserAccessRecord', 'mergeUserAccessRecords'].map(fn).join('\n')
    + '\nreturn mergeUserAccessRecords;',
  { loader: 'ts' },
).code;
const merge = new Function('getPrimaryDisciplineValue', 'getUserDisciplineList', 'normalizeUserText', code)(
  (v) => (Array.isArray(v) ? v[0] || '' : String(v || '')),
  (u) => (Array.isArray(u?.disciplinas) ? u.disciplinas : []),
  (v) => String(v || '').trim().toLowerCase(),
);

const email = 'tarcisio.marques@quantaconsultoria.com';
const vazioAdmin = { id: email, email, cargo: '', allowedTabs: [], status: 'approved' };
const cheioAuth = { id: email, email, cargo: 'Lider', allowedTabs: ['registro', 'controle'], status: 'approved' };

const [r1] = merge([vazioAdmin], [cheioAuth]);
assert.deepEqual(r1.allowedTabs, ['registro', 'controle'], 'admin vazio venceu o auth');
assert.equal(r1.cargo, 'Lider');

const editadoAdmin = { ...cheioAuth, allowedTabs: ['registro'] };
const [r2] = merge([editadoAdmin], [cheioAuth]);
assert.deepEqual(r2.allowedTabs, ['registro'], 'registro revisado da 1a fonte deve continuar vencendo');

const revogado = { ...vazioAdmin, adminReviewed: true };
const [r3] = merge([revogado], [cheioAuth]);
assert.deepEqual(r3.allowedTabs, [], 'revogacao explicita (adminReviewed) deve continuar vencendo');

console.log('ok: check-merge-acesso');
