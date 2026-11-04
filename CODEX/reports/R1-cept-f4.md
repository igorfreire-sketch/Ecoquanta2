# R1 — CEPT F4 — 2026-11-04

STATUS: COMPLETE-WITH-EXCEPTIONS — entrega R1 revisada e concluída para OS061; cada U/X está implementado ou explicitamente delimitado abaixo.
Branch: `feat/cept-gerenciamento`; base inicial `8bf1acad`. Apenas `analise/**` e este relatório fazem parte da entrega.

## ITEMS_DONE

| Item | Implementação / evidência relativa ao worktree |
|---|---|
| U1 | Seis KPIs; aplicáveis = delivered + pending, alertas = vermelho + amarelo, projetos/disciplinas apenas aplicáveis (`analise/model.ts`, `kpis`; `analise/index.tsx`). Estado vazio mantém os seis cards zerados. |
| U2 | Donut, L de alertas, projetos, entregáveis com meias-luas, disciplinas e responsáveis (`analise/Charts.tsx`). Barras recebem foco/Enter/Espaço; OS061 sem hierarquia de subprojetos. |
| U3 | Sete filtros + data Até/Entre/Depois de, busca sem acento, limpar/selecionar visíveis, aviso de intervalo invertido; filtro de data exclui registros sem dateIso (`analise/Ui.tsx`, `model.ts`). |
| U4 | Matriz sticky, quatro estados, fração parcial, última data em família entregue, tooltip e roteamento de alerta único/múltiplo/ausente (`analise/Matrix.tsx`, `model.ts`, `index.tsx`). |
| U5 | Quinze contextos, chips, N/A, busca, ordenação cronológica, validação e seleção em lote só para validador (`analise/Modals.tsx`, `model.ts`). Mudança de contexto reinicia estado; snapshots preservam estado do mesmo detalhe. |
| U6 | Feed agrupável/paginado, acesso ao histórico geral, níveis geral/família/célula, variantes e buscas independentes (`analise/Modals.tsx`). Corrigido grupo vazio que escondia todo o histórico. |
| U7 | Warning de responsável, meta, erros separados por leitura, retenção de dados anteriores e tentativa novamente (`analise/index.tsx`). Uma coleção bem-sucedida não apaga erro de outra. |
| U9 (retrato) | Filtros recolhíveis, gráficos responsivos, modal de tela cheia com corpo rolável e cabeçalho fixo; confirmado em Chrome 390×844 (`analise/Ui.tsx`, `index.tsx`). |
| X1 | CSV com BOM, aspas escapadas, separador `;`, CRLF, setas ASCII e nome original (`analise/exports.ts`, `historyCsv`). Neutraliza fórmulas em textos fornecidos por usuários. |
| X2 | Histórico PDF: oito colunas, medidas proporcionais 28/18/45/20/40/22/15/65, seta vetorial e paginação com cabeçalho repetido (`analise/exports.ts`, `pdfTable.ts`). |
| X3 | Executivo em seis páginas: métricas/donut vetorial, quatro gráficos/interpretação e alertas/rastreabilidade; captura do gráfico com fallback vetorial se indisponível, inclusive na visão Matriz (`analise/exports.ts`). |
| X4 | PDF de validação com contexto/motivos e oito colunas incluindo Contraparte (`analise/exports.ts`). |
| X5 | PDF matriz: completa ignora filtros, visão geral em blocos de até 24 disciplinas, detalhe por projeto, PRJ Ed./PRJ PDF e tags de alertas (`analise/exports.ts`). Paginação adicional preserva conteúdo quando necessário. |
| X6 | Visão consolidada usa linhas/busca/ordem correntes e nomes sem data (`analise/exports.ts`, `Modals.tsx`). |
| X7 | Detalhe exporta exatamente as linhas visíveis e ordenadas, com contexto/resumo e nove colunas (`analise/exports.ts`, `Modals.tsx`). |

## ITEMS_LEFT

- **U8: troca real de OS** — apenas OS061 está implementada na camada existente; OS054 segue desabilitada por depender do adapter/Sincronizador fora deste escopo. O handler limpa filtros/data, mas a troca real entre duas OS não pode ser homologada nesta entrega.
- **U9: claro/escuro** — botão escuro omitido pelo default explícito F0 G2: tema escuro foi removido do app. Reativá-lo depende de decisão do Igor e alteração fora de `analise/**`.
- **U2/U3: hierarquia e filtro de subprojeto OS054** — sem dados/adapter correspondente; nenhuma estrutura fictícia foi adicionada.
- **F0: folha inferior de filtros em mobile** — preservado painel recolhível inline; implementá-lo como folha inferior continua ajuste visual pendente. Não altera filtros nem dados.
- **Aceitação autenticada** — validação individual/lote, conflitos, stale/no_alert reais, histórico de origem/migração e rules publicadas precisam de ambiente autorizado. A implementação usa a camada existente, mas nenhum desses writes foi executado.
- **X3: captura visual de todos os gráficos reais** — fallback vetorial e estrutura de seis páginas testados; captura com html2canvas está implementada, mas não foi homologada com dashboard autenticado/dados de produção.

