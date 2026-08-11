import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const rules = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');
const firebaseDb = readFileSync(new URL('../src/lib/firebaseDb.ts', import.meta.url), 'utf8');
const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
const collections = [
  'registroAtividades', 'registroAtividadesHistorico', 'nc2Records', 'planningTodos',
  'contractPriorities', 'contractInterferences', 'resolvedAlerts', 'osSettings',
  'solucoesDigitaisCronograma', 'cronogramas', 'emergencies', 'emergencyMessages',
  'emergencyReadMarkers',
];

assert.match(rules, /^rules_version = '2';/);
assert.match(rules, /match \/appData\/\{document\}/);
assert.match(rules, /match \/appData\/\{document\}\/chunks\/\{chunk\}/);
collections.forEach((name) => assert.match(rules, new RegExp(`match /${name}/\\{document\\}`), `sem regra: ${name}`));
assert.match(rules, /match \/\{document=\*\*\}[\s\S]*allow read, write: if false;/, 'falta bloqueio padrao');
assert.match(firebaseDb, /authStateReady\(\)[\s\S]*auth\.currentUser \? undefined : signInAnonymously/, 'sessao Google pode ser substituida por login anonimo');
assert.match(app, /persistAdminChanges[\s\S]*ensureGoogleFirebaseAuth\(currentUser\.email\)/, 'salvamento administrativo nao recupera sessao Google antiga');
assert.match(app, /signOutFirebase\(\)/, 'logout local nao encerra o Firebase Auth');
assert.match(app, /!preRegistration && !isCorporateEmail\(email\)/, 'dominio corporativo exige pre-cadastro');
assert.match(app, /\{ key: 'banco-links', label: 'Banco de Links' \}/, 'Banco de Links nao pode ser liberado pelo admin');
assert.doesNotMatch(app, /if \(tab === 'banco-links'\) return true;/, 'Banco de Links liberado sem permissao');

for (const name of ['appData', ...collections]) {
  const block = rules.match(new RegExp(`match /${name}[^}]*\\} \\{([\\s\\S]*?)\\n    \\}`))?.[1] || '';
  assert.match(block, /isSignedIn\(\)/, `${name} bloqueia o login operacional atual`);
}

for (const name of ['appData', 'nc2Records', 'contractPriorities', 'contractInterferences', 'osSettings']) {
  const block = rules.match(new RegExp(`match /${name}[^}]*\\} \\{([\\s\\S]*?)\\n    \\}`))?.[1] || '';
  assert.doesNotMatch(block, /siteUsers|ownsNc|ownsContractData/, `${name} ainda depende de perfil por uid inexistente`);
}

console.log('firestoreRules: OK');
