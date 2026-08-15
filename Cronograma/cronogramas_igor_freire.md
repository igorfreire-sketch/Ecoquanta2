# Cronogramas — export para IA

Exportado por igor.freire@quantaconsultoria.com em 11/08/2026, 15:55:59. Total: 1 cronograma(s).

Este documento reune os cronogramas visiveis a quem exportou (privados dele + publicos de todos), cada um com sua tabela de atividades na ordem hierarquica exibida na tela.

## Cronograma Setor de desenvolvimento

- Autor: Igor Freire (igor.freire@quantaconsultoria.com)
- Visibilidade: Público (todos veem)

| ID | Atividade | Predecessora | Início | Duração (dias) | Fim | Responsável | % Concluído | Nota | Atividade agenda | Detalhe | ID origem |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | QD-00 Fechamento Quanta-Dash |  | 2026-08-07 | 0 | 2026-08-07 |  | 0 |  |  |  |  |
| 5 | EQ-00 Desbloqueio Ecoquanta |  | 2026-08-07 | 0 | 2026-08-07 |  | 0 |  |  |  |  |
| 7 | EQ-01 Bugs críticos + quick win |  | 2026-08-10 | 4 | 2026-08-14 |  | 0 |  |  |  |  |
| 7.8 | Bug cronograma/atividades não carrega | 5.6 | 2026-08-10 | 1 | 2026-08-11 | igor.freire@quantaconsultoria.com | 0 |  |  | Investigar e corrigir causa raiz do carregamento intermitente da área de Atividades/Cronograma | EQ-01.1 |
| 7.9 | Corretor ortográfico server-side | 7.8 | 2026-08-12 | 1 | 2026-08-13 | igor.freire@quantaconsultoria.com | 0 |  |  | Implementar correção ortográfica processada no servidor (não depender do corretor do navegador); resolve bug de palavras erradas não aparecendo em certos navegadores | EQ-01.2 |
| 7.10 | Notas por ordem de criação e alfabetico | 7.9 | 2026-08-14 | 0 | 2026-08-14 | igor.freire@quantaconsultoria.com | 100 |  |  | Ordenar listagem de notas por data/hora de criação | EQ-01.3 |
| 11 | EQ-02 Layout adiantado (Hagata) |  | 2026-08-10 | 4 | 2026-08-14 |  | 0 |  |  |  |  |
| 11.12 | Layout Conformidades (adiantamento) |  | 2026-08-10 | 2 | 2026-08-12 | hagata.oliveira@quantaconsultoria.com | 100 |  |  | Rascunho visual completo da aba Conformidades (com dado mock, não bloqueado por lógica) | EQ-02.1 |
| 11.13 | Layout Contrato (adiantamento) | 11.12 | 2026-08-10 | 1 | 2026-08-11 | hagata.oliveira@quantaconsultoria.com | 0 |  |  | Rascunho visual completo da futura aba Contrato (mock) | EQ-02.2 |
| 14 | EQ-03 Checklist multi-box em notas |  | 2026-08-17 | 3 | 2026-08-20 |  | 0 |  |  |  |  |
| 14.15 | Lógica/dado do checklist múltiplo | 7.10 | 2026-08-17 | 1 | 2026-08-18 | igor.freire@quantaconsultoria.com | 0 |  |  | Modelo de dado + estado para múltiplos itens de checklist dentro de UMA célula de nota (não apenas 1 box) | EQ-03.1 |
| 14.16 | Componente visual do checklist | 14.15 | 2026-08-19 | 1 | 2026-08-20 | hagata.oliveira@quantaconsultoria.com | 0 |  |  | UI do checklist multi-item dentro da célula de nota | EQ-03.2 |
| 17 | EQ-04 Painel lateral por disciplina |  | 2026-08-19 | 5 | 2026-08-24 |  | 0 |  |  |  |  |
| 17.18 | Dado/lógica dos "lados" por disciplina | 14.15 | 2026-08-19 | 1 | 2026-08-20 | igor.freire@quantaconsultoria.com | 100 | note_1786040717184_l3ql0s |  | Agregação de todos os LODs de uma disciplina, prontos para exibição em painel lateral tipo cronograma | EQ-04.1 |
| 17.19 | Painel lateral — esboço | 17.18 | 2026-08-21 | 0 | 2026-08-21 | hagata.oliveira@quantaconsultoria.com | 100 |  |  | Primeira versão do painel lateral (clique no card de Atividades abre os LODs da disciplina) | EQ-04.2 |
| 17.20 | Painel lateral — finalização | 17.19 | 2026-08-24 | 0 | 2026-08-24 | hagata.oliveira@quantaconsultoria.com | 100 |  |  | Ajustes finais e polish do painel lateral | EQ-04.3 |
| 21 | EQ-05 Exportar PDF customizado |  | 2026-08-21 | 0 | 2026-08-21 |  | 0 |  |  |  |  |
| 21.22 | Deitado/pé/tamanho customizado | 17.18 | 2026-08-21 | 0 | 2026-08-21 | igor.freire@quantaconsultoria.com | 100 |  |  | Exportação PDF com opção de orientação (retrato/paisagem) e tamanho de folha além de A4 | EQ-05.1 |
| 23 | EQ-06 Exportação .MD por disciplina |  | 2026-08-24 | 1 | 2026-08-25 |  | 0 |  |  |  |  |
| 23.24 | Seletor de item + export | 21.22 | 2026-08-24 | 1 | 2026-08-25 | igor.freire@quantaconsultoria.com | 100 |  |  | Exportação `.md` por disciplina com seletor específico do item a exportar | EQ-06.1 |
| 25 | EQ-07 Filtro de busca por texto |  | 2026-08-26 | 1 | 2026-08-27 |  | 0 |  |  |  |  |
| 25.26 | Busca em qualquer filtro | 23.24 | 2026-08-26 | 1 | 2026-08-27 | igor.freire@quantaconsultoria.com | 100 |  |  | Campo de busca de nota por texto funcionando em qualquer filtro ativo | EQ-07.1 |
| 27 | EQ-08 Finalizar aba Conformidades |  | 2026-08-25 | 6 | 2026-08-31 |  | 0 |  |  |  |  |
| 27.28 | Polish visual final | 11.12 | 2026-08-25 | 1 | 2026-08-26 | hagata.oliveira@quantaconsultoria.com | 100 |  |  | Ajustes visuais finais da aba Conformidades (hoje é esboço) | EQ-08.3 |
| 27.29 | Ajustes de lógica pt.1 | 25.26 | 2026-08-28 | 0 | 2026-08-28 | igor.freire@quantaconsultoria.com | 0 |  |  | Fechar lacunas de lógica/dado da aba Conformidades — parte 1 | EQ-08.1 |
| 27.30 | Ajustes de lógica pt.2 (fecha) | 27.29 | 2026-08-31 | 0 | 2026-08-31 | igor.freire@quantaconsultoria.com | 0 |  |  | Fechar lacunas de lógica/dado da aba Conformidades — parte 2, encerra o item | EQ-08.2 |
| 31 | EQ-09 Aba Contrato completa |  | 2026-08-27 | 8 | 2026-09-04 |  | 0 |  |  |  |  |
| 31.32 | Layout completo pt.1 | 11.13 | 2026-08-27 | 1 | 2026-08-28 | hagata.oliveira@quantaconsultoria.com | 0 |  |  | Layout final da aba Contrato (acesso a notas/atividades, marcação de interferências) — parte 1 | EQ-09.3 |
| 31.33 | Layout completo pt.2 (finalização) | 31.32 | 2026-08-31 | 0 | 2026-08-31 | hagata.oliveira@quantaconsultoria.com | 0 |  |  | Finalização do layout da aba Contrato | EQ-09.4 |
| 31.34 | Estrutura de acesso a notas/atividades | 27.30 | 2026-09-01 | 1 | 2026-09-02 | igor.freire@quantaconsultoria.com | 0 |  |  | Contrato ganha acesso de leitura a notas e atividades vinculadas | EQ-09.1 |
| 31.35 | Marcação de interferências | 31.34 | 2026-09-03 | 1 | 2026-09-04 | igor.freire@quantaconsultoria.com | 0 |  |  | Contrato pode marcar interferências sobre notas/atividades | EQ-09.2 |
| 36 | EQ-BUF Apoio geral |  | 2026-09-01 | 17 | 2026-09-18 |  | 0 |  |  |  |  |
| 36.37 | Apoio geral / revisão de handoff | 31.33 | 2026-09-01 | 3 | 2026-09-04 | hagata.oliveira@quantaconsultoria.com | 0 |  |  | Slack de qualidade: revisão do que foi entregue nos blocos 1-3, apoio a Igor Freire se necessário | HAG-BUF-1 |
| 36.38 | Apoio geral / revisão | 40.42 | 2026-09-09 | 5 | 2026-09-14 | hagata.oliveira@quantaconsultoria.com | 0 |  |  | Slack de qualidade / apoio geral | HAG-BUF-2 |
| 36.39 | Apoio geral / revisão | 47.50 | 2026-09-16 | 2 | 2026-09-18 | hagata.oliveira@quantaconsultoria.com | 0 |  |  | Slack de qualidade / apoio geral | HAG-BUF-3 |
| 40 | EQ-10 Aba Banco de Links |  | 2026-09-07 | 1 | 2026-09-08 |  | 0 |  |  |  |  |
| 40.41 | Estrutura + seed inicial | 31.35 | 2026-09-07 | 0 | 2026-09-07 | igor.freire@quantaconsultoria.com | 100 |  |  | Estrutura da aba Banco de Links + seed inicial com o link "Acompanhamento Cliente" (`https://quanta-dash.vercel.app/`) | EQ-10.1 |
| 40.42 | Visual | 40.41 | 2026-09-08 | 0 | 2026-09-08 | hagata.oliveira@quantaconsultoria.com | 100 |  |  | UI da aba Banco de Links | EQ-10.2 |
| 43 | EQ-11 Curva S — regra de fim |  | 2026-09-08 | 0 | 2026-09-08 |  | 0 |  |  |  |  |
| 43.44 | Implementar regra 100% | 40.41 | 2026-09-08 | 0 | 2026-09-08 | igor.freire@quantaconsultoria.com | 100 |  |  | Gráfico da curva S: ao chegar em 100%, marca como último mês (sem necessidade de atualizações futuras) | EQ-11.1 |
| 45 | EQ-12 Melhorar sistema de ADM |  | 2026-09-09 | 1 | 2026-09-10 |  | 0 |  |  |  |  |
| 45.46 | Melhorias de administração | 43.44 | 2026-09-09 | 1 | 2026-09-10 | igor.freire@quantaconsultoria.com | 0 |  |  | Melhorias no sistema de administração (escopo a detalhar com Igor Freire durante a semana) | EQ-12.1 |
| 47 | EQ-13 Verificação humana anti-brick |  | 2026-09-11 | 4 | 2026-09-15 |  | 0 |  |  |  |  |
| 47.48 | Defesa anti-brick pt.1 | 45.46 | 2026-09-11 | 0 | 2026-09-11 | igor.freire@quantaconsultoria.com | 100 |  |  | Implementar verificação humana para evitar brick do sistema — parte 1 | EQ-13.1 |
| 47.49 | Defesa anti-brick pt.2 (finalização) | 47.48 | 2026-09-14 | 0 | 2026-09-14 | igor.freire@quantaconsultoria.com | 100 |  |  | Fecha a verificação humana anti-brick | EQ-13.2 |
| 47.50 | UI de desafio | 47.49 | 2026-09-15 | 0 | 2026-09-15 | hagata.oliveira@quantaconsultoria.com | 0 |  |  | Tela/UI da verificação humana | EQ-13.3 |
| 51 | EQ-14 Gráficos — Coordenação de Engenharia |  | 2026-09-15 | 6 | 2026-09-21 |  | 0 |  |  |  |  |
| 51.52 | Lógica base (reaproveita Planejamento) | 47.49 | 2026-09-15 | 1 | 2026-09-16 | igor.freire@quantaconsultoria.com | 0 |  |  | Aba Gráficos na Coordenação de Engenharia, reaproveitando a mesma estrutura de Planejamento | EQ-14.1 |
| 51.53 | Filtro de contrato obrigatório | 51.52 | 2026-09-17 | 1 | 2026-09-18 | igor.freire@quantaconsultoria.com | 0 |  |  | Futura aba de Coordenação: filtro de contrato OBRIGATÓRIO por permissão — usuários só veem dados do próprio contrato | EQ-14.2 |
| 51.54 | Revisão visual (reaproveitamento) | 51.53 | 2026-09-21 | 0 | 2026-09-21 | hagata.oliveira@quantaconsultoria.com | 0 |  |  | Revisão visual leve — a maior parte já reaproveita o visual de Planejamento | EQ-14.3 |
| 55 | EQ-15 MCP Claude ↔ Ecoquanta |  | 2026-09-21 | 3 | 2026-09-24 |  | 0 |  |  |  |  |
| 55.56 | Leitura de notas/projetos | 51.53 | 2026-09-21 | 1 | 2026-09-22 | igor.freire@quantaconsultoria.com | 0 |  |  | MCP para o Claude acessar notas e projetos do Ecoquanta | EQ-15.1 |
| 55.57 | Leitura Firebase + testes de análise | 55.56 | 2026-09-23 | 1 | 2026-09-24 | igor.freire@quantaconsultoria.com | 0 |  |  | MCP lê Firebase; validar com testes de análise rápida | EQ-15.2 |
| 58 | EQ-16 Buffer de fechamento |  | 2026-09-25 | 0 | 2026-09-25 |  | 0 |  |  |  |  |
| 58.59 | Ajustes finais do escopo | 55.57 | 2026-09-25 | 0 | 2026-09-25 | igor.freire@quantaconsultoria.com | 0 |  |  | Correções pendentes de qualquer item do Bloco 1-4 antes de considerar o núcleo fechado | EQ-16.1 |
| 60 | EQ-17 Vídeo de apresentação (Remotion) |  | 2026-09-28 | 1 | 2026-09-29 |  | 0 |  |  |  |  |
| 60.61 | Roteiro + captura de telas | 58.59 | 2026-09-28 | 0 | 2026-09-28 | igor.freire@quantaconsultoria.com | 0 |  |  | Roteiro e captura de tela do sistema já estável, para o vídeo de apresentação | EQ-17.1 |
| 60.62 | Edição/render final | 60.61 | 2026-09-29 | 0 | 2026-09-29 | igor.freire@quantaconsultoria.com | 0 |  |  | Edição via Remotion e render final do vídeo | EQ-17.2 |
| 63 | EQ-18 Buffer final |  | 2026-09-30 | 0 | 2026-09-30 |  | 0 |  |  |  |  |
| 63.64 | Contingência | 60.62 | 2026-09-30 | 0 | 2026-09-30 | igor.freire@quantaconsultoria.com | 0 |  |  | Reserva final para qualquer imprevisto/retrabalho não absorvido pelos buffers anteriores | EQ-18.1 |
| 65 | Dashboard Gabriel (planejamento) |  | 2026-08-10 | 5 | 2026-08-15 | hagata.oliveira@quantaconsultoria.com |  |  |  |  |  |
