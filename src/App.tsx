import React, { useState, useEffect, useCallback } from 'react';
import {
  ClipboardList,
  Settings,
  Users,
  AlertTriangle,
  Calendar,
  Bell,
  LogOut,
  ChevronDown,
  Menu,
  X,
  Filter,
  LayoutDashboard,
  TrendingUp,
  LayoutGrid,
  ShieldCheck,
  FileText
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import type {
  AppTabKey,
  UserAccessRecord,
  DatabaseLinkRecord,
  RoleTabPermissions,
} from './components/Administracao';
import LoginScreen, { AuthUser } from './components/LoginScreen';
import { fetchEapPublicData, fetchRegistroPublicData } from './lib/publicJson';
import { getAppVersionLabel } from './config/appVersion';

const RegistroDeAtividade = React.lazy(() => import('./components/RegistroDeAtividade'));
const ControleEngenharia = React.lazy(() => import('./components/CoordenacaoEngenharia'));
const NaoConformidades = React.lazy(() => import('./components/NaoConformidades'));
const Cronograma = React.lazy(() => import('./components/Cronograma'));
const Contrato = React.lazy(() => import('./components/CoordenacaoEngenharia/Contrato'));
const Administracao = React.lazy(() => import('./components/Administracao'));

const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyl1TyOHEuhWV-twFybZ3wQ1k7IOb4Ob-lvjNtODiK9rxgZB4TA4iVtFbRjXorhaK5G/exec';
const PUBLIC_JSON_SYNC_DELAY_MS = 15000;
const APP_VERSION_LABEL = getAppVersionLabel();

// Domínio corporativo: usuários deste domínio são aprovados automaticamente
// mas sem nenhuma aba habilitada (admin atribuirá acessos depois se necessário)
const CORPORATE_DOMAIN = '@quantaconsultoria.com';
const isCorporateEmail = (email: string) => email.toLowerCase().trim().endsWith(CORPORATE_DOMAIN);

type AppTab = 'registro' | 'controle' | 'contrato' | 'nc' | 'cronograma' | 'administracao';
const ADMIN_APP_TABS: Array<{ key: AppTabKey; label: string }> = [
  { key: 'registro', label: 'Registro de Atividade' },
  { key: 'controle', label: 'Coordenação de Engenharia' },
  { key: 'contrato', label: 'Contrato' },
  { key: 'nc', label: 'Não Conformidades' },
  { key: 'cronograma', label: 'Cronograma' },
  { key: 'administracao', label: 'Administração' },
];

interface AuthResponse {
  success: boolean;
  error?: string;
  message?: string;
  user?: any;
}

interface GenericResponse {
  success: boolean;
  error?: string;
  message?: string;
}

interface GlobalData {
  registro?: any;
  cronograma?: any;
  admin?: any;
  eap?: any;
}

interface PublicGlobalRegistroPayload {
  source?: string;
  publishedAt?: string;
  data: GlobalData & {
    admin?: {
      usersByEmail?: Record<string, any>;
      users?: any[];
      cargos?: string[];
      disciplinas?: string[];
      alocacoes?: string[];
      databaseLinks?: DatabaseLinkRecord[];
      roleTabPermissions?: RoleTabPermissions;
    };
  };
}

interface PublicEapPayload {
  source?: string;
  version?: string;
  publishedAt?: string;
  data?: any;
}

function applyUnifiedEapData(data: GlobalData, eapData: any): GlobalData {
  if (!eapData || typeof eapData !== 'object') return data;

  const next: GlobalData = {
    ...data,
    eap: eapData,
  };

  if (eapData.registro && typeof eapData.registro === 'object') {
    next.registro = {
      ...(next.registro || {}),
      contracts: Array.isArray(eapData.registro.contracts) ? eapData.registro.contracts : next.registro?.contracts,
      osOptions: Array.isArray(eapData.registro.osOptions) ? eapData.registro.osOptions : next.registro?.osOptions,
      itemOptions: Array.isArray(eapData.registro.itemOptions) ? eapData.registro.itemOptions : next.registro?.itemOptions,
      hierarchyNodes: Array.isArray(eapData.registro.hierarchyNodes) ? eapData.registro.hierarchyNodes : next.registro?.hierarchyNodes,
      childrenByParent: eapData.registro.childrenByParent && typeof eapData.registro.childrenByParent === 'object' ? eapData.registro.childrenByParent : next.registro?.childrenByParent,
      rootCodes: Array.isArray(eapData.registro.rootCodes) ? eapData.registro.rootCodes : next.registro?.rootCodes,
    };
  }

  if (Array.isArray(eapData.cronograma)) {
    next.cronograma = eapData.cronograma;
  }

  return next;
}

// Session Storage
function getStorageKey() { return 'quanta_auth_user'; }
const CACHE_DATA_KEY = 'quanta_global_data_cache';

function saveSession(user: AuthUser, remember: boolean) {
  const key = getStorageKey();
  const serialized = JSON.stringify(user);
  sessionStorage.removeItem(key);
  localStorage.removeItem(key);
  if (remember) localStorage.setItem(key, serialized);
  else sessionStorage.setItem(key, serialized);
}

function readSession(): AuthUser | null {
  const key = getStorageKey();
  try {
    const local = localStorage.getItem(key);
    if (local) return JSON.parse(local) as AuthUser;
    const session = sessionStorage.getItem(key);
    if (session) return JSON.parse(session) as AuthUser;
  } catch (error) { console.error('Erro ao ler sessão:', error); }
  return null;
}

function clearSession() {
  const key = getStorageKey();
  localStorage.removeItem(key);
  sessionStorage.removeItem(key);
  localStorage.removeItem(CACHE_DATA_KEY);
}

function saveGlobalDataCache(data: GlobalData) {
  try { localStorage.setItem(CACHE_DATA_KEY, JSON.stringify(data)); } catch (e) { }
}

function getGlobalDataCache(): GlobalData | null {
  try {
    const cached = localStorage.getItem(CACHE_DATA_KEY);
    if (cached) return JSON.parse(cached);
  } catch (e) { }
  return null;
}

async function postToAppsScript<T>(payload: Record<string, unknown>): Promise<T> {
  const response = await fetch(APPS_SCRIPT_URL, {
    method: 'POST', body: JSON.stringify(payload),
  });
  
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new Error('Servidor instável ou resposta inválida do Apps Script: ' + text.substring(0, 100));
  }
}

