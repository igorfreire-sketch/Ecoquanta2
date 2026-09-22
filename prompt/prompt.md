# Ecoquanta2 — Demanda Digital, Notas e análise automática de bugs

Você é o agente de engenharia responsável por esta rodada no repositório
`Ecoquanta2`. Entregue as funcionalidades abaixo de ponta a ponta, com segurança,
testes e documentação. Não faça commit, deploy ou alteração em produção sem ordem
explícita. Prioridade: correção de raiz, isolamento de dados e evidência verificável.
Nunca invente resultado de teste ou integração que não executou.

## Contrato de execução para /goal

Este é um objetivo longo. Não termine por ter feito uma análise ou uma UI parcial:
termine apenas quando os critérios de aceite estiverem satisfeitos ou quando houver uma
dependência externa concreta que você não pode resolver sem credenciais, conta ou decisão
do Igor. Não peça confirmação para decisões técnicas reversíveis e dentro do escopo.
Quando uma decisão for estrutural, registre-a em vez de bloquear o trabalho.

Crie e mantenha `relatorio/goal-demanda-digital-state.md` desde o início. Após cada
marco, atualize-o de forma concisa com: marco atual, arquivos alterados, testes já
executados, decisões, riscos e próximo passo exato. Releia esse arquivo ao retomar após
compactação de contexto ou falha. Ele é a memória operacional; não recomece nem repita
trabalho já validado.

## Gerenciador de contexto e tokens

Trate o contexto como recurso finito. O objetivo é progresso contínuo e verificável, não
uma resposta longa. A cada ciclo, consulte primeiro
`relatorio/goal-demanda-digital-state.md`, execute o menor próximo passo útil e só
então atualize o estado. Nunca reconstrua mentalmente o projeto lendo tudo outra vez.

- Mantenha o arquivo de estado com no máximo ~150 linhas. Use listas curtas, caminhos,
  IDs e comandos; não cole arquivos, diffs ou logs extensos.
- Ao terminar cada subetapa, registre: `feito`, `evidência`, `pendente`,
  `próximo` e `bloqueio` (se houver). Remova do estado detalhes já transferidos ao
  relatório final e mantenha apenas decisões ainda relevantes.
- Leia arquivos por símbolo/intervalo com `rg` e comandos direcionados. Não abra
  `node_modules`, `dist`, lockfiles, logs grandes ou árvores completas, salvo quando
  a causa exigir isso. Prefira `git diff -- <arquivo>` a reler o arquivo inteiro.
- Faça uma alteração lógica por vez e rode seu teste estreito imediatamente. Não acumule
  muitas hipóteses ou mudanças sem feedback de compilação/teste.
- Em erro, registre a mensagem resumida, o arquivo/linha, a hipótese e uma tentativa;
  não repita o mesmo comando ou abordagem três vezes. Depois de duas tentativas sem
  evidência nova, investigue a dependência adjacente ou marque bloqueio concreto.
- Antes de uma compactação ou quando perceber que o contexto está grande, pare em um
  limite seguro: salve o estado, a lista de comandos pendentes e o próximo comando
  exato. Retome exclusivamente a partir desse checkpoint.
- Priorize sempre: (1) segurança/autorização e perda de dados, (2) contratos e testes,
  (3) fluxo funcional, (4) UX, (5) refino. Se o orçamento estiver apertado, conclua
  verticalmente a capacidade mais crítica com evidência, atualize o checkpoint e só
  então passe à próxima; nunca deixe alterações grandes pela metade.
- Seja econômico nas mensagens de progresso: uma linha por marco, sem narrar comandos
  triviais. O relatório final é a única consolidação detalhada.

Ao detectar que o limite da sessão está próximo, não tente encerrar tudo às pressas.
Garanta que o repositório compile no estado atual quando possível, atualize o checkpoint
e continue na próxima sessão/ciclo pelo próximo passo registrado. Não declare o objetivo
concluído enquanto existir item obrigatório incompleto.

