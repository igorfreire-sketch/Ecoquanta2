# Relatório de execução — Ecoquanta

**Data:** 2026-08-10  
**Projeto:** `C:\Users\N-1873\GitHub\Ecoquanta2`

## Auditoria de carregamento e Firebase — 2026-08-10

- O Cronograma passou a exigir a escolha de contrato antes de montar sua visão pesada para usuários sem contrato bloqueado.
- A leitura do módulo só dispara após a seleção; usuários vinculados a um contrato continuam entrando automaticamente.
- Cronograma e Atividades agora exibem estados explícitos de carregamento/erro e botão de nova tentativa, evitando a tela vazia na primeira entrada.
- Foi identificada sobrecarga real: `appData/cronograma` e `appData/eap` são documentos grandes, e `registroAtividades` é lida inteira antes do filtro cliente.
- Há indício de dados redundantes, mas não há evidência suficiente para excluir nada. Nenhum dado do Firebase foi apagado.
- A regra operacional C/T registrada nesta execução é `C+T>0` por item marcado; item sem quantidade não é enviado nem concluído.
- Ajuste solicitado no Cronograma: removido o painel separado de escolha e o botão `Trocar contrato`; a entrada agora mostra um filtro compacto com `Todos` desabilitado/cinza e somente Contrato ativo. A visão pesada só monta depois da seleção.
- Atividades mantém todos os registros, mas aguarda `registro` + `eap` e mostra carregamento/erro real em vez de tela vazia.
- Terceirizadas da Conformidade agora aceitam múltiplos setores/disciplinas por checkbox, preservando `disciplina` como texto compatível e persistindo também `disciplinas[]`.
- Auditoria da Administração adicionada ao cronograma: Gerenciar Disciplinas legado, Pré-cadastro, permissões, Terceirizadas e persistência/refresh.
- Correções aplicadas no carregamento administrativo: disciplinas de usuários inválidas são sanitizadas contra o catálogo; `allowedTabs` legado em string é normalizado; múltiplas disciplinas de terceirizadas entram nos profissionais de cada setor.

## Objetivo desta execução

- Separar material legado, de referência ou sem uso confirmado do projeto ativo.
- Criar uma área local não versionada para esse material.
- Iniciar o ambiente com `npm run dev` e verificar a resposta local.
- Registrar as atividades e validações realizadas.

## Alterações executadas

### Organização do projeto

Foi criada a pasta `nãocommit/` e ela foi adicionada ao `.gitignore`. Foram separados para essa pasta os diretórios:

- `APP-MRK-versao-atualizada-2026-08-05` — material de referência de não conformidades e gráficos.
- `Legado` — código explicitamente legado.
- `Leitura` — aplicação/estrutura antiga sem uso encontrado no fluxo ativo.
- `NaoConformidade` — implementação antiga; a versão ativa está em `src/components/NaoConformidade2`.
- `Nova pasta` — cópia/estrutura antiga do projeto.
- `components` — componentes antigos na raiz, fora do fluxo ativo em `src/components`.

Foram preservados na raiz `Project`, `Publica`, `Cronograma`, `scripts` e `.claude` por haver referência ativa, possibilidade de uso operacional ou função de configuração/desenvolvimento.

### Não conformidades

- Filtros de contrato e OS foram normalizados para evitar divergência por espaços, maiúsculas/minúsculas e formatos equivalentes.
- O Dashboard e as Revisões deixaram de mostrar dados demo quando o Firebase falha; agora exibem estado vazio e mensagem verdadeira.
- A busca de não conformidades pode aplicar filtro defensivo por contrato antes da leitura da coleção; as regras do Firestore continuam sendo a camada real de autorização.
- Foi corrigida a perda potencial de edição nos campos editáveis das Revisões causada por leitura de estado antigo durante `onBlur`.
- A regra C/T continua pendente de decisão funcional. Como os valores serão inseridos depois da aba de Não Conformidades, não foi adicionada validação arbitrária nesta execução.

### Outras atividades já executadas no ciclo

- Tratamento de carregamento parcial do cronograma e preservação dos dados existentes em falhas.
- Checklist de múltipla seleção no Banco de Dados.
- Seletor de disciplina para atividades.
- Exportação de PDF com opções.
- Busca textual nas notas.
- Filtros de contrato, notas e não conformidades.
- Escopo de atividades e contrato nas telas de coordenação.
- Banco de Links com seed idempotente.
- Regra da Curva S para encerrar a série no primeiro término real, sem apagar dados persistidos futuros.

