export interface DisciplineCatalogEntry {
  code: string;
  name: string;
  label: string;
  aliases: string[];
}

export interface DisciplineSettingRecord {
  nome: string;
  showInCharts: boolean;
}

const DISCIPLINE_SOURCE: Array<[string, string]> = [
  ['ARQ', 'Arquitetura'],
  ['URB', 'Urbanismo'],
  ['LAY', 'Layout'],
  ['LUM', 'Luminot\u00e9cnica'],
  ['ACES', 'Acessibilidade'],
  ['APS', 'Paisagismo'],
  ['TSD', 'Sondagem'],
  ['EST', 'Estrutura Mista'],
  ['SCO', 'Estrutura de Concreto'],
  ['CONT', 'Conten\u00e7\u00e3o'],
  ['SMT', 'Estrutura Met\u00e1lica'],
  ['FUND', 'Funda\u00e7\u00f5es'],
  ['HIDS', 'Hidrossanit\u00e1rio'],
  ['HIDA', 'Hidr\u00e1ulica'],
  ['ESG', 'Esgoto'],
  ['DREN', 'Drenagem'],
  ['GAS', 'G\u00e1s'],
  ['REUS', 'Reuso'],
  ['SUB', 'Subesta\u00e7\u00e3o'],
  ['ELET', 'El\u00e9trica'],
  ['SPDA', 'SPDA'],
  ['EREN', 'Energia Renov\u00e1vel'],
  ['CFTV', 'CFTV'],
  ['SOM', 'Sonoriza\u00e7\u00e3o'],
  ['AUVI', '\u00c1udio e V\u00eddeo'],
  ['ACUS', 'Ac\u00fastica'],
  ['CENO', 'Cenot\u00e9cnica'],
  ['DADO', 'Dados'],
  ['AUTO', 'Automa\u00e7\u00e3o'],
  ['TELE', 'Telecom'],
  ['AVAC', 'AVAC'],
  ['ARCO', 'Ar Comprimido'],
  ['IMPE', 'Impermeabiliza\u00e7\u00e3o'],
  ['ALA', 'Alarme'],
  ['PCI', 'PCI'],
  ['TERR', 'Terraplanagem'],
  ['TOPO', 'Topografia'],
  ['VPAV', 'Vias e Pavimenta\u00e7\u00e3o'],
  ['SINS', 'Sinaliza\u00e7\u00e3o Vi\u00e1ria'],
  ['MEC', 'Mec\u00e2nica / Caldeiraria'],
  ['AMB', 'Ambiental'],
  ['COMP', 'Compatibiliza\u00e7\u00e3o'],
  ['ORC', 'Or\u00e7amento'],
  ['ENG', 'Engenharia'],
  ['JUR', 'Jur\u00eddico'],
  ['MULT', 'Multidisciplinar'],
  ['ECON', 'Econ\u00f4mico-Financeiro'],
  ['GEO', 'Geof\u00edsica'],
  ['VIAR', 'Vi\u00e1rio'],
  ['DES', 'Desapropria\u00e7\u00e3o'],
  ['CLSH', 'Clash'],
  ['SUP', 'Supervis\u00e3o'],
  ['GER', 'Gerenciamento'],
  ['GECO', 'Gest\u00e3o do Contrato'],
  ['CONF', 'Conformidade'],
  ['DEV', 'Desenvolvimento'],
  ['BISD', 'BI e Soluções Digitais'],
];

function normalizeText(value?: string) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function buildAliases(code: string, name: string) {
  return Array.from(
    new Set(
      [code, name, `${code} - ${name}`, `${code} ${name}`, `${name} - ${code}`]
        .map((value) => String(value || '').trim())
        .filter(Boolean)
    )
  );
}

export const DEFAULT_DISCIPLINES: DisciplineCatalogEntry[] = DISCIPLINE_SOURCE.map(([code, name]) => ({
  code,
  name,
  label: `${code} - ${name}`,
  aliases: buildAliases(code, name),
}));

