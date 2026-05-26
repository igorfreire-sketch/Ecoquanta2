import React, { useState, useEffect, useCallback } from 'react';
import {
  ClipboardList,
  Settings,
  Users,
  AlertTriangle,
  Calendar,
  LogOut,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  X,
  LayoutDashboard,
  TrendingUp,
  LayoutGrid,
  ShieldCheck,
  FileText,
  Clipboard,
  CheckSquare,
  Filter
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import type {
  AppTabKey,
  DisciplineSettingRecord,
  UserAccessRecord,
  DatabaseLinkRecord,
  TerceirizadaRecord,
  RoleTabPermissions,
} from './components/Administracao';
import LoginScreen, { AuthUser } from './components/LoginScreen';
import { getAppVersionLabel } from './config/appVersion';
import {
  fetchBootstrapDataFromFirebase,
  fetchCronogramaDataFromFirebase,
  fetchEapDataFromFirebase,
  fetchFirebaseCollection,
  fetchRegistroDataFromFirebase,
  isFirebaseConfigured,
  upsertFirebaseAppData,
} from './lib/firebaseDb';

const Atividades = React.lazy(() => import('./components/Atividades'));
const ControleEngenharia = React.lazy(() => import('./components/CoordenacaoEngenharia'));
const Planejamento = React.lazy(() => import('./components/CoordenacaoEngenharia/DashboardEngenharia'));
const Alertas = React.lazy(() => import('./components/CoordenacaoEngenharia/Alertas'));
const NaoConformidades = React.lazy(() => import('./components/NaoConformidade2/Conformidade'));
const Cronograma = React.lazy(() => import('./components/Cronograma'));
const Contrato = React.lazy(() => import('./components/CoordenacaoEngenharia/Contrato'));
const Administracao = React.lazy(() => import('./components/Administracao'));

const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyl1TyOHEuhWV-twFybZ3wQ1k7IOb4Ob-lvjNtODiK9rxgZB4TA4iVtFbRjXorhaK5G/exec';
const APP_VERSION_LABEL = getAppVersionLabel();

// Domínio corporativo: usuários deste domínio são aprovados automaticamente
// mas sem nenhuma aba habilitada (admin atribuirá acessos depois se necessário)
const CORPORATE_DOMAIN = '@quantaconsultoria.com';
const isCorporateEmail = (email: string) => email.toLowerCase().trim().endsWith(CORPORATE_DOMAIN);

function normalizeUserText(value?: string) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
}

function shouldLockUserToContract(user?: AuthUser | null) {
  if (!user) return false;
  if (user.isAdmin) return false;

  const role = normalizeUserText(user.role);
  const leadershipKeywords = ['lider', 'coorden', 'geren', 'diretor', 'gestor', 'supervisor'];
  if (leadershipKeywords.some((keyword) => role.includes(keyword))) return false;

  return Boolean(String(user.contrato || '').trim());
}

type AppTab = 'registro' | 'controle' | 'planejamento' | 'contrato' | 'nc2' | 'administracao';
type AreaTecnicaSubTab = 'atividades' | 'cronograma';
type ControleSubTab = 'profissionais' | 'dashboard' | 'alocacoes' | 'curva-s' | 'planejamento' | 'alertas' | 'cronograma';
type PlanejamentoSubTab = 'dashboard' | 'alertas' | 'cronograma';
type Nc2SubTab = 'dashboard' | 'preenchimento' | 'revisoes' | 'terceirizadas' | 'cronograma';
type ContratoSubTab = 'dashboard' | 'interferencias' | 'prioridades' | 'cronograma';
type AdminSubTab = 'usuarios' | 'terceirizadas' | 'gerenciamento';
const ADMIN_APP_TABS: Array<{ key: AppTabKey; label: string }> = [
  { key: 'registro', label: 'Área Técnica' },
  { key: 'nc2', label: 'Conformidade' },
  { key: 'controle', label: 'Coordenação de Engenharia' },
  { key: 'planejamento', label: 'Planejamento' },
  { key: 'contrato', label: 'Contrato' },
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
  planningTodos?: any[];
  contractPriorities?: any[];
  contractInterferences?: any[];
  resolvedAlerts?: any[];
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
      terceirizadas?: TerceirizadaRecord[];
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

interface PublicModulePayload {
  source?: string;
  publishedAt?: string;
  data?: Partial<GlobalData>;
}

function normalizeEapCode(value: any) {
  return String(value || '').trim();
}

function getEapRows(eapData: any) {
  return Array.isArray(eapData?.atual) ? eapData.atual.filter((row: any) => normalizeEapCode(row?.[0])) : [];
}

function isEapOsName(value: any) {
  const text = normalizeEapCode(value);
  if (!text) return false;
  return /^_?OS(?=$|[\s_\-.0-9A-Za-zÀ-ÿ])/i.test(text);
}

function buildRegistroDataFromEapRows(eapData: any) {
  const rows = getEapRows(eapData);
  const contracts: any[] = [];
  const osOptions: any[] = [];
  const itemOptions: any[] = [];
  const hierarchyNodes: any[] = [];
  const rootCodes: string[] = [];
  const childrenByParent: Record<string, any[]> = {};
  const seen = new Set<string>();

  const addNode = (node: any) => {
    if (!node.codigo || seen.has(node.codigo)) return;
    seen.add(node.codigo);
    hierarchyNodes.push(node);
    const parent = node.parentCodigo || 'ROOT';
    if (!childrenByParent[parent]) childrenByParent[parent] = [];
    childrenByParent[parent].push(node);
  };

  rows.forEach((row: any[]) => {
    const codigo = normalizeEapCode(row?.[0]);
    const nome = normalizeEapCode(row?.[1] || codigo);
    if (!codigo) return;

    const level = (codigo.match(/\./g) || []).length;
    if (level === 0) {
      contracts.push({ codigo, nome });
      rootCodes.push(codigo);
      addNode({ codigo, nome, tipo: 'contrato', nivel: 0, parentCodigo: '', contratoCodigo: codigo, osCodigo: '' });
    }
  });

  rows.forEach((row: any[]) => {
    const codigo = normalizeEapCode(row?.[0]);
    const nome = normalizeEapCode(row?.[1] || codigo);
    if (!codigo) return;

    const parts = codigo.split('.');
    const level = parts.length - 1;
    if (level === 1 && isEapOsName(nome)) {
      const contratoCodigo = parts[0];
      osOptions.push({ codigo, nome, contratoCodigo });
      addNode({ codigo, nome, tipo: 'os', nivel: level, parentCodigo: contratoCodigo, contratoCodigo, osCodigo: codigo });
    }
  });

  const osCodes = new Set(osOptions.map((os) => os.codigo));
  rows.forEach((row: any[]) => {
    const codigo = normalizeEapCode(row?.[0]);
    const nome = normalizeEapCode(row?.[1] || codigo);
    if (!codigo) return;

    const osCodigo = Array.from(osCodes)
      .filter((candidate) => codigo.startsWith(`${candidate}.`))
      .sort((a, b) => b.length - a.length)[0];
    if (!osCodigo) return;

    const contratoCodigo = osCodigo.split('.')[0] || '';
    itemOptions.push({ codigo, nome, osCodigo });
    addNode({
      codigo,
      nome,
      tipo: 'item',
      nivel: (codigo.match(/\./g) || []).length,
      parentCodigo: osCodigo,
      contratoCodigo,
      osCodigo,
    });
  });

  return { contracts, osOptions, itemOptions, hierarchyNodes, childrenByParent, rootCodes };
}

function hasRegistroHierarchy(registro: any) {
  return Array.isArray(registro?.contracts) && registro.contracts.length > 0
    && Array.isArray(registro?.osOptions) && registro.osOptions.length > 0
    && Array.isArray(registro?.itemOptions) && registro.itemOptions.length > 0;
}

function hasNonEmptyArray(value: any) {
  return Array.isArray(value) && value.length > 0;
}

function normalizeDisciplineSetting(value: any): DisciplineSettingRecord | null {
  if (typeof value === 'string') {
    const nome = value.trim();
    return nome ? { nome, showInCharts: true } : null;
  }

  if (!value || typeof value !== 'object') return null;
  const nome = String((value as any).nome || (value as any).name || '').trim();
  if (!nome) return null;

  return {
    nome,
    showInCharts: (value as any).showInCharts !== false,
  };
}

function normalizeDisciplineSettings(value: any): DisciplineSettingRecord[] {
  const source = Array.isArray(value) ? value : [];
  const byName = new Map<string, DisciplineSettingRecord>();

  source.forEach((entry) => {
    const normalized = normalizeDisciplineSetting(entry);
    if (!normalized) return;
    byName.set(normalized.nome, normalized);
  });

  return Array.from(byName.values());
}

function getDisciplineNamesFromSettings(settings: DisciplineSettingRecord[]) {
  return settings.map((item) => item.nome).filter(Boolean);
}

function isNonEmptyObject(value: any) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length > 0;
}

function mergeModulePayload(baseModule: any, incomingModule: any) {
  if (!incomingModule || typeof incomingModule !== 'object') return baseModule;
  if (!baseModule || typeof baseModule !== 'object') return incomingModule;

  const baseRecord = baseModule as Record<string, any>;
  const next: Record<string, any> = { ...baseRecord };

  Object.entries(incomingModule).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      if (value.length > 0 || !Array.isArray(baseRecord[key])) next[key] = value;
      return;
    }

    if (isNonEmptyObject(value)) {
      const currentValue = baseRecord[key];
      next[key] = isNonEmptyObject(currentValue)
        ? { ...(currentValue as Record<string, any>), ...(value as Record<string, any>) }
        : value;
      return;
    }

    if (value !== undefined && value !== null && value !== '') {
      next[key] = value;
    }
  });

  return next;
}

function mergeGlobalData(base: GlobalData, incoming?: Partial<GlobalData> | null): GlobalData {
  if (!incoming || typeof incoming !== 'object') return base;
  const baseActivities = Array.isArray(base.registro?.activitiesList) ? base.registro.activitiesList : [];
  const incomingActivities = Array.isArray(incoming.registro?.activitiesList) ? incoming.registro.activitiesList : [];
  const mergedRegistro = incoming.registro ? mergeModulePayload(base.registro, incoming.registro) : base.registro;

  if (mergedRegistro && baseActivities.length > incomingActivities.length) {
    mergedRegistro.activitiesList = baseActivities;
  }

  return {
    ...base,
    ...incoming,
    registro: mergedRegistro,
    admin: incoming.admin ? mergeModulePayload(base.admin, incoming.admin) : base.admin,
    eap: incoming.eap ? mergeModulePayload(base.eap, incoming.eap) : base.eap,
  };
}

