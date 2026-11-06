# R4 — Project completo nas notas

STATUS: implementado na branch `feat/project-na-nota`.

Extração isolada: `200764ee` (`refactor: extract controlled shared Project grid`).
Dependência: `fix/notas-formatacao`, PR #9, ainda não integrado. O PR de R4 deve apontar para `main` e aguardar essa dependência.

O componente controlado `CronogramaGrid` recebe documento, mudanças, atividades e callbacks. Não importa o editor de notas em runtime. `SolucoesDigitais` mantém o shell, salvamento e abertura/criação de notas. `Anotacoes` usa o mesmo grid; a tabela e os handlers reduzidos foram removidos. O formato de `CronogramaDoc`, a coleção e as regras permanecem iguais.

## Validação local

- `npm ci --cache .r4/npm-cache --no-audit --no-fund`
- `npm run lint`
- `npx tsx scripts/cronoGrid.check.ts`
- `npx tsx scripts/cronoRevision.check.ts`
- `npx tsx src/lib/cronoRow.check.ts`
- `npx tsx src/components/CoordenacaoEngenharia/Anotacoes.formatting.check.ts`
- `npx tsx src/lib/firebaseDb.check.ts`
- `npm run build`
- `git diff --check`

Os checks cobrem indentação, promoção, códigos, colapso, proteção existente de predecessoras, datas, adição/renomeação/remoção de coluna, revisão obsoleta, documento excluído e primeiro salvamento.

Para reproduzir a matriz no navegador sem credenciais nem dados de produção:

```powershell
npm install --prefix .r4/browser-tools --cache .r4/npm-cache --no-audit --no-fund playwright@1.65.0
node node_modules/vite/bin/vite.js build --config scripts/fixtures/vite.config.ts
node node_modules/vite/bin/vite.js preview --config scripts/fixtures/vite.config.ts --host 127.0.0.1 --port 2514 --strictPort
# Em outro terminal, na mesma pasta:
node scripts/projectGrid.ui.check.mjs
```

`R4_BROWSER` pode indicar outro executável Chromium; por padrão usa o Chrome instalado no Windows. Perfil, screenshots, cache e build das fixtures ficam em `.r4/` (ignorado). `R4_PLAYWRIGHT` permite indicar outra instalação do Playwright.

A fixture monta os componentes reais de nota e Cronograma. Usa apenas localStorage como persistência; o teste bloqueia toda requisição fora de 127.0.0.1. A transação Firestore não foi executada em produção.

| Recurso | Nota | Cronograma |
|---|---|---|
| Criar, renomear e excluir coluna; valor customizado | PASS | PASS |
| Adicionar/excluir linha | PASS | PASS |
| Subtarefa, indentar, promover e colapsar | PASS | PASS |
| Responsável e filtro | PASS | PASS |
| Duração/fim e início sugerido pela predecessora | PASS | PASS |
| Cor e hyperlink pelo botão direito | PASS | PASS |
| Resize e rolagem horizontal | PASS | PASS |
| Entrar/sair de tela cheia | PASS | PASS |
| Salvar e reabrir, incluindo revisão e dados customizados | PASS | PASS |
| Vincular nota existente | PASS | PASS |
| Copiar nota e salvar a cópia | PASS | N/A |
| Conflito com edição em outra aba | PASS | PASS |

## Concorrência

Antes, os dois editores substituíam arrays inteiros sem verificar a versão que o usuário abriu. Agora ambos usam `saveCronogramaChecked`: uma transação lê o documento, compara o `updatedAt` persistido ao do rascunho e só grava se coincidir. O novo timestamp é estritamente posterior ao anterior. Em conflito ou exclusão, mostra aviso e preserva o rascunho, sem gravar linhas obsoletas. O usuário pode recuperar seu texto antes de reabrir a versão atual. Os campos ficam bloqueados enquanto o salvamento está em andamento.

