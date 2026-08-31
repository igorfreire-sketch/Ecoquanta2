import React, { useState, useEffect, useCallback } from 'react';
import SearchableSelect from './components/SearchableSelect';
import {
  ClipboardList,
  Settings,
  Users,
  AlertTriangle,
  Calendar,
  LogOut,
  ChevronRight,
  Bell,
  AtSign,
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
  Home,
  Database,
  Sparkles,
  Moon,
  Sun,
  CalendarDays,
  CalendarClock,
} from 'lucide-react';
import { motion, AnimatePresence, MotionConfig } from 'motion/react';
import type {
  AppTabKey,
  DisciplinaRequest,
  DisciplineSettingRecord,
  UserAccessRecord,
  DatabaseLinkRecord,
  TerceirizadaRecord,
  RoleTabPermissions,
  PreRegistrationRecord,
} from './components/Administracao';
import { ProjectVbaConfigCard } from './components/Administracao';
import LoginScreen, { AuthUser } from './components/LoginScreen';
import CampoDialog from './components/CampoDialog';
import {
  getSheetDisciplinas,
  isConcluidaAntiga,
  NoteProjectsContext,
  type AnnotationBanco,
  type AnnotationSheet,
} from './components/CoordenacaoEngenharia/Anotacoes';
import type { CronogramaDoc } from './components/SolucoesDigitais';
import { isNc2Leader, type Nc2Record } from './components/NaoConformidade2/ncStore';
// ponytail: string literal em vez de importar CRONOGRAMAS_COLLECTION (runtime, nao so tipo) de
// SolucoesDigitais.tsx — esse import puxaria o modulo inteiro (Atividades.tsx, CampoDialog etc.)
// pro bundle principal em vez de ficar so no chunk lazy de <Cronogramas/>. O `import type` acima
// e livre disso: tipos somem na compilacao, nao geram import real.
const CRONOGRAMAS_COLLECTION = 'cronogramas';
import Notificacoes from './components/Notificacoes';
import FirebaseExplorer from './components/FirebaseExplorer';
import Principal from './components/Principal';
import BancoLinksPage from './components/BancoLinksPage';

// Firestore rejects nested arrays, so `rows: string[][]` (legado) and `bancos` (cada um com seu
// proprio rows: string[][]) sao JSON-encoded em strings unicas para storage.
type WireAnnotationSheet = Omit<AnnotationSheet, 'rows' | 'bancos'> & {
  rowsJson?: string;
  bancosJson?: string;
  rows?: string[][];
  bancos?: AnnotationBanco[];
};
type NotesDocument = { sheets?: WireAnnotationSheet[]; [key: string]: unknown };

function toWireAnnotationSheet(sheet: AnnotationSheet): WireAnnotationSheet {
  const { rows, bancos, ...rest } = sheet;
  try {
    return { ...rest, rowsJson: JSON.stringify(rows || []), bancosJson: JSON.stringify(bancos || []) };
  } catch {
    throw new Error(`A nota "${sheet.titulo || sheet.id}" contem dados que nao podem ser serializados.`);
  }
}

function fromWireAnnotationSheet(sheet: WireAnnotationSheet): AnnotationSheet {
  const { rowsJson, bancosJson, rows: rawRows, bancos: rawBancos, ...rest } = sheet;
  const label = String(sheet.titulo || sheet.id || 'sem identificacao');
  let rows: unknown = rawRows || [];
  try {
    if (rowsJson !== undefined) rows = JSON.parse(rowsJson || '[]');
  } catch {
    throw new Error(`A nota "${label}" possui rowsJson invalido. Nenhum dado foi alterado.`);
  }
  if (!Array.isArray(rows) || rows.some((row) => !Array.isArray(row) || row.some((cell) => typeof cell !== 'string'))) {
    throw new Error(`A nota "${label}" possui linhas em formato invalido. Nenhum dado foi alterado.`);
  }
  let bancos: unknown = rawBancos || [];
  try {
    if (bancosJson !== undefined) bancos = JSON.parse(bancosJson || '[]');
  } catch {
    throw new Error(`A nota "${label}" possui bancosJson invalido. Nenhum dado foi alterado.`);
  }
  if (!Array.isArray(bancos) || bancos.some((banco) => (
    !banco || typeof banco !== 'object' || !Array.isArray((banco as AnnotationBanco).rows)
    || (banco as AnnotationBanco).rows.some((row) => !Array.isArray(row) || row.some((cell) => typeof cell !== 'string'))
  ))) {
    throw new Error(`A nota "${label}" possui bancos em formato invalido. Nenhum dado foi alterado.`);
  }
  return { ...rest, rows: rows as string[][], bancos: bancos as AnnotationBanco[] };
}

import { getAppVersionLabel } from './config/appVersion';
import { PATCH_NOTES } from './config/patchNotes';
import { applyAcessibilidade, getStoredAcessibilidade, type Acessibilidade } from './lib/theme';
import { estadoNotificacao, notificarDesktop, pedirPermissaoNotificacao, type PermissaoNotificacao } from './lib/desktopNotify';
import { getLatestEapDisplayDate } from './lib/eapDate';
import {
  applyUserAccessPatch,
  getDisciplinePatch,
  hasPersistedTabAccess,
  mergeDirtyUserRecords,
} from './lib/adminAccess';
import KonamiGame from './components/KonamiGame';
import {
  DEFAULT_DISCIPLINE_SETTINGS,
  getDisciplineGroups,
  getDisciplineSector,
  getPrimaryDisciplineValue,
  getUserDisciplineList,
  splitDisciplineValues,
} from './lib/disciplineCatalog';
import {
  acceptNoteProposal,
  applyNoteSave,
  rejectNoteProposal,
  type NoteSaveIntent,
} from './lib/noteProposals';
import {
  fetchBootstrapDataFromFirebase,
  fetchFirebaseAppData,
  fetchCronogramaDataFromFirebase,
  fetchEapDataFromFirebase,
  fetchFirebaseCollection,
  fetchRegistroDataFromFirebase,
  isFirebaseConfigured,
  hashPasswordLikeAppsScript,
  mutateFirebaseAppData,
  subscribeFirebaseAppData,
  replaceFirebaseAppData,
  canDeleteNote,
  ensureGoogleFirebaseAuth,
  signInWithGooglePopup,
  signOutFirebase,
  setFirebaseDocument,
} from './lib/firebaseDb';

const Atividades = React.lazy(() => import('./components/Atividades'));
const ControleEngenharia = React.lazy(() => import('./components/CoordenacaoEngenharia'));
const Planejamento = React.lazy(() => import('./components/CoordenacaoEngenharia/DashboardEngenharia'));
const NaoConformidades = React.lazy(() => import('./components/NaoConformidade2/Conformidade'));
// Kanban vive na Principal; o clique no card atravessa pra aba de Conformidade (Preenchimento).
const Nc2Kanban = React.lazy(() => import('./components/NaoConformidade2/Kanban'));
const Cronograma = React.lazy(() => import('./components/Cronograma'));
const Cronogramas = React.lazy(() => import('./components/Cronogramas'));
const Notes = React.lazy(() => import('./components/CoordenacaoEngenharia/Notes'));
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

// Domínio corporativo entra automaticamente na Principal; demais abas dependem do admin.
const CORPORATE_DOMAIN = '@quantaconsultoria.com';
const isCorporateEmail = (email: string) => email.toLowerCase().trim().endsWith(CORPORATE_DOMAIN);

function normalizeUserText(value?: string) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
}

type AdminGuardUser = Pick<UserAccessRecord, 'id' | 'email' | 'isAdmin' | 'status'>;

function getCriticalAdminMutationRisk(
  before: AdminGuardUser[],
  after: AdminGuardUser[],
  currentEmail: string,
  currentIsAdmin: boolean,
) {
  const key = (user: AdminGuardUser) => normalizeUserText(user.email || user.id);
  const currentKey = normalizeUserText(currentEmail);
  const afterCurrent = after.find((user) => key(user) === currentKey);

  if (currentIsAdmin && (!afterCurrent || !afterCurrent.isAdmin || afterCurrent.status !== 'approved')) {
    return { blocked: 'Voce nao pode rebaixar, bloquear ou excluir seu proprio acesso administrativo.', requiresConfirmation: false };
  }

  if (!after.some((user) => user.isAdmin && user.status === 'approved')) {
    return { blocked: 'A alteracao deixaria o sistema sem administrador ativo.', requiresConfirmation: false };
  }

  const requiresConfirmation = before.some((user) => {
    if (!user.isAdmin || key(user) === currentKey) return false;
    const next = after.find((candidate) => key(candidate) === key(user));
    return !next || !next.isAdmin || next.status === 'blocked';
  });

  return { blocked: '', requiresConfirmation };
}

if (import.meta.env.DEV) {
  const self = { id: 'a', email: 'a@x.com', isAdmin: true, status: 'approved' as const };
  console.assert(
    Boolean(getCriticalAdminMutationRisk([self], [{ ...self, isAdmin: false }], self.email, true).blocked),
    'EQ-13 self-check: auto-rebaixamento deve ser bloqueado.',
  );
}

function shouldLockUserToContract(user?: AuthUser | null) {
  if (!user) return false;
  if (user.isAdmin) return false;

  const role = normalizeUserText(user.role);
  const leadershipKeywords = ['lider', 'coorden', 'geren', 'diretor', 'gestor', 'supervisor'];
  if (leadershipKeywords.some((keyword) => role.includes(keyword))) return false;

  return Boolean(String(user.contrato || '').trim());
}

type AppTab = 'principal' | 'registro' | 'controle' | 'planejamento' | 'contrato' | 'nc2' | 'cronograma' | 'solucoes' | 'banco-links' | 'administracao';
// 'project' e irma de 'disciplinas' (Notas): as duas sao paginas globais, iguais em toda area.
type AreaTecnicaSubTab = 'atividades' | 'disciplinas' | 'project';
type ControleSubTab = 'profissionais' | 'dashboard' | 'alocacoes' | 'curva-s' | 'planejamento' | 'alertas' | 'disciplinas' | 'project';
type PlanejamentoSubTab = 'dashboard' | 'alertas' | 'atividades' | 'curva-s' | 'disciplinas' | 'project';
type Nc2SubTab = 'dashboard' | 'preenchimento' | 'revisoes' | 'terceirizadas' | 'disciplinas' | 'project';
type ContratoSubTab = 'os' | 'interferencias' | 'prioridades' | 'atividades' | 'disciplinas' | 'project';
type AdminSubTab = 'usuarios' | 'terceirizadas' | 'gerenciamento' | 'pre-cadastro' | 'firebase';
const ADMIN_APP_TABS: Array<{ key: AppTabKey; label: string }> = [
  { key: 'registro', label: 'Área Técnica' },
  { key: 'nc2', label: 'Conformidade' },
  { key: 'controle', label: 'Coordenação de Engenharia' },
  { key: 'planejamento', label: 'Planejamento' },
  { key: 'contrato', label: 'Contrato' },
  { key: 'cronograma', label: 'Cronograma' },
  // Chave historica 'solucoes': agora libera a sub-aba Project (a area propria deixou de existir).
  { key: 'solucoes', label: 'Project' },
  { key: 'banco-links', label: 'Banco de Links' },
  { key: 'administracao', label: 'Administração' },
];

// Rotulo de cada area pro breadcrumb (Area > Sub-aba), igual ao nome no rail.
const AREA_LABELS: Record<string, string> = {
  principal: 'Principal',
  'banco-links': 'Banco de Links',
  ...Object.fromEntries(ADMIN_APP_TABS.map((tab) => [tab.key, tab.label])),
};

const DATABASE_LINK_SEED: DatabaseLinkRecord = {
  id: 'acompanhamento-cliente',
  nome: 'Acompanhamento Cliente',
  link: 'https://quanta-dash.vercel.app/',
  descricao: '',
};

function withSeedDatabaseLinks(items: any[]): DatabaseLinkRecord[] {
  const seedUrl = DATABASE_LINK_SEED.link.trim().toLowerCase();
  const links = (Array.isArray(items) ? items : [])
    .map((item: any) => ({
      id: String(item?.id || '').trim(),
      nome: String(item?.nome || item?.name || ''),
      link: String(item?.link || item?.url || ''),
      descricao: String(item?.descricao || item?.description || ''),
      atualizadoEm: item?.atualizadoEm ? String(item.atualizadoEm) : undefined,
    }))
    .filter((item) => item.nome.trim() && item.link.trim());

  let seeded = false;
  const merged = links.filter((item) => {
    const isSeed =
      item.id === DATABASE_LINK_SEED.id ||
      item.link.trim().toLowerCase() === seedUrl;
    if (!isSeed) return true;
    if (seeded) return false;
    seeded = true;
    item.id = DATABASE_LINK_SEED.id;
    item.nome = DATABASE_LINK_SEED.nome;
    item.link = DATABASE_LINK_SEED.link;
    item.descricao = DATABASE_LINK_SEED.descricao;
    return true;
  });

  return seeded ? merged : [DATABASE_LINK_SEED, ...merged];
}

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

type AdminEditableField = 'usuarios' | 'disciplineSettings' | 'cargos' | 'alocacoes' | 'terceirizadas' | 'roleTabPermissions' | 'databaseLinks' | 'preRegistrations';

