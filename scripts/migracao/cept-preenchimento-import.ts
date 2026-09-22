/**
 * Importacao inicial CEPT a partir de exportacoes XLSX.
 *
 * Leitura somente: este arquivo nunca importa Firebase, nao chama HTTP e nao
 * altera os XLSX. A saida e um pacote de reconciliacao para revisao humana,
 * nunca uma carga de banco. Por seguranca, --out dentro do repositorio e
 * recusado sem --allow-repo-output.
 *
 * Uso:
 *   npx tsx scripts/migracao/cept-preenchimento-import.ts \
 *     <entregaveis.xlsx> <cept.xlsx> <validacoes.xlsx> --out C:\\temp\\cept-reconciliacao
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';
import { projectCodes } from '../../src/lib/ceptCatalog';
import {
  MEASUREMENT_MILESTONE_WEIGHTS,
  normalizeDateInput,
  normalizeDisciplineCode,
  normalizeProjectCode,
  normalizeText,
} from '../../src/lib/ceptPreenchimento';
import { classifyDeliverable } from './cept-import';

export type ImportStatus = 'delivered' | 'pending' | 'na' | 'unknown';

export interface SourceProvenance {
  workbook: string;
  sheet: string;
  row: number;
  cells: Record<string, string>;
}

export interface DeliveryComponentImport {
  projectCode: string;
  disciplineCode: string;
  sourceLabel: string;
  sourceType: string;
  family: string;
  format: string;
  editable: boolean | null;
  status: ImportStatus;
  /** Texto tal como a planilha apresenta; DD/MM continua sem ano. */
  dateDisplay: string;
  /** So existe se o XLSX tinha ano completo e uma data valida. */
  dateIso: string;
  provenance: SourceProvenance;
  uncertainty?: string[];
}

export interface ResponsibilityLodImport {
  projectCode: string;
  disciplineCode: string;
  performanceRating: string;
  mode: string;
  thirdParty: string;
  closed: string;
  bimCompatibility: string;
  milestones: Record<string, { display: string; iso: string }>;
  /** Configuracao manual futura; nunca deduzida de numero de linha. */
  excludedMilestones: string[];
  provenance: SourceProvenance;
}

export interface MeasurementImport {
  projectCode: string;
  disciplineCode: string;
  supplier: string;
  internalResponsible: string;
  milestones: Array<{ milestone: number; weight: number; technicalApproved: string; contractualApproved: string }>;
  provenance: SourceProvenance;
}

export interface ValidationLedgerImport {
  timestamp: string;
  user: string;
  action: string;
  projectCode: string;
  discipline: string;
  family: string;
  component: string;
  format: string;
  nature: string;
  signature: string;
  severity: string;
  reasons: string;
  fileDate: string;
  counterpartDate: string;
  observation: string;
  /** Deliberadamente cru: nao e uma versao confiavel do app. */
  versionRaw: string;
  batchId: string;
  provenance: SourceProvenance;
}

export interface ReconciliationAudit {
  generatedAt: string;
  sourceFiles: string[];
  selectedSheets: Record<string, string>;
  rowCounts: Record<string, number>;
  unknownOrAmbiguous: Array<{ domain: string; message: string; provenance?: SourceProvenance }>;
  merges: Array<{ workbook: string; sheet: string; range: string; note: string }>;
  unheadedColumnsPtoQ: Array<{ workbook: string; sheet: string; populatedRows: number; headers: string[] }>;
  manualGoogleSheetConfirmation: string[];
}

type Cell = { value: string; raw: string; ref: string; style: number; exists: boolean };
type Sheet = { name: string; rows: Map<number, Map<number, Cell>>; merges: string[]; maxColumn: number };
type Workbook = { file: string; sheets: Sheet[] };

const EMPTY_CELL = (ref = ''): Cell => ({ value: '', raw: '', ref, style: -1, exists: false });
const VALIDATION_FIELDS = [
  'timestamp', 'user', 'action', 'projectCode', 'discipline', 'family', 'component', 'format', 'nature',
  'signature', 'severity', 'reasons', 'fileDate', 'counterpartDate', 'observation', 'versionRaw', 'batchId',
] as const;