function assertSuccess(response: GenericResponse, fallbackMessage = 'Falha ao salvar alteração.') {
  if (!response?.success) {
    throw new Error(response?.error || response?.message || fallbackMessage);
  }
}

async function fetchInitialDataFromAppsScript(user: AuthUser): Promise<GlobalData> {
  const userTabs = Array.isArray(user.abas)
    ? user.abas.map((tab) => String(tab || '').trim()).filter(Boolean)
    : [];
  const requestedTabs = Boolean(user.isAdmin)
    ? ADMIN_APP_TABS.map((tab) => tab.key)
    : userTabs.filter((tab) => tab !== 'administracao');
  const tabs = Array.from(new Set(requestedTabs)).join(',');
  const params = new URLSearchParams({
    action: 'getInitialData',
    email: user.email || '',
    role: user.role || '',
    disciplina: user.disciplina || '',
    isAdmin: String(Boolean(user.isAdmin)),
    tabs,
  });

  const response = await fetch(`${APPS_SCRIPT_URL}?${params.toString()}`, { cache: 'no-store' });
  const payload = await response.json();

  if (!payload?.success) {
    throw new Error(payload?.error || 'Falha ao carregar dados do Apps Script.');
  }

  return payload.data || {};
}

async function fetchAdminDataFromAppsScript(): Promise<GlobalData['admin']> {
  const params = new URLSearchParams({ action: 'getAdminData' });
  const response = await fetch(`${APPS_SCRIPT_URL}?${params.toString()}`, { cache: 'no-store' });
  const payload = await response.json();

  if (payload?.success === false) {
    throw new Error(payload?.error || 'Falha ao carregar dados administrativos.');
  }

  return payload || {};
}

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function TabLoadingFallback() {
  return (
    <div className="min-h-[320px] flex items-center justify-center">
      <div className="flex items-center gap-3 rounded-xl border border-[#E5E7EB] bg-white px-5 py-4 text-[13px] font-bold text-[#757575] shadow-sm">
        <span className="h-4 w-4 rounded-full border-2 border-[#F05D28] border-t-transparent animate-spin" />
        Carregando aba...
      </div>
    </div>
  );
}

function normalizeUser(raw: any): AuthUser {
  if (!raw) throw new Error('Usuário inválido.');
  const abas = Array.isArray(raw.abas)
    ? raw.abas
    : String(raw.abas || '').split(',').map((item) => item.trim()).filter(Boolean);
  return {
    nome: raw.nome || '',
    email: raw.email || '',
    role: raw.role || '',
    disciplina: raw.disciplina || '',
    contrato: raw.contrato || '',
    status: raw.status || '',
    abas,
    isAdmin: Boolean(raw.isAdmin),
    online: Boolean(raw.online),
  };
}

function getUserInitials(nome: string) {
  return nome.split(' ').filter(Boolean).slice(0, 2).map((parte) => parte[0]?.toUpperCase() || '').join('');
}

function userHasTabAccess(user: AuthUser, tab: AppTab, roleTabPermissions: RoleTabPermissions = {}) {
  if (tab === 'administracao') return Boolean(user.isAdmin);
  const roleName = String(user.role || '').trim();
  if (!roleName) return false;
  const userTabs = Array.isArray(user.abas) ? user.abas.map(String) : [];
  const roleTabs = (roleTabPermissions[roleName] || []).map(String);
  if (tab === 'controle') {
    return userTabs.includes('controle') || roleTabs.includes('controle') || userTabs.includes('alocacoes') || roleTabs.includes('alocacoes');
  }
  if (tab === 'contrato') {
    return userTabs.includes('contrato') || roleTabs.includes('contrato') || userTabs.includes('contratos') || roleTabs.includes('contratos');
  }
  return userTabs.includes(tab) || roleTabs.includes(tab as AppTabKey);
}

function getFirstAccessibleTab(user: AuthUser, roleTabPermissions: RoleTabPermissions = {}): AppTab | null {
  if (userHasTabAccess(user, 'registro', roleTabPermissions)) return 'registro';
  if (userHasTabAccess(user, 'controle', roleTabPermissions)) return 'controle';
  if (userHasTabAccess(user, 'contrato', roleTabPermissions)) return 'contrato';
  if (userHasTabAccess(user, 'nc', roleTabPermissions)) return 'nc';
  if (userHasTabAccess(user, 'cronograma', roleTabPermissions)) return 'cronograma';
  if (userHasTabAccess(user, 'administracao', roleTabPermissions)) return 'administracao';
  return null;
}

function normalizeAdminUsers(data: GlobalData): UserAccessRecord[] {
  const admin = data.admin || {};
  const usersSource = Array.isArray(admin.users)
    ? admin.users
    : admin.usersByEmail && typeof admin.usersByEmail === 'object'
      ? Object.values(admin.usersByEmail)
      : Array.isArray(data.registro?.usersSummary)
        ? data.registro.usersSummary
        : [];

  return usersSource
    .filter((u: any) => u && (u.email || u.id))
    .map((u: any) => ({
      id: String(u.id || u.email || ''),
      nome: String(u.nome || u.name || ''),
      email: String(u.email || u.id || ''),
      online: Boolean(u.online),
      disciplina: String(u.disciplina || u.discipline || ''),
      cargo: String(u.cargo || u.role || ''),
      alocacao: String(u.alocacao || u.allocation || ''),
      contrato: String(u.contrato || u.contract || ''),
      isAdmin: Boolean(u.isAdmin),
      status: String(u.status || 'pending') as UserAccessRecord['status'],
      allowedTabs: (Array.isArray(u.allowedTabs) ? u.allowedTabs : Array.isArray(u.abas) ? u.abas : [])
        .map((tab: any) => String(tab).trim())
        .filter(Boolean) as AppTabKey[],
    }));
}

