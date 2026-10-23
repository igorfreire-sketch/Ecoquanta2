// CEPT (OS061) - regras puras, sem React e sem Firebase.
// Fonte de verdade: Apps Script `10_adapter_cept_v3_2_3,gs.txt` (citado como CEPT:linha).
// Divergencia entre este arquivo e o original = bug aqui (ESPEC §0 decisao 3).
// ponytail: so o adapter OS061. OS054 (BD_PADRAO_V1) entra como outro adapter que produz
// os mesmos CeptProject[]; nada aqui depende de osCode alem de CEPT_OS061.

export const CEPT_APP_VERSION = 'EQ2-cept-1';

export const CEPT_OS061 = {
  osCode: '061',
  title: 'OS061 - CEPT | Compatibilização Final',
  // CEPT:47-53 - seed de ceptConfig/validadores (a lista viva fica no Firestore).
  validationEditors: [
    'tarcisio.marques@quantaconsultoria.com',
    'aline.bonsanto@quantaconsultoria.com',
    'gabriela.gama@quantaconsultoria.com',
    'bruno.almeida@quantaconsultoria.com',
    'vinicius.delgado@quantaconsultoria.com',
  ],
  staleBeforeIso: '2026-08-18', // CEPT:57
  nonEditableLagDays: 7, // CEPT:59
  deliverableOrder: ['RVT', 'PDF', 'IFC', 'MC', 'MD', 'ET/RT', 'MA'], // CEPT:63
  disciplineAliases: { ELE: 'ELET' } as Record<string, string>, // CEPT:65-67
  projectNames: {
    '001': 'Implantação', '002': 'Expressões', '003': 'Linguagens', '004': 'Tecnologias',
    '005': 'Complexo Esportivo', '006': 'Cineteatro', '007': 'Planetário', '008': 'Guarita', '009': 'Skatepark',
  } as Record<string, string>, // CEPT:69-79
  restrictedDisciplines: { TOPO: ['001'], TSD: ['001'] } as Record<string, string[]>, // CEPT:82-85
  labels: {
    internal: 'Equipe interna',
    internalArchitecture: 'Equipe interna - Arquitetura',
    internalCivilMec: 'Equipe interna - Civil/Mec',
    internalElectrical: 'Equipe interna - Elétrica',
    unidentified: 'Responsável não identificado',
  }, // CEPT:87-93
  internalTeams: {
    architecture: ['ARQ', 'URB', 'APS'],
    civilMec: ['SCO', 'IMPE', 'HIDA', 'ESG', 'DREN', 'TERR', 'TOPO', 'TSD', 'VPAV', 'AVAC', 'PCI'],
    electrical: ['ELET', 'TELE', 'SPDA', 'EREN', 'SUB'],
  }, // CEPT:97-101
};

export const CEPT_ALERT_MESSAGES = {
  POSTED_BEFORE_CUTOFF: 'Arquivo postado antes de 18/08/2026; pode estar desatualizado.',
  EDITABLE_AFTER_NONEDITABLE: 'Existe arquivo editável posterior ao não editável; o não editável pode estar desatualizado.',
  NONEDITABLE_MORE_THAN_7_DAYS_AFTER_EDITABLE: 'O não editável foi postado mais de 7 dias depois do editável; o editável pode estar desatualizado.',
} as const;

// E §10 (IDX), texto literal.
export const staleMessage = (count: number) =>
  `${count} arquivo(s) selecionado(s) mudaram na planilha original. Os avisos foram recalculados e esses itens não receberam a validação antiga.`;

export type CeptStatus = 'delivered' | 'pending' | 'na' | 'unknown';
export type CeptSeverity = 'none' | 'yellow' | 'red';
export type CeptDisplaySeverity = CeptSeverity | 'green';
export type CeptNature = 'editable' | 'noneditable' | 'unknown';
export type CeptAction = 'RESOLVED' | 'CONFIRMED_OUTDATED' | 'REOPENED';
export type CeptValidationStatus = 'resolved' | 'confirmed_outdated' | 'open' | 'unreviewed';
export const CEPT_ACTIONS: CeptAction[] = ['RESOLVED', 'CONFIRMED_OUTDATED', 'REOPENED'];

/** Doc `cept2Componentes` (1 celula de status+data da planilha V2). */
export interface CeptComponenteDoc {
  osCode: string;
  projectCode: string; // '001'..'009'
  disciplineCode: string; // sigla ja normalizada (ELE->ELET)
  sourceLabel: string; // col B
  sourceType: string; // col C, identificador do componente
  sourceRow: number; // linha da planilha (ordem da grade)
  status: CeptStatus;
  dateRaw: string; // texto exibido da DATA ENTREGA ('' se vazio)
  version?: number;
}

