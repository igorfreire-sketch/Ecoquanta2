// Modulo puro do dashboard CEPT (ADR 0001). Sem import de Firebase.
// Entrada = arrays de componente/validacao/responsavel; saida = modelo derivado do dashboard.
// Ver docs/decisoes/0001-cept-acompanhamento-entregas-firestore.md §2/§3.

import { projectCodes, projectNames } from './ceptCatalog';

export type CeptStatus = 'delivered' | 'pending' | 'na' | 'unknown';
export type CeptEditable = true | false | null;

export interface CeptComponent {
  recordKey: string;
  projectCode: string;
  disciplineCode: string;
  family: string;
  familyLabel: string;
  sourceLabel: string;
  sourceType: string;
  format: string;
  editable: CeptEditable;
  status: CeptStatus;
  dateIso: string;
  edificacao?: string;
  updatedAt?: string;
  updatedByEmail?: string;
  updatedByNome?: string;
}

export type CeptValidationAction = 'RESOLVED' | 'CONFIRMED_OUTDATED' | 'REOPENED';

export interface CeptValidacao {
  recordKey: string;
  projectCode: string;
  signature: string;
  action: CeptValidationAction;
  usuarioEmail: string;
  usuarioNome: string;
  criadoEm: unknown; // serverTimestamp() no Firestore; aqui aceita Date/string/Timestamp-like -- modulo puro nao importa Firebase
  severity?: string;
  reasons?: string[];
  fileDate?: string;
  counterpartDate?: string;
  observacao?: string;
  version?: number;
}

export type ValidationStatus = 'unreviewed' | 'resolved' | 'confirmed_outdated' | 'open';

export type CeptAlertRule =
  | 'POSTED_BEFORE_CUTOFF'
  | 'EDITABLE_AFTER_NONEDITABLE'
  | 'NONEDITABLE_MORE_THAN_7_DAYS_AFTER_EDITABLE';

export type CeptAlertSeverity = 'red' | 'yellow';

export interface CeptAlert {
  recordKey: string;
  projectCode: string;
  disciplineCode: string;
  rule: CeptAlertRule;
  severity: CeptAlertSeverity;
  fileDate: string;
  counterpartDate?: string;
  reasons: string[];
}

export interface CeptAlertView extends CeptAlert {
  signature: string;
  validationStatus: ValidationStatus;
  displaySeverity: CeptAlertSeverity | 'green';
}

export interface CeptFamilyRollup {
  family: string;
  familyLabel: string;
  status: CeptStatus;
  delivered: number;
  pending: number;
  unknown: number;
  applicable: number;
  percent: number;
  components: CeptComponent[];
}

export interface CeptResponsavel {
  responsavel: string;
  tipo: 'internal' | 'external' | 'unidentified';
  origem: string;
}

export interface CeptDisciplineRollup {
  disciplineCode: string;
  responsavel?: CeptResponsavel;
  families: CeptFamilyRollup[];
}

export interface CeptProjectRollup {
  projectCode: string;
  projectName: string;
  disciplines: CeptDisciplineRollup[];
}

export interface CeptModel {
  projects: CeptProjectRollup[];
  alerts: CeptAlertView[];
}

export const DEFAULT_CUTOFF_ISO = '2026-08-18';

// Formatos por natureza (ADR + instrucao da rodada). Usados so como fallback quando
// `component.editable` vem null ("natureza nao determinada") -- quando o campo ja
// esta gravado, ele manda, pois e o dado auditavel do import.
const EDITABLE_FORMATS = new Set([
  'RVT', 'RFA', 'RTE', 'DOC', 'DOCX', 'ODT', 'XLS', 'XLSX', 'XLSM', 'ODS', 'DWG', 'DXF', 'DGN', 'PPT', 'PPTX',
]);
const NONEDITABLE_FORMATS = new Set(['PDF', 'IFC']);

export function isEditableFormat(format: string): boolean {
  return EDITABLE_FORMATS.has(String(format || '').toUpperCase());
}

export function isNonEditableFormat(format: string): boolean {
  return NONEDITABLE_FORMATS.has(String(format || '').toUpperCase());
}

function resolveEditable(component: CeptComponent): boolean | null {
  if (component.editable === true || component.editable === false) return component.editable;
  if (isEditableFormat(component.format)) return true;
  if (isNonEditableFormat(component.format)) return false;
  return null;
}

