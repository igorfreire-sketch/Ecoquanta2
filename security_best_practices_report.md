# Auditoria de seguranca — EAP por OS

Data: 2026-10-05. Escopo: regras do Firestore, autenticacao, importacao Project e dependencias. Nenhum deploy ou escrita no Firebase foi executado.

## Resumo executivo

A nova colecao `eapOs` esta protegida contra escrita direta do navegador, mas ainda nao existe o backend que publicara os dados. O maior risco atual e anterior a essa migracao: o login anonimo e as regras amplas de `appData` permitem que qualquer sessao anonima leia e altere dados operacionais, inclusive o cadastro e os hashes usados pelo login legado. Esse ponto nao foi fechado automaticamente porque a mudanca interromperia o sistema atual; ele exige migracao coordenada para Firebase Auth e backend.

## Achados

### SEC-001 — Critico — `appData/auth` exposto a sessao anonima

- Evidencia: `firestore.rules:146-152` concede leitura, escrita e exclusao usando apenas `isSignedIn()`; `src/lib/firebaseDb.ts:180` cria sessao anonima automaticamente; `.env.example:20` habilita esse modo.
- Impacto: leitura dos hashes, adulteracao de usuarios/admin e substituicao ou exclusao dos dados operacionais sem passar pela interface.
- Agravante: `src/App.tsx:780-803` aceita SHA-256 sem salt, permitindo tentativa offline depois da leitura do blob.
- Estado: **bloqueado para correcao isolada**. Migrar o login para Firebase Auth, provisionar autorizacao por UID/claim no backend e depois negar acesso cliente a `appData/auth`, `appData/admin` e `appData/eap`. Remover o login anonimo somente no mesmo corte para nao parar usuarios atuais.

### SEC-002 — Critico — VBA legado grava diretamente no Firebase

- Evidencia: `Project/code.txt:78-114,254-264,469-549` autentica anonimamente e grava/apaga `appData/eap` e chunks.
- Impacto: qualquer copia do macro pode sobrescrever a EAP; atualizacao em varios chunks pode ficar parcial.
- Estado: **nao reutilizar na migracao**. O novo exportador gera apenas arquivo local; publicacao deve ocorrer em endpoint autenticado, validado e atomico.

### SEC-003 — Alto — `eapOs` sem backend e leitura anonima

- Evidencia: `firestore.rules:156-159` nega escrita cliente, mas `isSignedIn()` inclui sessao anonima. `firebase.json` nao declara Functions e nao existe publicador Admin SDK no repositorio.
- Impacto: os dados seriam legiveis por visitante anonimo e, hoje, nao ha caminho autorizado de publicacao.
- Estado: escrita cliente **corrigida** e regra recursiva simplificada. Antes de publicar: criar endpoint que valide ID token, perfil autorizado, OS, versao, limites e checksum; entao trocar a leitura por UID/claim aprovado. Firebase documenta que bibliotecas servidor/Admin SDK ignoram Security Rules e devem ser protegidas por IAM: https://firebase.google.com/docs/firestore/enterprise/security/rules-conditions

### SEC-004 — Alto — senha compartilhada nao e controle de acesso

- Evidencia: nenhum segredo privado foi encontrado nos arquivos rastreados e a senha proposta nao foi persistida.
- Impacto evitado: segredo dentro de VBA ou JavaScript pode ser extraido por qualquer usuario e reutilizado fora do aplicativo.
- Estado: **corrigido por desenho** para `eapOs`: `allow write: if false`; autenticar no backend por ID token/UID/claim. Claims devem ser definidos apenas em ambiente privilegiado: https://firebase.google.com/docs/auth/admin/custom-claims

### SEC-005 — Alto — parser/upload ainda nao tem fronteiras de seguranca

- Evidencia: a tela atual importa XLSX; o endpoint/parser de `.mpp` ainda nao existe. O exportador Project apenas produz TSV local.
- Estado: requisito para implementacao: limite de tamanho, assinatura/tipo do arquivo, timeout, limite de tarefas/recursos, OS estavel, `previewId` de uso unico vinculado a UID+OS+hash, controle de versao e publicacao atomica/rollback.

### SEC-006 — Alto/baixo — dependencias vulneraveis residuais

- Correcao aplicada: `npm audit fix` atualizou somente dependencias transitivas seguras no `package-lock.json`; o total caiu de 12 para 5 vulnerabilidades e nao restou nenhuma critica.
- Residuo: quatro alertas altos derivam de `@grpc/grpc-js` via Firebase; o npm sugere downgrade principal para Firebase 9.14.0, portanto `--force` nao foi usado. Um alerta baixo permanece no `esbuild` usado por `tsx`.
- Estado: acompanhar atualizacao compativel do Firebase/tsx; nao executar downgrade automatico.

### SEC-007 — Medio — verificacao textual de Rules

- Correcao aplicada: o check agora exige uma unica regra recursiva de `eapOs`, escrita negada e ausencia de autorizacao baseada em segredo enviado pelo cliente.
- Residuo: regex nao prova comportamento de regras sobrepostas. Adicionar teste semantico no Firebase Emulator junto com o backend; Rules v2 usa wildcard recursivo para zero ou mais segmentos: https://firebase.google.com/docs/rules/rules-behavior

## Correcao funcional do Project

O inventario real dos `.mpp` confirmou `Text3` como disciplina, `Text5` como edificacao, `Text2` como prioridade e `Text4` como responsavel. O VBA gerado foi corrigido para essa ordem e recebeu um self-check.