function decodeXml(value: string): string {
  return String(value || '')
    .replace(/&#(x[0-9a-fA-F]+|\d+);/g, (_, n) => String.fromCodePoint(String(n).startsWith('x') ? parseInt(String(n).slice(1), 16) : Number(n)))
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

function columnIndex(ref: string): number {
  const letters = String(ref).replace(/\d/g, '');
  return letters.split('').reduce((value, ch) => value * 26 + ch.charCodeAt(0) - 64, 0) - 1;
}

function columnName(index: number): string {
  let out = '';
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) out = String.fromCharCode(65 + (n - 1) % 26) + out;
  return out;
}

function cell(sheet: Sheet, row: number, col: number): Cell {
  return sheet.rows.get(row)?.get(col) || EMPTY_CELL(`${columnName(col)}${row}`);
}

function nonEmptyRows(sheet: Sheet): number[] {
  return [...sheet.rows.keys()].filter((row) => [...(sheet.rows.get(row)?.values() || [])].some((c) => c.value.trim()));
}

function text(cellValue: Cell): string { return cellValue.value.trim(); }

function excelSerialToDate(serial: number): { day: number; month: number; year: number } | null {
  if (!Number.isFinite(serial)) return null;
  const milliseconds = Date.UTC(1899, 11, 30) + Math.floor(serial) * 86400000;
  const date = new Date(milliseconds);
  if (Number.isNaN(date.getTime())) return null;
  return { day: date.getUTCDate(), month: date.getUTCMonth() + 1, year: date.getUTCFullYear() };
}

function isDateFormat(format: string): boolean {
  const clean = String(format || '').replace(/"[^"]*"/g, '').replace(/\[[^\]]*\]/g, '').toLowerCase();
  return /[dmy]/.test(clean) && !/^general$/i.test(clean);
}

function formatHasYear(format: string): boolean {
  return /y/i.test(String(format || '').replace(/"[^"]*"/g, ''));
}

async function readStyles(zip: JSZip): Promise<string[]> {
  const styles = zip.file('xl/styles.xml');
  if (!styles) return [];
  const xml = await styles.async('text');
  const custom = new Map<number, string>();
  for (const match of xml.matchAll(/<numFmt\b[^>]*numFmtId="(\d+)"[^>]*formatCode="([^"]*)"[^>] *\/?>(?:<\/numFmt>)?/g)) custom.set(Number(match[1]), decodeXml(match[2]));
  const builtIn: Record<number, string> = { 14: 'm/d/yy', 15: 'd-mmm-yy', 16: 'd-mmm', 17: 'mmm-yy', 18: 'h:mm AM/PM', 19: 'h:mm:ss AM/PM', 20: 'h:mm', 21: 'h:mm:ss', 22: 'm/d/yy h:mm' };
  const xfs = xml.match(/<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/)?.[1] || '';
  return Array.from(xfs.matchAll(/<xf\b([^>]*)\/?>(?:<\/xf>)?/g), (match) => {
    const id = Number(match[1].match(/numFmtId="(\d+)"/)?.[1] || 0);
    return custom.get(id) || builtIn[id] || '';
  });
}

async function readSharedStrings(zip: JSZip): Promise<string[]> {
  const file = zip.file('xl/sharedStrings.xml');
  if (!file) return [];
  const xml = await file.async('text');
  return Array.from(xml.matchAll(/<si\b[\s\S]*?<\/si>/g), (match) =>
    Array.from(match[0].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g), (part) => decodeXml(part[1])).join(''));
}

function renderedCellValue(raw: string, type: string, style: number, styles: string[], shared: string[], inlineText: string): string {
  if (type === 's') return shared[Number(raw)] || '';
  if (type === 'inlineStr') return inlineText;
  if (type === 'b') return raw === '1' ? 'TRUE' : raw === '0' ? 'FALSE' : raw;
  const format = styles[style] || '';
  if (raw && isDateFormat(format) && /^-?\d+(?:\.\d+)?$/.test(raw)) {
    const date = excelSerialToDate(Number(raw));
    if (date) {
      const ddmm = `${String(date.day).padStart(2, '0')}/${String(date.month).padStart(2, '0')}`;
      return formatHasYear(format) ? `${ddmm}/${date.year}` : ddmm;
    }
  }
  return decodeXml(raw);
}

async function readWorkbook(file: string): Promise<Workbook> {
  const buffer = await fs.readFile(file);
  const zip = await JSZip.loadAsync(buffer);
  const [shared, styles, workbookXml, relsXml] = await Promise.all([
    readSharedStrings(zip), readStyles(zip), zip.file('xl/workbook.xml')?.async('text'), zip.file('xl/_rels/workbook.xml.rels')?.async('text'),
  ]);
  if (!workbookXml || !relsXml) throw new Error(`${file}: XLSX sem workbook.xml ou relacionamentos.`);
  const relTargets = new Map<string, string>();
  for (const rel of relsXml.matchAll(/<Relationship\b([^>]*)\/?>(?:<\/Relationship>)?/g)) {
    const id = rel[1].match(/Id="([^"]+)"/)?.[1];
    const target = rel[1].match(/Target="([^"]+)"/)?.[1];
    if (id && target) relTargets.set(id, `xl/${target.replace(/^\//, '').replace(/^xl\//, '')}`);
  }
  const sheets: Sheet[] = [];
  for (const sheetMatch of workbookXml.matchAll(/<sheet\b([^>]*)\/?>(?:<\/sheet>)?/g)) {
    const attrs = sheetMatch[1];
    const name = decodeXml(attrs.match(/name="([^"]+)"/)?.[1] || '');
    const relId = attrs.match(/r:id="([^"]+)"/)?.[1];
    const target = relId ? relTargets.get(relId) : undefined;
    if (!name || !target) continue;
    const fileInZip = zip.file(target);
    if (!fileInZip) continue;
    const xml = await fileInZip.async('text');
    const rows = new Map<number, Map<number, Cell>>();
    let maxColumn = 0;
    for (const rowMatch of xml.matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>/g)) {
      const rowNumber = Number(rowMatch[1].match(/r="(\d+)"/)?.[1] || 0);
      if (!rowNumber) continue;
      const row = new Map<number, Cell>();
      for (const cellMatch of rowMatch[2].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const attrsCell = cellMatch[1];
        const body = cellMatch[2] || '';
        const ref = attrsCell.match(/r="([A-Z]+\d+)"/)?.[1] || '';
        if (!ref) continue;
        const col = columnIndex(ref);
        const type = attrsCell.match(/t="([^"]+)"/)?.[1] || '';
        const style = Number(attrsCell.match(/s="(\d+)"/)?.[1] || 0);
        const raw = body.match(/<v\b[^>]*>([\s\S]*?)<\/v>/)?.[1] || '';
        const inlineText = Array.from(body.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g), (m) => decodeXml(m[1])).join('');
        row.set(col, { value: renderedCellValue(raw, type, style, styles, shared, inlineText), raw: decodeXml(raw), ref, style, exists: true });
        maxColumn = Math.max(maxColumn, col);
      }
      rows.set(rowNumber, row);
    }
    sheets.push({ name, rows, maxColumn, merges: Array.from(xml.matchAll(/<mergeCell\b[^>]*ref="([^"]+)"[^>]*\/>/g), (m) => m[1]) });
  }
  return { file, sheets };
}

