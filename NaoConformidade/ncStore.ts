// Shared store for NC records with T non-conformities
// Uses localStorage + CustomEvent so Preenchimento and Revisoes stay in sync.

export interface NcItem {
  itemKey: string;
  itemLabel: string;
  quantidadeT: number;
  unit: 'folha' | 'arquivo';
  revisado: boolean;
}

export interface NcRecord {
  id: string;          // unique id
  os: string;
  objetoOs: string;
  disciplina: string;
  avaliador: string;
  dataHora: string;    // "29/04/2026 às 14:32 por João"
  itensT: NcItem[];    // only items where T > 0
  concluido: boolean;  // all itensT revisados
}

const KEY = 'nc_revisoes';
const EVENT = 'nc_revisoes_change';

export function getRecords(): NcRecord[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '[]') as NcRecord[];
  } catch {
    return [];
  }
}

export function saveRecord(record: NcRecord): void {
  const list = getRecords();
  const idx = list.findIndex(r => r.id === record.id);
  if (idx >= 0) list[idx] = record;
  else list.unshift(record);
  localStorage.setItem(KEY, JSON.stringify(list));
  window.dispatchEvent(new Event(EVENT));
}

export function updateRecord(id: string, patch: Partial<NcRecord>): void {
  const list = getRecords();
  const idx = list.findIndex(r => r.id === id);
  if (idx >= 0) {
    list[idx] = { ...list[idx], ...patch };
    localStorage.setItem(KEY, JSON.stringify(list));
    window.dispatchEvent(new Event(EVENT));
  }
}

export function archiveRecord(id: string): void {
  const list = getRecords().filter(r => r.id !== id);
  localStorage.setItem(KEY, JSON.stringify(list));
  window.dispatchEvent(new Event(EVENT));
}

export function onRecordsChange(cb: () => void): () => void {
  window.addEventListener(EVENT, cb);
  return () => window.removeEventListener(EVENT, cb);
}

export function generateId(): string {
  return `NC-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}
