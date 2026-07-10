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
  UserCheck,
  Layers,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import type {
  AppTabKey,
  DisciplineSettingRecord,
  UserAccessRecord,
  DatabaseLinkRecord,
  TerceirizadaRecord,
  RoleTabPermissions,
  PreRegistrationRecord,
} from './components/Administracao';
import LoginScreen, { AuthUser } from './components/LoginScreen';
import type { AnnotationSheet, AnnotationTemplate } from './components/CoordenacaoEngenharia/Anotacoes';

// Firestore rejects nested arrays, so `rows: string[][]` is JSON-encoded into a single string for storage.
type WireAnnotationSheet = Omit<AnnotationSheet, 'rows'> & { rowsJson: string };

function toWireAnnotationSheet(sheet: AnnotationSheet): WireAnnotationSheet {
  const { rows, ...rest } = sheet;
  return { ...rest, rowsJson: JSON.stringify(rows) };
}

function fromWireAnnotationSheet(sheet: WireAnnotationSheet): AnnotationSheet {
  const { rowsJson, ...rest } = sheet;
  let rows: string[][] = [];
  try {
    rows = JSON.parse(rowsJson || '[]');
  } catch {
    rows = [];
  }
  return { ...rest, rows };
}

type WireAnnotationTemplate = Omit<AnnotationTemplate, 'rows'> & { rowsJson: string };

function toWireAnnotationTemplate(template: AnnotationTemplate): WireAnnotationTemplate {
  const { rows, ...rest } = template;
  return { ...rest, rowsJson: JSON.stringify(rows) };
}

function fromWireAnnotationTemplate(template: WireAnnotationTemplate): AnnotationTemplate {
  const { rowsJson, ...rest } = template;
  let rows: string[][] = [];
  try {
    rows = JSON.parse(rowsJson || '[]');
  } catch {
    rows = [];
  }
  return { ...rest, rows };
}
import { getAppVersionLabel } from './config/appVersion';
import {
  DEFAULT_DISCIPLINE_SETTINGS,
  getPrimaryDisciplineValue,
  getUserDisciplineList,
  splitDisciplineValues,
} from './lib/disciplineCatalog';
import {
  fetchBootstrapDataFromFirebase,
  fetchFirebaseAppData,
  fetchCronogramaDataFromFirebase,
  fetchEapDataFromFirebase,
  fetchFirebaseCollection,
  fetchRegistroDataFromFirebase,
  isFirebaseConfigured,
  hashPasswordLikeAppsScript,
  replaceFirebaseAppData,
} from './lib/firebaseDb';

const Atividades = React.lazy(() => import('./components/Atividades'));
const ControleEngenharia = React.lazy(() => import('./components/CoordenacaoEngenharia'));
const Planejamento = React.lazy(() => import('./components/CoordenacaoEngenharia/DashboardEngenharia'));
const NaoConformidades = React.lazy(() => import('./components/NaoConformidade2/Conformidade'));
const Cronograma = React.lazy(() => import('./components/Cronograma'));
const Contrato = React.lazy(() => import('./components/CoordenacaoEngenharia/Contrato'));
const CurvaS = React.lazy(() => import('./components/CoordenacaoEngenharia/CurvaS'));
const Administracao = React.lazy(() => import('./components/Administracao'));

const EAP_APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbx4hAEe5i_ulWGSl9qfiokoCGzMza3QzUDIlM4cuZV_8eRw-Ml3XltdAbD0K0EFWm9x4Q/exec';
const APP_VERSION_LABEL = getAppVersionLabel();
const DEFAULT_ALOCACOES = [
  'Rio de Janeiro',
  'Maca\u00e9',
  'Maric\u00e1',
  'Quanta',
  'S\u00e3o Paulo',
  'Fortaleza',
  'Belo Horizonte',
  'Bahia',
  'Jo\u00e3o Pessoa',
  'Natal',
  'Oiticica',
];

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
type ControleSubTab = 'profissionais' | 'dashboard' | 'alocacoes' | 'curva-s' | 'planejamento' | 'alertas' | 'cronograma' | 'disciplinas';
type PlanejamentoSubTab = 'dashboard' | 'alertas' | 'cronograma' | 'atividades' | 'os' | 'curva-s';
type Nc2SubTab = 'dashboard' | 'preenchimento' | 'revisoes' | 'terceirizadas' | 'cronograma';
type ContratoSubTab = 'os' | 'interferencias' | 'prioridades' | 'cronograma' | 'atividades';
type AdminSubTab = 'usuarios' | 'terceirizadas' | 'gerenciamento' | 'pre-cadastro';
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
  osSettings?: any[];
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

interface AdminSnapshotState {
  usuarios: UserAccessRecord[];
  disciplineSettings: DisciplineSettingRecord[];
  cargos: string[];
  alocacoes: string[];
  terceirizadas: TerceirizadaRecord[];
  roleTabPermissions: RoleTabPermissions;
  databaseLinks: DatabaseLinkRecord[];
  preRegistrations: PreRegistrationRecord[];
}

function normalizeEapCode(value: any) {
  return String(value || '').trim();
}

function getHierarchyPrefix(value: any, depth: number) {
  const cleaned = normalizeEapCode(value);
  if (!cleaned) return '';
  const parts = cleaned.split('.').map((part) => normalizeEapCode(part)).filter(Boolean);
  if (parts.length <= depth) return cleaned;
  return parts.slice(0, depth).join('.');
}

function resolveContractCodeFromRegistry(contractValue: string, registryContracts: any[]) {
  const target = normalizeEapCode(contractValue);
  if (!target) return '';

  const contracts = Array.isArray(registryContracts) ? registryContracts : [];
  const directMatch = contracts.find((item: any) => normalizeEapCode(item?.codigo || '') === target);
  if (directMatch) return normalizeEapCode(directMatch.codigo || '');

  const nameMatch = contracts.find((item: any) => normalizeUserText(item?.nome || '') === normalizeUserText(target));
  if (nameMatch) return normalizeEapCode(nameMatch.codigo || '');

  const prefixMatch = contracts.find((item: any) => normalizeEapCode(item?.codigo || '').startsWith(`${target}.`));
  if (prefixMatch) return getHierarchyPrefix(prefixMatch.codigo, 1);

  return '';
}

function pickFirstNonEmptyArray(...sources: any[]) {
  for (const source of sources) {
    if (Array.isArray(source) && source.length > 0) return source;
  }

  return sources.find(Array.isArray) || [];
}

