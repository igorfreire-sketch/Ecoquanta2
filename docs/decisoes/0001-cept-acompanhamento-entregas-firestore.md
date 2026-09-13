# 0001. CEPT — Acompanhamento de Entregas: porte do Apps Script para Firestore

**Status:** Proposed
**Data:** 2026-09-08
**Autor:** tech-lead
**Escopo:** desenho (schema + camadas + acesso). Nao ha codigo de app nesta decisao.

> Primeiro ADR do repositorio. Nao existia `docs/` nem convencao de ADR aqui (`find . -maxdepth 2 -name "*.md"` em 2026-09-08 so achou `README.md`, `ANOTACOES.md`, `Instrucoes.md`, `padrao.md` e a pasta `relatorio/`). Formato adotado: MADR compacto do vault (`Conhecimento/Engenharia de Software/decisoes-e-revisao.md`), em portugues, para casar com o resto da documentacao do repo.

## Contexto e Problema

O dashboard "CEPT | Acompanhamento de Entregas" existe hoje como Google Apps Script standalone (v3.2.3), com tres planilhas como banco:

1. **Fonte oficial** — status, datas, aplicabilidade e componentes por Projeto x Disciplina x Edificacao.
2. **Planilha1** — responsabilidade (Projeto x Disciplina x QUANTA|TERCEIRIZADO + nome do terceiro), com casamento difuso do nome da disciplina (`mapResponsibilityDiscipline_`), linha coringa `TODAS` por projeto e a regra de heranca DREN/ESG <- HIDA (projetos 002-009).
3. **Validacoes** — log append-only de decisoes sobre alertas (RESOLVED / CONFIRMED_OUTDATED / REOPENED).

Duas decisoes ja foram travadas pelo dono do produto em 2026-09-08 e **nao se re-litigam aqui**:

- **D1** — a fonte de dados migra de Google Sheets para Firestore (fim de `SpreadsheetApp`/`DriveApp`/Sheets API).
- **D2** — a autorizacao para validar/resolver alerta sai da allowlist de 5 e-mails fixos (`APP_CONFIG.validationEditors`) e passa a ser checagem de cargo (Lider/Coordenador), igual ao resto do app.

O que **esta** em aberto e este ADR resolve: qual e o shape no Firestore, o que e persistido versus derivado na leitura, onde vive a assinatura que invalida validacao antiga, como a checagem de cargo e escrita (cliente e rules) e o que acontece com a normalizacao difusa de disciplina.

### Fatos do repositorio que restringem o desenho

| Fato | Evidencia |
|---|---|
| Nao existe backend. Todo acesso ao Firestore e client-side, SDK web, sem Admin SDK | `src/lib/firebaseDb.ts` inteiro; nao existe pasta `functions/`; `firebase.json` so declara `firestore.rules` |
| A sessao do Firestore e **anonima** por padrao | `src/lib/firebaseDb.ts:180` — `signInAnonymously(auth)` |
| Login Google existe, mas so e forcado em fluxo pontual (Agenda) | `src/lib/firebaseDb.ts:220` `ensureGoogleFirebaseAuth`, unico caller em `src/App.tsx:2402` |
| O cargo do usuario vem de uma lista dentro do blob de admin, nao de um doc por uid | `src/App.tsx:982-983`, `:1872-1873` (`role: raw?.role` ou `raw?.cargo`); blob salvo em `appData/{name}` + `appData/{name}/chunks/*` (`firebaseDb.ts:453-483`) |
| A convencao de collection e **plana, camelCase, um doc por registro** | `registroAtividades`, `registroAtividadesHistorico`, `nc2Records`, `resolvedAlerts`, `planningTodos` (`firestore.rules`) |
| Ja existem helpers genericos de collection — nao precisa escrever acesso novo | `firebaseDb.ts:1032` `fetchFirebaseCollection(nome, {field,value})`, `:1045` `setFirebaseDocument`, `:1056` `setFirebaseDocuments`, `:1076` `subscribeFirebaseCollection` |
| Ja existe precedente exato de "alerta resolvido por assinatura" | `src/components/CoordenacaoEngenharia/Alertas.tsx:302` — `setFirebaseDocument('resolvedAlerts', item.signature, {...})`; assinatura montada por join de string simples em `:146-152`, **sem hash criptografico** |
| Ja existe o predicado de cargo Lider/Coordenador, exportado e coberto por check | `src/components/NaoConformidade2/ncStore.ts:71` `isNc2Leader`; casos em `Conformidade.metrics.check.ts:284-288` |
| Ja existe a convencao de self-check rodavel por modulo puro | `src/lib/curvaS.check.ts`, `leaderActivity.check.ts`, `bancoGrid.check.ts` (`node:assert/strict`, sem framework) |
| `recharts@3.7.0` ja instalado | `package.json:27` — Google Charts (`google.charts.load`) **nao** entra como dependencia nova |

