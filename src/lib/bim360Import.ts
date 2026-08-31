import JSZip from 'jszip';
import { fetchFirebaseCollection, setFirebaseDocument } from './firebaseDb';
import type { Nc2Record } from '../components/NaoConformidade2/ncStore';

export interface Bim360Issue {
  issueId: string;
  title: string;
  status: string;
  category: string;
  type: string;
  description: string;
  assignedTo: string;
  company: string;
  createdOn: string;
}

export interface Bim360ImportResult {
  osNome: string;
  osCodigo: string;
  issues: Bim360Issue[];
}

export interface Bim360SyncDeps {
  list: () => Promise<Nc2Record[]>;
  save: (id: string, record: Nc2Record) => Promise<void>;
}

export async function syncBim360Quality(
  parsed: Bim360ImportResult,
  deps: Bim360SyncDeps = { list: () => fetchFirebaseCollection<Nc2Record>('nc2Records'), save: (id, record) => setFirebaseDocument('nc2Records', id, record) },
) {
  const existing = await deps.list();
  let created = 0;
  let updated = 0;
  for (const issue of parsed.issues) {
    const match = existing.find((record) => record.origemExterna?.issueId === issue.issueId);
    const id = match?.id || `BIM360-${issue.issueId.replace(/[^A-Za-z0-9_-]/g, '')}`;
    const record: Nc2Record = {
      ...(match || {}),
      id,
      contratoCodigo: match?.contratoCodigo || '', contratoNome: match?.contratoNome || '',
      os: parsed.osNome, osCodigo: parsed.osCodigo, objetoOs: parsed.osNome, objetoOsCodigo: parsed.osCodigo,
      disciplina: issue.category || 'Quality', origemAtividade: 'terceirizado',
      terceirizadaNome: issue.company, avaliador: issue.assignedTo, avaliadorEmail: '',
      observacoes: [issue.title, issue.description].filter(Boolean).join('\n\n'), dataHora: issue.createdOn,
      itens: [{ itemKey: issue.issueId, itemLabel: issue.title || issue.issueId, quantidadeC: 0, quantidadeT: 1, unit: 'arquivo', revisado: false, statusCorrecao: 'pendente', correcaoOrigem: 'outro_setor' }],
      itensT: [], concluido: false, origemExterna: { sistema: 'bim360acc', issueId: issue.issueId },
    };
    await deps.save(id, record);
    if (match) updated++; else created++;
  }
  return { created, updated };
}

const EXCEL_EPOCH = Date.UTC(1899, 11, 30);

export async function parseBim360Workbook(buffer: ArrayBuffer): Promise<Bim360ImportResult> {
  const zip = await JSZip.loadAsync(buffer);
  const shared = await readSharedStrings(zip);
  const metadata = await readRows(zip, 'xl/worksheets/sheet1.xml', shared);
  const osNome = metadata.flat().find((value) => /\bOS\s*[0-9]{2,}\b/i.test(value)) || '';
  const osMatch = osNome.match(/\bOS\s*([0-9]{2,})\b/i);
  const osCodigo = osMatch ? `OS${osMatch[1]}` : '';
  const rows = await readRows(zip, 'xl/worksheets/sheet2.xml', shared);
  const issues: Bim360Issue[] = [];
  const seen = new Set<string>();
  rows.slice(1).forEach((row) => {
    const issueId = String(row[0] || '').trim();
    if (!/^#\d+/.test(issueId) || seen.has(issueId) || String(row[3] || '').trim().toLowerCase() !== 'quality') return;
    seen.add(issueId);
    issues.push({
      issueId,
      title: row[1] || '', status: row[2] || '', category: row[3] || '', type: row[4] || '',
      description: row[5] || '', assignedTo: row[6] || '', company: row[7] || '', createdOn: excelDateToIso(row[10]),
    });
  });
  return { osNome, osCodigo, issues };
}

export function excelDateToIso(value: string): string {
  const serial = Number(String(value || '').replace(',', '.'));
  if (!Number.isFinite(serial)) return '';
  return new Date(EXCEL_EPOCH + serial * 86400000).toISOString();
}

async function readSharedStrings(zip: JSZip): Promise<string[]> {
  const file = zip.file('xl/sharedStrings.xml');
  if (!file) return [];
  const xml = await file.async('text');
  return Array.from(xml.matchAll(/<si\b[\s\S]*?<\/si>/g), (match) =>
    Array.from(match[0].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g), (part) => decodeXml(part[1])).join(''),
  );
}

async function readRows(zip: JSZip, path: string, shared: string[]): Promise<string[][]> {
  const file = zip.file(path);
  if (!file) throw new Error(`A planilha ${path} não foi encontrada.`);
  const xml = await file.async('text');
  return Array.from(xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g), (row) => {
    const cells: string[] = [];
    for (const cell of row[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const ref = cell[1].match(/\br="([A-Z]+)\d+"/);
      if (!ref) continue;
      const index = ref[1].split('').reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;
      const body = cell[2] || '';
      const value = body.match(/<v[^>]*>([\s\S]*?)<\/v>/)?.[1] || body.match(/<t[^>]*>([\s\S]*?)<\/t>/)?.[1] || '';
      cells[index] = cell[1].match(/\bt="s"/) ? (shared[Number(value)] || '') : decodeXml(value);
    }
    return cells;
  });
}

function decodeXml(value: string): string {
  return value.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}
