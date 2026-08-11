# Cronogramas — export para IA

Exportado por igor.freire@quantaconsultoria.com em 10/08/2026, 13:34:48. Total: 1 cronograma(s).

Este documento reune os cronogramas visiveis a quem exportou (privados dele + publicos de todos), cada um com sua tabela de atividades na ordem hierarquica exibida na tela.

## Cronograma Setor de desenvolvimento

- Autor: Igor Freire (igor.freire@quantaconsultoria.com)
- Visibilidade: Público (todos veem)

| ID | Atividade | Predecessora | Início | Duração (dias) | Fim | Responsável | % Concluído | Nota | Atividade agenda | Detalhe | ID origem |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | QD-00 Fechamento Quanta-Dash |  | 2026-08-07 | 0 | 2026-08-07 |  | 0 |  |  |  |  |
| 2 | EQ-00 Desbloqueio Ecoquanta |  | 2026-08-07 | 0 | 2026-08-07 |  | 0 |  |  |  |  |
| 3 | EQ-01 Bugs críticos + quick win |  | 2026-08-10 | 4 | 2026-08-14 |  | 0 |  |  |  |  |
| 3.1 | Bug cronograma/atividades não carrega | 2.1 | 2026-08-10 | 1 | 2026-08-11 | igor.freire@quantaconsultoria.com | 0 |  |  | Investigar e corrigir causa raiz do carregamento intermitente da área de Atividades/Cronograma | EQ-01.1 |
| 3.2 | Corretor ortográfico server-side | 3.1 | 2026-08-12 | 1 | 2026-08-13 | igor.freire@quantaconsultoria.com | 0 |  |  | Implementar correção ortográfica processada no servidor (não depender do corretor do navegador); resolve bug de palavras erradas não aparecendo em certos navegadores | EQ-01.2 |
| 3.3 | Notas por ordem de criação e alfabetico | 3.2 | 2026-08-14 | 0 | 2026-08-14 | igor.freire@quantaconsultoria.com | 0 |  |  | Ordenar listagem de notas por data/hora de criação | EQ-01.3 |
| 4 | EQ-02 Layout adiantado (Hagata) |  | 2026-08-10 | 4 | 2026-08-14 |  | 0 |  |  |  |  |
| 4.1 | Layout Conformidades (adiantamento) |  | 2026-08-10 | 2 | 2026-08-12 | hagata.oliveira@quantaconsultoria.com | 100 |  |  | Rascunho visual completo da aba Conformidades (com dado mock, não bloqueado por lógica) | EQ-02.1 |
| 4.2 | Layout Contrato (adiantamento) | 4.1 | 2026-08-10 | 1 | 2026-08-11 | hagata.oliveira@quantaconsultoria.com | 0 |  |  | Rascunho visual completo da futura aba Contrato (mock) | EQ-02.2 |
| 5 | EQ-03 Checklist multi-box em notas |  | 2026-08-17 | 3 | 2026-08-20 |  | 0 |  |  |  |  |
| 5.1 | Lógica/dado do checklist múltiplo | 3.3 | 2026-08-17 | 1 | 2026-08-18 | igor.freire@quantaconsultoria.com | 0 |  |  | Modelo de dado + estado para múltiplos itens de checklist dentro de UMA célula de nota (não apenas 1 box) | EQ-03.1 |
| 5.2 | Componente visual do checklist | 5.1 | 2026-08-19 | 1 | 2026-08-20 | hagata.oliveira@quantaconsultoria.com | 0 |  |  | UI do checklist multi-item dentro da célula de nota | EQ-03.2 |
| 6 | EQ-04 Painel lateral por disciplina |  | 2026-08-19 | 5 | 2026-08-24 |  | 0 |  |  |  |  |
| 6.1 | Dado/lógica dos "lados" por disciplina | 5.1 | 2026-08-19 | 1 | 2026-08-20 | igor.freire@quantaconsultoria.com | 0 | note_1786040717184_l3ql0s |  | Agregação de todos os LODs de uma disciplina, prontos para exibição em painel lateral tipo cronograma | EQ-04.1 |
| 6.2 | Painel lateral — esboço | 6.1 | 2026-08-21 | 0 | 2026-08-21 | hagata.oliveira@quantaconsultoria.com | 0 |  |  | Primeira versão do painel lateral (clique no card de Atividades abre os LODs da disciplina) | EQ-04.2 |
| 6.3 | Painel lateral — finalização | 6.2 | 2026-08-24 | 0 | 2026-08-24 | hagata.oliveira@quantaconsultoria.com | 0 |  |  | Ajustes finais e polish do painel lateral | EQ-04.3 |
| 7 | EQ-05 Exportar PDF customizado |  | 2026-08-21 | 0 | 2026-08-21 |  | 0 |  |  |  |  |
| 7.1 | Deitado/pé/tamanho customizado | 6.1 | 2026-08-21 | 0 | 2026-08-21 | igor.freire@quantaconsultoria.com | 0 |  |  | Exportação PDF com opção de orientação (retrato/paisagem) e tamanho de folha além de A4 | EQ-05.1 |
| 8 | EQ-06 Exportação .MD por disciplina |  | 2026-08-24 | 1 | 2026-08-25 |  | 0 |  |  |  |  |
| 8.1 | Seletor de item + export | 7.1 | 2026-08-24 | 1 | 2026-08-25 | igor.freire@quantaconsultoria.com | 0 |  |  | Exportação `.md` por disciplina com seletor específico do item a exportar | EQ-06.1 |
| 9 | EQ-07 Filtro de busca por texto |  | 2026-08-26 | 1 | 2026-08-27 |  | 0 |  |  |  |  |
| 9.1 | Busca em qualquer filtro | 8.1 | 2026-08-26 | 1 | 2026-08-27 | igor.freire@quantaconsultoria.com | 0 |  |  | Campo de busca de nota por texto funcionando em qualquer filtro ativo | EQ-07.1 |
| 10 | EQ-08 Finalizar aba Conformidades |  | 2026-08-25 | 6 | 2026-08-31 |  | 0 |  |  |  |  |
| 10.1 | Polish visual final | 4.1 | 2026-08-25 | 1 | 2026-08-26 | hagata.oliveira@quantaconsultoria.com | 100 |  |  | Ajustes visuais finais da aba Conformidades (hoje é esboço) | EQ-08.3 |
| 10.2 | Ajustes de lógica pt.1 | 9.1 | 2026-08-28 | 0 | 2026-08-28 | igor.freire@quantaconsultoria.com | 0 |  |  | Fechar lacunas de lógica/dado da aba Conformidades — parte 1 | EQ-08.1 |
| 10.3 | Ajustes de lógica pt.2 (fecha) | 10.2 | 2026-08-31 | 0 | 2026-08-31 | igor.freire@quantaconsultoria.com | 0 |  |  | Fechar lacunas de lógica/dado da aba Conformidades — parte 2, encerra o item | EQ-08.2 |
| 11 | EQ-09 Aba Contrato completa |  | 2026-08-27 | 8 | 2026-09-04 |  | 0 |  |  |  |  |
| 11.1 | Layout completo pt.1 | 4.2 | 2026-08-27 | 1 | 2026-08-28 | hagata.oliveira@quantaconsultoria.com | 0 |  |  | Layout final da aba Contrato (acesso a notas/atividades, marcação de interferências) — parte 1 | EQ-09.3 |
| 11.2 | Layout completo pt.2 (finalização) | 11.1 | 2026-08-31 | 0 | 2026-08-31 | hagata.oliveira@quantaconsultoria.com | 0 |  |  | Finalização do layout da aba Contrato | EQ-09.4 |
| 11.3 | Estrutura de acesso a notas/atividades | 10.3 | 2026-09-01 | 1 | 2026-09-02 | igor.freire@quantaconsultoria.com | 0 |  |  | Contrato ganha acesso de leitura a notas e atividades vinculadas | EQ-09.1 |
| 11.4 | Marcação de interferências | 11.3 | 2026-09-03 | 1 | 2026-09-04 | igor.freire@quantaconsultoria.com | 0 |  |  | Contrato pode marcar interferências sobre notas/atividades | EQ-09.2 |
| 12 | EQ-BUF Apoio geral |  | 2026-09-01 | 17 | 2026-09-18 |  | 0 |  |  |  |  |
| 12.1 | Apoio geral / revisão de handoff | 11.2 | 2026-09-01 | 3 | 2026-09-04 | hagata.oliveira@quantaconsultoria.com | 0 |  |  | Slack de qualidade: revisão do que foi entregue nos blocos 1-3, apoio a Igor Freire se necessário | HAG-BUF-1 |
| 12.2 | Apoio geral / revisão | 13.2 | 2026-09-09 | 5 | 2026-09-14 | hagata.oliveira@quantaconsultoria.com | 0 |  |  | Slack de qualidade / apoio geral | HAG-BUF-2 |
| 12.3 | Apoio geral / revisão | 16.3 | 2026-09-16 | 2 | 2026-09-18 | hagata.oliveira@quantaconsultoria.com | 0 |  |  | Slack de qualidade / apoio geral | HAG-BUF-3 |
| 13 | EQ-10 Aba Banco de Links |  | 2026-09-07 | 1 | 2026-09-08 |  | 0 |  |  |  |  |
| 13.1 | Estrutura + seed inicial | 11.4 | 2026-09-07 | 0 | 2026-09-07 | igor.freire@quantaconsultoria.com | 0 |  |  | Estrutura da aba Banco de Links + seed inicial com o link "Acompanhamento Cliente" (`https://quanta-dash.vercel.app/`) | EQ-10.1 |
| 13.2 | Visual | 13.1 | 2026-09-08 | 0 | 2026-09-08 | hagata.oliveira@quantaconsultoria.com | 0 |  |  | UI da aba Banco de Links | EQ-10.2 |
| 14 | EQ-11 Curva S — regra de fim |  | 2026-09-08 | 0 | 2026-09-08 |  | 0 |  |  |  |  |
| 14.1 | Implementar regra 100% | 13.1 | 2026-09-08 | 0 | 2026-09-08 | igor.freire@quantaconsultoria.com | 0 |  |  | Gráfico da curva S: ao chegar em 100%, marca como último mês (sem necessidade de atualizações futuras) | EQ-11.1 |
| 15 | EQ-12 Melhorar sistema de ADM |  | 2026-09-09 | 1 | 2026-09-10 |  | 0 |  |  |  |  |
| 15.1 | Melhorias de administração | 14.1 | 2026-09-09 | 1 | 2026-09-10 | igor.freire@quantaconsultoria.com | 0 |  |  | Melhorias no sistema de administração (escopo a detalhar com Igor Freire durante a semana) | EQ-12.1 |
| 16 | EQ-13 Verificação humana anti-brick |  | 2026-09-11 | 4 | 2026-09-15 |  | 0 |  |  |  |  |
| 16.1 | Defesa anti-brick pt.1 | 15.1 | 2026-09-11 | 0 | 2026-09-11 | igor.freire@quantaconsultoria.com | 0 |  |  | Implementar verificação humana para evitar brick do sistema — parte 1 | EQ-13.1 |
| 16.2 | Defesa anti-brick pt.2 (finalização) | 16.1 | 2026-09-14 | 0 | 2026-09-14 | igor.freire@quantaconsultoria.com | 0 |  |  | Fecha a verificação humana anti-brick | EQ-13.2 |
| 16.3 | UI de desafio | 16.2 | 2026-09-15 | 0 | 2026-09-15 | hagata.oliveira@quantaconsultoria.com | 0 |  |  | Tela/UI da verificação humana | EQ-13.3 |
| 17 | EQ-14 Gráficos — Coordenação de Engenharia |  | 2026-09-15 | 6 | 2026-09-21 |  | 0 |  |  |  |  |
| 17.1 | Lógica base (reaproveita Planejamento) | 16.2 | 2026-09-15 | 1 | 2026-09-16 | igor.freire@quantaconsultoria.com | 0 |  |  | Aba Gráficos na Coordenação de Engenharia, reaproveitando a mesma estrutura de Planejamento | EQ-14.1 |
| 17.2 | Filtro de contrato obrigatório | 17.1 | 2026-09-17 | 1 | 2026-09-18 | igor.freire@quantaconsultoria.com | 0 |  |  | Futura aba de Coordenação: filtro de contrato OBRIGATÓRIO por permissão — usuários só veem dados do próprio contrato | EQ-14.2 |
| 17.3 | Revisão visual (reaproveitamento) | 17.2 | 2026-09-21 | 0 | 2026-09-21 | hagata.oliveira@quantaconsultoria.com | 0 |  |  | Revisão visual leve — a maior parte já reaproveita o visual de Planejamento | EQ-14.3 |
| 18 | EQ-15 MCP Claude ↔ Ecoquanta |  | 2026-09-21 | 3 | 2026-09-24 |  | 0 |  |  |  |  |
| 18.1 | Leitura de notas/projetos | 17.2 | 2026-09-21 | 1 | 2026-09-22 | igor.freire@quantaconsultoria.com | 0 |  |  | MCP para o Claude acessar notas e projetos do Ecoquanta | EQ-15.1 |
| 18.2 | Leitura Firebase + testes de análise | 18.1 | 2026-09-23 | 1 | 2026-09-24 | igor.freire@quantaconsultoria.com | 0 |  |  | MCP lê Firebase; validar com testes de análise rápida | EQ-15.2 |
| 19 | EQ-16 Buffer de fechamento |  | 2026-09-25 | 0 | 2026-09-25 |  | 0 |  |  |  |  |
| 19.1 | Ajustes finais do escopo | 18.2 | 2026-09-25 | 0 | 2026-09-25 | igor.freire@quantaconsultoria.com | 0 |  |  | Correções pendentes de qualquer item do Bloco 1-4 antes de considerar o núcleo fechado | EQ-16.1 |
| 20 | EQ-17 Vídeo de apresentação (Remotion) |  | 2026-09-28 | 1 | 2026-09-29 |  | 0 |  |  |  |  |
| 20.1 | Roteiro + captura de telas | 19.1 | 2026-09-28 | 0 | 2026-09-28 | igor.freire@quantaconsultoria.com | 0 |  |  | Roteiro e captura de tela do sistema já estável, para o vídeo de apresentação | EQ-17.1 |
| 20.2 | Edição/render final | 20.1 | 2026-09-29 | 0 | 2026-09-29 | igor.freire@quantaconsultoria.com | 0 |  |  | Edição via Remotion e render final do vídeo | EQ-17.2 |
| 21 | EQ-18 Buffer final |  | 2026-09-30 | 0 | 2026-09-30 |  | 0 |  |  |  |  |
| 21.1 | Contingência | 20.2 | 2026-09-30 | 0 | 2026-09-30 | igor.freire@quantaconsultoria.com | 0 |  |  | Reserva final para qualquer imprevisto/retrabalho não absorvido pelos buffers anteriores | EQ-18.1 |
| 22 | Dashboard Gabriel (planejamento) |  | 2026-08-10 | 5 | 2026-08-15 | hagata.oliveira@quantaconsultoria.com |  |  |  |  |  |