/** Doc `cept2Validacoes` (linha da aba Validacoes, B §B2). */
export interface CeptValidacaoDoc {
  osCode: string;
  at: unknown; // Timestamp (A)
  usuarioEmail: string; // B
  action: CeptAction; // C
  projectCode: string; // D, string 3 digitos
  disciplineCode: string; // E
  family: string; // F
  sourceType: string; // G
  format: string; // H
  nature: string; // I
  signature: string; // J
  severity: string; // K
  reasons: string; // L
  fileDate: string; // M
  counterpartDates: string; // N
  observation: string; // O
  appVersion: string; // P
  batchId: string; // Q
  recordKey: string;
}

export interface CeptAlertReason {
  code: keyof typeof CEPT_ALERT_MESSAGES;
  message: string;
  counterpartDate: string;
  counterpartType?: string;
  days?: number;
}

export interface CeptComponent extends CeptComponenteDoc {
  family: string;
  familyLabel: string;
  format: string;
  editable: boolean | null;
  nature: CeptNature;
  natureLabel: string;
  variantLabel: string;
  date: string;
  dateFull: string;
  dateIso: string;
  recordKey: string;
  signature: string;
  alert: { autoSeverity: CeptSeverity; displaySeverity: CeptDisplaySeverity; reasons: CeptAlertReason[] };
  validationStatus: CeptValidationStatus;
  validationUser: string;
  validationAt: unknown;
  validationObservation: string;
  validationHistoryCount: number;
}

export interface CeptFamily {
  family: string;
  label: string;
  status: CeptStatus;
  date: string;
  delivered: number;
  pending: number;
  applicable: number;
  unknown: number;
  percent: number;
  components: CeptComponent[];
  alert: { displaySeverity: CeptDisplaySeverity; red: number; yellow: number; green: number };
}

export interface CeptDiscipline {
  code: string;
  responsible: string;
  responsibleKind: '' | 'internal' | 'external' | 'unidentified';
  responsibilitySource: string;
  items: Record<string, CeptFamily>;
}

export interface CeptProject {
  code: string;
  name: string;
  disciplines: Record<string, CeptDiscipline>;
  deliverableTypes: string[];
}

// CEPT:1938-1944
export function normalizeText(value: unknown): string {
  return String(value === null || value === undefined ? '' : value)
    .trim().toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

// CEPT:616-619
export function normalizeDisciplineCode(value: unknown): string {
  const code = normalizeText(value);
  return CEPT_OS061.disciplineAliases[code] || code;
}

// CEPT:1918-1922
export function normalizeProjectCode(value: unknown): string {
  const match = String(value || '').match(/\d+/);
  return match ? String(Number(match[0])).padStart(3, '0') : '';
}

// CEPT:678-683
export function extractFormatFromType(type: unknown): string {
  const text = String(type || '').trim();
  const match = text.match(/\(([^)]+)\)\s*$/);
  return match ? match[1].trim().toUpperCase() : text.toUpperCase();
}

const EDITABLE_TOKENS = ['RVT', 'RFA', 'RTE', 'DOC', 'DOCX', 'ODT', 'XLS', 'XLSX', 'XLSM', 'ODS', 'DWG', 'DXF', 'DGN', 'PPT', 'PPTX'];

// CEPT:689-705
export function classifyFormatEditable(format: unknown): boolean | null {
  const f = normalizeText(format);
  if (!f) return null;
  if (f === 'PDF' || f === 'IFC') return false;
  return f.split(/[^A-Z0-9]+/).filter(Boolean).some((part) => EDITABLE_TOKENS.includes(part)) ? true : null;
}

const natureOf = (editable: boolean | null): CeptNature => editable === true ? 'editable' : editable === false ? 'noneditable' : 'unknown';
const variantOf = (editable: boolean | null) => editable === true ? 'Editável' : editable === false ? 'Não editável' : 'Natureza não determinada';