function normHeader(value: string): string { return normalizeText(value).replace(/[^A-Z0-9]+/g, ' ').trim(); }
function headers(sheet: Sheet): { row: number; values: string[] } {
  const candidates = nonEmptyRows(sheet).slice(0, 12);
  let best = { row: candidates[0] || 1, values: [] as string[], score: -1 };
  for (const row of candidates) {
    const values = Array.from({ length: sheet.maxColumn + 1 }, (_, col) => text(cell(sheet, row, col)));
    const score = values.filter(Boolean).length;
    if (score > best.score) best = { row, values, score };
  }
  return { row: best.row, values: best.values };
}
function columnFor(header: string[], patterns: RegExp[], fallback: number): number {
  const index = header.findIndex((value) => patterns.some((pattern) => pattern.test(normHeader(value))));
  return index >= 0 ? index : fallback;
}
function sheetBy(workbook: Workbook, predicate: (sheet: Sheet) => boolean, hint: string): Sheet {
  const found = workbook.sheets.find(predicate);
  if (!found) throw new Error(`${path.basename(workbook.file)}: nao encontrei a aba ${hint}. Abas: ${workbook.sheets.map((s) => s.name).join(', ')}`);
  return found;
}
function isMergedCell(sheet: Sheet, row: number, col: number): boolean {
  const ref = `${columnName(col)}${row}`;
  return sheet.merges.some((range) => {
    const [from, to = from] = range.split(':');
    const fromCol = columnIndex(from); const toCol = columnIndex(to);
    const fromRow = Number(from.replace(/\D/g, '')); const toRow = Number(to.replace(/\D/g, ''));
    return col >= fromCol && col <= toCol && row >= fromRow && row <= toRow && range !== ref;
  });
}

