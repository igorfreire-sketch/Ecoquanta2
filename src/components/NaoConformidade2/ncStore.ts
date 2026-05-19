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
  origemAtividade?: 'interno' | 'terceirizado';
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

export function getDemoRecords(): Nc2Record[] {
  const baseDate = new Date('2026-05-19T09:00:00');
  const items = [
    { itemKey: 'carimbo', itemLabel: 'Carimbo', unit: 'folha' as const },
    { itemKey: 'desenho', itemLabel: 'Desenho', unit: 'folha' as const },
    { itemKey: 'relatorio', itemLabel: 'Relatorio', unit: 'arquivo' as const },
    { itemKey: 'faltaArquivo', itemLabel: 'Falta de Arquivo', unit: 'arquivo' as const },
  ];

  return ['Estrutura', 'Arquitetura', 'Eletrica', 'Hidrossanitaria', 'PCI'].map((disciplina, index) => {
    const origemAtividade = index % 2 === 0 ? 'interno' as const : 'terceirizado' as const;
    const createdAt = new Date(baseDate.getTime() + index * 3600000).toISOString();
    const itens = items.map((item, itemIndex) => ({
      ...item,
      quantidadeC: (index + itemIndex) % 3,
      quantidadeT: ((index + 1) * (itemIndex + 1)) % 4,
      revisado: false,
    }));
    const itensT = itens.filter((item) => item.quantidadeT > 0);

    return {
      id: `NC2-DEMO-${index + 1}`,
      contratoCodigo: 'DEMO',
      contratoNome: 'Contrato Demonstracao',
      os: `DEMO.OS0${index + 1} - OS Demonstracao ${index + 1}`,
      osCodigo: `DEMO.OS0${index + 1}`,
      objetoOs: `Atividade Demonstracao ${index + 1}`,
      objetoOsCodigo: `DEMO.OS0${index + 1}.00${index + 1}`,
      disciplina,
      origemAtividade,
      avaliador: 'Modo Demonstracao',
      avaliadorEmail: 'demo@ecoquanta.local',
      observacoes: `Registro automatico de demonstracao ${index + 1}.`,
      dataHora: new Date(baseDate.getTime() + index * 3600000).toLocaleString('pt-BR'),
      itens,
      itensT,
      concluido: itensT.length === 0,
      createdAt,
      updatedAt: createdAt,
      updatedByNome: 'Modo Demonstracao',
      updatedByEmail: 'demo@ecoquanta.local',
    };
  });
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