## Drivers

- Um dev, projeto pequeno/medio. Estrutura nova so com gatilho medido (`arquitetura-e-modularidade` §5).
- O rollup por familia (`status`, `percent`, `applicable`) e o `alert.severity` **nunca** foram verdade persistida no sistema de origem — sao sempre derivados dos componentes. Perder essa propriedade e a forma mais rapida de o dashboard passar a mentir.
- Escrita concorrente nao pode perder decisao de validacao (Protocolo §7: erro que perde dado nao se simplifica).
- Governanca item 5: a trava tem que existir **dentro do banco**, nao so na aplicacao.

## Opcoes Consideradas

1. **Espelhar a planilha**: um doc por Projeto x Disciplina com as familias e um array de componentes dentro.
2. **Componente como documento** (leaf-level), colecao plana, rollup derivado no cliente.
3. **Componente como documento + Cloud Function** para autorizar/gravar validacao e recomputar alertas server-side (seria a primeira Function do repo).

## Decisao

Adotamos a **Opcao 2**. O componente e o documento; familia, disciplina e projeto sao agrupamentos derivados na leitura, nunca documentos. Sem Cloud Function.

A Opcao 1 foi descartada por perda de dado: array dentro de doc so se reescreve inteiro, entao duas pessoas editando componentes diferentes da mesma disciplina ao mesmo tempo derrubam uma a escrita da outra (last-write-wins no array inteiro), e o pior caso e silencioso.
A Opcao 3 esta analisada em detalhe na secao "Por que nao Cloud Function".

### 1. Schema — caminhos de colecao

```
ceptComponentes/{recordKey}         # recordKey = "001|ARQ|RVT|<sourceType>"  (id do doc = identidade estavel; segmentos saneados, ver §5)
ceptValidacoes/{autoId}             # append-only, uma decisao por doc
appData/ceptResponsaveis            # doc unico: mapa "<projeto>|<disciplina>" -> responsavel (ja normalizado)
src/lib/ceptCatalog.ts              # constante: 9 projetos (001-009), ordem de entregaveis, aliases -- NAO e collection
```

Nomes em camelCase com prefixo `cept`, seguindo `nc2Records`/`registroAtividades`. Uma unica collection nova indexada + uma append-only + um doc de config: cabe inteiro nos helpers genericos que ja existem, nenhum acesso novo a Firestore precisa ser escrito.

**`ceptComponentes/{recordKey}`** — o entregavel real, unidade que os KPIs contam.

| Campo | Tipo | Nota |
|---|---|---|
| `recordKey` | string | igual ao id do doc; redundante de proposito, pra query e pra sobreviver a export |
| `projectCode` | `'001'`..`'009'` | filtro principal do dashboard |
| `disciplineCode` | string | ja normalizado no import (ver §5); `ELE` nunca chega aqui, so `ELET` |
| `family` | string | `RVT`, `PDF`, `IFC`, `MC`, `MD`, `ET/RT`, `MA` ou custom |
| `familyLabel`, `sourceLabel`, `sourceType` | string | rotulos vindos da fonte; `sourceType` compoe o recordKey |
| `format` | string | `PDF`, `DOCX`, `RVT`... |
| `editable` | `true` / `false` / `null` | `null` = "Natureza nao determinada". Derivado de `format` pela convencao de negocio, gravado junto pra o dado ficar auditavel sem a tabela |
| `status` | `'delivered'` / `'pending'` / `'na'` / `'unknown'` | **e o unico status persistido do sistema** |
| `dateIso` | `'YYYY-MM-DD'` ou `''` | fonte da verdade de data. `date`/`dateFull` sao formatacao, **nao** se grava |
| `edificacao` | string opcional | dimensao existente na planilha de origem |
| `updatedAt`, `updatedByEmail`, `updatedByNome` | | mesmo trio que `setFirebaseDocument` ja escreve e que `nc2Records` usa |

