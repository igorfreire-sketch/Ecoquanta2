// One-time import: CEPT Google Sheets export -> Firestore-ready JSON.
// Runs the ADR-0001 §5 normalization exactly once; the output JSON is what a human reviews
// before a separate (later) step loads it into Firestore. See docs/decisoes/0001-cept-acompanhamento-entregas-firestore.md
//
// Usage:
//   npx tsx scripts/migracao/cept-import.ts <fonte.csv> <responsabilidade.csv>
// Defaults to the fixture files in scripts/migracao/fixtures/ if no args are given, so the
// script is runnable end-to-end without the real export.
//
// Expected CSV column layout (see ADR §1 and the task brief for the full rule table):
//   Fonte (mirrors "Acompanhamento de Entregáveis por Disciplina e Edificação V2"):
//     col A = discipline code (only on the discipline's first row, carries forward)
//     col B = source label
//     col C = source type (e.g. "RVT", "MC (PDF)")
//     col D.. = repeating (status, DATA ENTREGA) pairs, one pair per project 001-009.
//              Header of the status column matches /^\s*(\d{3})\s*[-–—]/, immediately
//              followed by a header containing "DATA ENTREGA".
//   Responsabilidade (mirrors "Planilha1"):
//     col A = project code (carries forward), col C = discipline name (free text),
//     col E = mode ("QUANTA" / "TERCEIRIZADO"), col G = third-party name.

import fs from 'node:fs';
import path from 'node:path';
import { disciplineAliases, restrictedDisciplines } from '../../src/lib/ceptCatalog';
// buildRecordKey/sanitizeKeySegment vivem no modulo puro -- app e import tem que gerar a MESMA chave.
import { buildRecordKey, sanitizeKeySegment } from '../../src/lib/ceptModel';
import { DEFAULT_DISCIPLINES } from '../../src/lib/disciplineCatalog';

// ---------- CSV parsing (no dep: quoted fields + embedded commas is all we need) ----------

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  const src = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; } else { inQuotes = false; }
      } else {
        field += c;
      }
      continue;
    }
    if (c === '"') { inQuotes = true; continue; }
    if (c === ',') { row.push(field); field = ''; continue; }
    if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; continue; }
    field += c;
  }
  row.push(field);
  if (row.length > 1 || row[0] !== '') rows.push(row);
  return rows;
}

// ---------- Shapes ----------

export type CeptStatus = 'delivered' | 'pending' | 'na' | 'unknown';

export interface CeptComponent {
  recordKey: string;
  projectCode: string;
  disciplineCode: string;
  family: string;
  familyLabel: string;
  sourceLabel: string;
  sourceType: string;
  format: string;
  editable: boolean | null;
  status: CeptStatus;
  dateIso: string;
  edificacao?: string;
  updatedAt: string;
  updatedByEmail: string;
  updatedByNome: string;
}

export type CeptResponsabilidadeOrigem = 'linha_direta' | 'coringa_todas' | 'herdado_hida';

export interface CeptResponsavel {
  responsavel: string;
  tipo: 'internal' | 'external' | 'unidentified';
  origem: CeptResponsabilidadeOrigem;
}

// ---------- Normalization: discipline code ----------

function normalizeDisciplineCode(raw: string): string {
  const code = String(raw || '').trim().toUpperCase();
  return disciplineAliases[code] || code;
}

// ---------- Normalization: family / format / editable ----------

const EDITABLE_FORMATS = new Set([
  'RVT', 'RFA', 'RTE', 'DOC', 'DOCX', 'ODT', 'XLS', 'XLSX', 'XLSM', 'ODS',
  'DWG', 'DXF', 'DGN', 'PPT', 'PPTX',
]);
const NON_EDITABLE_FORMATS = new Set(['PDF', 'IFC']);

export function classifyDeliverable(sourceLabel: string, sourceType: string): { family: string; format: string; editable: boolean | null } {
  const type = String(sourceType || '').trim();
  const typeUpper = type.toUpperCase();
  const labelUpper = String(sourceLabel || '').toUpperCase();

  let family: string;
  if (typeUpper.startsWith('RVT')) family = 'RVT';
  else if (typeUpper.startsWith('PDF') && labelUpper.includes('PRANCHA')) family = 'PDF';
  else if (typeUpper.startsWith('IFC')) family = 'IFC';
  else if (typeUpper.startsWith('MC')) family = 'MC';
  else if (typeUpper.startsWith('MD')) family = 'MD';
  else if (/^ET\s*\/\s*RT/.test(typeUpper)) family = 'ET/RT';
  else if (typeUpper.startsWith('MA')) family = 'MA';
  else family = (type.split('(')[0] || type).trim().toUpperCase() || 'OUTRO';

  const parenMatch = type.match(/\(([^)]*)\)\s*$/);
  const format = (parenMatch ? parenMatch[1] : type).trim().toUpperCase();

  let editable: boolean | null = null;
  if (NON_EDITABLE_FORMATS.has(format)) editable = false;
  else if (EDITABLE_FORMATS.has(format)) editable = true;

  return { family, format, editable };
}

