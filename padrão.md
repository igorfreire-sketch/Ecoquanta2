# Padrões de UI — EcoQuanta

Regras de interface a seguir SEMPRE. Não repetir os erros abaixo.

## Filtros e seleção

- **Nunca** criar um checkbox (ou toggle) separado ao lado de um filtro para opções como "Ver todas".
  Colocar a opção **dentro do próprio dropdown/select**, como a **primeira opção** da lista.
  Ex.: no filtro de Disciplina, a opção "Ver todas" é o primeiro item do dropdown — não um checkbox solto.
  Motivo: checkbox solto polui o layout e fica inconsistente com o resto dos filtros.

## Filtro de Edificação (depende de OS)

Todo filtro que já tem "OS" ganha, logo ao lado, um filtro de **Edificação**. Não é uma feature à
parte — segue o `Padrão de filtro das abas`.

- **Fonte do dado**: `activities[].edificio` (já existe, populado via `eap.edificioPorItem` — hoje
  vazio na planilha real, mas a estrutura já está pronta). Nunca ler `eap.edificioPorItem` cru fora
  de `Atividades.tsx`/`buildEapMaps` — filtrar `activities` já resolvidas pela OS é suficiente e
  evita duplicar a lógica de `findLongestHierarchyMatch`.
- **Fica cinza (disabled) até a OS selecionada ter edificação.** Sem OS escolhida, ou OS sem
  nenhuma edificação: o select fica desabilitado com placeholder tipo "Sem edificação nesta OS".
  Assim que a OS tiver dado (mesmo que só uma), o select liga e lista as edificações daquela OS.
- **Nunca mostrar edificação de outra OS.** O filtro sempre deriva da OS já selecionada no mesmo
  formulário/filtro — não existe "todas as edificações do sistema" solta.
- **Nota (Anotacoes.tsx)**: nota vinculada a uma OS pode (opcionalmente) apontar pra uma edificação
  específica daquela OS (`AnnotationSheet.edificacao`). Mesma regra: campo cinza até a OS ter
  edificação. O filtro da lista de notas (`listaEdificacao`) segue o padrão acima.
- **Pendente**: aplicado em `Anotacoes.tsx` (filtro de lista + editor de nota). Outras telas com
  filtro de OS (`Contrato.tsx`, `CurvaS.tsx`, `DashboardEngenharia.tsx`) ainda não ganharam o par -
  seguir exatamente este padrão quando forem tocadas.

## Identificação de OS

- Nunca usar o código da OS como o identificador exibido ao usuário. A OS deve ser apresentada pelo
  nome cadastrado (`os.nome`); o código (`os.codigo`, por exemplo `2.4`) é apenas referência interna.
- Em Revisões, não exibir `2.4` como se fosse o nome da OS. Se houver necessidade de contexto, usar o
  formato `Nome da OS (2.4)`, mantendo o nome como identificação principal.
- Persistência, consultas e vínculos podem continuar usando o código estável internamente; títulos,
  labels, cards, selects e mensagens devem usar o nome da OS.

## Não Conformidades

- Falha de leitura do Firebase nunca pode virar dado demo silencioso. Exibir estado vazio e erro
  verdadeiro; registros demo só podem aparecer em modo explicitamente identificado.
- Usuário preso a contrato deve receber a consulta filtrada por `contratoCodigo` e, depois, o filtro
  normalizado no cliente. A query do cliente reduz tráfego, mas não substitui as regras do Firestore.
- As Firestore Rules devem repetir o isolamento por `contratoCodigo` e validar os campos mínimos de
  criação; filtro visual sozinho nunca é controle de acesso.
- Comparações de contrato, OS e disciplina devem usar os normalizadores/helpers existentes; não criar
  igualdade crua em uma tela nova.
- O registro só pode ser enviado quando todos os campos obrigatórios do formulário estiverem válidos.
- Regra operacional de entrada: cada item marcado precisa ter `C+T>0`; alterar essa regra somente com
  decisão explícita e atualização conjunta das métricas/status.

## Terceirizadas

- Uma terceirizada pode atender vários setores/disciplinas. O cadastro deve usar múltiplos checkboxes,
  persistir `disciplinas[]` e manter `disciplina` apenas como fallback compatível com registros antigos.
- Ao montar profissionais por disciplina, a mesma terceirizada deve aparecer em cada setor selecionado;
  não limitar o vínculo ao primeiro setor.

## Carregamento de módulos pesados

- Cronograma abre diretamente na tela real: usuários livres iniciam em `Todos` e usuários bloqueados no
  contrato permitido. Pré-tela de escolha de contrato não deve ser usada.
- O login deve pré-carregar Cronograma e EAP; se `appData/cronograma` vier vazio, a EAP é a fonte
  compatível antes de concluir que não há atividades.
- Atividades e Cronograma não podem mostrar lista vazia enquanto o módulo necessário ainda está carregando.
  Exibir estado explícito de carregamento, erro real e tentativa novamente.
- Não apagar dados do Firebase por suspeita de poluição. Primeiro catalogar origem, contagem, dependências
  e uso confirmado; qualquer limpeza exige decisão explícita e backup verificável.

## Dados reais e estados vazios

- Gráficos operacionais devem usar somente registros persistidos. Sem dado real para o filtro, mostrar estado vazio claro; nunca barras, pizza ou métricas de demonstração zeradas.
- Cronograma pode usar a EAP como fonte compatível quando `appData/cronograma` vier vazio, mas não deve exibir “nenhuma atividade” enquanto uma dessas fontes reais ainda estiver carregando.

## Soluções Digitais > Project

- `CronoRow.id` é a chave técnica imutável e `seq` é a base estável do ID mostrado. Inserir, pintar ou reordenar linhas irmãs nunca pode renumerar linhas existentes.
- Uma linha nova recebe UUID novo e `seq` acima do maior já existente; só mudar pai/filho por indentar/promover pode alterar seu código hierárquico exibido.
- Arrastar linha só reorganiza entre irmãs; não muda hierarquia nem predecessoras. Hierarquia é alterada exclusivamente pelos comandos próprios de indentar/promover.
- Ordem de colunas deve ser persistida de forma compatível: documento antigo sem `colOrder` usa a ordem padrão. Tela e exportações CSV/PDF/MD devem apresentar a mesma ordem e os mesmos IDs.

## Administração e pré-cadastro

- Pré-cadastro só é concluído quando o primeiro login Google encontra o e-mail e materializa o usuário aprovado no snapshot de autenticação. E-mail fora do pré-cadastro continua bloqueado.
- A sincronização de pré-cadastro não pode substituir usuários de autenticação já existentes; preservar os registros remotos não envolvidos.

## Regras Firebase por contrato

- Nunca publicar isolamento por contrato baseado apenas em dado gravável pelo cliente ou em filtro visual. A Rule precisa receber o contrato de uma fonte confiável vinculada ao `uid` (custom claim ou documento provisionado por backend/Admin SDK).
- Sem esse provisionamento, manter a limitação como pendência explícita e não publicar uma Rule que bloqueie usuários legítimos ou permita que o próprio usuário escolha o contrato.