// CEPT:624-676
export function classifyDeliverable(sourceLabel: unknown, sourceType: unknown) {
  const label = String(sourceLabel || '').trim();
  const type = String(sourceType || '').trim();
  const typeNorm = normalizeText(type);
  const labelNorm = normalizeText(label);
  let family: string;
  let familyLabel = label.replace(/\s*\(\s*EDIT[AÁ]VEL\s*\)\s*/i, '').trim();

  if (typeNorm === 'RVT') { family = 'RVT'; familyLabel = 'Modelo BIM'; }
  else if (typeNorm === 'PDF' && labelNorm.includes('PRANCHA')) { family = 'PDF'; familyLabel = 'Prancha'; }
  else if (typeNorm === 'IFC') { family = 'IFC'; familyLabel = 'Modelo OpenBIM'; }
  else if (/^MC\b/.test(typeNorm)) { family = 'MC'; familyLabel = 'Memorial de Cálculo'; }
  else if (/^MD\b/.test(typeNorm)) { family = 'MD'; familyLabel = 'Memorial Descritivo'; }
  else if (/^ET\s*\/\s*RT\b/.test(typeNorm)) { family = 'ET/RT'; familyLabel = 'Espec. / Relatório Técnico'; }
  else if (/^MA\b/.test(typeNorm)) { family = 'MA'; familyLabel = 'Memorial de Análise'; }
  else { family = typeNorm.replace(/\s*\(.*$/, '').trim() || typeNorm; familyLabel = familyLabel || type; }

  const format = extractFormatFromType(type);
  const editable = classifyFormatEditable(format);
  return { family, familyLabel: familyLabel || family, format, editable, variantLabel: variantOf(editable) };
}

// CEPT:709-712
export function isDisciplineAllowedInProject(discipline: string, projectCode: string): boolean {
  const allowed = CEPT_OS061.restrictedDisciplines[discipline];
  return !allowed || allowed.includes(projectCode);
}

const isNaMarker = (value: unknown) => ['-', 'N/A', 'NA'].includes(normalizeText(value));

// CEPT:816-847. Usado pela migracao (le a planilha); a UI grava o status direto.
export function determineSheetStatus(value: unknown, displayValue: unknown, hasCheckbox: boolean, isMerged: boolean): CeptStatus {
  if (value === true) return 'delivered';
  if (value === false) return 'pending';
  const text = normalizeText(displayValue !== null && displayValue !== undefined ? displayValue : value);
  if (isNaMarker(text)) return 'na';
  if (['TRUE', 'VERDADEIRO', 'SIM', 'V', '1'].includes(text)) return 'delivered';
  if (['FALSE', 'FALSO', 'NAO', 'NÃO', '0'].includes(text)) return 'pending';
  if (!text) return isMerged ? 'na' : hasCheckbox ? 'unknown' : 'na';
  return 'unknown';
}

function isValidDateParts(day: number, month: number, year: number) {
  if (!day || !month || !year || month < 1 || month > 12 || day < 1 || day > 31) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

// CEPT:853-890. `dd/mm` sem ano: short sem iso (nao alerta).
export function parseDateInfo(displayValue: unknown): { short: string; full: string; iso: string } {
  const text = String(displayValue === null || displayValue === undefined ? '' : displayValue).trim();
  if (!text) return { short: '', full: '', iso: '' };
  const match = text.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/) || text.match(/^(\d{1,2})[-.](\d{1,2})(?:[-.](\d{2,4}))?$/);
  if (!match) return { short: text, full: text, iso: '' };
  const day = Number(match[1]);
  const month = Number(match[2]);
  const yearText = match[3] || '';
  const year = yearText ? Number(yearText.length === 2 ? '20' + yearText : yearText) : 0;
  const short = String(day).padStart(2, '0') + '/' + String(month).padStart(2, '0');
  if (!year || !isValidDateParts(day, month, year)) return { short, full: text, iso: '' };
  return {
    short,
    full: short + '/' + String(year),
    iso: String(year).padStart(4, '0') + '-' + String(month).padStart(2, '0') + '-' + String(day).padStart(2, '0'),
  };
}

// CEPT:1549-1555
export function dateDiffDaysIso(fromIso: string, toIso: string): number {
  if (!fromIso || !toIso) return 0;
  const from = new Date(fromIso + 'T00:00:00Z').getTime();
  const to = new Date(toIso + 'T00:00:00Z').getTime();
  if (Number.isNaN(from) || Number.isNaN(to)) return 0;
  return Math.round((to - from) / 86400000);
}

// CEPT:1557-1561
export function validationRecordKey(project: unknown, discipline: unknown, family: unknown, component: unknown): string {
  return [project, discipline, family, component].map((value) => String(value || '').trim()).join('|');
}

// CEPT:1563-1573. Web Crypto: navegador e Node 20.
export async function sha256Hex(text: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(text || '')));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

// CEPT:1472-1481. editable vira 'true'/'false'/'null' como String() do original.
export function familyStateOf(components: Array<Pick<CeptComponent, 'sourceType' | 'status' | 'dateIso' | 'editable'>>): string {
  return components
    .map((c) => [String(c.sourceType || ''), String(c.status || ''), String(c.dateIso || ''), String(c.editable)].join(':'))
    .sort()
    .join('||');
}

// CEPT:1575-1581
export function validationStatusFromAction(action: unknown): CeptValidationStatus {
  const a = String(action || '').toUpperCase();
  return a === 'RESOLVED' ? 'resolved' : a === 'CONFIRMED_OUTDATED' ? 'confirmed_outdated' : a === 'REOPENED' ? 'open' : 'unreviewed';
}

const SEVERITY_RANK: Record<string, number> = { none: 0, yellow: 1, red: 2 };

// CEPT:1516-1529
function addComponentAlert(component: CeptComponent, severity: CeptSeverity, reason: CeptAlertReason) {
  if (SEVERITY_RANK[severity] > SEVERITY_RANK[component.alert.autoSeverity]) component.alert.autoSeverity = severity;
  const keyOf = (r: CeptAlertReason) => `${r.code}|${r.counterpartType || ''}|${r.counterpartDate || ''}`;
  if (!component.alert.reasons.some((r) => keyOf(r) === keyOf(reason))) component.alert.reasons.push(reason);
}