`sourceRow` **nao migra** — era o numero da linha da planilha, sem significado fora dela.

**Nao existe** doc de familia nem doc de disciplina. `status`/`percent`/`delivered`/`pending`/`applicable` da familia e de qualquer nivel acima sao `groupBy` sobre `ceptComponentes` no cliente. Isso preserva por construcao a propriedade do sistema de origem: nao ha lugar onde um rollup errado possa ser gravado e ficar mentindo depois.

**`ceptValidacoes/{autoId}`** — append-only, uma decisao por doc, mesmo papel da aba `Validacoes`.

| Campo | Nota |
|---|---|
| `recordKey` | identidade **estavel** do componente. E por aqui que se le historico |
| `projectCode` | gravado desde o dia 1 so pra permitir filtrar sem backfill quando a colecao crescer |
| `signature` | assinatura do estado da familia no momento da decisao. Campo de auditoria — nunca e lido como verdade do estado atual |
| `action` | `RESOLVED` / `CONFIRMED_OUTDATED` / `REOPENED` |
| `usuarioEmail`, `usuarioNome` | quem decidiu |
| `criadoEm` | `serverTimestamp()` — ordenacao autoritativa do servidor, nao relogio de cliente |
| `severity`, `reasons`, `fileDate`, `counterpartDate`, `observacao`, `version` | snapshot do que o usuario estava vendo quando decidiu |

Sem update, sem delete: corrigir uma decisao e escrever outra decisao (`REOPENED`). "Ultima decisao vence" = maior `criadoEm` entre os docs do mesmo `recordKey`. "Historico" = todos os docs daquele `recordKey`, atravessando varias `signature` ao longo do tempo — exatamente a semantica de origem.

**`appData/ceptResponsaveis`** — doc unico com o mapa `"<projectCode>|<disciplineCode>" -> { responsavel, tipo: 'internal'|'external'|'unidentified', origem }`, ja resolvido (coringa `TODAS`, heranca DREN/ESG, alias de disciplina). Reusa `appData/{name}` + `subscribeFirebaseAppData`, que ja existem: uma leitura, zero superficie de acesso nova, zero codigo novo.
*Teto conhecido:* o mapa e reescrito inteiro a cada edicao — dois administradores editando ao mesmo tempo perdem uma edicao. Aceito porque e dado de admin, raro e de um editor por vez (mesmo perfil de risco do blob `appData/admin`, que ja carrega a lista de usuarios inteira hoje). **Gatilho para promover a `ceptResponsaveis/{projeto__disciplina}`:** aparecer um segundo editor simultaneo de verdade.

**Projetos ficam em constante, nao em collection.** Os 9 codigos e nomes eram literal de configuracao no Apps Script (`APP_CONFIG.projectNames`) e continuam sendo. Colecao de 9 documentos que so mudam por decisao de contrato e estrutura sem gatilho. Espelha `src/lib/disciplineCatalog.ts`, que ja e o catalogo do repo. *Gatilho para promover a `appData/ceptCatalogo`:* o dono do produto precisar cadastrar projeto novo sem deploy.

**Trava dentro do banco (governanca item 5):** o `recordKey` como **id do documento** e a restricao de unicidade real — nao existe caminho, nem por bug de import, que crie dois componentes com a mesma identidade. A planilha nunca teve isso. Complementarmente, `ceptValidacoes` e append-only **pelas rules**, nao por convencao de codigo.

### 2. O que e persistido versus derivado na leitura

**Persistido:** `status` do componente, `dateIso`, `format`, `editable`, aplicabilidade, responsavel, e as decisoes de validacao.