export function resolveDeliveryStatus(value: string, merged: boolean): { status: ImportStatus; uncertainty?: string } {
  const normalized = normalizeText(value);
  if (['TRUE', 'VERDADEIRO', 'SIM', 'V', '1'].includes(normalized)) return { status: 'delivered' };
  if (['FALSE', 'FALSO', 'NAO', '0'].includes(normalized)) return { status: 'pending' };
  if (['-', 'N A', 'NA'].includes(normalized)) return { status: 'na' };
  if (!normalized && merged) return { status: 'na' };
  if (!normalized) return { status: 'unknown', uncertainty: 'XLSX não carrega validação de checkbox; vazio pode ser checkbox sem valor ou N/A estrutural.' };
  return { status: 'unknown', uncertainty: `valor de status não reconhecido: "${value}"` };
}

function normalizeImportedDate(value: string): { display: string; iso: string; uncertainty?: string } {
  const normalized = normalizeDateInput(value, 'source-date');
  if (normalized.valid) return { display: normalized.value.display, iso: normalized.value.iso || '' };
  return { display: String(value || '').trim(), iso: '', uncertainty: `data não pôde ser normalizada: "${value}"` };
}

function parseDeliveries(workbook: Workbook, audit: ReconciliationAudit): DeliveryComponentImport[] {
  const sheet = sheetBy(workbook, (candidate) => {
    const head = headers(candidate).values;
    return head.some((value) => /^\s*\d{3}\s*[-–—]/.test(value)) && head.some((value) => normHeader(value).includes('DATA ENTREGA'));
  }, 'principal de entregaveis');
  audit.selectedSheets.deliveries = sheet.name;
  for (const range of sheet.merges) audit.merges.push({ workbook: path.basename(workbook.file), sheet: sheet.name, range, note: 'Mesclagem preservada; XLSX nao informa se uma celula vazia nao mesclada possuia checkbox.' });
  const { row: headerRow, values: header } = headers(sheet);
  const pairs: Array<{ projectCode: string; statusCol: number; dateCol: number }> = [];
  for (let col = 3; col < header.length - 1; col++) {
    const match = header[col].match(/^\s*(\d{3})\s*[-–—]/);
    if (match && normHeader(header[col + 1]).includes('DATA ENTREGA')) { pairs.push({ projectCode: match[1], statusCol: col, dateCol: col + 1 }); col++; }
  }
  if (!pairs.length) throw new Error(`${sheet.name}: nenhum par projeto + DATA ENTREGA encontrado.`);
  const out: DeliveryComponentImport[] = [];
  let currentDiscipline = '';
  for (const row of nonEmptyRows(sheet).filter((row) => row > headerRow)) {
    const disciplineCell = text(cell(sheet, row, 0));
    if (disciplineCell) currentDiscipline = normalizeDisciplineCode(disciplineCell);
    const sourceLabel = text(cell(sheet, row, 1));
    const sourceType = text(cell(sheet, row, 2));
    if (!sourceType) continue;
    if (!currentDiscipline) {
      audit.unknownOrAmbiguous.push({ domain: 'delivery', message: 'Linha de entregavel sem disciplina corrente; ignorada.', provenance: provenance(workbook, sheet, row, [0, 1, 2]) });
      continue;
    }
    const classification = classifyDeliverable(sourceLabel, sourceType);
    for (const pair of pairs) {
      const statusCell = cell(sheet, row, pair.statusCol);
      const statusResult = resolveDeliveryStatus(statusCell.value, isMergedCell(sheet, row, pair.statusCol));
      const date = normalizeImportedDate(text(cell(sheet, row, pair.dateCol)));
      const uncertainty = [statusResult.uncertainty, date.uncertainty].filter((value): value is string => Boolean(value));
      const item: DeliveryComponentImport = {
        projectCode: pair.projectCode, disciplineCode: currentDiscipline, sourceLabel, sourceType,
        family: classification.family, format: classification.format, editable: classification.editable,
        status: statusResult.status, dateDisplay: date.display, dateIso: date.iso,
        provenance: provenance(workbook, sheet, row, [0, 1, 2, pair.statusCol, pair.dateCol]),
        ...(uncertainty.length ? { uncertainty } : {}),
      };
      out.push(item);
      for (const message of uncertainty) audit.unknownOrAmbiguous.push({ domain: 'delivery', message, provenance: item.provenance });
    }
  }
  return out;
}

