# Instruções do projeto

## Padrão de filtro (dropdown com busca)

Sempre que um campo tiver uma lista de opções que pode crescer (contratos, OS,
disciplinas, etc.), use `SearchableSelect` (`src/components/SearchableSelect.tsx`)
em vez de `<select>` nativo ou de um combobox feito na mão.

Referência de uso: `Curva S` → filtro de Ordem de Serviço
(`src/components/CoordenacaoEngenharia/CurvaS.tsx`) e o editor de notas
(`src/components/CoordenacaoEngenharia/Anotacoes.tsx`, campos de Contrato/OS/Disciplina).

Por quê: é o mesmo componente em todo o app — visual idêntico ao `<select>` normal
(botão com valor + chevron), mas com campo de busca no dropdown, navegação por
setas/Enter/Esc, fecha ao clicar fora, abre pra cima quando falta espaço embaixo.
Escrever um combobox novo (`<input>` + `<datalist>`, estado de query, etc.) duplica
isso pior.

```tsx
import SearchableSelect from '../SearchableSelect'; // ajuste o caminho relativo

<SearchableSelect
  value={selectedValue}
  onChange={(event) => setSelectedValue(event.target.value)}
  searchPlaceholder="Pesquisar..."
  className="h-11 w-[240px] rounded-xl border border-[#E5E7EB] bg-white px-3 text-[13px] font-medium text-[#2D2D2D] outline-none focus:border-[#F05D28]"
>
  <option value="">Todas as opções</option>
  {options.map((item) => (
    <option key={item.codigo} value={item.codigo}>{item.nome}</option>
  ))}
</SearchableSelect>
```

`value`/`onChange`/`children` (`<option>`) funcionam igual a um `<select>` — é
drop-in replacement. O `className` deve seguir o padrão visual dos outros campos
da tela (altura `h-11`, borda `#E5E7EB`, texto `13px` medium, foco `#F05D28`).

## Corretor ortográfico

É o nativo do navegador, em PT-BR: `<html lang="pt-BR">` + `<body spellcheck="true">`
no `index.html`. Vale pra todo `<input>`/`<textarea>` do site sem configuração por
campo. **Não** adicione biblioteca de correção ortográfica — o dicionário do Chrome
(Hunspell PT-BR) é mais completo do que qualquer um que caiba no bundle. Nunca
coloque `spellCheck={false}` num campo de texto que a pessoa escreve à mão.

## Filtro de disciplina: sempre por SETOR

Todo filtro de disciplina do app (Atividades, Notas, janela de Nova nota) exibe **setor**,
nunca a disciplina solta. A empresa ainda não tem um time por disciplina — várias
respondem por um setor só.

A lista é **fechada**: só sai de `getSectorOptions()`, em `src/lib/disciplineCatalog.ts`.
São **20 opções** — 8 setores agrupados + 12 disciplinas que não foram agrupadas:

| Setor | Reúne |
|---|---|
| Arquitetura | ARQ, URB, LAY, LUM, ACES, APS |
| Estrutural | EST, SCO, CONT, SMT, FUND |
| Elétrico | SUB, ELET, SPDA, EREN, CFTV, SOM, AUVI, ACUS, CENO, DADO, AUTO, TELE, ALA |
| Hidrossanitário | HIDS, HIDA, ESG, DREN, REUS, IMPE |
| Terraplanagem/Pavimentação | TERR, VPAV, SINS, VIAR |
| Serviço de Campo | TSD, TOPO |
| PCI/Gás | GAS, PCI |
| AVAC | AVAC, ARCO |

Avulsas (cada uma é seu próprio setor): Mecânica / Caldeiraria, Ambiental,
Compatibilização, Orçamento, Engenharia, Jurídico, Multidisciplinar, Desapropriação,
Supervisão, Gestão do Contrato, Conformidade, Desenvolvimento.

Fora do filtro (`SETORES_OCULTOS`): ECON, GEO, CLSH, GER. Continuam no catálogo — dado
antigo que as referencia segue íntegro.

**Regras ao escrever um filtro novo:**

```tsx
import { disciplineMatchesSector, getSectorOptions } from '../lib/disciplineCatalog';

// opções: nunca liste disciplinas cruas
{getSectorOptions(disciplinasDisponiveis).map((setor) => (
  <option key={setor} value={setor}>{setor}</option>
))}

// casamento: nunca compare string com string
const bate = disciplineMatchesSector(item.disciplina, setorEscolhido);
```

- Nome fora do catálogo **não** vira opção — cadastro livre no admin vazava pro filtro.
- O que fica **gravado no dado** continua sendo a disciplina fina; só a exibição agrupa.
  Quando os setores se separarem, é só tirar linhas de `SETOR_POR_CODIGO`.
- Depois de mexer no agrupamento, rode: `npx tsx src/lib/disciplineSetor.check.ts`

## Geometria da tabela do banco (notas)

`src/lib/bancoGrid.ts` concentra estilos por célula, mesclagem e dimensões — separado
do componente de propósito, porque é a lógica que erra em silêncio (um off-by-one no
remapeamento gruda a formatação na célula errada depois de inserir uma linha).

Ao mexer em inserir/remover linha ou coluna, **sempre** atualize junto: `rows`,
`styles` (via `remapStyles`), `merges` (via `remapMerges`) e `colWidths`/`rowHeights`
(via `spliceSizes`). Esquecer um deles desalinha a tabela sem erro nenhum.

Depois de alterar esse arquivo, rode o check:

```
npx tsx src/lib/bancoGrid.check.ts
```