interface AdminSnapshotState {
  usuarios: UserAccessRecord[];
  disciplineSettings: DisciplineSettingRecord[];
  cargos: string[];
  alocacoes: string[];
  terceirizadas: TerceirizadaRecord[];
  roleTabPermissions: RoleTabPermissions;
  databaseLinks: DatabaseLinkRecord[];
  preRegistrations: PreRegistrationRecord[];
  editedFields?: AdminEditableField[];
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
  return /^_?OS(?=$|[\s_\-.0-9A-Za-zì-ÿ])/i.test(text);
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

const OFFICIAL_DISCIPLINE_GROUPS = getDisciplineGroups();

function normalizeAdminDisciplineName(value: any) {
  const cleaned = String(value || '').trim();
  if (!cleaned) return '';
  const direct = OFFICIAL_DISCIPLINE_GROUPS.find((item) => normalizeUserText(item) === normalizeUserText(cleaned));
  if (direct) return direct;
  const sector = getDisciplineSector(cleaned);
  return OFFICIAL_DISCIPLINE_GROUPS.find((item) => normalizeUserText(item) === normalizeUserText(sector)) || '';
}

function normalizeAdminDisciplineValues(value: any) {
  return Array.from(new Set(
    splitDisciplineValues(value).map(normalizeAdminDisciplineName).filter(Boolean),
  ));
}

function normalizeDisciplineSettings(value: any): DisciplineSettingRecord[] {
  const source = Array.isArray(value) ? value : [];
  const byName = new Map<string, DisciplineSettingRecord>();

  source.forEach((entry) => {
    const normalized = normalizeDisciplineSetting(entry);
    if (!normalized) return;
    const nome = normalizeAdminDisciplineName(normalized.nome);
    if (!nome) return;
    const current = byName.get(nome);
    byName.set(nome, { nome, showInCharts: current?.showInCharts !== false && normalized.showInCharts !== false });
  });

  return byName.size > 0 ? Array.from(byName.values()) : DEFAULT_DISCIPLINE_SETTINGS;
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
    // Usuario novo fica verde na Administracao ate um admin mexer nele. Base antiga
    // (quem ja tem cargo ou abas) entra como revisada pra nao ficar tudo verde.
    adminReviewed: raw?.adminReviewed === true
      || Boolean(String(raw?.cargo || raw?.role || '').trim())
      || allowedTabsSource.filter(Boolean).length > 0,
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
  if (tab === 'principal') return true; // Principal e a casa de todo usuario logado.
  if (user.isAdmin) return true;
  // Dominio corporativo ja entra liberado nessas 3 abas, sem depender de permissao do admin.
  if (isCorporateEmail(user.email || '') && (tab === 'registro' || tab === 'cronograma' || tab === 'banco-links')) {
    return true;
  }
  const userTabs = Array.isArray(user.abas) ? user.abas.map(String) : [];
  if (tab === 'registro') {
    return hasPersistedTabAccess(userTabs, 'registro');
  }
  if (tab === 'nc2') {
    return hasPersistedTabAccess(userTabs, 'nc2', ['nc']);
  }
  if (tab === 'controle') {
    return hasPersistedTabAccess(userTabs, 'controle', ['alocacoes']);
  }
  if (tab === 'planejamento') {
    // Planejamento e uma aba propria — NAO deve ser liberada so por ter 'controle'.
    return hasPersistedTabAccess(userTabs, 'planejamento');
  }
  if (tab === 'contrato') {
    return hasPersistedTabAccess(userTabs, 'contrato', ['contratos']);
  }
  if (tab === 'solucoes') {
    if (hasPersistedTabAccess(userTabs, 'solucoes')) return true;
    const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    return getUserDisciplineList(user).some((d) => norm(d).includes('solucoes digitais'));
  }
  return hasPersistedTabAccess(userTabs, tab);
}

// Entrar no sistema (login ou sessao restaurada) sempre cai na Principal.
function getFirstAccessibleTab(_user: AuthUser, _roleTabPermissions: RoleTabPermissions = {}): AppTab {
  return 'principal';
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
  const validDisciplinaNames = getDisciplineNamesFromSettings(disciplineSettings);
  // Disciplina removida do catalogo continua no vinculo como legado: nunca apagar acesso
  // de usuario ao normalizar uma leitura administrativa.
  const sanitizedUsers = normalizedUsers.map((user) => {
    const disciplinas = Array.from(new Set(
      getUserDisciplineList(user).map((item) => normalizeAdminDisciplineName(item) || String(item || '').trim()).filter(Boolean),
    ));
    return {
      ...user,
      disciplina: disciplinas[0] || '',
      disciplinas,
    };
  });

  return {
    ...admin,
    users: sanitizedUsers,
    usuarios: sanitizedUsers,
    disciplineSettings,
    disciplinas: validDisciplinaNames,
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
     terceirizadas: Array.isArray(admin.terceirizadas) ? admin.terceirizadas.map((item: any) => {
       const rawDisciplinas = Array.isArray(item.disciplinas) ? item.disciplinas : String(item.disciplina || item.discipline || '').split(',');
       const disciplinas = Array.from(new Set(
         rawDisciplinas.map((value: any) => normalizeAdminDisciplineName(value) || String(value || '').trim()).filter(Boolean),
       ));
       return {
         id: String(item.id || ''),
         nome: String(item.nome || item.name || ''),
         disciplina: disciplinas.join(', '),
         disciplinas,
       };
     }).filter((item: TerceirizadaRecord) => item.id && item.nome) : [],
    databaseLinks: withSeedDatabaseLinks(admin.databaseLinks),
    roleTabPermissions: admin.roleTabPermissions && typeof admin.roleTabPermissions === 'object' ? admin.roleTabPermissions as RoleTabPermissions : {},
    preRegistrations: Array.isArray(admin.preRegistrations)
      ? (admin.preRegistrations as any[]).map((r: any) => {
          const disciplinas = Array.from(new Set(splitDisciplineValues(r.disciplinas || r.disciplina)));
          return {
            ...r,
            disciplina: disciplinas[0] || '',
            disciplinas,
            allowedTabs: (Array.isArray(r.allowedTabs) ? r.allowedTabs : String(r.allowedTabs || r.abas || '').split(',').map((item: string) => item.trim()).filter(Boolean)) as AppTabKey[],
          };
        }) as PreRegistrationRecord[]
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
  baseUsers: UserAccessRecord[],
  dirtyUserIds: readonly string[],
  deletedUserEmails: readonly string[],
): AdminSnapshotState {
  const remoteAdminState = getAdminState({ admin: existingAdmin || {} });
  const remoteAuthUsers = getAuthUsersList(existingAuth);
  const remoteUsers = mergeUserAccessRecords(remoteAdminState.usuarios, remoteAuthUsers);
  const mergedUsers = mergeDirtyUserRecords({
    remoteUsers,
    baseUsers,
    draftUsers: draftState.usuarios,
    dirtyUserIds,
    deletedUserEmails,
  });
  const remoteUserCount = remoteAdminState.usuarios.length + remoteAuthUsers.length;

  if (remoteUserCount > 0 && mergedUsers.length === 0) {
    throw new Error('Protecao de dados: o salvamento administrativo tentou publicar uma lista vazia de usuarios.');
  }

  const draftHasField = (field: Exclude<AdminEditableField, 'roleTabPermissions'>) => draftState.editedFields
    ? draftState.editedFields.includes(field)
    : draftState[field].length > 0;
  const draftHasObject = (field: 'roleTabPermissions') => draftState.editedFields
    ? draftState.editedFields.includes(field)
    : hasObjectEntries(draftState[field]);

  return {
    usuarios: mergedUsers,
    disciplineSettings: draftHasField('disciplineSettings')
      ? draftState.disciplineSettings
      : remoteAdminState.disciplineSettings,
    cargos: draftHasField('cargos') ? draftState.cargos : remoteAdminState.cargos,
    alocacoes: draftHasField('alocacoes') ? draftState.alocacoes : remoteAdminState.alocacoes,
    terceirizadas: draftHasField('terceirizadas') ? draftState.terceirizadas : remoteAdminState.terceirizadas,
    roleTabPermissions: draftHasObject('roleTabPermissions')
      ? draftState.roleTabPermissions
      : remoteAdminState.roleTabPermissions,
    databaseLinks: draftHasField('databaseLinks') ? draftState.databaseLinks : remoteAdminState.databaseLinks,
    preRegistrations: draftHasField('preRegistrations') ? draftState.preRegistrations : remoteAdminState.preRegistrations,
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

  if (Array.isArray(data.contractInterferences)) {
    next.contractInterferences = data.contractInterferences.filter((item: any) => String(item?.contratoCodigo || '').trim() === target);
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
    const nome = String(item?.nome || item?.name || '').trim();
    if (!nome) return;
    const email = buildThirdPartyEmail(String(item?.id || ''), nome);
    const disciplinas = Array.from(new Set<string>(
      (Array.isArray(item?.disciplinas) ? item.disciplinas : String(item?.disciplina || item?.discipline || '').split(','))
        .map((value: any) => String(value || '').trim())
        .filter(Boolean),
    ));
    (disciplinas.length > 0 ? disciplinas : ['Sem disciplina']).forEach((disciplina) => {
      const bucketKey = Object.keys(merged).find((key) => normalizeUserText(key) === normalizeUserText(disciplina)) || disciplina;
      const bucket = Array.isArray(merged[bucketKey]) ? [...merged[bucketKey]] : [];
      if (!bucket.some((entry: any) => String(entry?.email || '').trim().toLowerCase() === email.toLowerCase())) {
        bucket.push({ nome, email, cargo: 'Terceirizada', disciplina, isThirdParty: true });
      }
      merged[bucketKey] = bucket;
    });
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
  const [patchNotesOpen, setPatchNotesOpen] = useState(false);
  const [requestedDisciplinas, setRequestedDisciplinas] = useState<string[]>([]);
  const [acessibilidade, setAcessibilidade] = useState<Acessibilidade>(() => getStoredAcessibilidade());

  useEffect(() => {
    applyAcessibilidade(acessibilidade);
  }, [acessibilidade]);

  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);

  const [activeTab, setActiveTab] = React.useState<AppTab>('principal');
  const [principalSubTab, setPrincipalSubTab] = React.useState<'inicio' | 'project'>('inicio');
  const [areaTecnicaSubTab, setAreaTecnicaSubTab] = React.useState<AreaTecnicaSubTab>('atividades');
  const [subTab, setSubTab] = React.useState<ControleSubTab>('planejamento');
  const [planejamentoSubTab, setPlanejamentoSubTab] = React.useState<PlanejamentoSubTab>('atividades');
  const [nc2SubTab, setNc2SubTab] = React.useState<Nc2SubTab>('dashboard');
  // Registro clicado no Kanban da Principal: fica aqui ate a Conformidade montar e consumir.
  const [pendingNc2EditRecord, setPendingNc2EditRecord] = React.useState<Nc2Record | null>(null);
  const [contratoSubTab, setContratoSubTab] = React.useState<ContratoSubTab>('atividades');
  const [adminSubTab, setAdminSubTab] = React.useState<AdminSubTab>('usuarios');
  const [cronogramaSubTab, setCronogramaSubTab] = React.useState<'cronograma' | 'disciplinas'>('cronograma');
  const [sidebarOpen, setSidebarOpen] = React.useState(true);
  const [globalData, setGlobalData] = useState<GlobalData>({});

  // Setas <-/-> trocam a sub-aba dentro do setor atual (ex.: Curva S -> Notas). A lista ordenada
  // (headerTabs) e escrita neste ref a cada render; o listener global le dela. Para nas bordas,
  // nao cruza de setor, e ignora quando o foco esta num campo de texto.
  const subAbasNavRef = React.useRef<Array<{ active?: boolean; onClick?: () => void }>>([]);
  useEffect(() => {
    const aoTeclar = (event: KeyboardEvent) => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (document.body.dataset.minigame === 'on') return; // minigame secreto usa as setas

      const alvo = document.activeElement as HTMLElement | null;
      if (alvo && (alvo.tagName === 'INPUT' || alvo.tagName === 'TEXTAREA' || alvo.tagName === 'SELECT' || alvo.isContentEditable)) return;
      const abas = subAbasNavRef.current;
      if (abas.length < 2) return;
      const atual = abas.findIndex((aba) => aba.active);
      if (atual < 0) return;
      const proximo = event.key === 'ArrowRight' ? atual + 1 : atual - 1;
      if (proximo < 0 || proximo >= abas.length) return;
      abas[proximo].onClick?.();
    };
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, []);

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
  // Auto-aceite por dominio corporativo sem pre-cadastro: pausa o login e pede a disciplina
  // antes de criar o usuario, senao ele entra "fantasma" (sem contexto pro admin distribuir depois).
  const [pendingCorporateSignup, setPendingCorporateSignup] = useState<{
    email: string;
    normalizedEmail: string;
    preRegistration: any;
    authData: any;
    adminState: ReturnType<typeof getAdminState>;
    rememberMode: boolean;
  } | null>(null);
  const [corporateDisciplinaChoice, setCorporateDisciplinaChoice] = useState('');
  const [corporateSignupSubmitting, setCorporateSignupSubmitting] = useState(false);
  const [adminConfirmationOpen, setAdminConfirmationOpen] = useState(false);
  const pendingAdminConfirmationRef = React.useRef<{
    resolve: () => void;
    reject: (error: Error) => void;
  } | null>(null);
  const requestAdminConfirmation = useCallback(() => new Promise<void>((resolve, reject) => {
    pendingAdminConfirmationRef.current = { resolve, reject };
    setAdminConfirmationOpen(true);
  }), []);
  const finishAdminConfirmation = useCallback((values: Record<string, string>) => {
    const pending = pendingAdminConfirmationRef.current;
    pendingAdminConfirmationRef.current = null;
    setAdminConfirmationOpen(false);
    if (!pending) return;
    if (values.confirmacao === 'CONFIRMAR') pending.resolve();
    else pending.reject(new Error('Alteracao administrativa cancelada.'));
  }, []);
  const cancelAdminConfirmation = useCallback(() => {
    const pending = pendingAdminConfirmationRef.current;
    pendingAdminConfirmationRef.current = null;
    setAdminConfirmationOpen(false);
    pending?.reject(new Error('Alteracao administrativa cancelada.'));
  }, []);
  const [dirtyUserIds, setDirtyUserIds] = useState<string[]>([]);
  const dirtyUserIdsRef = React.useRef<Set<string>>(new Set());
  const [moduleErrors, setModuleErrors] = useState<Record<string, string>>({});
  const [moduleLoading, setModuleLoading] = useState<Record<string, boolean>>({});
  const moduleLoadingRef = React.useRef<Set<string>>(new Set());
  const [adminHasPendingChanges, setAdminHasPendingChanges] = useState(false);
  const [isSavingAdminChanges, setIsSavingAdminChanges] = useState(false);
  const [loadedModules, setLoadedModules] = useState<Record<string, boolean>>({});
  const adminAutoLoadAttemptRef = React.useRef(false);
  const adminDraftVersionRef = React.useRef(0);
  const adminDraftRef = React.useRef<AdminSnapshotState | null>(null);
  const adminUserBaselineRef = React.useRef<UserAccessRecord[]>([]);
  const deletedUserEmailsRef = React.useRef<Set<string>>(new Set());
  const databaseLinksComSeed = React.useMemo(() => withSeedDatabaseLinks(databaseLinks), [databaseLinks]);

  const markUserDirty = useCallback((userId: string) => {
    dirtyUserIdsRef.current.add(userId);
    setDirtyUserIds((prev) => prev.includes(userId) ? prev : [...prev, userId]);
  }, []);

  // ANOTACOES (Disciplinas)
  const [notes, setNotes] = useState<AnnotationSheet[]>([]);
  const [notesLoadError, setNotesLoadError] = useState('');
  // Notas que aparecem no Kanban da Principal, sem as concluidas ha 10+ dias (essas vivem na aba
  // "Notas Concluidas" de Anotacoes.tsx). As do seu setor so pra lider/coordenador (isNc2Leader,
  // mesmo gate dos cards de conformidade); as que te marcaram, ou privadas suas, aparecem pra
  // qualquer usuario (dono ve a propria nota privada, mas ela nao vaza pro setor).
  const notasKanbanPrincipal = React.useMemo(() => {
    if (!currentUser) return [];
    const ehLider = isNc2Leader(currentUser);
    const minhasDisciplinas = new Set(getUserDisciplineList(currentUser));
    return notes.filter((sheet) => (
      !isConcluidaAntiga(sheet)
      && (
        (sheet.autorEmail !== currentUser.email && ehLider && sheet.publica !== false && getSheetDisciplinas(sheet).some((item) => minhasDisciplinas.has(item)))
        || (sheet.marcadosUsuarios || []).includes(currentUser.email)
        || (sheet.publica === false && sheet.autorEmail === currentUser.email)
      )
    ));
  }, [notes, currentUser]);
  // Documentos completos alimentam o seletor Note -> Project; Cronogramas.tsx continua dono do
  // editor/migracao e faz a leitura propria sem acoplar seu fluxo a este estado.
  const [noteProjects, setNoteProjects] = useState<CronogramaDoc[]>([]);
  const [noteProjectsLoadError, setNoteProjectsLoadError] = useState('');
  const noteIdsComCronograma = React.useMemo(() => {
    const ids = new Set<string>();
    noteProjects.forEach((project) => (project.rows || []).forEach((row) => { if (row.noteId) ids.add(row.noteId); }));
    return ids;
  }, [noteProjects]);
  const cronogramasLoadAttemptRef = React.useRef(false);

  // Aba do usuario: pedido de outras disciplinas, aprovado/negado pelo admin.
  const [disciplinaRequests, setDisciplinaRequests] = useState<DisciplinaRequest[]>([]);
  const disciplinaRequestsLoadAttemptRef = React.useRef(false);

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
    adminDraftRef.current = {
      ...getAdminSnapshotState(),
      editedFields: adminDraftRef.current?.editedFields,
    };
  }, [getAdminSnapshotState]);

  const updateAdminDraftRef = useCallback((patch: Partial<AdminSnapshotState>) => {
    const editableFields = ['usuarios', 'disciplineSettings', 'cargos', 'alocacoes', 'terceirizadas', 'roleTabPermissions', 'databaseLinks', 'preRegistrations'] as const;
    const touchedFields = editableFields.filter((field) => Object.prototype.hasOwnProperty.call(patch, field));
    const next = {
      ...(adminDraftRef.current || getAdminSnapshotState()),
      ...patch,
      editedFields: Array.from(new Set([
        ...(adminDraftRef.current?.editedFields || []),
        ...touchedFields,
      ])),
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
        adminReviewed: user.adminReviewed === true,
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
        disciplinas: item.disciplinas || String(item.disciplina || '').split(',').map((value) => value.trim()).filter(Boolean),
      })),
      roleTabPermissions: snapshotState.roleTabPermissions,
      databaseLinks: withSeedDatabaseLinks(snapshotState.databaseLinks),
      preRegistrations: snapshotState.preRegistrations,
    };
  }, [getAdminSnapshotState]);

  const buildAuthFirebaseSnapshot = useCallback((sourceUsers?: UserAccessRecord[], existingAuth?: any, deletedUserEmails: readonly string[] = []) => {
    const users = sourceUsers || usuarios;
    const existingUsers = getAuthUsersList(existingAuth);
    const existingByEmail = new Map(existingUsers.map((item: any) => [normalizeUserText(item?.email), item]));
    const deletedEmails = new Set(deletedUserEmails.map(normalizeUserText));

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
      return email && !mappedEmails.has(email) && !deletedEmails.has(email);
    });

    return {
      users: [...mappedUsers, ...preservedExistingUsers],
      publishedAt: new Date().toISOString(),
      source: 'EcoQuanta-Web',
    };
  }, [usuarios]);

  const prepareAdminSnapshotForSave = useCallback(async (draftState: AdminSnapshotState) => {
    const dirtyUserIdsForSave: string[] = Array.from(dirtyUserIdsRef.current);
    const deletedUserEmailsForSave: string[] = Array.from(deletedUserEmailsRef.current);
    const baseUsersForSave = adminUserBaselineRef.current;
    const [existingAdmin, existingAuth] = isFirebaseConfigured()
      ? await Promise.all([
          fetchFirebaseAppData<any>('admin'),
          fetchFirebaseAppData<any>('auth'),
        ])
      : [null, null];
    const safeMergedState = mergeAdminStateWithRemote(
      draftState,
      existingAdmin,
      existingAuth,
      baseUsersForSave,
      dirtyUserIdsForSave,
      deletedUserEmailsForSave,
    );
    // Guard de admin destrutivo (EQ-13) so faz sentido quando a edicao realmente mexeu em
    // `usuarios` -- pre-cadastro e outros campos (cargos, disciplinas, links...) nunca tocam
    // nisso, mas antes rodavam o mesmo check e disparavam o prompt bloqueante por engano
    // (a lista local de usuarios ficava defasada da remota so' de reabrir a aba).
    const usuariosEdited = !draftState.editedFields || draftState.editedFields.includes('usuarios');
    if (usuariosEdited) {
      const existingUsers = mergeUserAccessRecords(
        getAdminState({ admin: existingAdmin || {} }).usuarios,
        getAuthUsersList(existingAuth),
      );
      const risk = getCriticalAdminMutationRisk(existingUsers, safeMergedState.usuarios, currentUser?.email || '', Boolean(currentUser?.isAdmin));
      if (risk.blocked) throw new Error(risk.blocked);
      if (risk.requiresConfirmation) await requestAdminConfirmation();
    }
    const snapshot = buildAdminFirebaseSnapshot(safeMergedState);

    return {
      snapshot,
      state: safeMergedState,
      existingAuth,
      deletedUserEmails: deletedUserEmailsForSave,
    };
  }, [buildAdminFirebaseSnapshot, currentUser, requestAdminConfirmation]);

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

  const syncAuthSnapshotToFirebase = useCallback(async (overrideUsers?: UserAccessRecord[], existingAuthOverride?: any, deletedUserEmails: readonly string[] = []) => {
    if (!isFirebaseConfigured()) return;
    const existingAuth = existingAuthOverride ?? await fetchFirebaseAppData<any>('auth');
    await replaceFirebaseAppData('auth', buildAuthFirebaseSnapshot(overrideUsers, existingAuth, deletedUserEmails));
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
      setLoadedModules(Array.isArray(normalizedData.cronograma) ? { cronograma: true } : {});
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
      adminUserBaselineRef.current = adminState.usuarios;
      setCurrentUser((prev) => prev ? applyAdminUserContext(prev, normalizedData.admin) : prev);
    }
    setDirtyUserIds([]);
    dirtyUserIdsRef.current = new Set();
    setAdminHasPendingChanges(false);
    deletedUserEmailsRef.current = new Set();
  }, []);

  const loadCollaborationData = useCallback(async (user: AuthUser) => {
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
    const fetchCollectionSafe = async (name: string, contractScoped = false) => {
      try {
        if (contractScoped && !user.isAdmin && !String(user.contrato || '').trim()) return [];
        return await fetchFirebaseCollection(name, contractScoped && !user.isAdmin
          ? { field: 'contratoCodigo', value: String(user.contrato || '').trim() }
          : undefined);
      } catch (error) {
        console.error(`❌ Erro ao carregar colecao ${name}:`, error);
        return [];
      }
    };

    const [planningTodos, contractPriorities, contractInterferences, resolvedAlerts, osSettings] = await Promise.all([
      fetchCollectionSafe('planningTodos'),
      fetchCollectionSafe('contractPriorities', true),
      fetchCollectionSafe('contractInterferences', true),
      fetchCollectionSafe('resolvedAlerts'),
      fetchCollectionSafe('osSettings', true),
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
        loadCollaborationData(user),
      ]);

      const mergedData = applyUnifiedEapData(mergeGlobalData(bootstrapData, {
        ...(registro.success !== false ? { registro } : {}),
        eap,
        ...(cronograma ? { cronograma } : {}),
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
        const [bootstrapData, cronograma, eap, collaboration] = await Promise.all([
          fetchBootstrapDataFromFirebase(),
          fetchCronogramaDataFromFirebase(),
          fetchEapDataFromFirebase(),
          loadCollaborationData(user),
        ]);
        fullData = applyUnifiedEapData({
          ...bootstrapData,
          ...(cronograma ? { cronograma } : {}),
          ...collaboration,
        }, eap);
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
          dirtyUserIdsRef.current = new Set();
          adminUserBaselineRef.current = [];
          deletedUserEmailsRef.current = new Set();
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
    // Principal e liberada pra todo mundo: sem acesso a aba atual, sempre volta pra ela.
    if (!userHasTabAccess(currentUser, activeTab, roleTabPermissions)) setActiveTab('principal');
  }, [currentUser, activeTab, roleTabPermissions]);

  const loadFirebaseModule = useCallback(async (moduleName: 'registro' | 'cronograma' | 'eap') => {
    if (!currentUser || loadedModules[moduleName] || moduleLoadingRef.current.has(moduleName)) return;

    moduleLoadingRef.current.add(moduleName);
    setModuleLoading((prev) => ({ ...prev, [moduleName]: true }));
    setIsBackgroundSyncing(true);
    try {
      setModuleErrors((prev) => {
        if (!prev[moduleName]) return prev;
        const next = { ...prev };
        delete next[moduleName];
        return next;
      });
      let loaded = false;
      if (moduleName === 'registro') {
        const registro = await fetchRegistroDataFromFirebase(currentUser);
        if (registro.success !== false) {
          setGlobalData((prev) => {
            return mergeGlobalData(prev, { registro });
          });
          loaded = true;
        } else {
          setModuleErrors((prev) => ({ ...prev, registro: registro.error || 'Falha ao carregar os contratos.' }));
        }
      } else if (moduleName === 'cronograma') {
        const cronograma = await fetchCronogramaDataFromFirebase();
        if (cronograma) {
          setGlobalData((prev) => {
            return mergeGlobalData(prev, { cronograma });
          });
          loaded = true;
        } else {
          setModuleErrors((prev) => ({ ...prev, cronograma: 'Falha ao carregar o cronograma.' }));
        }
      } else if (moduleName === 'eap') {
        const eap = await fetchEapDataFromFirebase();
        if (eap) {
          setGlobalData((prev) => {
            return applyUnifiedEapData(prev, eap);
          });
          loaded = true;
        } else {
          setModuleErrors((prev) => ({ ...prev, eap: 'Falha ao carregar as atividades.' }));
        }
      }
      if (loaded) setLoadedModules((prev) => ({ ...prev, [moduleName]: true }));
    } catch (error) {
      const message = error instanceof Error ? error.message : `Falha ao carregar ${moduleName}.`;
      setModuleErrors((prev) => ({ ...prev, [moduleName]: message }));
    } finally {
      moduleLoadingRef.current.delete(moduleName);
      setModuleLoading((prev) => ({ ...prev, [moduleName]: false }));
      setIsBackgroundSyncing(false);
    }
  }, [currentUser, loadedModules]);

  useEffect(() => {
    if (!currentUser || preloading) return;

    const wantsCronograma = activeTab === 'cronograma';

    const wantsEap =
      (activeTab === 'controle' && subTab === 'curva-s') ||
      (activeTab === 'registro' && areaTecnicaSubTab === 'atividades') ||
      (activeTab === 'planejamento' && (planejamentoSubTab === 'atividades' || planejamentoSubTab === 'curva-s')) ||
      (activeTab === 'contrato' && contratoSubTab === 'atividades') ||
      (activeTab === 'nc2' && nc2SubTab === 'preenchimento');
    const wantsRegistro =
      activeTab === 'registro' ||
      activeTab === 'controle' ||
      activeTab === 'planejamento' ||
      activeTab === 'contrato' ||
      activeTab === 'nc2' ||
      activeTab === 'cronograma' ||
      // Kanban da Principal usa contratos/OS pra mostrar nome no lugar do codigo.
      activeTab === 'principal';

    if (wantsRegistro) void loadFirebaseModule('registro');
    if (wantsCronograma) {
      void loadFirebaseModule('cronograma');
      void loadFirebaseModule('eap');
    }
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
      await ensureGoogleFirebaseAuth(currentUser.email);
      const draftState = adminDraftRef.current || getAdminSnapshotState();
      const {
        snapshot: adminSnapshot,
        state: safeDraftState,
        existingAuth,
        deletedUserEmails,
      } = await prepareAdminSnapshotForSave(draftState);
      if (adminDraftVersionRef.current !== versionToSave) return;
      await Promise.all([
        writeAdminSnapshotToFirebase(adminSnapshot),
        syncAuthSnapshotToFirebase(safeDraftState.usuarios, existingAuth, deletedUserEmails),
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
        adminUserBaselineRef.current = savedAdminState.usuarios;
        setGlobalData((prev) => mergeGlobalData(prev, { admin: adminSnapshot }));
        setCurrentUser((prev) => prev ? applyAdminUserContext(prev, adminSnapshot) : prev);
        setDirtyUserIds([]);
        dirtyUserIdsRef.current = new Set();
        setAdminHasPendingChanges(false);
        deletedUserEmailsRef.current = new Set();
      }
    } catch (error) {
      console.error('Falha ao salvar alteracoes administrativas:', error);
      // "silent" so suprime o spinner de sucesso - uma falha real (ex: disciplina/cargo que
      // "nao entra") tem que aparecer sempre, senao o usuario nao tem como saber que a
      // gravacao caiu e o item nunca foi salvo.
      window.alert(error instanceof Error ? error.message : 'Falha ao salvar alteracoes administrativas.');
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

  const addPreRegistration = useCallback(async (record: PreRegistrationRecord) => {
    const email = String(record.email || '').trim().toLowerCase();
    if (!email || !email.includes('@')) return;
    const disciplinas = Array.from(new Set(
      splitDisciplineValues(record.disciplinas || record.disciplina).map((item) => normalizeAdminDisciplineName(item) || String(item || '').trim()).filter(Boolean),
    ));
    if (disciplinas.length === 0) return;
    const normalizedRecord: PreRegistrationRecord = {
      ...record,
      email,
      disciplina: disciplinas[0],
      disciplinas,
      allowedTabs: Array.from(new Set(
        (Array.isArray(record.allowedTabs) ? record.allowedTabs : [])
          .map((tab) => String(tab).trim())
          .filter((tab) => ADMIN_APP_TABS.some((item) => item.key === tab))
      )) as AppTabKey[],
    };
    const source = adminDraftRef.current?.preRegistrations || preRegistrations;
    const idx = source.findIndex((r) => r.email.toLowerCase() === email);
    const next = idx >= 0
      ? source.map((item, index) => index === idx ? normalizedRecord : item)
      : [...source, normalizedRecord];

    setPreRegistrations(next);
    updateAdminDraftRef({ preRegistrations: next });
    markAdminChangesPending();
    // Persiste na hora: o pre-cadastro e estado compartilhado, entao passa a valer para todos
    // os admins sem depender do botao global "Salvar".
    await persistAdminChanges({ silent: true });
  }, [markAdminChangesPending, persistAdminChanges, preRegistrations, updateAdminDraftRef]);

  const removePreRegistration = useCallback(async (email: string) => {
    const source = adminDraftRef.current?.preRegistrations || preRegistrations;
    const next = source.filter((r) => r.email.toLowerCase() !== email.toLowerCase());
    setPreRegistrations(next);
    updateAdminDraftRef({ preRegistrations: next });
    markAdminChangesPending();
    await persistAdminChanges({ silent: true });
  }, [markAdminChangesPending, persistAdminChanges, preRegistrations, updateAdminDraftRef]);

  useEffect(() => {
    if (!globalData.admin) return;
    if (usuarios.length > 0 && disciplinas.length > 0) return;

    const normalizedAdmin = normalizeLoadedAdmin(globalData.admin, globalData);
    const adminState = getAdminState({ ...globalData, admin: normalizedAdmin });

    if (usuarios.length === 0 && adminState.usuarios.length > 0) {
      setUsuarios(adminState.usuarios);
      adminUserBaselineRef.current = adminState.usuarios;
    }
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

  const saveAnnotationSheet = useCallback(async (sheet: AnnotationSheet, intent: NoteSaveIntent = {}) => {
    if (!currentUser) throw new Error('Sessao encerrada. Entre novamente antes de salvar.');
    const now = new Date().toISOString();
    const mutateNotes = (current: NotesDocument | null): NotesDocument => {
      if (current?.sheets !== undefined && !Array.isArray(current.sheets)) {
        throw new Error('O documento de notas tem formato invalido. Nenhum dado foi alterado.');
      }
      const baseline = (current?.sheets || []).map(fromWireAnnotationSheet);
      const existing = baseline.find((item) => item.id === sheet.id);
      let saved: AnnotationSheet;

      if (intent.proposalDecision) {
        if (!existing) throw new Error('A nota desta proposta nao foi encontrada.');
        saved = intent.proposalDecision === 'accept'
          ? acceptNoteProposal(existing, currentUser.email, now)
          : rejectNoteProposal(existing, currentUser.email);
      } else {
        saved = applyNoteSave(existing, sheet, currentUser, now);
        if (existing) {
          saved = {
            ...saved,
            historicoSalvamentos: [
              ...(existing.historicoSalvamentos || []),
              { titulo: existing.titulo, salvoEm: existing.updatedAt || now, salvoPor: currentUser.nome || currentUser.email },
            ],
          };
        }
      }

      const merged = existing
        ? baseline.map((item) => (item.id === saved.id ? saved : item))
        : [...baseline, saved];
      return { ...(current || {}), sheets: merged.map(toWireAnnotationSheet) };
    };

    if (!isFirebaseConfigured()) throw new Error('Firebase indisponivel. A nota nao foi salva.');
    const result = await mutateFirebaseAppData<NotesDocument>('notes', mutateNotes);
    const merged = (result.sheets || []).map(fromWireAnnotationSheet);
    setNotes(merged);
    setNotesLoadError('');
  }, [currentUser]);

  // Todas as areas usam a mesma chave de sub-aba pra pagina Notes.
  const subAbaAtual = ({
    registro: areaTecnicaSubTab,
    principal: principalSubTab,
    controle: subTab,
    planejamento: planejamentoSubTab,
    contrato: contratoSubTab,
    nc2: nc2SubTab,
    cronograma: cronogramaSubTab,
    administracao: adminSubTab,
  } as Record<string, string>)[activeTab];

  // Leva pra pagina de Notas sem sair da area em que a pessoa esta (toda area tem essa sub-aba).
  const irParaNotas = () => {
    const setters: Record<string, (valor: any) => void> = {
      registro: setAreaTecnicaSubTab,
      controle: setSubTab,
      planejamento: setPlanejamentoSubTab,
      contrato: setContratoSubTab,
      nc2: setNc2SubTab,
      cronograma: setCronogramaSubTab,
    };
    const ir = setters[activeTab];
    // Administracao nao tem pagina de Notas: cai na Area Tecnica.
    if (ir) ir('disciplinas');
    else { setActiveTab('registro'); setAreaTecnicaSubTab('disciplinas'); }
  };

  // ---- Notificações ----
  // "Visto" fica no proprio navegador: contador zerado nao merece uma escrita no Firebase.
  const chaveNotif = currentUser ? `ecoquanta:notif:${currentUser.email}` : '';
  const [notifVistas, setNotifVistas] = useState<{ setor: string; direta: string }>({ setor: '', direta: '' });

  useEffect(() => {
    if (!chaveNotif) return;
    try {
      const salvo = localStorage.getItem(chaveNotif);
      setNotifVistas(salvo ? JSON.parse(salvo) : { setor: '', direta: '' });
    } catch {
      setNotifVistas({ setor: '', direta: '' });
    }
  }, [chaveNotif]);

  const marcarNotificacoesVistas = (tipo: 'setor' | 'direta') => {
    if (!chaveNotif) return;
    const proximo = { ...notifVistas, [tipo]: new Date().toISOString() };
    setNotifVistas(proximo);
    try { localStorage.setItem(chaveNotif, JSON.stringify(proximo)); } catch { /* modo privado: so nao persiste */ }
  };

  // Dispensa individual: some so da SUA lista (localStorage), a nota e o vinculo continuam intactos
  // pros outros usuarios. Separado do "Limpar" (marcarNotificacoesVistas), que so zera o contador.
  const chaveNotifDispensadas = currentUser ? `ecoquanta:notif-dispensadas:${currentUser.email}` : '';
  const [notifDispensadas, setNotifDispensadas] = useState<{ setor: string[]; direta: string[] }>({ setor: [], direta: [] });

  useEffect(() => {
    if (!chaveNotifDispensadas) return;
    try {
      const salvo = localStorage.getItem(chaveNotifDispensadas);
      setNotifDispensadas(salvo ? JSON.parse(salvo) : { setor: [], direta: [] });
    } catch {
      setNotifDispensadas({ setor: [], direta: [] });
    }
  }, [chaveNotifDispensadas]);

  const dispensarNotificacao = (tipo: 'setor' | 'direta', id: string) => {
    if (!chaveNotifDispensadas) return;
    const proximo = { ...notifDispensadas, [tipo]: [...notifDispensadas[tipo], id] };
    setNotifDispensadas(proximo);
    try { localStorage.setItem(chaveNotifDispensadas, JSON.stringify(proximo)); } catch { /* modo privado: so nao persiste */ }
  };

  const { notificacoesSetor, notificacoesDiretas, naoLidosSetor, naoLidosDiretas } = React.useMemo(() => {
    const vazio = { notificacoesSetor: [], notificacoesDiretas: [], naoLidosSetor: 0, naoLidosDiretas: 0 };
    if (!currentUser) return vazio;

    const minhasDisciplinas = new Set(getUserDisciplineList(currentUser));
    const deOutros = notes.filter((nota) => nota.autorEmail !== currentUser.email);
    const recentesPrimeiro = (lista: AnnotationSheet[]) => [...lista]
      .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''))
      .slice(0, 15);

    const paraItem = (nota: AnnotationSheet) => ({
      id: nota.id,
      titulo: nota.titulo || 'Sem título',
      descricao: nota.autorNome || nota.autorEmail || 'Autor desconhecido',
      data: nota.updatedAt ? new Date(nota.updatedAt).toLocaleDateString('pt-BR') : undefined,
    });

    // Setor: nota pública de alguém da mesma disciplina que você.
    const setor = deOutros.filter((nota) => (
      nota.publica !== false && getSheetDisciplinas(nota).some((item) => minhasDisciplinas.has(item))
      && !notifDispensadas.setor.includes(nota.id)
    ));
    // Direta: você foi citado (vinculado) na nota.
    const direta = deOutros.filter((nota) => (
      (nota.marcadosUsuarios || []).includes(currentUser.email) && !notifDispensadas.direta.includes(nota.id)
    ));

    const contarNovas = (lista: AnnotationSheet[], desde: string) => (
      desde ? lista.filter((nota) => (nota.updatedAt || '') > desde).length : lista.length
    );

    return {
      notificacoesSetor: recentesPrimeiro(setor).map(paraItem),
      notificacoesDiretas: recentesPrimeiro(direta).map(paraItem),
      naoLidosSetor: contarNovas(setor, notifVistas.setor),
      naoLidosDiretas: contarNovas(direta, notifVistas.direta),
    };
  }, [notes, currentUser, notifVistas, notifDispensadas]);

  // --- Notificacao de desktop ---
  // Dispara quando chega nota nova que cita voce ou que e da sua disciplina. A primeira
  // passada so registra o que ja existia: sem isso o usuario tomaria um bombardeio ao logar.
  const [permissaoNotificacao, setPermissaoNotificacao] = useState<PermissaoNotificacao>(() => estadoNotificacao());
  const jaAvisadas = React.useRef<Set<string> | null>(null);

  useEffect(() => {
    const conhecidas = jaAvisadas.current;
    const atuais = [
      ...notificacoesDiretas.map((item) => ({ ...item, tipo: 'direta' as const })),
      ...notificacoesSetor.map((item) => ({ ...item, tipo: 'setor' as const })),
    ];

    if (conhecidas === null) {
      jaAvisadas.current = new Set(atuais.map((item) => `${item.tipo}:${item.id}`));
      return;
    }

    for (const item of atuais) {
      const chave = `${item.tipo}:${item.id}`;
      if (conhecidas.has(chave)) continue;
      conhecidas.add(chave);
      notificarDesktop({
        titulo: item.tipo === 'direta' ? 'Você foi citado numa nota' : 'Nova nota da sua disciplina',
        corpo: `${item.titulo} — ${item.descricao}`,
        tag: chave,
        aoClicar: () => abrirNotaNotificada(item.id),
      });
    }
  }, [notificacoesDiretas, notificacoesSetor]);

  // Trocar de usuario zera o rastro, senao o proximo login herdaria o que o anterior ja viu.
  useEffect(() => { jaAvisadas.current = null; }, [currentUser?.email]);

  const pedirPermissaoNotificacaoDesktop = useCallback(async () => {
    setPermissaoNotificacao(await pedirPermissaoNotificacao());
  }, []);

  const [notaParaAbrir, setNotaParaAbrir] = useState<AnnotationSheet | null>(null);
  const abrirNotaNotificada = (id: string) => {
    const nota = notes.find((item) => item.id === id);
    if (!nota) return;
    irParaNotas();
    setNotaParaAbrir(nota);
  };

  // Link direto de uma nota (?nota=<id> na URL, ex: colado na descricao do evento do Google
  // Agenda - ver linkNoteToEvent). So tenta depois que as notas carregaram; limpa o parametro
  // da URL logo em seguida pra nao reabrir de novo num F5 ou trocar de aba.
  useEffect(() => {
    if (!currentUser || notes.length === 0) return;
    const idNaUrl = new URLSearchParams(window.location.search).get('nota');
    if (!idNaUrl) return;
    abrirNotaNotificada(idNaUrl);
    const url = new URL(window.location.href);
    url.searchParams.delete('nota');
    window.history.replaceState({}, '', url.toString());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser, notes]);

  useEffect(() => {
    // As notas alimentam a pagina de Notas, os dois sinos, os contadores da Principal e o
    // Kanban, entao carregam ao vivo (nao so uma vez por sessao): appData/notes muda quando
    // qualquer usuario salva/move uma nota, inclusive a propria escrita otimista desta sessao.
    if (!currentUser) return;
    let active = true;
    const load = async () => {
      try {
        const data = await fetchFirebaseAppData<NotesDocument>('notes');
        if (!active) return;
        if (data?.sheets !== undefined && !Array.isArray(data.sheets)) {
          throw new Error('O documento de notas tem formato invalido.');
        }
        if (data?.sheets) setNotes(data.sheets.map(fromWireAnnotationSheet));
        setNotesLoadError('');
      } catch (error) {
        if (!active) return;
        const message = error instanceof Error ? error.message : 'Falha ao ler as notas.';
        console.error('Erro ao carregar notas:', error);
        setNotesLoadError(`${message} A copia local anterior foi preservada.`);
      }
    };
    void load();
    const unsubscribe = subscribeFirebaseAppData('notes', () => void load());
    return () => {
      active = false;
      unsubscribe();
    };
  }, [currentUser?.email]);

  useEffect(() => {
    // Documentos completos alimentam o seletor Note -> Project; esta leitura nunca migra nem grava.
    if (!currentUser) return;
    if (cronogramasLoadAttemptRef.current) return;
    cronogramasLoadAttemptRef.current = true;
    (async () => {
      try {
        const cronogramas = await fetchFirebaseCollection<CronogramaDoc>(CRONOGRAMAS_COLLECTION);
        setNoteProjects(cronogramas);
        setNoteProjectsLoadError('');
      } catch (error) {
        console.error('Erro ao carregar Projects para as notas:', error);
        setNoteProjectsLoadError('Nao foi possivel carregar os Projects. Tente novamente mais tarde.');
      }
    })();
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser) return;
    if (disciplinaRequestsLoadAttemptRef.current) return;
    disciplinaRequestsLoadAttemptRef.current = true;
    (async () => {
      const data = await fetchFirebaseAppData<{ requests: DisciplinaRequest[] }>('disciplinaRequests');
      if (data?.requests) setDisciplinaRequests(data.requests);
    })();
  }, [currentUser]);

  // Usuario pede pra entrar em outras disciplinas: substitui o pedido pendente dele (se houver) por um novo.
  const submitDisciplinaRequest = useCallback(async (disciplinasPedidas: string[]) => {
    if (!currentUser) return;
    const remote = isFirebaseConfigured() ? await fetchFirebaseAppData<{ requests: DisciplinaRequest[] }>('disciplinaRequests') : null;
    const baseline = remote?.requests ?? disciplinaRequests;
    const request: DisciplinaRequest = {
      id: createDraftId('discreq'),
      userEmail: normalizeUserText(currentUser.email),
      userNome: currentUser.nome,
      disciplinas: disciplinasPedidas,
      criadoEm: new Date().toISOString(),
    };
    const merged = [...baseline.filter((item) => normalizeUserText(item.userEmail) !== normalizeUserText(currentUser.email)), request];
    if (isFirebaseConfigured()) await replaceFirebaseAppData('disciplinaRequests', { requests: merged });
    setDisciplinaRequests(merged);
  }, [currentUser, disciplinaRequests]);

  // Primeira disciplina do usuario entra direto (sem invalidar a sessao dele); troca depois vira pedido.
  const definirDisciplinasDoUsuario = useCallback(async (escolhidas: string[]) => {
    if (!currentUser || escolhidas.length === 0) return;
    if (getUserDisciplineList(currentUser).length > 0) {
      await submitDisciplinaRequest(escolhidas);
      return;
    }
    const sourceUsers = adminDraftRef.current?.usuarios || usuarios;
    const currentRecord = sourceUsers.find((user) => normalizeUserText(user.email) === normalizeUserText(currentUser.email));
    const nextUsers = sourceUsers.map((user) => (user !== currentRecord ? user : {
      ...user,
      disciplina: getPrimaryDisciplineValue(escolhidas[0]),
      disciplinas: escolhidas,
    }));
    setUsuarios(nextUsers);
    updateAdminDraftRef({ usuarios: nextUsers });
    markUserDirty(currentRecord?.id || currentUser.email);
    markAdminChangesPending();
    await persistAdminChanges({ silent: true });
  }, [currentUser, markAdminChangesPending, markUserDirty, persistAdminChanges, submitDisciplinaRequest, updateAdminDraftRef, usuarios]);

  const deleteAnnotationSheet = useCallback(async (id: string) => {
    if (!currentUser) throw new Error('Sessao encerrada. Entre novamente antes de excluir.');
    const mutateNotes = (current: NotesDocument | null): NotesDocument => {
      if (current?.sheets !== undefined && !Array.isArray(current.sheets)) {
        throw new Error('O documento de notas tem formato invalido. Nenhum dado foi alterado.');
      }
      const baseline = (current?.sheets || []).map(fromWireAnnotationSheet);
      const target = baseline.find((item) => item.id === id);
      if (!target) return { ...(current || {}), sheets: baseline.map(toWireAnnotationSheet) };
      if (!canDeleteNote(currentUser, target.autorEmail)) {
        throw new Error('Apenas o autor da nota ou um administrador do sistema pode exclui-la.');
      }
      return {
        ...(current || {}),
        sheets: baseline.filter((item) => item.id !== id).map(toWireAnnotationSheet),
      };
    };
    if (!isFirebaseConfigured()) throw new Error('Firebase indisponivel. A nota nao foi excluida.');
    const result = await mutateFirebaseAppData<NotesDocument>('notes', mutateNotes);
    setNotes((result.sheets || []).map(fromWireAnnotationSheet));
  }, [currentUser]);

  const createNoteProject = useCallback(async (title: string, origemNotaId?: string): Promise<CronogramaDoc> => {
    const trimmedTitle = title.trim();
    if (!currentUser) throw new Error('Sessao encerrada. Entre novamente antes de criar o Project.');
    if (!trimmedTitle) throw new Error('Informe o titulo do Project.');
    if (!isFirebaseConfigured()) throw new Error('Firebase indisponivel. O Project nao foi criado.');
    const now = new Date().toISOString();
    const project: CronogramaDoc = {
      id: crypto.randomUUID(),
      titulo: trimmedTitle,
      autorEmail: currentUser.email,
      autorNome: currentUser.nome,
      publica: true,
      colunasCustom: [],
      rows: [],
      createdAt: now,
      updatedAt: now,
      // Nasceu dentro de uma nota: continua sendo um doc normal da colecao `cronogramas` (aparece
      // na lista Project como qualquer outro), mas la ele e somente leitura.
      ...(origemNotaId ? { origemNotaId } : {}),
    };
    await setFirebaseDocument(CRONOGRAMAS_COLLECTION, project.id, project);
    setNoteProjects((previous) => [project, ...previous.filter((item) => item.id !== project.id)]);
    return project;
  }, [currentUser]);

  // Salva o Project editado DENTRO da nota — mesma colecao/mesma funcao de escrita que a tela
  // solta usa; a nota nunca guarda copia das linhas, so o `projectId`.
  const saveNoteProject = useCallback(async (project: CronogramaDoc): Promise<void> => {
    if (!isFirebaseConfigured()) throw new Error('Firebase indisponivel. O Project nao foi salvo.');
    const atualizado = { ...project, updatedAt: new Date().toISOString() };
    await setFirebaseDocument(CRONOGRAMAS_COLLECTION, atualizado.id, atualizado);
    setNoteProjects((previous) => previous.map((item) => (item.id === atualizado.id ? atualizado : item)));
  }, []);

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

  const finishGoogleLogin = async (matchedUser: any, rememberMode: boolean) => {
    const status = normalizeUserText(matchedUser.status || '');
    if (status === 'pending') throw new Error('Seu cadastro ainda esta aguardando aprovacao do administrador.');
    if (status === 'blocked') throw new Error('Seu acesso esta bloqueado. Procure um administrador.');

    const user = normalizeUser({
      ...matchedUser,
      abas: matchedUser.allowedTabs || matchedUser.abas || [],
      cargo: matchedUser.role || matchedUser.cargo || '',
      role: matchedUser.role || matchedUser.cargo || '',
      disciplinas: matchedUser.disciplinas || matchedUser.disciplina || '',
      disciplina: matchedUser.disciplina || '',
    });
    adminAutoLoadAttemptRef.current = false;
    saveSession(user, rememberMode);
    setCurrentUser(user);
    await loadGlobalEnvironment(user, false);

    const firstTab = getFirstAccessibleTab(user, roleTabPermissions);
    if (firstTab) setActiveTab(firstTab);
  };

  const createAndFinishGoogleUser = async (params: {
    email: string;
    normalizedEmail: string;
    preRegistration: any;
    disciplinas: string[];
    authData: any;
    adminState: ReturnType<typeof getAdminState>;
    rememberMode: boolean;
  }) => {
    const { email, normalizedEmail, preRegistration, disciplinas, authData, adminState, rememberMode } = params;
    const preRegistrationAny = (preRegistration || {}) as any;
    const cargo = String(preRegistration?.cargo || preRegistrationAny.role || '').trim();
    const allowedTabs = Array.from(new Set(
      (preRegistration?.allowedTabs || [])
        .map((tab: any) => String(tab).trim())
        .filter(Boolean),
    )) as AppTabKey[];
    const approvedUser = normalizeUserAccessRecord({
      id: normalizedEmail,
      nome: String(preRegistrationAny.nome || preRegistrationAny.name || email.split('@')[0] || email).trim(),
      email,
      cargo,
      disciplina: disciplinas[0] || '',
      disciplinas,
      alocacao: preRegistration?.alocacao || '',
      contrato: preRegistration?.contrato || '',
      status: 'approved',
      allowedTabs,
      isAdmin: false,
      showInCharts: true,
      adminReviewed: Boolean(preRegistration),
    });
    const nextUsers = mergeUserAccessRecords(adminState.usuarios, [approvedUser]);
    await syncAuthSnapshotToFirebase(nextUsers, authData);
    setUsuarios(nextUsers);
    const matchedUser = {
      ...approvedUser,
      role: approvedUser.cargo,
      cargo: approvedUser.cargo,
      allowedTabs: approvedUser.allowedTabs,
      abas: approvedUser.allowedTabs,
    };
    await finishGoogleLogin(matchedUser, rememberMode);
  };

  // Login com Google (Firebase Auth): usa acesso existente ou materializa o pré-cadastro aprovado.
  // Dominio corporativo sem pre-cadastro (sem disciplina definida por um admin): pausa aqui e
  // pede pro usuario escolher a dele no popup (setPendingCorporateSignup) antes de criar o
  // registro -- senao ele entrava "fantasma", sem disciplina nenhuma, e o admin nao tinha
  // como saber quem precisava de cargo/abas.
  const handleGoogleLogin = async (rememberMode: boolean) => {
    if (!isFirebaseConfigured()) {
      throw new Error('Firebase indisponivel para autenticar. Verifique a configuracao do ambiente.');
    }

    const email = await signInWithGooglePopup();
    const normalizedEmail = normalizeUserText(email);
    const authData = await fetchFirebaseAppData<any>('auth');
    const matchedUser: any = getAuthUsersList(authData).find(
      (item: any) => normalizeUserText(item?.email) === normalizedEmail,
    ) || null;

    if (matchedUser) {
      await finishGoogleLogin(matchedUser, rememberMode);
      return;
    }

    const adminData = await fetchFirebaseAppData<any>('admin');
    const adminState = getAdminState({ admin: adminData || {} });
    const preRegistration = adminState.preRegistrations.find((record) => normalizeUserText(record.email) === normalizedEmail);

    if (!preRegistration && !isCorporateEmail(email)) {
      throw new Error('Esta conta Google nao esta cadastrada no EcoQuanta. Peca a um administrador ou use "Cadastrar".');
    }

    const preRegistrationAny = (preRegistration || {}) as any;
    const disciplinas = splitDisciplineValues(preRegistrationAny.disciplinas || preRegistration?.disciplina);

    if (disciplinas.length === 0) {
      setCorporateDisciplinaChoice('');
      setPendingCorporateSignup({ email, normalizedEmail, preRegistration, authData, adminState, rememberMode });
      return;
    }

    await createAndFinishGoogleUser({ email, normalizedEmail, preRegistration, disciplinas, authData, adminState, rememberMode });
  };

  const confirmCorporateSignupDiscipline = async () => {
    if (!pendingCorporateSignup || !corporateDisciplinaChoice) return;
    const { email, normalizedEmail, preRegistration, authData, adminState, rememberMode } = pendingCorporateSignup;
    setCorporateSignupSubmitting(true);
    try {
      await createAndFinishGoogleUser({
        email, normalizedEmail, preRegistration, authData, adminState, rememberMode,
        disciplinas: [corporateDisciplinaChoice],
      });
      setPendingCorporateSignup(null);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Falha ao concluir o cadastro.');
    } finally {
      setCorporateSignupSubmitting(false);
    }
  };

  const handleLogout = () => {
    void signOutFirebase().catch((error) => console.warn('Nao foi possivel encerrar a sessao Firebase:', error));
    adminAutoLoadAttemptRef.current = false;
    clearSession();
    setCurrentUser(null);
    setGlobalData({});
    setRoleTabPermissions({});
    setDisciplineSettings([]);
    setDirtyUserIds([]);
    dirtyUserIdsRef.current = new Set();
    adminUserBaselineRef.current = [];
    deletedUserEmailsRef.current = new Set();
    setPendingTerceirizadas([]);
    setAdminHasPendingChanges(false);
    setIsSavingAdminChanges(false);
    adminDraftRef.current = null;
    cronogramasLoadAttemptRef.current = false;
    setNotes([]);
    setNoteProjects([]);
    setNotesLoadError('');
    setNoteProjectsLoadError('');
  };

  const handleRegister = async (name: string, email: string, password: string) => {
    // Trava de e-mail duplicado no cliente: le os usuarios do auth (Firebase, leitura anonima) e
    // barra na hora com mensagem clara, sem depender so da checagem do Apps Script (que tambem
    // valida). Se a leitura falhar, nao bloqueia — o servidor ainda faz a checagem final.
    const emailNorm = String(email || '').trim().toLowerCase();
    if (emailNorm && isFirebaseConfigured()) {
      try {
        const authData = await fetchFirebaseAppData<any>('auth');
        const jaExiste = getAuthUsersList(authData).some(
          (item: any) => String(item?.email || item?.id || '').trim().toLowerCase() === emailNorm,
        );
        if (jaExiste) throw new Error('Este e-mail já está cadastrado.');
      } catch (erro) {
        if (erro instanceof Error && erro.message === 'Este e-mail já está cadastrado.') throw erro;
        // Falha de leitura do Firebase: segue e deixa o Apps Script decidir.
      }
    }

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

  // Todo caminho de edicao do admin passa por aqui: e o gatilho que tira o usuario do estado "novo".
  const invalidateUserSession = useCallback((user: UserAccessRecord): UserAccessRecord => ({
    ...user,
    adminReviewed: true,
    online: false,
    sessionVersion: createSessionVersion(),
  }), []);

  const updateUsuarioDraft = useCallback((userId: string, patch: Partial<UserAccessRecord>) => {
    const sourceUsers = adminDraftRef.current?.usuarios || usuarios;
    const nextUsers = sourceUsers.map((user) => {
      if (user.id !== userId) return user;
      const nextUser = invalidateUserSession(applyUserAccessPatch(user, patch));

      if (Object.prototype.hasOwnProperty.call(patch, 'disciplina') || Object.prototype.hasOwnProperty.call(patch, 'disciplinas')) {
        Object.assign(nextUser, getDisciplinePatch(patch));
      }

      return nextUser;
    });

    setUsuarios(nextUsers);
    updateAdminDraftRef({ usuarios: nextUsers });
    markUserDirty(userId);
    markAdminChangesPending();
  }, [invalidateUserSession, markAdminChangesPending, markUserDirty, updateAdminDraftRef, usuarios]);

  // Admin aprova (disciplinasAprovadas com pelo menos 1 item) ou nega (vazio) um pedido; some da fila nos dois casos.
  const resolveDisciplinaRequest = useCallback(async (request: DisciplinaRequest, disciplinasAprovadas: string[]) => {
    if (disciplinasAprovadas.length > 0) {
      const sourceUsers = adminDraftRef.current?.usuarios || usuarios;
      const user = sourceUsers.find((item) => normalizeUserText(item.email) === normalizeUserText(request.userEmail));
      if (user) {
        const nextDisciplinas = Array.from(new Set([...user.disciplinas, ...disciplinasAprovadas]));
        updateUsuarioDraft(user.id, { disciplinas: nextDisciplinas });
      }
    }
    const remote = isFirebaseConfigured() ? await fetchFirebaseAppData<{ requests: DisciplinaRequest[] }>('disciplinaRequests') : null;
    const baseline = remote?.requests ?? disciplinaRequests;
    const merged = baseline.filter((item) => item.id !== request.id);
    if (isFirebaseConfigured()) await replaceFirebaseAppData('disciplinaRequests', { requests: merged });
    setDisciplinaRequests(merged);
  }, [disciplinaRequests, updateUsuarioDraft, usuarios]);

  const toggleUsuarioAdminDraft = useCallback((userId: string, checked: boolean) => {
    const sourceUsers = adminDraftRef.current?.usuarios || usuarios;
    const nextUsers = sourceUsers.map((user) => user.id === userId ? invalidateUserSession({ ...user, isAdmin: checked }) : user);
    const risk = getCriticalAdminMutationRisk(sourceUsers, nextUsers, currentUser?.email || '', Boolean(currentUser?.isAdmin));
    if (risk.blocked) {
      window.alert(risk.blocked);
      return;
    }
    setUsuarios(nextUsers);
    updateAdminDraftRef({ usuarios: nextUsers });
    markUserDirty(userId);
    markAdminChangesPending();
  }, [currentUser, invalidateUserSession, markAdminChangesPending, markUserDirty, updateAdminDraftRef, usuarios]);

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

  const saveConfigOptions = useCallback(async (nextCargos: string[], nextDisciplinas: string[], nextAlocacoes: string[], nextDisciplineSettings?: DisciplineSettingRecord[]) => {
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
    // Disciplina/cargo/alocacao salvam na hora, igual a edicao de usuario — nao dependem mais do
    // botao global "Salvar" (era o motivo de "novas disciplinas nao sao salvas").
    await persistAdminChanges({ silent: true });
  }, [disciplineSettings, markAdminChangesPending, persistAdminChanges, updateAdminDraftRef]);

  const saveRoleTabPermissions = useCallback((nextPermissions: RoleTabPermissions) => {
    setRoleTabPermissions(nextPermissions);
    updateAdminDraftRef({ roleTabPermissions: nextPermissions });
    markAdminChangesPending();
  }, [markAdminChangesPending, updateAdminDraftRef]);

  const addDisciplina = useCallback(async (value: string) => {
    const item = normalizeAdminDisciplineName(value);
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
    const key = normalizeUserText(value);
    const uses = (values: any) => splitDisciplineValues(values).some((item) => normalizeUserText(item) === key);
    const impact = [
      ...draftState.usuarios.filter((user) => uses(getUserDisciplineList(user))),
      ...draftState.terceirizadas.filter((item) => uses((item as any).disciplinas || item.disciplina)),
      ...draftState.preRegistrations.filter((item) => uses((item as any).disciplinas || item.disciplina)),
    ].length;
    if (impact > 0 && !window.confirm(`${impact} cadastro(s) continuam vinculados a "${value}" como legado. Remover apenas do catálogo?`)) return;
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
    await saveConfigOptions(
      Array.from(new Set([...draftState.cargos, item])),
      getDisciplineNamesFromSettings(draftState.disciplineSettings),
      draftState.alocacoes,
      draftState.disciplineSettings,
    );
    const nextPermissions = {
      ...draftState.roleTabPermissions,
      [item]: draftState.roleTabPermissions[item] || [],
    };
    saveRoleTabPermissions(nextPermissions);
    await persistAdminChanges({ silent: true });
  }, [getAdminSnapshotState, persistAdminChanges, saveConfigOptions, saveRoleTabPermissions]);

  const addAlocacao = useCallback(async (value: string) => {
    const item = value.trim();
    if (!item) return;
    const draftState = adminDraftRef.current || getAdminSnapshotState();
    await saveConfigOptions(
      draftState.cargos,
      getDisciplineNamesFromSettings(draftState.disciplineSettings),
      Array.from(new Set([...draftState.alocacoes, item])),
      draftState.disciplineSettings,
    );
  }, [getAdminSnapshotState, saveConfigOptions]);

  const removeAlocacao = useCallback(async (value: string) => {
    const draftState = adminDraftRef.current || getAdminSnapshotState();
    await saveConfigOptions(
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
    await persistAdminChanges({ silent: true });
  }, [getAdminSnapshotState, markAdminChangesPending, persistAdminChanges, updateAdminDraftRef]);

  const toggleRoleTabPermission = useCallback(async (cargo: string, tab: AppTabKey) => {
    const draftState = adminDraftRef.current || getAdminSnapshotState();
    const currentTabs = draftState.roleTabPermissions[cargo] || [];
    const nextTabs = currentTabs.includes(tab)
      ? currentTabs.filter((item) => item !== tab)
      : [...currentTabs, tab];

    const nextPermissions = { ...draftState.roleTabPermissions, [cargo]: nextTabs };
    setRoleTabPermissions(nextPermissions);
    updateAdminDraftRef({ roleTabPermissions: nextPermissions });
    markAdminChangesPending();
    await persistAdminChanges({ silent: true });
  }, [getAdminSnapshotState, markAdminChangesPending, persistAdminChanges, updateAdminDraftRef]);

  const saveDatabaseLink = useCallback(async (payload: Omit<DatabaseLinkRecord, 'id'> & { id?: string }) => {
    const sourceLinks = adminDraftRef.current?.databaseLinks || databaseLinks;
    const nextDatabaseLinks = withSeedDatabaseLinks(payload.id
      ? sourceLinks.map((item) => item.id === payload.id ? { ...item, ...payload } : item)
      : [...sourceLinks, { id: payload.id || createDraftId('db-link'), ...payload }]);
    setDatabaseLinks(nextDatabaseLinks);
    updateAdminDraftRef({ databaseLinks: nextDatabaseLinks });
    markAdminChangesPending();
  }, [databaseLinks, markAdminChangesPending, updateAdminDraftRef]);

  const deleteDatabaseLink = useCallback(async (id: string) => {
    const sourceLinks = adminDraftRef.current?.databaseLinks || databaseLinks;
    const nextDatabaseLinks = withSeedDatabaseLinks(sourceLinks.filter((item) => item.id !== id));
    setDatabaseLinks(nextDatabaseLinks);
    updateAdminDraftRef({ databaseLinks: nextDatabaseLinks });
    markAdminChangesPending();
  }, [databaseLinks, markAdminChangesPending, updateAdminDraftRef]);

  const saveDatabaseLinkAndPersist = useCallback(async (payload: Omit<DatabaseLinkRecord, 'id'> & { id?: string }) => {
    await saveDatabaseLink(payload);
    await persistAdminChanges();
  }, [persistAdminChanges, saveDatabaseLink]);

  const saveTerceirizada = useCallback(async (payload: Omit<TerceirizadaRecord, 'id'> & { id?: string }) => {
    const nome = String(payload.nome || '').trim();
    const cnpj = String(payload.cnpj || '').trim();
    const telefone = String(payload.telefone || '').trim();
    const cidade = String(payload.cidade || '').trim();
    const disciplinas = Array.from(new Set(
      (Array.isArray(payload.disciplinas) ? payload.disciplinas : String(payload.disciplina || '').split(','))
        .map((value) => String(value || '').trim())
        .filter(Boolean),
    ));
    const disciplina = disciplinas.join(', ');
    if (!nome || disciplinas.length === 0) return;

    const normalizedNome = normalizeUserText(nome);
    const normalizedDisciplina = disciplinas.map((item) => normalizeUserText(item)).join('|');
    const sourceTerceirizadas = adminDraftRef.current?.terceirizadas || [...terceirizadas, ...pendingTerceirizadas];
    const existingTerceirizada = payload.id ? sourceTerceirizadas.find((item) => item.id === payload.id) : undefined;
    const mergedBase = sourceTerceirizadas.filter((item) => (
      payload.id
        ? item.id !== payload.id
        : !(normalizeUserText(item.nome) === normalizedNome && (item.disciplinas || String(item.disciplina || '').split(',')).map((value) => normalizeUserText(value)).filter(Boolean).join('|') === normalizedDisciplina)
    ));
    const nextTerceirizadas = [
      ...mergedBase,
      {
        id: payload.id || createDraftId('terceirizada'),
        nome,
        disciplina,
        disciplinas,
        cnpj: cnpj || existingTerceirizada?.cnpj,
        telefone: telefone || existingTerceirizada?.telefone,
        cidade: cidade || existingTerceirizada?.cidade,
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
    const nextUsers = sourceUsers.map((item) => item.id === userId ? invalidateUserSession({ ...item, status: 'approved' }) : item);
    setUsuarios(nextUsers);
    updateAdminDraftRef({ usuarios: nextUsers });
    markUserDirty(userId);
    markAdminChangesPending();
  }, [invalidateUserSession, markAdminChangesPending, markUserDirty, updateAdminDraftRef, usuarios]);

  const blockUser = useCallback(async (userId: string) => {
    const sourceUsers = adminDraftRef.current?.usuarios || usuarios;
    const user = sourceUsers.find((item) => item.id === userId);
    if (!user) return;
    const nextUsers = sourceUsers.map((item) => item.id === userId ? invalidateUserSession({ ...item, status: 'blocked', online: false }) : item);
    const risk = getCriticalAdminMutationRisk(sourceUsers, nextUsers, currentUser?.email || '', Boolean(currentUser?.isAdmin));
    if (risk.blocked) {
      window.alert(risk.blocked);
      return;
    }
    setUsuarios(nextUsers);
    updateAdminDraftRef({ usuarios: nextUsers });
    markUserDirty(userId);
    markAdminChangesPending();
  }, [currentUser, invalidateUserSession, markAdminChangesPending, markUserDirty, updateAdminDraftRef, usuarios]);

  const deleteUsuario = useCallback(async (userId: string) => {
    const sourceUsers = adminDraftRef.current?.usuarios || usuarios;
    const user = sourceUsers.find((item) => item.id === userId);
    if (!user) return;
    const nextUsers = sourceUsers.filter((item) => item.id !== userId);
    const risk = getCriticalAdminMutationRisk(sourceUsers, nextUsers, currentUser?.email || '', Boolean(currentUser?.isAdmin));
    if (risk.blocked) {
      window.alert(risk.blocked);
      return;
    }
    const email = normalizeUserText(user.email || user.id);
    if (email) deletedUserEmailsRef.current.add(email);
    setUsuarios(nextUsers);
    updateAdminDraftRef({ usuarios: nextUsers });
    markAdminChangesPending();
  }, [currentUser, markAdminChangesPending, updateAdminDraftRef, usuarios]);

  const resetUserPassword = useCallback(async (user: UserAccessRecord) => {
    const response = await postToAppsScript<GenericResponse>({ action: 'adminResetPassword', email: user.email });
    assertSuccess(response, 'Falha ao redefinir senha.');
  }, []);

  const noteProjectsContextValue = React.useMemo(() => ({
    projects: noteProjects,
    onCreateProject: createNoteProject,
    onSaveProject: saveNoteProject,
    loadError: notesLoadError || noteProjectsLoadError,
  }), [createNoteProject, noteProjects, noteProjectsLoadError, notesLoadError, saveNoteProject]);

  // P.Cronograma grava no mesmo snapshot global lido pelas telas relacionadas.
  const aplicarCronogramaSalvo = useCallback((payload: { eap?: any; cronograma?: any[] }) => {
    setGlobalData((prev) => {
      if (payload.eap) return applyUnifiedEapData(prev, payload.eap);
      if (Array.isArray(payload.cronograma)) return mergeGlobalData(prev, { cronograma: payload.cronograma });
      return prev;
    });
  }, []);

  if (booting && !preloading) return null;

  const abrirProjectDaArea = () => {
    if (activeTab === 'registro') setAreaTecnicaSubTab('project');
    else if (activeTab === 'controle') setSubTab('project');
    else if (activeTab === 'planejamento') setPlanejamentoSubTab('project');
    else if (activeTab === 'contrato') setContratoSubTab('project');
    else if (activeTab === 'nc2') setNc2SubTab('project');
  };
  const abrirNotasDaArea = () => {
    if (activeTab === 'registro') setAreaTecnicaSubTab('disciplinas');
    else if (activeTab === 'controle') setSubTab('disciplinas');
    else if (activeTab === 'planejamento') setPlanejamentoSubTab('disciplinas');
    else if (activeTab === 'contrato') setContratoSubTab('disciplinas');
    else if (activeTab === 'nc2') setNc2SubTab('disciplinas');
  };

  // Pagina Notes: uma unica instancia reusada por todas as areas - mesmos dados, mesmo acesso.
  const notesPage = currentUser ? (
    <Notes
      disciplinas={disciplinas || []}
      notes={notes || []}
      osOptions={Array.isArray(effectiveGlobalData?.registro?.osOptions) ? effectiveGlobalData.registro.osOptions : []}
      currentUser={{ nome: currentUser.nome, email: currentUser.email, role: currentUser.role, isAdmin: currentUser.isAdmin }}
      preloadedData={effectiveGlobalData}
      usuarios={usuarios}
      abrirNota={notaParaAbrir}
      onNotaAberta={() => setNotaParaAbrir(null)}
      onSaveNote={saveAnnotationSheet}
      onDeleteNote={deleteAnnotationSheet}
      noteIdsComCronograma={noteIdsComCronograma}
      onAbrirProject={abrirProjectDaArea}
    />
  ) : null;
  // Pagina Project: uma unica instancia reusada por todas as areas, igual a de Notas.
  const projectsPage = currentUser && userHasTabAccess(currentUser, 'solucoes', roleTabPermissions) ? (
    <Cronogramas currentUser={currentUser} usuarios={usuarios} notes={notes} onSaveNote={saveAnnotationSheet} onDeleteNote={deleteAnnotationSheet} preloadedData={effectiveGlobalData} onAbrirNotas={abrirNotasDaArea} />
  ) : null;
  const contractNotesScopeCode = String(lockedContractCode || filtrosAtivos.contrato || '').trim();
  const contractNotesPage = currentUser ? (
    <Notes
      disciplinas={disciplinas || []}
      notes={notes || []}
      osOptions={Array.isArray(effectiveGlobalData?.registro?.osOptions) ? effectiveGlobalData.registro.osOptions : []}
      currentUser={{ nome: currentUser.nome, email: currentUser.email, role: currentUser.role, isAdmin: currentUser.isAdmin }}
      preloadedData={effectiveGlobalData}
      usuarios={usuarios}
      noteIdsComCronograma={noteIdsComCronograma}
      onAbrirProject={abrirProjectDaArea}
      contractScopeCode={contractNotesScopeCode === 'Todos' ? '' : contractNotesScopeCode}
      readOnly
    />
  ) : null;
  const cronogramaModuleReady = Boolean(loadedModules.cronograma) && !moduleLoading.cronograma && !moduleErrors.cronograma;
  const atividadesModuleReady = Boolean(loadedModules.registro && loadedModules.eap)
    && !moduleLoading.registro && !moduleLoading.eap
    && !moduleErrors.registro && !moduleErrors.eap;
  const atividadesModuleState = moduleErrors.registro || moduleErrors.eap ? 'error' : atividadesModuleReady ? 'ready' : 'loading';
  const atividadesLoadFallback = (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-3 rounded-[24px] border border-[#E5E7EB] bg-white p-6 shadow-sm">
      {atividadesModuleState === 'error' ? (
        <>
          <p className="text-[14px] font-bold text-[#991B1B]">Não foi possível carregar as atividades.</p>
          <p className="text-[12px] text-[#B91C1C]">{moduleErrors.eap || moduleErrors.registro}</p>
          <button
            type="button"
            onClick={() => {
              if (moduleErrors.registro) void loadFirebaseModule('registro');
              if (moduleErrors.eap) void loadFirebaseModule('eap');
            }}
            className="inline-flex h-10 w-fit items-center justify-center rounded-xl bg-[#F05D28] px-4 text-[12px] font-black uppercase tracking-[1px] text-white"
          >
            Tentar de novo
          </button>
        </>
      ) : (
        <>
          <p className="text-[14px] font-bold text-[#2D2D2D]">Carregando atividades...</p>
          <p className="text-[12px] font-medium text-[#64748B]">Estamos preparando a EAP. A tela aparecerá assim que os dados estiverem completos.</p>
        </>
      )}
    </div>
  );
  const cronogramaPage = currentUser && userHasTabAccess(currentUser, 'cronograma', roleTabPermissions) ? (
    userHasTabAccess(currentUser, 'planejamento', roleTabPermissions)
      ? <Cronograma preloadedData={effectiveGlobalData} lockedContractCode={lockedContractCode} viewMode="planning" currentUser={currentUser} onPlannerApprovalSubmit={syncPlannerApprovals} loading={!cronogramaModuleReady && !moduleErrors.cronograma} loadError={moduleErrors.cronograma} onRetry={() => { void loadFirebaseModule('cronograma'); }} />
      : <Cronograma preloadedData={effectiveGlobalData} lockedContractCode={lockedContractCode} loading={!cronogramaModuleReady && !moduleErrors.cronograma} loadError={moduleErrors.cronograma} onRetry={() => { void loadFirebaseModule('cronograma'); }} />
  ) : null;


  // Project so aparece ao lado de Notas, e nunca em Coordenacao de Engenharia (pedido do Igor).
  // ponytail: entra como item extra na lista; nunca substituir o array (foi o que sumia com a Curva S).
  const podeProject = Boolean(currentUser && userHasTabAccess(currentUser, 'solucoes', roleTabPermissions));
  const projectSubTab = (current: string, onClick: () => void) => (
    podeProject && (current === 'disciplinas' || current === 'project')
      ? [{ key: 'project', label: 'Project', icon: <Calendar size={16} />, active: current === 'project', onClick }]
      : []
  );

  const headerTabs = (() => {
    // Principal nao tem a dupla Notas/Project.
    if (activeTab === 'principal') {
      return [];
    }

    if (activeTab === 'controle') {
      return [
        { key: 'atividades', label: 'Atividades', icon: <LayoutGrid size={16} />, active: subTab === 'planejamento', onClick: () => setSubTab('planejamento') },
        { key: 'curva-s', label: 'Curva S', icon: <TrendingUp size={16} />, active: subTab === 'curva-s', onClick: () => setSubTab('curva-s') },
        { key: 'disciplinas', label: 'Notas', icon: <Layers size={16} />, active: subTab === 'disciplinas', onClick: () => setSubTab('disciplinas') },
      ];
    }

    if (activeTab === 'planejamento') {
      return [
        { key: 'atividades', label: 'Atividades', icon: <LayoutGrid size={16} />, active: planejamentoSubTab === 'atividades', onClick: () => setPlanejamentoSubTab('atividades') },
        { key: 'curva-s', label: 'Curva S', icon: <TrendingUp size={16} />, active: planejamentoSubTab === 'curva-s', onClick: () => setPlanejamentoSubTab('curva-s') },
        { key: 'disciplinas', label: 'Notas', icon: <Layers size={16} />, active: planejamentoSubTab === 'disciplinas', onClick: () => setPlanejamentoSubTab('disciplinas') },
        ...projectSubTab(planejamentoSubTab, () => setPlanejamentoSubTab('project')),
      ];
    }

    if (activeTab === 'nc2') {
      return [
        { key: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={16} />, active: nc2SubTab === 'dashboard', onClick: () => setNc2SubTab('dashboard') },
        { key: 'preenchimento', label: 'Preenchimento', icon: <Clipboard size={16} />, active: nc2SubTab === 'preenchimento', onClick: () => setNc2SubTab('preenchimento') },
        { key: 'revisoes', label: 'Revisoes', icon: <CheckSquare size={16} />, active: nc2SubTab === 'revisoes', onClick: () => setNc2SubTab('revisoes') },
        { key: 'terceirizadas', label: 'Terceirizadas', icon: <Users size={16} />, active: nc2SubTab === 'terceirizadas', onClick: () => setNc2SubTab('terceirizadas') },
        { key: 'disciplinas', label: 'Notas', icon: <Layers size={16} />, active: nc2SubTab === 'disciplinas', onClick: () => setNc2SubTab('disciplinas') },
        ...projectSubTab(nc2SubTab, () => setNc2SubTab('project')),
      ];
    }

    if (activeTab === 'contrato') {
      return [
        { key: 'atividades', label: 'Atividades', icon: <LayoutGrid size={16} />, active: contratoSubTab === 'atividades', onClick: () => setContratoSubTab('atividades') },
        { key: 'interferencias', label: 'Interferências', icon: <AlertTriangle size={16} />, active: contratoSubTab === 'interferencias', onClick: () => setContratoSubTab('interferencias') },
        { key: 'disciplinas', label: 'Notas', icon: <Layers size={16} />, active: contratoSubTab === 'disciplinas', onClick: () => setContratoSubTab('disciplinas') },
        ...projectSubTab(contratoSubTab, () => setContratoSubTab('project')),
      ];
    }

    if (activeTab === 'registro') {
      return [
        { key: 'atividades', label: 'Atividades', icon: <LayoutGrid size={16} />, active: areaTecnicaSubTab === 'atividades', onClick: () => setAreaTecnicaSubTab('atividades') },
        { key: 'disciplinas', label: 'Notas', icon: <Layers size={16} />, active: areaTecnicaSubTab === 'disciplinas', onClick: () => setAreaTecnicaSubTab('disciplinas') },
        ...projectSubTab(areaTecnicaSubTab, () => setAreaTecnicaSubTab('project')),
      ];
    }


    // Cronograma nao tem subaba: e um botao unico no menu.
    if (activeTab === 'cronograma') return [];

    if (activeTab === 'administracao') {

      return [
        { key: 'usuarios', label: 'Usuários', icon: <Users size={16} />, active: adminSubTab === 'usuarios', onClick: () => setAdminSubTab('usuarios') },
        { key: 'terceirizadas', label: 'Terceirizadas', icon: <ShieldCheck size={16} />, active: adminSubTab === 'terceirizadas', onClick: () => setAdminSubTab('terceirizadas') },
        { key: 'pre-cadastro', label: 'Pré-cadastro', icon: <UserCheck size={16} />, active: adminSubTab === 'pre-cadastro', onClick: () => setAdminSubTab('pre-cadastro') },
        { key: 'gerenciamento', label: 'Gerenciamento', icon: <Settings size={16} />, active: adminSubTab === 'gerenciamento', onClick: () => setAdminSubTab('gerenciamento') },
        { key: 'firebase', label: 'Firebase', icon: <Database size={16} />, active: adminSubTab === 'firebase', onClick: () => setAdminSubTab('firebase') },
      ];
    }

    return [];
  })();

  // Sub-abas vivem na barra da esquerda, com Project aninhado sob Notas.
  const abasVisiveis = headerTabs.filter((tab) => tab.key !== 'alocacoes');
  subAbasNavRef.current = abasVisiveis;
  const subNav = abasVisiveis.length > 0 ? (
    <div data-subnav className="mb-1 mt-0.5 space-y-0.5">
      {abasVisiveis.map((tab) => (
        <SubNavItem key={tab.key} icon={tab.icon} label={tab.label} active={tab.active} onClick={tab.onClick} nested={tab.key === 'project'} />
      ))}
    </div>
  ) : null;

  if (!currentUser && !preloading) {
    return (
      <>
        <LoginScreen onGoogleLogin={handleGoogleLogin} />
        {pendingCorporateSignup && (
          <div className="fixed inset-0 z-[300] flex items-center justify-center bg-slate-950/40 p-4">
            <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
              <h2 className="text-[16px] font-bold text-[#2D2D2D]">Qual é a sua disciplina?</h2>
              <p className="mt-1.5 text-[13px] leading-relaxed text-[#757575]">
                Seu e-mail corporativo já está liberado. Escolha sua disciplina pra concluir o acesso — cargo e permissões o administrador ajusta depois.
              </p>
              <select
                value={corporateDisciplinaChoice}
                onChange={(e) => setCorporateDisciplinaChoice(e.target.value)}
                className="mt-4 h-11 w-full rounded-xl border border-[#E5E7EB] bg-white px-3 text-[13px] font-medium text-[#2D2D2D] focus:outline-none focus:border-[#F05D28]"
              >
                <option value="">Selecionar disciplina</option>
                {pendingCorporateSignup.adminState.disciplinas.map((nome) => (
                  <option key={nome} value={nome}>{nome}</option>
                ))}
              </select>
              <button
                type="button"
                disabled={!corporateDisciplinaChoice || corporateSignupSubmitting}
                onClick={confirmCorporateSignupDiscipline}
                className="mt-4 h-11 w-full rounded-xl bg-[#F05D28] text-[13px] font-bold text-white transition-colors hover:bg-[#D94E1F] disabled:opacity-50"
              >
                {corporateSignupSubmitting ? 'Confirmando...' : 'Confirmar e entrar'}
              </button>
            </div>
          </div>
        )}
      </>
    );
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
    <NoteProjectsContext.Provider value={noteProjectsContextValue}>
    {/* reducedMotion="user": quem pediu menos animacao no sistema recebe as telas sem movimento. */}
    <MotionConfig reducedMotion="user">
    {adminConfirmationOpen && (
      <CampoDialog
        title="Confirme a alteração administrativa"
        fields={[{
          id: 'confirmacao',
          label: 'Digite CONFIRMAR para concluir alterações destrutivas em outro administrador.',
          placeholder: 'CONFIRMAR',
        }]}
        onConfirm={finishAdminConfirmation}
        onCancel={cancelAdminConfirmation}
      />
    )}
    <KonamiGame />
    <div className="flex h-screen w-full bg-[#F8F9FA] overflow-hidden font-['Montserrat']">
      <AnimatePresence mode="wait">
        {/* Rail: 84px no fluxo, expande por cima do conteudo no hover — a tela nao se mexe. */}
        {sidebarOpen && (
          <motion.aside
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 84, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className="group/rail relative z-40 h-full shrink-0"
          >
            {/* Sem arredondamento e sempre clara: a barra da marca nao acompanha o tema escuro. */}
            {/* Abre/fecha como agua assentando: curva longa e desacelerada, nada de corte seco. */}
            <div className="brandbar absolute inset-y-0 left-0 flex w-[84px] flex-col overflow-hidden bg-white shadow-[1px_0_0_#E5E7EB] transition-[width,box-shadow] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover/rail:w-[286px] group-hover/rail:shadow-[0_18px_40px_-24px_rgba(15,23,42,0.35)]">
            <NervurasRail />
            {/* Recolhido mostra so o simbolo; no hover a marca completa aparece. */}
            <div className="relative flex h-24 items-center pl-[22px]">
              <img
                src="https://i.imgur.com/Net1yEQ.png"
                alt="Logo"
                referrerPolicy="no-referrer"
                // A marca e 4,41:1. Recolhida, a janela de 50px mostra o simbolo inteiro; aberta,
                // 176px e exatamente a largura natural em h-9 — nao sobra nem falta pixel.
                className="h-9 w-[50px] max-w-none object-cover object-left transition-[width] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover/rail:w-[176px] group-hover/rail:object-contain"
              />
            </div>
            <nav className="relative mt-2 flex-1 space-y-1 overflow-y-auto overflow-x-hidden px-4 [&_[data-subnav]]:hidden group-hover/rail:[&_[data-subnav]]:block">
              {currentUser && (
                <>
                  <NavItem icon={<Home size={20} />} label="Principal" active={activeTab === 'principal'} onClick={() => setActiveTab('principal')} />
                  {activeTab === 'principal' && subNav}
                </>
              )}
              {currentUser && userHasTabAccess(currentUser, 'registro', roleTabPermissions) && (
                <>
                  <NavItem icon={<ClipboardList size={20} />} label="Área Técnica" active={activeTab === 'registro'} onClick={() => setActiveTab('registro')} />
                  {activeTab === 'registro' && subNav}
                </>
              )}
              {currentUser && userHasTabAccess(currentUser, 'controle', roleTabPermissions) && (
                <>
                  <NavItem icon={<Settings size={20} />} label="Coordenação de Engenharia" active={activeTab === 'controle'} onClick={() => setActiveTab('controle')} />
                  {activeTab === 'controle' && subNav}
                </>
              )}
              {currentUser && userHasTabAccess(currentUser, 'planejamento', roleTabPermissions) && (
                <>
                  <NavItem icon={<TrendingUp size={20} />} label="Planejamento" active={activeTab === 'planejamento'} onClick={() => setActiveTab('planejamento')} />
                  {activeTab === 'planejamento' && subNav}
                </>
              )}
              {currentUser && userHasTabAccess(currentUser, 'nc2', roleTabPermissions) && (
                <>
                  <NavItem icon={<AlertTriangle size={20} />} label="Conformidade" active={activeTab === 'nc2'} onClick={() => setActiveTab('nc2')} />
                  {activeTab === 'nc2' && subNav}
                </>
              )}
              {currentUser && userHasTabAccess(currentUser, 'cronograma', roleTabPermissions) && (
                <>
                  <NavItem icon={<Calendar size={20} />} label="Cronograma" active={activeTab === 'cronograma'} onClick={() => setActiveTab('cronograma')} />
                  {activeTab === 'cronograma' && subNav}
                </>
              )}
              {currentUser && userHasTabAccess(currentUser, 'banco-links', roleTabPermissions) && (
                <NavItem icon={<Database size={20} />} label="Banco de Links" active={activeTab === 'banco-links'} onClick={() => setActiveTab('banco-links')} />
              )}
              {currentUser && currentUser.isAdmin && (
                <>
                  <NavItem icon={<ShieldCheck size={20} />} label="Administração" active={activeTab === 'administracao'} onClick={() => setActiveTab('administracao')} />
                  {activeTab === 'administracao' && subNav}
                </>
              )}
            </nav>
            {/* Rodape em bloco 2x2: usuario | notificacao setor / notificacao citado | sair. */}
            <div className="relative px-2 py-3">
              {currentUser && (
                <div className="mx-auto grid w-fit grid-cols-2 gap-1">
                  <button
                    type="button"
                    onClick={() => setActiveTab('principal')}
                    title="Área do usuário (Principal)"
                    className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-[#FFF3EC] text-[9px] font-black text-[#F05D28] transition-colors hover:bg-[#FDE3D5]"
                  >
                    {getUserInitials(currentUser.nome)}
                  </button>
                  <Notificacoes
                    variante="rail"
                    icone={<Bell size={15} />}
                    titulo="Notificações do setor"
                    vazio="Nenhuma nota nova da sua disciplina."
                    itens={notificacoesSetor}
                    naoLidos={naoLidosSetor}
                    onAbrir={abrirNotaNotificada}
                  />
                  <Notificacoes
                    variante="rail"
                    icone={<AtSign size={15} />}
                    titulo="Você foi citado"
                    vazio="Ninguém te citou em uma nota ainda."
                    itens={notificacoesDiretas}
                    naoLidos={naoLidosDiretas}
                    onAbrir={abrirNotaNotificada}
                  />
                  <button
                    type="button"
                    onClick={handleLogout}
                    title="Sair"
                    className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-lg text-[#9CA3AF] transition-colors hover:bg-[#FEF2F2] hover:text-[#EF4444]"
                  >
                    <LogOut size={15} />
                  </button>
                </div>
              )}
              <p className="mt-2 text-center text-[9px] font-bold uppercase tracking-[1.5px] text-[#9CA3AF] opacity-0 transition-opacity duration-500 group-hover/rail:opacity-100">{APP_VERSION_LABEL}</p>
            </div>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      <div className="relative flex-1 flex flex-col overflow-hidden">
        {/* A folha vive aqui, atras de tudo — inclusive do cabecalho, que agora nao tem fundo
            proprio. Como esta fora do <main>, ela nao rola junto com o conteudo. */}
        <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
          <NervurasFundo />
        </div>
        {/* Cabecalho global removido: cada aba ja tem seu proprio titulo interno e o espaco
            vira area util. Usuario e notificacoes vivem no rodape do rail. */}
        {/* Caminho (breadcrumb) fixo: mesma posicao em toda aba, fora do <main> (nao rola) e fora
            do fade (nao desliza) — o nome nunca "muda de lugar". Altura reservada mesmo na
            Principal pra todas as paginas nascerem no mesmo ponto. Documentado no padrao.md. */}
        <div className="relative z-10 flex h-[42px] flex-shrink-0 items-center justify-between gap-3 px-8">
          {activeTab !== 'principal' ? (
            <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-[#757575]">
              <span>{AREA_LABELS[activeTab] || ''}</span>
              {headerTabs.find((tab) => tab.active)?.label && (
                <>
                  <ChevronRight size={12} />
                  <span className="text-[#F05D28]">{headerTabs.find((tab) => tab.active)?.label}</span>
                </>
              )}
            </div>
          ) : <span />}
          {/* Data da EAP fica na MESMA linha do caminho, só na Coordenação de Engenharia. */}
          {activeTab === 'controle' && (
            <div className="inline-flex items-center gap-2 rounded-lg bg-white px-3 py-1.5 text-[11px] font-bold uppercase tracking-widest text-[#757575] shadow-[0_10px_30px_-22px_rgba(15,23,42,0.45)]">
              <CalendarClock size={13} className="text-[#F05D28]" />
              <span>EAP atualizada em</span>
              <span className="text-[#2D2D2D]">{getLatestEapDisplayDate(effectiveGlobalData?.eap)}</span>
            </div>
          )}
        </div>
        {patchNotesOpen && (
          <div className="fixed inset-0 z-[300] flex items-center justify-center bg-slate-950/40 p-4" onClick={() => setPatchNotesOpen(false)}>
            <div className="flex max-h-[80vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-xl" onClick={(event) => event.stopPropagation()}>
              <div className="flex items-center justify-between gap-4 px-5 pt-5 pb-2">
                <div className="flex items-center gap-2">
                  <Sparkles size={18} className="text-[#F05D28]" />
                  <h2 className="text-[15px] font-black text-[#1F2937]">Novidades</h2>
                </div>
                <button
                  type="button"
                  onClick={() => setPatchNotesOpen(false)}
                  className="flex h-8 w-8 items-center justify-center rounded-full text-[#94A3B8] hover:bg-[#F3F4F6] hover:text-[#2D2D2D]"
                >
                  <X size={16} />
                </button>
              </div>
              <div className="flex-1 overflow-auto p-5">
                {PATCH_NOTES.map((entry) => (
                  <div key={entry.version} className="mb-6 last:mb-0">
                    <div className="mb-2 flex items-center gap-2">
                      <span className="rounded-full bg-[#FFF3EE] px-2.5 py-1 text-[11px] font-bold text-[#F05D28]">v{entry.version}</span>
                      <span className="text-[11px] font-medium text-[#94A3B8]">{entry.date}</span>
                    </div>
                    <h3 className="mb-2 text-[13px] font-bold text-[#2D2D2D]">{entry.title}</h3>
                    <ul className="list-disc space-y-1.5 pl-5">
                      {entry.items.map((item, index) => (
                        <li key={index} className="text-[13px] leading-relaxed text-[#374151]">{item}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        <main className="relative z-10 flex-1 overflow-y-auto px-8 pb-8 pt-2">
          <TabErrorBoundary resetKey={`${activeTab}:${principalSubTab}:${areaTecnicaSubTab}:${subTab}:${planejamentoSubTab}:${contratoSubTab}:${nc2SubTab}:${adminSubTab}:${cronogramaSubTab}`}>
            <React.Suspense fallback={<TabLoadingFallback />}>
            {/* Troca de pagina = fade out + fade in (~0.5s no total) pra suavizar e cobrir o load.
                mode="wait": a tela antiga some antes da nova entrar; sem deslize (y), so opacidade. */}
            <AnimatePresence mode="wait">
            <motion.div
              className="relative"
              key={activeTab}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25, ease: 'easeInOut' }}
            >
              {activeTab === 'principal' && currentUser && principalSubTab === 'project' && projectsPage}
              {activeTab === 'principal' && currentUser && !(principalSubTab === 'project' && projectsPage) && (
                <Principal currentUser={currentUser}>
                  <Nc2Kanban
                    lockedContractCode={lockedContractCode}
                    preloadedData={effectiveGlobalData}
                    notas={notasKanbanPrincipal}
                    onAbrirNota={abrirNotaNotificada}
                    currentUser={{ nome: currentUser.nome, email: currentUser.email, role: currentUser.role, isAdmin: currentUser.isAdmin, disciplina: currentUser.disciplina, disciplinas: currentUser.disciplinas }}
                    onSalvarNota={saveAnnotationSheet}
                    onEdit={(record) => {
                      setPendingNc2EditRecord(record);
                      setNc2SubTab('preenchimento');
                      setActiveTab('nc2');
                    }}
                  />
                </Principal>
              )}
              {activeTab === 'registro' && currentUser && userHasTabAccess(currentUser, 'registro', roleTabPermissions) && (
                areaTecnicaSubTab === 'disciplinas'
                  ? notesPage
                  : areaTecnicaSubTab === 'project'
                  ? projectsPage
                  : atividadesModuleReady
                    ? <Atividades currentUser={currentUser} preloadedData={effectiveGlobalData} autoSelectUserDisciplineFilter disciplineFilterEnabled notes={notes} splitOsCardsByDiscipline cronogramaPlaceholder />
                    : atividadesLoadFallback
              )}
              {activeTab === 'controle' && currentUser && userHasTabAccess(currentUser, 'controle', roleTabPermissions) && (
                subTab === 'disciplinas'
                  ? notesPage
                  : subTab === 'project'
                  ? projectsPage
                  : <ControleEngenharia currentUser={currentUser} filtrosAtivos={filtrosAtivos} subTab={subTab} onSubTabChange={setSubTab} preloadedData={effectiveGlobalData} lockedContractCode={lockedContractCode} disciplinas={disciplinas} />
              )}
              {activeTab === 'planejamento' && currentUser && userHasTabAccess(currentUser, 'planejamento', roleTabPermissions) && (
                planejamentoSubTab === 'atividades'
                  ? atividadesModuleReady
                    ? <Atividades currentUser={currentUser} preloadedData={effectiveGlobalData} showAllDisciplines disciplineFilterEnabled notes={notes} />
                    : atividadesLoadFallback
                  : planejamentoSubTab === 'curva-s'
                    ? <CurvaS preloadedData={effectiveGlobalData?.eap || null} lockedContractCode={lockedContractCode} activeContractCode={lockedContractCode || filtrosAtivos.contrato} />
                    : planejamentoSubTab === 'disciplinas'
                      ? notesPage
                  : planejamentoSubTab === 'project'
                      ? projectsPage
                      : (
                        <div className="w-full flex flex-col gap-6 font-['Montserrat']">
                          <ProjectVbaConfigCard />
                          <Planejamento filtrosAtivos={filtrosAtivos} preloadedData={effectiveGlobalData} mode="dashboard" activeContractCode={lockedContractCode || filtrosAtivos.contrato} />
                        </div>
                      )
              )}
              {activeTab === 'contrato' && currentUser && userHasTabAccess(currentUser, 'contrato', roleTabPermissions) && (
                contratoSubTab === 'disciplinas'
                  ? contractNotesPage
                  : contratoSubTab === 'project'
                  ? projectsPage
                  : contratoSubTab === 'atividades' && !atividadesModuleReady
                    ? atividadesLoadFallback
                    : <Contrato currentUser={currentUser} preloadedData={effectiveGlobalData} activeContractCode={lockedContractCode || filtrosAtivos.contrato} lockedContractCode={lockedContractCode} activeView={contratoSubTab} notes={notes} />
              )}
              {activeTab === 'cronograma' && currentUser && userHasTabAccess(currentUser, 'cronograma', roleTabPermissions) && (
                cronogramaPage
              )}
              {activeTab === 'banco-links' && currentUser && userHasTabAccess(currentUser, 'banco-links', roleTabPermissions) && (
                <BancoLinksPage links={databaseLinksComSeed} canManage={Boolean(currentUser?.isAdmin)} onSaveLink={currentUser?.isAdmin ? saveDatabaseLinkAndPersist : undefined} />
              )}
              {activeTab === 'nc2' && currentUser && userHasTabAccess(currentUser, 'nc2', roleTabPermissions) && (
                nc2SubTab === 'disciplinas'
                  ? notesPage
                  : nc2SubTab === 'project'
                  ? projectsPage
                  : (
                <NaoConformidades
                  activeTab={nc2SubTab}
                  onTabChange={setNc2SubTab}
                  pendingEditRecord={pendingNc2EditRecord}
                  onPendingEditConsumed={() => setPendingNc2EditRecord(null)}
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
                  )
              )}
              {activeTab === 'administracao' && currentUser?.isAdmin && adminSubTab === 'firebase' && <FirebaseExplorer />}
              {activeTab === 'administracao' && currentUser?.isAdmin && adminSubTab !== 'firebase' && (
                <Administracao
                  usuarios={usuarios} disciplinas={disciplinas} disciplineSettings={disciplineSettings} cargos={cargos} alocacoes={alocacoes} terceirizadas={adminTerceirizadas} contratos={contratos} roleTabPermissions={roleTabPermissions} databaseLinks={databaseLinksComSeed} appTabs={ADMIN_APP_TABS} onRefresh={loadAdminData}
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
                  disciplinaRequests={disciplinaRequests}
                  onResolveDisciplinaRequest={resolveDisciplinaRequest}
                />
              )}
            </motion.div>
            </AnimatePresence>
            </React.Suspense>
          </TabErrorBoundary>
        </main>
      </div>
    </div>
    </MotionConfig>
    </NoteProjectsContext.Provider>
  );
}

// Item do rail: so o icone quando recolhido, nome aparece quando a barra expande no hover.
function NavItem({ icon, label, active, onClick }: { icon: React.ReactNode; label: string; active?: boolean; onClick?: () => void; }) {
  return (
    <div
      onClick={onClick}
      title={label}
      className={`flex cursor-pointer items-center gap-3 rounded-2xl px-3.5 py-3 transition-all ${active ? 'bg-[#F05D28]/10 text-[#F05D28] text-[14px] font-bold' : 'text-[#757575] text-[14px] font-medium hover:bg-[#F4F5F7] hover:text-[#2D2D2D]'}`}
    >
      <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center">{icon}</span>
      {/* O rotulo nao so aparece: desliza um tico da esquerda, como folha se abrindo. */}
      <span className="-translate-x-1 whitespace-nowrap opacity-0 transition-[opacity,transform] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover/rail:translate-x-0 group-hover/rail:opacity-100">{label}</span>
    </div>
  );
}

// Nervuras: ramificacao fina no pe do rail. Decorativa, nao muda o layout.
function NervurasRail() {
  return (
    <svg
      viewBox="0 0 120 260"
      aria-hidden
      className="pointer-events-none absolute inset-x-0 bottom-0 h-[260px] w-full select-none text-[#F05D28] opacity-[0.18]"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.1"
      strokeLinecap="round"
    >
      <path d="M28 260 C28 210 34 190 46 168 C58 146 62 126 60 96" />
      <path d="M60 96 C58 74 66 58 82 44" />
      <path d="M60 120 C46 108 38 96 34 78" />
      <path d="M52 150 C70 140 82 128 88 110" />
      <path d="M46 168 C34 162 26 152 22 138" />
      <path d="M64 206 C82 196 92 182 96 162" />
      <path d="M34 226 C22 218 16 206 14 190" />
    </svg>
  );
}

// Folha de fundo, comum a todas as abas: a assinatura organica do EcoQuanta (eco + Quanta).
// Nao e uma ilustracao literal — e o contorno e as nervuras, desenhados como um projeto
// arquitetonico. Fica so no fundo da pagina; painel com informacao nunca recebe folha.
function NervurasFundo() {
  return (
    <>
      <Folha className="absolute -right-24 -top-16 h-[860px] w-[980px] opacity-[0.50]" />
      {/* Segunda folha, menor e espelhada, no rodape a esquerda: da profundidade sem poluir. */}
      <Folha className="absolute -bottom-40 -left-16 h-[520px] w-[600px] -scale-x-100 opacity-[0.50]" />
    </>
  );
}

function Folha({ className }: { className: string }) {
  return (
    <svg
      viewBox="0 0 800 700"
      preserveAspectRatio="xMidYMid meet"
      aria-hidden
      className={`pointer-events-none max-w-none select-none text-[#F05D28] ${className}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {/* contorno */}
      <path d="M120 660 C200 420 360 190 700 60" />
      <path d="M120 660 C420 540 600 330 700 60" />
      {/* nervura central */}
      <path d="M120 660 C300 470 500 270 700 60" strokeWidth="2.1" />
      {/* nervuras laterais, abrindo em direcao a ponta */}
      <path d="M250 540 C250 490 235 455 205 425" />
      <path d="M250 540 C300 530 340 505 372 470" />
      <path d="M350 450 C352 400 340 365 312 335" />
      <path d="M350 450 C400 438 440 412 470 378" />
      <path d="M450 360 C455 312 445 278 418 248" />
      <path d="M450 360 C498 346 536 320 565 288" />
      <path d="M550 265 C556 222 548 192 524 166" />
      <path d="M550 265 C594 250 628 226 654 196" />
      <path d="M630 170 C636 140 630 118 612 98" />
      {/* haste e ramificacao solta, pra folha nascer de algum lugar */}
      <path d="M120 660 C86 690 60 716 40 752" strokeWidth="2.1" />
      <path d="M96 686 C60 672 34 646 18 608" />
      <path d="M74 712 C40 716 12 706 -14 682" />
    </svg>
  );
}

// Sub-aba na barra da esquerda: mais fina que o NavItem e recuada, pra ler como filha dele.
// Par Notas/Project desenhado como abinhas de fichario: canto superior arredondado, sobreposicao
// de 8px, ativa na frente e "colada" na faixa branca (o corpo da pasta); inativa recua atras.
function AbasFichario({ tabs }: { tabs: Array<{ key: string; icon: React.ReactNode; label: React.ReactNode; active?: boolean; onClick?: () => void }> }) {
  return (
    <div className="pl-6 pr-1 pt-1.5">
      <div className="flex items-end">
        {tabs.map((tab, indice) => (
          <button
            key={tab.key}
            type="button"
            onClick={tab.onClick}
            title={typeof tab.label === 'string' ? tab.label : undefined}
            style={{ zIndex: tab.active ? 2 : 1, marginLeft: indice === 0 ? 0 : -8 }}
            className={`relative flex min-w-0 flex-1 items-center gap-1.5 rounded-t-[10px] border border-b-0 border-[#E5E7EB] px-2.5 text-left text-[12px] transition-all ${
              tab.active
                ? 'bg-white py-2 font-bold text-[#F05D28] shadow-[0_-3px_8px_-4px_rgba(15,23,42,0.35)]'
                : 'bg-[#F4F5F7] py-1.5 font-medium text-[#8A8A8A] hover:bg-[#EDEFF2] hover:text-[#2D2D2D]'
            }`}
          >
            <span className="flex-shrink-0 [&>svg]:h-[14px] [&>svg]:w-[14px]">{tab.icon}</span>
            <span className="truncate">{tab.label}</span>
          </button>
        ))}
      </div>
      <div className="relative z-[2] -mt-px h-2 rounded-b-[8px] border border-t-0 border-[#E5E7EB] bg-white" />
    </div>
  );
}

function SubNavItem({ icon, label, active, onClick, nested }:{ key?: string; icon: React.ReactNode; label: React.ReactNode; active?: boolean; onClick?: () => void; nested?: boolean; }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-2.5 rounded-lg py-2 ${nested ? 'pl-14' : 'pl-9'} pr-3 text-left text-[13px] transition-colors ${
        active
          ? 'bg-[#F05D28]/10 font-bold text-[#F05D28]'
          : 'font-medium text-[#8A8A8A] hover:bg-[#F4F5F7] hover:text-[#2D2D2D]'
      }`}
    >
      {icon}
      <span className="truncate">{label}</span>
    </button>
  );
}