function hasAnyGlobalData(data: GlobalData) {
  return Boolean(data.registro || data.admin || data.cronograma || data.eap);
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
      contracts: hasNonEmptyArray(eapData.registro.contracts) ? eapData.registro.contracts : next.registro?.contracts,
      osOptions: hasNonEmptyArray(eapData.registro.osOptions) ? eapData.registro.osOptions : next.registro?.osOptions,
      itemOptions: hasNonEmptyArray(eapData.registro.itemOptions) ? eapData.registro.itemOptions : next.registro?.itemOptions,
      hierarchyNodes: hasNonEmptyArray(eapData.registro.hierarchyNodes) ? eapData.registro.hierarchyNodes : next.registro?.hierarchyNodes,
      childrenByParent: eapData.registro.childrenByParent && typeof eapData.registro.childrenByParent === 'object' && Object.keys(eapData.registro.childrenByParent).length > 0 ? eapData.registro.childrenByParent : next.registro?.childrenByParent,
      rootCodes: hasNonEmptyArray(eapData.registro.rootCodes) ? eapData.registro.rootCodes : next.registro?.rootCodes,
    };
  }

  if (!hasRegistroHierarchy(next.registro)) {
    const derivedRegistro = buildRegistroDataFromEapRows(eapData);
    if (derivedRegistro.contracts.length > 0 || derivedRegistro.osOptions.length > 0 || derivedRegistro.itemOptions.length > 0) {
      next.registro = {
        ...(next.registro || {}),
        contracts: hasRegistroHierarchy(next.registro) ? next.registro?.contracts : derivedRegistro.contracts,
        osOptions: Array.isArray(next.registro?.osOptions) && next.registro.osOptions.length > 0 ? next.registro.osOptions : derivedRegistro.osOptions,
        itemOptions: Array.isArray(next.registro?.itemOptions) && next.registro.itemOptions.length > 0 ? next.registro.itemOptions : derivedRegistro.itemOptions,
        hierarchyNodes: Array.isArray(next.registro?.hierarchyNodes) && next.registro.hierarchyNodes.length > 0 ? next.registro.hierarchyNodes : derivedRegistro.hierarchyNodes,
        childrenByParent: next.registro?.childrenByParent && Object.keys(next.registro.childrenByParent).length > 0 ? next.registro.childrenByParent : derivedRegistro.childrenByParent,
        rootCodes: Array.isArray(next.registro?.rootCodes) && next.registro.rootCodes.length > 0 ? next.registro.rootCodes : derivedRegistro.rootCodes,
      };
    }
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
  const allowedActions = new Set([
    'authUser',
    'registerUser',
    'forgotPassword',
    'resetPassword',
    'adminResetPassword',
    'approveUser',
    'blockUser',
    'saveUserAccess',
    'saveConfigOptions',
    'saveRoleTabPermissions',
    'saveDatabaseLink',
    'deleteDatabaseLink',
    'saveTerceirizada',
    'deleteTerceirizada',
    'savePlannerApprovals',
  ]);
  const action = String(payload.action || '').trim();
  if (!allowedActions.has(action)) {
    throw new Error('Esta acao nao usa mais a planilha pelo site. Atualize os dados diretamente no Firebase ou pela interface administrativa da planilha.');
  }
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

function createDraftId(prefix: string) {
  try {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return `${prefix}:${crypto.randomUUID()}`;
  } catch (error) {}
  return `${prefix}:${Date.now()}-${Math.random().toString(16).slice(2)}`;
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

class TabErrorBoundary extends React.Component<
  { children: React.ReactNode; resetKey: string },
  { hasError: boolean; errorMessage: string | null }
> {
  declare props: { children: React.ReactNode; resetKey: string };
  declare state: { hasError: boolean; errorMessage: string | null };
  declare setState: React.Component<
    { children: React.ReactNode; resetKey: string },
    { hasError: boolean; errorMessage: string | null }
  >['setState'];

  constructor(props: { children: React.ReactNode; resetKey: string }) {
    super(props);
    this.state = { hasError: false, errorMessage: null };
  }

  static getDerivedStateFromError() {
    return { hasError: true, errorMessage: null };
  }

  componentDidCatch(error: unknown) {
    console.error('Erro ao renderizar aba:', error);
    const message = error instanceof Error ? error.message : String(error);
    this.setState({ errorMessage: message });
  }

  componentDidUpdate(prevProps: { resetKey: string }) {
    if (prevProps.resetKey !== this.props.resetKey && this.state.hasError) {
      this.setState({ hasError: false, errorMessage: null });
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-[320px] flex items-center justify-center px-4">
          <div className="max-w-md rounded-2xl border border-[#FECACA] bg-white p-6 text-center shadow-sm">
            <h3 className="text-[16px] font-bold text-[#991B1B]">Esta aba encontrou um erro</h3>
            <p className="mt-2 text-[13px] text-[#6B7280]">
              A interface foi protegida para evitar a tela branca. Tente abrir a aba novamente ou recarregar a página.
            </p>
            {this.state.errorMessage && (
              <p className="mt-3 break-words rounded-xl bg-[#FFF7F7] px-3 py-2 text-left text-[12px] text-[#991B1B]">
                {this.state.errorMessage}
              </p>
            )}
            <button
              type="button"
              onClick={() => this.setState({ hasError: false, errorMessage: null })}
              className="mt-4 inline-flex h-11 items-center justify-center rounded-xl bg-[#F05D28] px-4 text-[13px] font-bold text-white transition hover:opacity-90"
            >
              Tentar de novo
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
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
    onlyThirdParty: Boolean(raw.onlyThirdParty || raw.onlyThirdPartyUsers || raw.somenteTerceirizados),
    online: Boolean(raw.online),
    sessionVersion: String(raw.sessionVersion || ''),
  };
}

function getUserInitials(nome: string) {
  return nome.split(' ').filter(Boolean).slice(0, 2).map((parte) => parte[0]?.toUpperCase() || '').join('');
}

function userHasTabAccess(user: AuthUser, tab: AppTab, roleTabPermissions: RoleTabPermissions = {}) {
  if (user.isAdmin) return true;
  const userTabs = Array.isArray(user.abas) ? user.abas.map(String) : [];
  if (tab === 'registro') {
    return userTabs.includes('registro') || userTabs.includes('cronograma');
  }
  if (tab === 'nc2') {
    return userTabs.includes('nc2') || userTabs.includes('nc');
  }
  if (tab === 'controle') {
    return userTabs.includes('controle') || userTabs.includes('alocacoes');
  }
  if (tab === 'planejamento') {
    return userTabs.includes('planejamento') || userTabs.includes('controle');
  }
  if (tab === 'contrato') {
    return userTabs.includes('contrato') || userTabs.includes('contratos');
  }
  return userTabs.includes(tab);
}

function getFirstAccessibleTab(user: AuthUser, roleTabPermissions: RoleTabPermissions = {}): AppTab | null {
  if (userHasTabAccess(user, 'registro', roleTabPermissions)) return 'registro';
  if (userHasTabAccess(user, 'controle', roleTabPermissions)) return 'controle';
  if (userHasTabAccess(user, 'planejamento', roleTabPermissions)) return 'planejamento';
  if (userHasTabAccess(user, 'contrato', roleTabPermissions)) return 'contrato';
  if (userHasTabAccess(user, 'nc2', roleTabPermissions)) return 'nc2';
  if (userHasTabAccess(user, 'administracao', roleTabPermissions)) return 'administracao';
  return null;
}

function normalizeAdminUsers(data: GlobalData): UserAccessRecord[] {
  const admin = data.admin || {};
  const usersSource = Array.isArray(admin.users)
    ? admin.users
    : Array.isArray(admin.usuarios)
      ? admin.usuarios
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
      showInCharts: u.showInCharts !== false,
      onlyThirdParty: Boolean(u.onlyThirdParty || u.onlyThirdPartyUsers || u.somenteTerceirizados),
      status: String(u.status || 'pending') as UserAccessRecord['status'],
      allowedTabs: (Array.isArray(u.allowedTabs) ? u.allowedTabs : Array.isArray(u.abas) ? u.abas : [])
        .map((tab: any) => String(tab).trim())
        .filter(Boolean) as AppTabKey[],
    }));
}

function normalizeLoadedAdmin(admin: any, data: GlobalData) {
  if (!admin || typeof admin !== 'object') return admin;

  const normalizedUsers = normalizeAdminUsers({ ...data, admin });
  const disciplineSettings = normalizeDisciplineSettings(
    admin.disciplineSettings
    ?? admin.disciplinas
    ?? admin.disciplinasConfiguradas
    ?? [],
  );

  return {
    ...admin,
    users: normalizedUsers,
    usuarios: normalizedUsers,
    disciplineSettings,
    disciplinas: getDisciplineNamesFromSettings(disciplineSettings),
  };
}

function getAdminState(data: GlobalData) {
  const admin = data.admin || {};
  const disciplineSettings = normalizeDisciplineSettings(admin.disciplineSettings ?? admin.disciplinas);
  return {
    usuarios: normalizeAdminUsers(data),
    disciplinas: getDisciplineNamesFromSettings(disciplineSettings),
    disciplineSettings,
    cargos: Array.isArray(admin.cargos) ? admin.cargos : [],
    alocacoes: Array.isArray(admin.alocacoes) ? admin.alocacoes : [],
    terceirizadas: Array.isArray(admin.terceirizadas) ? admin.terceirizadas.map((item: any) => ({
      id: String(item.id || ''),
      nome: String(item.nome || item.name || ''),
      disciplina: String(item.disciplina || item.discipline || ''),
    })).filter((item: TerceirizadaRecord) => item.id && item.nome) : [],
    databaseLinks: Array.isArray(admin.databaseLinks) ? admin.databaseLinks : [],
    roleTabPermissions: admin.roleTabPermissions && typeof admin.roleTabPermissions === 'object' ? admin.roleTabPermissions as RoleTabPermissions : {},
  };
}

