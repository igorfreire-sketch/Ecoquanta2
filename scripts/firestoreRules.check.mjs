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

const ceptBlock = rules.match(/match \/ceptComponentes\/\{document\} \{([\s\S]*?)\n    \}/)?.[1] || '';
assert.match(ceptBlock, /allow create: if isSignedInWithEmail\(\) && ceptComponentPayloadIsSafe\(\) && request\.resource\.data\.version == 1;/, 'CEPT permite criação sem versão/autor validado');
assert.match(ceptBlock, /allow update: if isSignedInWithEmail\(\) && ceptComponentPayloadIsSafe\(\) && request\.resource\.data\.version == resource\.data\.get\('version', 0\) \+ 1;/, 'CEPT permite sobrescrita sem incremento de versão');
assert.match(firebaseDb, /export function nextDocumentVersion[\s\S]*currentVersion !== expectedVersion/, 'cliente CEPT não detecta conflito de versão');
const feedbackBlock = rules.match(/match \/feedbackReports\/\{reportId\} \{([\s\S]*?)\n    \}/)?.[1] || '';
assert.match(rules, /function isFeedbackAdmin\(\)[\s\S]*igor\.freire@quantaconsultoria\.com/, 'Demandas Digitais nao reconhece o administrador do EcoQuanta');
assert.match(feedbackBlock, /allow read: if isFeedbackAdmin\(\)/, 'leitura de feedback nao usa a permissao do administrador EcoQuanta');
assert.match(feedbackBlock, /allow update: if isFeedbackAdmin\(\) && feedbackStatusUpdateIsSafe\(\);/, 'movimentacao de feedback perdeu validacao de status');

for (const name of ['appData', ...collections]) {
  const block = rules.match(new RegExp(`match /${name}[^}]*\\} \\{([\\s\\S]*?)\\n    \\}`))?.[1] || '';
  assert.match(block, /isSignedIn\(\)/, `${name} bloqueia o login operacional atual`);
}

for (const name of ['appData', 'nc2Records', 'contractPriorities', 'contractInterferences', 'osSettings']) {
  const block = rules.match(new RegExp(`match /${name}[^}]*\\} \\{([\\s\\S]*?)\\n    \\}`))?.[1] || '';
  assert.doesNotMatch(block, /siteUsers|ownsNc|ownsContractData/, `${name} ainda depende de perfil por uid inexistente`);
}

console.log('firestoreRules: OK');