// CEPT:1531-1547
function aggregateFamilyAlert(components: CeptComponent[]) {
  const sev = components.map((c) => c.alert.displaySeverity);
  const displaySeverity: CeptDisplaySeverity = sev.includes('red') ? 'red' : sev.includes('yellow') ? 'yellow' : sev.includes('green') ? 'green' : 'none';
  return { displaySeverity, red: sev.filter((s) => s === 'red').length, yellow: sev.filter((s) => s === 'yellow').length, green: sev.filter((s) => s === 'green').length };
}

// CEPT:1404-1470 - as 3 regras, so dentro da mesma familia e com dateIso valido.
export function computeFamilyAlerts(components: CeptComponent[]) {
  components.forEach((c) => { c.alert = { autoSeverity: 'none', displaySeverity: 'none', reasons: [] }; });
  components.forEach((c) => {
    if (c.dateIso && c.dateIso < CEPT_OS061.staleBeforeIso) {
      addComponentAlert(c, 'yellow', { code: 'POSTED_BEFORE_CUTOFF', message: CEPT_ALERT_MESSAGES.POSTED_BEFORE_CUTOFF, counterpartDate: '' });
    }
  });
  const editables = components.filter((c) => c.editable === true && c.dateIso);
  const nonEditables = components.filter((c) => c.editable === false && c.dateIso);
  nonEditables.forEach((ne) => {
    const newer = editables.filter((e) => e.dateIso > ne.dateIso).sort((a, b) => b.dateIso.localeCompare(a.dateIso));
    if (newer.length) {
      addComponentAlert(ne, 'red', {
        code: 'EDITABLE_AFTER_NONEDITABLE', message: CEPT_ALERT_MESSAGES.EDITABLE_AFTER_NONEDITABLE,
        counterpartDate: newer[0].dateFull || newer[0].date || '', counterpartType: newer[0].sourceType || '',
      });
    }
  });
  editables.forEach((e) => {
    const later = nonEditables
      .map((ne) => ({ component: ne, days: dateDiffDaysIso(e.dateIso, ne.dateIso) }))
      .filter((entry) => entry.days > CEPT_OS061.nonEditableLagDays)
      .sort((a, b) => b.days - a.days);
    if (later.length) {
      addComponentAlert(e, 'yellow', {
        code: 'NONEDITABLE_MORE_THAN_7_DAYS_AFTER_EDITABLE', message: CEPT_ALERT_MESSAGES.NONEDITABLE_MORE_THAN_7_DAYS_AFTER_EDITABLE,
        counterpartDate: later[0].component.dateFull || later[0].component.date || '',
        counterpartType: later[0].component.sourceType || '', days: later[0].days,
      });
    }
  });
}

/** Indice das validacoes: a ultima linha (ordem cronologica) por assinatura vale (CEPT:1379-1380). */
export function indexValidations(validations: CeptValidacaoDoc[]) {
  const latestBySignature = new Map<string, CeptValidacaoDoc>();
  const historyCountByRecordKey = new Map<string, number>();
  validations.forEach((v) => {
    const key = validationRecordKey(v.projectCode, v.disciplineCode, v.family, v.sourceType);
    if (key === '|||') return;
    historyCountByRecordKey.set(key, (historyCountByRecordKey.get(key) || 0) + 1);
    if (v.signature) latestBySignature.set(String(v.signature).trim(), v);
  });
  return { latestBySignature, historyCountByRecordKey };
}

// CEPT:749-786
function finalizeFamily(family: string, label: string, components: CeptComponent[]): CeptFamily {
  const delivered = components.filter((c) => c.status === 'delivered').length;
  const pending = components.filter((c) => c.status === 'pending').length;
  const unknown = components.filter((c) => c.status === 'unknown').length;
  const applicable = delivered + pending;
  const status: CeptStatus = pending > 0 ? 'pending' : unknown > 0 ? 'unknown' : applicable > 0 && delivered === applicable ? 'delivered' : 'na';
  return {
    family, label, status, date: components.length === 1 ? components[0].date || '' : '',
    delivered, pending, applicable, unknown, percent: applicablePercent(delivered, pending), components,
    alert: { displaySeverity: 'none', red: 0, yellow: 0, green: 0 },
  };
}

// CEPT:754 / E §5.1
export const applicablePercent = (delivered: number, pending: number) =>
  delivered + pending ? Math.round(delivered / (delivered + pending) * 100) : 0;

// CEPT:870-885
export function collectDeliverables(familyCatalog: string[]): string[] {
  const out = CEPT_OS061.deliverableOrder.filter((f) => familyCatalog.includes(f));
  familyCatalog.forEach((f) => { if (!out.includes(f)) out.push(f); });
  return out;
}

