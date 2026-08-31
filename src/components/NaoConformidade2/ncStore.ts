import {
  canDeleteNote,
  fetchFirebaseCollection,
  isFirebaseConfigured,
  setFirebaseDocument,
  setFirebaseDocuments,
  type AuthUserLike,
} from '../../lib/firebaseDb';
import { getUserDisciplineList, resolveDisciplineEntry } from '../../lib/disciplineCatalog';

export interface Nc2Item {
  itemKey: string;
  itemLabel: string;
  quantidadeC: number;
  quantidadeT: number;
  unit: 'projeto' | 'folha' | 'arquivo';
  revisado: boolean;
  statusCorrecao?: 'pendente' | 'corrigido';
  correcaoOrigem?: 'conformidade' | 'outro_setor';
  correcaoSetor?: string;
  corrigidoEm?: string;
  corrigidoPor?: string;
  // Nota escrita pela Conformidade ao reabrir um item ja corrigido (volta pra 'pendente').
  // Item-level de proposito: record.observacoes e o texto do avaliador no Preenchimento, outro dono.
  reaberturaObservacao?: string;
  // Nota do avaliador no ato do preenchimento, escrita quando o item e marcado (C ou T > 0).
  // Distinta de record.observacoes (nota geral do registro) e de reaberturaObservacao (reabertura em Revisoes).
  observacao?: string;
  observacoesHistorico?: Array<{ autor: string; mensagem: string; dataHora: string }>;
}

export interface Nc2Record {
  id: string;
  contratoCodigo: string;
  contratoNome: string;
  os: string;
  osCodigo: string;
  objetoOs: string;
  objetoOsCodigo: string;
  edificacao?: string;
  disciplina: string;
  origemAtividade?: 'interno' | 'terceirizado';
  terceirizadaNome?: string;
  avaliador: string;
  avaliadorEmail: string;
  observacoes: string;
  observacoesHistorico?: Array<{ autor: string; mensagem: string; dataHora: string }>;
  dataHora: string;
  itens: Nc2Item[];
  itensT: Nc2Item[];
  concluido: boolean;
  createdAt?: string;
  updatedAt?: string;
  updatedByNome?: string;
  updatedByEmail?: string;
  origemExterna?: { sistema: 'bim360acc'; issueId: string };
  arquivado?: boolean;
  // Coluna do card no Kanban da Principal. Ausente = 'criado' (mesma convencao de AnnotationSheet.status).
  // Proposital que nao exista 'concluido': soltar em Concluido dispara confirmItemCorrection e o card some.
  kanbanStatus?: 'criado' | 'iniciado' | 'concluido';
  // Quem arrastou o card por ultimo (nome completo), mostrado como "{Nome} Moveu" no rodape do card.
  kanbanMovidoPor?: string;
  kanbanObservacao?: string;
  kanbanObservacaoPor?: string;
}

