import {
  fetchFirebaseCollection,
  fetchFirebaseDocument,
  fetchFirebaseDocumentChunks,
} from './firebaseDb';

export interface AccIssue {
  id: string;
  key?: string;
  os: string;
  contratoCodigo?: string;
  titulo: string;
  status: string;
  categoria?: string;
  tipo: string;
  descricao?: string;
  pessoa?: string;
  cargo?: string;
  empresa?: string;
  seguidores?: string[] | string;
  criadoPor?: string;
  criadoEm: string;
  vencimento?: string;
  posicionamento?: string;
  atualizadoEm?: string;
  fechadoPor?: string;
  fechadoEm?: string;
  comentarios?: string;
  setor: string;
  origem?: 'acc' | 'manual' | 'legado';
}

export interface AccResumo {
  updatedAt?: unknown;
  osVersions: Record<string, string>;
  empresas: string[];
  totais?: Record<string, unknown>;
  ultimaImportacao?: { lidos?: number; novos?: number; alterados?: number; erros?: unknown[] };
}

export interface AccFilters {
  contrato?: string;
  os?: string;
  mes?: string;
  setor?: string;
  tipo?: string;
  terceirizada?: string;
  status?: string;
}

type CacheEntry = { hash: string; issues: AccIssue[] };
type AccDeps = {
  readCache: (os: string) => Promise<CacheEntry | null>;
  writeCache: (os: string, entry: CacheEntry) => Promise<void>;
  fetchOs: (os: string) => Promise<Record<string, unknown> | null>;
  fetchChunks: (os: string, count: number) => Promise<string[]>;
};

let resumoPromise: Promise<AccResumo> | null = null;
const memoryCache = new Map<string, CacheEntry>();
const DB_NAME = 'ecoquanta-acc';
const STORE_NAME = 'os';

export function normalizeAccValue(value: unknown) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
}

function openCache(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function readCache(os: string): Promise<CacheEntry | null> {
  const memory = memoryCache.get(os);
  if (memory) return memory;
  const db = await openCache();
  if (!db) return null;
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE_NAME).objectStore(STORE_NAME).get(os);
    request.onsuccess = () => {
      const entry = request.result as CacheEntry | undefined;
      if (entry) memoryCache.set(os, entry);
      resolve(entry || null);
    };
    request.onerror = () => reject(request.error);
  });
}

async function writeCache(os: string, entry: CacheEntry) {
  memoryCache.set(os, entry);
  const db = await openCache();
  if (!db) return;
  await new Promise<void>((resolve, reject) => {
    const request = db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).put(entry, os);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export function parseAccJson(json: string): AccIssue[] {
  const parsed = JSON.parse(json || '[]');
  if (!Array.isArray(parsed)) throw new Error('accOs: json deve conter uma lista.');
  return parsed as AccIssue[];
}

export function filterAccIssues(issues: AccIssue[], filters: AccFilters, terceirizadas: Set<string>) {
  return issues.filter((issue) => {
    const month = String(issue.criadoEm || '').slice(0, 7);
    const outsourced = terceirizadas.has(normalizeAccValue(issue.empresa)) ? 'sim' : 'nao';
    return (!filters.contrato || normalizeAccValue(issue.contratoCodigo) === normalizeAccValue(filters.contrato))
      && (!filters.os || normalizeAccValue(issue.os) === normalizeAccValue(filters.os))
      && (!filters.mes || month === filters.mes)
      && (!filters.setor || normalizeAccValue(issue.setor) === normalizeAccValue(filters.setor))
      && (!filters.tipo || normalizeAccValue(issue.tipo) === normalizeAccValue(filters.tipo))
      && (!filters.terceirizada || outsourced === filters.terceirizada)
      && (!filters.status || normalizeAccValue(issue.status) === normalizeAccValue(filters.status));
  });
}

export function countBy(issues: AccIssue[], field: keyof Pick<AccIssue, 'os' | 'setor' | 'tipo' | 'empresa' | 'status'>) {
  return Object.entries(issues.reduce<Record<string, number>>((counts, issue) => {
    const key = String(issue[field] || 'Nao informado').trim() || 'Nao informado';
    counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {})).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));
}

export async function loadAccResumo(): Promise<AccResumo> {
  if (!resumoPromise) resumoPromise = fetchFirebaseDocument<AccResumo>('accResumo', 'atual')
    .then((value) => value || { osVersions: {}, empresas: [] })
    .catch((error) => { resumoPromise = null; throw error; });
  return resumoPromise;
}

export async function loadAccOsWith(os: string, hash: string, deps: AccDeps): Promise<AccIssue[]> {
  const cached = await deps.readCache(os);
  if (cached?.hash === hash) return cached.issues;
  const document = await deps.fetchOs(os);
  if (!document) return [];
  const json = typeof document.json === 'string'
    ? document.json
    : (await deps.fetchChunks(os, Number(document.chunkCount || 0))).join('');
  const issues = parseAccJson(json);
  await deps.writeCache(os, { hash, issues });
  return issues;
}

export async function loadAccOs(os: string, resumo: AccResumo): Promise<AccIssue[]> {
  const hash = resumo.osVersions?.[os];
  if (!hash) return [];
  return loadAccOsWith(os, hash, {
    readCache,
    writeCache,
    fetchOs: (id) => fetchFirebaseDocument('accOs', id),
    fetchChunks: (id, count) => count > 0 ? fetchFirebaseDocumentChunks('accOs', id, count) : Promise.resolve([]),
  });
}

export async function loadManualQuality(contractCode?: string) {
  return fetchFirebaseCollection<AccIssue>('qualidadeManual', contractCode
    ? { field: 'contratoCodigo', value: contractCode }
    : undefined);
}

export async function loadAccTerceirizadas() {
  return fetchFirebaseCollection<{ id: string; nome: string; terceirizada: boolean; manual?: boolean }>('accTerceirizadas');
}