export interface CeptModel {
  projects: CeptProject[];
  familyCatalog: string[];
  disciplineCatalog: string[];
  audit: { falseWithDate: CeptComponent[]; unknownStatuses: CeptComponent[]; unknownFormats: CeptComponent[]; restrictedDisciplineRecords: CeptComponenteDoc[] };
  counts: { red: number; yellow: number; green: number; none: number; active: number };
  /** recordKey -> componente vivo (para o lote de validacao). */
  byRecordKey: Map<string, CeptComponent>;
}

/**
 * CEPT:243-588 + 1399-1514. Docs em qualquer ordem; a ordem da planilha vem de sourceRow.
 * Validacoes devem vir em ordem cronologica (append-only).
 */
export async function buildCeptModel(docs: CeptComponenteDoc[], validations: CeptValidacaoDoc[] = []): Promise<CeptModel> {
  const audit: CeptModel['audit'] = { falseWithDate: [], unknownStatuses: [], unknownFormats: [], restrictedDisciplineRecords: [] };
  const projectMap = new Map<string, CeptProject>();
  const familyCatalog: string[] = [];
  const disciplineCatalog: string[] = [];
  const raw = new Map<string, { label: string; components: CeptComponent[] }>(); // proj|disc|family
  const sorted = [...docs].sort((a, b) => a.sourceRow - b.sourceRow || a.projectCode.localeCompare(b.projectCode));

  sorted.forEach((d) => {
    if (!projectMap.has(d.projectCode)) {
      projectMap.set(d.projectCode, { code: d.projectCode, name: CEPT_OS061.projectNames[d.projectCode] || d.projectCode, disciplines: {}, deliverableTypes: [] });
    }
    if (!disciplineCatalog.includes(d.disciplineCode)) disciplineCatalog.push(d.disciplineCode);
    const del = classifyDeliverable(d.sourceLabel, d.sourceType);
    if (!familyCatalog.includes(del.family)) familyCatalog.push(del.family);
    const dateInfo = parseDateInfo(d.dateRaw);
    if (!isDisciplineAllowedInProject(d.disciplineCode, d.projectCode)) {
      if (d.status !== 'na' || dateInfo.short) audit.restrictedDisciplineRecords.push(d);
      return;
    }
    const component: CeptComponent = {
      ...d,
      family: del.family, familyLabel: del.familyLabel, format: del.format, editable: del.editable,
      nature: natureOf(del.editable), natureLabel: del.editable === null ? 'Natureza não determinada' : del.variantLabel,
      variantLabel: del.variantLabel, date: dateInfo.short, dateFull: dateInfo.full, dateIso: dateInfo.iso,
      recordKey: validationRecordKey(d.projectCode, d.disciplineCode, del.family, d.sourceType), signature: '',
      alert: { autoSeverity: 'none', displaySeverity: 'none', reasons: [] },
      validationStatus: 'unreviewed', validationUser: '', validationAt: null, validationObservation: '', validationHistoryCount: 0,
    };
    if (component.status === 'pending' && component.date) audit.falseWithDate.push(component);
    if (component.status === 'unknown') audit.unknownStatuses.push(component);
    if (component.editable === null) audit.unknownFormats.push(component);
    const key = `${d.projectCode}|${d.disciplineCode}|${del.family}`;
    if (!raw.has(key)) raw.set(key, { label: del.familyLabel, components: [] });
    raw.get(key)!.components.push(component);
  });

  const { latestBySignature, historyCountByRecordKey } = indexValidations(validations);
  const counts = { red: 0, yellow: 0, green: 0, none: 0, active: 0 };
  const byRecordKey = new Map<string, CeptComponent>();

  for (const [key, entry] of raw) {
    const [projectCode, disciplineCode, family] = key.split('|');
    const project = projectMap.get(projectCode)!;
    const discipline = project.disciplines[disciplineCode] ||= { code: disciplineCode, responsible: '', responsibleKind: '', responsibilitySource: '', items: {} };
    const item = finalizeFamily(family, entry.label, entry.components);
    discipline.items[family] = item;

    computeFamilyAlerts(item.components);
    const familyState = familyStateOf(item.components);
    for (const c of item.components) {
      c.signature = await sha256Hex(c.recordKey + '|' + familyState);
      const latest = latestBySignature.get(c.signature);
      c.validationHistoryCount = historyCountByRecordKey.get(c.recordKey) || 0;
      c.validationStatus = latest ? validationStatusFromAction(latest.action) : 'unreviewed';
      c.validationUser = latest?.usuarioEmail || '';
      c.validationAt = latest?.at ?? null;
      c.validationObservation = latest?.observation || '';
      c.alert.displaySeverity = c.alert.autoSeverity !== 'none' && latest?.action === 'RESOLVED' ? 'green' : c.alert.autoSeverity;
      counts[c.alert.displaySeverity]++;
      if (c.alert.displaySeverity === 'red' || c.alert.displaySeverity === 'yellow') counts.active++;
      byRecordKey.set(c.recordKey, c);
    }
    item.alert = aggregateFamilyAlert(item.components);
  }

  const projects = [...projectMap.values()].sort((a, b) => a.code.localeCompare(b.code));
  projects.forEach((project) => {
    // CEPT:563-574 - disciplina integralmente N/A sai do projeto.
    Object.keys(project.disciplines).forEach((code) => {
      const hasReal = Object.values(project.disciplines[code].items).some((item) =>
        item.components.some((c) => c.status === 'delivered' || c.status === 'pending' || c.status === 'unknown'));
      if (!hasReal) delete project.disciplines[code];
    });
    const seen = new Set<string>();
    Object.values(project.disciplines).forEach((d) => Object.keys(d.items).forEach((f) => seen.add(f)));
    project.deliverableTypes = collectDeliverables([...seen]);
  });

  return { projects, familyCatalog, disciplineCatalog, audit, counts, byRecordKey };
}