const DISCIPLINE_LOOKUP = (() => {
  const map = new Map<string, DisciplineCatalogEntry>();
  DEFAULT_DISCIPLINES.forEach((item) => {
    item.aliases.forEach((alias) => map.set(normalizeText(alias), item));
  });
  return map;
})();

export function normalizeDisciplineEntry(value: string) {
  return String(value || '').trim();
}

// Grupos oficiais NAO sao reescritos para o label "COD - Nome" de uma disciplina fina homonima
// (ex.: "Desenvolvimento" nao vira "DEV - Desenvolvimento"). Sem isso, marcar um grupo no cadastro
// gravava um valor diferente da opcao exibida e o seletor "marcava e nao desmarcava".
let _gruposNormalizados: Map<string, string> | null = null;
// Devolve a grafia oficial do grupo (ou '' se nao for grupo). Serve tanto pro teste "e grupo?"
// quanto pra canonizar "eletrico" -> "Eletrico" vindo do cadastro do admin.
function grupoOficial(value: string) {
  if (!_gruposNormalizados) {
    _gruposNormalizados = new Map(getDisciplineGroups().map((g) => [normalizeText(g), g]));
  }
  return _gruposNormalizados.get(normalizeText(value)) || '';
}
function isGrupoOficial(value: string) {
  return Boolean(grupoOficial(value));
}

export function resolveDisciplineEntry(value?: string) {
  const cleaned = normalizeDisciplineEntry(value);
  if (!cleaned) return '';
  if (isGrupoOficial(cleaned)) return cleaned;
  const match = DISCIPLINE_LOOKUP.get(normalizeText(cleaned));
  return match?.label || cleaned;
}

export function splitDisciplineValues(value: any) {
  if (Array.isArray(value)) {
    return value.map((item) => resolveDisciplineEntry(String(item || ''))).filter(Boolean);
  }

  return String(value || '')
    .split(/[\n,;|]+/)
    .map((item) => resolveDisciplineEntry(item))
    .filter(Boolean);
}

export function getPrimaryDisciplineValue(value?: string | string[]) {
  if (Array.isArray(value)) return resolveDisciplineEntry(value[0]);
  return resolveDisciplineEntry(value);
}

export function getUserDisciplineList(user?: { disciplina?: string; disciplinas?: string[] | string }) {
  const fromArray = splitDisciplineValues((user as any)?.disciplinas);
  if (fromArray.length > 0) return fromArray;

  const single = getPrimaryDisciplineValue(user?.disciplina);
  return single ? [single] : [];
}

export function getUserPrimaryDiscipline(user?: { disciplina?: string; disciplinas?: string[] | string }) {
  const list = getUserDisciplineList(user);
  return list[0] || '';
}

// ---- Setores ----
// A empresa ainda nao tem um time por disciplina, entao varias disciplinas respondem por um
// setor so. Os FILTROS falam em setor; a disciplina fina continua gravada nos dados, pronta
// pra quando os setores forem separados.
const SETOR_POR_CODIGO: Record<string, string> = {
  ARQ: 'Arquitetura', URB: 'Arquitetura', LAY: 'Arquitetura',
  LUM: 'Arquitetura', ACES: 'Arquitetura', APS: 'Arquitetura',

  TSD: 'Serviço de Campo', TOPO: 'Serviço de Campo',

  EST: 'Estrutural', SCO: 'Estrutural', CONT: 'Estrutural',
  SMT: 'Estrutural', FUND: 'Estrutural',

  HIDS: 'Hidrossanitário', HIDA: 'Hidrossanitário', ESG: 'Hidrossanitário',
  DREN: 'Hidrossanitário', REUS: 'Hidrossanitário', IMPE: 'Hidrossanitário',

  GAS: 'PCI/Gás', PCI: 'PCI/Gás',

  SUB: 'Elétrico', ELET: 'Elétrico', SPDA: 'Elétrico', EREN: 'Elétrico',
  CFTV: 'Elétrico', SOM: 'Elétrico', AUVI: 'Elétrico', ACUS: 'Elétrico',
  CENO: 'Elétrico', DADO: 'Elétrico', AUTO: 'Elétrico', TELE: 'Elétrico',
  ALA: 'Elétrico',

  AVAC: 'AVAC', ARCO: 'AVAC',

  TERR: 'Terraplanagem/Pavimentação', VPAV: 'Terraplanagem/Pavimentação',
  SINS: 'Terraplanagem/Pavimentação', VIAR: 'Terraplanagem/Pavimentação',
};