## Validações

Validações do ciclo:

- `git diff --check`: OK.
- Checks direcionados (`bancoGrid` e `curvaS`): OK.
- `npm run lint`: OK após excluir `nãocommit/` do `tsconfig.json`.
- `npm run dev`: executado no outro PC pelo usuário; este PC não mantém servidor local.

## Pendências conhecidas

- A regra operacional adotada para C/T é `C+T>0` por item marcado.
- O isolamento por contrato agora está refletido nas Rules e no filtro do cliente; as Rules ainda precisam ser publicadas no Firebase Console.
- A decisão de backend para o corretor ortográfico permanece fora desta execução.

## Atualização — prioridade NC e Banco de Links

- Confirmado no cronograma que EQ-08.1/EQ-08.2 já estavam implementados no código, embora o export ainda mostre 0%.
- Aplicada a regra operacional `C+T>0` no preenchimento: item marcado sem quantidade não é enviado nem concluído.
- `origemAtividade` passou a ser obrigatória na criação do registro.
- Firestore Rules atualizadas para limitar `nc2Records` por contrato para usuários comuns, validar campos mínimos de criação e restringir escrita de `appData/admin` a administradores.
- Banco de Links simplificado: removido o banner explicativo; mantido o título compacto, pesquisa, lista com nome + URL/local e cadastro administrativo por `+ Link` → `Registrar`.
- O cadastro do link agora persiste pelo fluxo existente de snapshot administrativo; o seed `Acompanhamento Cliente` foi preservado.

### Validação desta atualização

- `npm run lint`: OK.
- `git diff --check`: OK.
- `npx tsx src/lib/bancoGrid.check.ts`: OK.
- `npx tsx src/lib/curvaS.check.ts`: OK.
- `nãocommit/`: confirmado ignorado pelo Git.
- O servidor local será executado no outro PC pelo usuário em `http://192.168.68.117:2500/`.

### Ação operacional pendente

- Publicar o conteúdo atualizado de `firestore.rules` no Firebase Console; editar o arquivo local não publica as regras remotamente.

## 2026-08-10 — Cronograma e dados reais de Conformidade

- A entrada do Cronograma não depende mais da escolha prévia de contrato: abre na página real com filtro `Todos` ou com o contrato bloqueado do usuário.
- A causa do estado intermitente era dupla: a leitura do Cronograma só era acionada após a seleção e atualizações podiam limpar o marcador de módulo carregado. O login agora pré-carrega Cronograma e EAP; a EAP é a fonte real de contingência quando `appData/cronograma` vier vazio.
- Enquanto a leitura estiver em curso ou falhar, o aviso aparece dentro da aba, com tentativa novamente; a tela não conclui “nenhuma atividade” até as fontes disponíveis terminarem.
- Conformidade lê somente `nc2Records`. A função residual de registros demo foi removida e, sem registros reais no filtro, o dashboard mostra `Nenhuma não conformidade registrada para esse filtro.` sem gráficos zerados.

### Validação desta atualização

- `npm run lint`: OK.
- `git diff --check`: OK.
- Nenhum dado do Firebase foi apagado.

## 2026-08-10 — Project, checklist e pré-cadastro

- Soluções Digitais > Project: botão direito em qualquer linha permite inserir acima/abaixo e escolher cor; linhas e colunas podem ser arrastadas e a ordem das colunas fica salva.
- IDs não são mais derivados da posição: `seq` mantém o número das linhas existentes estável ao inserir ou reordenar irmãs. A alteração de pai/filho continua podendo mudar o código hierárquico.
- CSV/PDF/Markdown usam a mesma ordem de colunas e códigos exibidos no Project.
- Checklist de célula em Notas agora suporta vários itens (marcar, editar, adicionar e remover), mantendo o checkbox simples e dados antigos como fallback.
- Pré-cadastro é aplicado no primeiro login Google: o e-mail aprovado gera o usuário de autenticação com cargo, disciplinas, contrato e abas; e-mail não pré-cadastrado continua bloqueado. Nenhuma alteração de Rules foi necessária para este fluxo.
- EQ-04 (painel por disciplina), EQ-05 (PDF customizado) e EQ-11 (Curva S encerra no primeiro 100% real) foram auditados e já atendem o critério funcional atual.

