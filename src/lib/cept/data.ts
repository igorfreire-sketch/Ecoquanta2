// CEPT - camada Firestore (1 doc por registro, nunca blob: longe do limite de 1 MiB).
// Regras puras em ./rules. Contrato das colecoes: firestore.rules (bloco CEPT v2).
import { getAuth } from 'firebase/auth';
import {
  collection, doc, getDoc, onSnapshot, query, runTransaction, serverTimestamp, setDoc, where,
  type DocumentData,
} from 'firebase/firestore';
import { ensureFirebaseAuth, getDb, nextDocumentVersion } from '../firebaseDb';
import {
  buildCeptModel, CEPT_OS061, planValidationBatch,
  type CeptComponenteDoc, type CeptModel, type CeptValidacaoDoc, type CeptValidationRequestItem,
} from './rules';

// ponytail: nomes `cept2*` porque `ceptComponentes`/`ceptValidacoes` ainda pertencem ao porte
// antigo (rules nao apagadas). Quando o antigo sair, renomear so aqui + firestore.rules.
export const CEPT_COLLECTIONS = {
  componentes: 'cept2Componentes',
  planejamento: 'cept2Planejamento',
  edificacoes: 'cept2Edificacoes',
  medicoes: 'cept2Medicoes',
  validacoes: 'cept2Validacoes',
  alteracoes: 'cept2Alteracoes',
  config: 'ceptConfig',
} as const;
export type CeptEditableCollection = 'componentes' | 'planejamento' | 'edificacoes' | 'medicoes';

/** Doc id sem '/': sourceType tem barra ("ET/RT (PDF)"). */
export const ceptComponentId = (osCode: string, projectCode: string, disciplineCode: string, sourceType: string) =>
  `${osCode}__${projectCode}__${disciplineCode}__${encodeURIComponent(sourceType)}`;
export const ceptRowId = (osCode: string, projectCode: string, sourceRow: number) => `${osCode}__${projectCode}__${sourceRow}`;
export const ceptEdificacaoId = (osCode: string, projectCode: string) => `${osCode}__${projectCode}`;

const currentEmail = () => String(getAuth(getDb().app).currentUser?.email || '').trim().toLowerCase();
const atMillis = (v: unknown) => (v && typeof (v as { toMillis?: () => number }).toMillis === 'function' ? (v as { toMillis: () => number }).toMillis() : Number(v) || 0);

/**
 * Tempo real (substitui o polling de 5 min). Entrega a colecao inteira da OS a cada mudanca;
 * o Firestore so trafega o delta. Validacoes chegam em ordem cronologica (o verde depende disso).
 */
export function subscribeCeptCollection<T = DocumentData>(
  name: keyof typeof CEPT_COLLECTIONS,
  osCode: string,
  onData: (rows: Array<T & { id: string }>) => void,
  onError?: (error: Error) => void,
) {
  const ref = name === 'config' ? collection(getDb(), CEPT_COLLECTIONS.config) : query(collection(getDb(), CEPT_COLLECTIONS[name]), where('osCode', '==', osCode));
  return onSnapshot(ref, (snap) => {
    const rows = snap.docs.map((d) => ({ ...(d.data() as T), id: d.id }));
    if (name === 'validacoes') rows.sort((a, b) => atMillis((a as { at?: unknown }).at) - atMillis((b as { at?: unknown }).at));
    onData(rows);
  }, (error) => onError?.(error as Error));
}

/**
 * Salva 1 celula/linha com versao otimista + 1 doc em cept2Alteracoes por campo alterado,
 * na mesma transacao (nunca grava edicao sem log, nem log sem edicao).
 * Conflito de versao -> lanca erro; a tela recarrega a celula (P15).
 * Para criar: expectedVersion = 0 e `patch` com todos os campos de identidade.
 */