// Fonte unica da regra "quem edita registro existente": Lider/Coordenador ou o proprio autor.
// Revisoes (botao Editar) e Preenchimento (save) leem daqui, entao nunca divergem.
// ponytail: isto NAO e seguranca — o gate real precisa de firestore.rules + custom claims de cargo
// (hoje nc2Records so exige isSignedIn()); decisao pendente de autorizacao humana.
export function isNc2Leader(user: AuthUserLike) {
  const role = String(user.role || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
  // Cargo e texto livre digitado na Administracao ("Lideranca", "Lider/Coordenador", "Coordenacao",
  // "Sub-lider"), entao casa por trecho \u2014 mesmo criterio de lideranca que App.tsx ja usa em
  // shouldLockUserToContract. Igualdade/prefixo exato deixava o lider de fora do Kanban em silencio.
  return role.includes('lider') || role.includes('coorden');
}

export function canEditNc2Record(user: AuthUserLike, record: Pick<Nc2Record, 'avaliadorEmail'>) {
  return isNc2Leader(user) || canDeleteNote(user, record.avaliadorEmail);
}

function normalizeDiscipline(value: unknown) {
  return resolveDisciplineEntry(String(value || '')).normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
}

export function isNc2ConformidadeUser(user: AuthUserLike) {
  return getUserDisciplineList(user).some((discipline) => normalizeDiscipline(discipline).includes('conformidade'));
}

export function canViewNc2Record(user: AuthUserLike, record: Pick<Nc2Record, 'disciplina'>) {
  if (isNc2Leader(user)) return true;
  const recordDiscipline = normalizeDiscipline(record.disciplina);
  return Boolean(recordDiscipline) && getUserDisciplineList(user).some(
    (discipline) => normalizeDiscipline(discipline) === recordDiscipline,
  );
}

export async function getRecords(contractCode?: string): Promise<Nc2Record[]> {
  if (!isFirebaseConfigured()) throw new Error('Firebase nao configurado para conformidade.');
  const trimmedContractCode = String(contractCode || '').trim();
  const records = await fetchFirebaseCollection<Nc2Record>(
    'nc2Records',
    // ponytail: lowers browser traffic exposure, not security isolation; Firestore rules enforce access.
    trimmedContractCode ? { field: 'contratoCodigo', value: trimmedContractCode } : undefined,
  );
  // Registros arquivados saem de toda tela ativa (Revisoes/Conformidade/Kanban) a partir daqui,
  // fonte unica: ninguem mais precisa filtrar de novo.
  return records.filter((record) => {
    const legacy = record as Nc2Record & { legado?: boolean; legacy?: boolean; statusRegistro?: string };
    return !record.arquivado
      && !legacy.legado
      && !legacy.legacy
      && String(legacy.statusRegistro || '').trim().toLowerCase() !== 'legado';
  });
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

// Firestore nega delete (firestore.rules:84); arquivar = update com arquivado:true, permitido pelas regras.
export async function archiveRecord(id: string): Promise<void> {
  if (!isFirebaseConfigured()) throw new Error('Firebase nao configurado para conformidade.');
  await setFirebaseDocument('nc2Records', id, { arquivado: true });
}

export function generateId(): string {
  return `NC2-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

// Fonte unica de verdade pro status de um registro: Revisoes e Kanban leem daqui,
// nunca duplicam a conta, entao nunca divergem entre si.
export function safeAmount(value: unknown): number {
  const amount = Number(value);
  return Number.isFinite(amount) ? Math.max(0, amount) : 0;
}

export function getRecordItems(record: Nc2Record): Nc2Item[] {
  if (Array.isArray(record.itens) && record.itens.length > 0) return record.itens;
  return Array.isArray(record.itensT) ? record.itensT : [];
}

export function hasUnreadNc2Chat(record: Nc2Record, email?: string) {
  const messages = record.observacoesHistorico || [];
  if (!messages.length || typeof localStorage === 'undefined') return false;
  const key = `nc2-chat-seen:${record.id}:${String(email || '').toLowerCase()}`;
  return localStorage.getItem(key) !== messages[messages.length - 1].dataHora;
}

export function markNc2ChatSeen(record: Nc2Record, email?: string) {
  const messages = record.observacoesHistorico || [];
  if (!messages.length || typeof localStorage === 'undefined') return;
  localStorage.setItem(`nc2-chat-seen:${record.id}:${String(email || '').toLowerCase()}`, messages[messages.length - 1].dataHora);
}

export function correctionStatus(item: Nc2Item): 'pendente' | 'corrigido' {
  return item.statusCorrecao === 'corrigido' ? 'corrigido' : 'pendente';
}

// Fonte unica das transicoes de correcao de um item (Revisoes hoje, Kanban depois):
// 'pendente' = card ativo, 'corrigido' = concluido/fora do Kanban. Ninguem monta esse patch na mao.
// Aplica nos dois arrays (itens e itensT) porque o Preenchimento grava a NC nos dois.
function updateRecordItem(
  record: Nc2Record,
  itemKey: string,
  patch: (item: Nc2Item) => Nc2Item,
): Nc2Record {
  const apply = (list: Nc2Item[]) =>
    (Array.isArray(list) ? list : []).map((item) => (item.itemKey === itemKey ? patch(item) : item));
  const itens = apply(record.itens);
  const itensT = apply(record.itensT);
  const nonconforming = (itens.length > 0 ? itens : itensT).filter(
    (item) => safeAmount(item.quantidadeT) > 0,
  );
  return {
    ...record,
    itens,
    itensT,
    // Mesma regra do Preenchimento: registro concluido = todo item com NC corrigido.
    concluido: nonconforming.every((item) => correctionStatus(item) === 'corrigido'),
  };
}

export function confirmItemCorrection(record: Nc2Record, itemKey: string, userName: string): Nc2Record {
  return updateRecordItem(record, itemKey, (item) => ({
    ...item,
    statusCorrecao: 'corrigido',
    corrigidoEm: new Date().toISOString(),
    corrigidoPor: userName || '',
  }));
}

// Reabertura mantem corrigidoEm/corrigidoPor como historico da confirmacao anterior:
// statusCorrecao e a unica verdade do card, e Firestore rejeita campo `undefined`.
export function reopenItemCorrection(record: Nc2Record, itemKey: string, observacao: string): Nc2Record {
  return updateRecordItem(record, itemKey, (item) => ({
    ...item,
    statusCorrecao: 'pendente',
    reaberturaObservacao: String(observacao || '').trim(),
  }));
}

export function appendItemObservation(record: Nc2Record, itemKey: string, mensagem: string, autor: string): Nc2Record {
  const texto = String(mensagem || '').trim();
  if (!texto) return record;
  return updateRecordItem(record, itemKey, (item) => ({
    ...item,
    observacoesHistorico: [
      ...(item.observacoesHistorico || []),
      { autor: autor || 'Usuário', mensagem: texto, dataHora: new Date().toISOString() },
    ],
  }));
}

export interface RecordStatus {
  key: 'sem_nc' | 'corrigido' | 'em_correcao' | 'pendente';
  label: string;
  className: string;
}

export function getRecordStatus(record: Nc2Record): RecordStatus {
  const nonconforming = getRecordItems(record).filter((item) => safeAmount(item.quantidadeT) > 0);
  if (nonconforming.length === 0) {
    return {
      key: 'sem_nc',
      label: 'Sem não conformidades',
      className: 'bg-[#F1F5F9] text-[#475569]',
    };
  }

  const fixed = nonconforming.filter((item) => correctionStatus(item) === 'corrigido').length;
  if (fixed === nonconforming.length) {
    return { key: 'corrigido', label: 'Corrigido', className: 'bg-[#ECFDF5] text-[#047857]' };
  }
  if (fixed > 0) {
    return { key: 'em_correcao', label: 'Em correção', className: 'bg-[#FEF3C7] text-[#92400E]' };
  }
  return { key: 'pendente', label: 'Pendente', className: 'bg-[#FFF3EC] text-[#F05D28]' };
}