### Validação desta atualização

- `npm run lint`: OK.
- `git diff --check`: OK (somente avisos CRLF existentes).

## 2026-08-10 — Aba Contrato e limite seguro das Rules

- Contrato > Atividades agora recebe as notas vinculadas; interferências podem apontar opcionalmente para atividade e/ou nota da OS escolhida, mantendo registros antigos de OS.
- Prioridades, interferências e configurações de OS passam a persistir `contratoCodigo`; a configuração da OS resolve o contrato pela própria OS, nunca pelo filtro `Todos`.
- O código local de Rules foi preparado para exigir `contratoCodigo`, mas **não deve ser publicado ainda**: o projeto não possui provisionamento confiável de contrato por `uid` (Admin SDK, Function, Apps Script autenticado ou custom claim). Sem isso, uma Rule forte pode bloquear usuário legítimo ou confiar em campo gravável pelo cliente.
- Próxima decisão externa: aprovar um backend/provisionador de `siteUsers/{uid}`/custom claim com contrato. Até então, o filtro de contrato no app continua funcional, mas não é isolamento de segurança no Firestore.

## 2026-08-10 — Gráficos por contrato

- Em Coordenação de Engenharia, usuário com contrato bloqueado passa a ver o filtro de contrato fixo: `Todos os contratos` some, o campo fica desabilitado e todos os gráficos recebem o mesmo filtro efetivo.
- Os gráficos já usam dados reais e estados vazios; este ajuste não adiciona dado demo nem altera componentes individuais.
- EQ-13 anti-brick foi auditado e ainda falta implementar: impedir auto-rebaixamento/bloqueio/exclusão, preservar ao menos um admin ativo e pedir `CONFIRMAR` em ações críticas.

## Mapa do cronograma — 2026-08-10

| Item | Estado | Feito / próxima ação |
|---|---|---|
| EQ-00 | pendente | Marco sem escopo técnico. |
| EQ-01.1 | parcial | Fallback EAP/loading feito; reproduzir vazio intermitente no IP 117. |
| EQ-01.2 | bloqueado | Worker local existe; server-side exige decisão de backend. |
| EQ-01.3 | feito | Notas: criação desc. + título pt-BR. |
| EQ-02.1 | feito | Conformidade real/sem demo. |
| EQ-02.2 | parcial | Contrato funcional; falta revisão visual. |
| EQ-03 | parcial | Checklist multi-item implementado; testar persistência visual. |
| EQ-04 | feito | Painel por disciplina auditado. |
| EQ-05 | feito | PDF: orientação + formatos. |
| EQ-06 | feito | Menu do card exporta MD da nota específica. |
| EQ-07 | feito | Busca é aplicada após todos os filtros ativos. |
| EQ-08 | parcial | NC real, C+T e origem; fechar teste funcional da aba. |
| EQ-09 | parcial | Atividade/nota/interferência vinculadas; Rules por contrato bloqueadas sem uid confiável. |
| EQ-10 | feito | Links: busca + cadastro compacto. |
| EQ-11 | feito | Curva S encerra no 1º 100%; check existe. |
| EQ-12 | parcial | Pré-cadastro Google/multi-disciplina/preset, legado preservado e cargo/permissões persistem; falta revisão visual de legado. |
| EQ-13 | feito | Guard do último admin/autoações + `CONFIRMAR` no save destrutivo. |
| EQ-14 | parcial | Contrato visualmente travado; validar no navegador. |
| EQ-15 | pendente | Definir MCP mínimo e backend de leitura. |
| EQ-16/18 | pendente | Buffers de fechamento. |
| EQ-17 | pendente | Vídeo após sistema estável. |

## 2026-08-10 — Project: interação de linhas

- Arrasto inicia apenas pelo identificador; editar células não dispara drag.
- O alvo válido recebe marcador laranja acima/abaixo; linhas de outro nível indicam bloqueio, preservando hierarquia e IDs.
- Botão direito usa o mesmo menu da Nota: inserir acima/abaixo e paleta de cor da linha.
- O menu é capturado na linha inteira (inclusive campos) e agora também permite excluir a linha; dragover só atualiza a tela quando muda de metade/alvo.
- Corrigido empilhamento do menu: opções de cor/exclusão ficam acima do editor Project e recebem o clique.
- Check: `npm run lint` e `git diff --check` OK.
