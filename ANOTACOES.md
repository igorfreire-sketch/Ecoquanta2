# Anotações — sessão de ajustes EcoQuanta

> Resumo do que foi mexido nesta rodada, pra reler com calma. Nada aqui é urgente.

---

## 1. A pergunta principal: precisa mexer nas rules ou no code.gs?

**NÃO. Nenhum dos dois.** Verifiquei no código:

- **firestore.rules — não muda.** Salvar disciplina / pré-cadastro grava em `appData/admin`.
  A regra que já existe libera qualquer usuário logado a escrever em `appData`:
  `match /appData/{document} { allow read, write, delete: if isSignedIn(); }`.
  Então a correção já é permitida pelas rules atuais.
- **code.gs — não muda.** As configs de admin (disciplinas, usuários, pré-cadastro) **não passam
  pelo Apps Script** — as funções `syncAdminSnapshotToAppsScript*` são no-ops (vazias de propósito).
  Admin é 100% Firebase. O code.gs segue só alimentando os dados da planilha/EAP, como sempre.
  A aba "Importar EAP" é só um ajudante: valida/corrige o texto e devolve pra você colar na
  planilha — **não escreve em lugar nenhum**, não é input direto no site.

> Observação de segurança (não é pra agora): a regra do `appData` é permissiva — qualquer logado
> pode escrever, não só admin. É o desenho que já existia. Se um dia quiser travar, aí sim mexe nas
> rules. Só registrando.

---

## 2. O que mudou nesta sessão

### Navegação e visual (App.tsx e componentes)
- **Setas ← / →** trocam a sub-aba dentro do setor (ex.: Curva S → Notas, ← Atividades).
  Para nas bordas, não pula de setor, e ignora quando você está digitando num campo.
- **Troca de página = fade in/out ~0,5s** (só opacidade, sem deslize) — cobre o tempo de load.
- **Rail (barra esquerda) abre/fecha em 0,5s** — mais fluido.
- **Caminho (breadcrumb) fixo no topo** em todas as páginas: `ÁREA › Sub-aba`
  (ex.: `COORDENAÇÃO DE ENGENHARIA › CURVA S`). Fica numa faixa de altura fixa, fora do scroll e
  fora do fade — **o nome não muda mais de lugar** ao trocar de aba.
- **Toda página nasce no mesmo ponto** (padding do `<main>` uniforme) — acabou a sensação de
  deslocamento.
- **Árvore/folha do rail mais visível** (opacidade 0,07 → 0,18).
- **Curva S:** balões agora do tamanho do texto e centralizados, numa distribuição harmônica
  (acabou o "3 em cima / 6 embaixo"); barra de botões reorganizada; **gráfico dentro de um balão
  sólido** (sem transparência) pra leitura fácil.
- **Atividades:** a folha do fundo agora aparece atrás do quadro.
- **Importar EAP:** as caixas de texto deixaram de ser 100% opacas — agora translúcidas, no padrão.

### Bug do modo Gantt / Mapa Mental / editor de Notas brigando com a barra lateral
- Causa: o `<main>` é `relative z-10` (cria um "contexto de empilhamento") e tem `overflow-y-auto`;
  os overlays de tela cheia eram `fixed z-[200]` **dentro** do main, então o rail (`z-40`) ficava
  por cima e o overflow do main cortava/empurrava pra baixo.
- Correção: portei Gantt, Mapa Mental **e o editor de Notas** pro `document.body` (createPortal) —
  saem do main e cobrem a tela de verdade, sem conflito com o rail.
- Efeito no editor de Notas: clicar em "+ Nova nota" ou abrir uma nota existente agora abre em
  tela cheia (não mais "lá embaixo" nem cortada), fundo sólido, igual Gantt/Mapa Mental.

### Cadastro com e-mail duplicado
- O `code.gs` **já barra** e-mail repetido nos dois caminhos (planilha linha ~503 e Firebase
  linha ~2259), devolvendo "Este e-mail ja esta cadastrado." — e o LoginScreen já mostra esse erro.
- Se ainda estava deixando passar, o suspeito é o **Apps Script publicado estar mais antigo** que o
  code.gs do repositório. (Se quiser, é só republicar o Apps Script; não é obrigatório por causa do
  item abaixo.)
- Adicionei uma **trava no cliente** (`handleRegister`): antes de chamar o Apps Script, lê os
  usuários do `appData/auth` (Firebase, leitura anônima) e barra o e-mail duplicado na hora com
  "Este e-mail já está cadastrado." Funciona independentemente da versão publicada do code.gs.

### Dados / persistência
- **Bug "itens somem no admin" (disciplinas/cargos/alocações): corrigido.** Antes só viravam
  rascunho e dependiam do botão "Salvar" global; no reload sumiam. Agora **salvam na hora** em
  `appData/admin` (igual já acontecia com edição de usuário).
- **Pré-cadastro:** também salva na hora — passa a valer pra todos os admins de forma confiável.
- **Aba Firebase mostrava incompleto: corrigido.** Os documentos grandes (`eap`, `registro`,
  `cronograma`, `menu`, `notes`…) são gravados pelo Apps Script em pedaços (**chunked**): o
  documento-pai guarda só `{ chunked: true, chunkCount: N }` e o conteúdo real fica numa
  subcoleção `chunks` que a aba não lia → apareciam vazios. Agora a aba usa o próprio leitor do
  app pra **desembrulhar e remontar** o conteúdo. As 12 coleções que o app usa já estavam todas
  listadas — não faltava nenhuma.

---

## 3. O que você precisa conferir no navegador (porta 2500)

São coisas que dependem do Firebase real / render, não dá pra provar por `tsc`:

1. **Disciplina nova:** adicione uma, dê F5 — deve continuar lá (sem clicar em "Salvar" global).
2. **Pré-cadastro:** adicione um, dê F5 — deve continuar.
3. **Aba Firebase:** abra `appData → eap` (ou `cronograma`) — agora deve mostrar o conteúdo
   completo, com o selo "chunked · N partes · conteúdo remontado".
4. **Gantt e Mapa Mental:** abra os dois — a barra lateral não deve mais aparecer por cima.
5. **Curva S:** balões proporcionais e gráfico dentro do balão sólido.

---

## 4. Pendências conhecidas (não são desta sessão)

- **Cronograma às vezes com 0 itens:** é dado, não código — o `cronograma` chega vazio do
  Firebase; precisa republicar o snapshot pelo Apps Script.
- **Mojibake (acentos quebrados) em `Atividades.tsx`:** já existia antes, não mexi — decisão sua
  se quer que eu limpe depois.
- **Input de dados direto pelo site:** decidido que NÃO agora — segue pelo code.gs/planilha.

---

## 5. Onde está documentado o resto

O padrão visual e de navegação completo (folha aberta, balões, breadcrumb, animações, daltônico)
está no vault Obsidian: `Projetos/Ecoquanta/04 - Padroes Operacionais.md`.
A análise da planilha EAP: `Projetos/Ecoquanta/06 - Planilha EAP (fonte de dados).md`.
