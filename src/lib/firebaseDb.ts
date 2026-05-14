import { initializeApp, type FirebaseApp } from 'firebase/app';
import { getAuth, signInAnonymously } from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type Firestore,
} from 'firebase/firestore';

interface FirebaseRuntimeConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket?: string;
  messagingSenderId?: string;
  appId: string;
}

interface AuthUserLike {
  email?: string;
  nome?: string;
  role?: string;
  disciplina?: string;
  contrato?: string;
  isAdmin?: boolean;
}

interface GlobalData {
  registro?: any;
  cronograma?: any;
  admin?: any;
  eap?: any;
}

interface RegistroDataResponse {
  success: boolean;
  error?: string;
  contracts: any[];
  osOptions: any[];
  itemOptions: any[];
  hierarchyNodes?: any[];
  childrenByParent?: Record<string, any[]>;
  rootCodes?: string[];
  professionals: any[];
  activeActivities: any[];
  completedActivities: any[];
}

interface NewActivityDraftLike {
  contratoCodigo: string;
  contratoNome: string;
  osCodigo: string;
  osNome: string;
  setor: string;
  itemCodigo: string;
  itemNome: string;
  profissionaisEmails: string[];
  profissionaisNomes: string[];
  dificuldade: string;
  descricao: string;
  avancoInicial: number;
}

interface ActivityUpdateDraftLike {
  profissionaisEmails: string[];
  profissionaisNomes: string[];
  avancoAtual: number;
  avaliacaoAtual: string;
  observacaoAtual: string;
}

interface BatchWriteResponse {
  success: boolean;
  error?: string;
  message?: string;
  duplicateItems?: Array<{ itemCodigo: string; itemNome: string }>;
  syncUpdated?: boolean;
  syncError?: string;
  registroSnapshot?: Partial<RegistroDataResponse>;
}

let app: FirebaseApp | null = null;
let db: Firestore | null = null;
let authPromise: Promise<void> | null = null;

function readFirebaseConfig(): FirebaseRuntimeConfig | null {
  const enabled = String(import.meta.env.VITE_FIREBASE_ENABLED || '').trim().toLowerCase();
  if (!['true', '1', 'yes', 'sim'].includes(enabled)) return null;

  const config = {
    apiKey: String(import.meta.env.VITE_FIREBASE_API_KEY || '').trim(),
    authDomain: String(import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || '').trim(),
    projectId: String(import.meta.env.VITE_FIREBASE_PROJECT_ID || '').trim(),
    storageBucket: String(import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || '').trim(),
    messagingSenderId: String(import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '').trim(),
    appId: String(import.meta.env.VITE_FIREBASE_APP_ID || '').trim(),
  };

  if (!config.apiKey || !config.authDomain || !config.projectId || !config.appId) return null;
  return config;
}

export function isFirebaseConfigured() {
  return Boolean(readFirebaseConfig());
}

function getDb() {
  const config = readFirebaseConfig();
  if (!config) throw new Error('Firebase nao configurado.');

  if (!app) app = initializeApp(config);
  if (!db) db = getFirestore(app);
  return db;
}

async function ensureFirebaseAuth() {
  const anonymousEnabled = String(import.meta.env.VITE_FIREBASE_ANONYMOUS_AUTH || '').trim().toLowerCase();
  if (!['true', '1', 'yes', 'sim'].includes(anonymousEnabled)) return;

  if (!app) getDb();
  if (!app) return;

  if (!authPromise) {
    authPromise = signInAnonymously(getAuth(app)).then(() => undefined);
  }
  await authPromise;
}

function nowPtBr() {
  return new Date().toLocaleString('pt-BR');
}

function normalizeEmail(value?: string) {
  return String(value || '').trim().toLowerCase();
}

function normalizeDiscipline(value?: string) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
}

function isLeadershipOrAdmin(user: AuthUserLike) {
  if (user.isAdmin) return true;
  const role = normalizeDiscipline(user.role);
  return ['lider', 'coorden', 'geren', 'diretor', 'gestor', 'supervisor'].some((keyword) => role.includes(keyword));
}

function activityMatchesUser(activity: any, user: AuthUserLike, professionals: any[]) {
  if (isLeadershipOrAdmin(user)) return true;

  const userContract = String(user.contrato || '').trim();
  if (userContract && String(activity?.contratoCodigo || '').trim() !== userContract) return false;

  const userDiscipline = normalizeDiscipline(user.disciplina);
  if (!userDiscipline) return true;

  const activityDiscipline = normalizeDiscipline(activity?.criadoPorDisciplina || activity?.disciplina);
  if (activityDiscipline) return activityDiscipline === userDiscipline;

  const disciplineEmails = new Set(
    professionals
      .filter((item) => normalizeDiscipline(item?.disciplina) === userDiscipline)
      .map((item) => normalizeEmail(item?.email))
      .filter(Boolean),
  );
  const activityEmails = Array.isArray(activity?.profissionaisEmails)
    ? activity.profissionaisEmails
    : String(activity?.profissionaisEmails || '').split(' | ');

  return activityEmails.some((email: string) => disciplineEmails.has(normalizeEmail(email)));
}