export async function saveCeptRecord(name: CeptEditableCollection, id: string, patch: Record<string, unknown>, expectedVersion: number): Promise<number> {
  await ensureFirebaseAuth();
  const email = currentEmail();
  if (!email) throw new Error('Entre com sua conta Google para editar o CEPT.');
  const db = getDb();
  const batchId = 'EDIT-' + globalThis.crypto.randomUUID();
  return runTransaction(db, async (tx) => {
    const ref = doc(db, CEPT_COLLECTIONS[name], id);
    const snap = await tx.get(ref);
    const before = snap.exists() ? snap.data() : {};
    const version = nextDocumentVersion(expectedVersion, Number(before.version || 0));
    const changed = Object.keys(patch).filter((k) => JSON.stringify(before[k] ?? null) !== JSON.stringify(patch[k] ?? null));
    if (!changed.length && snap.exists()) return Number(before.version || 0);
    tx.set(ref, { ...patch, version, updatedAt: serverTimestamp(), updatedBy: email }, { merge: true });
    changed.forEach((campo) => {
      tx.set(doc(collection(db, CEPT_COLLECTIONS.alteracoes)), {
        osCode: String(patch.osCode ?? before.osCode ?? ''), colecao: CEPT_COLLECTIONS[name], docId: id, campo,
        antes: before[campo] ?? null, depois: patch[campo] ?? null, userEmail: email, at: serverTimestamp(), batchId,
      });
    });
    return version;
  });
}

export async function fetchCeptValidators(): Promise<string[]> {
  await ensureFirebaseAuth();
  const snap = await getDoc(doc(getDb(), CEPT_COLLECTIONS.config, 'validadores'));
  return snap.exists() ? (snap.data().emails as string[]) || [] : [];
}

/** Admin: cria ceptConfig/validadores com os 5 e-mails de CEPT:47-53 se ainda nao existir. */
export async function seedCeptValidators(): Promise<boolean> {
  await ensureFirebaseAuth();
  const ref = doc(getDb(), CEPT_COLLECTIONS.config, 'validadores');
  if ((await getDoc(ref)).exists()) return false;
  await setDoc(ref, { emails: CEPT_OS061.validationEditors, updatedAt: serverTimestamp(), updatedBy: currentEmail() });
  return true;
}

export async function saveCeptValidators(emails: string[]): Promise<void> {
  await ensureFirebaseAuth();
  const clean = [...new Set(emails.map((e) => String(e).trim().toLowerCase()).filter((e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)))];
  await setDoc(doc(getDb(), CEPT_COLLECTIONS.config, 'validadores'), { emails: clean, updatedAt: serverTimestamp(), updatedBy: currentEmail() });
}

/**
 * Lote de validacao (CEPT:1710-1883). Dentro de UMA transacao: rele do servidor todos os
 * componentes das familias tocadas, recalcula assinatura/alerta, grava so o que nao ficou
 * stale. Se qualquer componente lido mudar antes do commit, o Firestore refaz a transacao
 * (equivale ao LockService + segunda checagem do original). Append-only.
 * `model` = modelo que a tela tem agora (so para achar os ids dos membros de cada familia).
 */
export async function saveCeptValidationBatch(input: {
  osCode: string;
  action: string;
  items: CeptValidationRequestItem[];
  observation?: string;
  model: CeptModel;
}) {
  await ensureFirebaseAuth();
  const email = currentEmail();
  const validators = await fetchCeptValidators();
  const db = getDb();
  const familyKeys = new Set(input.items.map((i) => `${String(i.projectCode).trim()}|${String(i.discipline).trim()}|${String(i.family).trim()}`));
  const memberIds = [...input.model.byRecordKey.values()]
    .filter((c) => familyKeys.has(`${c.projectCode}|${c.disciplineCode}|${c.family}`))
    .map((c) => ceptComponentId(input.osCode, c.projectCode, c.disciplineCode, c.sourceType));
  const batchId = 'BATCH-' + globalThis.crypto.randomUUID();

  return runTransaction(db, async (tx) => {
    const snaps = await Promise.all(memberIds.map((id) => tx.get(doc(db, CEPT_COLLECTIONS.componentes, id))));
    const live = await buildCeptModel(snaps.filter((s) => s.exists()).map((s) => s.data() as CeptComponenteDoc));
    const plan = planValidationBatch({ ...input, userEmail: email, validators, live: live.byRecordKey, batchId });
    plan.rows.forEach((row) => {
      const data: CeptValidacaoDoc = { ...row, at: serverTimestamp() };
      tx.set(doc(collection(db, CEPT_COLLECTIONS.validacoes)), data);
    });
    return { ...plan, batchId, user: email };
  });
}
