/**
 * CEPT Preenchimento -- dominio puro da futura substituicao das planilhas.
 *
 * Este modulo e o seam entre UI/adapters de persistencia e as regras
 * operacionais. Ele nao conhece Firebase, React nem o Apps Script. Escrita,
 * autorizacao e trilha persistida pertencem aos adapters que consumirao estes
 * tipos; aqui apenas descrevemos um payload append-only auditavel.
 */

import {
  disciplineAliases,
  restrictedDisciplines,
} from '../ceptCatalog';
import {
  computeAlerts,
  buildRecordKey,
  buildScopedRecordKey,
  rollupFamilyStatus,
  type CeptEditable,
  type CeptComponent,
  type CeptFamilyRollup,
} from '../ceptModel';

export type FieldPath = string;

export type CeptValidationErrorCode =
  | 'PROJECT_CODE_INVALID'
  | 'DISCIPLINE_REQUIRED'
  | 'DISCIPLINE_RESTRICTED_TO_PROJECT'
  | 'SOURCE_TYPE_REQUIRED'
  | 'DELIVERY_STATUS_REQUIRED'
  | 'DELIVERY_STATUS_NOT_ALLOWED_FOR_NA'
  | 'DATE_INVALID'
  | 'RATING_OUT_OF_RANGE'
  | 'THIRD_PARTY_REQUIRED'
  | 'THIRD_PARTY_NOT_ALLOWED'
  | 'MILESTONE_INVALID'
  | 'MEASUREMENT_ASSIGNMENT_REQUIRED'
  | 'MEASUREMENT_WEIGHT_IMMUTABLE';

export interface CeptValidationError {
  code: CeptValidationErrorCode;
  path: FieldPath;
  message: string;
  value?: unknown;
}

export interface NormalizationResult<T> {
  value: T;
  errors: CeptValidationError[];
  valid: boolean;
}