Siga esta ordem de dependências, salvo evidência no código de que outra é melhor:

1. Auditoria e mapa do sistema (somente leitura).
2. Contratos, regras de acesso, tipos e migração retrocompatível.
3. Demanda Digital e Compatibilização, com testes de dados.
4. Modelo de participantes/Notas, deep link e e-mail idempotente.
5. Editor de Notas e regressões de conteúdo.
6. Integração Google Calendar, isolada atrás de adaptador testável.
7. Pipeline IA, aprovação, espelho local de planos e documentação operacional.
8. Regressão final, revisão de segurança e relatório.

Não avance para uma camada de UI que dependa de uma regra, tipo ou endpoint ainda
inexistente. Não paralelize alterações concorrentes no mesmo arquivo. Antes de adicionar
qualquer serviço externo, confirme pelo código se já há Firebase Functions, provedor de
e-mail, API Google ou agendamento em uso; prefira completar essa arquitetura a criar uma
segunda.

### Gates obrigatórios

- **Gate A — descoberta:** antes da primeira alteração, registre o mapa de arquivos,
  schemas reais, coleções, funções de backend e lacunas encontradas.
- **Gate B — segurança:** antes de qualquer fluxo de e-mail, OAuth, IA ou scheduler,
  defina autorização, superfície de dados, idempotência, segredo necessário e falha
  segura. Se não houver backend no repositório, implemente a estrutura mínima preparada
  para deploy e deixe somente o provisionamento externo como pendência.
- **Gate C — por vertical:** não marque uma seção como feita sem teste de caminho feliz,
  acesso negado e retry/duplicidade quando aplicável.
- **Gate D — entrega:** execute lint/build e a suíte pertinente; revise `git diff` por
  segredo, log excessivo, mudança incidental e quebra de compatibilidade.

## Resultado obrigatório

1. Feedbacks de **bug** e **pedido** aparecem na aba **Demanda Digital**.
2. O preenchimento de **Compatibilização** pela análise de OS está comprovadamente
   funcional (e corrigido se houver falha).
3. Em **Notas**, é possível associar calendários Google públicos e de múltiplos
   usuários, com visibilidade aos participantes autorizados da Nota.
4. Ao adicionar um usuário a uma Nota, ele recebe e-mail com link direto para ela.
5. A formatação individual de trechos/caracteres em Notas funciona e persiste.
6. A cada quatro horas, a IA analisa bugs relatados e gera planos de solução para
   aprovação humana; uma cópia legível fica em `C:\Users\Igor\Desktop\Planos`.

## Método de trabalho: qualidade e economia de tokens

- Antes de editar, leia `package.json`, regras Firebase, tipos/modelos, autenticação
  e os componentes envolvidos. Use `rg` para localizar símbolos e leia apenas os
  trechos relevantes; não varra arquivos grandes sem necessidade.
- Para cada requisito, mapeie em poucas linhas: origem dos dados → schema/tipo →
  persistência/regras → consulta → UI → teste. Reutilize padrões e serviços existentes.
- Trabalhe uma vertical por vez: implemente, teste o ponto crítico, então prossiga.
  Evite dependências e abstrações novas; se indispensáveis, documente motivo, custo e
  configuração externa.
- Não escreva no Firestore de produção, não use segredo/PII real em testes ou logs e
  não exponha tokens OAuth/IA no frontend. Ações privilegiadas são exclusivamente de
  backend.
- Execute primeiro os testes mais específicos; ao final, rode `npm run lint` e
  `npm run build`. Corrija o que sua alteração introduzir e reporte saída real.

## 1 — Feedback de bugs e pedidos na aba Demanda Digital

Localize todos os criadores de feedback, schemas/coleções atuais e dados legados.
Defina um contrato compatível: `id`, `tipo` (`bug` ou `pedido`), descrição,
autor, datas, status, prioridade, origem e referências de OS/contrato quando houver.

- Exiba **ambos** na aba Demanda Digital sem duplicidade, com tipo claramente visível,
  ordenação determinística, vazio, carregamento e falha.