// Marcadas como "Excluir": somem das listas de filtro. Os dados antigos continuam intactos.
// DEV/MULT saíram por pedido do Igor em 2026-07-31 - a empresa passou a trabalhar só com o
// conjunto de setores abaixo (ver getDisciplineGroups).
const SETORES_OCULTOS = new Set(['ECON', 'GEO', 'CLSH', 'GER', 'DEV', 'MULT']);

// Disciplinas de Engenharia: ao marcar o grupo-mae "Engenharia" numa selecao, essas entram
// juntas. Pedido explicito do Igor em 2026-07-31 - lista fechada, nao deriva de codigo algum.
export const DISCIPLINAS_FILHAS_DE_ENGENHARIA = [
  'Estrutural', 'Hidrossanitário', 'PCI/Gás', 'Elétrico', 'AVAC',
  'Terraplanagem/Pavimentação', 'Mecânica / Caldeiraria', 'Ambiental',
  'Compatibilização', 'Orçamento',
];

// Expande "Engenharia" pras filhas quando ela estiver na selecao (idempotente - repetir nao duplica).
export function expandEngenhariaNaSelecao(disciplinas: string[]): string[] {
  if (!disciplinas.includes('Engenharia')) return disciplinas;
  const conjunto = new Set([...disciplinas, ...DISCIPLINAS_FILHAS_DE_ENGENHARIA]);
  return Array.from(conjunto);
}

const CODIGO_POR_ALIAS = (() => {
  const map = new Map<string, string>();
  DEFAULT_DISCIPLINES.forEach((item) => {
    item.aliases.forEach((alias) => map.set(normalizeText(alias), item.code));
  });
  return map;
})();

const ENTRADA_POR_CODIGO = new Map(DEFAULT_DISCIPLINES.map((item) => [item.code, item]));

function codigoDe(value?: string) {
  return CODIGO_POR_ALIAS.get(normalizeText(normalizeDisciplineEntry(value))) || '';
}

export function isDisciplineHidden(value?: string) {
  const codigo = codigoDe(value);
  return Boolean(codigo) && SETORES_OCULTOS.has(codigo);
}

// Setor de uma disciplina. Sem agrupamento definido, ela e o proprio setor - e usa o NOME
// limpo, nao o label "COD - Nome", pra ficar do mesmo jeito que os setores agrupados.
export function getDisciplineSector(value?: string) {
  const codigo = codigoDe(value);
  // Setor agrupado (Estrutural, Eletrico...) nao e disciplina fina: nao tem codigo, mas e o
  // proprio setor - devolve na grafia oficial do catalogo de grupos.
  if (!codigo) return grupoOficial(String(value || '')) || normalizeDisciplineEntry(value);
  return SETOR_POR_CODIGO[codigo] || ENTRADA_POR_CODIGO.get(codigo)?.name || '';
}