// O recordKey e o ID do documento em ceptComponentes (ADR §1), e ID do Firestore nao pode
// conter '/'. A family canonica 'ET/RT' (ceptCatalog.ts) e o sourceType cru da planilha
// ("ET / RT (PDF)") tem barra. O valor real continua intacto nos campos do documento; so o
// segmento da CHAVE e saneado. O espaco em volta da barra some junto para que "ET / RT",
// "ET /RT" e "ET/RT" deem o MESMO id -- senao espaco a mais na planilha vira documento novo
// e orfana as validacoes presas ao id antigo.
// Esta e a UNICA definicao: scripts/migracao/cept-import.ts importa daqui, nunca reimplementa.
export function sanitizeKeySegment(segmento: string): string {
  const limpo = String(segmento || '')
    .replace(/\s*\/\s*/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
  if (!limpo) throw new Error('segmento de recordKey vazio apos sanear');
  return limpo;
}

export function buildRecordKey(projectCode: string, disciplineCode: string, family: string, sourceType: string): string {
  return [projectCode, disciplineCode, family, sourceType].map(sanitizeKeySegment).join('|');
}

const familyGroupKey = (c: Pick<CeptComponent, 'projectCode' | 'disciplineCode' | 'family'>) =>
  [c.projectCode, c.disciplineCode, c.family].join('|');

// ADR §3: signature = recordKey + '|' + estado canonico da familia (join ordenado
// sourceType:status:dateIso:editable de todos os componentes da familia). Sem hash --
// mesmo idioma de Alertas.tsx:146-152.
export function buildSignature(component: CeptComponent, allComponents: CeptComponent[]): string {
  const key = familyGroupKey(component);
  const canonical = allComponents
    .filter((c) => familyGroupKey(c) === key)
    .map((c) => `${c.sourceType}:${c.status}:${c.dateIso}:${c.editable}`)
    .sort()
    .join(',');
  return `${component.recordKey}|${canonical}`;
}

function toMillis(value: unknown): number {
  if (!value) return 0;
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return Date.parse(value) || 0;
  if (value instanceof Date) return value.getTime();
  const obj = value as { toMillis?: () => number; seconds?: number };
  if (typeof obj.toMillis === 'function') return obj.toMillis();
  if (typeof obj.seconds === 'number') return obj.seconds * 1000;
  return 0;
}

// ADR §3: cruza a ultima decisao do recordKey com a assinatura atual. Diferente ->
// 'unreviewed' e o alerta reaparece, sem escrita nenhuma.
export function resolveValidationStatus(
  recordKey: string,
  currentSignature: string,
  validations: CeptValidacao[]
): ValidationStatus {
  const related = validations.filter((v) => v.recordKey === recordKey);
  if (!related.length) return 'unreviewed';
  const latest = related.reduce((a, b) => (toMillis(b.criadoEm) >= toMillis(a.criadoEm) ? b : a));
  if (latest.signature !== currentSignature) return 'unreviewed';
  if (latest.action === 'RESOLVED') return 'resolved';
  if (latest.action === 'CONFIRMED_OUTDATED') return 'confirmed_outdated';
  return 'open'; // REOPENED
}

function diffDays(fromIso: string, toIso: string): number {
  const [fy, fm, fd] = fromIso.split('-').map(Number);
  const [ty, tm, td] = toIso.split('-').map(Number);
  const from = Date.UTC(fy, (fm || 1) - 1, fd || 1);
  const to = Date.UTC(ty, (tm || 1) - 1, td || 1);
  return (to - from) / 86400000;
}

// As tres regras (ADR §2). Rodam sobre o conjunto completo de componentes.
export function computeAlerts(components: CeptComponent[], cutoffIso: string = DEFAULT_CUTOFF_ISO): CeptAlert[] {
  const alerts: CeptAlert[] = [];

  // Regra 1: entregue e postado antes do corte.
  for (const c of components) {
    if (c.status === 'delivered' && c.dateIso && c.dateIso < cutoffIso) {
      alerts.push({
        recordKey: c.recordKey,
        projectCode: c.projectCode,
        disciplineCode: c.disciplineCode,
        rule: 'POSTED_BEFORE_CUTOFF',
        // ponytail: ADR nao fixa cor pra esta regra (so fixa vermelho/amarelo das outras
        // duas); amarelo e o default ate o dono do produto confirmar. Trocar aqui se vier especificado.
        severity: 'yellow',
        fileDate: c.dateIso,
        reasons: [`Entregue em ${c.dateIso}, antes do corte ${cutoffIso}`],
      });
    }
  }

  // Regras 2/3: par editavel x nao-editavel dentro da MESMA familia (projeto+disciplina+family).
  // sourceType ja e o rotulo que distingue formato dentro da familia (ex. "MC (PDF)" x
  // "MC (DOCX/XLSX)" sao dois sourceType da familia MC) -- agrupar por sourceType juntaria
  // sempre componentes do mesmo editable, e as regras nunca disparariam. Fonte: applyAlertsAndValidations_
  // do Apps Script original, que compara discipline.items[family].components inteiro.
  const groups = new Map<string, CeptComponent[]>();
  for (const c of components) {
    const key = [c.projectCode, c.disciplineCode, c.family].join('|');
    const list = groups.get(key) || [];
    list.push(c);
    groups.set(key, list);
  }

  for (const group of groups.values()) {
    const editables = group.filter((c) => resolveEditable(c) === true && c.dateIso);
    const noneditables = group.filter((c) => resolveEditable(c) === false && c.dateIso);
    if (!editables.length || !noneditables.length) continue;

    const latestEditableDate = editables.reduce((max, c) => (c.dateIso > max ? c.dateIso : max), editables[0].dateIso);

    for (const n of noneditables) {
      if (latestEditableDate > n.dateIso) {
        alerts.push({
          recordKey: n.recordKey,
          projectCode: n.projectCode,
          disciplineCode: n.disciplineCode,
          rule: 'EDITABLE_AFTER_NONEDITABLE',
          severity: 'red',
          fileDate: n.dateIso,
          counterpartDate: latestEditableDate,
          reasons: [`Versao editavel (${latestEditableDate}) e posterior ao entregavel nao-editavel (${n.dateIso})`],
        });
      } else if (diffDays(latestEditableDate, n.dateIso) > 7) {
        alerts.push({
          recordKey: n.recordKey,
          projectCode: n.projectCode,
          disciplineCode: n.disciplineCode,
          rule: 'NONEDITABLE_MORE_THAN_7_DAYS_AFTER_EDITABLE',
          severity: 'yellow',
          fileDate: n.dateIso,
          counterpartDate: latestEditableDate,
          reasons: [`Entregavel nao-editavel (${n.dateIso}) mais de 7 dias apos a versao editavel (${latestEditableDate})`],
        });
      }
    }
  }

  return alerts;
}

// Mesma derivacao do finalizeFamilyItem_ original: pending>0 -> pending; senao
// unknown>0 -> unknown; senao todos entregues -> delivered; senao -> na.
export function rollupFamilyStatus(components: CeptComponent[]): Omit<CeptFamilyRollup, 'family' | 'familyLabel' | 'components'> {
  let delivered = 0;
  let pending = 0;
  let unknown = 0;
  let na = 0;
  for (const c of components) {
    if (c.status === 'delivered') delivered++;
    else if (c.status === 'pending') pending++;
    else if (c.status === 'unknown') unknown++;
    else na++;
  }
  const applicable = components.length - na;
  const percent = applicable > 0 ? Math.round((delivered / applicable) * 100) : 0;

  let status: CeptStatus;
  if (pending > 0) status = 'pending';
  else if (unknown > 0) status = 'unknown';
  else if (applicable > 0 && delivered === applicable) status = 'delivered';
  else status = 'na';

  return { status, delivered, pending, unknown, applicable, percent };
}

export function buildCeptModel(
  components: CeptComponent[],
  validations: CeptValidacao[],
  responsaveis: Record<string, CeptResponsavel>
): CeptModel {
  const signatureByRecordKey = new Map<string, string>();
  for (const c of components) signatureByRecordKey.set(c.recordKey, buildSignature(c, components));

  const alerts: CeptAlertView[] = computeAlerts(components).map((alert) => {
    const signature = signatureByRecordKey.get(alert.recordKey) || '';
    const validationStatus = resolveValidationStatus(alert.recordKey, signature, validations);
    const displaySeverity = validationStatus === 'resolved' ? 'green' : alert.severity;
    return { ...alert, signature, validationStatus, displaySeverity };
  });

  const projectMap = new Map<string, Map<string, Map<string, CeptComponent[]>>>();
  for (const c of components) {
    const disciplineMap = projectMap.get(c.projectCode) || new Map();
    projectMap.set(c.projectCode, disciplineMap);
    const familyMap = disciplineMap.get(c.disciplineCode) || new Map();
    disciplineMap.set(c.disciplineCode, familyMap);
    const list = familyMap.get(c.family) || [];
    list.push(c);
    familyMap.set(c.family, list);
  }

  const orderedProjectCodes = [
    ...projectCodes.filter((code) => projectMap.has(code)),
    ...Array.from(projectMap.keys()).filter((code) => !projectCodes.includes(code as never)),
  ];

  const projects: CeptProjectRollup[] = orderedProjectCodes.map((projectCode) => {
    const disciplineMap = projectMap.get(projectCode)!;
    const disciplines: CeptDisciplineRollup[] = Array.from(disciplineMap.entries()).map(([disciplineCode, familyMap]) => {
      const families: CeptFamilyRollup[] = Array.from(familyMap.entries()).map(([family, familyComponents]) => ({
        family,
        familyLabel: familyComponents[0]?.familyLabel || family,
        components: familyComponents,
        ...rollupFamilyStatus(familyComponents),
      }));
      return {
        disciplineCode,
        responsavel: responsaveis[`${projectCode}|${disciplineCode}`],
        families,
      };
    });
    return { projectCode, projectName: projectNames[projectCode] || projectCode, disciplines };
  });

  return { projects, alerts };
}