function provenance(workbook: Workbook, sheet: Sheet, row: number, columns: number[]): SourceProvenance {
  return { workbook: path.basename(workbook.file), sheet: sheet.name, row, cells: Object.fromEntries(columns.map((col) => [columnName(col), cell(sheet, row, col).value])) };
}

function parseResponsibilities(workbook: Workbook, audit: ReconciliationAudit): ResponsibilityLodImport[] {
  const sheet = sheetBy(workbook, (candidate) => /planilha\s*1/i.test(candidate.name) || headers(candidate).values.some((value) => normHeader(value).includes('DISCIPLINAS')), 'de responsabilidades/LOD');
  audit.selectedSheets.responsibilities = sheet.name;
  const { row: headerRow, values: header } = headers(sheet);
  const id = columnFor(header, [/^ID$/], 0);
  const discipline = columnFor(header, [/DISCIPLIN/], 2);
  const rating = columnFor(header, [/NOTA.*DESEMPENHO/, /^NOTA$/], 3);
  const mode = columnFor(header, [/INTERNO.*TERCEIR/, /^MODO$/], 4);
  const closed = columnFor(header, [/FECHAD/], 5);
  const thirdParty = columnFor(header, [/TERCEIRIZAD/], 6);
  const bim = columnFor(header, [/COMPATIBILIZ.*BIM/, /^BIM$/], 7);
  // Na fonte CEPT, as colunas 100..400 sao percentuais de cronograma (somam a coluna Total),
  // nao datas de LOD. Nunca transforma percentual em data ficticia no banco.
  const out: ResponsibilityLodImport[] = [];
  let currentProject = '';
  for (const row of nonEmptyRows(sheet).filter((value) => value > headerRow)) {
    const idValue = text(cell(sheet, row, id));
    // Exportações XLSX guardam IDs inteiros como "4.0". O identificador
    // contratual é inteiro; aceitar apenas este sufixo de exportação evita
    // descartar toda a tabela de responsabilidades.
    if (idValue) currentProject = normalizeProjectCode(idValue.replace(/\.0+$/, ''));
    const disciplineValue = text(cell(sheet, row, discipline));
    if (!disciplineValue) continue;
    if (!currentProject) {
      audit.unknownOrAmbiguous.push({ domain: 'responsibility', message: 'Linha de responsabilidade sem ID anterior para carry-forward; ignorada.', provenance: provenance(workbook, sheet, row, [id, discipline]) });
      continue;
    }
    out.push({
      projectCode: currentProject, disciplineCode: normalizeDisciplineCode(disciplineValue), performanceRating: text(cell(sheet, row, rating)),
      mode: text(cell(sheet, row, mode)), thirdParty: text(cell(sheet, row, thirdParty)), closed: text(cell(sheet, row, closed)),
      bimCompatibility: text(cell(sheet, row, bim)), milestones: {}, excludedMilestones: [],
      provenance: provenance(workbook, sheet, row, [id, discipline, rating, mode, closed, thirdParty, bim]),
    });
  }
  return out;
}