function getAdminState(data: GlobalData) {
  const admin = data.admin || {};
  return {
    usuarios: normalizeAdminUsers(data),
    disciplinas: Array.isArray(admin.disciplinas) ? admin.disciplinas : [],
    cargos: Array.isArray(admin.cargos) ? admin.cargos : [],
    alocacoes: Array.isArray(admin.alocacoes) ? admin.alocacoes : [],
    databaseLinks: Array.isArray(admin.databaseLinks) ? admin.databaseLinks : [],
    roleTabPermissions: admin.roleTabPermissions && typeof admin.roleTabPermissions === 'object' ? admin.roleTabPermissions as RoleTabPermissions : {},
  };
}

function filterRowsByContract(rows: any[], contractCode: string) {
  const target = String(contractCode || '').trim();
  if (!target) return Array.isArray(rows) ? rows : [];
  return (Array.isArray(rows) ? rows : []).filter((row: any) => {
    const code = String(row?.code || row?.codigo || '').trim();
    const rowContract = String(row?.contractCode || row?.contratoCodigo || '').trim();
    return code === target || code.startsWith(`${target}.`) || rowContract === target;
  });
}

function filterGlobalDataByContract(data: GlobalData, contractCode: string): GlobalData {
  const target = String(contractCode || '').trim();
  if (!target) return data;

  const next: GlobalData = {
    ...data,
    registro: data.registro ? { ...data.registro } : data.registro,
    admin: data.admin ? { ...data.admin } : data.admin,
    eap: data.eap ? { ...data.eap } : data.eap,
  };

  if (next.registro && typeof next.registro === 'object') {
    next.registro.contracts = (Array.isArray(next.registro.contracts) ? next.registro.contracts : []).filter((item: any) => String(item?.codigo || '').trim() === target);
    next.registro.osOptions = (Array.isArray(next.registro.osOptions) ? next.registro.osOptions : []).filter((item: any) => String(item?.contratoCodigo || '').trim() === target);
    next.registro.itemOptions = (Array.isArray(next.registro.itemOptions) ? next.registro.itemOptions : []).filter((item: any) => String(item?.osCodigo || '').trim().startsWith(`${target}.`));
    next.registro.hierarchyNodes = (Array.isArray(next.registro.hierarchyNodes) ? next.registro.hierarchyNodes : []).filter((item: any) => {
      const codigo = String(item?.codigo || '').trim();
      const contratoCodigo = String(item?.contratoCodigo || '').trim();
      return codigo === target || codigo.startsWith(`${target}.`) || contratoCodigo === target;
    });
    next.registro.rootCodes = (Array.isArray(next.registro.rootCodes) ? next.registro.rootCodes : []).filter((code: any) => String(code || '').trim() === target);
    next.registro.childrenByParent = Object.fromEntries(
      Object.entries(next.registro.childrenByParent && typeof next.registro.childrenByParent === 'object' ? next.registro.childrenByParent : {})
        .filter(([key]) => key === 'ROOT' || String(key).trim() === target || String(key).trim().startsWith(`${target}.`))
        .map(([key, value]) => [key, (Array.isArray(value) ? value : []).filter((item: any) => String(item?.codigo || '').trim() === target || String(item?.codigo || '').trim().startsWith(`${target}.`))])
    );
    next.registro.activitiesList = (Array.isArray(next.registro.activitiesList) ? next.registro.activitiesList : []).filter((item: any) => String(item?.contratoCodigo || '').trim() === target);
    next.registro.activeActivities = (Array.isArray(next.registro.activeActivities) ? next.registro.activeActivities : []).filter((item: any) => String(item?.contratoCodigo || '').trim() === target);
    next.registro.completedActivities = (Array.isArray(next.registro.completedActivities) ? next.registro.completedActivities : []).filter((item: any) => String(item?.contratoCodigo || '').trim() === target);
  }

  next.cronograma = filterRowsByContract(data.cronograma as any[], target);

  if (next.eap && typeof next.eap === 'object') {
    const eapData = next.eap.data && typeof next.eap.data === 'object' ? { ...next.eap.data } : null;
    const targetEap = eapData || next.eap;
    targetEap.registro = targetEap.registro && typeof targetEap.registro === 'object'
      ? {
          ...targetEap.registro,
          contracts: (Array.isArray(targetEap.registro.contracts) ? targetEap.registro.contracts : []).filter((item: any) => String(item?.codigo || '').trim() === target),
          osOptions: (Array.isArray(targetEap.registro.osOptions) ? targetEap.registro.osOptions : []).filter((item: any) => String(item?.contratoCodigo || '').trim() === target),
        }
      : targetEap.registro;
    targetEap.atual = filterRowsByContract(targetEap.atual as any[], target);
    if (targetEap.timeline && typeof targetEap.timeline === 'object') {
      targetEap.timeline = Object.fromEntries(Object.entries(targetEap.timeline).filter(([key]) => String(key).trim().startsWith(`${target}.`)));
    }
    if (Array.isArray(targetEap.reajustado)) {
      targetEap.reajustado = filterRowsByContract(targetEap.reajustado, target);
    }
    if (eapData) next.eap = { ...next.eap, data: targetEap };
    else next.eap = targetEap;
  }

  return next;
}