**Derivado a cada leitura, no cliente, nunca gravado:**
- rollup de familia (`status`, `delivered`, `pending`, `applicable`, `unknown`, `percent`) e todo KPI/percentual acima dele;
- as tres regras de alerta (`POSTED_BEFORE_CUTOFF`, `EDITABLE_AFTER_NONEDITABLE`, `NONEDITABLE_MORE_THAN_7_DAYS_AFTER_EDITABLE`) e a severidade resultante;
- `validationSignature`;
- `validationStatus` efetivo do componente (`unreviewed` / `resolved` / `confirmed_outdated` / `open`), que sai do cruzamento entre a ultima decisao do `recordKey` e a assinatura atual;
- `displaySeverity` (o verde que so existe porque alguem validou).

Casa 1:1 com o comportamento de origem e com o padrao que este repo ja usa em `Alertas.tsx`, onde a lista critica e recalculada e cruzada com `resolvedAlerts` a cada render.

**Onde esse codigo mora:** modulo puro `src/lib/ceptModel.ts` (sem import de Firebase, entrada = arrays de componente e de validacao, saida = modelo do dashboard) + `src/lib/ceptModel.check.ts` com `node:assert/strict`, seguindo `curvaS.check.ts`. Uma unica implementacao das regras de alerta no sistema inteiro; se algum dia houver backend, ele importa este modulo em vez de reimplementar.

### 3. Assinatura e invalidacao de validacao

Vivem no mesmo `src/lib/ceptModel.ts`, calculadas na leitura.

- `recordKey = [projectCode, disciplineCode, family, sourceType].map(sanitizeKeySegment).join('|')` — identidade estavel, e o id do doc.

  **Correcao 2026-09-11 (achada na primeira carga real, nao no desenho):** a versao original
  deste ADR omitia o `sanitizeKeySegment` e era **impossivel de gravar**. Id de documento do
  Firestore nao pode conter `/`, e dois valores do dominio contem: a family canonica `ET/RT`
  (`ceptCatalog.ts:18`) e o `sourceType` cru da planilha (`"ET / RT (PDF)"`). Toda a carga
  falhava em ELET. `sanitizeKeySegment` (`scripts/migracao/cept-import.ts`) troca `\s*/\s*`
  por `-` e colapsa espaco repetido, entao `ET / RT`, `ET /RT` e `ET/RT` dao o mesmo id —
  sem isso, espaco a mais digitado na planilha criaria um documento novo na proxima carga e
  orfanaria as validacoes ja presas ao id antigo. **Os valores reais continuam intactos nos
  campos** `family`/`sourceType` do documento; so o segmento da chave e saneado, porque
  `ET/RT` e usado pela UI para ordenar (`deliverableOrder`).
- `signature = recordKey + '|' + <estado canonico da familia>`, onde o estado canonico e o join ordenado de `sourceType:status:dateIso:editable` de **todos** os componentes daquela familia. Muda quando qualquer componente da familia muda — que e exatamente o efeito desejado.
- **Sem SHA-256.** A origem usava hash so pra encurtar string; e chave de deteccao de mudanca, nao mecanismo de seguranca. `crypto.subtle.digest` e assincrono e nao tem lugar em caminho de render. `Alertas.tsx:146-152` ja resolve o mesmo problema com join de string; seguimos o idioma da casa.
- **Invalidacao:** a ultima decisao do `recordKey` so pinta o componente de verde se a `signature` gravada nela for igual a assinatura recomputada agora. Diferente = a decisao vira historico e o componente volta a `unreviewed`, com o alerta reaparecendo. Nenhuma escrita e necessaria para invalidar — a defasagem se resolve sozinha na comparacao.
- **Guarda de escrita:** antes de gravar a decisao, o cliente recomputa a assinatura a partir do snapshot vivo e recusa se ela mudou desde que o dialogo foi aberto (mesma mensagem de origem: "dados alterados desde que voce abriu a validacao"). Como os dados agora chegam por `onSnapshot` e nao por cache de 5 minutos, essa recusa fica mais rara — mas continua existindo para a janela entre abrir e confirmar.

### Por que nao Cloud Function

Seria a primeira do repositorio, entao o onus da prova e dela. O argumento a favor e real: no Apps Script, `saveValidationDecision` autoriza, re-le a fonte viva, recomputa, rejeita assinatura defasada e serializa com `LockService`. Client-side, nada disso e inviolavel.