- Preserve filtros atuais; aplique filtros de tipo/status/prioridade somente se
  coerentes com a interface atual.
- Garanta regras, consulta e índice necessários sem ampliar leitura/escrita de usuários.
- Teste: bug aparece, pedido aparece, legado aparece e dados sem permissão não vazam.

## 2 — Compatibilização preenchida pela análise de OS

Rastreie o fluxo completo: resultado da análise de OS → transformação → gravação →
consulta → renderização em Compatibilização. Não considere pronto por haver uma função
isolada.

- Compare schema produzido e schema esperado; normalize na fronteira correta, mantendo
  retrocompatibilidade.
- Corrija causa raiz (campo divergente, `await`, coleção, filtro, cache, regra ou
  índice), não um paliativo visual.
- Não sobrescreva edição humana sem confirmação ou versionamento/auditoria de origem.
- Crie teste com OS simulada cobrindo criar, atualizar e renderizar; dados incompletos
  não podem quebrar a tela.

## 3 — Google Calendar em Notas

Implemente integração segura conforme a arquitetura existente. Segredos OAuth nunca
ficam no navegador; uma agenda pública não deve ser tratada como gravável.

- Permita vincular múltiplas agendas por ID/URL e múltiplos usuários a uma Nota,
  registrando origem, permissão/capacidade, estado de sincronização e erro, sem tokens.
- Agendas públicas: leitura pela API adequada. Agendas privadas/multiusuário: OAuth por
  usuário, consentimento explícito e tokens apenas no backend seguro.
- Participantes autorizados da Nota veem os vínculos/eventos que as ACLs do Google
  permitem. Jamais exponha detalhes de calendário privado a quem não tem permissão.
- Trate token expirado/revogado, calendário removido, duplicidade, timezone e erro
  transitório; mostre reconexão sem apagar vínculo indevidamente.
- Isole a camada Google do React e teste-a com mocks. Documente escopos mínimos,
  redirect URI, variáveis de ambiente e etapas Google Cloud/Firebase necessárias.

## 4 — E-mail ao vincular participante a Nota

- Detecte a transição real de participante adicionado; não envie novamente por edição,
  abertura, reordenação ou retry.
- Envie pelo backend, com fila/idempotência usando
  `notaId + usuarioId + versaoDoVinculo`. Registre só metadados seguros de entrega.
- E-mail: título da Nota, remetente quando disponível, texto breve e URL absoluta de
  deep link. A rota exige login e revalida acesso antes de mostrar conteúdo.
- Não inclua conteúdo confidencial na URL/e-mail nem permita enumeração de IDs.
- Teste primeiro vínculo, duplicata, vários usuários, remoção/revínculo e deep link
  sem permissão.

## 5 — Formatação de trechos individuais em Notas

Reproduza o defeito antes de corrigir, usando meio de palavra, múltiplas seleções,
negrito/itálico/sublinhado, remoção de formato, colar, salvar e reabrir.

- Corrija no nível apropriado de modelo/seleção; não faça substituição de HTML por
  string que quebre cursor, acentos, links, quebras ou formatação vizinha.
- Sanitize ao renderizar e aceite somente nós/atributos seguros. Preserve Unicode,
  conteúdo existente e links seguros.
- Garanta seleção/cursor correto após formatar e persistência idêntica após recarregar.
- Cubra transformações/sanitização em testes e, se possível, a interação de seleção
  parcial. Registre passo manual apenas se realmente exigir navegador.

## 6 — IA: análise de bugs a cada 4 horas e planos

A automação **somente gera planos para aprovação de Igor**. Ela nunca pode aplicar
código, marcar bug como resolvido, enviar mensagens externas ou executar comandos.
Aprovar um plano também não executa sua solução automaticamente.

- Use agendamento de servidor (função agendada/Cloud Scheduler), não uma aba do
  navegador. Execute a cada 4h com trava distribuída e idempotência.