function filterRowsByContract(rows: any[], contractCode: string) {
  const target = String(contractCode || '').trim();
  if (!target) return Array.isArray(rows) ? rows : [];
  return (Array.isArray(rows) ? rows : []).filter((row: any) => {
    const arrayCode = Array.isArray(row) ? String(row[0] || '').trim() : '';
    const code = String(row?.code || row?.codigo || arrayCode).trim();
    const rowContract = String(row?.contractCode || row?.contratoCodigo || (arrayCode ? arrayCode.split('.')[0] : '')).trim();
    return code === target || code.startsWith(`${target}.`) || rowContract === target;
  });
}

function getActivityContractCodeForFilter(activity: any) {
  const explicitContract = String(activity?.contratoCodigo || activity?.contractCode || '').trim();
  if (explicitContract) return explicitContract;

  const osCode = String(activity?.osCodigo || activity?.osCode || '').trim();
  if (osCode) {
    const osParts = osCode.split('.');
    if (osParts[0]) return osParts[0];
  }

  const itemCode = String(activity?.itemCodigo || activity?.itemCode || '').trim();
  if (itemCode) {
    const itemParts = itemCode.split('.');
    if (itemParts[0]) return itemParts[0];
  }

  return '';
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
    next.registro.activitiesList = (Array.isArray(next.registro.activitiesList) ? next.registro.activitiesList : []).filter((item: any) => getActivityContractCodeForFilter(item) === target);
    next.registro.activeActivities = (Array.isArray(next.registro.activeActivities) ? next.registro.activeActivities : []).filter((item: any) => getActivityContractCodeForFilter(item) === target);
    next.registro.completedActivities = (Array.isArray(next.registro.completedActivities) ? next.registro.completedActivities : []).filter((item: any) => getActivityContractCodeForFilter(item) === target);
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

function getSeedSourceActivities(registro: any) {
  const activitiesList = Array.isArray(registro?.activitiesList) ? registro.activitiesList : [];
  const activeActivities = Array.isArray(registro?.activeActivities) ? registro.activeActivities : [];
  const completedActivities = Array.isArray(registro?.completedActivities) ? registro.completedActivities : [];

  return activitiesList.length > 0
    ? activitiesList
    : [...activeActivities, ...completedActivities];
}

function buildProfessionalsForSeed(registro: any, admin: any) {
  const out = new Map<string, Array<{ nome: string; email: string; disciplina: string }>>();
  const push = (disciplinaRaw: any, nomeRaw: any, emailRaw: any) => {
    const disciplina = String(disciplinaRaw || '').trim() || 'Sem disciplina';
    const nome = String(nomeRaw || '').trim();
    const email = String(emailRaw || '').trim().toLowerCase();
    if (!nome) return;
    const key = normalizeEapCode(disciplina);
    const current = out.get(key) || [];
    if (current.some((item) => item.nome === nome && item.email === email)) return;
    current.push({ nome, email, disciplina });
    out.set(key, current);
  };

  const professionalsByDisciplina = registro?.professionalsByDisciplina && typeof registro.professionalsByDisciplina === 'object'
    ? registro.professionalsByDisciplina
    : {};

  Object.entries(professionalsByDisciplina).forEach(([disciplina, list]) => {
    (Array.isArray(list) ? list : []).forEach((prof: any) => push(disciplina, prof?.nome || prof?.name, prof?.email));
  });

  (Array.isArray(registro?.usersSummary) ? registro.usersSummary : []).forEach((user: any) => {
    push(user?.disciplina, user?.nome || user?.name, user?.email);
  });

  const adminUsers = Array.isArray(admin?.users)
    ? admin.users
    : admin?.usersByEmail && typeof admin.usersByEmail === 'object'
      ? Object.values(admin.usersByEmail)
      : [];
  adminUsers.forEach((user: any) => {
    if (!shouldShowUserInCharts(user)) return;
    push(user?.disciplina || user?.discipline, user?.nome || user?.name, user?.email);
  });

  return Array.from(out.entries()).map(([disciplinaKey, profissionais]) => ({
    disciplinaKey,
    disciplina: profissionais[0]?.disciplina || 'Sem disciplina',
    profissionais,
  })).filter((item) => item.profissionais.length > 0);
}

function buildThirdPartyEmail(id: string, nome: string) {
  const cleanId = String(id || '').trim();
  if (cleanId) return `terceirizada:${cleanId}`;
  return `terceirizada:${String(nome || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
}

function shouldShowUserInCharts(user: any) {
  return user?.showInCharts !== false;
}

function buildRegistroProfessionalsByDiscipline(registro: any, admin: any) {
  const base = registro?.professionalsByDisciplina && typeof registro.professionalsByDisciplina === 'object'
    ? registro.professionalsByDisciplina
    : {};

  const merged: Record<string, any[]> = {};
  Object.entries(base).forEach(([disciplina, profissionais]) => {
    merged[disciplina] = Array.isArray(profissionais) ? [...profissionais] : [];
  });

  const terceirizadas = Array.isArray(admin?.terceirizadas) ? admin.terceirizadas : [];
  terceirizadas.forEach((item: any) => {
    const disciplina = String(item?.disciplina || item?.discipline || '').trim() || 'Sem disciplina';
    const nome = String(item?.nome || item?.name || '').trim();
    if (!nome) return;

    const bucketKey = Object.keys(merged).find((key) => normalizeUserText(key) === normalizeUserText(disciplina)) || disciplina;
    const bucket = Array.isArray(merged[bucketKey]) ? [...merged[bucketKey]] : [];
    const email = buildThirdPartyEmail(String(item?.id || ''), nome);
    const exists = bucket.some((entry: any) => String(entry?.email || '').trim().toLowerCase() === email.toLowerCase());
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

  return merged;
}

function applyAdminUserContext(user: AuthUser, admin: any): AuthUser {
  const users = Array.isArray(admin?.users)
    ? admin.users
    : admin?.usersByEmail && typeof admin.usersByEmail === 'object'
      ? Object.values(admin.usersByEmail)
      : [];
  const match = users.find((item: any) => normalizeUserText(item?.email) === normalizeUserText(user.email));
  if (!match) return user;

  return {
    ...user,
    onlyThirdParty: Boolean(match?.onlyThirdParty || match?.onlyThirdPartyUsers || match?.somenteTerceirizados),
  };
}

function applyAdminDataToRegistro(data: GlobalData, currentUser?: AuthUser | null): GlobalData {
  if (!data.registro || typeof data.registro !== 'object') return data;

  const professionalsByDisciplina = buildRegistroProfessionalsByDiscipline(data.registro, data.admin);
  const adminUsers = Array.isArray(data.admin?.users)
    ? data.admin.users
    : data.admin?.usersByEmail && typeof data.admin.usersByEmail === 'object'
      ? Object.values(data.admin.usersByEmail)
      : [];
  const hiddenEmails = new Set(
    adminUsers
      .filter((user: any) => !shouldShowUserInCharts(user))
      .map((user: any) => normalizeUserText(user?.email))
      .filter(Boolean)
  );
  const filterActivityProfessionals = (activity: any) => {
    const rawEmails = Array.isArray(activity?.profissionaisEmails)
      ? activity.profissionaisEmails.map((item: any) => String(item || '').trim())
      : String(activity?.profissionaisEmails || '').split(' | ').map((item) => item.trim()).filter(Boolean);
    const rawNames = Array.isArray(activity?.profissionais)
      ? activity.profissionais.map((item: any) => String(item || '').trim())
      : String(activity?.profissionais || '').split(' | ').map((item) => item.trim()).filter(Boolean);
    const keptPairs = rawEmails
      .map((email: string, index: number) => ({ email, nome: rawNames[index] || '' }))
      .filter((item: { email: string }) => !hiddenEmails.has(normalizeUserText(item.email)));

    return {
      ...activity,
      profissionaisEmails: keptPairs.map((item: { email: string }) => item.email),
      profissionais: keptPairs.map((item: { nome: string }) => item.nome).filter(Boolean),
    };
  };
  const filteredProfessionalsByDisciplina = Object.fromEntries(
    Object.entries(professionalsByDisciplina).map(([disciplina, profissionais]) => [
      disciplina,
      (Array.isArray(profissionais) ? profissionais : []).filter((item: any) => {
        const email = normalizeUserText(item?.email);
        return !email || !hiddenEmails.has(email);
      }),
    ])
  );
  const effectiveUser = currentUser && data.admin ? applyAdminUserContext(currentUser, data.admin) : currentUser;
  const targetDisciplina = String(effectiveUser?.disciplina || '').trim();
  const matchingKey = Object.keys(filteredProfessionalsByDisciplina).find((key) => normalizeUserText(key) === normalizeUserText(targetDisciplina));
  let professionals = matchingKey ? filteredProfessionalsByDisciplina[matchingKey] || [] : [];

  if (effectiveUser?.onlyThirdParty) {
    professionals = professionals.filter((item: any) => String(item?.email || '').startsWith('terceirizada:'));
  }

  return {
    ...data,
    registro: {
      ...data.registro,
      professionalsByDisciplina: filteredProfessionalsByDisciplina,
      usersSummary: (Array.isArray(data.registro.usersSummary) ? data.registro.usersSummary : []).filter((user: any) => {
        const email = normalizeUserText(user?.email);
        return !email || !hiddenEmails.has(email);
      }),
      activitiesList: (Array.isArray(data.registro.activitiesList) ? data.registro.activitiesList : []).map(filterActivityProfessionals),
      activeActivities: (Array.isArray(data.registro.activeActivities) ? data.registro.activeActivities : []).map(filterActivityProfessionals),
      completedActivities: (Array.isArray(data.registro.completedActivities) ? data.registro.completedActivities : []).map(filterActivityProfessionals),
      professionals,
    },
  };
}

function buildLocalTestActivities(registro: any, admin: any, currentUser?: AuthUser | null) {
  const contracts = Array.isArray(registro?.contracts) ? registro.contracts : [];
  const osOptions = Array.isArray(registro?.osOptions) ? registro.osOptions : [];
  const itemOptions = Array.isArray(registro?.itemOptions) ? registro.itemOptions : [];
  const professionalsByDisciplina = buildProfessionalsForSeed(registro, admin);
  const existingActivities = getSeedSourceActivities(registro);
  const existingIds = new Set(existingActivities.map((item: any) => String(item?.activityId || item?.id || '').trim()).filter(Boolean));

  if (!contracts.length || !osOptions.length || !itemOptions.length || !professionalsByDisciplina.length) return [];

  const preferredContractCode = String(currentUser?.contrato || '').trim();
  const preferredDisciplina = String(currentUser?.disciplina || '').trim();
  const prioritizedDisciplineGroups = [
    ...professionalsByDisciplina.filter((item) => normalizeEapCode(item.disciplina) === normalizeEapCode(preferredDisciplina)),
    ...professionalsByDisciplina.filter((item) => normalizeEapCode(item.disciplina) !== normalizeEapCode(preferredDisciplina)),
  ];
  const prioritizedContracts = [
    ...contracts.filter((item: any) => String(item?.codigo || '').trim() === preferredContractCode),
    ...contracts.filter((item: any) => String(item?.codigo || '').trim() !== preferredContractCode),
  ];
  const prioritizedOsOptions = [
    ...osOptions.filter((item: any) => String(item?.contratoCodigo || '').trim() === preferredContractCode),
    ...osOptions.filter((item: any) => String(item?.contratoCodigo || '').trim() !== preferredContractCode),
  ];
  const prioritizedItemOptions = [
    ...itemOptions.filter((item: any) => {
      const osCodigo = String(item?.osCodigo || '').trim();
      return prioritizedOsOptions.some((os: any) => String(os?.codigo || '').trim() === osCodigo && String(os?.contratoCodigo || '').trim() === preferredContractCode);
    }),
    ...itemOptions.filter((item: any) => {
      const osCodigo = String(item?.osCodigo || '').trim();
      return !prioritizedOsOptions.some((os: any) => String(os?.codigo || '').trim() === osCodigo && String(os?.contratoCodigo || '').trim() === preferredContractCode);
    }),
  ];

  const evaluationCycle = [
    'Dentro do esperado',
    'Problema/Bloqueio',
    'Melhor que o esperado',
    'Pior que o esperado',
  ];
  const difficultyCycle = ['Facil', 'Moderada', 'Dificil'] as const;
  const progressCycle = [8, 14, 21, 27, 33, 48, 56, 64, 79, 92];

  const availableItems = prioritizedItemOptions.slice(0, 120);
  const seeds: any[] = [];

  for (let index = 0; index < 10; index += 1) {
    const item = availableItems[index % availableItems.length];
    const osCodigo = String(item?.osCodigo || '').trim();
    const os = prioritizedOsOptions.find((entry: any) => String(entry?.codigo || '').trim() === osCodigo) || prioritizedOsOptions[index % prioritizedOsOptions.length];
    const contratoCodigo = String(os?.contratoCodigo || prioritizedContracts[index % prioritizedContracts.length]?.codigo || '').trim();
    const contrato = prioritizedContracts.find((entry: any) => String(entry?.codigo || '').trim() === contratoCodigo) || prioritizedContracts[index % prioritizedContracts.length];
    const disciplinaGroup = prioritizedDisciplineGroups[index % prioritizedDisciplineGroups.length];
    const professionals = disciplinaGroup.profissionais;
    const professionalCount = Math.min(1 + (index % 3), professionals.length);
    const selectedProfessionals = professionals.slice(0, professionalCount);
    const responsavel = selectedProfessionals[0];
    const activityId = `seed-local-${String(item?.codigo || index + 1).replace(/[^0-9A-Za-z_.-]/g, '_')}-${index + 1}`;
    if (existingIds.has(activityId)) continue;

    const day = 10 + index;
    const status = index % 5 === 4 ? 'concluida' : index % 3 === 0 ? 'aguardando_conclusao' : 'em_andamento';

    seeds.push({
      id: activityId,
      activityId,
      contratoCodigo,
      contratoNome: String(contrato?.nome || contratoCodigo).trim(),
      osCodigo: String(os?.codigo || osCodigo).trim(),
      osNome: String(os?.nome || osCodigo).trim(),
      setor: 'Engenharia',
      itemCodigo: String(item?.codigo || '').trim(),
      itemNome: String(item?.nome || item?.codigo || '').trim(),
      descricao: `Atividade teste ${index + 1} - ${String(item?.nome || item?.codigo || '').trim()}`,
      profissionais: selectedProfessionals.map((entry) => entry.nome),
      profissionaisEmails: selectedProfessionals.map((entry) => entry.email),
      dificuldade: difficultyCycle[index % difficultyCycle.length],
      avancoAtual: progressCycle[index % progressCycle.length],
      avaliacaoAtual: evaluationCycle[index % evaluationCycle.length],
      observacaoAtual: 'Registro local de teste para validacao de graficos e filtros.',
      status,
      dataRegistro: `2026-05-${String(day).padStart(2, '0')}`,
      ultimaAtualizacao: `2026-05-${String(Math.min(day + 1, 28)).padStart(2, '0')}`,
      data100: status === 'concluida' ? `2026-05-${String(Math.min(day + 2, 28)).padStart(2, '0')}` : '',
      dataConclusaoEfetiva: status === 'concluida' ? `2026-05-${String(Math.min(day + 2, 28)).padStart(2, '0')}` : '',
      criadoPorNome: responsavel?.nome || '',
      criadoPorEmail: responsavel?.email || '',
      createdByName: responsavel?.nome || '',
      createdByEmail: responsavel?.email || '',
      criadoPorDisciplina: disciplinaGroup.disciplina,
      disciplina: disciplinaGroup.disciplina,
      responsavel: responsavel?.nome || '',
      importancia: 1 + (index % 3),
    });
  }

  return seeds;
}

function augmentGlobalDataWithLocalTestActivities(data: GlobalData, currentUser?: AuthUser | null): GlobalData {
  if (!import.meta.env.DEV) return data;
  const registro = data.registro;
  if (!registro || typeof registro !== 'object') return data;

  const seededActivities = buildLocalTestActivities(registro, data.admin, currentUser);
  if (seededActivities.length === 0) return data;

  const existingActivities = getSeedSourceActivities(registro);
  const mergedActivities = [...existingActivities, ...seededActivities];

  return {
    ...data,
    registro: {
      ...registro,
      activitiesList: mergedActivities,
      activeActivities: mergedActivities.filter((item: any) => String(item?.status || '').trim().toLowerCase() !== 'concluida'),
      completedActivities: mergedActivities.filter((item: any) => String(item?.status || '').trim().toLowerCase() === 'concluida'),
    },
  };
}

export default function App() {
  const [booting, setBooting] = useState(true);
  const [preloading, setPreloading] = useState(false);
  const [loadProgress, setLoadProgress] = useState(0);
  const [loadText, setLoadText] = useState('Iniciando conexão...');
  const [isBackgroundSyncing, setIsBackgroundSyncing] = useState(false);

  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);

  const [activeTab, setActiveTab] = React.useState<AppTab>('registro');
  const [areaTecnicaSubTab, setAreaTecnicaSubTab] = React.useState<AreaTecnicaSubTab>('atividades');
  const [subTab, setSubTab] = React.useState<ControleSubTab>('profissionais');
  const [planejamentoSubTab, setPlanejamentoSubTab] = React.useState<PlanejamentoSubTab>('dashboard');
  const [nc2SubTab, setNc2SubTab] = React.useState<Nc2SubTab>('dashboard');
  const [contratoSubTab, setContratoSubTab] = React.useState<ContratoSubTab>('dashboard');
  const [adminSubTab, setAdminSubTab] = React.useState<AdminSubTab>('usuarios');
  const [sidebarOpen, setSidebarOpen] = React.useState(true);
  const [showFilters, setShowFilters] = React.useState(false);
  const [globalData, setGlobalData] = useState<GlobalData>({});

  // ADMIN
  const [usuarios, setUsuarios] = useState<UserAccessRecord[]>([]);
  const [disciplinas, setDisciplinas] = useState<string[]>([]);
  const [disciplineSettings, setDisciplineSettings] = useState<DisciplineSettingRecord[]>([]);
  const [cargos, setCargos] = useState<string[]>([]);
  const [alocacoes, setAlocacoes] = useState<string[]>([]);
  const [terceirizadas, setTerceirizadas] = useState<TerceirizadaRecord[]>([]);
  const [pendingTerceirizadas, setPendingTerceirizadas] = useState<TerceirizadaRecord[]>([]);
  const [roleTabPermissions, setRoleTabPermissions] = useState<RoleTabPermissions>({});
  const [databaseLinks, setDatabaseLinks] = useState<DatabaseLinkRecord[]>([]);
  const [dirtyUserIds, setDirtyUserIds] = useState<string[]>([]);
  const [loadedModules, setLoadedModules] = useState<Record<string, boolean>>({});

  // Filter States (Dashboard/Tech Mock)
  const [filtrosAtivos, setFiltrosAtivos] = React.useState({ contrato: 'Todos', os: 'Todos', disciplina: 'Todos' });
  const effectiveGlobalData = React.useMemo(() => {
    const withAdminRegistro = applyAdminDataToRegistro(globalData, currentUser);
    return augmentGlobalDataWithLocalTestActivities(withAdminRegistro, currentUser);
  }, [globalData, currentUser]);
  const lockedContractCode = React.useMemo(
    () => (shouldLockUserToContract(currentUser) ? String(currentUser?.contrato || '').trim() : ''),
    [currentUser]
  );

  const contratos = React.useMemo(() => {
    const list = Array.isArray(effectiveGlobalData.registro?.contracts) ? effectiveGlobalData.registro.contracts : [];
    return list.map((item: any) => ({
      id: String(item.codigo || '').trim(),
      nome: String(item.nome || item.codigo || '').trim(),
    })).filter((item: any) => item.id);
  }, [effectiveGlobalData.registro?.contracts]);

  const adminTerceirizadas = React.useMemo(() => {
    return [...terceirizadas, ...pendingTerceirizadas];
  }, [pendingTerceirizadas, terceirizadas]);

  const buildAdminFirebaseSnapshot = useCallback((overrides?: {
    usuarios?: UserAccessRecord[];
    disciplineSettings?: DisciplineSettingRecord[];
    cargos?: string[];
    alocacoes?: string[];
    terceirizadas?: TerceirizadaRecord[];
    roleTabPermissions?: RoleTabPermissions;
    databaseLinks?: DatabaseLinkRecord[];
  }) => {
    const snapshotUsers = overrides?.usuarios || usuarios;
    const snapshotDisciplineSettings = overrides?.disciplineSettings || disciplineSettings;
    return {
      users: snapshotUsers.map((user) => ({
        id: user.id,
        nome: user.nome,
        email: user.email,
        online: user.online,
        disciplina: user.disciplina,
        cargo: user.cargo,
        alocacao: user.alocacao,
        contrato: user.contrato,
        isAdmin: user.isAdmin,
        showInCharts: user.showInCharts !== false,
        onlyThirdParty: user.onlyThirdParty,
        status: user.status,
        allowedTabs: user.allowedTabs,
      })),
      disciplinas: snapshotDisciplineSettings.map((item) => ({
        nome: item.nome,
        showInCharts: item.showInCharts,
      })),
      cargos: overrides?.cargos || cargos,
      alocacoes: overrides?.alocacoes || alocacoes,
      terceirizadas: (overrides?.terceirizadas || adminTerceirizadas).map((item) => ({
        id: item.id,
        nome: item.nome,
        disciplina: item.disciplina,
      })),
      roleTabPermissions: overrides?.roleTabPermissions || roleTabPermissions,
      databaseLinks: overrides?.databaseLinks || databaseLinks,
    };
  }, [adminTerceirizadas, alocacoes, cargos, databaseLinks, disciplineSettings, roleTabPermissions, usuarios]);

  const syncAdminSnapshotToFirebase = useCallback(async (overrides?: Parameters<typeof buildAdminFirebaseSnapshot>[0]) => {
    if (!isFirebaseConfigured()) return;
    await upsertFirebaseAppData('admin', buildAdminFirebaseSnapshot(overrides));
  }, [buildAdminFirebaseSnapshot]);

  const applyLoadedGlobalData = useCallback((fullData: GlobalData) => {
    const normalizedData = fullData.admin
      ? { ...fullData, admin: normalizeLoadedAdmin(fullData.admin, fullData) }
      : fullData;

    setGlobalData(normalizedData);
    saveGlobalDataCache(normalizedData);
    setLoadedModules({});

    if (normalizedData.admin) {
      const adminState = getAdminState(normalizedData);
      setUsuarios(adminState.usuarios);
      setDisciplinas(adminState.disciplinas);
      setDisciplineSettings(adminState.disciplineSettings);
      setCargos(adminState.cargos);
      setAlocacoes(adminState.alocacoes);
      setTerceirizadas(adminState.terceirizadas);
      setRoleTabPermissions(adminState.roleTabPermissions);
      setDatabaseLinks(adminState.databaseLinks);
      setCurrentUser((prev) => prev ? applyAdminUserContext(prev, normalizedData.admin) : prev);
    }
  }, []);

  const loadCollaborationData = useCallback(async () => {
    if (!isFirebaseConfigured()) {
      return {
        planningTodos: [],
        contractPriorities: [],
        contractInterferences: [],
        resolvedAlerts: [],
      };
    }

    const [planningTodos, contractPriorities, contractInterferences, resolvedAlerts] = await Promise.all([
      fetchFirebaseCollection('planningTodos'),
      fetchFirebaseCollection('contractPriorities'),
      fetchFirebaseCollection('contractInterferences'),
      fetchFirebaseCollection('resolvedAlerts'),
    ]);

    return { planningTodos, contractPriorities, contractInterferences, resolvedAlerts };
  }, []);

  const refreshRealtimeEnvironment = useCallback(async (user: AuthUser) => {
    setIsBackgroundSyncing(true);
    try {
      const [bootstrapData, registro, cronograma, eap, collaboration] = await Promise.all([
        fetchBootstrapDataFromFirebase(),
        fetchRegistroDataFromFirebase(user),
        fetchCronogramaDataFromFirebase(),
        fetchEapDataFromFirebase(),
        loadCollaborationData(),
      ]);

      const mergedData = applyUnifiedEapData(mergeGlobalData(bootstrapData, {
        registro,
        cronograma,
        eap,
        ...collaboration,
      }), eap);

      const scopedData = filterGlobalDataByContract(
        mergedData,
        shouldLockUserToContract(user) ? user.contrato || '' : '',
      );

      if (scopedData.admin) scopedData.admin.users = normalizeAdminUsers(scopedData);
      applyLoadedGlobalData(scopedData);
    } finally {
      setIsBackgroundSyncing(false);
    }
  }, [applyLoadedGlobalData, loadCollaborationData]);

  const syncPlannerApprovals = useCallback(async (rows: Array<{
    id: string;
    itemCodigo: string;
    itemNome: string;
    progress: number;
    approved: boolean;
  }>) => {
    if (!rows.length) return;

    const response = await postToAppsScript<GenericResponse>({
      action: 'savePlannerApprovals',
      approvals: rows,
      userEmail: currentUser?.email || '',
      userName: currentUser?.nome || '',
    });

    if (!response.success) {
      throw new Error(response.error || 'Falha ao sincronizar as aprovacoes do cronograma.');
    }

    if (currentUser) {
      await refreshRealtimeEnvironment(currentUser);
    }
  }, [currentUser, refreshRealtimeEnvironment]);

  useEffect(() => {
    const lockedContract = lockedContractCode;
    if (lockedContract) {
      setFiltrosAtivos((prev) => ({ ...prev, contrato: lockedContract }));
      return;
    }
    setFiltrosAtivos((prev) => ({ ...prev, contrato: 'Todos', os: 'Todos' }));
  }, [lockedContractCode]);

  useEffect(() => {
    if (activeTab !== 'registro' || areaTecnicaSubTab !== 'atividades') {
      setShowFilters(false);
    }
  }, [activeTab, areaTecnicaSubTab]);

  const loadGlobalEnvironment = async (user: AuthUser, isBackgroundSync = false) => {
    if (!isBackgroundSync) {
      const cachedData = getGlobalDataCache();
      if (cachedData && Object.keys(cachedData).length > 0) {
        const scopedCachedData = filterGlobalDataByContract(cachedData, shouldLockUserToContract(user) ? user.contrato || '' : '');
        applyLoadedGlobalData(scopedCachedData);
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
        if (currentProgress > 20 && currentProgress <= 45) setLoadText('Carregando menus e permissoes...');
        else if (currentProgress > 45 && currentProgress <= 75) setLoadText('Preparando ambiente...');
        else if (currentProgress > 75) setLoadText('Quase lá, estruturando as informações...');
      }, 600);
    } else {
      setIsBackgroundSyncing(true);
    }

    try {
      let fullData: GlobalData = {};
      
      try {
        const [bootstrapData, collaboration] = await Promise.all([
          fetchBootstrapDataFromFirebase(),
          loadCollaborationData(),
        ]);
        fullData = {
          ...bootstrapData,
          ...collaboration,
        };
      } catch (fbError) {
        console.error('Erro ao carregar dados publicados:', fbError);
        if (!isBackgroundSync) setLoadText('Erro ao conectar dados publicados. Usando cache...');
        fullData = {};
      }

      fullData = filterGlobalDataByContract(fullData, shouldLockUserToContract(user) ? user.contrato || '' : '');
        
        // Converte o índice por e-mail do JSON público de volta para o array esperado pelo app
        if (fullData.admin) fullData.admin.users = normalizeAdminUsers(fullData);

        applyLoadedGlobalData(fullData);
      if (!isBackgroundSync && progressInterval) {
        clearInterval(progressInterval); setLoadProgress(100); setLoadText('Tudo pronto!');
        setTimeout(() => { setPreloading(false); setBooting(false); }, 500);
      }
    } catch (error) {
      console.error('❌ Erro ao carregar ambiente:', error);
      if (!isBackgroundSync && progressInterval) {
        clearInterval(progressInterval); setLoadText('Ocorreu um erro. Tente atualizar a página.');
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
  }, [applyLoadedGlobalData, loadCollaborationData]);

  useEffect(() => {
    if (!currentUser || !isFirebaseConfigured()) return;

    const autoRefreshInterval = window.setInterval(() => {
      void refreshRealtimeEnvironment(currentUser);
    }, 60 * 60 * 1000);

    return () => {
      window.clearInterval(autoRefreshInterval);
    };
  }, [currentUser, refreshRealtimeEnvironment]);

  useEffect(() => {
    if (!currentUser) return;
    if (!userHasTabAccess(currentUser, activeTab, roleTabPermissions)) {
      if (userHasTabAccess(currentUser, 'registro', roleTabPermissions)) setActiveTab('registro');
      else if (userHasTabAccess(currentUser, 'controle', roleTabPermissions)) setActiveTab('controle');
      else if (userHasTabAccess(currentUser, 'planejamento', roleTabPermissions)) setActiveTab('planejamento');
      else if (userHasTabAccess(currentUser, 'contrato', roleTabPermissions)) setActiveTab('contrato');
      else if (userHasTabAccess(currentUser, 'nc2', roleTabPermissions)) setActiveTab('nc2');
      else if (userHasTabAccess(currentUser, 'administracao', roleTabPermissions)) setActiveTab('administracao');
    }
  }, [currentUser, activeTab, roleTabPermissions]);

  const loadFirebaseModule = useCallback(async (moduleName: 'registro' | 'cronograma' | 'eap') => {
    if (!currentUser || loadedModules[moduleName]) return;

    setIsBackgroundSyncing(true);
    try {
      if (moduleName === 'registro') {
        const registro = await fetchRegistroDataFromFirebase(currentUser);
        setGlobalData((prev) => {
          const next = mergeGlobalData(prev, { registro });
          saveGlobalDataCache(next);
          return next;
        });
      } else if (moduleName === 'cronograma') {
        const cronograma = await fetchCronogramaDataFromFirebase();
        setGlobalData((prev) => {
          const next = mergeGlobalData(prev, { cronograma });
          saveGlobalDataCache(next);
          return next;
        });
      } else if (moduleName === 'eap') {
        const eap = await fetchEapDataFromFirebase();
        setGlobalData((prev) => {
          const next = applyUnifiedEapData(prev, eap);
          saveGlobalDataCache(next);
          return next;
        });
      }
      setLoadedModules((prev) => ({ ...prev, [moduleName]: true }));
    } finally {
      setIsBackgroundSyncing(false);
    }
  }, [currentUser, loadedModules]);

  useEffect(() => {
    if (!currentUser || preloading) return;

    const wantsCronograma =
      (activeTab === 'registro' && areaTecnicaSubTab === 'cronograma') ||
      (activeTab === 'controle' && subTab === 'cronograma') ||
      (activeTab === 'planejamento' && planejamentoSubTab === 'cronograma') ||
      (activeTab === 'contrato' && contratoSubTab === 'cronograma') ||
      (activeTab === 'nc2' && nc2SubTab === 'cronograma');

    const wantsEap =
      activeTab === 'controle' && subTab === 'curva-s';
    const wantsRegistro =
      activeTab === 'registro' ||
      activeTab === 'controle' ||
      activeTab === 'planejamento' ||
      activeTab === 'contrato' ||
      activeTab === 'nc2';

    if (wantsRegistro) void loadFirebaseModule('registro');
    if (wantsCronograma) void loadFirebaseModule('cronograma');
    if (wantsEap) void loadFirebaseModule('eap');
  }, [activeTab, areaTecnicaSubTab, contratoSubTab, currentUser, loadFirebaseModule, nc2SubTab, planejamentoSubTab, preloading, subTab]);

  const loadAdminData = useCallback(async () => {
    if (!currentUser) return;
    setIsBackgroundSyncing(true);
    try {
      const fullData = await fetchBootstrapDataFromFirebase();
      if (fullData.admin) fullData.admin.users = normalizeAdminUsers(fullData);

      applyLoadedGlobalData(mergeGlobalData(globalData, fullData));
    } finally {
      setIsBackgroundSyncing(false);
    }
  }, [applyLoadedGlobalData, currentUser, globalData]);

  useEffect(() => {
    if (!globalData.admin) return;
    if (usuarios.length > 0 && disciplinas.length > 0) return;

    const normalizedAdmin = normalizeLoadedAdmin(globalData.admin, globalData);
    const adminState = getAdminState({ ...globalData, admin: normalizedAdmin });

    if (usuarios.length === 0 && adminState.usuarios.length > 0) setUsuarios(adminState.usuarios);
    if (disciplinas.length === 0 && adminState.disciplinas.length > 0) setDisciplinas(adminState.disciplinas);
    if (disciplineSettings.length === 0 && adminState.disciplineSettings.length > 0) setDisciplineSettings(adminState.disciplineSettings);
    if (cargos.length === 0 && adminState.cargos.length > 0) setCargos(adminState.cargos);
    if (alocacoes.length === 0 && adminState.alocacoes.length > 0) setAlocacoes(adminState.alocacoes);
    if (terceirizadas.length === 0 && adminState.terceirizadas.length > 0) setTerceirizadas(adminState.terceirizadas);
    if (databaseLinks.length === 0 && adminState.databaseLinks.length > 0) setDatabaseLinks(adminState.databaseLinks);
    if (Object.keys(roleTabPermissions).length === 0 && Object.keys(adminState.roleTabPermissions).length > 0) {
      setRoleTabPermissions(adminState.roleTabPermissions);
    }
  }, [
    alocacoes.length,
    cargos.length,
    databaseLinks.length,
    disciplinas.length,
    disciplineSettings.length,
    globalData,
    roleTabPermissions,
    terceirizadas.length,
    usuarios.length,
  ]);

  useEffect(() => {
    if (activeTab !== 'administracao' || !currentUser?.isAdmin) return;
    if (usuarios.length > 0 || disciplinas.length > 0) return;
    void loadAdminData();
  }, [activeTab, currentUser?.isAdmin, disciplinas.length, loadAdminData, usuarios.length]);

  const handleLogin = async (email: string, password: string, rememberMe: boolean) => {
    const response = await postToAppsScript<AuthResponse>({ action: 'authUser', email, password });
    if (!response.success || !response.user) throw new Error(response.error || 'E-mail ou senha incorretos.');

    const user = normalizeUser(response.user);
    saveSession(user, rememberMe);
    setCurrentUser(user);
    await loadGlobalEnvironment(user, false);

    const firstTab = getFirstAccessibleTab(user, roleTabPermissions);
    if (firstTab) setActiveTab(firstTab);
  };

  const handleLogout = () => { clearSession(); setCurrentUser(null); setGlobalData({}); setRoleTabPermissions({}); setDisciplineSettings([]); setDirtyUserIds([]); setPendingTerceirizadas([]); };

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
      const response = await postToAppsScript<GenericResponse>({ action: 'saveUserAccess', email: user.email, name: user.nome, role: user.cargo, discipline: user.disciplina, allocation: user.alocacao, contract: user.contrato, isAdmin: user.isAdmin, status: user.status, allowedTabs: user.allowedTabs, onlyThirdParty: user.onlyThirdParty });
      assertSuccess(response);
      await syncAdminSnapshotToFirebase({
        usuarios: usuarios.map((item) => item.id === user.id ? user : item),
      });
      await loadAdminData();
    } catch (error) {
      await loadAdminData();
      throw error;
    }
  }, [loadAdminData, syncAdminSnapshotToFirebase, usuarios]);

  const applyRolePresetTabs = useCallback((cargo: string) => {
    const roleTabs = roleTabPermissions[cargo] || [];
    return Array.from(new Set(roleTabs.map((tab) => String(tab).trim()).filter(Boolean))) as AppTabKey[];
  }, [roleTabPermissions]);

  const markUserDirty = useCallback((userId: string) => {
    setDirtyUserIds((prev) => prev.includes(userId) ? prev : [...prev, userId]);
  }, []);

  const updateUsuarioDraft = useCallback((userId: string, patch: Partial<UserAccessRecord>) => {
    setUsuarios((prev) => prev.map((user) => {
      if (user.id !== userId) return user;
      const nextUser = { ...user, ...patch };

      if (Object.prototype.hasOwnProperty.call(patch, 'cargo')) {
        const cargo = String(patch.cargo || '').trim();
        nextUser.allowedTabs = cargo ? applyRolePresetTabs(cargo) : [];
      }

      return nextUser;
    }));
    markUserDirty(userId);
  }, [applyRolePresetTabs, markUserDirty]);

  const toggleUsuarioAdminDraft = useCallback((userId: string, checked: boolean) => {
    setUsuarios((prev) => prev.map((user) => user.id === userId ? { ...user, isAdmin: checked } : user));
    markUserDirty(userId);
  }, [markUserDirty]);

  const toggleUsuarioOnlyThirdPartyDraft = useCallback((userId: string, checked: boolean) => {
    setUsuarios((prev) => prev.map((user) => user.id === userId ? { ...user, onlyThirdParty: checked } : user));
    markUserDirty(userId);
  }, [markUserDirty]);

  const toggleUsuarioTabDraft = useCallback((userId: string, tab: AppTabKey) => {
    setUsuarios((prev) => prev.map((user) => {
      if (user.id !== userId) return user;
      const nextTabs = user.allowedTabs.includes(tab)
        ? user.allowedTabs.filter((item) => item !== tab)
        : [...user.allowedTabs, tab];
      return { ...user, allowedTabs: nextTabs };
    }));
    markUserDirty(userId);
  }, [markUserDirty]);

  const savePendingUsers = useCallback(async () => {
    const pendingUsers = usuarios.filter((user) => dirtyUserIds.includes(user.id));
    if (pendingUsers.length === 0 && pendingTerceirizadas.length === 0) return;

    for (const user of pendingUsers) {
      await persistUser(user);
    }

    const syncedTerceirizadas = [...terceirizadas, ...pendingTerceirizadas];
    await syncAdminSnapshotToFirebase({
      usuarios,
      terceirizadas: syncedTerceirizadas,
    });

    setDirtyUserIds([]);
    setPendingTerceirizadas([]);
    await loadAdminData();
  }, [dirtyUserIds, loadAdminData, pendingTerceirizadas, persistUser, syncAdminSnapshotToFirebase, terceirizadas, usuarios]);

  const saveConfigOptions = useCallback(async (nextCargos: string[], nextDisciplinas: string[], nextAlocacoes: string[], nextDisciplineSettings?: DisciplineSettingRecord[]) => {
    setCargos(nextCargos);
    setDisciplinas(nextDisciplinas);
    setAlocacoes(nextAlocacoes);
    if (nextDisciplineSettings) setDisciplineSettings(nextDisciplineSettings);
    try {
      const response = await postToAppsScript<GenericResponse>({ action: 'saveConfigOptions', cargos: nextCargos, disciplinas: nextDisciplinas, alocacoes: nextAlocacoes });
      assertSuccess(response);
      await syncAdminSnapshotToFirebase({
        cargos: nextCargos,
        alocacoes: nextAlocacoes,
        disciplineSettings: nextDisciplineSettings || disciplineSettings,
      });
      await loadAdminData();
    } catch (error) {
      await loadAdminData();
      throw error;
    }
  }, [disciplineSettings, loadAdminData, syncAdminSnapshotToFirebase]);

  const saveRoleTabPermissions = useCallback(async (nextPermissions: RoleTabPermissions) => {
    setRoleTabPermissions(nextPermissions);
    try {
      const response = await postToAppsScript<GenericResponse>({ action: 'saveRoleTabPermissions', roleTabPermissions: nextPermissions });
      assertSuccess(response);
      await syncAdminSnapshotToFirebase({ roleTabPermissions: nextPermissions });
      await loadAdminData();
    } catch (error) {
      await loadAdminData();
      throw error;
    }
  }, [loadAdminData, syncAdminSnapshotToFirebase]);

  const addDisciplina = useCallback(async (value: string) => {
    const item = value.trim();
    if (!item) return;
    const nextDisciplineSettings = normalizeDisciplineSettings([
      ...disciplineSettings,
      { nome: item, showInCharts: true },
    ]);
    await saveConfigOptions(cargos, Array.from(new Set([...disciplinas, item])), alocacoes, nextDisciplineSettings);
  }, [alocacoes, cargos, disciplineSettings, disciplinas, saveConfigOptions]);

  const removeDisciplina = useCallback(async (value: string) => {
    const nextDisciplineSettings = disciplineSettings.filter((item) => item.nome !== value);
    await saveConfigOptions(cargos, disciplinas.filter((item) => item !== value), alocacoes, nextDisciplineSettings);
  }, [alocacoes, cargos, disciplineSettings, disciplinas, saveConfigOptions]);

  const toggleDisciplineCharts = useCallback(async (value: string, checked: boolean) => {
    const nextDisciplineSettings = normalizeDisciplineSettings(
      disciplineSettings.some((item) => item.nome === value)
        ? disciplineSettings.map((item) => item.nome === value ? { ...item, showInCharts: checked } : item)
        : [...disciplineSettings, { nome: value, showInCharts: checked }]
    );
    await saveConfigOptions(cargos, disciplinas, alocacoes, nextDisciplineSettings);
  }, [alocacoes, cargos, disciplineSettings, disciplinas, saveConfigOptions]);

  const addCargo = useCallback(async (value: string) => {
    const item = value.trim();
    if (!item) return;
    await saveConfigOptions(Array.from(new Set([...cargos, item])), disciplinas, alocacoes);
    await saveRoleTabPermissions({
      ...roleTabPermissions,
      [item]: [],
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
    await syncAdminSnapshotToFirebase({
      cargos: cargos.filter((item) => item !== value),
      roleTabPermissions: nextPermissions,
    });
    await loadAdminData();
  }, [alocacoes, cargos, disciplinas, loadAdminData, roleTabPermissions, syncAdminSnapshotToFirebase]);

  const toggleRoleTabPermission = useCallback(async (cargo: string, tab: AppTabKey) => {
    const currentTabs = roleTabPermissions[cargo] || [];
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
    const nextDatabaseLinks = payload.id
      ? databaseLinks.map((item) => item.id === payload.id ? { ...item, ...payload } : item)
      : [...databaseLinks, { id: payload.id || createDraftId('db-link'), ...payload }];
    await syncAdminSnapshotToFirebase({ databaseLinks: nextDatabaseLinks });
    await loadAdminData();
  }, [databaseLinks, loadAdminData, syncAdminSnapshotToFirebase]);

  const deleteDatabaseLink = useCallback(async (id: string) => {
    const response = await postToAppsScript<GenericResponse>({ action: 'deleteDatabaseLink', id });
    assertSuccess(response);
    setDatabaseLinks((prev) => prev.filter((item) => item.id !== id));
    await syncAdminSnapshotToFirebase({ databaseLinks: databaseLinks.filter((item) => item.id !== id) });
    await loadAdminData();
  }, [databaseLinks, loadAdminData, syncAdminSnapshotToFirebase]);

  const saveTerceirizada = useCallback(async (payload: Omit<TerceirizadaRecord, 'id'> & { id?: string }) => {
    const nome = String(payload.nome || '').trim();
    const disciplina = String(payload.disciplina || '').trim();
    if (!nome || !disciplina) return;

    const normalizedNome = normalizeUserText(nome);
    const normalizedDisciplina = normalizeUserText(disciplina);
    const mergedBase = [...terceirizadas, ...pendingTerceirizadas].filter((item) => (
      payload.id
        ? item.id !== payload.id
        : !(normalizeUserText(item.nome) === normalizedNome && normalizeUserText(item.disciplina) === normalizedDisciplina)
    ));
    const nextTerceirizadas = [
      ...mergedBase,
      {
        id: payload.id || createDraftId('terceirizada'),
        nome,
        disciplina,
      },
    ];

    setTerceirizadas(nextTerceirizadas);
    setPendingTerceirizadas([]);
    await syncAdminSnapshotToFirebase({ terceirizadas: nextTerceirizadas });
    await loadAdminData();
  }, [loadAdminData, pendingTerceirizadas, syncAdminSnapshotToFirebase, terceirizadas]);

  const deleteTerceirizada = useCallback(async (id: string) => {
    if (id.indexOf('draft-terceirizada:') === 0) {
      setPendingTerceirizadas((prev) => prev.filter((item) => item.id !== id));
      return;
    }

    const nextTerceirizadas = terceirizadas.filter((item) => item.id !== id);
    setTerceirizadas(nextTerceirizadas);
    await syncAdminSnapshotToFirebase({ terceirizadas: nextTerceirizadas });
    await loadAdminData();
  }, [loadAdminData, syncAdminSnapshotToFirebase, terceirizadas]);

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
    setDirtyUserIds((prev) => prev.filter((id) => id !== userId));
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

  const showCronogramaSubTab = Boolean(currentUser);

  const headerTabs = (() => {
    if (activeTab === 'controle') {
      return [
        { key: 'dashboard', label: 'Dashboard', icon: <LayoutGrid size={16} />, active: subTab === 'dashboard', onClick: () => setSubTab('dashboard') },
        { key: 'profissionais', label: 'Profissionais', icon: <Users size={16} />, active: subTab === 'profissionais', onClick: () => setSubTab('profissionais') },
        { key: 'curva-s', label: 'Curva S', icon: <TrendingUp size={16} />, active: subTab === 'curva-s', onClick: () => setSubTab('curva-s') },
        { key: 'alertas', label: 'Alertas', icon: <AlertTriangle size={16} />, active: subTab === 'alertas', onClick: () => setSubTab('alertas') },
        ...(showCronogramaSubTab ? [{ key: 'cronograma', label: 'Cronograma', icon: <Calendar size={16} />, active: subTab === 'cronograma', onClick: () => setSubTab('cronograma') }] : []),
      ];
    }

    if (activeTab === 'planejamento') {
      return [
        { key: 'dashboard', label: 'Dashboard', icon: <LayoutGrid size={16} />, active: planejamentoSubTab === 'dashboard', onClick: () => setPlanejamentoSubTab('dashboard') },
        { key: 'alertas', label: 'Alertas', icon: <AlertTriangle size={16} />, active: planejamentoSubTab === 'alertas', onClick: () => setPlanejamentoSubTab('alertas') },
        ...(showCronogramaSubTab ? [{ key: 'cronograma', label: 'Cronograma', icon: <Calendar size={16} />, active: planejamentoSubTab === 'cronograma', onClick: () => setPlanejamentoSubTab('cronograma') }] : []),
      ];
    }

    if (activeTab === 'nc2') {

      return [
        { key: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={16} />, active: nc2SubTab === 'dashboard', onClick: () => setNc2SubTab('dashboard') },
        { key: 'preenchimento', label: 'Preenchimento', icon: <Clipboard size={16} />, active: nc2SubTab === 'preenchimento', onClick: () => setNc2SubTab('preenchimento') },
        { key: 'revisoes', label: 'Revisoes', icon: <CheckSquare size={16} />, active: nc2SubTab === 'revisoes', onClick: () => setNc2SubTab('revisoes') },
        { key: 'terceirizadas', label: 'Terceirizadas', icon: <Users size={16} />, active: nc2SubTab === 'terceirizadas', onClick: () => setNc2SubTab('terceirizadas') },
        ...(showCronogramaSubTab ? [{ key: 'cronograma', label: 'Cronograma', icon: <Calendar size={16} />, active: nc2SubTab === 'cronograma', onClick: () => setNc2SubTab('cronograma') }] : []),
      ];
    }

    if (activeTab === 'contrato') {
      return [
        { key: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={16} />, active: contratoSubTab === 'dashboard', onClick: () => setContratoSubTab('dashboard') },
        { key: 'interferencias', label: 'Interferências', icon: <AlertTriangle size={16} />, active: contratoSubTab === 'interferencias', onClick: () => setContratoSubTab('interferencias') },
        ...(showCronogramaSubTab ? [{ key: 'cronograma', label: 'Cronograma', icon: <Calendar size={16} />, active: contratoSubTab === 'cronograma', onClick: () => setContratoSubTab('cronograma') }] : []),
      ];
    }

    if (activeTab === 'registro') {
      return [
        { key: 'atividades', label: 'Atividades', icon: <LayoutGrid size={16} />, active: areaTecnicaSubTab === 'atividades', onClick: () => setAreaTecnicaSubTab('atividades') },
        ...(showCronogramaSubTab ? [{ key: 'cronograma', label: 'Cronograma', icon: <Calendar size={16} />, active: areaTecnicaSubTab === 'cronograma', onClick: () => setAreaTecnicaSubTab('cronograma') }] : []),
      ];
    }

    if (activeTab === 'administracao') {

      return [
        { key: 'usuarios', label: 'Usuários', icon: <Users size={16} />, active: adminSubTab === 'usuarios', onClick: () => setAdminSubTab('usuarios') },
        { key: 'terceirizadas', label: 'Terceirizadas', icon: <ShieldCheck size={16} />, active: adminSubTab === 'terceirizadas', onClick: () => setAdminSubTab('terceirizadas') },
        { key: 'gerenciamento', label: 'Gerenciamento', icon: <Settings size={16} />, active: adminSubTab === 'gerenciamento', onClick: () => setAdminSubTab('gerenciamento') },
      ];
    }

    return [];
  })();

  const visibleHeaderTabs = activeTab === 'controle'
    ? headerTabs.filter((tab) => tab.key !== 'alocacoes')
    : headerTabs;

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
              {currentUser && userHasTabAccess(currentUser, 'registro', roleTabPermissions) && <NavItem icon={<ClipboardList size={20} />} label="Área Técnica" active={activeTab === 'registro'} onClick={() => setActiveTab('registro')} />}
              {currentUser && userHasTabAccess(currentUser, 'controle', roleTabPermissions) && <NavItem icon={<Settings size={20} />} label="Coordenação de Engenharia" active={activeTab === 'controle'} onClick={() => setActiveTab('controle')} />}
              {currentUser && userHasTabAccess(currentUser, 'planejamento', roleTabPermissions) && <NavItem icon={<LayoutGrid size={20} />} label="Planejamento" active={activeTab === 'planejamento'} onClick={() => setActiveTab('planejamento')} />}
              {currentUser && userHasTabAccess(currentUser, 'contrato', roleTabPermissions) && <NavItem icon={<FileText size={20} />} label="Contrato" active={activeTab === 'contrato'} onClick={() => setActiveTab('contrato')} />}
              {currentUser && userHasTabAccess(currentUser, 'nc2', roleTabPermissions) && <NavItem icon={<AlertTriangle size={20} />} label="Conformidade" active={activeTab === 'nc2'} onClick={() => setActiveTab('nc2')} />}
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
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="flex h-10 w-10 items-center justify-center rounded-full border border-[#E5E7EB] bg-[#F8FAFC] text-[#9CA3AF] transition-colors hover:bg-[#F1F5F9] hover:text-[#6B7280]"
              aria-label={sidebarOpen ? 'Recuar menu lateral' : 'Expandir menu lateral'}
              title={sidebarOpen ? 'Recuar menu lateral' : 'Expandir menu lateral'}
            >
              {sidebarOpen ? <ChevronLeft size={20} /> : <ChevronRight size={20} />}
            </button>
            <div className="flex flex-col shrink-0">
              <div className="flex items-center gap-3">
                <h2 className="text-[18px] font-bold text-[#2D2D2D] leading-tight">
                  {activeTab === 'registro'
                    ? (areaTecnicaSubTab === 'atividades' ? 'Atividades' : 'Cronograma')
                    : activeTab === 'controle' ? 'Coordenação de Engenharia'
                    : activeTab === 'planejamento' ? 'Planejamento'
                    : activeTab === 'contrato' ? 'Contrato'
                    : activeTab === 'nc2' ? 'Conformidade'
                    : 'Administração'}
                </h2>
              </div>
              <span className="text-[10px] font-medium text-[#757575] uppercase tracking-widest mt-1">EcoQuanta · Ecossistema Quanta</span>
            </div>
          </div>

          {false && activeTab === 'controle' && (
            <div className="flex items-center gap-1 bg-[#F8F9FA] p-1 rounded-xl border border-[#E5E7EB]">
              <HeaderTab active={subTab === 'profissionais'} onClick={() => setSubTab('profissionais')} icon={<Users size={16} />} label="Dashboard" />
              <HeaderTab active={subTab === 'curva-s'} onClick={() => setSubTab('curva-s')} icon={<TrendingUp size={16} />} label="Curva S" />
              <HeaderTab active={subTab === 'planejamento'} onClick={() => setSubTab('planejamento')} icon={<LayoutGrid size={16} />} label="Planejamento" />
              <HeaderTab active={subTab === 'alertas'} onClick={() => setSubTab('alertas')} icon={<AlertTriangle size={16} />} label="Alertas" />
            </div>
          )}

          {visibleHeaderTabs.length > 0 && (
            <div className="flex items-center gap-1 bg-[#F8F9FA] p-1 rounded-xl border border-[#E5E7EB] max-w-[58vw] overflow-x-auto">
              {visibleHeaderTabs.map((tab) => (
                <HeaderTab key={tab.key} active={tab.active} onClick={tab.onClick} icon={tab.icon} label={tab.label} />
              ))}
            </div>
          )}

          <div className="flex items-center gap-4">
            {activeTab === 'registro' && areaTecnicaSubTab === 'atividades' && (
              <button
                type="button"
                onClick={() => setShowFilters((prev) => !prev)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all border ${showFilters ? 'bg-[#F05D28] text-white border-[#F05D28]' : 'bg-white text-[#757575] border-[#E5E7EB] hover:bg-[#F9FAFB]'}`}
              >
                <Filter size={18} /> Filtros
              </button>
            )}
            <button
              type="button"
              onClick={() => currentUser && void refreshRealtimeEnvironment(currentUser)}
              disabled={!currentUser || isBackgroundSyncing}
              className="flex h-10 w-10 items-center justify-center rounded-full border border-[#E5E7EB] bg-white text-[#9CA3AF] transition-colors hover:bg-[#F8FAFC] hover:text-[#6B7280] disabled:cursor-not-allowed disabled:opacity-60"
              aria-label="Atualizar dados do Firebase"
              title="Atualizar dados do Firebase"
            >
              <RefreshCw size={18} className={isBackgroundSyncing ? 'animate-spin' : ''} />
            </button>
            <div className="w-10 h-10 rounded-full border border-[#E5E7EB] bg-white flex items-center justify-center text-[#F05D28] font-bold text-sm hidden sm:flex">
              {currentUser ? getUserInitials(currentUser.nome) : ''}
            </div>
          </div>
        </header>

        <main className={`flex-1 overflow-y-auto ${activeTab === 'registro' && areaTecnicaSubTab === 'atividades' ? 'p-3' : 'p-8'} bg-[#F8F9FA]`}>
          <TabErrorBoundary resetKey={`${activeTab}:${areaTecnicaSubTab}:${subTab}:${planejamentoSubTab}:${contratoSubTab}:${nc2SubTab}:${adminSubTab}`}>
            <React.Suspense fallback={<TabLoadingFallback />}>
              {activeTab === 'registro' && currentUser && userHasTabAccess(currentUser, 'registro', roleTabPermissions) && (
                areaTecnicaSubTab === 'atividades'
                  ? <Atividades currentUser={currentUser} preloadedData={effectiveGlobalData} isHeaderFiltersOpen={showFilters} onCloseHeaderFilters={() => setShowFilters(false)} />
                  : <Cronograma preloadedData={effectiveGlobalData} lockedContractCode={lockedContractCode} />
              )}
              {activeTab === 'controle' && currentUser && userHasTabAccess(currentUser, 'controle', roleTabPermissions) && <ControleEngenharia currentUser={currentUser} filtrosAtivos={filtrosAtivos} subTab={subTab} onSubTabChange={setSubTab} preloadedData={effectiveGlobalData} lockedContractCode={lockedContractCode} />}
              {activeTab === 'planejamento' && currentUser && userHasTabAccess(currentUser, 'planejamento', roleTabPermissions) && (
                planejamentoSubTab === 'dashboard'
                  ? <Planejamento filtrosAtivos={filtrosAtivos} preloadedData={effectiveGlobalData} mode="dashboard" activeContractCode={lockedContractCode || filtrosAtivos.contrato} />
                  : planejamentoSubTab === 'alertas'
                    ? <Alertas currentUser={currentUser} preloadedData={effectiveGlobalData} activeContractCode={lockedContractCode || filtrosAtivos.contrato} />
                    : planejamentoSubTab === 'cronograma'
                    ? <Cronograma preloadedData={effectiveGlobalData} lockedContractCode={lockedContractCode} viewMode="planning" currentUser={currentUser} onPlannerApprovalSubmit={syncPlannerApprovals} />
                    : <Cronograma preloadedData={effectiveGlobalData} lockedContractCode={lockedContractCode} />
              )}
              {activeTab === 'contrato' && currentUser && userHasTabAccess(currentUser, 'contrato', roleTabPermissions) && <Contrato currentUser={currentUser} preloadedData={effectiveGlobalData} activeContractCode={lockedContractCode || filtrosAtivos.contrato} lockedContractCode={lockedContractCode} activeView={contratoSubTab} />}
              {activeTab === 'nc2' && currentUser && userHasTabAccess(currentUser, 'nc2', roleTabPermissions) && (
                <NaoConformidades
                  activeTab={nc2SubTab}
                  onTabChange={setNc2SubTab}
                  currentUser={currentUser}
                  activeContractCode={lockedContractCode || filtrosAtivos.contrato}
                  preloadedData={effectiveGlobalData}
                  lockedContractCode={lockedContractCode}
                  disciplinas={disciplinas}
                  terceirizadas={adminTerceirizadas}
                  pendingTerceirizadaIds={pendingTerceirizadas.map((item) => item.id)}
                  onSaveTerceirizada={saveTerceirizada}
                  onDeleteTerceirizada={deleteTerceirizada}
                  onSavePendingInfo={savePendingUsers}
                />
              )}
              {activeTab === 'administracao' && currentUser?.isAdmin && (
                <Administracao
                  usuarios={usuarios} disciplinas={disciplinas} disciplineSettings={disciplineSettings} cargos={cargos} alocacoes={alocacoes} terceirizadas={adminTerceirizadas} contratos={contratos} roleTabPermissions={roleTabPermissions} databaseLinks={databaseLinks} appTabs={ADMIN_APP_TABS} onRefresh={loadAdminData}
                  onUpdateUsuario={updateUsuarioDraft}
                  onToggleAdmin={toggleUsuarioAdminDraft}
                  onToggleTabPermission={toggleUsuarioTabDraft}
                  onSavePendingUsers={savePendingUsers}
                  dirtyUserIds={dirtyUserIds}
                  pendingTerceirizadaIds={pendingTerceirizadas.map((item) => item.id)}
                  activeSection={adminSubTab}
                  onAcceptUser={acceptUser} onBlockUser={blockUser} onPasswordReset={resetUserPassword} onAddDisciplina={addDisciplina} onRemoveDisciplina={removeDisciplina} onToggleDisciplineCharts={toggleDisciplineCharts} onAddCargo={addCargo} onRemoveCargo={removeCargo} onAddAlocacao={addAlocacao} onRemoveAlocacao={removeAlocacao} onSaveTerceirizada={saveTerceirizada} onDeleteTerceirizada={deleteTerceirizada} onToggleRoleTabPermission={toggleRoleTabPermission} onSaveDatabaseLink={saveDatabaseLink} onDeleteDatabaseLink={deleteDatabaseLink}
                />
              )}
            </React.Suspense>
          </TabErrorBoundary>
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

function HeaderTab({ active, onClick, icon, label }: { key?: string; active: boolean; onClick: () => void; icon: React.ReactNode; label: React.ReactNode; }) {
  return (
    <button
      onClick={onClick}
      className={`flex h-9 shrink-0 items-center gap-2 overflow-hidden rounded-lg px-4 transition-colors duration-200 ${
        active
          ? 'bg-[#F05D28] text-white shadow-sm'
          : 'text-[#757575] hover:bg-[#F0F1F2] hover:text-[#2D2D2D]'
      }`}
      title={typeof label === 'string' ? label : undefined}
      aria-label={typeof label === 'string' ? label : undefined}
    >
      <span className="shrink-0">
        {icon}
      </span>
      <span className="whitespace-nowrap text-[13px] font-bold">
        {label}
      </span>
    </button>
  );
}