function normalizeFirestoreRecord(snapshot: any) {
  const data = snapshot.data ? snapshot.data() : snapshot;
  return {
    ...data,
    activityId: String(data?.activityId || snapshot.id || ''),
    id: String(data?.activityId || snapshot.id || ''),
  };
}

function splitActivitiesForUser(activities: any[], user: AuthUserLike, professionals: any[]) {
  const visible = activities.filter((item) => activityMatchesUser(item, user, professionals));
  return {
    activeActivities: visible.filter((item) => String(item?.status || '').trim().toLowerCase() !== 'concluida'),
    completedActivities: visible.filter((item) => String(item?.status || '').trim().toLowerCase() === 'concluida'),
  };
}

async function getAppDataDoc<T>(dbRef: Firestore, name: string): Promise<T | null> {
  const snapshot = await getDoc(doc(dbRef, 'appData', name));
  if (!snapshot.exists()) return null;
  const payload = snapshot.data();
  if (payload.chunked && Number(payload.chunkCount || 0) > 0) {
    const chunkSnapshot = await getDocs(collection(dbRef, 'appData', name, 'chunks'));
    const jsonText = chunkSnapshot.docs
      .map((entry) => ({ id: entry.id, value: String(entry.data()?.value || '') }))
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((entry) => entry.value)
      .join('');
    return JSON.parse(jsonText) as T;
  }
  if (typeof payload.dataJson === 'string') {
    return JSON.parse(payload.dataJson) as T;
  }
  return ((payload.data && typeof payload.data === 'object') ? payload.data : payload) as T;
}

export async function fetchGlobalDataFromFirebase(user?: AuthUserLike): Promise<GlobalData> {
  await ensureFirebaseAuth();
  const dbRef = getDb();
  const [registro, admin, cronograma, eap] = await Promise.all([
    getAppDataDoc<any>(dbRef, 'registro'),
    getAppDataDoc<any>(dbRef, 'admin'),
    getAppDataDoc<any>(dbRef, 'cronograma'),
    getAppDataDoc<any>(dbRef, 'eap'),
  ]);

  const activitiesSnapshot = await getDocs(collection(dbRef, 'registroAtividades'));
  const activitiesList = activitiesSnapshot.docs.map(normalizeFirestoreRecord);
  const professionals = getProfessionalsForUser(registro, user || {});
  const split = splitActivitiesForUser(activitiesList, user || {}, professionals);

  const fullData: GlobalData = {
    registro: {
      ...(registro || {}),
      activitiesList,
      activeActivities: split.activeActivities,
      completedActivities: split.completedActivities,
      professionals,
    },
    admin: admin || undefined,
    cronograma: cronograma || undefined,
    eap: eap || undefined,
  };

  if (eap?.registro) {
    fullData.registro = {
      ...fullData.registro,
      contracts: Array.isArray(eap.registro.contracts) ? eap.registro.contracts : fullData.registro.contracts,
      osOptions: Array.isArray(eap.registro.osOptions) ? eap.registro.osOptions : fullData.registro.osOptions,
      itemOptions: Array.isArray(eap.registro.itemOptions) ? eap.registro.itemOptions : fullData.registro.itemOptions,
      hierarchyNodes: Array.isArray(eap.registro.hierarchyNodes) ? eap.registro.hierarchyNodes : fullData.registro.hierarchyNodes,
      childrenByParent: eap.registro.childrenByParent || fullData.registro.childrenByParent,
      rootCodes: Array.isArray(eap.registro.rootCodes) ? eap.registro.rootCodes : fullData.registro.rootCodes,
    };
  }

  return fullData;
}

function getProfessionalsForUser(registro: any, user: AuthUserLike) {
  const byDiscipline = registro?.professionalsByDisciplina;
  if (!byDiscipline || typeof byDiscipline !== 'object') return Array.isArray(registro?.professionals) ? registro.professionals : [];

  if (isLeadershipOrAdmin(user)) {
    return Object.values(byDiscipline).flat().filter(Boolean);
  }

  const target = normalizeDiscipline(user.disciplina) || normalizeDiscipline('Sem disciplina');
  const entry = Object.entries(byDiscipline).find(([key, value]) => normalizeDiscipline(key) === target && Array.isArray(value));
  return (entry?.[1] as any[]) || [];
}