// ---------- Normalization: status ----------

const DELIVERED_TOKENS = new Set(['TRUE', 'VERDADEIRO', 'SIM', 'V', '1']);
const PENDING_TOKENS = new Set(['FALSE', 'FALSO', 'NAO', 'NÃO', '0']);
const NA_TOKENS = new Set(['-', 'N/A', 'NA']);

export function parseStatus(raw: string): CeptStatus {
  const text = String(raw || '').trim().toUpperCase();
  if (text === '') return 'na';
  if (DELIVERED_TOKENS.has(text)) return 'delivered';
  if (PENDING_TOKENS.has(text)) return 'pending';
  if (NA_TOKENS.has(text)) return 'na';
  // ponytail: CSV can't tell "cell had a checkbox validation but was left blank" apart from
  // "truly empty" the way the Sheets API could. Anything non-empty and unrecognized is 'unknown'
  // — same conservative fallback the original classifyDeliverable_ used, never guessed a status.
  return 'unknown';
}

// ---------- Normalization: date ----------

export function parseDateIso(raw: string): string {
  const text = String(raw || '').trim();
  if (!text) return '';
  const m = text.match(/^(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?$/);
  if (!m) return '';
  const day = Number(m[1]);
  const month = Number(m[2]);
  if (day < 1 || day > 31 || month < 1 || month > 12) return '';
  let year = m[3] ? Number(m[3]) : new Date().getFullYear();
  // ponytail: source allows DD/MM with no year; assume current year, matching the sheet's
  // implicit "this year" reading. Upgrade path: pass an explicit --year if a real export needs it.
  if (year < 100) year += 2000;
  const iso = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.getUTCDate() !== day || d.getUTCMonth() + 1 !== month) return '';
  return iso;
}

// ---------- Source sheet parsing ----------

interface ProjectColumnPair { projectCode: string; statusCol: number; dateCol: number }

function findProjectColumns(header: string[]): ProjectColumnPair[] {
  const pairs: ProjectColumnPair[] = [];
  for (let i = 3; i < header.length; i++) {
    const m = String(header[i] || '').match(/^\s*(\d{3})\s*[-–—]/);
    if (!m) continue;
    const dateHeader = String(header[i + 1] || '').toUpperCase();
    if (!dateHeader.includes('DATA ENTREGA')) continue;
    pairs.push({ projectCode: m[1], statusCol: i, dateCol: i + 1 });
  }
  return pairs;
}

export interface ImportOptions {
  updatedByEmail?: string;
  updatedByNome?: string;
}

export interface ImportResult {
  componentes: CeptComponent[];
  responsaveis: Record<string, CeptResponsavel>;
  warnings: string[];
}

export function buildComponentsFromSource(csvText: string, options: ImportOptions = {}): { componentes: CeptComponent[]; warnings: string[] } {
  const rows = parseCsv(csvText).filter((r) => r.some((c) => String(c || '').trim() !== ''));
  if (rows.length === 0) return { componentes: [], warnings: [] };
  const header = rows[0];
  const pairs = findProjectColumns(header);
  const updatedAt = new Date().toISOString();
  const updatedByEmail = options.updatedByEmail || 'import-script@ecoquanta';
  const updatedByNome = options.updatedByNome || 'Importação CEPT';

  const warnings: string[] = [];
  const seenKeys = new Map<string, number>();
  const componentes: CeptComponent[] = [];
  let currentDiscipline = '';

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const rawDiscipline = String(row[0] || '').trim();
    if (rawDiscipline) currentDiscipline = normalizeDisciplineCode(rawDiscipline);
    const sourceLabel = String(row[1] || '').trim();
    const sourceType = String(row[2] || '').trim();
    if (!sourceLabel && !sourceType) continue; // spacer row: carries discipline state only
    if (!currentDiscipline) {
      warnings.push(`linha ${r + 1}: sem disciplina corrente (col A nunca preenchida antes) — linha ignorada`);
      continue;
    }

    const { family, format, editable } = classifyDeliverable(sourceLabel, sourceType);

    for (const pair of pairs) {
      const restriction = restrictedDisciplines[currentDiscipline];
      if (restriction && !restriction.includes(pair.projectCode)) {
        warnings.push(`linha ${r + 1}, projeto ${pair.projectCode}: disciplina ${currentDiscipline} restrita a ${restriction.join(',')} — componente descartado`);
        continue;
      }
      const status = parseStatus(row[pair.statusCol]);
      const dateRaw = row[pair.dateCol];
      const dateIso = parseDateIso(dateRaw);
      if (dateRaw && String(dateRaw).trim() && !dateIso) {
        warnings.push(`linha ${r + 1}, projeto ${pair.projectCode}: data "${dateRaw}" ilegível — dateIso gravado como ''`);
      }
      const recordKey = buildRecordKey(pair.projectCode, currentDiscipline, family, sourceType);
      const dupCount = seenKeys.get(recordKey) || 0;
      seenKeys.set(recordKey, dupCount + 1);
      if (dupCount > 0) {
        warnings.push(`recordKey duplicado: ${recordKey} (linha ${r + 1}) — ${dupCount + 1}ª ocorrência, mantendo todas no output pra revisão humana`);
      }

      componentes.push({
        recordKey,
        projectCode: pair.projectCode,
        disciplineCode: currentDiscipline,
        family,
        familyLabel: sourceType || family,
        sourceLabel,
        sourceType,
        format,
        editable,
        status,
        dateIso,
        updatedAt,
        updatedByEmail,
        updatedByNome,
      });
    }
  }

  return { componentes, warnings };
}