// Unica lista que os filtros de disciplina podem exibir: disciplina fina do catalogo OU grupo
// oficial (e o que o admin cadastra hoje). Nome fora dos dois NAO entra - cadastro livre no
// admin vazava pro filtro e furava o agrupamento.
export function getSectorOptions(disciplinas: string[]) {
  const setores = new Set<string>();
  disciplinas.forEach((item) => {
    if (!codigoDe(item) && !isGrupoOficial(item)) return;
    if (isDisciplineHidden(item)) return;
    const setor = getDisciplineSector(item);
    if (setor) setores.add(setor);
  });
  return Array.from(setores).sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

// "Engenharia" no filtro tem que trazer junto as disciplinas filhas (Estrutural, Hidrossanitario
// etc. sao setores PROPRIOS, distintos de "Engenharia") - senao filtrar por Engenharia so pega
// quem estiver literalmente cadastrado como "Engenharia", nunca as filhas. Vale pra qualquer
// filtro do app que compare disciplina x setor, porque a checagem mora aqui, na raiz.
export function disciplineMatchesSector(disciplina: string, setor: string) {
  if (!setor) return true;
  const setorDaDisciplina = getDisciplineSector(disciplina);
  if (setorDaDisciplina === setor) return true;
  if (setor === 'Engenharia') return DISCIPLINAS_FILHAS_DE_ENGENHARIA.includes(setorDaDisciplina);
  return false;
}

export function buildDisciplineRecordsFromValues(values: any) {
  const list = splitDisciplineValues(values);
  return list.length > 0 ? list : [];
}

// Lista fixa de GRUPOS oficiais (setores agrupados + disciplinas "sem grupo", que viram
// seu proprio grupo), na ordem de primeira aparicao em DEFAULT_DISCIPLINES. E o que os
// seletores de cadastro vao usar quando os grupos virarem a disciplina oficial.
export function getDisciplineGroups(): string[] {
  const groups: string[] = [];
  const seen = new Set<string>();
  DEFAULT_DISCIPLINES.forEach((item) => {
    if (isDisciplineHidden(item.code)) return;
    const grupo = getDisciplineSector(item.code);
    if (grupo && !seen.has(grupo)) {
      seen.add(grupo);
      groups.push(grupo);
    }
  });
  return groups;
}

// Catalogo oficial exposto no admin (Gerenciar Disciplinas): so os grupos curados, nunca mais
// os 55 codigos finos do DEFAULT_DISCIPLINES cru - esses continuam existindo so como alias
// interno pra reconhecer sigla da EAP (HIDS, ELET...) e resolver disciplina antiga ja gravada.
export const DEFAULT_DISCIPLINE_SETTINGS: DisciplineSettingRecord[] = getDisciplineGroups().map((nome) => ({
  nome,
  showInCharts: true,
}));

// Auto-teste leve (sem framework): chame manualmente se mexer neste arquivo.
export function _selfTestDisciplineGroups() {
  console.assert(getDisciplineSector('ELET') === 'Elétrico', 'ELET deveria mapear pra Elétrico');
  console.assert(getDisciplineSector('Elétrico') === 'Elétrico', 'nome de grupo deveria ser seu proprio setor');
  console.assert(getDisciplineSector('VIAR') === 'Terraplanagem/Pavimentação', 'VIAR deveria mapear pra Terraplanagem/Pavimentação');
  console.assert(getDisciplineSector('MEC') === 'Mecânica / Caldeiraria', 'MEC sem grupo deveria retornar o proprio nome');
  console.assert(disciplineMatchesSector('ELET', 'Elétrico') === true, 'ELET deveria bater com o setor Elétrico');
  const groups = getDisciplineGroups();
  console.assert(groups[0] === 'Arquitetura', 'primeiro grupo deveria ser Arquitetura');
  console.assert(groups.includes('Engenharia') && groups.includes('BI e Soluções Digitais'), 'deveria conter Engenharia e BISD');
  console.assert(!groups.includes('Desenvolvimento') && !groups.includes('Multidisciplinar'), 'DEV/MULT saíram do catalogo oficial');
  console.assert(!groups.includes('Gerenciamento'), 'Gerenciamento e oculto, nao deveria aparecer');
  console.assert(groups.length === 19, `esperado 19 grupos oficiais, veio ${groups.length}`);
  console.assert(
    expandEngenhariaNaSelecao(['Engenharia']).includes('Hidrossanitário'),
    'marcar Engenharia deveria trazer as filhas junto'
  );
  console.assert(
    disciplineMatchesSector('ELET', 'Engenharia') === true,
    'filtro Engenharia deveria pegar disciplina de setor filho (Elétrico)'
  );
  console.assert(
    disciplineMatchesSector('ELET', 'Hidrossanitário') === false,
    'filtro Hidrossanitário nao deveria pegar disciplina de outro setor filho (Elétrico)'
  );
  return true;
}
