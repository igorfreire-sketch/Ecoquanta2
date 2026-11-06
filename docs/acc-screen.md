# Qualidade ACC - tela e validacao

## Dados e compatibilidade com o importador

`accResumo/atual` e lido uma vez por carregamento da aplicacao. O resumo ausente e tratado como `{ osVersions: {}, empresas: [] }`.

Como o contrato define totais cruzados sem fixar a codificacao, a tela aceita `totais: { cruzamentos: [...] }` ou `totais: [...]`. Cada linha representa uma combinacao de `os`, `setor`, `tipo`, `empresa`, `status`, `mes` (AAAA-MM) e `count` (numero de issues). `criadoEm` tambem pode fornecer o mes. `contratoCodigo` pode vir na linha; quando ausente, a tela resolve pelo cadastro de OS do app. Nao sao necessarios IDs, titulos ou descricoes nas linhas agregadas. Os fixtures mostram essa estrutura. Um resumo nao vazio sem cruzamentos gera erro explicito em vez de exibir totais incorretos. O importador de outro worker precisa produzir uma dessas duas representacoes; nao foi executado nem alterado aqui.

Resumo grande: o pai pode fornecer `chunkCount`; os fragmentos em `chunks/00000`, `00001`, ... usam `value` ou `json`, concatenados em ordem. O JSON resultante e o resumo completo. Para `accOs/{os}`, o JSON resultante e a lista de issues, conforme o padrao de appData existente. `json` direto tambem e aceito. O hash do documento, quando presente, deve coincidir com `osVersions`; divergencia interrompe a leitura para evitar guardar uma importacao parcial no cache.

## Edicao e legado

Preenchimento cria somente documentos `qualidadeManual`. Revisoes e o unico editor de itens existentes. A identidade OS/ID do ACC permanece fixa; todos os campos de conteudo podem ser alterados. Os documentos `accOs` e `nc2Records` nao sao escritos pela tela. Edicoes ACC usam o ID de documento `<os>-<id>` e apenas campos alterados, `editadoPor` e `editadoEm`; o ID do documento nao substitui o ID da issue. A reimportacao altera apenas a base; overlays continuam sendo aplicados sobre ela. A tela identifica os campos editados e mostra o valor importado atual que foi substituido. Uma segunda edicao pode voltar ao valor ACC. Edicoes de itens manuais persistem em `qualidadeManual`.

O Dashboard inclui todos os antigos `nc2Records` em um painel de leitura, inclusive registros sem problema, arquivados e com historico. Nenhum documento e migrado, apagado ou regravado. Os graficos contam uma ocorrencia por linha antiga com T > 0, como o dashboard anterior, e nao a quantidade numerica de T. C/T, chat historico e campos de encaminhamento ficam preservados no documento original. Chat, marcacoes de leitura, encaminhamento e operacoes por setor foram retirados das telas. O quadro de notas/propostas da Principal conserva o comportamento anterior em `NotesKanban.tsx`; os arquivos de notas nao foram alterados.

Terceirizados usa somente nomes e checkboxes em `accTerceirizadas`. O cadastro administrativo anterior e seus dados permanecem intactos. Quanta Consultoria e empresa vazia sempre contam como internas, mesmo que aparecam marcadas em dados antigos.

## Leituras e cache

Carga compartilhada por sessao: 1 documento de resumo (+ seus chunks se existirem), uma consulta a `accEdicoes` (E documentos), uma a `qualidadeManual` (M), uma a `nc2Records` (L) e uma a `accTerceirizadas` (T). Sao contagens logicas de documentos, nao medicao de cobranca. Nao ha listener nessas colecoes.

Dashboard e Principal: para corrigir os totais, leem somente as OS que possuem overlay (U OS). No cache frio, acrescentam U documentos-pai e seus chunks. Cada issue editada subtrai 1 da combinacao original e adiciona 1 na combinacao efetiva; filtros, totais e PDF usam o mesmo resultado. Identificadores que nao existem mais no snapshot atual nao alteram os totais.

Revisoes: baixa somente a OS selecionada e seus chunks, nunca as outras OS por causa dos graficos. As consultas compartilhadas nao baixam issues ACC. Nenhuma OS e baixada ao abrir Preenchimento ou Terceirizados. Reaberturas com o mesmo hash usam IndexedDB (ou memoria na mesma sessao), sem buscar novamente o documento-pai. Um hash novo invalida apenas aquela OS. Chamadas simultaneas para a mesma OS/hash compartilham a mesma Promise. Falha de IndexedDB permite leitura online.