export function normalizeText(value: unknown): string {
  return String(value ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/** Preserva somente um codigo de tres digitos; entradas ambiguas sao invalidas. */
export function normalizeProjectCode(value: unknown): string {
  const text = String(value ?? '').trim();
  if (/^\d{1,3}$/.test(text)) return text.padStart(3, '0');
  return '';
}

/** ELE e apenas um alias historico; ELET e o valor que deve ser persistido. */
export function normalizeDisciplineCode(value: unknown): string {
  const code = normalizeText(value);
  return disciplineAliases[code] || code;
}

function disciplineErrors(projectCode: string, disciplineCode: string, path: FieldPath): CeptValidationError[] {
  if (!disciplineCode) {
    return [{ code: 'DISCIPLINE_REQUIRED', path, message: 'Informe a disciplina.' }];
  }
  const allowedProjects = restrictedDisciplines[disciplineCode];
  if (allowedProjects && !allowedProjects.includes(projectCode)) {
    return [{
      code: 'DISCIPLINE_RESTRICTED_TO_PROJECT',
      path,
      message: `${disciplineCode} so e aplicavel ao projeto ${allowedProjects.join(', ')}.`,
      value: disciplineCode,
    }];
  }
  return [];
}

export interface NormalizedDateInput {
  /** Texto canonico para exibir. DD/MM continua sem ano e, portanto, sem ISO. */
  display: string;
  /** So existe quando a entrada tinha ano completo e representa uma data real. */
  iso?: string;
}

function isValidDateParts(day: number, month: number, year: number): boolean {
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

/**
 * Normaliza datas aceitas na planilha sem inventar ano. DD/MM permanece apenas
 * texto de apresentacao, logo nao pode disparar alerta ou calculo de prazo.
 */
export function normalizeDateInput(value: unknown, path = 'date'): NormalizationResult<NormalizedDateInput> {
  const raw = String(value ?? '').trim();
  const empty = { display: '' };
  if (!raw) return { value: empty, errors: [], valid: true };

  const isoMatch = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (isoMatch) {
    const year = Number(isoMatch[1]);
    const month = Number(isoMatch[2]);
    const day = Number(isoMatch[3]);
    if (isValidDateParts(day, month, year)) {
      const iso = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      return { value: { display: `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`, iso }, errors: [], valid: true };
    }
  }

  const ptMatch = raw.match(/^(\d{1,2})[\/.\-](\d{1,2})(?:[\/.\-](\d{4}))?$/);
  if (ptMatch) {
    const day = Number(ptMatch[1]);
    const month = Number(ptMatch[2]);
    const yearText = ptMatch[3];
    if (!yearText && day >= 1 && day <= 31 && month >= 1 && month <= 12) {
      return { value: { display: `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}` }, errors: [], valid: true };
    }
    const year = Number(yearText);
    if (yearText && isValidDateParts(day, month, year)) {
      const iso = `${yearText}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      return { value: { display: `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${yearText}`, iso }, errors: [], valid: true };
    }
  }

  return {
    value: empty,
    errors: [{ code: 'DATE_INVALID', path, message: 'Data invalida. Use DD/MM, DD/MM/AAAA ou AAAA-MM-DD.', value: raw }],
    valid: false,
  };
}

// ---------------------------------------------------------------------------
// Entregaveis: o registro editavel e sempre o componente contratual, nunca a
// familia agregada. Familia, natureza, percentual e alertas sao somente leitura.
// ---------------------------------------------------------------------------

export type DeliveryApplicability = 'applicable' | 'na';
export type DeliveryEntryStatus = 'delivered' | 'pending';

export interface DeliveryComponentInput {
  /** Escopo de OS; opcional apenas para importar registros CEPT históricos. */
  osCode?: string;
  osName?: string;
  projectCode: string;
  disciplineCode: string;
  /** Identidade contratual do componente, por exemplo "MC (PDF)". */
  sourceType: string;
  applicability: DeliveryApplicability;
  status?: DeliveryEntryStatus;
  date: string;
}

export interface NormalizedDeliveryComponentInput extends Omit<DeliveryComponentInput, 'date' | 'projectCode' | 'disciplineCode' | 'sourceType' | 'osCode' | 'osName'> {
  osCode?: string;
  osName?: string;
  projectCode: string;
  disciplineCode: string;
  sourceType: string;
  date: NormalizedDateInput;
}

export interface DeliveryReadOnlyDerivation {
  family: CeptFamilyRollup;
  alerts: ReturnType<typeof computeAlerts>;
}

export interface DeliveryClassification {
  family: string;
  familyLabel: string;
  format: string;
  editable: CeptEditable;
}

/** Same conservative classification used by the XLS/App Script import. */
export function classifyDelivery(sourceLabel: unknown, sourceType: unknown): DeliveryClassification {
  const label = String(sourceLabel ?? '').trim();
  const type = String(sourceType ?? '').trim();
  const normalized = normalizeText(type);
  const labelNormalized = normalizeText(label);
  let family = normalized.replace(/\s*\(.*$/, '').trim();
  let familyLabel = label.replace(/\s*\(\s*EDIT[ÁA]VEL\s*\)\s*/i, '').trim();
  if (normalized === 'RVT') [family, familyLabel] = ['RVT', 'Modelo BIM'];
  else if (normalized === 'PDF' && labelNormalized.includes('PRANCHA')) [family, familyLabel] = ['PDF', 'Prancha'];
  else if (normalized === 'IFC') [family, familyLabel] = ['IFC', 'Modelo OpenBIM'];
  else if (/^MC\b/.test(normalized)) [family, familyLabel] = ['MC', 'Memorial de Cálculo'];
  else if (/^MD\b/.test(normalized)) [family, familyLabel] = ['MD', 'Memorial Descritivo'];
  else if (/^ET\s*\/\s*RT\b/.test(normalized)) [family, familyLabel] = ['ET/RT', 'Espec. / Relatório Técnico'];
  else if (/^MA\b/.test(normalized)) [family, familyLabel] = ['MA', 'Memorial de Análise'];
  const format = (type.match(/\(([^)]+)\)\s*$/)?.[1] || type).trim().toUpperCase();
  const editable = !format ? null : ['PDF', 'IFC'].includes(normalizeText(format)) ? false : true;
  return { family: family || type, familyLabel: familyLabel || family || type, format, editable };
}

export function normalizeDeliveryComponent(input: DeliveryComponentInput): NormalizationResult<NormalizedDeliveryComponentInput> {
  const projectCode = normalizeProjectCode(input.projectCode);
  const osCode = String(input.osCode ?? '').trim().replace(/\s+/g, ' ') || undefined;
  const osName = String(input.osName ?? '').trim().replace(/\s+/g, ' ') || undefined;
  const disciplineCode = normalizeDisciplineCode(input.disciplineCode);
  const sourceType = String(input.sourceType ?? '').trim().replace(/\s+/g, ' ');
  const date = normalizeDateInput(input.date, 'date');
  const errors: CeptValidationError[] = [...date.errors];

  if (!projectCode) errors.push({ code: 'PROJECT_CODE_INVALID', path: 'projectCode', message: 'Projeto deve ter codigo de 001 a 999.', value: input.projectCode });
  errors.push(...disciplineErrors(projectCode, disciplineCode, 'disciplineCode'));
  if (!sourceType) errors.push({ code: 'SOURCE_TYPE_REQUIRED', path: 'sourceType', message: 'Informe o componente contratual/sourceType.' });

  if (input.applicability === 'applicable' && !input.status) {
    errors.push({ code: 'DELIVERY_STATUS_REQUIRED', path: 'status', message: 'Entregavel aplicavel precisa estar entregue ou pendente.' });
  }
  if (input.applicability === 'na' && input.status !== undefined) {
    errors.push({ code: 'DELIVERY_STATUS_NOT_ALLOWED_FOR_NA', path: 'status', message: 'Entregavel N/A nao possui status de entrega.' });
  }

  const value: NormalizedDeliveryComponentInput = {
    osCode,
    osName,
    projectCode,
    disciplineCode,
    sourceType,
    applicability: input.applicability,
    status: input.applicability === 'na' ? undefined : input.status,
    date: date.value,
  };
  return { value, errors, valid: errors.length === 0 };
}

/** Converte somente um preenchimento válido no documento que a coleção consome. */
export function toCeptDeliveryComponent(input: NormalizedDeliveryComponentInput, actor?: { email?: string; nome?: string }): CeptComponent {
  if (!input.projectCode || !input.disciplineCode || !input.sourceType || (input.applicability === 'applicable' && !input.status)) {
    throw new Error('Preenchimento de entregável inválido para persistência.');
  }
  const classification = classifyDelivery(input.sourceType, input.sourceType);
  const recordKey = input.osCode
    ? buildScopedRecordKey(input.osCode, input.projectCode, input.disciplineCode, classification.family, input.sourceType)
    : buildRecordKey(input.projectCode, input.disciplineCode, classification.family, input.sourceType);
  return {
    recordKey,
    ...(input.osCode ? { osCode: input.osCode, osName: input.osName } : {}),
    projectCode: input.projectCode,
    disciplineCode: input.disciplineCode,
    family: classification.family,
    familyLabel: classification.familyLabel,
    sourceLabel: input.sourceType,
    sourceType: input.sourceType,
    format: classification.format,
    editable: classification.editable,
    status: input.applicability === 'na' ? 'na' : input.status!,
    dateIso: input.date.iso || '',
    ...(actor?.email ? { updatedByEmail: actor.email } : {}),
    ...(actor?.nome ? { updatedByNome: actor.nome } : {}),
  };
}

/** Derivacao para UI: nenhuma alteracao de input pode escrever familia/alerta/% diretamente. */
export function deriveDeliveryReadOnly(componentsInFamily: CeptComponent[], cutoffIso?: string): DeliveryReadOnlyDerivation {
  const first = componentsInFamily[0];
  const rollup = rollupFamilyStatus(componentsInFamily);
  return {
    family: {
      family: first?.family || '',
      familyLabel: first?.familyLabel || '',
      components: componentsInFamily,
      ...rollup,
    },
    alerts: computeAlerts(componentsInFamily, cutoffIso),
  };
}

// ---------------------------------------------------------------------------
// Responsabilidade e LOD da Planilha1. A lista de marcos e imutavel, mas a
// configuracao pode excluir marcos de uma linha (casos historicos 101/102) sem
// codificar numero de linha ou regra escondida aqui.
// ---------------------------------------------------------------------------

export const LOD_MILESTONES = ['100', '200', '300', '350', '400', 'final'] as const;
export type LodMilestone = (typeof LOD_MILESTONES)[number];
export type ResponsibilityMode = 'Quanta' | 'Terceirizado' | 'Indefinido';

export interface ResponsibilityLodInput {
  osCode?: string;
  osName?: string;
  projectCode: string;
  /** TODAS e o unico valor que representa abrangencia geral. */
  disciplineCode: string;
  performanceRating: number;
  mode: ResponsibilityMode;
  thirdParty?: string;
  closed: boolean;
  bimCompatibility: boolean | null;
  milestones: Partial<Record<LodMilestone, string>>;
}

export interface NormalizedResponsibilityLodInput extends Omit<ResponsibilityLodInput, 'projectCode' | 'disciplineCode' | 'thirdParty' | 'milestones' | 'osCode' | 'osName'> {
  osCode?: string;
  osName?: string;
  projectCode: string;
  disciplineCode: string;
  thirdParty?: string;
  milestones: Partial<Record<LodMilestone, NormalizedDateInput>>;
}

export interface LodWorkdaySegment {
  from: LodMilestone;
  to: LodMilestone;
  businessDays: number;
}

export interface LodWorkdayDerivation {
  includedMilestones: LodMilestone[];
  excludedMilestones: LodMilestone[];
  segments: LodWorkdaySegment[];
  /** Soma de intervalos entre marcos com datas ISO completas. */
  totalBusinessDays: number;
}

export interface LodWorkdayOptions {
  /** Configuracao por registro; evita dependencias em numeros de linha XLS. */
  excludedMilestones?: readonly LodMilestone[];
}

export function normalizeResponsibilityLod(input: ResponsibilityLodInput): NormalizationResult<NormalizedResponsibilityLodInput> {
  const projectCode = normalizeProjectCode(input.projectCode);
  const osCode = String(input.osCode ?? '').trim().replace(/\s+/g, ' ') || undefined;
  const osName = String(input.osName ?? '').trim().replace(/\s+/g, ' ') || undefined;
  const rawDiscipline = normalizeText(input.disciplineCode);
  const disciplineCode = rawDiscipline === 'TODAS' ? 'TODAS' : normalizeDisciplineCode(rawDiscipline);
  const thirdParty = String(input.thirdParty ?? '').trim().replace(/\s+/g, ' ') || undefined;
  const errors: CeptValidationError[] = [];

  if (!projectCode) errors.push({ code: 'PROJECT_CODE_INVALID', path: 'projectCode', message: 'Projeto deve ter codigo de 001 a 999.', value: input.projectCode });
  if (disciplineCode !== 'TODAS') errors.push(...disciplineErrors(projectCode, disciplineCode, 'disciplineCode'));
  if (!Number.isInteger(input.performanceRating) || input.performanceRating < 1 || input.performanceRating > 6) {
    errors.push({ code: 'RATING_OUT_OF_RANGE', path: 'performanceRating', message: 'Nota de desempenho deve ser um inteiro de 1 a 6.', value: input.performanceRating });
  }
  if (input.mode === 'Terceirizado' && !thirdParty) {
    errors.push({ code: 'THIRD_PARTY_REQUIRED', path: 'thirdParty', message: 'Informe o terceirizado para este modo.' });
  }
  if (input.mode !== 'Terceirizado' && thirdParty) {
    errors.push({ code: 'THIRD_PARTY_NOT_ALLOWED', path: 'thirdParty', message: 'Terceirizado so pode ser informado no modo Terceirizado.' });
  }

  const milestones: Partial<Record<LodMilestone, NormalizedDateInput>> = {};
  for (const milestone of LOD_MILESTONES) {
    const normalized = normalizeDateInput(input.milestones[milestone], `milestones.${milestone}`);
    if (normalized.value.display) milestones[milestone] = normalized.value;
    errors.push(...normalized.errors.map((error) => ({ ...error, code: 'MILESTONE_INVALID' as const })));
  }

  return {
    value: {
      osCode,
      osName,
      projectCode,
      disciplineCode,
      performanceRating: input.performanceRating,
      mode: input.mode,
      thirdParty: input.mode === 'Terceirizado' ? thirdParty : undefined,
      closed: Boolean(input.closed),
      bimCompatibility: input.bimCompatibility,
      milestones,
    },
    errors,
    valid: errors.length === 0,
  };
}

function dateFromIso(iso: string): Date {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

/** Dias uteis decorridos: inicio nao conta; fim conta quando for dia util. */
export function businessDaysBetween(startIso: string, endIso: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startIso) || !/^\d{4}-\d{2}-\d{2}$/.test(endIso)) return 0;
  const start = dateFromIso(startIso);
  const end = dateFromIso(endIso);
  if (end <= start) return 0;
  let count = 0;
  const cursor = new Date(start);
  cursor.setUTCDate(cursor.getUTCDate() + 1);
  while (cursor <= end) {
    const day = cursor.getUTCDay();
    if (day !== 0 && day !== 6) count++;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return count;
}

export function deriveLodWorkdays(
  milestones: Partial<Record<LodMilestone, NormalizedDateInput>>,
  options: LodWorkdayOptions = {},
): LodWorkdayDerivation {
  const excluded = new Set(options.excludedMilestones || []);
  const includedMilestones = LOD_MILESTONES.filter((milestone) => !excluded.has(milestone));
  const dated = includedMilestones
    .map((milestone) => ({ milestone, iso: milestones[milestone]?.iso }))
    .filter((item): item is { milestone: LodMilestone; iso: string } => Boolean(item.iso));
  const segments: LodWorkdaySegment[] = [];
  for (let index = 1; index < dated.length; index++) {
    const previous = dated[index - 1];
    const current = dated[index];
    segments.push({ from: previous.milestone, to: current.milestone, businessDays: businessDaysBetween(previous.iso, current.iso) });
  }
  return {
    includedMilestones,
    excludedMilestones: LOD_MILESTONES.filter((milestone) => excluded.has(milestone)),
    segments,
    totalBusinessDays: segments.reduce((total, segment) => total + segment.businessDays, 0),
  };
}

// ---------------------------------------------------------------------------
// Medicoes: aprovacoes tecnica e contratual sao independentes de entrega.
// ---------------------------------------------------------------------------

export const MEASUREMENT_MILESTONE_WEIGHTS = [10, 20, 20, 20, 20, 10] as const;
export type MeasurementMilestone = 1 | 2 | 3 | 4 | 5 | 6;
export const MEASUREMENT_MILESTONES: readonly MeasurementMilestone[] = [1, 2, 3, 4, 5, 6];

export interface MeasurementMilestoneApproval {
  /** Campo explicito para detectar tentativa de alterar a ponderacao fixa. */
  weight?: number;
  technicalApproved: boolean;
  contractualApproved: boolean;
}

export interface MeasurementInput {
  osCode?: string;
  osName?: string;
  projectCode: string;
  disciplineCode: string;
  supplier: string;
  internalResponsible: string;
  milestones: Partial<Record<MeasurementMilestone, MeasurementMilestoneApproval>>;
}

export interface MeasurementDerivation {
  technicalEarnedPercent: number;
  contractualEarnedPercent: number;
  /** Parcela efetivamente aprovada pelas duas instancias, sem alterar entrega. */
  earnedPercent: number;
  pendingTechnicalPercent: number;
  pendingContractualPercent: number;
}

export function validateMeasurement(input: MeasurementInput): CeptValidationError[] {
  const errors: CeptValidationError[] = [];
  const projectCode = normalizeProjectCode(input.projectCode);
  const disciplineCode = normalizeDisciplineCode(input.disciplineCode);
  if (!projectCode) errors.push({ code: 'PROJECT_CODE_INVALID', path: 'projectCode', message: 'Projeto deve ter codigo de 001 a 999.' });
  errors.push(...disciplineErrors(projectCode, disciplineCode, 'disciplineCode'));
  if (!String(input.supplier ?? '').trim()) errors.push({ code: 'MEASUREMENT_ASSIGNMENT_REQUIRED', path: 'supplier', message: 'Informe o fornecedor/terceiro.' });
  if (!String(input.internalResponsible ?? '').trim()) errors.push({ code: 'MEASUREMENT_ASSIGNMENT_REQUIRED', path: 'internalResponsible', message: 'Informe o responsavel interno.' });
  for (const milestone of MEASUREMENT_MILESTONES) {
    const informedWeight = input.milestones[milestone]?.weight;
    const expected = MEASUREMENT_MILESTONE_WEIGHTS[milestone - 1];
    if (informedWeight !== undefined && informedWeight !== expected) {
      errors.push({ code: 'MEASUREMENT_WEIGHT_IMMUTABLE', path: `milestones.${milestone}.weight`, message: `Marco ${milestone} possui peso imutavel de ${expected}%.`, value: informedWeight });
    }
  }
  return errors;
}

export function deriveMeasurement(input: MeasurementInput): MeasurementDerivation {
  let technicalEarnedPercent = 0;
  let contractualEarnedPercent = 0;
  let earnedPercent = 0;
  for (const milestone of MEASUREMENT_MILESTONES) {
    const approval = input.milestones[milestone];
    const weight = MEASUREMENT_MILESTONE_WEIGHTS[milestone - 1];
    if (approval?.technicalApproved) technicalEarnedPercent += weight;
    if (approval?.contractualApproved) contractualEarnedPercent += weight;
    if (approval?.technicalApproved && approval?.contractualApproved) earnedPercent += weight;
  }
  return {
    technicalEarnedPercent,
    contractualEarnedPercent,
    earnedPercent,
    pendingTechnicalPercent: 100 - technicalEarnedPercent,
    pendingContractualPercent: 100 - contractualEarnedPercent,
  };
}

// ---------------------------------------------------------------------------
// Contrato append-only para o adapter futuro. `before`/`after` sao snapshots
// imutaveis do dominio; o writer deve apenas acrescentar o evento, nunca muta-lo.
// ---------------------------------------------------------------------------

export type CeptChangeSource = 'site' | 'apps-script-import' | 'migration' | 'admin-correction';

export interface CeptAuditActor {
  uid: string;
  email: string;
  displayName?: string;
}

export interface AppendOnlyChangePayload<T> {
  entity: 'delivery-component' | 'responsibility-lod' | 'measurement';
  entityKey: string;
  before: Readonly<T> | null;
  after: Readonly<T>;
  actor: CeptAuditActor;
  occurredAt: string;
  source: CeptChangeSource;
  correlationId?: string;
}

export type DeliveryComponentChange = AppendOnlyChangePayload<NormalizedDeliveryComponentInput>;
export type ResponsibilityLodChange = AppendOnlyChangePayload<NormalizedResponsibilityLodInput>;
export type MeasurementChange = AppendOnlyChangePayload<MeasurementInput>;