O que mata o argumento: **uma Function nao consegue autenticar o autor neste app hoje.** A sessao do Firestore e anonima (`firebaseDb.ts:180`); uma callable receberia `context.auth.uid` de usuario anonimo, sem e-mail. E o cargo nem esta em documento por uid — esta dentro do blob `appData/admin` (`App.tsx:1872-1873`), inalcancavel tanto por rules quanto por uma Function que quisesse validar barato. Ou seja: a Function pagaria plano Blaze, pipeline de deploy, cold start e uma **segunda implementacao das tres regras de alerta** (a origem classica de divergencia silenciosa entre o que a tela mostra e o que o servidor aceita) e ainda assim nao fecharia o furo que a justificava.

O furo real nao e "falta backend", e "a sessao do Firestore nao sabe quem e o usuario". Enquanto isso nao mudar, Function e custo sem beneficio. Registrado como pre-requisito na secao de contingencia.

### 4. Controle de acesso

**Cliente** — reusa o predicado que ja existe, sem escrever um novo:

```ts
// src/components/NaoConformidade2/ncStore.ts:71 — importado, NAO duplicado
export function isNc2Leader(user: AuthUserLike) {
  const role = String(user.role || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
  return role.includes('lider') || role.includes('coorden');
}
```

E o casamento semantico exato de D2 ("Lider/Coordenador"), ja e exportado, ja tem cobertura (`Conformidade.metrics.check.ts:284-288`) e ja lida com o fato de que cargo e **texto livre digitado na Administracao** ("Lideranca", "Lider/Coordenador", "Coordenacao"), por isso casa por trecho e nao por igualdade. Escrever `isCeptValidator` seria um segundo dialeto da mesma regra.

Nao usamos `isLeadershipOrAdmin` (`firebaseDb.ts:338`), que e mais largo: inclui `geren`, `diretor`, `gestor`, `supervisor` e `isAdmin`. D2 diz Lider/Coordenador.

*Nao movemos `isNc2Leader` para `src/lib/`:* tocar 5 arquivos da NC2 para zero mudanca de comportamento nao se paga. **Gatilho para mover:** aparecer um terceiro consumidor, ou o import cruzado gerar ciclo.

**Firestore rules** — a serem acrescentadas em `firestore.rules`, mesmo bloco das collections operacionais:

```
match /ceptComponentes/{document} {
  allow read, create, update: if isSignedIn();
  allow delete: if false;
}

match /ceptValidacoes/{document} {
  allow read: if isSignedIn();
  allow create: if isSignedIn()
    && request.resource.data.action in ['RESOLVED', 'CONFIRMED_OUTDATED', 'REOPENED']
    && request.resource.data.recordKey is string && request.resource.data.recordKey.size() > 0
    && request.resource.data.signature is string
    && request.resource.data.usuarioEmail is string && request.resource.data.usuarioEmail.size() > 0
    && request.resource.data.criadoEm == request.time;
  allow update, delete: if false;
}
```

`update, delete: if false` e o append-only travado no banco, mesmo padrao de `registroAtividadesHistorico` e `atividadesLiderHistorico`. A validacao de shape no `create` e barata e impede lixo/enum invalido chegar na colecao.

**O que essas rules NAO fazem, dito sem rodeio:** elas nao verificam cargo. Nao ha como — a sessao e anonima, o token nao tem e-mail, e o cargo esta num blob. **A checagem de Lider/Coordenador e, nesta entrega, gate de interface, nao de seguranca.** Um usuario logado que fale HTTP consegue gravar em `ceptValidacoes` com qualquer `usuarioEmail`. Isso **nao e regressao** em relacao ao app: e exatamente o estado atual de `nc2Records`, ja documentado no proprio codigo em `ncStore.ts:68-70` ("isto NAO e seguranca — o gate real precisa de firestore.rules + custom claims de cargo (hoje nc2Records so exige isSignedIn()); decisao pendente de autorizacao humana"). Mas **e** regressao em relacao ao sistema de origem, onde a allowlist rodava no servidor. Ver "Consequencias / Piora".

**Pre-requisito para virar seguranca de verdade (fora do escopo deste ADR, exige decisao do dono):** trocar a sessao do Firestore de anonima para Google (`ensureGoogleFirebaseAuth` ja existe, `firebaseDb.ts:220`) **e** publicar o cargo em documento por identidade (ex. `usuariosCargo/{email}`), para que as rules possam fazer `get(...).data.cargo`. Isso muda o login do app inteiro e vale para NC2 tambem — pertence a um ADR proprio, nao a este porte.

