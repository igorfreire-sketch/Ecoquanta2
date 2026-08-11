import { initializeApp, type FirebaseApp } from 'firebase/app';
import { getAuth, signInAnonymously, GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type Firestore,
} from 'firebase/firestore';
import { getUserDisciplineList } from './disciplineCatalog';
interface FirebaseRuntimeConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket?: string;
  messagingSenderId?: string;
  appId: string;
}

export interface AuthUserLike {
  email?: string;
  nome?: string;
  role?: string;
  disciplina?: string;
  disciplinas?: string[] | string;
  contrato?: string;
  isAdmin?: boolean;
  onlyThirdParty?: boolean;
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
  lodOptions?: any[];
  hierarchyNodes?: any[];
  childrenByParent?: Record<string, any[]>;
  rootCodes?: string[];
  professionals: any[];
  professionalsByDisciplina?: Record<string, any[]>;
  activitiesList?: any[];
  activeActivities: any[];
  completedActivities: any[];
}

interface NewActivityDraftLike {
  contratoCodigo?: string;
  contractCode?: string;
  osCode?: string;
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

const EMPTY_REGISTRO_RESPONSE: RegistroDataResponse = {
  success: true,
  contracts: [],
  osOptions: [],
  itemOptions: [],
  lodOptions: [],
  hierarchyNodes: [],
  childrenByParent: {},
  rootCodes: [],
  professionals: [],
  professionalsByDisciplina: {},
  activitiesList: [],
  activeActivities: [],
  completedActivities: [],
};

let app: FirebaseApp | null = null;
let db: Firestore | null = null;
let authPromise: Promise<void> | null = null;

const DEFAULT_FIREBASE_CONFIG: FirebaseRuntimeConfig = {
  apiKey: 'AIzaSyCGJ4UHPGyaf1GqayvTXUhvn3eLdu9ZW9g',
  authDomain: 'ecoquanta-c2720.firebaseapp.com',
  projectId: 'ecoquanta-c2720',
  storageBucket: 'ecoquanta-c2720.firebasestorage.app',
  messagingSenderId: '321062094939',
  appId: '1:321062094939:web:918e7a128f6c2825edd77e',
};

function readEnv(name: string) {
  return String(import.meta.env[name] || '').trim();
}

function isExplicitlyDisabled(value: string) {
  return ['false', '0', 'no', 'nao', 'não', 'off'].includes(value.trim().toLowerCase());
}

function readFirebaseConfig(): FirebaseRuntimeConfig | null {
  const enabled = readEnv('VITE_FIREBASE_ENABLED');
  if (isExplicitlyDisabled(enabled)) return null;

  const config = {
    apiKey: readEnv('VITE_FIREBASE_API_KEY') || DEFAULT_FIREBASE_CONFIG.apiKey,
    authDomain: readEnv('VITE_FIREBASE_AUTH_DOMAIN') || DEFAULT_FIREBASE_CONFIG.authDomain,
    projectId: readEnv('VITE_FIREBASE_PROJECT_ID') || DEFAULT_FIREBASE_CONFIG.projectId,
    storageBucket: readEnv('VITE_FIREBASE_STORAGE_BUCKET') || DEFAULT_FIREBASE_CONFIG.storageBucket,
    messagingSenderId: readEnv('VITE_FIREBASE_MESSAGING_SENDER_ID') || DEFAULT_FIREBASE_CONFIG.messagingSenderId,
    appId: readEnv('VITE_FIREBASE_APP_ID') || DEFAULT_FIREBASE_CONFIG.appId,
  };

  if (!config.apiKey || !config.authDomain || !config.projectId || !config.appId) return null;
  return config;
}

export function isFirebaseConfigured() {
  return Boolean(readFirebaseConfig());
}

function getDb() {
  const config = readFirebaseConfig();
  if (!config) {
    console.warn('⚠️ Firebase nao configurado. Verifique as variaveis de ambiente VITE_FIREBASE_*');
    throw new Error('Firebase indisponivel para esta operacao. A leitura tenta usar os dados publicados.');
  }

  if (!app) app = initializeApp(config);
  if (!db) db = getFirestore(app);
  return db;
}

async function ensureFirebaseAuth() {
  const anonymousEnabled = readEnv('VITE_FIREBASE_ANONYMOUS_AUTH');
  if (isExplicitlyDisabled(anonymousEnabled)) return;

  if (!app) getDb();
  if (!app) return;

  if (!authPromise) {
    const auth = getAuth(app);
    authPromise = auth.authStateReady()
      .then(() => auth.currentUser ? undefined : signInAnonymously(auth).then(() => undefined))
      .catch((error) => {
        authPromise = null;
        throw error;
      });
  }
  await authPromise;
}

// Escopo extra (alem do login basico) pra ler a Agenda do Google e vincular reuniao em
// andamento numa nota. Google NAO devolve refresh token pro client-side (SPA) - o token
// obtido aqui expira em ~1h e so renova chamando signInWithGooglePopup de novo (gesto real
// do usuario, ex: botao "Vincular Agenda" na nota - nunca popup automatico em background).
// calendar.events (leitura + escrita de eventos) - precisa de escrita pra deixar um link da
// nota na descricao do evento (ver linkNoteToEvent em googleCalendar.ts). documents.readonly -
// ler o CONTEUDO da ata do Gemini (Google Doc anexado ao evento), nao so o link.
const GOOGLE_CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.events';
const GOOGLE_DOCS_SCOPE = 'https://www.googleapis.com/auth/documents.readonly';
let googleCalendarToken: { token: string; expiresAt: number } | null = null;

// Login social (Google) via Firebase Auth. Precisa do provider "Google" habilitado em
// Firebase Console > Authentication > Sign-in method - se nao estiver, o popup falha com
// auth/operation-not-allowed. Sobrescreve a sessao anonima do ensureFirebaseAuth.
export async function signInWithGooglePopup(): Promise<string> {
  const config = readFirebaseConfig();
  if (!config) throw new Error('Firebase indisponivel para autenticar. Verifique a configuracao do ambiente.');
  if (!app) app = initializeApp(config);
  const provider = new GoogleAuthProvider();
  provider.addScope(GOOGLE_CALENDAR_SCOPE);
  provider.addScope(GOOGLE_DOCS_SCOPE);
  const result = await signInWithPopup(getAuth(app), provider);
  const email = result.user.email;
  if (!email) throw new Error('Conta Google sem e-mail associado.');
  const credential = GoogleAuthProvider.credentialFromResult(result);
  if (credential?.accessToken) {
    googleCalendarToken = { token: credential.accessToken, expiresAt: Date.now() + 55 * 60 * 1000 };
  }
  return email;
}

export async function ensureGoogleFirebaseAuth(expectedEmail: string): Promise<void> {
  const config = readFirebaseConfig();
  if (!config) throw new Error('Firebase indisponivel para autenticar.');
  if (!app) app = initializeApp(config);
  const auth = getAuth(app);
  await auth.authStateReady();
  const expected = expectedEmail.trim().toLowerCase();
  if (auth.currentUser?.email?.trim().toLowerCase() === expected) return;

  const authenticatedEmail = (await signInWithGooglePopup()).trim().toLowerCase();
  if (authenticatedEmail !== expected) {
    await signOutFirebase();
    throw new Error(`Entre com a conta Google ${expectedEmail} para salvar alteracoes administrativas.`);
  }
}

export async function signOutFirebase(): Promise<void> {
  if (!app) return;
  await signOut(getAuth(app));
  authPromise = null;
  googleCalendarToken = null;
}

// Token OAuth do Google (escopo Agenda) em cache - null quando nunca logou ou quando expirou
// (~1h). Sem popup silencioso: se der null, quem chamou precisa pedir pro usuario clicar de
// novo em "Entrar com Google"/"Vincular Agenda".
export function getGoogleCalendarToken(): string | null {
  if (!googleCalendarToken || googleCalendarToken.expiresAt < Date.now()) return null;
  return googleCalendarToken.token;
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

function buildThirdPartyEmail(id?: string, nome?: string) {
  const safeId = String(id || '').trim();
  if (safeId) return `terceirizada:${safeId}`;
  return `terceirizada:${normalizeDiscipline(nome) || 'sem-id'}`;
}

function mergeRegistroProfessionalsByDiscipline(registro: any, admin?: any) {
  const base = registro?.professionalsByDisciplina && typeof registro.professionalsByDisciplina === 'object'
    ? registro.professionalsByDisciplina
    : {};
  const merged = Object.fromEntries(
    Object.entries(base).map(([key, value]) => [key, Array.isArray(value) ? [...value] : []]),
  ) as Record<string, any[]>;
  const terceirizadas = Array.isArray(admin?.terceirizadas) ? admin.terceirizadas : [];

  terceirizadas.forEach((item: any) => {
    const nome = String(item?.nome || '').trim();
    if (!nome) return;
    const disciplinas: string[] = Array.from(new Set<string>(
      (Array.isArray(item?.disciplinas) ? item.disciplinas : String(item?.disciplina || '').split(','))
        .map((value: any) => String(value || '').trim())
        .filter(Boolean),
    ));
    (disciplinas.length > 0 ? disciplinas : ['Sem disciplina']).forEach((disciplina) => {
      const bucketKey = Object.keys(merged).find((key) => normalizeDiscipline(key) === normalizeDiscipline(disciplina)) || disciplina;
      const bucket = Array.isArray(merged[bucketKey]) ? [...merged[bucketKey]] : [];
      const email = buildThirdPartyEmail(item?.id, nome);
      const exists = bucket.some((entry: any) => normalizeEmail(entry?.email) === normalizeEmail(email));

      if (!exists) {
        bucket.push({
          nome,
          email,
          cargo: 'Terceirizada',
          disciplina,
          isThirdParty: true,
        });
      }

      merged[bucketKey] = bucket;
    });
  });

  return merged;
}

function userOnlySeesThirdParties(user: AuthUserLike, admin?: any) {
  if (user.onlyThirdParty) return true;
  const users = Array.isArray(admin?.users)
    ? admin.users
    : admin?.usersByEmail && typeof admin.usersByEmail === 'object'
      ? Object.values(admin.usersByEmail)
      : [];
  const match = users.find((item: any) => normalizeEmail(item?.email) === normalizeEmail(user.email));
  return Boolean(match?.onlyThirdParty || match?.onlyThirdPartyUsers || match?.somenteTerceirizados);
}

// Nota so pode ser excluida pelo proprio autor ou por admin do sistema.
// Lideranca/coordenacao NAO exclui nota de outro.
export function canDeleteNote(user: AuthUserLike, autorEmail?: string) {
  if (user.isAdmin) return true;
  const autor = normalizeEmail(autorEmail);
  return Boolean(autor) && normalizeEmail(user.email) === autor;
}

// Nota so pode ser alterada pelo autor, por admin do sistema, ou por um usuario
// vinculado a ela (marcado em Vincular Usuarios).
export function canEditNote(user: AuthUserLike, autorEmail?: string, marcadosUsuarios?: string[]) {
  if (canDeleteNote(user, autorEmail)) return true;
  const email = normalizeEmail(user.email);
  return Boolean(email) && (marcadosUsuarios || []).some((item) => normalizeEmail(item) === email);
}

export function isLeadershipOrAdmin(user: AuthUserLike) {
  if (user.isAdmin) return true;
  const role = normalizeDiscipline(user.role);
  return ['lider', 'coorden', 'geren', 'diretor', 'gestor', 'supervisor'].some((keyword) => role.includes(keyword));
}

function getHierarchyPrefix(value: any, depth: number) {
  const cleaned = String(value || '').trim();
  if (!cleaned) return '';
  const parts = cleaned.split('.').map((part) => String(part || '').trim()).filter(Boolean);
  if (parts.length <= depth) return cleaned;
  return parts.slice(0, depth).join('.');
}

function isLeafActivityCode(value: any) {
  const cleaned = String(value || '').trim();
  if (!cleaned) return false;
  return cleaned.split('.').map((part) => String(part || '').trim()).filter(Boolean).length >= 3;
}

function activityMatchesUser(activity: any, user: AuthUserLike, professionals: any[]) {
  if (isLeadershipOrAdmin(user)) return true;

  const userContract = getHierarchyPrefix(user.contrato || '', 1);
  const activityContract = getHierarchyPrefix(activity?.contratoCodigo || activity?.contractCode || activity?.osCodigo || activity?.itemCodigo || activity?.origemItem || '', 1);
  if (userContract && activityContract !== userContract) return false;

  const userDisciplines = getUserDisciplineList(user).map((item) => normalizeDiscipline(item)).filter(Boolean);
  if (!userDisciplines.length) return true;

  const activityDiscipline = normalizeDiscipline(activity?.criadoPorDisciplina || activity?.disciplina);
  if (activityDiscipline) return userDisciplines.includes(activityDiscipline);

  const disciplineEmails = new Set(
    professionals
      .filter((item) => userDisciplines.includes(normalizeDiscipline(item?.disciplina)))
      .map((item) => normalizeEmail(item?.email))
      .filter(Boolean),
  );
  const activityEmails = Array.isArray(activity?.profissionaisEmails)
    ? activity.profissionaisEmails
    : String(activity?.profissionaisEmails || '').split(' | ');

  return activityEmails.some((email: string) => disciplineEmails.has(normalizeEmail(email)));
}

function normalizeFirestoreRecord(snapshot: any) {
  const data = typeof snapshot?.data === 'function' ? snapshot.data() : snapshot;
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
  // React-written documents store the value in a "data" field (not chunked).
  // Prefer this over the GAS chunked format to avoid stale GAS overwrites.
  if (payload.data && typeof payload.data === 'object' && !Array.isArray(payload.data)) {
    return payload.data as T;
  }
  if (payload.chunked && Number(payload.chunkCount || 0) > 0) {
    const jsonText = (await readChunkedAppData(dbRef, name, Number(payload.chunkCount || 0))).join('');
    return JSON.parse(jsonText) as T;
  }
  if (typeof payload.dataJson === 'string') {
    return JSON.parse(payload.dataJson) as T;
  }
  return (Array.isArray(payload.data) ? payload.data : payload) as T;
}

export async function fetchFirebaseAppData<T = any>(name: string): Promise<T | null> {
  try {
    if (!isFirebaseConfigured()) return null;
    await ensureFirebaseAuth();
    const dbRef = getDb();
    return await getAppDataDoc<T>(dbRef, name);
  } catch (error) {
    console.error(`❌ Erro ao fetch appData/${name}:`, error);
    return null;
  }
}

async function readChunkedAppData(dbRef: Firestore, name: string, chunkCount: number) {
  const expectedIds = Array.from({ length: chunkCount }, (_, index) => String(index).padStart(5, '0'));
  const expectedSnapshots = await Promise.all(
    expectedIds.map((id) => getDoc(doc(dbRef, 'appData', name, 'chunks', id))),
  );
  const expectedValues = expectedSnapshots.map((entry) => String(entry.exists() ? entry.data()?.value || '' : ''));

  if (expectedValues.every((value) => value.length > 0)) return expectedValues;

  const chunkSnapshot = await getDocs(collection(dbRef, 'appData', name, 'chunks'));
  const valuesById = new Map(
    chunkSnapshot.docs.map((entry) => [entry.id, String(entry.data()?.value || '')]),
  );
  const mergedValues = expectedIds.map((id, index) => expectedValues[index] || valuesById.get(id) || '');

  if (mergedValues.every((value) => value.length > 0)) return mergedValues;

  return chunkSnapshot.docs
    .map((entry) => ({ id: entry.id, value: String(entry.data()?.value || '') }))
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((entry) => entry.value);
}

function isNonEmptyObject(value: any) {
  return value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length > 0;
}

function mergePublishedRegistro(...sources: any[]) {
  const out: any = {};

  sources.forEach((source) => {
    if (!source || typeof source !== 'object') return;

    Object.entries(source).forEach(([key, value]) => {
      if (Array.isArray(value)) {
        if (value.length > 0 || !Array.isArray(out[key])) out[key] = value;
        return;
      }

      if (value && typeof value === 'object') {
        if (isNonEmptyObject(value) || !isNonEmptyObject(out[key])) out[key] = value;
        return;
      }

      if (value !== undefined && value !== null && value !== '') out[key] = value;
    });
  });

  return out;
}

export async function fetchGlobalDataFromFirebase(user?: AuthUserLike): Promise<GlobalData> {
  if (!isFirebaseConfigured()) return {};

  await ensureFirebaseAuth();
  const dbRef = getDb();
  const [registro, admin, cronograma, eap] = await Promise.all([
    getAppDataDoc<any>(dbRef, 'registro'),
    getAppDataDoc<any>(dbRef, 'admin'),
    getAppDataDoc<any>(dbRef, 'cronograma'),
    getAppDataDoc<any>(dbRef, 'eap'),
  ]);

  const registroData = mergePublishedRegistro(registro, eap?.registro);
  const activitiesSnapshot = await getDocs(collection(dbRef, 'registroAtividades'));
  const liveActivitiesList = activitiesSnapshot.docs.map(normalizeFirestoreRecord);
  const activitiesList = liveActivitiesList.length > 0
    ? liveActivitiesList
    : Array.isArray(registroData.activitiesList)
      ? registroData.activitiesList.map(normalizeFirestoreRecord)
      : [];
  const professionalsByDisciplina = mergeRegistroProfessionalsByDiscipline(registroData, admin);
  const professionals = getProfessionalsForUser({ ...registroData, professionalsByDisciplina }, user || {}, admin);
  const split = splitActivitiesForUser(activitiesList, user || {}, professionals);

  const fullData: GlobalData = {
    registro: {
      ...registroData,
      professionalsByDisciplina,
      activitiesList,
      activeActivities: split.activeActivities,
      completedActivities: split.completedActivities,
      professionals,
    },
    admin: admin || undefined,
    cronograma: cronograma || undefined,
    eap: eap || undefined,
  };

  return fullData;
}

function mergePendingAuthUsersIntoAdmin(admin: any, auth: any): any {
  const authUsers: any[] = Array.isArray(auth?.users) ? auth.users
    : auth?.usersByEmail && typeof auth.usersByEmail === 'object' ? Object.values(auth.usersByEmail)
    : [];
  if (authUsers.length === 0) return admin;

  const safeAdmin = admin && typeof admin === 'object' ? admin : {};
  const adminUsers: any[] = Array.isArray(safeAdmin.users) ? safeAdmin.users
    : Array.isArray(safeAdmin.usuarios) ? safeAdmin.usuarios : [];
  const adminEmailSet = new Set(
    adminUsers.map((u: any) => String(u.email || u.id || '').toLowerCase().trim()).filter(Boolean),
  );

  const newFromAuth = authUsers.filter((u: any) => {
    const email = String(u.email || u.id || '').toLowerCase().trim();
    return email && !adminEmailSet.has(email);
  });

  if (newFromAuth.length === 0) return admin;
  return { ...safeAdmin, users: [...adminUsers, ...newFromAuth] };
}

export async function fetchBootstrapDataFromFirebase(): Promise<GlobalData> {
  try {
    if (!isFirebaseConfigured()) {
      console.warn('⚠️ Firebase não configurado - retornando dados vazios');
      return {};
    }
    await ensureFirebaseAuth();
    const dbRef = getDb();
    const [menu, registroBase, admin, auth] = await Promise.all([
      getAppDataDoc<any>(dbRef, 'menu'),
      getAppDataDoc<any>(dbRef, 'registro'),
      getAppDataDoc<any>(dbRef, 'admin'),
      getAppDataDoc<any>(dbRef, 'auth'),
    ]);
    const registro = mergePublishedRegistro(registroBase, menu?.registro || menu);
    const mergedAdmin = mergePendingAuthUsersIntoAdmin(admin, auth);

    return {
      admin: mergedAdmin || undefined,
      registro: isNonEmptyObject(registro) ? registro : undefined,
      eap: menu?.eapResumo ? {
        latestEapSheet: menu.eapResumo.latestEapSheet || '',
        latestEapDate: menu.eapResumo.latestEapDate || '',
        latestEapPublishedAt: menu.eapResumo.latestEapPublishedAt || '',
        dates: Array.isArray(menu.eapResumo.dates) ? menu.eapResumo.dates : [],
      } : undefined,
    };
  } catch (error) {
    console.error('❌ Erro ao fetch bootstrap data:', error);
    return {};
  }
}

export async function fetchEapDataFromFirebase(): Promise<any> {
  try {
    if (!isFirebaseConfigured()) return null;
    await ensureFirebaseAuth();
    const dbRef = getDb();
    const eapData = await getAppDataDoc<any>(dbRef, 'eap');
    if (!eapData) return null;

    let curvaSReajustado: any = null;
    try {
      curvaSReajustado = await getAppDataDoc<any>(dbRef, 'curvaSReajustado');
    } catch (error) {
      console.error('❌ Erro ao fetch curvaSReajustado data:', error);
    }

    return Array.isArray(curvaSReajustado?.reajustado)
      ? { ...eapData, reajustado: curvaSReajustado.reajustado }
      : eapData;
  } catch (error) {
    console.error('❌ Erro ao fetch EAP data:', error);
    return null;
  }
}

export async function fetchCronogramaDataFromFirebase(): Promise<any[] | null> {
  try {
    if (!isFirebaseConfigured()) return [];
    await ensureFirebaseAuth();
    const dbRef = getDb();

    try {
      const cronograma = await getAppDataDoc<any>(dbRef, 'cronograma');
      return Array.isArray(cronograma)
        ? cronograma
        : Array.isArray(cronograma?.cronograma)
          ? cronograma.cronograma
          : [];
    } catch (error) {
      console.error('❌ Erro ao fetch appData/cronograma:', error);
      return null;
    }
  } catch (error) {
    console.error('❌ Erro ao fetch cronograma data:', error);
    return null;
  }
}

function getProfessionalsForUser(registro: any, user: AuthUserLike, admin?: any) {
  const byDiscipline = mergeRegistroProfessionalsByDiscipline(registro, admin);
  if (!byDiscipline || typeof byDiscipline !== 'object') return Array.isArray(registro?.professionals) ? registro.professionals : [];

  const onlyThirdParty = userOnlySeesThirdParties(user, admin);
  const filterVisibleProfessionals = (items: any[]) => {
    if (!onlyThirdParty) return items;
    return items.filter((item) => String(item?.email || '').startsWith('terceirizada:'));
  };

  if (isLeadershipOrAdmin(user)) {
    return filterVisibleProfessionals(Object.values(byDiscipline).flat().filter(Boolean));
  }

  const targets = getUserDisciplineList(user).map((item) => normalizeDiscipline(item)).filter(Boolean);
  if (!targets.length) return filterVisibleProfessionals(Array.isArray(registro?.professionals) ? registro.professionals : []);

  const entries = Object.entries(byDiscipline).filter(([key, value]) => targets.includes(normalizeDiscipline(key)) && Array.isArray(value));
  return filterVisibleProfessionals(entries.flatMap((entry) => entry[1] as any[]));
}

export async function fetchRegistroDataFromFirebase(user: AuthUserLike): Promise<RegistroDataResponse> {
  try {
    if (!isFirebaseConfigured()) {
      return EMPTY_REGISTRO_RESPONSE;
    }
    
    await ensureFirebaseAuth();
    const dbRef = getDb();
    const [registroBase, menu, admin] = await Promise.all([
      getAppDataDoc<any>(dbRef, 'registro'),
      getAppDataDoc<any>(dbRef, 'menu'),
      getAppDataDoc<any>(dbRef, 'admin'),
    ]);
    const activitiesSnapshot = await getDocs(collection(dbRef, 'registroAtividades'));
    const liveActivitiesList = activitiesSnapshot.docs.map(normalizeFirestoreRecord);
    const registro = mergePublishedRegistro(registroBase, menu?.registro || menu, { activitiesList: liveActivitiesList });
    const professionalsByDisciplina = mergeRegistroProfessionalsByDiscipline(registro, admin);
    const activitiesList = liveActivitiesList.length > 0
      ? liveActivitiesList
      : Array.isArray(registro.activitiesList)
        ? registro.activitiesList.map(normalizeFirestoreRecord)
        : [];
    const professionals = getProfessionalsForUser({ ...registro, professionalsByDisciplina }, user, admin);
    const split = splitActivitiesForUser(activitiesList, user, professionals);

    return {
      success: true,
      contracts: registro.contracts || [],
      osOptions: registro.osOptions || [],
      itemOptions: registro.itemOptions || [],
      hierarchyNodes: registro.hierarchyNodes || [],
      childrenByParent: registro.childrenByParent || {},
      rootCodes: registro.rootCodes || [],
      professionalsByDisciplina,
      professionals,
      activitiesList,
      activeActivities: split.activeActivities,
      completedActivities: split.completedActivities,
    };
  } catch (error) {
    console.error('Erro ao fetch registro data:', error);
    return { ...EMPTY_REGISTRO_RESPONSE, success: false, error: 'Erro ao carregar dados do registro.' };
  }
}

export async function registerActivitiesInFirebase(user: AuthUserLike, activities: NewActivityDraftLike[]): Promise<BatchWriteResponse> {
  await ensureFirebaseAuth();
  const dbRef = getDb();
  const validActivities = activities.filter((item) => (
    (item.contratoCodigo || item.contractCode) &&
    item.osCodigo &&
    item.itemCodigo &&
    isLeafActivityCode(item.itemCodigo) &&
    item.descricao &&
    item.descricao.length >= 50 &&
    item.profissionaisEmails?.length
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
    const contractCode = getHierarchyPrefix(item.contratoCodigo || item.contractCode || '', 1);
    const osCode = getHierarchyPrefix(item.osCodigo || item.osCode || '', 2);

    rowsToSave.push({
      activityId,
      dataRegistro: nowStr,
      criadoPor: user.nome || '',
      criadoPorEmail: normalizeEmail(user.email),
      criadoPorRole: user.role || '',
      criadoPorDisciplina: user.disciplina || '',
      contratoCodigo: contractCode,
      contratoNome: item.contratoNome,
      osCodigo: osCode,
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

export async function replaceFirebaseAppData(name: string, data: any) {
  await ensureFirebaseAuth();
  const dbRef = getDb();
  // Firestore setDoc rejeita qualquer campo com valor `undefined` (mesmo aninhado em
  // arrays/objetos), o que e facil de introduzir sem querer (ex: um campo opcional
  // setado como `undefined` em vez de simplesmente omitido). JSON.stringify/parse
  // remove essas chaves de forma recursiva, sem precisar de logica propria.
  await setDoc(doc(dbRef, 'appData', name), {
    data: JSON.parse(JSON.stringify(data)),
    updatedAt: serverTimestamp(),
  });
}

export async function hashPasswordLikeAppsScript(password: string) {
  const normalized = String(password || '');
  const encoder = new TextEncoder();
  const buffer = encoder.encode(normalized);

  if (!globalThis.crypto?.subtle) {
    throw new Error('Criptografia indisponivel no navegador.');
  }

  const digest = await globalThis.crypto.subtle.digest('SHA-256', buffer);
  const bytes = Array.from(new Uint8Array(digest));
  const hex = bytes.map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return `sha256:${hex}`;
}

export async function updateFirebaseRegistroActivity(activityId: string, patch: Record<string, unknown>) {
  await ensureFirebaseAuth();
  const dbRef = getDb();
  await updateDoc(doc(dbRef, 'registroAtividades', activityId), {
    ...patch,
    updatedAt: serverTimestamp(),
  });
}

export async function fetchFirebaseCollection<T = Record<string, unknown>>(
  collectionName: string,
  equalityFilter?: { field: string; value: unknown },
): Promise<T[]> {
  await ensureFirebaseAuth();
  const dbRef = getDb();
  const collectionRef = collection(dbRef, collectionName);
  const snapshot = await getDocs(equalityFilter
    ? query(collectionRef, where(equalityFilter.field, '==', equalityFilter.value))
    : collectionRef);
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

export async function deleteFirebaseDocument(collectionName: string, id: string) {
  await ensureFirebaseAuth();
  const dbRef = getDb();
  await deleteDoc(doc(dbRef, collectionName, id));
}

export function subscribeFirebaseCollection(
  collectionName: string,
  onChange: () => void,
  onError?: (error: Error) => void
) {
  const config = readFirebaseConfig();
  if (!config) return () => {};

  try {
    const dbRef = getDb();
    return onSnapshot(
      collection(dbRef, collectionName),
      () => onChange(),
      (error) => onError?.(error as Error),
    );
  } catch (error) {
    onError?.(error as Error);
    return () => {};
  }
}