Cronogramas novos ainda não persistidos são identificados apenas no estado da tela: o primeiro save aceita documento ausente e rejeita colisão com documento existente. Um Project já existente que foi excluído não é recriado pelo rascunho antigo. Não foi acrescentado campo de versão.

A matriz usa duas abas e verifica que o aviso aparece, o texto local permanece no editor e a linha da edição externa continua na persistência da fixture. O check unitário também cobre exclusão e criação inicial. A operação transacional real foi revisada e compilada, sem acesso a produção.

## Decisões e limites

- Dentro da nota, a opção de criar uma nova nota por linha fica oculta, evitando um editor dentro de outro. Vincular notas existentes continua disponível.
- Picker, Trocar, Desvincular e Salvar Project foram preservados.
- Tela cheia mantém o rascunho; ao sair, Salvar Project continua no cabeçalho do bloco.
- Copiar nota mantém a regra anterior: cria novos identificadores e limpa `projectId`.
- Projects originados em nota continuam somente leitura na tela Cronograma, com atalho para a nota de origem.
- A lógica de predecessoras foi preservada: sugere o início se vazio e bloqueia autorreferência e ciclo direto de duas linhas. Não adiciona propagação automática de toda a cadeia nem altera a semântica existente.
- Builds mantêm os avisos existentes de chunks grandes e imports estáticos/dinâmicos misturados.
- Sem coleção nova, alteração de regras, escrita em Firestore de produção, deploy ou merge.

## Correções da auditoria independente de PR #10

- D1: o Project tem estado dirty explícito e indicador visível. Fechar a nota, abrir outra nota, trocar, criar ou desvincular Project pede confirmação de descarte. Cancelar preserva o rascunho; confirmar limpa o draft e a revisão anterior. O fechamento também cancela a leitura pendente; refresh/fechamento da página usa beforeunload.
- D2: Salvar da nota primeiro salva o Project dirty pelo mesmo checked save do botão Salvar Project. Conflito interrompe o salvamento da nota, mostra o erro nos dois pontos e mantém o Project dirty. Só há confirmação de sucesso após as operações necessárias.
- D3: a existência do documento é independente do campo opcional updatedAt. Documentos existentes sem revisão em ambos os lados podem salvar; documentos excluídos continuam recusados salvo criação explícita. Timestamp, Date, representações serializadas e ISO são normalizados antes da comparação, preservando nanossegundos de Timestamp.
- D4: App observa a coleção e atualiza a lista compartilhada imediatamente após salvar no Cronograma. Ao abrir uma nota/vínculo, faz uma leitura nova do documento no servidor, sem fallback silencioso de cache. Respostas atrasadas e snapshots ao vivo não substituem rascunhos dirty.

Regressões reproduzidas antes das correções: `scripts/projectAudit.ui.check.mjs` com `R4_AUDIT_CASE=D1`, `D2` e `D4` falhou nos sintomas da auditoria; `scripts/cronoRevision.check.ts` falhou no documento legado sem updatedAt. Depois, todos esses casos e a matriz original passaram. A fixture agora mantém a instância de Anotacoes entre aberturas, usa duas notas e testa a tela real de Cronogramas com um adaptador local de persistência exclusivo do build de fixture.

Com o preview das fixtures na porta 2514:

```powershell
node scripts/projectAudit.ui.check.mjs
node scripts/projectGrid.ui.check.mjs
```

Verificação completa: 29/31 checks de arquivo passaram. As duas falhas já existentes são ENOENT em recursos locais não versionados ausentes:

- `scripts/importBim360Gs.check.mjs`: `nãocommit/Appscript/ImportBIM360.gs`.
- `src/lib/bim360Import.check.ts`: `nãocommit/exemplos/Resumo do problema-202607271730.xlsx`.

Os dois checks e seus módulos não foram alterados. Não foram criados arquivos fictícios nem ignoradas as falhas. TypeScript, os checks da auditoria, os dois testes de navegador e os builds da aplicação e de fixture passaram. Nenhuma escrita em produção, deploy ou merge foi executado.