function parseMeasurements(workbook: Workbook, audit: ReconciliationAudit): MeasurementImport[] {
  const sheet = sheetBy(workbook, (candidate) => /medi[cç][oõ]es/i.test(candidate.name) || headers(candidate).values.some((value) => /MEDI[CÇ][AÃ]O/.test(normHeader(value))), 'de medicoes');
  audit.selectedSheets.measurements = sheet.name;
  const { row: headerRow, values: header } = headers(sheet);
  const project = columnFor(header, [/^(ID|PROJETO|EDIFICAC)/], 0);
  const discipline = columnFor(header, [/DISCIPLIN/], 1);
  const supplier = columnFor(header, [/(FORNECED|TERCEIRIZ|EMPRESA)/], 2);
  const internal = columnFor(header, [/(RESPONS.*INTERN|QUANTA)/], 3);
  const technicalCols: number[] = []; const contractualCols: number[] = [];
  for (let milestone = 1; milestone <= 6; milestone++) {
    technicalCols.push(columnFor(header, [new RegExp(`(${milestone}|${MEASUREMENT_MILESTONE_WEIGHTS[milestone - 1]}%).*(TECN|T.CN)`)], -1));
    contractualCols.push(columnFor(header, [new RegExp(`(${milestone}|${MEASUREMENT_MILESTONE_WEIGHTS[milestone - 1]}%).*(CONTRAT|C.T)`)], -1));
  }
  const out: MeasurementImport[] = [];
  let currentProject = '';
  for (const row of nonEmptyRows(sheet).filter((value) => value > headerRow)) {
    const value = text(cell(sheet, row, project));
    if (value) currentProject = normalizeProjectCode(value.replace(/\.0+$/, ''));
    const disciplineValue = text(cell(sheet, row, discipline));
    if (!disciplineValue) continue;
    if (!currentProject) {
      audit.unknownOrAmbiguous.push({ domain: 'measurement', message: 'Linha de medicao sem projeto corrente; ignorada.', provenance: provenance(workbook, sheet, row, [project, discipline]) });
      continue;
    }
    out.push({
      projectCode: currentProject, disciplineCode: normalizeDisciplineCode(disciplineValue), supplier: text(cell(sheet, row, supplier)), internalResponsible: text(cell(sheet, row, internal)),
      milestones: Array.from({ length: 6 }, (_, index) => ({ milestone: index + 1, weight: MEASUREMENT_MILESTONE_WEIGHTS[index], technicalApproved: technicalCols[index] >= 0 ? text(cell(sheet, row, technicalCols[index])) : '', contractualApproved: contractualCols[index] >= 0 ? text(cell(sheet, row, contractualCols[index])) : '' })),
      provenance: provenance(workbook, sheet, row, [project, discipline, supplier, internal, ...technicalCols.filter((col) => col >= 0), ...contractualCols.filter((col) => col >= 0)]),
    });
  }
  if (technicalCols.some((col) => col < 0) || contractualCols.some((col) => col < 0)) audit.manualGoogleSheetConfirmation.push('Aba Medições: um ou mais campos de aprovação técnica/contratual não foram identificados pelo cabeçalho; confirme o mapeamento antes da carga.');
  return out;
}

function parseValidations(workbook: Workbook, audit: ReconciliationAudit): ValidationLedgerImport[] {
  const sheet = sheetBy(workbook, (candidate) => /validac/i.test(candidate.name) || headers(candidate).values.some((value) => normHeader(value).includes('ASSINATURA')), 'de validacoes');
  audit.selectedSheets.validations = sheet.name;
  const { row: headerRow } = headers(sheet);
  const out: ValidationLedgerImport[] = [];
  for (const row of nonEmptyRows(sheet).filter((value) => value > headerRow)) {
    const data = VALIDATION_FIELDS.map((_, index) => text(cell(sheet, row, index)));
    if (!data.some(Boolean)) continue;
    const projectCode = normalizeProjectCode(data[3].replace(/\.0+$/, ''));
    if (data[3] && !projectCode) audit.unknownOrAmbiguous.push({ domain: 'validation', message: `Codigo de projeto invalido: "${data[3]}".`, provenance: provenance(workbook, sheet, row, [...Array(17).keys()]) });
    out.push({ ...Object.fromEntries(VALIDATION_FIELDS.map((field, index) => [field, data[index]])) as Omit<ValidationLedgerImport, 'provenance' | 'projectCode'>, projectCode, provenance: provenance(workbook, sheet, row, [...Array(17).keys()]) });
  }
  return out;
}

function auditUnheadedPtoQ(workbook: Workbook, audit: ReconciliationAudit): void {
  for (const sheet of workbook.sheets) {
    const { row, values } = headers(sheet);
    const headersPtoQ = [values[15] || '', values[16] || ''];
    const populatedRows = nonEmptyRows(sheet).filter((r) => r > row && (text(cell(sheet, r, 15)) || text(cell(sheet, r, 16)))).length;
    if (populatedRows && !headersPtoQ.some(Boolean)) audit.unheadedColumnsPtoQ.push({ workbook: path.basename(workbook.file), sheet: sheet.name, populatedRows, headers: headersPtoQ });
  }
}