export default function App() {
  const [booting, setBooting] = useState(true);
  const [preloading, setPreloading] = useState(false);
  const [loadProgress, setLoadProgress] = useState(0);
  const [loadText, setLoadText] = useState('Iniciando conexão...');
  const [isBackgroundSyncing, setIsBackgroundSyncing] = useState(false);

  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);

  const [activeTab, setActiveTab] = React.useState<AppTab>('registro');
  const [subTab, setSubTab] = React.useState<'dashboard' | 'alocacoes' | 'curva-s' | 'matrix'>('dashboard');
  const [sidebarOpen, setSidebarOpen] = React.useState(true);
  const [showFilters, setShowFilters] = React.useState(false);

  const [globalData, setGlobalData] = useState<GlobalData>({});

  // ADMIN
  const [usuarios, setUsuarios] = useState<UserAccessRecord[]>([]);
  const [disciplinas, setDisciplinas] = useState<string[]>([]);
  const [cargos, setCargos] = useState<string[]>([]);
  const [alocacoes, setAlocacoes] = useState<string[]>([]);
  const [roleTabPermissions, setRoleTabPermissions] = useState<RoleTabPermissions>({});
  const [databaseLinks, setDatabaseLinks] = useState<DatabaseLinkRecord[]>([]);

  // Filter States (Dashboard/Tech Mock)
  const [filtrosAtivos, setFiltrosAtivos] = React.useState({ contrato: 'Todos', os: 'Todos', disciplina: 'Todos' });

  const contratos = React.useMemo(() => {
    const list = Array.isArray(globalData.registro?.contracts) ? globalData.registro.contracts : [];
    return list.map((item: any) => ({
      id: String(item.codigo || '').trim(),
      nome: String(item.nome || item.codigo || '').trim(),
    })).filter((item: any) => item.id);
  }, [globalData.registro?.contracts]);

  useEffect(() => {
    const lockedContract = String(currentUser?.contrato || '').trim();
    if (lockedContract) {
      setFiltrosAtivos((prev) => ({ ...prev, contrato: lockedContract }));
    }
  }, [currentUser?.contrato]);

  const loadGlobalEnvironment = async (user: AuthUser, isBackgroundSync = false) => {
    if (!isBackgroundSync) {
      const cachedData = getGlobalDataCache();
      if (cachedData && Object.keys(cachedData).length > 0) {
        const scopedCachedData = filterGlobalDataByContract(cachedData, user.contrato || '');
        setGlobalData(scopedCachedData);
        if (scopedCachedData.admin) {
          const adminState = getAdminState(scopedCachedData);
          setUsuarios(adminState.usuarios);
          setDisciplinas(adminState.disciplinas);
          setCargos(adminState.cargos);
          setAlocacoes(adminState.alocacoes);
          setRoleTabPermissions(adminState.roleTabPermissions);
          setDatabaseLinks(adminState.databaseLinks);
        }
        setPreloading(false); setBooting(false);
        void loadGlobalEnvironment(user, true);
        return;
      }
    }

    let progressInterval: number | undefined;
    if (!isBackgroundSync) {
      setPreloading(true); setLoadProgress(0); setLoadText('Autenticando sessão...');
      let currentProgress = 0;
      progressInterval = window.setInterval(() => {
        currentProgress += Math.floor(Math.random() * 15) + 5;
        if (currentProgress > 90) currentProgress = 90;
        setLoadProgress(currentProgress);
        if (currentProgress > 20 && currentProgress <= 45) setLoadText('Baixando dados da EAP e Cronograma...');
        else if (currentProgress > 45 && currentProgress <= 75) setLoadText('Sincronizando atividades e status...');
        else if (currentProgress > 75) setLoadText('Quase lá, estruturando as informações...');
      }, 600);
    } else {
      setIsBackgroundSyncing(true);
    }

    try {
      let fullData: GlobalData = {};
      let eapPayload: PublicEapPayload | null = null;

      try {
        const [publicPayload, publicEapPayload] = await Promise.all([
          fetchRegistroPublicData<PublicGlobalRegistroPayload>(),
          fetchEapPublicData<PublicEapPayload>().catch(() => null)
        ]);
        fullData = publicPayload.data || {};
        eapPayload = publicEapPayload;
      } catch {
        fullData = await fetchInitialDataFromAppsScript(user);
        eapPayload = await fetchEapPublicData<PublicEapPayload>().catch(() => null);
      }

      if (eapPayload?.data) {
        fullData = applyUnifiedEapData(fullData, {
          ...eapPayload.data,
          publishedAt: eapPayload.data.publishedAt || eapPayload.publishedAt,
          latestEapPublishedAt: eapPayload.data.latestEapPublishedAt || eapPayload.publishedAt,
        });
      }
      fullData = filterGlobalDataByContract(fullData, user.contrato || '');
        
        // Converte o índice por e-mail do JSON público de volta para o array esperado pelo app
        if (fullData.admin) fullData.admin.users = normalizeAdminUsers(fullData);

        setGlobalData(fullData); 
        saveGlobalDataCache(fullData);
        if (fullData.admin) {
          const adminState = getAdminState(fullData);
          setUsuarios(adminState.usuarios);
          setDisciplinas(adminState.disciplinas);
          setCargos(adminState.cargos);
          setAlocacoes(adminState.alocacoes);
          setRoleTabPermissions(adminState.roleTabPermissions);
          setDatabaseLinks(adminState.databaseLinks);
        }
      if (!isBackgroundSync && progressInterval) {
        clearInterval(progressInterval); setLoadProgress(100); setLoadText('Tudo pronto!');
        setTimeout(() => { setPreloading(false); setBooting(false); }, 500);
      }
    } catch (error) {
      if (!isBackgroundSync && progressInterval) {
        clearInterval(progressInterval); setLoadText('Ocorreu um erro ao carregar. Tente atualizar a página.');
        setTimeout(() => { setPreloading(false); setBooting(false); }, 2000);
      }
    } finally {
      if (isBackgroundSync) setIsBackgroundSyncing(false);
    }
  };

  useEffect(() => {
    const savedUser = readSession();
    if (savedUser) { setCurrentUser(savedUser); void loadGlobalEnvironment(savedUser); }
    else { setBooting(false); }
  }, []);

  useEffect(() => {
    if (!currentUser) return;
    if (!userHasTabAccess(currentUser, activeTab, roleTabPermissions)) {
      if (userHasTabAccess(currentUser, 'registro', roleTabPermissions)) setActiveTab('registro');
      else if (userHasTabAccess(currentUser, 'controle', roleTabPermissions)) setActiveTab('controle');
      else if (userHasTabAccess(currentUser, 'contrato', roleTabPermissions)) setActiveTab('contrato');
      else if (userHasTabAccess(currentUser, 'nc', roleTabPermissions)) setActiveTab('nc');
      else if (userHasTabAccess(currentUser, 'cronograma', roleTabPermissions)) setActiveTab('cronograma');
      else if (userHasTabAccess(currentUser, 'administracao', roleTabPermissions)) setActiveTab('administracao');
    }
  }, [currentUser, activeTab, roleTabPermissions]);

  useEffect(() => {
    if (!currentUser) return;
    const sendHeartbeat = async () => { try { await postToAppsScript<GenericResponse>({ action: 'heartbeat', email: currentUser.email }); } catch (e) { } };
    void sendHeartbeat();
    const interval = window.setInterval(sendHeartbeat, 60000);
    return () => window.clearInterval(interval);
  }, [currentUser]);

  const loadAdminData = useCallback(async () => {
    if (!currentUser) return;
    setIsBackgroundSyncing(true);
    try {
      const adminData = await fetchAdminDataFromAppsScript();
      const fullData: GlobalData = { admin: adminData };
      if (fullData.admin) fullData.admin.users = normalizeAdminUsers(fullData);

      setGlobalData((prev) => {
        const next = {
          ...prev,
          admin: fullData.admin || prev.admin,
          registro: fullData.registro || prev.registro,
          cronograma: fullData.cronograma || prev.cronograma,
        };
        saveGlobalDataCache(next);
        return next;
      });

      if (fullData.admin) {
        const adminState = getAdminState(fullData);
        setUsuarios(adminState.usuarios);
        setDisciplinas(adminState.disciplinas);
        setCargos(adminState.cargos);
        setAlocacoes(adminState.alocacoes);
        setRoleTabPermissions(adminState.roleTabPermissions);
        setDatabaseLinks(adminState.databaseLinks);
      }
    } finally {
      setIsBackgroundSyncing(false);
    }
  }, [currentUser]);

  const handleLogin = async (email: string, password: string, rememberMe: boolean) => {
    const response = await postToAppsScript<AuthResponse>({ action: 'authUser', email, password });
    if (!response.success || !response.user) throw new Error(response.error || 'E-mail ou senha incorretos.');

    const user = normalizeUser(response.user);
    saveSession(user, rememberMe);
    setCurrentUser(user);
    await loadGlobalEnvironment(user, false);

    if (Boolean(user.isAdmin)) setActiveTab('administracao');
    else if (user.abas.includes('registro')) setActiveTab('registro');
    else if (user.abas.includes('controle')) setActiveTab('controle');
    else if (user.abas.includes('contrato') || user.abas.includes('contratos')) setActiveTab('contrato');
  };

  const handleLogout = () => { clearSession(); setCurrentUser(null); setGlobalData({}); setRoleTabPermissions({}); };

  const handleRegister = async (name: string, email: string, password: string) => {
    // Apps Script registra o usuário e envia e-mail de confirmação
    const response = await postToAppsScript<GenericResponse>({ action: 'registerUser', name, email, password });
    if (!response.success) throw new Error(response.error || 'Falha ao registrar.');

    return response.message || (isCorporateEmail(email)
      ? 'Acesso liberado! Entre com suas credenciais.'
      : 'Cadastro enviado. Aguarde aprovação do administrador.');
  };

  const handleForgotPassword = async (email: string) => {
    const response = await postToAppsScript<GenericResponse>({ action: 'forgotPassword', email });
    if (!response.success) throw new Error(response.error || 'Falha ao solicitar recuperação.');
    return 'Código enviado (se e-mail existir).';
  };

  const handleResetPassword = async (email: string, code: string, newPassword: string) => {
    const response = await postToAppsScript<GenericResponse>({ action: 'resetPassword', email, code, newPassword });
    if (!response.success) throw new Error(response.error || 'Falha ao redefinir.');
    return response.message || 'Senha redefinida.';
  };

  // Admin Hooks (abbreviated wrapper functions saving directly)
  const persistUser = useCallback(async (user: UserAccessRecord) => {
    setUsuarios((prev) => prev.map((item) => item.id === user.id ? user : item));
    try {
      const response = await postToAppsScript<GenericResponse>({ action: 'saveUserAccess', email: user.email, name: user.nome, role: user.cargo, discipline: user.disciplina, allocation: user.alocacao, contract: user.contrato, isAdmin: user.isAdmin, status: user.status, allowedTabs: user.allowedTabs });
      assertSuccess(response);
      await loadAdminData();
    } catch (error) {
      await loadAdminData();
      throw error;
    }
  }, [loadAdminData]);

  const saveConfigOptions = useCallback(async (nextCargos: string[], nextDisciplinas: string[], nextAlocacoes: string[]) => {
    setCargos(nextCargos);
    setDisciplinas(nextDisciplinas);
    setAlocacoes(nextAlocacoes);
    try {
      const response = await postToAppsScript<GenericResponse>({ action: 'saveConfigOptions', cargos: nextCargos, disciplinas: nextDisciplinas, alocacoes: nextAlocacoes });
      assertSuccess(response);
      await loadAdminData();
    } catch (error) {
      await loadAdminData();
      throw error;
    }
  }, [loadAdminData]);

  const saveRoleTabPermissions = useCallback(async (nextPermissions: RoleTabPermissions) => {
    setRoleTabPermissions(nextPermissions);
    try {
      const response = await postToAppsScript<GenericResponse>({ action: 'saveRoleTabPermissions', roleTabPermissions: nextPermissions });
      assertSuccess(response);
      await loadAdminData();
    } catch (error) {
      await loadAdminData();
      throw error;
    }
  }, [loadAdminData]);

  const addDisciplina = useCallback(async (value: string) => {
    const item = value.trim();
    if (!item) return;
    await saveConfigOptions(cargos, Array.from(new Set([...disciplinas, item])), alocacoes);
  }, [alocacoes, cargos, disciplinas, saveConfigOptions]);

  const removeDisciplina = useCallback(async (value: string) => {
    await saveConfigOptions(cargos, disciplinas.filter((item) => item !== value), alocacoes);
  }, [alocacoes, cargos, disciplinas, saveConfigOptions]);

  const addCargo = useCallback(async (value: string) => {
    const item = value.trim();
    if (!item) return;
    await saveConfigOptions(Array.from(new Set([...cargos, item])), disciplinas, alocacoes);
    const visibleTabs = ADMIN_APP_TABS.filter((tab) => tab.key !== 'administracao').map((tab) => tab.key);
    await saveRoleTabPermissions({
      ...roleTabPermissions,
      [item]: visibleTabs,
    });
  }, [alocacoes, cargos, disciplinas, roleTabPermissions, saveConfigOptions, saveRoleTabPermissions]);

  const addAlocacao = useCallback(async (value: string) => {
    const item = value.trim();
    if (!item) return;
    await saveConfigOptions(cargos, disciplinas, Array.from(new Set([...alocacoes, item])));
  }, [alocacoes, cargos, disciplinas, saveConfigOptions]);

  const removeAlocacao = useCallback(async (value: string) => {
    await saveConfigOptions(cargos, disciplinas, alocacoes.filter((item) => item !== value));
  }, [alocacoes, cargos, disciplinas, saveConfigOptions]);

  const removeCargo = useCallback(async (value: string) => {
    const nextPermissions = { ...roleTabPermissions };
    delete nextPermissions[value];
    const configResponse = await postToAppsScript<GenericResponse>({
      action: 'saveConfigOptions',
      cargos: cargos.filter((item) => item !== value),
      disciplinas,
      alocacoes,
    });
    assertSuccess(configResponse);
    const permissionsResponse = await postToAppsScript<GenericResponse>({ action: 'saveRoleTabPermissions', roleTabPermissions: nextPermissions });
    assertSuccess(permissionsResponse);
    setCargos((prev) => prev.filter((item) => item !== value));
    setRoleTabPermissions(nextPermissions);
    await loadAdminData();
  }, [alocacoes, cargos, disciplinas, loadAdminData, roleTabPermissions]);

  const toggleRoleTabPermission = useCallback(async (cargo: string, tab: AppTabKey) => {
    const currentTabs = roleTabPermissions[cargo] || ADMIN_APP_TABS.filter((item) => item.key !== 'administracao').map((item) => item.key);
    const nextTabs = currentTabs.includes(tab)
      ? currentTabs.filter((item) => item !== tab)
      : [...currentTabs, tab];

    await saveRoleTabPermissions({
      ...roleTabPermissions,
      [cargo]: nextTabs,
    });
  }, [roleTabPermissions, saveRoleTabPermissions]);

  const saveDatabaseLink = useCallback(async (payload: Omit<DatabaseLinkRecord, 'id'> & { id?: string }) => {
    const response = await postToAppsScript<GenericResponse>({ action: 'saveDatabaseLink', ...payload });
    assertSuccess(response);
    await loadAdminData();
  }, [loadAdminData]);

  const deleteDatabaseLink = useCallback(async (id: string) => {
    const response = await postToAppsScript<GenericResponse>({ action: 'deleteDatabaseLink', id });
    assertSuccess(response);
    setDatabaseLinks((prev) => prev.filter((item) => item.id !== id));
    await loadAdminData();
  }, [loadAdminData]);

  const acceptUser = useCallback(async (userId: string) => {
    const user = usuarios.find((item) => item.id === userId);
    if (!user) return;
    const response = await postToAppsScript<GenericResponse>({
      action: 'approveUser',
      email: user.email,
      name: user.nome,
      role: user.cargo,
      discipline: user.disciplina,
      allocation: user.alocacao,
      contract: user.contrato,
      isAdmin: user.isAdmin,
      allowedTabs: user.allowedTabs,
    });
    assertSuccess(response);
    setUsuarios((prev) => prev.map((item) => item.id === userId ? { ...item, status: 'approved' } : item));
    await loadAdminData();
  }, [loadAdminData, usuarios]);

  const blockUser = useCallback(async (userId: string) => {
    const user = usuarios.find((item) => item.id === userId);
    if (!user) return;
    const response = await postToAppsScript<GenericResponse>({ action: 'blockUser', email: user.email });
    assertSuccess(response);
    setUsuarios((prev) => prev.map((item) => item.id === userId ? { ...item, status: 'blocked', online: false } : item));
    await loadAdminData();
  }, [loadAdminData, usuarios]);

  const resetUserPassword = useCallback(async (user: UserAccessRecord) => {
    const response = await postToAppsScript<GenericResponse>({ action: 'adminResetPassword', email: user.email });
    assertSuccess(response, 'Falha ao redefinir senha.');
  }, []);

  if (booting && !preloading) return null;

  if (!currentUser && !preloading) {
    return <LoginScreen onLogin={handleLogin} onRegister={handleRegister} onForgotPassword={handleForgotPassword} onResetPassword={handleResetPassword} />;
  }

  if (preloading) {
    return (
      <div className="min-h-screen bg-[#F8F9FA] flex items-center justify-center font-['Montserrat'] flex-col px-6">
        <img src="https://i.imgur.com/Net1yEQ.png" alt="Logo" className="h-12 object-contain mb-8 animate-pulse" referrerPolicy="no-referrer" />
        <div className="w-full max-w-[420px] bg-white rounded-3xl shadow-sm border border-[#E5E7EB] p-8 text-center">
          <h2 className="text-[20px] font-bold text-[#2D2D2D] mb-1">Preparando ambiente</h2>
          <p className="text-[13px] font-medium text-[#757575] mb-8 h-4">{loadText}</p>
          <div className="relative w-full h-3 bg-[#F3F4F6] rounded-full overflow-hidden">
            <div className="absolute top-0 left-0 h-full bg-[#F05D28] transition-all duration-[600ms] rounded-full" style={{ width: `${loadProgress}%` }} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-full bg-[#F8F9FA] overflow-hidden font-['Montserrat']">
      <AnimatePresence mode="wait">
        {sidebarOpen && (
          <motion.aside initial={{ width: 0, opacity: 0 }} animate={{ width: 260, opacity: 1 }} exit={{ width: 0, opacity: 0 }} transition={{ type: 'spring', damping: 20, stiffness: 100 }} className="h-full bg-white border-r border-[#E5E7EB] flex flex-col shrink-0 overflow-hidden">
            <div className="p-8 flex items-center justify-between">
              <img src="https://i.imgur.com/Net1yEQ.png" alt="Logo" className="h-10 object-contain" referrerPolicy="no-referrer" />
            </div>
            <div className="px-6 mt-4"><span className="text-[11px] font-medium text-[#757575] uppercase tracking-[1px]">MENU</span></div>
            <nav className="px-4 mt-2 flex-1 space-y-1 overflow-y-auto">
              {currentUser && userHasTabAccess(currentUser, 'registro', roleTabPermissions) && <NavItem icon={<ClipboardList size={20} />} label="Registro de Atividade" active={activeTab === 'registro'} onClick={() => setActiveTab('registro')} />}
              {currentUser && userHasTabAccess(currentUser, 'controle', roleTabPermissions) && <NavItem icon={<Settings size={20} />} label="Coordenação de Engenharia" active={activeTab === 'controle'} onClick={() => setActiveTab('controle')} />}
              {currentUser && userHasTabAccess(currentUser, 'contrato', roleTabPermissions) && <NavItem icon={<FileText size={20} />} label="Contrato" active={activeTab === 'contrato'} onClick={() => setActiveTab('contrato')} />}
              {currentUser && userHasTabAccess(currentUser, 'nc', roleTabPermissions) && <NavItem icon={<AlertTriangle size={20} />} label="Não Conformidades" active={activeTab === 'nc'} onClick={() => setActiveTab('nc')} />}
              {currentUser && userHasTabAccess(currentUser, 'cronograma', roleTabPermissions) && <NavItem icon={<Calendar size={20} />} label="Cronograma" active={activeTab === 'cronograma'} onClick={() => setActiveTab('cronograma')} />}
              {currentUser && currentUser.isAdmin && <NavItem icon={<ShieldCheck size={20} />} label="Administração" active={activeTab === 'administracao'} onClick={() => setActiveTab('administracao')} />}
            </nav>
            <div className="p-6 border-t border-[#E5E7EB] space-y-4">
              <div className="bg-[#F9FAFB] p-3 rounded-xl flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-[#F05D28]/10 flex items-center justify-center text-[#F05D28] font-bold text-sm">
                  {currentUser ? getUserInitials(currentUser.nome) : 'US'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-[#2D2D2D] truncate">{currentUser?.nome}</p>
                  <p className="text-xs text-[#757575] truncate">{currentUser?.disciplina || 'Sem disciplina'}</p>
                  <p className="text-xs text-[#757575] truncate">{currentUser?.role}</p>
                </div>
              </div>
              <p className="px-1 text-[10px] font-bold uppercase tracking-[1.5px] text-[#9CA3AF]">{APP_VERSION_LABEL}</p>
              <button onClick={handleLogout} className="flex items-center gap-3 px-3 py-2 text-[#757575] hover:text-[#EF4444] transition-colors w-full text-sm font-medium"><LogOut size={18} /> Sair</button>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="h-24 bg-white border-b border-[#E5E7EB] flex items-center justify-between px-8 shrink-0 relative">
          <div className="flex items-center gap-6">
            <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-2 text-[#757575] hover:bg-[#F4F5F7] rounded-lg transition-colors"><Menu size={24} /></button>
            <div className="flex flex-col shrink-0">
              <div className="flex items-center gap-3">
                <h2 className="text-[18px] font-bold text-[#2D2D2D] leading-tight">
                  {activeTab === 'registro' ? 'Registro de Atividade' : activeTab === 'controle' ? 'Coordenação de Engenharia' : activeTab === 'contrato' ? 'Contrato' : activeTab === 'nc' ? 'Não Conformidades' : activeTab === 'administracao' ? 'Administração' : 'Cronograma'}
                </h2>
                {isBackgroundSyncing && (
                  <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-[#EFF6FF] text-[#1D4ED8] text-[10px] font-bold">
                    <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" /></svg>
                    Sincronizando...
                  </span>
                )}
              </div>
              <span className="text-[10px] font-medium text-[#757575] uppercase tracking-widest mt-1">EcoQuanta · Ecossistema Quanta</span>
            </div>
          </div>

          {activeTab === 'controle' && (
            <div className="flex items-center gap-1 bg-[#F8F9FA] p-1 rounded-xl border border-[#E5E7EB]">
              <HeaderTab active={subTab === 'dashboard'} onClick={() => setSubTab('dashboard')} icon={<LayoutDashboard size={16} />} label="Dashboard" />
              <HeaderTab active={subTab === 'alocacoes'} onClick={() => setSubTab('alocacoes')} icon={<Users size={16} />} label="Alocações" />
              <HeaderTab active={subTab === 'curva-s'} onClick={() => setSubTab('curva-s')} icon={<TrendingUp size={16} />} label="Curva S" />
              <HeaderTab active={subTab === 'matrix'} onClick={() => setSubTab('matrix')} icon={<LayoutGrid size={16} />} label="Matriz" />
            </div>
          )}

          <div className="flex items-center gap-4">
            <button onClick={() => setShowFilters(!showFilters)} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all border ${showFilters ? 'bg-[#F05D28] text-white border-[#F05D28]' : 'bg-white text-[#757575] border-[#E5E7EB] hover:bg-[#F9FAFB]'}`}><Filter size={18} /> Filtros</button>
            {showFilters && (
              <div className="absolute top-[calc(100%-10px)] right-8 w-80 bg-white border border-[#E5E7EB] rounded-2xl shadow-2xl p-6 z-50 animate-in fade-in slide-in-from-top-2 duration-200">
                <div className="space-y-4">
                  <select className="w-full h-10 px-3 bg-[#F8F9FA] border rounded-lg text-xs font-bold disabled:opacity-70" value={String(currentUser?.contrato || '').trim() || filtrosAtivos.contrato} disabled={Boolean(String(currentUser?.contrato || '').trim())} onChange={(e) => setFiltrosAtivos({ ...filtrosAtivos, contrato: e.target.value })}>
                    {!String(currentUser?.contrato || '').trim() && <option value="Todos">Todos os Contratos</option>}{contratos.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                  </select>
                </div>
                <button onClick={() => setShowFilters(false)} className="w-full mt-6 py-2.5 bg-[#F05D28] text-white rounded-xl text-xs font-bold uppercase hover:bg-[#D94D1A] transition-colors shadow-lg">Aplicar Filtros</button>
              </div>
            )}
            <div className="w-10 h-10 rounded-full border border-[#E5E7EB] bg-white flex items-center justify-center text-[#F05D28] font-bold text-sm hidden sm:flex">
              {currentUser ? getUserInitials(currentUser.nome) : ''}
            </div>
          </div>
        </header>

        <main className={`flex-1 overflow-y-auto p-8 ${activeTab === 'registro' ? 'bg-white' : 'bg-[#F8F9FA]'}`}>
          <React.Suspense fallback={<TabLoadingFallback />}>
            {activeTab === 'registro' && currentUser && userHasTabAccess(currentUser, 'registro', roleTabPermissions) && <RegistroDeAtividade currentUser={currentUser} preloadedData={globalData.registro} />}
            {activeTab === 'controle' && currentUser && userHasTabAccess(currentUser, 'controle', roleTabPermissions) && <ControleEngenharia filtrosAtivos={filtrosAtivos} subTab={subTab} onSubTabChange={setSubTab} preloadedData={globalData} lockedContractCode={currentUser.contrato} />}
            {activeTab === 'contrato' && currentUser && userHasTabAccess(currentUser, 'contrato', roleTabPermissions) && <Contrato preloadedData={globalData} activeContractCode={String(currentUser.contrato || '').trim() || filtrosAtivos.contrato} lockedContractCode={currentUser.contrato} />}
            {activeTab === 'nc' && currentUser && userHasTabAccess(currentUser, 'nc', roleTabPermissions) && <NaoConformidades />}
            {activeTab === 'cronograma' && currentUser && userHasTabAccess(currentUser, 'cronograma', roleTabPermissions) && <Cronograma preloadedData={globalData} lockedContractCode={currentUser.contrato} />}
            {activeTab === 'administracao' && currentUser?.isAdmin && (
              <Administracao
                usuarios={usuarios} disciplinas={disciplinas} cargos={cargos} alocacoes={alocacoes} contratos={contratos} roleTabPermissions={roleTabPermissions} databaseLinks={databaseLinks} appTabs={ADMIN_APP_TABS} onRefresh={loadAdminData}
                onUpdateUsuario={async (id, patch) => { const u = usuarios.find(x => x.id === id); if (u) await persistUser({ ...u, ...patch }); }}
                onToggleAdmin={async (id, checked) => { const u = usuarios.find(x => x.id === id); if (u) await persistUser({ ...u, isAdmin: checked }); }}
                onToggleTabPermission={async (id, tab) => { const u = usuarios.find(x => x.id === id); if (u) { const tabs = u.allowedTabs.includes(tab) ? u.allowedTabs.filter(t => t !== tab) : [...u.allowedTabs, tab]; await persistUser({ ...u, allowedTabs: tabs }); } }}
                onAcceptUser={acceptUser} onBlockUser={blockUser} onPasswordReset={resetUserPassword} onAddDisciplina={addDisciplina} onRemoveDisciplina={removeDisciplina} onAddCargo={addCargo} onRemoveCargo={removeCargo} onAddAlocacao={addAlocacao} onRemoveAlocacao={removeAlocacao} onToggleRoleTabPermission={toggleRoleTabPermission} onSaveDatabaseLink={saveDatabaseLink} onDeleteDatabaseLink={deleteDatabaseLink}
              />
            )}
          </React.Suspense>
        </main>
      </div>
    </div>
  );
}

function NavItem({ icon, label, active, onClick }: { icon: React.ReactNode; label: string; active?: boolean; onClick?: () => void; }) {
  return (
    <div onClick={onClick} className={`flex items-center gap-3 px-4 py-3 rounded-xl cursor-pointer transition-all ${active ? 'bg-[#F05D28]/10 text-[#F05D28] text-[14px] font-bold' : 'text-[#757575] text-[14px] font-medium hover:bg-[#F4F5F7] hover:text-[#2D2D2D]'}`}>
      {icon} <span>{label}</span>
    </div>
  );
}

function HeaderTab({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string; }) {
  return (
    <button onClick={onClick} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-[13px] font-bold transition-all ${active ? 'bg-[#F05D28] text-white shadow-sm' : 'text-[#757575] hover:bg-[#F0F1F2] hover:text-[#2D2D2D]'}`}>
      {icon} {label}
    </button>
  );
}