// ---------- Responsibility sheet parsing ----------

const DIRECT_CODES = new Set(DEFAULT_DISCIPLINES.map((d) => d.code));

function normalizeText(value: string): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toUpperCase();
}

// Reuses the exact equivalence table from the original mapResponsibilityDiscipline_ (ADR §5 /
// task brief). First match wins. '__ALL__' is the TODAS/TODOS wildcard, resolved later.
export function matchDisciplineNames(rawName: string): string[] | '__ALL__' | null {
  const text = normalizeText(rawName);
  if (!text) return null;
  if (DIRECT_CODES.has(text)) return [text];
  if (text.includes('ARQUITETURA')) return ['ARQ'];
  if (text.includes('ESTRUTURA')) return ['SCO'];
  if (text.includes('HIDROSSANIT') || /^HIDRO/.test(text)) return ['HIDA', 'ESG'];
  if (text.includes('DRENAGEM')) return ['DREN'];
  if (text.includes('ESGOTO')) return ['ESG'];
  if (/^AGUA/.test(text)) return ['HIDA'];
  if (text.includes('ELETR')) return ['ELET'];
  if (text.includes('LOGICA') || text.includes('CFTV') || text.includes('AUTOMACAO')) return ['TELE'];
  if (text.includes('PCI') || text.includes('INCEND')) return ['PCI'];
  if (text.includes('SPDA')) return ['SPDA'];
  if (text.includes('AVAC')) return ['AVAC'];
  if (text.includes('IMPERMEABIL')) return ['IMPE'];
  if (text.includes('FOTOVOLTA') || text.includes('ENERGIA RENOV')) return ['EREN'];
  if (text.includes('ILUMINACAO') && text.includes('PROJECAO')) return ['LUM'];
  if (text.includes('SONORIZ')) return ['SOM'];
  if (text.includes('TERRAPLAN')) return ['TERR'];
  if (text.includes('TODAS') || text.includes('TODOS')) return '__ALL__';
  return null;
}

function resolveMode(modeRaw: string, thirdPartyName: string): { responsavel: string; tipo: CeptResponsavel['tipo'] } {
  const mode = normalizeText(modeRaw);
  if (mode.includes('QUANTA')) return { responsavel: 'QUANTA', tipo: 'internal' };
  if (mode.includes('TERCEIR')) return { responsavel: String(thirdPartyName || '').trim() || 'TERCEIRIZADO (não informado)', tipo: 'external' };
  return { responsavel: '', tipo: 'unidentified' };
}