Depois de salvar uma entrada, overlay ou empresa, as consultas de manuais/legado/overlays/empresas sao refeitas para atualizar a tela. O resumo continua sendo o snapshot inicial e as OS com hash igual continuam em cache. Reabrir a pagina obtem o novo resumo diario.

## Executar verificacoes

- `npm ci`
- `npm run lint`
- `npm run check:quality`
- `npm run check:quality-ui` (Google Chrome instalado; apenas localhost)
- `npm run build`

O teste de UI inicia e encerra seu proprio Vite em 127.0.0.1:2501. Usa `scripts/fixtures/quality.html?accFixture`, componentes reais e IndexedDB real entre recargas. A injecao de fixtures depende de DEV, e a pagina de testes nao faz parte do build de producao. Qualquer chamada Firebase e bloqueada e registrada como falha. Saidas: `relatorio/acc-ui/matrix.json`, capturas desktop/mobile e PDF baixado. Nenhuma fixture e gravada no Firebase.

As regras foram preparadas somente no arquivo local conforme o contrato: autenticados leem ACC e seus chunks, sem escrita; autenticados leem/criam/atualizam overlays, manuais e checkboxes. Nenhuma regra foi publicada. Producao depende da publicacao dessas regras pelo responsavel, alem da primeira importacao. Nao houve deploy, merge, acesso a secrets ou escrita em producao.

## Matriz executada em 2026-11-06

Chrome headless, componentes reais, sem chamadas Firebase. Base: 5 issues (OS061 = 3; OS068 = 2), 3 abertas e 2 concluidas/fechadas.

| Recorte / acao | Esperado e observado |
| --- | --- |
| Contrato OUTRO | 0 |
| OS061 | 3 |
| Mes 2026-11 | 3 |
| Setor Arquitetura | 3 |
| Tipo Desenho | 2 |
| Terceirizada sim | 3 |
| Status Aberto | 2 |
| Sete filtros: MRK / 061 / 2026-11 / Eletrica / Relatorio / sim / Pendente | 1 |
| Segunda abertura, hash igual | 0 buscas de OS, 2 hits IndexedDB |
| Hash061 alterado, hash068 igual | 1 busca de 061; nenhuma de 068 |
| Desmarcar Projetos Alfa | terceirizadas 3 -> 1, mesmo total 5 |
| Nova empresa + entrada manual | total 6, terceirizadas 2 |
| Overlay 061-#1: Fechado / Eletrica | total 6, abertas 3; filtro Eletrica + Fechado = 1 |
| Voltar status do overlay para Aberto | abertas 4 |
| Principal | 2 cards, clique em 068 abre Revisoes com OS068 |
| Editar manual em Revisoes | mesmo item, titulo atualizado |
| Legado: 2 registros, uma linha T=4 e outra T=0 | ambos visiveis, apenas 1 ocorrencia somada, total 7 |
| Revisoes direta em 068 com overlay em 061, cache frio | somente 068 buscada |
| Resumo vazio | renderiza total 0 |
| PDF | download concluido, nome qualidade e extensao PDF |
| Mobile 390x844 | sem overflow horizontal; graficos renderizados |

`npm run lint`, `npm run check:quality`, `npm run check:quality-ui` e `npm run build` passaram. Build preserva avisos de tamanho de bundle/imports mistos existentes no app. Checks de regras sao estaticos; nao foi executado deploy nem teste contra producao. Fixtures e sua pagina nao aparecem no bundle de producao. Capturas desktop/mobile foram inspecionadas visualmente.

## Revisao dos commits recebidos

- `2a64f982`: inventario cobre os consumidores de chat e encaminhamento. A descricao final foi ajustada para distinguir snapshot ACC imutavel de overlays editaveis, conforme a secao Screen.
- `4854923e`: base de leitura/cache e fixtures reaproveitada. Foram completados resumo fragmentado, correcao por overlay, validacao de hash/JSON, fallback de IndexedDB e coalescencia de leituras. O teste inicial de cache em memoria foi ampliado para IndexedDB real entre recargas no navegador.