/** Lista plana de componentes do modelo (KPIs contam componentes, CEPT:923). */
export const allComponents = (projects: CeptProject[]) =>
  projects.flatMap((p) => Object.values(p.disciplines).flatMap((d) => Object.values(d.items).flatMap((i) => i.components)));

// ---------------------------------------------------------------------------
// Responsaveis (CEPT:968-1296), a partir das linhas de Planilha1 (cept2Planejamento).

export interface CeptResponsabilidadeRow {
  projectCode: string; // ja carregado para baixo (mescla de A)
  disciplinaTexto: string; // col C
  modo: string | null; // col E
  terceirizado: string; // col G
  sourceRow: number;
}

// CEPT:1052-1094
export function mapResponsibilityDiscipline(name: unknown): string[] {
  const n = normalizeText(name).replace(/^\*+/, '').trim();
  if (!n) return [];
  if (n === 'TODAS' || n === 'TODOS') return ['__ALL__'];
  const direct = ['ACUS', 'APS', 'ARQ', 'AUVI', 'AVAC', 'CENO', 'DREN', 'ELET', 'EREN', 'ESG', 'HIDA', 'IMPE', 'LUM', 'PCI', 'SCO', 'SOM', 'SPDA', 'SUB', 'TELE', 'TERR', 'TOPO', 'TSD', 'URB', 'VPAV'];
  if (direct.includes(n)) return [n];
  if (n === 'ELE') return ['ELET'];
  if (n.includes('ARQUITETURA')) return ['ARQ'];
  if (n.includes('ESTRUTURA')) return ['SCO'];
  if (n.includes('HIDROSSANIT') || /^HIDRO\b/.test(n)) return ['HIDA', 'ESG'];
  if (n.includes('DRENAGEM')) return ['DREN'];
  if (n.includes('ESGOTO')) return ['ESG'];
  if (/^AGUA\b/.test(n) || n.includes('AGUA ')) return ['HIDA'];
  if (n.includes('ELETR')) return ['ELET'];
  if (n.includes('LOGICA') || n.includes('CFTV') || n.includes('AUTOMACAO')) return ['TELE'];
  if (n === 'PCI' || n.includes('INCEND')) return ['PCI'];
  if (n.includes('SPDA')) return ['SPDA'];
  if (n.includes('AVAC')) return ['AVAC'];
  if (n.includes('IMPERMEABIL')) return ['IMPE'];
  if (n.includes('FOTOVOLTA') || n.includes('ENERGIA RENOV')) return ['EREN'];
  if (n.includes('ILUMINACAO') && n.includes('PROJECAO')) return ['LUM'];
  if (n.includes('SONORIZ')) return ['SOM'];
  if (n.includes('TERRAPLAN')) return ['TERR'];
  return [];
}

// CEPT:1123-1131
export function cleanOwnerName(value: unknown): string {
  const text = String(value || '').trim().replace(/\s+/g, ' ');
  if (!text) return '';
  return normalizeText(text) === 'YAN MOB' ? 'YAN / MOB' : text;
}

type Kind = 'internal' | 'external' | 'unidentified';
interface RespEntry { responsible: string; kind: Kind; sources: string[] }

// CEPT:1096-1121
function responsibilityFromRow(row: CeptResponsabilidadeRow): { responsible: string; kind: Kind } {
  const mode = normalizeText(row.modo);
  const third = cleanOwnerName(row.terceirizado);
  if (mode === 'QUANTA') return { responsible: CEPT_OS061.labels.internal, kind: 'internal' };
  if (mode === 'TERCEIRIZADO' && third) return { responsible: third, kind: 'external' };
  return { responsible: CEPT_OS061.labels.unidentified, kind: 'unidentified' };
}