export async function reconcileCeptXlsx(deliveryPath: string, ceptPath: string, validationPath: string) {
  const [deliveryWorkbook, ceptWorkbook, validationWorkbook] = await Promise.all([readWorkbook(deliveryPath), readWorkbook(ceptPath), readWorkbook(validationPath)]);
  const audit: ReconciliationAudit = {
    generatedAt: new Date().toISOString(), sourceFiles: [deliveryPath, ceptPath, validationPath].map((file) => path.resolve(file)), selectedSheets: {}, rowCounts: {}, unknownOrAmbiguous: [], merges: [], unheadedColumnsPtoQ: [],
    manualGoogleSheetConfirmation: [
      'Confirmar no Google Sheets quais celulas vazias da matriz principal tinham checkbox sem valor; XLSX nao preserva a regra de validacao.',
      'Confirmar visualmente os blocos mesclados e N/A da matriz; a exportacao XLSX preserva ranges, mas nao a semantica da interface Sheets.',
      'Confirmar que as colunas P:Q sem cabecalho (se reportadas) nao sao dados operacionais ocultos.',
      'Confirmar assinaturas e versao crua no Google Sheets antes de usar o ledger como fonte de validacao confiavel.',
    ],
  };
  const deliveries = parseDeliveries(deliveryWorkbook, audit);
  const responsibilities = parseResponsibilities(ceptWorkbook, audit);
  const measurements = parseMeasurements(ceptWorkbook, audit);
  const validations = parseValidations(validationWorkbook, audit);
  [deliveryWorkbook, ceptWorkbook, validationWorkbook].forEach((workbook) => auditUnheadedPtoQ(workbook, audit));
  audit.rowCounts = { deliveryComponents: deliveries.length, responsibilityLod: responsibilities.length, measurements: measurements.length, validationLedger: validations.length };
  const unexpectedProjects = [...new Set([...deliveries, ...responsibilities, ...measurements].map((item) => item.projectCode).filter((code) => code && !projectCodes.includes(code as never)))];
  if (unexpectedProjects.length) audit.manualGoogleSheetConfirmation.push(`Codigos de projeto fora do catalogo: ${unexpectedProjects.join(', ')}.`);
  return { deliveries, responsibilities, measurements, validations, audit };
}

function parseArguments(argv: string[]) {
  const allowRepoOutput = argv.includes('--allow-repo-output');
  const filtered = argv.filter((item) => item !== '--allow-repo-output');
  const outFlag = filtered.indexOf('--out');
  if (outFlag < 0 || !filtered[outFlag + 1]) throw new Error('Informe --out <pasta-fora-do-repo>.');
  const paths = filtered.slice(0, outFlag);
  if (paths.length !== 3) throw new Error('Informe exatamente tres XLSX: entregaveis, CEPT, validacoes.');
  return { delivery: paths[0], cept: paths[1], validations: paths[2], output: filtered[outFlag + 1], allowRepoOutput };
}

function isInside(child: string, parent: string): boolean {
  const relative = path.relative(path.resolve(parent), path.resolve(child));
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

export async function runCli(argv = process.argv.slice(2)): Promise<void> {
  const args = parseArguments(argv);
  const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
  const output = path.resolve(args.output);
  if (isInside(output, repoRoot) && !args.allowRepoOutput) throw new Error('Recusado: --out aponta para dentro do repositorio. Use uma pasta externa ou --allow-repo-output conscientemente.');
  const result = await reconcileCeptXlsx(args.delivery, args.cept, args.validations);
  await fs.mkdir(output, { recursive: true });
  await Promise.all([
    fs.writeFile(path.join(output, 'delivery-components.json'), JSON.stringify(result.deliveries, null, 2)),
    fs.writeFile(path.join(output, 'responsibility-lod.json'), JSON.stringify(result.responsibilities, null, 2)),
    fs.writeFile(path.join(output, 'measurements.json'), JSON.stringify(result.measurements, null, 2)),
    fs.writeFile(path.join(output, 'validation-ledger.json'), JSON.stringify(result.validations, null, 2)),
    fs.writeFile(path.join(output, 'reconciliation-audit.json'), JSON.stringify(result.audit, null, 2)),
  ]);
  console.log(`CEPT XLSX: ${result.audit.rowCounts.deliveryComponents} componentes, ${result.audit.rowCounts.responsibilityLod} responsabilidades, ${result.audit.rowCounts.measurements} medicoes, ${result.audit.rowCounts.validationLedger} validacoes.`);
  console.log(`Saida somente-leitura: ${output}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runCli().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
}