### 5. Normalizacao difusa: pre-computada no import, uma vez

`mapResponsibilityDiscipline_` (casamento difuso de nome de disciplina), o alias `ELE -> ELET`, a linha coringa `TODAS`, a heranca DREN/ESG <- HIDA nos projetos 002-009 (com 001 isento) e a restricao TOPO/TSD-so-no-001 rodam **uma unica vez**, num script de importacao em `scripts/` (a pasta ja existe), e o resultado ja resolvido e o que vai para `appData/ceptResponsaveis` e para os `ceptComponentes`.

Por que: sao 9 projetos e ~20 disciplinas, conjunto fixo e pequeno. Casamento difuso e heuristica — mantida viva, ela roda em toda leitura de todo usuario, pode mudar de resultado quando alguem renomear algo na origem, e o dashboard passa a ter uma resposta que ninguem consegue explicar. Resolvida no import, o resultado fica **inspecionavel e corrigivel a mao** no banco. Cada entrada de responsabilidade carrega `origem` (`'linha_direta'`, `'coringa_todas'`, `'herdado_hida'`) para que se saiba de onde veio sem reexecutar a heuristica.

O script de import e conferido por um `.check.ts` que garante o invariante da restricao: nenhum `ceptComponentes` com `disciplineCode` em `['TOPO','TSD']` e `projectCode != '001'`.

## Consequencias

### Melhora
- Rollup e alerta ficam **impossiveis** de persistir errados: nao existe documento onde gravar um percentual. A propriedade que a origem mantinha por disciplina passa a ser mantida pela estrutura.
- `recordKey` como id de documento e unicidade travada no banco, nao mais convencao — a planilha aceitava duplicata, o Firestore nao aceita.
- `ceptValidacoes` append-only por rules: nem o app, nem um cliente adulterado, apaga historico de decisao.
- Some o `LockService.getScriptLock()` e com ele o gargalo de serializacao global do Apps Script; a ordenacao passa a ser `serverTimestamp()`, autoritativa e sem depender do relogio da maquina de quem clicou.
- Uma so implementacao das regras de alerta (`ceptModel.ts`), pura e testavel sem Firebase, com self-check rodavel — hoje elas so existem dentro de um script que so roda dentro do Google.
- Zero dependencia nova: usa `fetchFirebaseCollection`/`setFirebaseDocument`/`subscribeFirebaseCollection` que ja existem, `recharts` que ja esta instalado e `isNc2Leader` que ja esta escrito e testado.

### Piora
- **A autorizacao fica mais fraca do que era no Apps Script.** La, a allowlist de 5 e-mails era verificada no servidor e nao havia como contorna-la pelo cliente. Aqui, o gate de cargo e de interface; as rules so exigem `isSignedIn()` e nao enxergam quem e a pessoa. E o mesmo patamar de `nc2Records`, mas em relacao ao sistema de origem e uma regressao — e precisa estar assim escrito para nao ser descoberto depois.
- **Quem pode validar deixa de ser uma lista e passa a ser um campo de texto livre.** Qualquer usuario cujo cargo, digitado na aba Administracao, contenha "lider" ou "coorden" valida alerta. O conjunto e maior que 5 e muda sem que ninguem edite codigo. Controlar quem valida agora e controlar quem edita cargo.
- Uma leitura de dashboard traz da ordem de centenas a alguns milhares de documentos de componente. Barato hoje; cresce linearmente e sem teto natural, e `ceptValidacoes` so cresce.
- O modelo passa a ter tres origens de dado para cruzar no cliente (componentes, validacoes, responsaveis) em vez de uma planilha ja montada; o bug de "juntou errado" e novo e mora todo em `ceptModel.ts`.
- Duas pessoas resolvendo o mesmo alerta ao mesmo tempo gravam duas decisoes; a mais recente vence em silencio, sem tela de conflito. O `LockService` evitava isso.
- Some a planilha como interface de edicao em massa. **Quem mantinha o dado atualizado precisa de um lugar novo para faze-lo** (ver Gate aberto).
- `docs/` deixa de estar vazio, mas o repo continua sem `docs/visao-geral.md` e `docs/mapa-do-sistema.md` (itens 1 e 2 da governanca), agora com uma collection a mais para descrever.

