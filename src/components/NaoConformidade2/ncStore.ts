// Shared store for NC2 records with T non-conformities.
// Uses localStorage + CustomEvent so Preenchimento and Revisoes stay in sync.

export interface Nc2Item {
  itemKey: string;
  itemLabel: string;
  quantidadeT: number;
  unit: 'folha' | 'arquivo';
  revisado: boolean;
}

export interface Nc2Record {
  id: string;
  os: string;
  objetoOs: string;
  disciplina: string;
  avaliador: string;
  dataHora: string;
  itensT: Nc2Item[];
  concluido: boolean;
}

const KEY = 'nc2_revisoes';
const EVENT = 'nc2_revisoes_change';

export function getRecords(): Nc2Record[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '[]') as Nc2Record[];
  } catch {
    return [];
  }
}

export function saveRecord(record: Nc2Record): void {
  const list = getRecords();
  const idx = list.findIndex((item) => item.id === record.id);
  if (idx >= 0) list[idx] = record;
  else list.unshift(record);
  localStorage.setItem(KEY, JSON.stringify(list));
  window.dispatchEvent(new Event(EVENT));
}

export function updateRecord(id: string, patch: Partial<Nc2Record>): void {
  const list = getRecords();
  const idx = list.findIndex((item) => item.id === id);
  if (idx >= 0) {
    list[idx] = { ...list[idx], ...patch };
    localStorage.setItem(KEY, JSON.stringify(list));
    window.dispatchEvent(new Event(EVENT));
  }
}

export function archiveRecord(id: string): void {
  const list = getRecords().filter((item) => item.id !== id);
  localStorage.setItem(KEY, JSON.stringify(list));
  window.dispatchEvent(new Event(EVENT));
}

export function onRecordsChange(cb: () => void): () => void {
  window.addEventListener(EVENT, cb);
  return () => window.removeEventListener(EVENT, cb);
}

export function generateId(): string {
  return `NC2-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}
