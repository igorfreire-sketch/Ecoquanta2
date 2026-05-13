const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyl1TyOHEuhWV-twFybZ3wQ1k7IOb4Ob-lvjNtODiK9rxgZB4TA4iVtFbRjXorhaK5G/exec';

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

interface GenericResponse {
  success: boolean;
  error?: string;
  message?: string;
}

interface Nc2ListResponse extends GenericResponse {
  records?: Nc2Record[];
}

function assertSuccess(response: GenericResponse, fallbackMessage: string) {
  if (!response?.success) {
    throw new Error(response?.error || response?.message || fallbackMessage);
  }
}

async function postToAppsScript<T>(payload: Record<string, unknown>): Promise<T> {
  const response = await fetch(APPS_SCRIPT_URL, {
    method: 'POST',
    body: JSON.stringify(payload),
  });

  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Servidor instavel ou resposta invalida do Apps Script: ${text.substring(0, 100)}`);
  }
}

export async function getRecords(): Promise<Nc2Record[]> {
  const response = await fetch(`${APPS_SCRIPT_URL}?action=getNc2Records`, { cache: 'no-store' });
  const data = await response.json() as Nc2ListResponse;
  assertSuccess(data, 'Falha ao carregar revisoes de conformidade.');
  return Array.isArray(data.records) ? data.records : [];
}

export async function saveRecordsBatch(
  records: Nc2Record[],
  currentUser?: { nome?: string; email?: string }
): Promise<Nc2Record[]> {
  const response = await postToAppsScript<Nc2ListResponse>({
    action: 'saveNc2RecordsBatch',
    userName: currentUser?.nome || '',
    userEmail: currentUser?.email || '',
    records,
  });
  assertSuccess(response, 'Falha ao salvar atividades de conformidade.');
  return Array.isArray(response.records) ? response.records : [];
}

export async function updateRecord(
  record: Nc2Record,
  currentUser?: { nome?: string; email?: string }
): Promise<Nc2Record> {
  const response = await postToAppsScript<Nc2ListResponse>({
    action: 'updateNc2Record',
    userName: currentUser?.nome || '',
    userEmail: currentUser?.email || '',
    record,
  });
  assertSuccess(response, 'Falha ao atualizar revisao de conformidade.');
  return Array.isArray(response.records) && response.records[0] ? response.records[0] : record;
}

export function generateId(): string {
  return `NC2-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}