### Contingencia
- Leitura ficar pesada (gatilho: primeira reclamacao de lentidao **medida**, nao suposta): filtrar `ceptComponentes` por `projectCode` no `fetchFirebaseCollection`, que ja suporta um filtro de igualdade; depois disso, doc de rollup por disciplina escrito no import, aceitando explicitamente que passa a ser cache defasavel.
- `ceptValidacoes` ficar grande (gatilho: consulta de historico lenta): filtrar por `projectCode`, que ja e gravado desde o dia 1 justamente para nao precisar de backfill; so entao considerar `ceptValidacoesAtual/{recordKey}` como espelho da ultima decisao.
- Precisar de autorizacao real: ADR proprio para sessao Google + cargo por identidade; **so depois disso** uma Cloud Function passa a fazer sentido, e mesmo assim importando `ceptModel.ts` em vez de reimplementar as regras.
- Reverter este ADR: as collections `cept*` sao aditivas e nao tocam nada existente. Reverter = parar de escrever nelas e apagar; nenhuma collection atual muda de shape. As unicas linhas alteradas fora do escopo novo sao os dois blocos `match` em `firestore.rules`.

## Confirmacao

Como se prova que esta decisao esta sendo seguida:

1. `src/lib/ceptModel.check.ts` roda com `npx tsx src/lib/ceptModel.check.ts` e cobre, no minimo: as tres regras de alerta (incluindo o vermelho no nao-editavel e o amarelo no editavel), o rollup de familia com componente `na` e `unknown` misturados, e a invalidacao — decisao gravada com assinatura antiga **nao** pinta o componente de verde.
2. `grep -rn "percent\|severity" src` nao acha nenhuma escrita desses campos em `ceptComponentes`; nenhum `setFirebaseDocument('ceptComponentes'` grava rollup.
3. `grep -rn "isCeptValidator\|validationEditors" src` volta vazio — o predicado de cargo nao foi reescrito nem a allowlist reintroduzida.
4. O check do import falha se existir componente `TOPO`/`TSD` fora do projeto `001`.

## Gate aberto para o dono do produto (nivel C — mudanca de escopo)

**Quem atualiza o entregavel no dia a dia depois que a planilha sai do circuito?** O Apps Script so lia; a planilha era editada por pessoas. Este ADR desenha o schema para os dois caminhos, mas a escolha e de produto, nao de arquitetura:

- (a) edicao dentro do app, gravando direto em `ceptComponentes` com o mesmo gate de cargo — recomendado, e o que fecha o ciclo e o unico que justifica ter tirado a planilha;
- (b) reimportacao periodica por script a partir de um export, mantendo a planilha viva como fonte de digitacao — contradiz D1 na pratica.

Enquanto isso nao for respondido, o script de importacao serve de carga inicial e o dashboard e somente-leitura sobre ela.

## Mudancas de comportamento visiveis ao usuario

1. Alertas e percentuais passam a atualizar **em segundos** via `onSnapshot`, nao a cada ~5 minutos: numero pode mudar sozinho na tela enquanto o usuario olha.
2. A validacao de outra pessoa aparece na hora, sem recarregar a pagina.
3. A recusa "dados alterados desde que voce abriu a validacao" fica mais rara (dado ja chega vivo), mas nao desaparece.
4. Quem pode validar deixa de ser 5 e-mails fixos e passa a ser todo cargo com "lider"/"coorden" — conjunto maior, alteravel pela aba Administracao sem deploy.
5. Duas validacoes simultaneas do mesmo alerta nao dao mais erro de lock: as duas gravam, a mais recente prevalece, sem aviso.
6. Some o link "abrir a planilha do projeto" e a referencia a linha de origem (`sourceRow`): nao ha mais planilha para abrir.
7. Os graficos mudam de aparencia: Google Charts sai, `recharts` (ja instalado) entra.
8. Qualquer usuario autenticado le os dados de entrega de todos os 9 projetos — nao ha recorte por disciplina no banco, igual as demais collections do app.
