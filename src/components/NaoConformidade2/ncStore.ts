import { fetchFirebaseCollection, isFirebaseConfigured, setFirebaseDocument, setFirebaseDocuments } from '../../lib/firebaseDb';

export interface Nc2Item {
  itemKey: string;
  itemLabel: string;
  quantidadeC: number;
  quantidadeT: number;
  unit: 'folha' | 'arquivo';
  revisado: boolean;
}

export interface Nc2Record {
  id: string;
  contratoCodigo: string;
  contratoNome: string;
  os: string;
  osCodigo: string;
  objetoOs: string;
  objetoOsCodigo: string;
  disciplina: string;
  avaliador: string;
  avaliadorEmail: string;
  observacoes: string;
  dataHora: string;
  itens: Nc2Item[];
  itensT: Nc2Item[];
  concluido: boolean;
  createdAt?: string;
  updatedAt?: string;
  updatedByNome?: string;
  updatedByEmail?: string;
}

export async function getRecords(): Promise<Nc2Record[]> {
  if (!isFirebaseConfigured()) throw new Error('Firebase nao configurado para conformidade.');
  return fetchFirebaseCollection<Nc2Record>('nc2Records');
}

export async function saveRecordsBatch(
  records: Nc2Record[],
  currentUser?: { nome?: string; email?: string }
): Promise<Nc2Record[]> {
  if (!isFirebaseConfigured()) throw new Error('Firebase nao configurado para conformidade.');
  const now = new Date().toISOString();
  const rows = records.map((record) => ({
    ...record,
    updatedAt: now,
    updatedByNome: currentUser?.nome || record.updatedByNome || '',
    updatedByEmail: currentUser?.email || record.updatedByEmail || '',
  }));
  await setFirebaseDocuments('nc2Records', rows);
  return rows;
}

export async function updateRecord(
  record: Nc2Record,
  currentUser?: { nome?: string; email?: string }
): Promise<Nc2Record> {
  if (!isFirebaseConfigured()) throw new Error('Firebase nao configurado para conformidade.');
  const nextRecord = {
    ...record,
    updatedAt: new Date().toISOString(),
    updatedByNome: currentUser?.nome || record.updatedByNome || '',
    updatedByEmail: currentUser?.email || record.updatedByEmail || '',
  };
  await setFirebaseDocument('nc2Records', nextRecord.id, nextRecord);
  return nextRecord;
}

export function generateId(): string {
  return `NC2-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}
