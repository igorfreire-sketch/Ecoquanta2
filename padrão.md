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