// Builds the "<project>|<discipline>" responsibility map. `knownPairs` = every (project,
// discipline) combo that actually appears in the imported componentes, so the TODAS wildcard
// and the DREN/ESG inheritance only fill combos the dashboard will actually query.
export function buildResponsaveis(
  csvText: string,
  knownPairs: Array<{ projectCode: string; disciplineCode: string }>
): { responsaveis: Record<string, CeptResponsavel>; warnings: string[] } {
  const warnings: string[] = [];
  const rows = parseCsv(csvText).filter((r) => r.some((c) => String(c || '').trim() !== ''));
  const direct: Record<string, CeptResponsavel> = {};
  const coringa: Record<string, { responsavel: string; tipo: CeptResponsavel['tipo'] }> = {};

  let currentProject = '';
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const rawProject = String(row[0] || '').trim();
    if (rawProject) currentProject = rawProject.padStart(3, '0');
    const disciplineName = String(row[2] || '').trim();
    const mode = String(row[4] || '').trim();
    const thirdParty = String(row[6] || '').trim();
    if (!disciplineName) continue;
    if (!currentProject) {
      warnings.push(`responsabilidade linha ${r + 1}: sem projeto corrente — linha ignorada`);
      continue;
    }
    const match = matchDisciplineNames(disciplineName);
    if (match === null) {
      warnings.push(`responsabilidade linha ${r + 1}: disciplina "${disciplineName}" não casou com nenhum alias conhecido — ignorada`);
      continue;
    }
    const resolved = resolveMode(mode, thirdParty);
    if (match === '__ALL__') {
      coringa[currentProject] = resolved;
      continue;
    }
    for (const code of match) {
      direct[`${currentProject}|${code}`] = { ...resolved, origem: 'linha_direta' };
    }
  }

  const responsaveis: Record<string, CeptResponsavel> = { ...direct };

  // DREN/ESG inherit HIDA's responsible for projects 002-009 (001 exempt), applied AFTER
  // resolving all direct rows and BEFORE the TODAS wildcard — a specific HIDA inheritance
  // beats the generic project-wide coringa, per ADR §5.
  for (const { projectCode, disciplineCode } of knownPairs) {
    if (projectCode === '001') continue;
    if (disciplineCode !== 'DREN' && disciplineCode !== 'ESG') continue;
    const key = `${projectCode}|${disciplineCode}`;
    if (responsaveis[key]) continue;
    const hida = responsaveis[`${projectCode}|HIDA`];
    if (hida) {
      responsaveis[key] = { responsavel: hida.responsavel, tipo: hida.tipo, origem: 'herdado_hida' };
    }
  }

  for (const { projectCode, disciplineCode } of knownPairs) {
    const key = `${projectCode}|${disciplineCode}`;
    if (responsaveis[key]) continue;
    if (coringa[projectCode]) {
      responsaveis[key] = { ...coringa[projectCode], origem: 'coringa_todas' };
    }
  }

  for (const { projectCode, disciplineCode } of knownPairs) {
    const key = `${projectCode}|${disciplineCode}`;
    if (!responsaveis[key]) {
      warnings.push(`responsável não resolvido para ${key} (nenhuma linha direta, coringa ou herança cobre)`);
    }
  }

  return { responsaveis, warnings };
}

// ---------- Orchestration ----------

export function runImport(sourceCsv: string, responsabilidadeCsv: string, options: ImportOptions = {}): ImportResult {
  const { componentes, warnings: sourceWarnings } = buildComponentsFromSource(sourceCsv, options);
  const knownPairs = Array.from(
    new Map(componentes.map((c) => [`${c.projectCode}|${c.disciplineCode}`, { projectCode: c.projectCode, disciplineCode: c.disciplineCode }])).values()
  );
  const { responsaveis, warnings: respWarnings } = buildResponsaveis(responsabilidadeCsv, knownPairs);
  return { componentes, responsaveis, warnings: [...sourceWarnings, ...respWarnings] };
}

// ---------- CLI entrypoint ----------

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));

if (isMain) {
  const scriptDir = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
  const sourcePath = process.argv[2] || path.join(scriptDir, 'fixtures', 'fonte.csv');
  const respPath = process.argv[3] || path.join(scriptDir, 'fixtures', 'responsabilidade.csv');
  const outDir = path.join(scriptDir, 'output');
  fs.mkdirSync(outDir, { recursive: true });

  const sourceCsv = fs.readFileSync(sourcePath, 'utf8');
  const respCsv = fs.readFileSync(respPath, 'utf8');
  const result = runImport(sourceCsv, respCsv);

  fs.writeFileSync(path.join(outDir, 'cept-componentes.json'), JSON.stringify(result.componentes, null, 2), 'utf8');
  fs.writeFileSync(path.join(outDir, 'cept-responsaveis.json'), JSON.stringify(result.responsaveis, null, 2), 'utf8');

  console.log(`cept-import: ${result.componentes.length} componentes, ${Object.keys(result.responsaveis).length} responsáveis`);
  console.log(`output: ${path.join(outDir, 'cept-componentes.json')}`);
  console.log(`output: ${path.join(outDir, 'cept-responsaveis.json')}`);
  if (result.warnings.length) {
    console.log(`\n${result.warnings.length} avisos:`);
    for (const w of result.warnings) console.log(`  - ${w}`);
  }
}