/** CEPT:985-1036 + finalize (1148-1180) + regra hidraulica (1199-1236). */
export function buildResponsibilityMap(rows: CeptResponsabilidadeRow[]) {
  const candidates: Record<string, Record<string, { list: Array<{ responsible: string; kind: Kind }>; sources: string[] }>> = {};
  const audit = { sourceRows: 0, mappedRows: 0, ignoredRows: [] as CeptResponsabilidadeRow[], conflicts: [] as Array<{ project: string; discipline: string; candidates: string[]; sources: string[]; rule?: string }> };
  [...rows].sort((a, b) => a.sourceRow - b.sourceRow).forEach((row) => {
    const name = String(row.disciplinaTexto || '').trim();
    if (!row.projectCode || !name) return;
    audit.sourceRows++;
    const codes = mapResponsibilityDiscipline(name);
    if (!codes.length) { audit.ignoredRows.push(row); return; }
    const assignment = responsibilityFromRow(row);
    codes.forEach((code) => {
      const entry = ((candidates[row.projectCode] ||= {})[code] ||= { list: [], sources: [] });
      entry.list.push(assignment);
      entry.sources.push(`${name} (linha ${row.sourceRow})`);
    });
    audit.mappedRows++;
  });

  const map: Record<string, Record<string, RespEntry>> = {};
  Object.entries(candidates).forEach(([project, discs]) => {
    map[project] = {};
    Object.entries(discs).forEach(([discipline, entry]) => {
      const unique = new Map(entry.list.map((c) => [`${c.kind}|${c.responsible}`, c]));
      if (unique.size === 1) {
        const only = [...unique.values()][0];
        map[project][discipline] = { ...only, sources: entry.sources };
      } else {
        map[project][discipline] = { responsible: CEPT_OS061.labels.unidentified, kind: 'unidentified', sources: entry.sources };
        audit.conflicts.push({ project, discipline, candidates: [...unique.values()].map((c) => c.responsible), sources: entry.sources });
      }
    });
  });

  // CEPT:1199-1236 - 002..009: DREN/ESG herdam HIDA.
  Object.keys(map).forEach((projectCode) => {
    if (projectCode === '001') return;
    const pm = map[projectCode];
    const hida = pm.HIDA;
    if (!hida || !hida.responsible || !hida.kind) return;
    ['ESG', 'DREN'].forEach((target) => {
      const existing = pm[target];
      if (existing && existing.responsible && (existing.responsible !== hida.responsible || existing.kind !== hida.kind)) {
        audit.conflicts.push({
          project: projectCode, discipline: target, candidates: [existing.responsible, hida.responsible],
          sources: existing.sources.concat(hida.sources),
          rule: 'DREN/ESG das edificações devem ter a mesma responsabilidade de HIDA; 001 - Implantação é exceção.',
        });
      }
      pm[target] = {
        responsible: hida.responsible, kind: hida.kind,
        sources: (existing?.sources || []).concat(hida.sources).concat(['Regra CEPT: responsabilidade herdada de HIDA (exceto 001 - Implantação)']),
      };
    });
  });
  return { map, audit };
}

// CEPT:1238-1256
export function internalTeamForDiscipline(code: string): string {
  const c = normalizeText(code);
  const t = CEPT_OS061.internalTeams;
  const l = CEPT_OS061.labels;
  return t.architecture.includes(c) ? l.internalArchitecture : t.civilMec.includes(c) ? l.internalCivilMec : t.electrical.includes(c) ? l.internalElectrical : l.internal;
}

// CEPT:1258-1296. Nunca altera status.
export function applyResponsibilities(projects: CeptProject[], map: Record<string, Record<string, RespEntry>>) {
  projects.forEach((project) => {
    Object.values(project.disciplines).forEach((d) => {
      const statuses = Object.values(d.items).map((i) => i.status);
      if (statuses.length > 0 && statuses.every((s) => s === 'na')) {
        Object.assign(d, { responsible: '', responsibleKind: '', responsibilitySource: '' });
        return;
      }
      const pm = map[project.code] || {};
      const entry = pm[d.code] || pm.__ALL__ || null;
      if (!entry) {
        Object.assign(d, { responsible: CEPT_OS061.labels.unidentified, responsibleKind: 'unidentified', responsibilitySource: '' });
        return;
      }
      d.responsible = entry.kind === 'internal' ? internalTeamForDiscipline(d.code) : entry.responsible;
      d.responsibleKind = entry.kind;
      d.responsibilitySource = entry.sources.join(' · ');
    });
  });
}

// ---------------------------------------------------------------------------
// Planilha1: dias uteis (coluna I). Copia a formula da planilha (D §1.1).

export type CeptLodKey = '100' | '200' | '300' | '350' | '400' | 'final';
export const CEPT_LOD_KEYS: CeptLodKey[] = ['100', '200', '300', '350', '400', 'final'];

/**
 * `lodExcluiDoTotal`: null = linha sem formula em I (dias uteis vazio, T5);
 * [] = SUM(J:O); ['100','200'] = SUM(J:O)-J-K (I101/I102). Texto em O (finalNota) e ignorado pela soma.
 */