- Busque somente bugs novos/alterados desde o último checkpoint. Agrupe duplicatas de
  forma conservadora, preservando IDs e links de todos os relatos.
- Chame a IA com saída estruturada validada em código. Envie somente contexto mínimo:
  título/descrição sanitizada, ambiente, versão, passos, impacto, frequência e
  metadados de anexos. Nunca envie credenciais, e-mails, PII desnecessária ou Notas
  privadas.
- Cada plano deve ter ID, data, bugs cobertos, evidências, hipótese/causa e confiança,
  perguntas pendentes, severidade, impacto, investigação, áreas/arquivos prováveis
  (somente com evidência), proposta, testes, riscos, rollback e estimativa. Distinga
  fatos de suposições.
- Persista planos estruturados na base compartilhada com auditoria e estados
  `rascunho`, `aguardando_aprovacao`, `aprovado`, `rejeitado`, `arquivado`.
  Registre aprovador, data e comentário.
- Um job em nuvem não escreve diretamente no Desktop. Portanto crie um espelho local
  idempotente: script Node versionado que busca planos autorizados e grava Markdown
  atomicamente em `C:\Users\Igor\Desktop\Planos` (crie a pasta se ausente).
  Fonte de verdade: armazenamento compartilhado; Desktop: cópia para revisão.
  Não embuta credenciais nem rode o script em máquinas não autorizadas.
- Documente o comando do espelho e uma tarefa do Windows Task Scheduler, por exemplo
  sincronização a cada 15 min. Se houver agente local existente, reutilize-o.
- Controle custo: checkpoint, deduplicação, limites de lote/contexto, timeout, retry
  exponencial e auditoria de uso/erro. Em falha, não avance checkpoint nem marque plano
  parcial como confiável.
- Use cliente IA falso nos testes. Se scheduler/deploy depender de credenciais, entregue
  código/configuração prontos e descreva o único passo manual; não diga que está ativo.

Teste elegibilidade, deduplicação, schema da resposta IA, idempotência, aprovação,
falha/retry e escrita Markdown atômica.

## Aceite final e relatório

- Atualize regras Firebase, índices, tipos e contratos de backend quando necessário.
  Nenhuma regra ampla para “fazer funcionar”.
- Todas as telas tratam carregando, vazio, erro, sucesso e falta de permissão.
- Sem chaves/segredos no repositório, logs, relatórios ou `.env.example`.
- Crie `relatorio/rodada-demanda-digital.md` com, para cada seção:

```md
## <seção>
Feito: <arquivos e mudanças concretas>
Fluxo validado: <entrada → persistência → UI/efeito>
Testes: <comando e saída real resumida>
Segurança/privacidade: <decisão e controle>
Pendente: <impedimento concreto e próximo passo manual>
```

Finalize o relatório com `DECISÕES`, `CONFIGURAÇÃO EXTERNA NECESSÁRIA`,
`RISCOS CONHECIDOS` e a saída de `git status --short`. Revise o diff e remova
artefatos, logs e mudanças fora de escopo. Não faça commit.

## Definição objetiva de “pronto”

Só declare conclusão quando:

- cada uma das seis capacidades possui implementação rastreável, controle de acesso e
  evidência de teste;
- integrações que exigem conta/segredo têm adaptador, schema, regras, documentação e
  teste fake completos; a única pendência permitida é o provisionamento externo listado
  com precisão;
- o pipeline de IA jamais executa uma solução sem aprovação humana e o espelho Desktop
  não depende de acesso irrestrito ou segredo embutido;
- não há regressão de conteúdo de Notas nem vazamento entre contratos/usuários;
- `relatorio/goal-demanda-digital-state.md` e
  `relatorio/rodada-demanda-digital.md` refletem o estado real.

Se um requisito não puder ser concluído por falta de credencial, informe exatamente:
o serviço, permissão/variável/conta que falta, onde configurá-la, como validar depois e
quais arquivos já estão prontos. Continue com todos os demais requisitos independentes.
