import assert from 'node:assert/strict';
import { PROJECT_EAP_EXPORT_VBA } from './projectVbaAssets';

const header = PROJECT_EAP_EXPORT_VBA.match(/linhas = (.+?) & vbCrLf/)?.[1] || '';
assert.equal((header.match(/vbTab/g) || []).length, 18);
assert.match(header, /N° item/);
assert.match(header, /Nome da Tarefa/);
assert.match(PROJECT_EAP_EXPORT_VBA, /If Not tarefa Is Nothing Then[\s\S]+If Len\(Trim\$\(tarefa\.Name\)\) > 0 Then/);
assert.doesNotMatch(PROJECT_EAP_EXPORT_VBA, /If Not tarefa Is Nothing And/);
assert.doesNotMatch(PROJECT_EAP_EXPORT_VBA, /private_key|BEGIN PRIVATE KEY|client_email|AIza[0-9A-Za-z_-]{20,}/i);
assert.doesNotMatch(PROJECT_EAP_EXPORT_VBA, /firestore\.googleapis\.com|setFirebaseDocument/i);
console.log('projectVbaAssets: OK (19 colunas, exportação manual, sem credencial)');