export function diasUteis(lod: Partial<Record<CeptLodKey, number | null>>, lodExcluiDoTotal: string[] | null): number | null {
  if (!lodExcluiDoTotal) return null;
  return CEPT_LOD_KEYS.reduce((sum, key) => {
    const v = lod[key];
    return sum + (typeof v === 'number' && Number.isFinite(v) && !lodExcluiDoTotal.includes(key) ? v : 0);
  }, 0);
}

// ---------------------------------------------------------------------------
// Lote de validacao (CEPT:1710-1883). Sempre compara contra o estado vivo
// (equivale ao caminho `sourceChanged` do original: nunca confia no cliente).

export interface CeptValidationRequestItem {
  projectCode: string;
  discipline: string;
  family: string;
  sourceType: string;
  signature: string;
  recordKey?: string;
  observation?: string;
}

export type CeptValidationResult =
  | { ok: true; recordKey: string; signature: string; action: CeptAction; validationStatus: CeptValidationStatus; autoSeverity: CeptSeverity; displaySeverity: CeptDisplaySeverity; observation: string; batchId: string }
  | { ok: false; stale: true; recordKey: string; requestedSignature: string; currentSignature: string; autoSeverity: CeptSeverity; displaySeverity: CeptDisplaySeverity }
  | { ok: false; skipped: true; recordKey: string; signature: string; reason: 'no_alert' };

export function planValidationBatch(input: {
  action: string;
  items: CeptValidationRequestItem[];
  observation?: string;
  userEmail: string;
  validators: string[];
  live: Map<string, CeptComponent>;
  batchId: string;
  osCode?: string;
}) {
  const email = String(input.userEmail || '').trim().toLowerCase();
  if (!input.validators.map((v) => String(v).trim().toLowerCase()).includes(email)) {
    throw new Error('Seu usuário não possui permissão para alterar validações do CEPT.');
  }
  const action = String(input.action || '').trim().toUpperCase() as CeptAction;
  if (!CEPT_ACTIONS.includes(action)) throw new Error('Ação de validação inválida.');
  const requested = Array.isArray(input.items) ? input.items : [];
  if (!requested.length) throw new Error('Nenhum arquivo foi selecionado para validação.');
  if (requested.length > 500) throw new Error('Selecione no máximo 500 arquivos por operação.');

  const rows: Omit<CeptValidacaoDoc, 'at'>[] = [];
  const results: CeptValidationResult[] = [];
  let staleCount = 0;

  requested.forEach((raw) => {
    const item = raw || ({} as CeptValidationRequestItem);
    const projectCode = String(item.projectCode || '').trim();
    const discipline = String(item.discipline || '').trim();
    const family = String(item.family || '').trim();
    const sourceType = String(item.sourceType || '').trim();
    const recordKey = validationRecordKey(projectCode, discipline, family, sourceType);
    const requestedSignature = String(item.signature || '').trim();
    if (!projectCode || !discipline || !family || !sourceType || !requestedSignature) {
      throw new Error('Um dos arquivos selecionados não possui identificação/assinatura suficiente. Atualize o dashboard.');
    }
    const declared = String(item.recordKey || '').trim();
    if (declared && declared !== recordKey) throw new Error('Identificação inconsistente em um arquivo selecionado. Atualize o dashboard.');

    const current = input.live.get(recordKey);
    if (!current || current.signature !== requestedSignature) {
      staleCount++;
      results.push({
        ok: false, stale: true, recordKey, requestedSignature, currentSignature: current?.signature || '',
        autoSeverity: current?.alert.autoSeverity || 'none', displaySeverity: current?.alert.displaySeverity || 'none',
      });
      return;
    }
    if (current.alert.autoSeverity === 'none') {
      results.push({ ok: false, skipped: true, recordKey, signature: requestedSignature, reason: 'no_alert' });
      return;
    }
    const reasons = current.alert.reasons;
    const observation = String(item.observation != null ? item.observation : (input.observation || '')).trim();
    rows.push({
      osCode: input.osCode || CEPT_OS061.osCode,
      usuarioEmail: email, action, projectCode, disciplineCode: discipline, family, sourceType,
      format: current.format || '', nature: current.nature || '', signature: requestedSignature,
      severity: current.alert.autoSeverity,
      reasons: reasons.map((r) => r.message).filter(Boolean).join(' | '),
      fileDate: current.dateFull || current.date || '',
      counterpartDates: [...new Set(reasons.map((r) => r.counterpartDate).filter(Boolean))].join(' | '),
      observation, appVersion: CEPT_APP_VERSION, batchId: input.batchId, recordKey,
    });
    results.push({
      ok: true, recordKey, signature: requestedSignature, action, validationStatus: validationStatusFromAction(action),
      autoSeverity: current.alert.autoSeverity, displaySeverity: action === 'RESOLVED' ? 'green' : current.alert.autoSeverity,
      observation, batchId: input.batchId,
    });
  });

  return { action, rows, results, savedCount: rows.length, staleCount, skippedCount: results.filter((r) => 'skipped' in r).length };
}
