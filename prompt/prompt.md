# Ecoquanta2 — prompt do Codex (rodada 06)

Execute do início ao fim, sozinho. **Prioridade: funcionar 100% > economia de
token. Tempo não é critério.** Solução de raiz, não remendo.

## Regras fixas

- Só arquivos locais. Nunca commite — deixe a árvore suja pro Igor.
- Nunca escreva no Firestore de produção como teste.
- Ponytail: reuse o que já existe, menor diff que resolve de verdade.
  Sem dependência nova, sem `npm install`.
- Rode os checks e **cole a saída real** no relatório. "Não consegui rodar" é
  aceitável; alegação falsa não é.
- Saída em `nãocommit\prompt codex <dd-MM-yyyy> 06\` **e cópia em
  `Ecoquanta2\relatorio\rodada-06.md`** (pasta monitorada).

## Não desfaça o que eu já corrigi na árvore

Duas correções minhas já estão aplicadas em `src/components/Atividades.tsx`:
1. `<option value="Normal">Normal</option>` no select de dificuldade (antes
   gravava `"Regular"`, valor fora do tipo `LeaderDifficulty`; o
   `as LeaderDifficulty` escondia isso do `tsc`).
2. O detalhe da atividade da **Área Técnica** virou **full screen**
   (container `fixed inset-0 z-50` + `h-full w-full`, sem `max-w-[980px]`).
   **O popup deve existir apenas para o chat de Issues/Observações**
   (`z-[220]`, `max-w-xl`). Não devolva o detalhe da atividade para modal
   centralizado.

## Já feito e auditado nas rodadas 04/05 (não refaça)

Issues com coleção `atividadesIssues` + bolinha vermelha no card
(`Atividades.tsx:2598`) + bloqueio com trava real de coordenador
(`:3327-3329`) + observações acumulativas; filtro OS/disciplina na
Coordenação de Engenharia; bug das abas (Curva S sumindo) resolvido; Project
e P.Cronograma fora do menu; botão do VBA ligado; `ImportBIM360.gs` com
`Utilities.unzip` e leitura por `r=`; parser BIM360 corrigido na raiz.

---

## SEÇÃO 1 — BUG: o importador BIM360 é código morto

`src/components/NaoConformidade2/Conformidade.tsx` tem a função
`importarBim360` (~255-268) e os estados `bimImporting` / `bimImportMessage`
(~252-253) — **mas nada no JSX os utiliza**. Não existe `<input type="file">`
nem botão. A importação inteira, que já funciona na camada de dados
(`syncBim360Quality` em `src/lib/bim360Import.ts`, teste passando com o
arquivo real: `264 Quality`), **não tem como ser acionada pelo usuário**.

Faça:
1. Renderize o ponto de entrada na tela de Conformidade: um botão/seção
   "Importar Quality (BIM360)" com `<input type="file" accept=".xlsx">`
   ligado a `importarBim360`, e a exibição de `bimImportMessage`
   (que já monta o texto `X criados, Y atualizados`) e do estado de
   carregamento `bimImporting`.
2. Siga o padrão de input de arquivo já usado em
   `src/components/Planejamento/ImportarEAP.tsx` — não invente outro.
3. Posicione perto do cadastro de terceirizadas, que já é renderizado nessa
   mesma tela.
4. **Confirme por grep** que não sobrou nenhuma outra função/estado órfão
   nesse arquivo (mesmo sintoma, outro lugar) e reporte o que achou.

Verificação: `npm run lint` + citar a linha do JSX onde o input passou a
existir. Se conseguir, valide no navegador (o Vite sobe em `localhost:2500`
a partir de um checkout local, não UNC).

---

## SEÇÃO 2 — Nova aba "Coordenação" para o CLIENTE

Nunca foi construída (confirmado: `src/App.tsx:250` só tem
`{ key: 'controle', label: 'Coordenação de Engenharia' }`, que é a tela
interna; `Contrato` é outra coisa).

Objetivo: o cliente, logado e travado no contrato dele, vê **num painel só**
as atividades das OS do seu contrato **junto com** as notas relacionadas a
esse contrato, agrupadas por OS. **Somente leitura para o cliente.**

Infraestrutura que já existe — **reuse, não recrie**:
- `src/App.tsx` ~231-240 `shouldLockUserToContract()` e ~1764-1773
  `lockedContractCode`: já resolvem e travam o contrato do cliente.
- `src/components/CoordenacaoEngenharia/Contrato.tsx` ~140-144
  `matchesContract()`: já filtra atividades por `contratoCodigo`.
- `src/components/CoordenacaoEngenharia/Notes.tsx` ~66-75 `scopedNotes`:
  já filtra notas por contrato.
- `AnotacoesFilter` (`Anotacoes.tsx:198`) e os campos plurais
  `osCodigos[]` / `disciplinas[]`.

Faça:
1. Crie o componente combinado reusando `Atividades` e as notas como
   sub-blocos — **não reescreva a renderização deles**.
2. Agrupe por OS do contrato do cliente.
3. Registre a aba no mesmo lugar e no mesmo padrão das outras abas de topo
   (veja como `headerTabs` monta os grupos em `App.tsx:3646-3709`, e como o
   acesso por papel é resolvido com `userHasTabAccess`).
4. **Garanta o isolamento**: um cliente nunca pode ver atividade ou nota de
   outro contrato. Escreva um self-check
   `src/lib/coordenacaoCliente.check.ts` (padrão `assert` + `npx tsx`) que
   prove, com dados de dois contratos diferentes, que a filtragem não vaza
   nada do contrato B para o cliente do contrato A. **Esse teste é
   obrigatório** — é isolamento entre clientes, não é detalhe.

---

## SEÇÃO 3 — Varredura de código morto (mesmo bug da Seção 1, em outros lugares)

A Seção 1 revelou um padrão perigoso: função pronta, testada na camada de
dados, e **sem ponto de entrada na interface** — o `tsc` não acusa e o
recurso parece pronto no relatório.

Varra `src/` procurando o mesmo sintoma: handlers/estados declarados e nunca
referenciados no JSX, especialmente em torno de features recentes
(BIM360, VBA do Project, issues, bloqueio, observações, importação de EAP).
Liste **cada ocorrência** com `arquivo:linha` e diga se é (a) código morto de
verdade que precisa de ponto de entrada, (b) sobra a remover, ou (c) uso
legítimo que o grep não pegou. **Não saia deletando** — liste e proponha; só
remova o que for claramente sobra sem efeito colateral.

---

## Ao terminar (formato obrigatório)

`RELATORIO-FINAL.md` na pasta da rodada + cópia em
`Ecoquanta2\relatorio\rodada-06.md`, com **uma seção por seção deste prompt**:

```
## Seção N — <título>
Feito: <o que mudou, com arquivo:linha>
Verificação: <comando> → <saída real colada>
Pendente: <o que não saiu e por quê>
```

E no fim:
- `DECISIONS`: decisões que você tomou que não estavam escritas aqui.
- `BLOQUEIOS`: o que não conseguiu concluir e o motivo concreto.

Nada commitado. Lembre o Igor de revisar `git status` / `git diff`.
