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

export function resolveDisciplineEntry(value?: string) {
  const cleaned = normalizeDisciplineEntry(value);
  if (!cleaned) return '';
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

export function buildDisciplineRecordsFromValues(values: any) {
  const list = splitDisciplineValues(values);
  return list.length > 0 ? list : [];
}