function getEapRows(eapData: any) {
  const source = pickFirstNonEmptyArray(
    eapData?.cronograma,
    eapData?.atual,
    eapData?.data?.cronograma,
    eapData?.data?.atual,
  );
  return source.filter((row: any) => {
    const code = Array.isArray(row)
      ? row?.[0]
      : row?.code || row?.codigo || row?.itemCodigo || row?.itemCode;
    return Boolean(normalizeEapCode(code));
  });
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

  rows.forEach((row: any) => {
    const codigo = normalizeEapCode(Array.isArray(row)
      ? row?.[0]
      : row?.code || row?.codigo || row?.itemCodigo || row?.itemCode || '');
    const nome = normalizeEapCode(Array.isArray(row)
      ? row?.[1] || codigo
      : row?.name || row?.nome || row?.itemNome || codigo);
    if (!codigo) return;

    const parts = codigo.split('.');
    const level = parts.length - 1;
    if (level === 0) {
      contracts.push({ codigo, nome });
      rootCodes.push(codigo);
      addNode({ codigo, nome, tipo: 'contrato', nivel: level, parentCodigo: '', contratoCodigo: codigo, osCodigo: '' });
      return;
    }

    if (level === 1) {
      const contratoCodigo = parts[0] || '';
      osOptions.push({ codigo, nome, contratoCodigo });
      addNode({ codigo, nome, tipo: 'os', nivel: level, parentCodigo: contratoCodigo, contratoCodigo, osCodigo: codigo });
      return;
    }

    const osCodigo = parts.slice(0, parts.length - 1).join('.');
    const contratoCodigo = parts[0] || '';
    itemOptions.push({ codigo, nome, osCodigo });
    addNode({
      codigo,
      nome,
      tipo: 'item',
      nivel: level,
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
      next[key] = value;
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

  const normalizedAtual = pickFirstNonEmptyArray(
    eapData.atual,
    eapData.cronograma,
    eapData.data?.atual,
    eapData.data?.cronograma,
  );
  const normalizedCronograma = pickFirstNonEmptyArray(
    eapData.cronograma,
    eapData.data?.cronograma,
    eapData.atual,
    eapData.data?.atual,
  );
  const normalizedEapData = {
    ...eapData,
    atual: normalizedAtual,
    cronograma: normalizedCronograma,
    data: eapData.data && typeof eapData.data === 'object'
      ? {
          ...eapData.data,
          atual: normalizedAtual,
          cronograma: normalizedCronograma,
        }
      : eapData.data,
  };

  const next: GlobalData = {
    ...data,
    eap: normalizedEapData,
  };

  const eapRegistro = normalizedEapData.registro && typeof normalizedEapData.registro === 'object'
    ? normalizedEapData.registro
    : normalizedEapData.data?.registro && typeof normalizedEapData.data.registro === 'object'
      ? normalizedEapData.data.registro
      : null;

  if (eapRegistro) {
    next.registro = {
      ...(next.registro || {}),
      contracts: hasNonEmptyArray(eapRegistro.contracts) ? eapRegistro.contracts : next.registro?.contracts,
      osOptions: hasNonEmptyArray(eapRegistro.osOptions) ? eapRegistro.osOptions : next.registro?.osOptions,
      itemOptions: hasNonEmptyArray(eapRegistro.itemOptions) ? eapRegistro.itemOptions : next.registro?.itemOptions,
      hierarchyNodes: hasNonEmptyArray(eapRegistro.hierarchyNodes) ? eapRegistro.hierarchyNodes : next.registro?.hierarchyNodes,
      childrenByParent: eapRegistro.childrenByParent && typeof eapRegistro.childrenByParent === 'object' && Object.keys(eapRegistro.childrenByParent).length > 0 ? eapRegistro.childrenByParent : next.registro?.childrenByParent,
      rootCodes: hasNonEmptyArray(eapRegistro.rootCodes) ? eapRegistro.rootCodes : next.registro?.rootCodes,
    };
  }

  if (!hasRegistroHierarchy(next.registro)) {
    const derivedRegistro = buildRegistroDataFromEapRows(normalizedEapData);
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

  const unifiedCronograma = pickFirstNonEmptyArray(
    normalizedEapData.cronograma,
    normalizedEapData.data?.cronograma,
  );

  if (Array.isArray(unifiedCronograma) && unifiedCronograma.length > 0) {
    next.cronograma = unifiedCronograma;
  }

  return next;
}

// Session Storage
function getStorageKey() { return 'quanta_auth_user'; }

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
}

function wasSessionRemembered() {
  return Boolean(localStorage.getItem(getStorageKey()));
}

async function postToAppsScript<T>(payload: Record<string, unknown>): Promise<T> {
  const allowedActions = new Set([
    'heartbeat',
    'authUser',
    'registerUser',
    'forgotPassword',
    'resetPassword',
    'adminResetPassword',
    'savePlannerApprovals',
  ]);
  const action = String(payload.action || '').trim();
  if (!allowedActions.has(action)) {
    throw new Error('Esta acao nao usa mais a planilha pelo site. Atualize os dados diretamente no Firebase ou pela interface administrativa da planilha.');
  }
  const response = await fetch(EAP_APPS_SCRIPT_URL, {
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

function createSessionVersion() {
  try {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  } catch (error) {}
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

// ---------------------------------------------------------------------------
// Recuperacao de acesso (pos troca de banco que apagou o appData/auth)
// ---------------------------------------------------------------------------
// O hash de senha mudou de formato ao longo do tempo:
//   - LEGADO (planilha antiga): "<saltHex>:<sha256Hex>", onde o hash e
//     SHA-256(salt + '|' + senha). Ver makePasswordHash_/verifyPassword_ legados.
//   - ATUAL: "sha256:<hex>" (SHA-256 da senha, sem salt).
// O login precisa aceitar AMBOS para que as senhas antigas continuem valendo.

// Verifica a senha contra um hash armazenado, suportando os dois formatos.
async function hashSaltedLegacy(password: string, salt: string) {
  if (!globalThis.crypto?.subtle) throw new Error('Criptografia indisponivel no navegador.');
  const buffer = new TextEncoder().encode(`${salt}|${String(password ?? '')}`);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function verifyPasswordHash(password: string, storedHash: string) {
  const stored = String(storedHash || '').trim();
  if (!stored) return false;
  if (stored.startsWith('sha256:')) {
    return (await hashPasswordLikeAppsScript(password)) === stored;
  }
  const parts = stored.split(':');
  if (parts.length === 2 && /^[0-9a-f]+$/i.test(parts[0]) && /^[0-9a-f]{64}$/i.test(parts[1])) {
    return (await hashSaltedLegacy(password, parts[0])) === parts[1].toLowerCase();
  }
  return false;
}

// Admin(s) "bootstrap": ao entrar com o e-mail + a senha-mestre abaixo, o usuario e
// autenticado e TODA a lista de recuperacao (RECOVERY_USERS) e regravada no Firebase,
// restaurando os logins perdidos. So serve como gatilho/senha de recuperacao.
// IMPORTANTE: a senha aqui e PROVISORIA. Apos recuperar o acesso e trocar a senha,
// REMOVA esta entrada (exige novo build), senao ela continua valendo como recuperacao.
const BOOTSTRAP_ADMINS: Array<{ email: string; passwordHash: string }> = [
  {
    email: 'igor.freire@quantaconsultoria.com',
    // sha256 de "19061994" (formato atual, sem salt).
    passwordHash: 'sha256:ee6fc628799552ba839baf9a3cf2912922063908e72e976f864e7228476274a2',
  },
];

type RecoveryAuthRecord = {
  id: string;
  data: string;
  nome: string;
  email: string;
  role: string;
  cargo: string;
  disciplina: string;
  disciplinas: string[];
  contrato: string;
  contract: string;
  status: string;
  alocacao: string;
  allowedTabs: string[];
  abas: string[];
  isAdmin: boolean;
  online: boolean;
  onlyThirdParty: boolean;
  showInCharts: boolean;
  sessionVersion: string;
  passwordHash: string;
  resetCode: string;
  resetExpires: string;
  lastSeen: string;
};

function makeRecoveryUser(input: {
  data: string;
  nome: string;
  email: string;
  role: string;
  disciplinas: string[];
  abas: string[];
  passwordHash: string;
  isAdmin: boolean;
  alocacao?: string;
  contrato?: string;
  sessionVersion: string;
  lastSeen?: string;
}): RecoveryAuthRecord {
  return {
    id: input.email,
    data: input.data,
    nome: input.nome,
    email: input.email,
    role: input.role,
    cargo: input.role,
    disciplina: input.disciplinas[0] || '',
    disciplinas: input.disciplinas,
    contrato: input.contrato || '',
    contract: input.contrato || '',
    status: 'approved',
    alocacao: input.alocacao || '',
    allowedTabs: input.abas,
    abas: input.abas,
    isAdmin: input.isAdmin,
    online: false,
    onlyThirdParty: false,
    showInCharts: true,
    sessionVersion: input.sessionVersion,
    passwordHash: input.passwordHash,
    resetCode: '',
    resetExpires: '',
    lastSeen: input.lastSeen || '',
  };
}

// Backup dos usuarios que existiam antes da troca de banco. As senhas continuam sendo as
// originais (hash legado salt:hash), exceto o Igor, cuja senha foi definida como "19061994".
const RECOVERY_USERS: RecoveryAuthRecord[] = [
  makeRecoveryUser({
    data: '10/03/2026, 12:36:30', nome: 'Igor Freire', email: 'igor.freire@quantaconsultoria.com',
    role: 'Líder', disciplinas: ['Desenvolvimento', 'ELET - Elétrica'],
    abas: ['registro', 'controle', 'alocacoes', 'contratos', 'nc', 'cronograma', 'administracao', 'contrato', 'nc2'],
    passwordHash: 'sha256:ee6fc628799552ba839baf9a3cf2912922063908e72e976f864e7228476274a2',
    isAdmin: true, sessionVersion: '1780325717969-75fe1236', lastSeen: '1780682464638',
  }),
  makeRecoveryUser({
    data: '10/03/2026, 13:21:12', nome: 'Gabriel Silveira Meurer', email: 'gabriel.meurer@quantaconsultoria.com',
    role: 'Líder', disciplinas: ['Planejamento'],
    abas: ['registro', 'controle', 'contratos', 'nc', 'cronograma', 'contrato'],
    passwordHash: 'd2708308678f4e83:7604009e361193908c1b7d96744075a04c31b653e8da7e11893e63c47f217457',
    isAdmin: true, sessionVersion: '1778766809960-c0baa1b3', lastSeen: '1778777006603',
  }),
  makeRecoveryUser({
    data: '10/03/2026, 14:09:09', nome: 'Hágata Almeida', email: 'hagata.oliveira@quantaconsultoria.com',
    role: 'Líder', disciplinas: ['Desenvolvimento'],
    abas: ['administracao', 'cronograma', 'nc', 'contratos', 'controle', 'registro', 'contrato'],
    passwordHash: '831b458a9ba24848:5fccaeb664c79aec0d3906a3735822382faf30528adfd0b2bc78c22f050f729b',
    isAdmin: true, sessionVersion: '1778246707151-8579b52f', lastSeen: '1779286086051',
  }),
  makeRecoveryUser({
    data: '11/03/2026, 17:27:27', nome: 'Vinícius Delgado', email: 'vinicius.delgado@quantaconsultoria.com',
    role: 'Coordenador De Contrato', disciplinas: [],
    abas: ['registro', 'controle', 'contratos', 'nc', 'cronograma', 'administracao', 'contrato'],
    passwordHash: '59f296ec6be64cb4:f68f0ef604096f8a9a9908d8863efed137436a2603d37183bdfc36b429783e49',
    isAdmin: true, sessionVersion: '1779216845131-f0cba1f5', lastSeen: '1780071770866',
  }),
  makeRecoveryUser({
    data: '30/04/2026, 16:57:29', nome: 'coord.engenharia', email: 'coord.engenharia@quantaconsultoria.com',
    role: 'Coordenador', disciplinas: ['ENG - Engenharia'],
    abas: ['controle', 'contrato'],
    passwordHash: 'a2eb40f5261e49a2:4a32b043851bd947b4f111ee38aa550b2c2b0373c74f3601ef6ebe017a9bed2d',
    isAdmin: false, sessionVersion: '1777586730091-c12e029a',
  }),
  makeRecoveryUser({
    data: '18/05/2026, 10:43:47', nome: 'Tarcísio Merino Marques', email: 'tarcisio.marques@quantaconsultoria.com',
    role: '', disciplinas: [], abas: [],
    passwordHash: '46476ca49a9e4eed:962d4fc28cb3b34132fd38933ce6881d911c98ddfed29a74b0b376cf9e0e6887',
    isAdmin: false, sessionVersion: '1779118866110-244036d7',
  }),
  makeRecoveryUser({
    data: '29/05/2026, 11:04:48', nome: 'Matheus de Souza Ferreira', email: 'matheus.ferreira@quantaconsultoria.com',
    role: '', disciplinas: ['DREN - Drenagem', 'HIDA - Hidráulica', 'HIDS - Hidrossanitário'],
    abas: ['registro'],
    passwordHash: '6762c93f11974732:821de785e41fd676ef90b2e6fff70a9e7e6fa2e5dc0866f7d3399777efe31b23',
    isAdmin: false, alocacao: 'Rio de Janeiro', sessionVersion: '1780086167598-a589949a', lastSeen: '1780086880635',
  }),
  makeRecoveryUser({
    data: '29/05/2026, 12:48:14', nome: 'Tiago Ricardo Carlos', email: 'tiago.carlos@quantaconsultoria.com',
    role: '', disciplinas: ['TERR - Terraplanagem'], abas: ['registro'],
    passwordHash: '4c43580c32884d88:f4f22c071fe288977378afd34dd00178948c63e97124ff314aeed12dba8fc86c',
    isAdmin: false, alocacao: 'Rio de Janeiro', sessionVersion: '1780079293145-158af5c9', lastSeen: '1780429461956',
  }),
];

// Regrava (merge) os usuarios de recuperacao no appData/auth do Firebase. Preserva quem ja
// existir no banco (nao sobrescreve cadastros mais novos), exceto os admins bootstrap, cujo
// registro e forcado para garantir o acesso com a senha-mestre. Best-effort.
async function seedAuthRecoveryToFirebase() {
  if (!isFirebaseConfigured()) return;
  try {
    const existingAuth = await fetchFirebaseAppData<any>('auth');
    const byEmail = new Map<string, any>();
    getAuthUsersList(existingAuth).forEach((item: any) => {
      const key = normalizeUserText(item?.email || item?.id);
      if (key) byEmail.set(key, item);
    });
    RECOVERY_USERS.forEach((user) => {
      const key = normalizeUserText(user.email);
      if (!key) return;
      const isBootstrap = BOOTSTRAP_ADMINS.some((item) => normalizeUserText(item.email) === key);
      if (isBootstrap || !byEmail.has(key)) byEmail.set(key, user);
    });
    const baseAuth =
      existingAuth && typeof existingAuth === 'object' && !Array.isArray(existingAuth) ? existingAuth : {};
    await replaceFirebaseAppData('auth', {
      ...baseAuth,
      users: Array.from(byEmail.values()),
      publishedAt: new Date().toISOString(),
      source: 'EcoQuanta-Web-Recovery',
    });
  } catch (error) {
    console.error('Falha ao restaurar usuarios no Firebase:', error);
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
  const disciplinas = splitDisciplineValues(raw.disciplinas || raw.disciplines || raw.disciplina);
  return {
    nome: raw.nome || '',
    email: raw.email || '',
    role: raw.role || '',
    disciplina: getPrimaryDisciplineValue(raw.disciplina || disciplinas[0] || ''),
    disciplinas,
    contrato: raw.contrato || '',
    status: raw.status || '',
    abas,
    isAdmin: Boolean(raw.isAdmin),
    onlyThirdParty: Boolean(raw.onlyThirdParty || raw.onlyThirdPartyUsers || raw.somenteTerceirizados),
    online: Boolean(raw.online),
    sessionVersion: String(raw.sessionVersion || ''),
  };
}

function getAuthUsersList(authData: any) {
  if (Array.isArray(authData?.users)) return authData.users;
  if (authData?.usersByEmail && typeof authData.usersByEmail === 'object') {
    return Object.values(authData.usersByEmail);
  }
  return [];
}

function getAdminUsersList(adminData: any) {
  if (Array.isArray(adminData?.users)) return adminData.users;
  if (Array.isArray(adminData?.usuarios)) return adminData.usuarios;
  if (adminData?.usersByEmail && typeof adminData.usersByEmail === 'object') {
    return Object.values(adminData.usersByEmail);
  }
  return [];
}

function getRecordSessionVersion(value: any) {
  return String(value?.sessionVersion || value?.sessionversion || '').trim();
}

function getAuthUserByEmail(authData: any, email: string) {
  const normalizedEmail = normalizeUserText(email);
  return getAuthUsersList(authData).find((item: any) => normalizeUserText(item?.email || item?.id) === normalizedEmail) || null;
}

function normalizeUserAccessRecord(raw: any): UserAccessRecord {
  const allowedTabsSource = Array.isArray(raw?.allowedTabs)
    ? raw.allowedTabs
    : Array.isArray(raw?.abas)
      ? raw.abas
      : String(raw?.allowedTabs || raw?.abas || '').split(/[|,]/);

  return {
    id: String(raw?.id || raw?.email || ''),
    nome: String(raw?.nome || raw?.name || ''),
    email: String(raw?.email || raw?.id || ''),
    online: Boolean(raw?.online),
    disciplina: getPrimaryDisciplineValue(raw?.disciplina || raw?.discipline || raw?.disciplinas || ''),
    disciplinas: getUserDisciplineList(raw),
    cargo: String(raw?.cargo || raw?.role || ''),
    alocacao: String(raw?.alocacao || raw?.allocation || ''),
    contrato: String(raw?.contrato || raw?.contract || ''),
    isAdmin: Boolean(raw?.isAdmin),
    showInCharts: raw?.showInCharts !== false,
    onlyThirdParty: Boolean(raw?.onlyThirdParty || raw?.onlyThirdPartyUsers || raw?.somenteTerceirizados),
    status: String(raw?.status || 'pending') as UserAccessRecord['status'],
    allowedTabs: allowedTabsSource
      .map((tab: any) => String(tab).trim())
      .filter(Boolean) as AppTabKey[],
    sessionVersion: getRecordSessionVersion(raw),
  };
}

function mergeUserAccessRecords(...sources: any[][]): UserAccessRecord[] {
  const byEmail = new Map<string, UserAccessRecord>();

  sources.forEach((source) => {
    source.forEach((raw) => {
      if (!raw || !(raw.email || raw.id)) return;
      const user = normalizeUserAccessRecord(raw);
      const email = normalizeUserText(user.email || user.id);
      if (!email || byEmail.has(email)) return;
      byEmail.set(email, user);
    });
  });

  return Array.from(byEmail.values());
}

function authRecordInvalidatesSession(savedUser: AuthUser, authRecord: any) {
  if (!authRecord) return true;

  const status = normalizeUserText(authRecord.status || '');
  if (status === 'pending' || status === 'blocked') return true;

  const currentVersion = getRecordSessionVersion(authRecord);
  return Boolean(currentVersion && getRecordSessionVersion(savedUser) !== currentVersion);
}

function normalizeAuthRecordForSession(raw: any): AuthUser {
  return normalizeUser({
    ...raw,
    abas: raw?.allowedTabs || raw?.abas || [],
    cargo: raw?.role || raw?.cargo || '',
    role: raw?.role || raw?.cargo || '',
    disciplinas: raw?.disciplinas || raw?.disciplina || '',
    disciplina: raw?.disciplina || '',
    sessionVersion: getRecordSessionVersion(raw),
  });
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
    // Planejamento e uma aba propria — NAO deve ser liberada so por ter 'controle'.
    return userTabs.includes('planejamento');
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
  const usersSource = getAdminUsersList(admin).length > 0
    ? getAdminUsersList(admin)
    : Array.isArray(data.registro?.usersSummary)
      ? data.registro.usersSummary
      : [];

  return usersSource
    .filter((u: any) => u && (u.email || u.id))
    .map(normalizeUserAccessRecord);
}

function normalizeLoadedAdmin(admin: any, data: GlobalData) {
  if (!admin || typeof admin !== 'object') return admin;

  const normalizedUsers = normalizeAdminUsers({ ...data, admin });
  const disciplineSettings = normalizeDisciplineSettings(
    admin.disciplineSettings
    ?? admin.disciplinas
    ?? admin.disciplinasConfiguradas
    ?? DEFAULT_DISCIPLINE_SETTINGS,
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
  const disciplineSettings = normalizeDisciplineSettings(admin.disciplineSettings ?? admin.disciplinas ?? DEFAULT_DISCIPLINE_SETTINGS);
  const alocacoes = Array.isArray(admin.alocacoes) ? admin.alocacoes : DEFAULT_ALOCACOES;
  return {
    usuarios: normalizeAdminUsers(data),
    disciplinas: getDisciplineNamesFromSettings(disciplineSettings),
    disciplineSettings,
    cargos: Array.isArray(admin.cargos) ? admin.cargos : [],
    alocacoes,
    terceirizadas: Array.isArray(admin.terceirizadas) ? admin.terceirizadas.map((item: any) => ({
      id: String(item.id || ''),
      nome: String(item.nome || item.name || ''),
      disciplina: String(item.disciplina || item.discipline || ''),
    })).filter((item: TerceirizadaRecord) => item.id && item.nome) : [],
    databaseLinks: Array.isArray(admin.databaseLinks) ? admin.databaseLinks : [],
    roleTabPermissions: admin.roleTabPermissions && typeof admin.roleTabPermissions === 'object' ? admin.roleTabPermissions as RoleTabPermissions : {},
    preRegistrations: Array.isArray(admin.preRegistrations)
      ? (admin.preRegistrations as any[]).map((r: any) => ({
          ...r,
          allowedTabs: Array.isArray(r.allowedTabs) ? r.allowedTabs as AppTabKey[] : [],
        }) as PreRegistrationRecord)
      : [],
    };
}

function hasObjectEntries(value: any) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length > 0);
}

function mergeAdminStateWithRemote(
  draftState: AdminSnapshotState,
  existingAdmin: any,
  existingAuth: any,
): AdminSnapshotState {
  const remoteAdminState = getAdminState({ admin: existingAdmin || {} });
  const remoteAuthUsers = getAuthUsersList(existingAuth);
  const mergedUsers = mergeUserAccessRecords(
    draftState.usuarios,
    remoteAdminState.usuarios,
    remoteAuthUsers,
  );
  const remoteUserCount = remoteAdminState.usuarios.length + remoteAuthUsers.length;

  if (remoteUserCount > 0 && mergedUsers.length === 0) {
    throw new Error('Protecao de dados: o salvamento administrativo tentou publicar uma lista vazia de usuarios.');
  }

  return {
    usuarios: mergedUsers,
    disciplineSettings: draftState.disciplineSettings.length > 0
      ? draftState.disciplineSettings
      : remoteAdminState.disciplineSettings,
    cargos: draftState.cargos.length > 0 ? draftState.cargos : remoteAdminState.cargos,
    alocacoes: draftState.alocacoes.length > 0 ? draftState.alocacoes : remoteAdminState.alocacoes,
    terceirizadas: draftState.terceirizadas.length > 0 ? draftState.terceirizadas : remoteAdminState.terceirizadas,
    roleTabPermissions: hasObjectEntries(draftState.roleTabPermissions)
      ? draftState.roleTabPermissions
      : remoteAdminState.roleTabPermissions,
    databaseLinks: draftState.databaseLinks.length > 0 ? draftState.databaseLinks : remoteAdminState.databaseLinks,
    preRegistrations: draftState.preRegistrations.length > 0 ? draftState.preRegistrations : remoteAdminState.preRegistrations,
  };
}

function filterRowsByContract(rows: any[], contractCode: string) {
  const target = String(contractCode || '').trim();
  if (!target) return Array.isArray(rows) ? rows : [];
  return (Array.isArray(rows) ? rows : []).filter((row: any) => {
    const arrayCode = Array.isArray(row) ? String(row[0] || '').trim() : '';
    const code = String(row?.code || row?.codigo || arrayCode).trim();
    const rowContractSource = String(row?.contractCode || row?.contratoCodigo || code || arrayCode).trim();
    const rowContract = getHierarchyPrefix(rowContractSource, 1);
    const derivedFromCode = getHierarchyPrefix(code || arrayCode, 1);
    return code === target || code.startsWith(`${target}.`) || rowContract === target || derivedFromCode === target;
  });
}

function getActivityContractCodeForFilter(activity: any) {
  const explicitContract = String(activity?.contratoCodigo || activity?.contractCode || '').trim();
  if (explicitContract) return getHierarchyPrefix(explicitContract, 1);

  const osCode = String(activity?.osCodigo || activity?.osCode || '').trim();
  if (osCode) {
    return getHierarchyPrefix(osCode, 1);
  }

  const itemCode = String(activity?.itemCodigo || activity?.itemCode || activity?.origemItem || '').trim();
  if (itemCode) {
    return getHierarchyPrefix(itemCode, 1);
  }

  return '';
}

function filterGlobalDataByContract(data: GlobalData, contractCode: string): GlobalData {
  const target = String(contractCode || '').trim();
  if (!target) return data;
  const keepOriginalIfEmpty = <T,>(filtered: T[], original: T[] = []) => (Array.isArray(filtered) && filtered.length > 0 ? filtered : original);

  const next: GlobalData = {
    ...data,
    registro: data.registro ? { ...data.registro } : data.registro,
    admin: data.admin ? { ...data.admin } : data.admin,
    eap: data.eap ? { ...data.eap } : data.eap,
  };

  if (next.registro && typeof next.registro === 'object') {
    const originalContracts = Array.isArray(next.registro.contracts) ? next.registro.contracts : [];
    const originalOsOptions = Array.isArray(next.registro.osOptions) ? next.registro.osOptions : [];
    const originalItemOptions = Array.isArray(next.registro.itemOptions) ? next.registro.itemOptions : [];
    const originalHierarchyNodes = Array.isArray(next.registro.hierarchyNodes) ? next.registro.hierarchyNodes : [];
    const originalRootCodes = Array.isArray(next.registro.rootCodes) ? next.registro.rootCodes : [];
    const originalActivitiesList = Array.isArray(next.registro.activitiesList) ? next.registro.activitiesList : [];
    const originalActiveActivities = Array.isArray(next.registro.activeActivities) ? next.registro.activeActivities : [];
    const originalCompletedActivities = Array.isArray(next.registro.completedActivities) ? next.registro.completedActivities : [];

    next.registro.contracts = keepOriginalIfEmpty(
      originalContracts.filter((item: any) => getHierarchyPrefix(String(item?.codigo || ''), 1) === target),
      originalContracts,
    );
    next.registro.osOptions = keepOriginalIfEmpty(originalOsOptions.filter((item: any) => {
      const osCode = String(item?.codigo || '').trim();
      const contractSource = String(item?.contratoCodigo || osCode || '').trim();
      return getHierarchyPrefix(contractSource, 1) === target;
    }), originalOsOptions);
    next.registro.itemOptions = keepOriginalIfEmpty(originalItemOptions.filter((item: any) => {
      const itemCode = String(item?.codigo || '').trim();
      return itemCode === target || itemCode.startsWith(`${target}.`);
    }), originalItemOptions);
    next.registro.hierarchyNodes = keepOriginalIfEmpty(originalHierarchyNodes.filter((item: any) => {
      const codigo = String(item?.codigo || '').trim();
      const contratoCodigo = String(item?.contratoCodigo || '').trim();
      return codigo === target || codigo.startsWith(`${target}.`) || getHierarchyPrefix(contratoCodigo, 1) === target;
    }), originalHierarchyNodes);
    next.registro.rootCodes = keepOriginalIfEmpty(originalRootCodes.filter((code: any) => String(code || '').trim() === target), originalRootCodes);

    const originalChildrenByParent = next.registro.childrenByParent && typeof next.registro.childrenByParent === 'object' ? next.registro.childrenByParent : {};
    const filteredChildrenByParent = Object.fromEntries(
      Object.entries(originalChildrenByParent)
        .filter(([key]) => key === 'ROOT' || String(key).trim() === target || String(key).trim().startsWith(`${target}.`))
        .map(([key, value]) => [key, (Array.isArray(value) ? value : []).filter((item: any) => String(item?.codigo || '').trim() === target || String(item?.codigo || '').trim().startsWith(`${target}.`))])
    );
    next.registro.childrenByParent = Object.keys(filteredChildrenByParent).length > 0 ? filteredChildrenByParent : originalChildrenByParent;
    next.registro.activitiesList = keepOriginalIfEmpty(originalActivitiesList.filter((item: any) => getActivityContractCodeForFilter(item) === target), originalActivitiesList);
    next.registro.activeActivities = keepOriginalIfEmpty(originalActiveActivities.filter((item: any) => getActivityContractCodeForFilter(item) === target), originalActiveActivities);
    next.registro.completedActivities = keepOriginalIfEmpty(originalCompletedActivities.filter((item: any) => getActivityContractCodeForFilter(item) === target), originalCompletedActivities);
  }

  next.cronograma = keepOriginalIfEmpty(filterRowsByContract(data.cronograma as any[], target), Array.isArray(data.cronograma) ? data.cronograma : []);

  if (next.eap && typeof next.eap === 'object') {
    const eapData = next.eap.data && typeof next.eap.data === 'object' ? { ...next.eap.data } : null;
    const targetEap = eapData || next.eap;
    targetEap.registro = targetEap.registro && typeof targetEap.registro === 'object'
      ? {
          ...targetEap.registro,
          contracts: keepOriginalIfEmpty(
            (Array.isArray(targetEap.registro.contracts) ? targetEap.registro.contracts : []).filter((item: any) => getHierarchyPrefix(String(item?.codigo || ''), 1) === target),
            Array.isArray(targetEap.registro.contracts) ? targetEap.registro.contracts : [],
          ),
          osOptions: keepOriginalIfEmpty(
            (Array.isArray(targetEap.registro.osOptions) ? targetEap.registro.osOptions : []).filter((item: any) => getHierarchyPrefix(String(item?.contratoCodigo || item?.codigo || ''), 1) === target),
            Array.isArray(targetEap.registro.osOptions) ? targetEap.registro.osOptions : [],
          ),
        }
      : targetEap.registro;
    targetEap.atual = keepOriginalIfEmpty(filterRowsByContract(targetEap.atual as any[], target), Array.isArray(targetEap.atual) ? targetEap.atual : []);
    if (targetEap.timeline && typeof targetEap.timeline === 'object') {
      const filteredTimeline = Object.fromEntries(Object.entries(targetEap.timeline).filter(([key]) => String(key).trim().startsWith(`${target}.`)));
      if (Object.keys(filteredTimeline).length > 0) targetEap.timeline = filteredTimeline;
    }
    if (Array.isArray(targetEap.reajustado)) {
      const filteredReajustado = filterRowsByContract(targetEap.reajustado, target);
      if (filteredReajustado.length > 0) targetEap.reajustado = filteredReajustado;
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
    role: String(match?.role || match?.cargo || user.role || ''),
    abas: Array.isArray(match?.allowedTabs)
      ? match.allowedTabs.map((tab: any) => String(tab).trim()).filter(Boolean)
      : Array.isArray(match?.abas)
        ? match.abas.map((tab: any) => String(tab).trim()).filter(Boolean)
        : user.abas,
    contrato: String(match?.contrato || match?.contract || user.contrato || ''),
    status: String(match?.status || user.status || ''),
    isAdmin: Boolean(match?.isAdmin),
    onlyThirdParty: Boolean(match?.onlyThirdParty || match?.onlyThirdPartyUsers || match?.somenteTerceirizados),
    disciplina: getPrimaryDisciplineValue(match?.disciplina || match?.discipline || match?.disciplinas || user.disciplina),
    disciplinas: getUserDisciplineList(match),
    online: Boolean(match?.online),
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
  const preferredDisciplina = getPrimaryDisciplineValue(getUserDisciplineList(currentUser || {}));
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
  const [contratoSubTab, setContratoSubTab] = React.useState<ContratoSubTab>('os');
  const [adminSubTab, setAdminSubTab] = React.useState<AdminSubTab>('usuarios');
  const [sidebarOpen, setSidebarOpen] = React.useState(true);
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
  const [preRegistrations, setPreRegistrations] = useState<PreRegistrationRecord[]>([]);
  const [dirtyUserIds, setDirtyUserIds] = useState<string[]>([]);
  const [adminHasPendingChanges, setAdminHasPendingChanges] = useState(false);
  const [isSavingAdminChanges, setIsSavingAdminChanges] = useState(false);
  const [loadedModules, setLoadedModules] = useState<Record<string, boolean>>({});
  const adminAutoLoadAttemptRef = React.useRef(false);
  const adminDraftVersionRef = React.useRef(0);
  const adminDraftRef = React.useRef<AdminSnapshotState | null>(null);
  const deletedUserEmailsRef = React.useRef<Set<string>>(new Set());

  // ANOTACOES (Disciplinas)
  const [notes, setNotes] = useState<AnnotationSheet[]>([]);
  const notesLoadAttemptRef = React.useRef(false);
  const [noteTemplates, setNoteTemplates] = useState<AnnotationTemplate[]>([]);
  const noteTemplatesLoadAttemptRef = React.useRef(false);

  // Filter States (Dashboard/Tech Mock)
  const [filtrosAtivos, setFiltrosAtivos] = React.useState({ contrato: 'Todos', os: 'Todos', disciplina: 'Todos' });
  const effectiveGlobalData = React.useMemo(() => {
    const withAdminRegistro = applyAdminDataToRegistro(globalData, currentUser);
    return withAdminRegistro;
  }, [globalData, currentUser]);
  const lockedContractCode = React.useMemo(
    () => {
      if (!shouldLockUserToContract(currentUser)) return '';
      return resolveContractCodeFromRegistry(
        String(currentUser?.contrato || '').trim(),
        effectiveGlobalData.registro?.contracts || [],
      );
    },
    [currentUser, effectiveGlobalData.registro?.contracts]
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

  const getAdminSnapshotState = useCallback((): AdminSnapshotState => ({
    usuarios,
    disciplineSettings,
    cargos,
    alocacoes,
    terceirizadas: adminTerceirizadas,
    roleTabPermissions,
    databaseLinks,
    preRegistrations,
  }), [adminTerceirizadas, alocacoes, cargos, databaseLinks, disciplineSettings, preRegistrations, roleTabPermissions, usuarios]);

  React.useEffect(() => {
    adminDraftRef.current = getAdminSnapshotState();
  }, [getAdminSnapshotState]);

  const updateAdminDraftRef = useCallback((patch: Partial<AdminSnapshotState>) => {
    const next = {
      ...(adminDraftRef.current || getAdminSnapshotState()),
      ...patch,
    };
    adminDraftRef.current = next;
    return next;
  }, [getAdminSnapshotState]);

  const buildAdminFirebaseSnapshot = useCallback((overrides?: Partial<AdminSnapshotState>) => {
    const snapshotState = {
      ...(adminDraftRef.current || getAdminSnapshotState()),
      ...(overrides || {}),
    };
    const snapshotUsers = snapshotState.usuarios;
    const snapshotDisciplineSettings = snapshotState.disciplineSettings;
    return {
      users: snapshotUsers.map((user) => ({
        id: user.id,
        nome: user.nome,
        email: user.email,
        online: user.online,
        disciplina: user.disciplina,
        disciplinas: Array.isArray((user as any).disciplinas) ? (user as any).disciplinas : splitDisciplineValues(user.disciplina),
        cargo: user.cargo,
        alocacao: user.alocacao,
        contrato: user.contrato,
        isAdmin: user.isAdmin,
        showInCharts: user.showInCharts !== false,
        onlyThirdParty: user.onlyThirdParty,
        status: user.status,
        allowedTabs: user.allowedTabs,
        sessionVersion: user.sessionVersion || '',
      })),
      disciplinas: snapshotDisciplineSettings.map((item) => ({
        nome: item.nome,
        showInCharts: item.showInCharts,
      })),
      cargos: snapshotState.cargos,
      alocacoes: snapshotState.alocacoes,
      terceirizadas: snapshotState.terceirizadas.map((item) => ({
        id: item.id,
        nome: item.nome,
        disciplina: item.disciplina,
      })),
      roleTabPermissions: snapshotState.roleTabPermissions,
      databaseLinks: snapshotState.databaseLinks,
      preRegistrations: snapshotState.preRegistrations,
    };
  }, [getAdminSnapshotState]);

  const buildAuthFirebaseSnapshot = useCallback((sourceUsers?: UserAccessRecord[], existingAuth?: any) => {
    const users = sourceUsers || usuarios;
    const existingUsers = getAuthUsersList(existingAuth);
    const existingByEmail = new Map(existingUsers.map((item: any) => [normalizeUserText(item?.email), item]));

    const mappedUsers = users.map((user) => {
      const existing = existingByEmail.get(normalizeUserText(user.email)) || {};
      return {
        id: user.id,
        nome: user.nome,
        email: user.email,
        role: user.cargo,
        cargo: user.cargo,
        disciplina: user.disciplina,
        disciplinas: Array.isArray((user as any).disciplinas) && (user as any).disciplinas.length > 0
          ? (user as any).disciplinas
          : splitDisciplineValues(user.disciplina),
        contrato: user.contrato,
        contract: user.contrato,
        status: user.status,
        alocacao: user.alocacao,
        allowedTabs: user.allowedTabs,
        abas: user.allowedTabs,
        isAdmin: user.isAdmin,
        online: user.online,
        onlyThirdParty: user.onlyThirdParty,
        showInCharts: user.showInCharts !== false,
        sessionVersion: String(user.sessionVersion || (existing as any).sessionVersion || (existing as any).sessionversion || ''),
        passwordHash: String((existing as any).passwordHash || (existing as any).passwordhash || ''),
        resetCode: String((existing as any).resetCode || (existing as any).resetcode || ''),
        resetExpires: (existing as any).resetExpires || (existing as any).resetexpires || '',
        lastSeen: (existing as any).lastSeen || (existing as any).lastseen || '',
      };
    });
    const mappedEmails = new Set(mappedUsers.map((user: any) => normalizeUserText(user.email)).filter(Boolean));
    const preservedExistingUsers = existingUsers.filter((item: any) => {
      const email = normalizeUserText(item?.email || item?.id);
      return email && !mappedEmails.has(email) && !deletedUserEmailsRef.current.has(email);
    });

    return {
      users: [...mappedUsers, ...preservedExistingUsers],
      publishedAt: new Date().toISOString(),
      source: 'EcoQuanta-Web',
    };
  }, [usuarios]);

  const prepareAdminSnapshotForSave = useCallback(async (draftState: AdminSnapshotState) => {
    const [existingAdmin, existingAuth] = isFirebaseConfigured()
      ? await Promise.all([
          fetchFirebaseAppData<any>('admin'),
          fetchFirebaseAppData<any>('auth'),
        ])
      : [null, null];
    const mergedState = mergeAdminStateWithRemote(draftState, existingAdmin, existingAuth);
    const safeMergedState = deletedUserEmailsRef.current.size > 0
      ? { ...mergedState, usuarios: mergedState.usuarios.filter((user) => !deletedUserEmailsRef.current.has(normalizeUserText(user.email || user.id))) }
      : mergedState;
    const snapshot = buildAdminFirebaseSnapshot(safeMergedState);

    return {
      snapshot,
      state: safeMergedState,
      existingAuth,
    };
  }, [buildAdminFirebaseSnapshot]);

  const writeAdminSnapshotToFirebase = useCallback(async (snapshot: Record<string, any>) => {
    if (!isFirebaseConfigured()) return;
    await replaceFirebaseAppData('admin', snapshot);
  }, []);

  const syncAdminSnapshotToFirebase = useCallback(async (overrides?: Parameters<typeof buildAdminFirebaseSnapshot>[0]) => {
    const draftState = {
      ...(adminDraftRef.current || getAdminSnapshotState()),
      ...(overrides || {}),
    };
    const { snapshot } = await prepareAdminSnapshotForSave(draftState);
    await writeAdminSnapshotToFirebase(snapshot);
    return snapshot;
  }, [getAdminSnapshotState, prepareAdminSnapshotForSave, writeAdminSnapshotToFirebase]);

  const syncAuthSnapshotToFirebase = useCallback(async (overrideUsers?: UserAccessRecord[], existingAuthOverride?: any) => {
    if (!isFirebaseConfigured()) return;
    const existingAuth = existingAuthOverride ?? await fetchFirebaseAppData<any>('auth');
    await replaceFirebaseAppData('auth', buildAuthFirebaseSnapshot(overrideUsers, existingAuth));
  }, [buildAuthFirebaseSnapshot]);

  const syncAdminSnapshotToAppsScript = useCallback(async () => {
    return;
  }, []);

  const syncAdminSnapshotToAppsScriptInBackground = useCallback((_snapshot: Record<string, any>) => {
    return;
  }, []);

  const applyLoadedGlobalData = useCallback((fullData: GlobalData, options?: { resetLoadedModules?: boolean }) => {
    const normalizedData = fullData.admin
      ? { ...fullData, admin: normalizeLoadedAdmin(fullData.admin, fullData) }
      : fullData;

    setGlobalData(normalizedData);
    if (options?.resetLoadedModules !== false) {
      setLoadedModules({});
    }

    if (normalizedData.admin) {
      const adminState = getAdminState(normalizedData);
      setUsuarios(adminState.usuarios);
      setDisciplinas(adminState.disciplinas);
      setDisciplineSettings(adminState.disciplineSettings);
      setCargos(adminState.cargos);
      setAlocacoes(adminState.alocacoes);
      setTerceirizadas(adminState.terceirizadas);
      setPendingTerceirizadas([]);
      setRoleTabPermissions(adminState.roleTabPermissions);
      setDatabaseLinks(adminState.databaseLinks);
      setPreRegistrations(adminState.preRegistrations);
      adminDraftRef.current = {
        usuarios: adminState.usuarios,
        disciplineSettings: adminState.disciplineSettings,
        cargos: adminState.cargos,
        alocacoes: adminState.alocacoes,
        terceirizadas: adminState.terceirizadas,
        roleTabPermissions: adminState.roleTabPermissions,
        databaseLinks: adminState.databaseLinks,
        preRegistrations: adminState.preRegistrations,
      };
      setCurrentUser((prev) => prev ? applyAdminUserContext(prev, normalizedData.admin) : prev);
    }
    setDirtyUserIds([]);
    setAdminHasPendingChanges(false);
    deletedUserEmailsRef.current = new Set();
  }, []);

  const loadCollaborationData = useCallback(async () => {
    if (!isFirebaseConfigured()) {
      return {
        planningTodos: [],
        contractPriorities: [],
        contractInterferences: [],
        resolvedAlerts: [],
        osSettings: [],
      };
    }

    // Cada colecao busca de forma isolada: uma falha (ex: regra do Firestore
    // faltando) nao pode derrubar o bootstrap inteiro (admin/registro/eap).
    const fetchCollectionSafe = async (name: string) => {
      try {
        return await fetchFirebaseCollection(name);
      } catch (error) {
        console.error(`❌ Erro ao carregar colecao ${name}:`, error);
        return [];
      }
    };

    const [planningTodos, contractPriorities, contractInterferences, resolvedAlerts, osSettings] = await Promise.all([
      fetchCollectionSafe('planningTodos'),
      fetchCollectionSafe('contractPriorities'),
      fetchCollectionSafe('contractInterferences'),
      fetchCollectionSafe('resolvedAlerts'),
      fetchCollectionSafe('osSettings'),
    ]);

    return { planningTodos, contractPriorities, contractInterferences, resolvedAlerts, osSettings };
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

      const scopedContract = shouldLockUserToContract(user)
        ? resolveContractCodeFromRegistry(String(user.contrato || '').trim(), mergedData.registro?.contracts || [])
        : '';
      const scopedData = filterGlobalDataByContract(mergedData, scopedContract);

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


  const loadGlobalEnvironment = async (user: AuthUser, isBackgroundSync = false) => {
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
        if (!isBackgroundSync) setLoadText('Erro ao conectar dados publicados. Tente atualizar a página.');
        fullData = {};
      }

      const scopedContract = shouldLockUserToContract(user)
        ? resolveContractCodeFromRegistry(String(user.contrato || '').trim(), fullData.registro?.contracts || [])
        : '';
      fullData = filterGlobalDataByContract(fullData, scopedContract);
        
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
    let cancelled = false;

    const restoreSavedSession = async () => {
      const savedUser = readSession();
      if (!savedUser) {
        setBooting(false);
        return;
      }

      try {
        if (isFirebaseConfigured()) {
          const authData = await fetchFirebaseAppData<any>('auth');
          if (authData) {
            const authRecord = getAuthUserByEmail(authData, savedUser.email);

            if (authRecordInvalidatesSession(savedUser, authRecord)) {
              clearSession();
              if (!cancelled) {
                setCurrentUser(null);
                setGlobalData({});
                setBooting(false);
                setPreloading(false);
              }
              return;
            }

            const refreshedUser = normalizeAuthRecordForSession(authRecord);
            saveSession(refreshedUser, wasSessionRemembered());
            if (!cancelled) {
              setCurrentUser(refreshedUser);
              await loadGlobalEnvironment(refreshedUser);
            }
            return;
          }
        }
      } catch (error) {
        console.warn('Nao foi possivel validar a sessao salva antes de carregar:', error);
      }

      if (!cancelled) {
        setCurrentUser(savedUser);
        await loadGlobalEnvironment(savedUser);
      }
    };

    void restoreSavedSession();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!currentUser || !isFirebaseConfigured() || adminHasPendingChanges) return;

    const autoRefreshInterval = window.setInterval(() => {
      void refreshRealtimeEnvironment(currentUser);
    }, 60 * 60 * 1000);

    return () => {
      window.clearInterval(autoRefreshInterval);
    };
  }, [adminHasPendingChanges, currentUser, refreshRealtimeEnvironment]);

  useEffect(() => {
    if (!currentUser || !isFirebaseConfigured()) return;

    let cancelled = false;

    const validateActiveSession = async () => {
      try {
        const authData = await fetchFirebaseAppData<any>('auth');
        if (!authData) return;
        const authRecord = getAuthUserByEmail(authData, currentUser.email);
        if (!authRecordInvalidatesSession(currentUser, authRecord)) return;

        clearSession();
        if (!cancelled) {
          setCurrentUser(null);
          setGlobalData({});
          setLoadedModules({});
          setDirtyUserIds([]);
          setPendingTerceirizadas([]);
          setAdminHasPendingChanges(false);
          setIsSavingAdminChanges(false);
          adminDraftRef.current = null;
        }
      } catch (error) {
        console.warn('Nao foi possivel validar a sessao ativa:', error);
      }
    };

    const intervalId = window.setInterval(() => {
      void validateActiveSession();
    }, 2 * 60 * 1000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [currentUser]);

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
          return mergeGlobalData(prev, { registro });
        });
      } else if (moduleName === 'cronograma') {
        const cronograma = await fetchCronogramaDataFromFirebase();
        setGlobalData((prev) => {
          return mergeGlobalData(prev, { cronograma });
        });
      } else if (moduleName === 'eap') {
        const eap = await fetchEapDataFromFirebase();
        setGlobalData((prev) => {
          return applyUnifiedEapData(prev, eap);
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
      (activeTab === 'controle' && subTab === 'curva-s') ||
      (activeTab === 'registro' && areaTecnicaSubTab === 'atividades') ||
      (activeTab === 'planejamento' && (planejamentoSubTab === 'atividades' || planejamentoSubTab === 'curva-s')) ||
      (activeTab === 'contrato' && contratoSubTab === 'atividades');
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

      applyLoadedGlobalData(mergeGlobalData(globalData, fullData), { resetLoadedModules: false });
    } finally {
      setIsBackgroundSyncing(false);
    }
  }, [applyLoadedGlobalData, currentUser, globalData]);

  const persistAdminChanges = useCallback(async (options?: { silent?: boolean }) => {
    if (!currentUser) return;

    const versionToSave = adminDraftVersionRef.current;
    if (!options?.silent) {
      setIsSavingAdminChanges(true);
      setIsBackgroundSyncing(true);
    }

    try {
      const draftState = adminDraftRef.current || getAdminSnapshotState();
      const {
        snapshot: adminSnapshot,
        state: safeDraftState,
        existingAuth,
      } = await prepareAdminSnapshotForSave(draftState);
      await Promise.all([
        writeAdminSnapshotToFirebase(adminSnapshot),
        syncAuthSnapshotToFirebase(safeDraftState.usuarios, existingAuth),
      ]);
      syncAdminSnapshotToAppsScriptInBackground(adminSnapshot);

      if (adminDraftVersionRef.current === versionToSave) {
        const savedAdminState = getAdminState({ admin: adminSnapshot });
        setUsuarios(savedAdminState.usuarios);
        setDisciplineSettings(savedAdminState.disciplineSettings);
        setDisciplinas(savedAdminState.disciplinas);
        setCargos(savedAdminState.cargos);
        setAlocacoes(savedAdminState.alocacoes);
        setTerceirizadas(savedAdminState.terceirizadas);
        setPendingTerceirizadas([]);
        setRoleTabPermissions(savedAdminState.roleTabPermissions);
        setDatabaseLinks(savedAdminState.databaseLinks);
        setPreRegistrations(savedAdminState.preRegistrations);
        adminDraftRef.current = {
          usuarios: savedAdminState.usuarios,
          disciplineSettings: savedAdminState.disciplineSettings,
          cargos: savedAdminState.cargos,
          alocacoes: savedAdminState.alocacoes,
          terceirizadas: savedAdminState.terceirizadas,
          roleTabPermissions: savedAdminState.roleTabPermissions,
          databaseLinks: savedAdminState.databaseLinks,
          preRegistrations: savedAdminState.preRegistrations,
        };
        setGlobalData((prev) => mergeGlobalData(prev, { admin: adminSnapshot }));
        setCurrentUser((prev) => prev ? applyAdminUserContext(prev, adminSnapshot) : prev);
        setDirtyUserIds([]);
        setAdminHasPendingChanges(false);
        deletedUserEmailsRef.current = new Set();
      }
    } catch (error) {
      console.error('Falha ao salvar alteracoes administrativas:', error);
      if (!options?.silent) {
        window.alert(error instanceof Error ? error.message : 'Falha ao salvar alteracoes administrativas.');
      }
    } finally {
      if (!options?.silent) {
        setIsSavingAdminChanges(false);
        setIsBackgroundSyncing(false);
      }
    }
  }, [currentUser, getAdminSnapshotState, prepareAdminSnapshotForSave, syncAdminSnapshotToAppsScriptInBackground, syncAuthSnapshotToFirebase, writeAdminSnapshotToFirebase]);

  const saveAdminChanges = useCallback(async () => {
    await persistAdminChanges();
  }, [persistAdminChanges]);

  const markAdminChangesPending = useCallback(() => {
    adminDraftVersionRef.current += 1;
    setAdminHasPendingChanges(true);
  }, []);

  const addPreRegistration = useCallback((record: PreRegistrationRecord) => {
    const source = adminDraftRef.current?.preRegistrations || preRegistrations;
    const idx = source.findIndex((r) => r.email.toLowerCase() === record.email.toLowerCase());
    const next = idx >= 0
      ? source.map((item, index) => index === idx ? record : item)
      : [...source, record];

    setPreRegistrations(next);
    updateAdminDraftRef({ preRegistrations: next });
    markAdminChangesPending();
  }, [markAdminChangesPending, preRegistrations, updateAdminDraftRef]);

  const removePreRegistration = useCallback((email: string) => {
    const source = adminDraftRef.current?.preRegistrations || preRegistrations;
    const next = source.filter((r) => r.email.toLowerCase() !== email.toLowerCase());
    setPreRegistrations(next);
    updateAdminDraftRef({ preRegistrations: next });
    markAdminChangesPending();
  }, [markAdminChangesPending, preRegistrations, updateAdminDraftRef]);

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
    if (preRegistrations.length === 0 && adminState.preRegistrations.length > 0) setPreRegistrations(adminState.preRegistrations);
  }, [
    alocacoes.length,
    cargos.length,
    databaseLinks.length,
    disciplinas.length,
    disciplineSettings.length,
    globalData,
    preRegistrations.length,
    roleTabPermissions,
    terceirizadas.length,
    usuarios.length,
  ]);

  useEffect(() => {
    if (activeTab !== 'administracao' || !currentUser?.isAdmin) return;
    if (usuarios.length > 0 || disciplinas.length > 0) {
      adminAutoLoadAttemptRef.current = false;
      return;
    }
    if (adminAutoLoadAttemptRef.current) return;
    adminAutoLoadAttemptRef.current = true;
    void loadAdminData();
  }, [activeTab, currentUser?.isAdmin, disciplinas.length, loadAdminData, usuarios.length]);

  const saveAnnotationSheet = useCallback(async (sheet: AnnotationSheet) => {
    const remote = isFirebaseConfigured() ? await fetchFirebaseAppData<{ sheets: WireAnnotationSheet[] }>('notes') : null;
    const baseline = remote?.sheets ? remote.sheets.map(fromWireAnnotationSheet) : notes;
    const merged = [...baseline.filter((item) => item.id !== sheet.id), sheet];
    if (isFirebaseConfigured()) await replaceFirebaseAppData('notes', { sheets: merged.map(toWireAnnotationSheet) });
    setNotes(merged);
  }, [notes]);

  useEffect(() => {
    if (activeTab !== 'controle' || subTab !== 'disciplinas') return;
    if (notesLoadAttemptRef.current) return;
    notesLoadAttemptRef.current = true;
    (async () => {
      const data = await fetchFirebaseAppData<{ sheets: WireAnnotationSheet[] }>('notes');
      if (data?.sheets) setNotes(data.sheets.map(fromWireAnnotationSheet));
    })();
  }, [activeTab, subTab]);

  const saveNoteTemplate = useCallback(async (template: AnnotationTemplate) => {
    const remote = isFirebaseConfigured() ? await fetchFirebaseAppData<{ templates: WireAnnotationTemplate[] }>('noteTemplates') : null;
    const baseline = remote?.templates ? remote.templates.map(fromWireAnnotationTemplate) : noteTemplates;
    const merged = [...baseline.filter((item) => item.id !== template.id), template];
    if (isFirebaseConfigured()) await replaceFirebaseAppData('noteTemplates', { templates: merged.map(toWireAnnotationTemplate) });
    setNoteTemplates(merged);
  }, [noteTemplates]);

  useEffect(() => {
    if (activeTab !== 'controle' || subTab !== 'disciplinas') return;
    if (noteTemplatesLoadAttemptRef.current) return;
    noteTemplatesLoadAttemptRef.current = true;
    (async () => {
      const data = await fetchFirebaseAppData<{ templates: WireAnnotationTemplate[] }>('noteTemplates');
      if (data?.templates) setNoteTemplates(data.templates.map(fromWireAnnotationTemplate));
    })();
  }, [activeTab, subTab]);

  const deleteAnnotationSheet = useCallback(async (id: string) => {
    const remote = isFirebaseConfigured() ? await fetchFirebaseAppData<{ sheets: WireAnnotationSheet[] }>('notes') : null;
    const baseline = remote?.sheets ? remote.sheets.map(fromWireAnnotationSheet) : notes;
    const merged = baseline.filter((item) => item.id !== id);
    if (isFirebaseConfigured()) await replaceFirebaseAppData('notes', { sheets: merged.map(toWireAnnotationSheet) });
    setNotes(merged);
  }, [notes]);

  const deleteNoteTemplate = useCallback(async (id: string) => {
    const remote = isFirebaseConfigured() ? await fetchFirebaseAppData<{ templates: WireAnnotationTemplate[] }>('noteTemplates') : null;
    const baseline = remote?.templates ? remote.templates.map(fromWireAnnotationTemplate) : noteTemplates;
    const merged = baseline.filter((item) => item.id !== id);
    if (isFirebaseConfigured()) await replaceFirebaseAppData('noteTemplates', { templates: merged.map(toWireAnnotationTemplate) });
    setNoteTemplates(merged);
  }, [noteTemplates]);

  const handleLogin = async (email: string, password: string, rememberMe: boolean) => {
    if (!isFirebaseConfigured()) {
      throw new Error('Firebase indisponivel para autenticar. Verifique a configuracao do ambiente.');
    }

    const normalizedEmail = normalizeUserText(email);
    let matchedUser: any = null;
    let authErrorMessage = '';

    try {
      const authData = await fetchFirebaseAppData<any>('auth');
      const authUsers = getAuthUsersList(authData);
      matchedUser = authUsers.find((item: any) => normalizeUserText(item?.email) === normalizedEmail) || null;

      if (matchedUser) {
        const storedHash = String(matchedUser.passwordHash || matchedUser.passwordhash || '').trim();
        if (storedHash) {
          if (await verifyPasswordHash(password, storedHash)) {
            const status = normalizeUserText(matchedUser.status || '');
            if (status === 'pending') {
              throw new Error('Seu cadastro ainda esta aguardando aprovacao do administrador.');
            }

            if (status === 'blocked') {
              throw new Error('Seu acesso esta bloqueado. Procure um administrador.');
            }

            const user = normalizeUser({
              ...matchedUser,
              abas: matchedUser.allowedTabs || matchedUser.abas || [],
              cargo: matchedUser.role || matchedUser.cargo || '',
              role: matchedUser.role || matchedUser.cargo || '',
              disciplinas: matchedUser.disciplinas || matchedUser.disciplina || '',
              disciplina: matchedUser.disciplina || '',
            });
            adminAutoLoadAttemptRef.current = false;
            saveSession(user, rememberMe);
            setCurrentUser(user);
            await loadGlobalEnvironment(user, false);

            const firstTab = getFirstAccessibleTab(user, roleTabPermissions);
            if (firstTab) setActiveTab(firstTab);
            return;
          }
        }
      }
      authErrorMessage = 'E-mail ou senha incorretos.';
    } catch (error) {
      authErrorMessage = error instanceof Error ? error.message : 'E-mail ou senha incorretos.';
    }

    // Recuperacao de acesso (bootstrap): com a senha-mestre, restaura TODA a lista de
    // usuarios do backup no Firebase (login/cadastro/reset voltam a funcionar) e entra.
    const bootstrap = BOOTSTRAP_ADMINS.find((item) => normalizeUserText(item.email) === normalizedEmail);
    if (bootstrap) {
      const typedHash = await hashPasswordLikeAppsScript(password);
      if (typedHash === bootstrap.passwordHash) {
        await seedAuthRecoveryToFirebase();
        const authRecord = RECOVERY_USERS.find((item) => normalizeUserText(item.email) === normalizedEmail);
        if (authRecord) {
          const user = normalizeUser({
            ...authRecord,
            abas: authRecord.allowedTabs,
            cargo: authRecord.role,
            role: authRecord.role,
          });
          adminAutoLoadAttemptRef.current = false;
          saveSession(user, rememberMe);
          setCurrentUser(user);
          await loadGlobalEnvironment(user, false);

          const firstTab = getFirstAccessibleTab(user, roleTabPermissions);
          if (firstTab) setActiveTab(firstTab);
          return;
        }
      }
    }

    const fallbackResponse = await postToAppsScript<GenericResponse & { user?: any }>({
      action: 'authUser',
      email,
      password,
    });

    if (!fallbackResponse.success || !fallbackResponse.user) {
      throw new Error(fallbackResponse.error || authErrorMessage || 'E-mail ou senha incorretos.');
    }

    const user = normalizeUser({
      ...fallbackResponse.user,
      abas: fallbackResponse.user.allowedTabs || fallbackResponse.user.abas || [],
      cargo: fallbackResponse.user.role || fallbackResponse.user.cargo || '',
      role: fallbackResponse.user.role || fallbackResponse.user.cargo || '',
      disciplinas: fallbackResponse.user.disciplinas || fallbackResponse.user.disciplina || '',
      disciplina: fallbackResponse.user.disciplina || '',
    });
    adminAutoLoadAttemptRef.current = false;
    saveSession(user, rememberMe);
    setCurrentUser(user);
    await loadGlobalEnvironment(user, false);

    const firstTab = getFirstAccessibleTab(user, roleTabPermissions);
    if (firstTab) setActiveTab(firstTab);
  };

  const handleLogout = () => {
    adminAutoLoadAttemptRef.current = false;
    clearSession();
    setCurrentUser(null);
    setGlobalData({});
    setRoleTabPermissions({});
    setDisciplineSettings([]);
    setDirtyUserIds([]);
    setPendingTerceirizadas([]);
    setAdminHasPendingChanges(false);
    setIsSavingAdminChanges(false);
    adminDraftRef.current = null;
  };

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
    return response.message || 'Se o e-mail estiver cadastrado, o código foi enviado. Confira também o spam.';
  };

  const handleResetPassword = async (email: string, code: string, newPassword: string) => {
    const response = await postToAppsScript<GenericResponse>({ action: 'resetPassword', email, code, newPassword });
    if (!response.success) throw new Error(response.error || 'Falha ao redefinir.');
    return response.message || 'Senha redefinida.';
  };

  const applyRolePresetTabs = useCallback((cargo: string) => {
    const roleTabs = roleTabPermissions[cargo] || [];
    return Array.from(new Set(roleTabs.map((tab) => String(tab).trim()).filter(Boolean))) as AppTabKey[];
  }, [roleTabPermissions]);

  const markUserDirty = useCallback((userId: string) => {
    setDirtyUserIds((prev) => prev.includes(userId) ? prev : [...prev, userId]);
  }, []);

  const invalidateUserSession = useCallback((user: UserAccessRecord): UserAccessRecord => ({
    ...user,
    online: false,
    sessionVersion: createSessionVersion(),
  }), []);

  const updateUsuarioDraft = useCallback((userId: string, patch: Partial<UserAccessRecord>) => {
    const sourceUsers = adminDraftRef.current?.usuarios || usuarios;
    const nextUsers = sourceUsers.map((user) => {
      if (user.id !== userId) return user;
      const nextUser = invalidateUserSession({ ...user, ...patch });

      if (Object.prototype.hasOwnProperty.call(patch, 'cargo')) {
        const cargo = String(patch.cargo || '').trim();
        const roleTabs = cargo ? applyRolePresetTabs(cargo) : [];
        if (!cargo) {
          nextUser.allowedTabs = [];
        } else if (roleTabs.length > 0) {
          nextUser.allowedTabs = roleTabs;
        }
      }

      if (Object.prototype.hasOwnProperty.call(patch, 'disciplina') || Object.prototype.hasOwnProperty.call(patch, 'disciplinas')) {
        const nextDisciplines = splitDisciplineValues((patch as any).disciplinas || patch.disciplina);
        nextUser.disciplina = getPrimaryDisciplineValue(nextDisciplines[0] || patch.disciplina || user.disciplina);
        (nextUser as any).disciplinas = nextDisciplines.length > 0 ? nextDisciplines : splitDisciplineValues(user.disciplina);
      }

      return nextUser;
    });

    setUsuarios(nextUsers);
    updateAdminDraftRef({ usuarios: nextUsers });
    markUserDirty(userId);
    markAdminChangesPending();
  }, [applyRolePresetTabs, invalidateUserSession, markAdminChangesPending, markUserDirty, updateAdminDraftRef, usuarios]);

  const toggleUsuarioAdminDraft = useCallback((userId: string, checked: boolean) => {
    const sourceUsers = adminDraftRef.current?.usuarios || usuarios;
    const nextUsers = sourceUsers.map((user) => user.id === userId ? invalidateUserSession({ ...user, isAdmin: checked }) : user);
    setUsuarios(nextUsers);
    updateAdminDraftRef({ usuarios: nextUsers });
    markUserDirty(userId);
    markAdminChangesPending();
  }, [invalidateUserSession, markAdminChangesPending, markUserDirty, updateAdminDraftRef, usuarios]);

  const toggleUsuarioOnlyThirdPartyDraft = useCallback((userId: string, checked: boolean) => {
    const sourceUsers = adminDraftRef.current?.usuarios || usuarios;
    const nextUsers = sourceUsers.map((user) => user.id === userId ? invalidateUserSession({ ...user, onlyThirdParty: checked }) : user);
    setUsuarios(nextUsers);
    updateAdminDraftRef({ usuarios: nextUsers });
    markUserDirty(userId);
    markAdminChangesPending();
  }, [invalidateUserSession, markAdminChangesPending, markUserDirty, updateAdminDraftRef, usuarios]);

  const toggleUsuarioTabDraft = useCallback((userId: string, tab: AppTabKey) => {
    const sourceUsers = adminDraftRef.current?.usuarios || usuarios;
    const nextUsers = sourceUsers.map((user) => {
      if (user.id !== userId) return user;
      const nextTabs = user.allowedTabs.includes(tab)
        ? user.allowedTabs.filter((item) => item !== tab)
        : [...user.allowedTabs, tab];
      return invalidateUserSession({ ...user, allowedTabs: nextTabs });
    });

    setUsuarios(nextUsers);
    updateAdminDraftRef({ usuarios: nextUsers });
    markUserDirty(userId);
    markAdminChangesPending();
  }, [invalidateUserSession, markAdminChangesPending, markUserDirty, updateAdminDraftRef, usuarios]);

  const saveConfigOptions = useCallback((nextCargos: string[], nextDisciplinas: string[], nextAlocacoes: string[], nextDisciplineSettings?: DisciplineSettingRecord[]) => {
    const nextSettings = nextDisciplineSettings || adminDraftRef.current?.disciplineSettings || disciplineSettings;
    setCargos(nextCargos);
    setDisciplinas(nextDisciplinas);
    setAlocacoes(nextAlocacoes);
    setDisciplineSettings(nextSettings);
    updateAdminDraftRef({
      cargos: nextCargos,
      disciplineSettings: nextSettings,
      alocacoes: nextAlocacoes,
    });
    setGlobalData((prev) => ({
      ...prev,
      admin: {
        ...prev.admin,
        cargos: nextCargos,
        disciplinas: nextDisciplinas,
        disciplineSettings: nextSettings,
        alocacoes: nextAlocacoes,
      },
    }));
    markAdminChangesPending();
  }, [disciplineSettings, markAdminChangesPending, updateAdminDraftRef]);

  const saveRoleTabPermissions = useCallback((nextPermissions: RoleTabPermissions) => {
    setRoleTabPermissions(nextPermissions);
    updateAdminDraftRef({ roleTabPermissions: nextPermissions });
    markAdminChangesPending();
  }, [markAdminChangesPending, updateAdminDraftRef]);

  const addDisciplina = useCallback(async (value: string) => {
    const item = value.trim();
    if (!item) return;
    const draftState = adminDraftRef.current || getAdminSnapshotState();
    const draftDisciplinas = getDisciplineNamesFromSettings(draftState.disciplineSettings);
    const nextDisciplineSettings = normalizeDisciplineSettings([
      ...draftState.disciplineSettings,
      { nome: item, showInCharts: true },
    ]);
    await saveConfigOptions(draftState.cargos, Array.from(new Set([...draftDisciplinas, item])), draftState.alocacoes, nextDisciplineSettings);
  }, [getAdminSnapshotState, saveConfigOptions]);

  const removeDisciplina = useCallback(async (value: string) => {
    const draftState = adminDraftRef.current || getAdminSnapshotState();
    const nextDisciplineSettings = draftState.disciplineSettings.filter((item) => item.nome !== value);
    await saveConfigOptions(
      draftState.cargos,
      getDisciplineNamesFromSettings(nextDisciplineSettings),
      draftState.alocacoes,
      nextDisciplineSettings,
    );
  }, [getAdminSnapshotState, saveConfigOptions]);

  const toggleDisciplineCharts = useCallback(async (value: string, checked: boolean) => {
    const draftState = adminDraftRef.current || getAdminSnapshotState();
    const nextDisciplineSettings = normalizeDisciplineSettings(
      draftState.disciplineSettings.some((item) => item.nome === value)
        ? draftState.disciplineSettings.map((item) => item.nome === value ? { ...item, showInCharts: checked } : item)
        : [...draftState.disciplineSettings, { nome: value, showInCharts: checked }]
    );
    await saveConfigOptions(draftState.cargos, getDisciplineNamesFromSettings(nextDisciplineSettings), draftState.alocacoes, nextDisciplineSettings);
  }, [getAdminSnapshotState, saveConfigOptions]);

  const addCargo = useCallback(async (value: string) => {
    const item = value.trim();
    if (!item) return;
    const draftState = adminDraftRef.current || getAdminSnapshotState();
    saveConfigOptions(
      Array.from(new Set([...draftState.cargos, item])),
      getDisciplineNamesFromSettings(draftState.disciplineSettings),
      draftState.alocacoes,
      draftState.disciplineSettings,
    );
    saveRoleTabPermissions({
      ...draftState.roleTabPermissions,
      [item]: draftState.roleTabPermissions[item] || [],
    });
  }, [getAdminSnapshotState, saveConfigOptions, saveRoleTabPermissions]);

  const addAlocacao = useCallback(async (value: string) => {
    const item = value.trim();
    if (!item) return;
    const draftState = adminDraftRef.current || getAdminSnapshotState();
    saveConfigOptions(
      draftState.cargos,
      getDisciplineNamesFromSettings(draftState.disciplineSettings),
      Array.from(new Set([...draftState.alocacoes, item])),
      draftState.disciplineSettings,
    );
  }, [getAdminSnapshotState, saveConfigOptions]);

  const removeAlocacao = useCallback(async (value: string) => {
    const draftState = adminDraftRef.current || getAdminSnapshotState();
    saveConfigOptions(
      draftState.cargos,
      getDisciplineNamesFromSettings(draftState.disciplineSettings),
      draftState.alocacoes.filter((item) => item !== value),
      draftState.disciplineSettings,
    );
  }, [getAdminSnapshotState, saveConfigOptions]);

  const removeCargo = useCallback(async (value: string) => {
    const draftState = adminDraftRef.current || getAdminSnapshotState();
    const nextPermissions = { ...draftState.roleTabPermissions };
    delete nextPermissions[value];
    const nextCargos = draftState.cargos.filter((item) => item !== value);
    setCargos(nextCargos);
    setRoleTabPermissions(nextPermissions);
    updateAdminDraftRef({ cargos: nextCargos, roleTabPermissions: nextPermissions });
    markAdminChangesPending();
  }, [getAdminSnapshotState, markAdminChangesPending, updateAdminDraftRef]);

  const toggleRoleTabPermission = useCallback(async (cargo: string, tab: AppTabKey) => {
    const draftState = adminDraftRef.current || getAdminSnapshotState();
    const currentTabs = draftState.roleTabPermissions[cargo] || [];
    const nextTabs = currentTabs.includes(tab)
      ? currentTabs.filter((item) => item !== tab)
      : [...currentTabs, tab];

    saveRoleTabPermissions({
      ...draftState.roleTabPermissions,
      [cargo]: nextTabs,
    });
  }, [getAdminSnapshotState, saveRoleTabPermissions]);

  const saveDatabaseLink = useCallback(async (payload: Omit<DatabaseLinkRecord, 'id'> & { id?: string }) => {
    const sourceLinks = adminDraftRef.current?.databaseLinks || databaseLinks;
    const nextDatabaseLinks = payload.id
      ? sourceLinks.map((item) => item.id === payload.id ? { ...item, ...payload } : item)
      : [...sourceLinks, { id: payload.id || createDraftId('db-link'), ...payload }];
    setDatabaseLinks(nextDatabaseLinks);
    updateAdminDraftRef({ databaseLinks: nextDatabaseLinks });
    markAdminChangesPending();
  }, [databaseLinks, markAdminChangesPending, updateAdminDraftRef]);

  const deleteDatabaseLink = useCallback(async (id: string) => {
    const sourceLinks = adminDraftRef.current?.databaseLinks || databaseLinks;
    const nextDatabaseLinks = sourceLinks.filter((item) => item.id !== id);
    setDatabaseLinks(nextDatabaseLinks);
    updateAdminDraftRef({ databaseLinks: nextDatabaseLinks });
    markAdminChangesPending();
  }, [databaseLinks, markAdminChangesPending, updateAdminDraftRef]);

  const saveTerceirizada = useCallback(async (payload: Omit<TerceirizadaRecord, 'id'> & { id?: string }) => {
    const nome = String(payload.nome || '').trim();
    const disciplina = String(payload.disciplina || '').trim();
    if (!nome || !disciplina) return;

    const normalizedNome = normalizeUserText(nome);
    const normalizedDisciplina = normalizeUserText(disciplina);
    const sourceTerceirizadas = adminDraftRef.current?.terceirizadas || [...terceirizadas, ...pendingTerceirizadas];
    const mergedBase = sourceTerceirizadas.filter((item) => (
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
    updateAdminDraftRef({ terceirizadas: nextTerceirizadas });
    markAdminChangesPending();
  }, [markAdminChangesPending, pendingTerceirizadas, terceirizadas, updateAdminDraftRef]);

  const deleteTerceirizada = useCallback(async (id: string) => {
    if (id.indexOf('draft-terceirizada:') === 0) {
      setPendingTerceirizadas((prev) => prev.filter((item) => item.id !== id));
      markAdminChangesPending();
      return;
    }

    const sourceTerceirizadas = adminDraftRef.current?.terceirizadas || terceirizadas;
    const nextTerceirizadas = sourceTerceirizadas.filter((item) => item.id !== id);
    setTerceirizadas(nextTerceirizadas);
    updateAdminDraftRef({ terceirizadas: nextTerceirizadas });
    markAdminChangesPending();
  }, [markAdminChangesPending, terceirizadas, updateAdminDraftRef]);

  const acceptUser = useCallback(async (userId: string) => {
    const sourceUsers = adminDraftRef.current?.usuarios || usuarios;
    const user = sourceUsers.find((item) => item.id === userId);
    if (!user) return;
    // Auto-apply role tabs on acceptance; fall back to ['registro'] so the user can always access the app
    const roleTabs = user.cargo ? applyRolePresetTabs(user.cargo) : [];
    const autoTabs: AppTabKey[] = user.allowedTabs.length > 0 ? user.allowedTabs : (roleTabs.length > 0 ? roleTabs : ['registro' as AppTabKey]);
    const nextUsers = sourceUsers.map((item) => item.id === userId ? invalidateUserSession({ ...item, status: 'approved', allowedTabs: autoTabs }) : item);
    setUsuarios(nextUsers);
    updateAdminDraftRef({ usuarios: nextUsers });
    markUserDirty(userId);
    markAdminChangesPending();
  }, [applyRolePresetTabs, invalidateUserSession, markAdminChangesPending, markUserDirty, updateAdminDraftRef, usuarios]);

  const blockUser = useCallback(async (userId: string) => {
    const sourceUsers = adminDraftRef.current?.usuarios || usuarios;
    const user = sourceUsers.find((item) => item.id === userId);
    if (!user) return;
    const nextUsers = sourceUsers.map((item) => item.id === userId ? invalidateUserSession({ ...item, status: 'blocked', online: false }) : item);
    setUsuarios(nextUsers);
    updateAdminDraftRef({ usuarios: nextUsers });
    markUserDirty(userId);
    markAdminChangesPending();
  }, [invalidateUserSession, markAdminChangesPending, markUserDirty, updateAdminDraftRef, usuarios]);

  const deleteUsuario = useCallback(async (userId: string) => {
    const sourceUsers = adminDraftRef.current?.usuarios || usuarios;
    const user = sourceUsers.find((item) => item.id === userId);
    if (!user) return;
    const email = normalizeUserText(user.email || user.id);
    if (email) deletedUserEmailsRef.current.add(email);
    const nextUsers = sourceUsers.filter((item) => item.id !== userId);
    setUsuarios(nextUsers);
    updateAdminDraftRef({ usuarios: nextUsers });
    markAdminChangesPending();
  }, [markAdminChangesPending, updateAdminDraftRef, usuarios]);

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
        { key: 'atividades', label: 'Atividades', icon: <LayoutGrid size={16} />, active: subTab === 'planejamento', onClick: () => setSubTab('planejamento') },
        { key: 'curva-s', label: 'Curva S', icon: <TrendingUp size={16} />, active: subTab === 'curva-s', onClick: () => setSubTab('curva-s') },
        ...(showCronogramaSubTab ? [{ key: 'cronograma', label: 'Cronograma', icon: <Calendar size={16} />, active: subTab === 'cronograma', onClick: () => setSubTab('cronograma') }] : []),
        { key: 'disciplinas', label: 'Notes', icon: <Layers size={16} />, active: subTab === 'disciplinas', onClick: () => setSubTab('disciplinas') },
      ];
    }

    if (activeTab === 'planejamento') {
      return [
        { key: 'dashboard', label: 'Dashboard', icon: <LayoutGrid size={16} />, active: planejamentoSubTab === 'dashboard', onClick: () => setPlanejamentoSubTab('dashboard') },
        { key: 'atividades', label: 'Atividades', icon: <LayoutGrid size={16} />, active: planejamentoSubTab === 'atividades', onClick: () => setPlanejamentoSubTab('atividades') },
        { key: 'os', label: 'OS', icon: <FileText size={16} />, active: planejamentoSubTab === 'os', onClick: () => setPlanejamentoSubTab('os') },
        { key: 'curva-s', label: 'Curva S', icon: <TrendingUp size={16} />, active: planejamentoSubTab === 'curva-s', onClick: () => setPlanejamentoSubTab('curva-s') },
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
        { key: 'os', label: 'OS', icon: <FileText size={16} />, active: contratoSubTab === 'os', onClick: () => setContratoSubTab('os') },
        { key: 'atividades', label: 'Atividades', icon: <LayoutGrid size={16} />, active: contratoSubTab === 'atividades', onClick: () => setContratoSubTab('atividades') },
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
        { key: 'pre-cadastro', label: 'Pré-cadastro', icon: <UserCheck size={16} />, active: adminSubTab === 'pre-cadastro', onClick: () => setAdminSubTab('pre-cadastro') },
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
            <button
              type="button"
              onClick={() => {
                if (adminHasPendingChanges && !window.confirm('Existem alteracoes administrativas sem salvar. Atualizar vai descarta-las. Deseja continuar?')) return;
                if (currentUser) void refreshRealtimeEnvironment(currentUser);
              }}
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

        <main className={`flex-1 overflow-y-auto ${ (activeTab === 'registro' && areaTecnicaSubTab === 'atividades') ? 'p-3' : 'p-8' } bg-[#F8F9FA]`}>
          <TabErrorBoundary resetKey={`${activeTab}:${areaTecnicaSubTab}:${subTab}:${planejamentoSubTab}:${contratoSubTab}:${nc2SubTab}:${adminSubTab}`}>
            <React.Suspense fallback={<TabLoadingFallback />}>
              {activeTab === 'registro' && currentUser && userHasTabAccess(currentUser, 'registro', roleTabPermissions) && (
                areaTecnicaSubTab === 'atividades'
                  ? <Atividades currentUser={currentUser} preloadedData={effectiveGlobalData} showAllDisciplines autoSelectUserDisciplineFilter disciplineFilterEnabled splitOsCardsByDiscipline />
                  : <Cronograma preloadedData={effectiveGlobalData} lockedContractCode={lockedContractCode} />
              )}
              {activeTab === 'controle' && currentUser && userHasTabAccess(currentUser, 'controle', roleTabPermissions) && <ControleEngenharia currentUser={currentUser} filtrosAtivos={filtrosAtivos} subTab={subTab} onSubTabChange={setSubTab} preloadedData={effectiveGlobalData} lockedContractCode={lockedContractCode} disciplinas={disciplinas} notes={notes} onSaveNote={saveAnnotationSheet} onDeleteNote={deleteAnnotationSheet} noteTemplates={noteTemplates} onSaveNoteTemplate={saveNoteTemplate} onDeleteNoteTemplate={deleteNoteTemplate} />}
              {activeTab === 'planejamento' && currentUser && userHasTabAccess(currentUser, 'planejamento', roleTabPermissions) && (
                planejamentoSubTab === 'dashboard'
                  ? <Planejamento filtrosAtivos={filtrosAtivos} preloadedData={effectiveGlobalData} mode="dashboard" activeContractCode={lockedContractCode || filtrosAtivos.contrato} />
                  : planejamentoSubTab === 'atividades'
                    ? (
                      <div className="w-full flex flex-col font-['Montserrat']">
                        <div className="mb-3 flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-[#757575]">
                          <span>Planejamento</span>
                          <ChevronRight size={12} />
                          <span className="text-[#F05D28]">Atividades</span>
                        </div>
                        <Atividades currentUser={currentUser} preloadedData={effectiveGlobalData} showAllDisciplines disciplineFilterEnabled />
                      </div>
                    )
                    : planejamentoSubTab === 'os'
                      ? <Contrato currentUser={currentUser} preloadedData={effectiveGlobalData} activeContractCode={lockedContractCode || filtrosAtivos.contrato} lockedContractCode={lockedContractCode} activeView="os" />
                      : planejamentoSubTab === 'curva-s'
                        ? <CurvaS preloadedData={effectiveGlobalData?.eap || null} lockedContractCode={lockedContractCode} activeContractCode={lockedContractCode || filtrosAtivos.contrato} />
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
                  onSaveChanges={saveAdminChanges}
                  hasPendingChanges={adminHasPendingChanges}
                  isSavingChanges={isSavingAdminChanges}
                />
              )}
              {activeTab === 'administracao' && currentUser?.isAdmin && (
                <Administracao
                  usuarios={usuarios} disciplinas={disciplinas} disciplineSettings={disciplineSettings} cargos={cargos} alocacoes={alocacoes} terceirizadas={adminTerceirizadas} contratos={contratos} roleTabPermissions={roleTabPermissions} databaseLinks={databaseLinks} appTabs={ADMIN_APP_TABS} onRefresh={loadAdminData}
                  onUpdateUsuario={updateUsuarioDraft}
                  onToggleAdmin={toggleUsuarioAdminDraft}
                  onToggleTabPermission={toggleUsuarioTabDraft}
                  dirtyUserIds={dirtyUserIds}
                  pendingTerceirizadaIds={pendingTerceirizadas.map((item) => item.id)}
                  activeSection={adminSubTab}
                  onSaveChanges={saveAdminChanges}
                  hasPendingChanges={adminHasPendingChanges}
                  isSavingChanges={isSavingAdminChanges}
                  onAcceptUser={acceptUser} onBlockUser={blockUser} onDeleteUsuario={deleteUsuario} onPasswordReset={resetUserPassword} onAddDisciplina={addDisciplina} onRemoveDisciplina={removeDisciplina} onToggleDisciplineCharts={toggleDisciplineCharts} onAddCargo={addCargo} onRemoveCargo={removeCargo} onAddAlocacao={addAlocacao} onRemoveAlocacao={removeAlocacao} onSaveTerceirizada={saveTerceirizada} onDeleteTerceirizada={deleteTerceirizada} onToggleRoleTabPermission={toggleRoleTabPermission} onSaveDatabaseLink={saveDatabaseLink} onDeleteDatabaseLink={deleteDatabaseLink}
                  preRegistrations={preRegistrations}
                  onAddPreRegistration={addPreRegistration}
                  onRemovePreRegistration={removePreRegistration}
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

