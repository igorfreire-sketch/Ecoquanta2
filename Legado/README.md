# Legado

Arquivos mantidos apenas para referencia historica da publicacao por JSON.

O caminho ativo do site agora usa Firebase/Firestore como banco principal. O Apps Script continua responsavel por cadastro, login, reset/perdi senha, envio de e-mail e rotinas administrativas que dependem da planilha.

Conteudo:

- `Publica/`: ultimos JSONs publicos antigos.
- `src/lib/publicJson.ts`: cliente antigo de leitura dos JSONs.
- `scripts/import-publica-to-firestore.mjs`: importador usado na migracao inicial dos JSONs para Firestore.