## FILES_CHANGED

Todos sob `src/components/CeptV2/analise/`:

- `index.tsx`: integra dados, estados, permissões e modais.
- `Charts.tsx`, `Matrix.tsx`, `Modals.tsx`, `Ui.tsx`, `model.ts`: trabalho F4 existente preservado, revisado e corrigido.
- `exports.ts`: exportações revisadas, CSV seguro e gráficos de fallback.
- `PdfOptions.tsx`: diálogo de opções no top layer nativo, acessível sobre os demais modais.
- `pdfTable.ts`: tabela/paginação local com quebra de linha e escala de colunas para outros papéis/orientações.
- `model.check.ts`, `exports.check.ts`, `ui.check.ts`: regressões de domínio visual, exportação e interação local.
- `CODEX/reports/R1-cept-f4.md`: este relatório, explicitamente autorizado no brief.

## DECISIONS

- Fonte/cores/hierarquia seguem F0: Montserrat, base branca/cinza, marca laranja e tokens de status distintos de severidade. Nenhuma alteração no shell/rail.
- A F0 sugeria adicionar `jspdf-autotable`; package.json/package-lock.json já estavam modificados antes de R1 e estão fora dos arquivos próprios. Preservados sem staging. F4 usa apenas jsPDF já versionado, com paginação local testada; não depende dessas mudanças pendentes.
- Não reutilizei `PdfExportDialog` do shell: ele usa portal com z-index, que fica atrás de `<dialog>.showModal()`. `PdfOptions` usa a mesma semântica de papel/orientação no top layer, mantendo foco/Esc e retorno ao modal anterior.
- Multi-filtro permanece local: atingir os rótulos/controles F0 sem modificar o componente compartilhado está fora do contrato desta frente. Sem mudança da API comum.
- Indicador usa “Conectado · dados recebidos”, em vez de afirmar “Ao vivo”: a assinatura compartilhada não expõe metadata `fromCache`. Falhas parciais/offline são visíveis e desabilitam ações de validação na UI.
- Texto de rastreabilidade não fixa “cinco usuários”: a allowlist vem do banco; número literal poderia estar desatualizado. As rules continuam sendo a autoridade.

## VALIDATION

- `npm run build`: PASS, 41,73 s; avisos preexistentes de imports mistos e bundle >500 kB.
- `npm run lint`: PASS (`tsc --noEmit`).
- `node --import tsx src/components/CeptV2/analise/model.check.ts`: PASS, incluindo todos os quinze contextos, KPIs, filtros, matriz e histórico.
- `node --import tsx src/components/CeptV2/analise/exports.check.ts`: PASS; 12 PDFs A4 em paisagem/retrato, executivo com seis páginas em ambos, histórico paginado, 40 disciplinas em blocos, vazio recusado e nome consolidado sem data.
- `node --import tsx src/components/CeptV2/analise/ui.check.ts`: PASS, estados vazio/somente leitura em SSR.
- Fixture `ui.check.ts --serve` + `--browser`: PASS em Chrome headless 1440×1000/390×844, com requisições externas bloqueadas; teclado no gráfico, PDF sobre modal aberto, histórico geral/família, Esc e ausência de overflow horizontal do body.
- Rules puras com os três XLSX: PASS; 21 alertas (5 vermelhos, 16 amarelos), 12 verdes, 62 fórmulas sem divergência, 111/111 responsabilidades. Checks de parse do preenchimento e firestoreRules: PASS.
- PDFs abertos/renderizados com PyMuPDF: nenhum bloco fora da página nos 12 arquivos; revisão visual de executivo e tabela, além dos screenshots desktop/mobile.
- Artefatos de QA: `%TEMP%/ecoquanta-r1-pdfs`; Playwright instalado somente em `%TEMP%/ecoquanta-r1-tools`, sem alteração do manifesto.
- Reprodução browser: iniciar `ui.check.ts --serve`; definir `R1_PLAYWRIGHT` para `playwright/index.mjs` e `R1_CHROME` para o Chrome; executar `ui.check.ts --browser`. `R1_PDF_OUTPUT` opcional salva PDFs/screenshots.

## BLOCKERS

- Nenhum bloqueio para revisar/commitar esta entrega. Exceções funcionais e de homologação listadas em ITEMS_LEFT.
- Mudanças preexistentes em `package.json` e `package-lock.json` continuam pertencendo à outra frente; não foram incluídas no commit R1.
- Sem Firestore write, rules publish, merge em main ou subagentes. Não houve deploy.
