# F-banco-links

## STATUS

FIXED. `npm run lint`, `npm run build`, `node scripts/firestoreRules.check.mjs`, `git diff --check` e 23/24 checks TypeScript passaram. Nenhuma escrita no Firebase, publicacao de rules ou merge foi executado.

## ROOT_CAUSE

- `src/App.tsx:1221`: quando `databaseLinks` estava marcado como editado, o snapshot local inteiro substituia o array remoto, mesmo tendo sido criado a partir de uma leitura obsoleta.
- O fluxo administrativo entao chamava a substituicao integral de `appData/admin` (`src/lib/firebaseDb.ts:1087`), deixando uma gravacao posterior de outra tela/usuario remover links salvos por uma gravacao concorrente.
- `src/App.tsx:2087` agora grava `admin` via transacao; `src/lib/firebaseDb.ts:1127` preserva campos nao editados e `src/lib/firebaseDb.ts:1106` aplica somente o delta local de links por `id` sobre o array remoto corrente.

## REPRO

- Check: `npx tsx src/lib/bancoLinksPersistence.check.ts`.
- Antes: falhou no primeiro assert; o escritor obsoleto de `cargos` devolveu apenas `base` e apagou o link `a`.
- Depois: `banco links persistence: OK`; tambem cobre dois escritores de links partindo do mesmo snapshot (`a` e `b` sobrevivem).

## FILES_CHANGED

- `src/App.tsx`
- `src/lib/firebaseDb.ts`
- `src/lib/bancoLinksPersistence.check.ts`
- `CODEX/reports/F-banco-links.md`

## DECISIONS

- Reutilizado `mutateFirebaseAppData`; nenhuma dependencia ou colecao nova.
- O baseline de links e mantido junto ao baseline administrativo para calcular adicoes, edicoes e remocoes locais sem apagar mudancas remotas independentes.
- Escritas concorrentes no mesmo `id` continuam com semantica de ultimo commit, enquanto links distintos sao mesclados.
- O writer Apps Script chamado pelo frontend esta desativado (`syncAdminSnapshotToAppsScript*` retorna sem acao); nenhum writer externo ativo de `admin` foi encontrado no repositorio.
- PR #6 (`fix/appdata-chunks`) NAO e a causa: ela rejeita chunks ausentes/orfaos na leitura. Este bug era sobrescrita concorrente do array em `appData/admin`.

## CHECKS

- `npx tsx src/lib/bancoLinksPersistence.check.ts`: PASS
- `npm run lint`: PASS
- `npm run build`: PASS (avisos de chunk/dynamic import preexistentes)
- `node scripts/firestoreRules.check.mjs`: PASS
- `git diff --check`: PASS
- Demais `*.check.ts`: PASS, exceto o bloqueio abaixo.

## BLOCKERS

- `src/lib/bim360Import.check.ts` nao executa sem a fixture ignorada `naocommit/exemplos/Resumo do problema-202607271730.xlsx`. O arquivo nao existe na worktree, no clone original, Desktop, Documents ou Downloads. Erro: `ENOENT`. Nao foi criada fixture falsa.
- O vault obrigatorio do skill nao estava acessivel: `\\192.168.68.117\ObsidianVault\CLAUDE.md` inexistente e `\\192.168.68.100\ObsidianVault\CLAUDE.md` retornou acesso negado.
- Push bloqueado: HTTPS nao conseguiu obter credenciais (`wincredman`/sem TTY), `gh` nao esta autenticado e a chave SSH foi recusada pelo GitHub.