export async function fetchRegistroDataFromFirebase(user: AuthUserLike): Promise<RegistroDataResponse> {
  const fullData = await fetchGlobalDataFromFirebase(user);
  const registro = fullData.registro || {};
  const professionals = getProfessionalsForUser(registro, user);
  const split = splitActivitiesForUser(Array.isArray(registro.activitiesList) ? registro.activitiesList : [], user, professionals);

  return {
    success: true,
    contracts: registro.contracts || [],
    osOptions: registro.osOptions || [],
    itemOptions: registro.itemOptions || [],
    hierarchyNodes: registro.hierarchyNodes || [],
    childrenByParent: registro.childrenByParent || {},
    rootCodes: registro.rootCodes || [],
    professionals,
    activeActivities: split.activeActivities,
    completedActivities: split.completedActivities,
  };
}

export async function registerActivitiesInFirebase(user: AuthUserLike, activities: NewActivityDraftLike[]): Promise<BatchWriteResponse> {
  await ensureFirebaseAuth();
  const dbRef = getDb();
  const validActivities = activities.filter((item) => (
    item.contratoCodigo && item.osCodigo && item.itemCodigo && item.descricao && item.descricao.length >= 50 && item.profissionaisEmails?.length
  ));

  if (!validActivities.length) return { success: false, error: 'Nenhuma atividade valida para registrar.' };

  const duplicateItems: Array<{ itemCodigo: string; itemNome: string }> = [];
  const rowsToSave: any[] = [];
  const queuedItems = new Set<string>();

  for (const item of validActivities) {
    const itemCodigo = String(item.itemCodigo || '').trim();
    const existingSnapshot = await getDocs(query(collection(dbRef, 'registroAtividades'), where('itemCodigo', '==', itemCodigo)));
    const hasOpen = existingSnapshot.docs.some((entry) => String(entry.data()?.status || '').trim().toLowerCase() !== 'concluida');

    if (hasOpen || queuedItems.has(itemCodigo)) {
      duplicateItems.push({ itemCodigo, itemNome: item.itemNome });
      continue;
    }

    queuedItems.add(itemCodigo);
    const activityId = crypto.randomUUID();
    const nowStr = nowPtBr();
    const avancoInicial = Math.max(0, Math.min(100, Number(item.avancoInicial || 0)));
    const status = avancoInicial === 100 ? 'aguardando_conclusao' : 'em_andamento';

    rowsToSave.push({
      activityId,
      dataRegistro: nowStr,
      criadoPor: user.nome || '',
      criadoPorEmail: normalizeEmail(user.email),
      criadoPorRole: user.role || '',
      criadoPorDisciplina: user.disciplina || '',
      contratoCodigo: item.contratoCodigo,
      contratoNome: item.contratoNome,
      osCodigo: item.osCodigo,
      osNome: item.osNome,
      itemCodigo,
      itemNome: item.itemNome,
      setor: item.setor || 'Engenharia',
      profissionais: item.profissionaisNomes.join(' | '),
      profissionaisEmails: item.profissionaisEmails.join(' | '),
      dificuldade: item.dificuldade,
      descricao: item.descricao,
      avancoAtual: avancoInicial,
      avaliacaoAtual: '',
      observacaoAtual: '',
      status,
      data100: avancoInicial === 100 ? nowStr : '',
      dataConclusaoEfetiva: '',
      ativo: true,
      ultimaAtualizacao: nowStr,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }

  if (!rowsToSave.length) {
    return {
      success: false,
      error: duplicateItems.length ? 'Todas as atividades enviadas ja estavam registradas.' : 'Nenhuma atividade valida para registrar.',
      duplicateItems,
    };
  }

  const batch = writeBatch(dbRef);
  rowsToSave.forEach((activity) => {
    batch.set(doc(dbRef, 'registroAtividades', activity.activityId), activity);
    batch.set(doc(collection(dbRef, 'registroAtividadesHistorico')), {
      activityId: activity.activityId,
      data: activity.dataRegistro,
      userEmail: normalizeEmail(user.email),
      userName: user.nome || '',
      tipo: 'registro_inicial',
      valorAnterior: '',
      valorNovo: JSON.stringify(activity),
      createdAt: serverTimestamp(),
    });
  });
  await batch.commit();

  return {
    success: true,
    message: `${rowsToSave.length} atividade(s) registrada(s) com sucesso.`,
    duplicateItems,
    syncUpdated: true,
    syncError: '',
    registroSnapshot: await fetchRegistroDataFromFirebase(user),
  };
}

export async function updateActivitiesInFirebase(user: AuthUserLike, updates: Array<{ activityId: string } & ActivityUpdateDraftLike>): Promise<BatchWriteResponse> {
  await ensureFirebaseAuth();
  const dbRef = getDb();
  if (!updates.length) return { success: false, error: 'Nenhuma alteracao para salvar.' };

  const batch = writeBatch(dbRef);
  let anyUpdated = false;
  const nowStr = nowPtBr();

  for (const update of updates) {
    const activityId = String(update.activityId || '').trim();
    if (!activityId) continue;

    let activityRef = doc(dbRef, 'registroAtividades', activityId);
    let snapshot = await getDoc(activityRef);

    if (!snapshot.exists()) {
      const lookup = await getDocs(query(collection(dbRef, 'registroAtividades'), where('activityId', '==', activityId)));
      if (lookup.empty) continue;
      activityRef = lookup.docs[0].ref;
      snapshot = lookup.docs[0];
    }

    const current = snapshot.data();
    if (String(current?.status || '').trim().toLowerCase() === 'concluida') continue;

    const avancoAtual = Math.max(0, Math.min(100, Number(update.avancoAtual || 0)));
    const status = avancoAtual === 100
      ? 'aguardando_conclusao'
      : String(current?.status || '') === 'aguardando_conclusao'
        ? 'em_andamento'
        : current?.status || 'em_andamento';

    batch.update(activityRef, {
      profissionais: update.profissionaisNomes.join(' | '),
      profissionaisEmails: update.profissionaisEmails.join(' | '),
      avancoAtual,
      avaliacaoAtual: update.avaliacaoAtual || '',
      observacaoAtual: update.observacaoAtual || '',
      status,
      data100: avancoAtual === 100 ? (current?.data100 || nowStr) : '',
      ultimaAtualizacao: nowStr,
      updatedAt: serverTimestamp(),
    });
    batch.set(doc(collection(dbRef, 'registroAtividadesHistorico')), {
      activityId,
      data: nowStr,
      userEmail: normalizeEmail(user.email),
      userName: user.nome || '',
      tipo: 'atualizacao',
      valorAnterior: JSON.stringify({
        profissionaisEmails: current?.profissionaisEmails || '',
        avancoAtual: current?.avancoAtual || 0,
        avaliacaoAtual: current?.avaliacaoAtual || '',
        observacaoAtual: current?.observacaoAtual || '',
      }),
      valorNovo: JSON.stringify(update),
      createdAt: serverTimestamp(),
    });
    anyUpdated = true;
  }

  if (!anyUpdated) return { success: false, error: 'Nenhuma alteracao valida foi encontrada.' };

  await batch.commit();
  return {
    success: true,
    message: 'Alteracoes salvas com sucesso.',
    syncUpdated: true,
    syncError: '',
    registroSnapshot: await fetchRegistroDataFromFirebase(user),
  };
}

export async function upsertFirebaseAppData(name: string, data: any) {
  await ensureFirebaseAuth();
  const dbRef = getDb();
  await setDoc(doc(dbRef, 'appData', name), {
    data,
    updatedAt: serverTimestamp(),
  }, { merge: true });
}

export async function updateFirebaseRegistroActivity(activityId: string, patch: Record<string, unknown>) {
  await ensureFirebaseAuth();
  const dbRef = getDb();
  await updateDoc(doc(dbRef, 'registroAtividades', activityId), {
    ...patch,
    updatedAt: serverTimestamp(),
  });
}

export async function fetchFirebaseCollection<T = Record<string, unknown>>(collectionName: string): Promise<T[]> {
  await ensureFirebaseAuth();
  const dbRef = getDb();
  const snapshot = await getDocs(collection(dbRef, collectionName));
  return snapshot.docs.map((entry) => normalizeFirestoreRecord(entry) as T);
}

export async function setFirebaseDocument(collectionName: string, id: string, data: object) {
  await ensureFirebaseAuth();
  const dbRef = getDb();
  const payload = data as Record<string, unknown>;
  await setDoc(doc(dbRef, collectionName, id), {
    ...payload,
    updatedAt: payload.updatedAt || serverTimestamp(),
  }, { merge: true });
}

export async function setFirebaseDocuments(collectionName: string, rows: Array<object & { id: string }>) {
  await ensureFirebaseAuth();
  if (!rows.length) return;
  const dbRef = getDb();
  const batch = writeBatch(dbRef);
  rows.forEach((row) => {
    const payload = row as Record<string, unknown> & { id: string };
    batch.set(doc(dbRef, collectionName, row.id), {
      ...payload,
      updatedAt: payload.updatedAt || serverTimestamp(),
    }, { merge: true });
  });
  await batch.commit();
}
