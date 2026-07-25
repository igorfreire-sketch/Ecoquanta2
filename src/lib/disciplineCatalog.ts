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

export const DEFAULT_DISCIPLINE_SETTINGS: DisciplineSettingRecord[] = DEFAULT_DISCIPLINES.map((item) => ({
  nome: item.label,
  showInCharts: true,
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
let _gruposNormalizados: Set<string> | null = null;
function isGrupoOficial(value: string) {
  if (!_gruposNormalizados) _gruposNormalizados = new Set(getDisciplineGroups().map((g) => normalizeText(g)));
  return _gruposNormalizados.has(normalizeText(value));
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
const SETORES_OCULTOS = new Set(['ECON', 'GEO', 'CLSH', 'GER']);

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
  if (!codigo) return normalizeDisciplineEntry(value);
  return SETOR_POR_CODIGO[codigo] || ENTRADA_POR_CODIGO.get(codigo)?.name || '';
}

// Unica lista que os filtros de disciplina podem exibir. Nome fora do catalogo NAO entra:
// cadastro livre no admin vazava pro filtro e furava o agrupamento.
export function getSectorOptions(disciplinas: string[]) {
  const setores = new Set<string>();
  disciplinas.forEach((item) => {
    if (!codigoDe(item)) return;
    if (isDisciplineHidden(item)) return;
    const setor = getDisciplineSector(item);
    if (setor) setores.add(setor);
  });
  return Array.from(setores).sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

export function disciplineMatchesSector(disciplina: string, setor: string) {
  if (!setor) return true;
  return getDisciplineSector(disciplina) === setor;
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

// Auto-teste leve (sem framework): chame manualmente se mexer neste arquivo.
export function _selfTestDisciplineGroups() {
  console.assert(getDisciplineSector('ELET') === 'Elétrico', 'ELET deveria mapear pra Elétrico');
  console.assert(getDisciplineSector('Elétrico') === 'Elétrico', 'nome de grupo deveria ser seu proprio setor');
  console.assert(getDisciplineSector('VIAR') === 'Terraplanagem/Pavimentação', 'VIAR deveria mapear pra Terraplanagem/Pavimentação');
  console.assert(getDisciplineSector('MEC') === 'Mecânica / Caldeiraria', 'MEC sem grupo deveria retornar o proprio nome');
  console.assert(disciplineMatchesSector('ELET', 'Elétrico') === true, 'ELET deveria bater com o setor Elétrico');
  const groups = getDisciplineGroups();
  console.assert(groups[0] === 'Arquitetura', 'primeiro grupo deveria ser Arquitetura');
  console.assert(groups.includes('Desenvolvimento'), 'deveria conter Desenvolvimento');
  console.assert(!groups.includes('Gerenciamento'), 'Gerenciamento e oculto, nao deveria aparecer');
  return true;
}
