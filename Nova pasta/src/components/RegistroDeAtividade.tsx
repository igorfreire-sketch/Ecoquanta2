import React, { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronDown,
  Plus,
  Search,
  CheckCircle2,
  Clock3,
  Save,
  Send,
  ChevronUp,
  ClipboardList,
} from 'lucide-react';
import { motion } from 'motion/react';
import type { AuthUser } from './LoginScreen';
import {
  fetchRegistroDataFromFirebase,
  isFirebaseConfigured,
  registerActivitiesInFirebase,
  updateActivitiesInFirebase,
} from '../lib/firebaseDb';
const PUBLIC_JSON_SYNC_DELAY_MS = 15000;
const PLANNING_TODOS_STORAGE_KEY = 'quanta_planejamento_tecnico_itens';

type DifficultyLevel = 'Facil' | 'Moderada' | 'Dificil';
type EvaluationType =
  | 'Dentro do esperado'
  | 'Melhor que o esperado'
  | 'Pior que o esperado'
  | 'Problema/Bloqueio';

interface EapContractOption { codigo: string; nome: string; }
interface EapOsOption { codigo: string; nome: string; contratoCodigo: string; }
interface EapItemOption { codigo: string; nome: string; osCodigo: string; }
interface TodoOption { id: string; titulo: string; descricao: string; disciplina: string; contratoCodigo: string; osCodigo: string; osNome: string; itemCodigo: string; itemNome: string; }
interface EapHierarchyNode {
  codigo: string;
  nome: string;
  tipo: 'contrato' | 'os' | 'item';
  nivel: number;
  parentCodigo: string;
  contratoCodigo: string;
  osCodigo: string;
}
interface ProfessionalOption { nome: string; email: string; cargo: string; disciplina: string; }

interface RegistroAtividade {
  id: string; contratoCodigo: string; contratoNome: string; osCodigo: string; osNome: string;
  setor: string; itemCodigo: string; itemNome: string; profissionais: string[]; profissionaisEmails: string[];
  dificuldade: DifficultyLevel; descricao: string; avancoAtual: number; avaliacaoAtual: string; observacaoAtual: string;
  status: 'em_andamento' | 'aguardando_conclusao' | 'concluida'; dataRegistro: string; data100?: string;
  dataConclusaoEfetiva?: string; createdByEmail: string; ultimaAtualizacao?: string; disciplina?: string; criadoPorDisciplina?: string;
}

interface RegistroDataResponse {
  success: boolean; error?: string; contracts: EapContractOption[]; osOptions: EapOsOption[];
  itemOptions: EapItemOption[]; hierarchyNodes?: EapHierarchyNode[]; childrenByParent?: Record<string, EapHierarchyNode[]>; rootCodes?: string[];
  professionals: ProfessionalOption[]; activitiesList?: any[]; activeActivities: RegistroAtividade[]; completedActivities: RegistroAtividade[];
}

interface PublicRegistroEnvelope {
  source?: string;
  publishedAt?: string;
  data?: {
    registro?: {
      contracts?: EapContractOption[];
      osOptions?: EapOsOption[];
      itemOptions?: EapItemOption[];
      hierarchyNodes?: EapHierarchyNode[];
      childrenByParent?: Record<string, EapHierarchyNode[]>;
      rootCodes?: string[];
      professionalsByDisciplina?: Record<string, ProfessionalOption[]>;
      activitiesList?: any[];
    };
  };
}

interface PublicEapEnvelope {
  source?: string;
  version?: string;
  publishedAt?: string;
  data?: {
    registro?: {
      contracts?: EapContractOption[];
      osOptions?: EapOsOption[];
      itemOptions?: EapItemOption[];
      hierarchyNodes?: EapHierarchyNode[];
      childrenByParent?: Record<string, EapHierarchyNode[]>;
      rootCodes?: string[];
    };
    cronograma?: any[];
  };
}

interface BatchResponse {
  success: boolean; error?: string; message?: string; duplicateItems?: Array<{ itemCodigo: string; itemNome: string }>;
  syncUpdated?: boolean; syncError?: string; registroSnapshot?: Partial<RegistroDataResponse>;
}

interface RegistroDeAtividadeProps {
  currentUser: AuthUser;
  preloadedData?: any;
  viewMode?: 'registro' | 'andamento' | 'atividades';
}

interface NewActivityDraft {
  localId: string; contratoCodigo: string; contratoNome: string; osCodigo: string; osNome: string;
  setor: string; itemCodigo: string; itemNome: string; profissionaisEmails: string[]; profissionaisNomes: string[];
  todoId?: string; todoTitulo?: string; todoDescricao?: string;
  dificuldade: DifficultyLevel; descricao: string; avancoInicial: number;
}

interface ActivityUpdateDraft {
  profissionaisEmails: string[]; profissionaisNomes: string[]; avancoAtual: number; avaliacaoAtual: string; observacaoAtual: string;
}

interface LocalDraftPayload {
  formData: { contratoCodigo: string; osCodigo: string; setor: string; itemCodigo: string; todoId?: string; profissionaisEmails: string[]; dificuldade: DifficultyLevel | ''; descricao: string; avancoInicial: number; };
  draftQueue: NewActivityDraft[]; pendingChanges: Record<string, ActivityUpdateDraft>; expandedActivities: Record<string, boolean>;
}

interface RegistroViewCachePayload {
  contracts?: EapContractOption[];
  osOptions?: EapOsOption[];
  itemOptions?: EapItemOption[];
  hierarchyNodes?: EapHierarchyNode[];
  childrenByParent?: Record<string, EapHierarchyNode[]>;
  rootCodes?: string[];
  professionals?: ProfessionalOption[];
  activeActivities?: RegistroAtividade[];
  completedActivities?: RegistroAtividade[];
  updatedAt?: string;
}

function normalizeDiscipline(value?: string) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
}

function getProfessionalsByDiscipline(
  professionalsByDisciplina: Record<string, ProfessionalOption[]> | undefined,
  disciplina?: string,
) {
  if (!professionalsByDisciplina || typeof professionalsByDisciplina !== 'object') return [];

  const exactKey = String(disciplina || '').trim() || 'Sem disciplina';
  const exactMatch = professionalsByDisciplina[exactKey];
  if (Array.isArray(exactMatch) && exactMatch.length > 0) return exactMatch;

  const normalizedTarget = normalizeDiscipline(disciplina) || normalizeDiscipline('Sem disciplina');
  const matchedEntry = Object.entries(professionalsByDisciplina).find(([key, value]) => (
    normalizeDiscipline(key) === normalizedTarget && Array.isArray(value)
  ));

  return matchedEntry?.[1] || [];
}

function isHierarchyCode(value?: string) {
  return /^\d+(?:\.\d+)*$/.test(String(value || '').trim());
}

function getVisualLabel(primary?: string, fallback?: string, emptyLabel = '') {
  const first = String(primary || '').trim();
  const second = String(fallback || '').trim();
  if (first && !isHierarchyCode(first)) return first;
  if (second && !isHierarchyCode(second)) return second;
  return emptyLabel || first || second;
}

function splitPipeList(value: any): string[] {
  if (Array.isArray(value)) return value.map((item) => String(item || '').trim()).filter(Boolean);
  return String(value || '').split(' | ').map((item) => item.trim()).filter(Boolean);
}

function normalizeRegistroActivity(
  item: any,
  osNameByCode: Map<string, string> = new Map(),
  itemNameByCode: Map<string, string> = new Map(),
): RegistroAtividade {
  const osCodigo = String(item?.osCodigo || '').trim();
  const itemCodigo = String(item?.itemCodigo || '').trim();

  return {
    id: String(item?.id || item?.activityId || '').trim(),
    dataRegistro: String(item?.dataRegistro || ''),
    createdByEmail: String(item?.createdByEmail || item?.criadoPorEmail || ''),
    contratoCodigo: String(item?.contratoCodigo || ''),
    contratoNome: String(item?.contratoNome || ''),
    osCodigo,
    osNome: getVisualLabel(String(item?.osNome || ''), osNameByCode.get(osCodigo) || '', String(item?.osNome || '')),
    setor: String(item?.setor || ''),
    itemCodigo,
    itemNome: getVisualLabel(String(item?.itemNome || ''), itemNameByCode.get(itemCodigo) || String(item?.descricao || ''), String(item?.itemNome || '')),
    profissionais: splitPipeList(item?.profissionais),
    profissionaisEmails: splitPipeList(item?.profissionaisEmails),
    dificuldade: String(item?.dificuldade || 'Moderada') as DifficultyLevel,
    descricao: String(item?.descricao || ''),
    avancoAtual: Number(item?.avancoAtual || 0),
    avaliacaoAtual: String(item?.avaliacaoAtual || ''),
    observacaoAtual: String(item?.observacaoAtual || ''),
    status: String(item?.status || 'em_andamento') as RegistroAtividade['status'],
    data100: String(item?.data100 || ''),
    dataConclusaoEfetiva: String(item?.dataConclusaoEfetiva || ''),
    ultimaAtualizacao: String(item?.ultimaAtualizacao || ''),
    disciplina: String(item?.disciplina || item?.criadoPorDisciplina || ''),
    criadoPorDisciplina: String(item?.criadoPorDisciplina || item?.disciplina || ''),
  };
}

function activityMatchesUserDiscipline(activity: Partial<RegistroAtividade> | any, currentUser: AuthUser, professionals: ProfessionalOption[] = []) {
  const currentDisciplina = normalizeDiscipline(currentUser.disciplina);
  if (!currentDisciplina) return true;

  const activityDisciplina = normalizeDiscipline(activity?.criadoPorDisciplina || activity?.disciplina);
  if (activityDisciplina) return activityDisciplina === currentDisciplina;

  const professionalEmails = Array.isArray(activity?.profissionaisEmails)
    ? activity.profissionaisEmails
    : String(activity?.profissionaisEmails || '').split(' | ');
  const disciplineEmails = new Set(
    professionals
      .filter((item) => normalizeDiscipline(item.disciplina) === currentDisciplina)
      .map((item) => String(item.email || '').trim().toLowerCase())
      .filter(Boolean)
  );

  return professionalEmails.some((email: string) => disciplineEmails.has(String(email || '').trim().toLowerCase()));
}

function getPlanningTodoSources(preloadedData: any): any[] {
  let localItems: any[] = [];
  try {
    const raw = localStorage.getItem(PLANNING_TODOS_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    localItems = Array.isArray(parsed) ? parsed : [];
  } catch {}

  const registro = preloadedData?.registro || preloadedData || {};
  const planejamento = preloadedData?.planejamento || {};
  const candidates = [
    registro.itensAFazer,
    registro.itensAFazerOptions,
    registro.planejamentoItens,
    registro.todoItems,
    planejamento.itensAFazer,
    planejamento.todoItems,
  ];
  const jsonItems = candidates.find((item) => Array.isArray(item)) || [];
  return [...localItems, ...jsonItems];
}

function buildTodoOptions(preloadedData: any): TodoOption[] {
  return getPlanningTodoSources(preloadedData)
    .map((item: any, index: number) => {
      const titulo = String(item?.titulo || item?.nome || item?.name || item?.descricao || item?.description || '').trim();
      const descricao = String(item?.descricao || item?.description || titulo).trim();
      const id = String(item?.id || item?.codigo || item?.code || `${item?.itemCodigo || 'todo'}-${index}`).trim();
      return {
        id,
        titulo: titulo || `Item a fazer ${index + 1}`,
        descricao,
        disciplina: String(item?.disciplina || item?.discipline || item?.setor || '').trim(),
        contratoCodigo: String(item?.contratoCodigo || item?.contractCode || '').trim(),
        osCodigo: String(item?.osCodigo || item?.osCode || '').trim(),
        osNome: String(item?.osNome || item?.osName || '').trim(),
        itemCodigo: String(item?.itemCodigo || item?.activityCode || '').trim(),
        itemNome: String(item?.itemNome || item?.activityName || '').trim(),
      };
    })
    .filter((item) => item.id && item.titulo);
}

function getVisibleRegistroActivities(allActivities: any[], currentUser: AuthUser, viewMode: 'registro' | 'andamento' | 'atividades') {
  if (viewMode === 'andamento' || viewMode === 'atividades') {
    return allActivities.filter((item) => activityMatchesUserDiscipline(item, currentUser));
  }

  return allActivities;
}

function buildRegistroViewModel(preloadedData: any, currentUser: AuthUser, viewMode: 'registro' | 'andamento' | 'atividades') {
  const empty = {
    contracts: [] as EapContractOption[],
    osOptions: [] as EapOsOption[],
    itemOptions: [] as EapItemOption[],
    hierarchyNodes: [] as EapHierarchyNode[],
    childrenByParent: {} as Record<string, EapHierarchyNode[]>,
    rootCodes: [] as string[],
    professionals: [] as ProfessionalOption[],
    activeActivities: [] as RegistroAtividade[],
    completedActivities: [] as RegistroAtividade[],
  };

  if (!preloadedData || typeof preloadedData !== 'object') return empty;

  const osNameByCode = new Map<string, string>((preloadedData.osOptions || []).map((item: EapOsOption) => [String(item.codigo || ''), String(item.nome || '')]));
  const itemNameByCode = new Map<string, string>((preloadedData.itemOptions || []).map((item: EapItemOption) => [String(item.codigo || ''), String(item.nome || '')]));

  if (Array.isArray(preloadedData.activeActivities) || Array.isArray(preloadedData.completedActivities)) {
    return {
      contracts: preloadedData.contracts || [],
      osOptions: preloadedData.osOptions || [],
      itemOptions: preloadedData.itemOptions || [],
      hierarchyNodes: preloadedData.hierarchyNodes || [],
      childrenByParent: preloadedData.childrenByParent || {},
      rootCodes: preloadedData.rootCodes || [],
      professionals: preloadedData.professionals || [],
      activeActivities: (preloadedData.activeActivities || []).map((item: any) => normalizeRegistroActivity(item, osNameByCode, itemNameByCode)),
      completedActivities: (preloadedData.completedActivities || []).map((item: any) => normalizeRegistroActivity(item, osNameByCode, itemNameByCode)),
    };
  }

  const allActivities = Array.isArray(preloadedData.activitiesList) ? preloadedData.activitiesList : [];
  const visibleActivities = getVisibleRegistroActivities(allActivities, currentUser, viewMode);
  const mappedActivities: RegistroAtividade[] = visibleActivities.map((item) => normalizeRegistroActivity(item, osNameByCode, itemNameByCode));

  return {
    contracts: preloadedData.contracts || [],
    osOptions: preloadedData.osOptions || [],
    itemOptions: preloadedData.itemOptions || [],
    hierarchyNodes: preloadedData.hierarchyNodes || [],
    childrenByParent: preloadedData.childrenByParent || {},
    rootCodes: preloadedData.rootCodes || [],
    professionals: getProfessionalsByDiscipline(preloadedData.professionalsByDisciplina, currentUser.disciplina),
    activeActivities: mappedActivities.filter((item) => item.status !== 'concluida'),
    completedActivities: mappedActivities.filter((item) => item.status === 'concluida'),
  };
}

function normalizeEapCode(value: any) {
  return String(value || '').trim();
}

function getEapRows(eapData: any) {
  const resolved = eapData?.data && typeof eapData.data === 'object' ? eapData.data : eapData;
  return Array.isArray(resolved?.atual) ? resolved.atual.filter((row: any) => normalizeEapCode(row?.[0])) : [];
}

function isEapOsName(value: any) {
  const text = normalizeEapCode(value);
  if (!text) return false;
  return /^_?OS(?=$|[\s_\-.0-9A-Za-zÀ-ÿ])/i.test(text);
}

function buildRegistroDataFromEapRows(eapData: any) {
  const rows = getEapRows(eapData);
  const contracts: EapContractOption[] = [];
  const osOptions: EapOsOption[] = [];
  const itemOptions: EapItemOption[] = [];
  const hierarchyNodes: EapHierarchyNode[] = [];
  const rootCodes: string[] = [];
  const childrenByParent: Record<string, EapHierarchyNode[]> = {};
  const seen = new Set<string>();

  const addNode = (node: EapHierarchyNode) => {
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

function applyUnifiedEapToRegistro(registro: any, eapPayload: PublicEapEnvelope | null) {
  const eapData = eapPayload?.data;
  const eapRegistro = eapData?.registro;
  const next = {
    ...(registro || {}),
    contracts: Array.isArray(eapRegistro?.contracts) ? eapRegistro.contracts : registro?.contracts,
    osOptions: Array.isArray(eapRegistro?.osOptions) ? eapRegistro.osOptions : registro?.osOptions,
    itemOptions: Array.isArray(eapRegistro?.itemOptions) ? eapRegistro.itemOptions : registro?.itemOptions,
    hierarchyNodes: Array.isArray(eapRegistro?.hierarchyNodes) ? eapRegistro.hierarchyNodes : registro?.hierarchyNodes,
    childrenByParent: eapRegistro?.childrenByParent && typeof eapRegistro.childrenByParent === 'object' ? eapRegistro.childrenByParent : registro?.childrenByParent,
    rootCodes: Array.isArray(eapRegistro?.rootCodes) ? eapRegistro.rootCodes : registro?.rootCodes,
  };

  if (hasRegistroHierarchy(next)) return next;

  const derivedRegistro = buildRegistroDataFromEapRows(eapData);
  if (derivedRegistro.contracts.length === 0 && derivedRegistro.osOptions.length === 0 && derivedRegistro.itemOptions.length === 0) return next;

  return {
    ...next,
    contracts: Array.isArray(next.contracts) && next.contracts.length > 0 ? next.contracts : derivedRegistro.contracts,
    osOptions: Array.isArray(next.osOptions) && next.osOptions.length > 0 ? next.osOptions : derivedRegistro.osOptions,
    itemOptions: Array.isArray(next.itemOptions) && next.itemOptions.length > 0 ? next.itemOptions : derivedRegistro.itemOptions,
    hierarchyNodes: Array.isArray(next.hierarchyNodes) && next.hierarchyNodes.length > 0 ? next.hierarchyNodes : derivedRegistro.hierarchyNodes,
    childrenByParent: next.childrenByParent && Object.keys(next.childrenByParent).length > 0 ? next.childrenByParent : derivedRegistro.childrenByParent,
    rootCodes: Array.isArray(next.rootCodes) && next.rootCodes.length > 0 ? next.rootCodes : derivedRegistro.rootCodes,
  };
}

function normalizeHierarchyNodes(hierarchyNodes?: EapHierarchyNode[], contracts?: EapContractOption[], osOptions?: EapOsOption[], itemOptions?: EapItemOption[]) {
  if (Array.isArray(hierarchyNodes) && hierarchyNodes.length > 0) return hierarchyNodes;

  const fallbackNodes: EapHierarchyNode[] = [];
  const seen = new Set<string>();

  (contracts || []).forEach((item) => {
    if (!item?.codigo || seen.has(item.codigo)) return;
    seen.add(item.codigo);
    fallbackNodes.push({
      codigo: item.codigo,
      nome: item.nome,
      tipo: 'contrato',
      nivel: 0,
      parentCodigo: '',
      contratoCodigo: item.codigo,
      osCodigo: '',
    });
  });

  (osOptions || []).forEach((item) => {
    if (!item?.codigo || seen.has(item.codigo)) return;
    seen.add(item.codigo);
    fallbackNodes.push({
      codigo: item.codigo,
      nome: item.nome,
      tipo: 'os',
      nivel: (item.codigo.match(/\./g) || []).length,
      parentCodigo: item.contratoCodigo,
      contratoCodigo: item.contratoCodigo,
      osCodigo: item.codigo,
    });
  });

  (itemOptions || []).forEach((item) => {
    if (!item?.codigo || seen.has(item.codigo)) return;
    seen.add(item.codigo);
    fallbackNodes.push({
      codigo: item.codigo,
      nome: item.nome,
      tipo: 'item',
      nivel: (item.codigo.match(/\./g) || []).length,
      parentCodigo: item.osCodigo,
      contratoCodigo: item.osCodigo.split('.')[0] || '',
      osCodigo: item.osCodigo,
    });
  });

  return fallbackNodes;
}

function buildChildrenMapFromNodes(nodes: EapHierarchyNode[]) {
  const out: Record<string, EapHierarchyNode[]> = {};
  nodes.forEach((node) => {
    const key = node.parentCodigo || 'ROOT';
    if (!out[key]) out[key] = [];
    out[key].push(node);
  });
  return out;
}

function isOrderServiceName(value: string) {
  const text = String(value || '').trim();
  if (!text) return false;
  return /^_?OS(?=$|[\s_\-.0-9A-Za-zÀ-ÿ])/i.test(text);
}

const difficultyColorMap: Record<DifficultyLevel, string> = {
  Facil: 'bg-blue-50 text-blue-700 border-blue-200',
  Moderada: 'bg-green-50 text-green-700 border-green-200',
  Dificil: 'bg-red-50 text-red-700 border-red-200',
};

function parsePtBrDateTime(text?: string) {
  if (!text) return null;
  const normalized = String(text).trim();
  if (!normalized) return null;

  const parts = normalized.split(' ');
  if (parts.length >= 2) {
    const [datePart, timePart] = parts;
    const d = datePart.split('/');
    const t = timePart.split(':');
    if (d.length === 3 && t.length >= 2) {
      const result = new Date(
        Number(d[2]),
        Number(d[1]) - 1,
        Number(d[0]),
        Number(t[0]),
        Number(t[1]),
        t[2] ? Number(t[2]) : 0
      );
      if (!Number.isNaN(result.getTime())) return result;
    }
  }

  const nativeDate = new Date(normalized);
  if (!Number.isNaN(nativeDate.getTime())) return nativeDate;

  return null;
}

function getDaysWithoutUpdate(value?: string) {
  const dt = parsePtBrDateTime(value);
  if (!dt) return '-';
  const diffDays = Math.floor((new Date().getTime() - dt.getTime()) / (1000 * 60 * 60 * 24));
  return String(Math.max(0, diffDays));
}

function formatShortPtBrDate(value?: string) {
  const dt = parsePtBrDateTime(value);
  if (!dt) return '';
  const day = String(dt.getDate()).padStart(2, '0');
  const month = String(dt.getMonth() + 1).padStart(2, '0');
  const year = String(dt.getFullYear()).slice(-2);
  return `${day}/${month}/${year}`;
}

function createLocalId() {
  try { if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID(); } catch (e) {}
  return String(Date.now()) + Math.random().toString(16).slice(2);
}

function getDraftStorageKey(email: string) { return `quanta_registro_atividade_${String(email || '').trim().toLowerCase()}`; }
function getRegistroCacheKey(email: string) { return `quanta_registro_atividade_cache_${String(email || '').trim().toLowerCase()}`; }

function readRegistroCache(email: string): RegistroViewCachePayload | null {
  try {
    const raw = localStorage.getItem(getRegistroCacheKey(email));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as RegistroViewCachePayload;
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch (error) {
    return null;
  }
}

function mergeRegistroViewData(serverData: ReturnType<typeof buildRegistroViewModel>, cachedData: RegistroViewCachePayload | null) {
  if (!cachedData) return serverData;

  return {
    contracts: serverData.contracts.length ? serverData.contracts : cachedData.contracts || [],
    osOptions: serverData.osOptions.length ? serverData.osOptions : cachedData.osOptions || [],
    itemOptions: serverData.itemOptions.length ? serverData.itemOptions : cachedData.itemOptions || [],
    hierarchyNodes: serverData.hierarchyNodes.length ? serverData.hierarchyNodes : cachedData.hierarchyNodes || [],
    childrenByParent: Object.keys(serverData.childrenByParent || {}).length ? serverData.childrenByParent : cachedData.childrenByParent || {},
    rootCodes: serverData.rootCodes.length ? serverData.rootCodes : cachedData.rootCodes || [],
    professionals: serverData.professionals.length ? serverData.professionals : cachedData.professionals || [],
    activeActivities: mergeActivitiesWithCache(serverData.activeActivities, cachedData.activeActivities || []),
    completedActivities: mergeActivitiesWithCache(serverData.completedActivities, cachedData.completedActivities || []),
  };
}

function hasLocalDraftPayload(payload: LocalDraftPayload) {
  const draftQueue = Array.isArray(payload?.draftQueue) ? payload.draftQueue : [];
  const pendingChanges = payload?.pendingChanges && typeof payload.pendingChanges === 'object' ? payload.pendingChanges : {};
  return Boolean(payload?.formData?.descricao)
    || Boolean(payload?.formData?.itemCodigo)
    || draftQueue.length > 0
    || Object.keys(pendingChanges).length > 0;
}

function normalizePercentage(value: number) {
  return Math.max(0, Math.min(100, Number(value) || 0));
}

function mergeActivitiesWithCache(serverItems: RegistroAtividade[], cachedItems: RegistroAtividade[]) {
  const byId = new Map<string, RegistroAtividade>();
  serverItems.map((item) => normalizeRegistroActivity(item)).forEach((item) => { if (item?.id) byId.set(item.id, item); });
  cachedItems.map((item) => normalizeRegistroActivity(item)).forEach((item) => { if (item?.id) byId.set(item.id, item); });
  return Array.from(byId.values()).sort((a, b) => {
    const aTime = parsePtBrDateTime(a.dataRegistro)?.getTime() || 0;
    const bTime = parsePtBrDateTime(b.dataRegistro)?.getTime() || 0;
    return bTime - aTime;
  });
}

function filterRegistroPayloadByContract<T extends { contracts?: any[]; osOptions?: any[]; itemOptions?: any[]; activitiesList?: any[]; activeActivities?: any[]; completedActivities?: any[] }>(payload: T, contractCode: string): T {
  const target = String(contractCode || '').trim();
  if (!target) return payload;
  return {
    ...payload,
    contracts: (payload.contracts || []).filter((item: any) => String(item?.codigo || '').trim() === target),
    osOptions: (payload.osOptions || []).filter((item: any) => String(item?.contratoCodigo || '').trim() === target),
    itemOptions: (payload.itemOptions || []).filter((item: any) => String(item?.osCodigo || '').trim().startsWith(`${target}.`)),
    activitiesList: (payload.activitiesList || []).filter((item: any) => String(item?.contratoCodigo || '').trim() === target),
    activeActivities: (payload.activeActivities || []).filter((item: any) => String(item?.contratoCodigo || '').trim() === target),
    completedActivities: (payload.completedActivities || []).filter((item: any) => String(item?.contratoCodigo || '').trim() === target),
  };
}

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function fetchRegistroData(currentUser: AuthUser): Promise<RegistroDataResponse> {
  if (!isFirebaseConfigured()) throw new Error('Firebase nao configurado para Registro de Atividades.');
  return fetchRegistroDataFromFirebase(currentUser);
}

function MultiProfessionalSelector({ value, options, onChange }: { value: string[]; options: ProfessionalOption[]; onChange: (next: string[]) => void; }) {
  const [open, setOpen] = useState(false);
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const toggleItem = (email: string) => onChange(value.includes(email) ? value.filter((item) => item !== email) : [...value, email]);
  const selectedNames = options.filter((o) => value.includes(o.email)).map((o) => o.nome);
  const getSecondaryLabel = (option: ProfessionalOption) => String(option.email || '').startsWith('terceirizada:')
    ? 'Terceirizada'
    : option.email;

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button type="button" onClick={() => setOpen((prev) => !prev)} className="bentham-input flex items-center justify-between text-left">
        <span className={selectedNames.length ? 'text-bentham-dark' : 'text-bentham-gray'}>{selectedNames.length ? selectedNames.join(', ') : 'Selecione os profissionais'}</span>
        <ChevronDown size={18} className="text-bentham-gray" />
      </button>
      {open && (
        <div className="absolute z-20 mt-2 w-full bg-white border border-bentham-border rounded-xl shadow-lg max-h-64 overflow-y-auto">
          <div className="p-2 space-y-1">
            {options.map((option) => (
              <label key={option.email} className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg hover:bg-[#F9FAFB] cursor-pointer">
                <div className="min-w-0"><p className="text-[13px] font-semibold text-bentham-dark truncate">{option.nome}</p><p className="text-[11px] text-bentham-gray truncate">{getSecondaryLabel(option)}</p></div>
                <input type="checkbox" checked={value.includes(option.email)} onChange={() => toggleItem(option.email)} className="w-4 h-4 accent-[#F05D28]" />
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function RegistroDeAtividade({ currentUser, preloadedData, viewMode = 'registro' }: RegistroDeAtividadeProps) {
  const initialRegistroData = mergeRegistroViewData(buildRegistroViewModel(preloadedData, currentUser, viewMode), readRegistroCache(currentUser.email));
  const [contracts, setContracts] = useState<EapContractOption[]>(initialRegistroData.contracts);
  const [osOptions, setOsOptions] = useState<EapOsOption[]>(initialRegistroData.osOptions);
  const [itemOptions, setItemOptions] = useState<EapItemOption[]>(initialRegistroData.itemOptions);
  const [hierarchyNodes, setHierarchyNodes] = useState<EapHierarchyNode[]>(initialRegistroData.hierarchyNodes);
  const [childrenByParent, setChildrenByParent] = useState<Record<string, EapHierarchyNode[]>>(initialRegistroData.childrenByParent);
  const [rootCodes, setRootCodes] = useState<string[]>(initialRegistroData.rootCodes);
  const [professionals, setProfessionals] = useState<ProfessionalOption[]>(initialRegistroData.professionals);
  const [activeActivities, setActiveActivities] = useState<RegistroAtividade[]>(initialRegistroData.activeActivities);
  const [completedActivities, setCompletedActivities] = useState<RegistroAtividade[]>(initialRegistroData.completedActivities);
  const todoOptions = useMemo(() => buildTodoOptions(preloadedData), [preloadedData]);
  const [showPlannedItems, setShowPlannedItems] = useState(false);

  const [sendingBatch, setSendingBatch] = useState(false);
  const [savingChanges, setSavingChanges] = useState(false);
  const [savingAll, setSavingAll] = useState(false);
  const [syncingPublishedJson, setSyncingPublishedJson] = useState(false);
  const [balloonMessage, setBalloonMessage] = useState('');
  const [searchText, setSearchText] = useState('');
  const deferredSearchText = useDeferredValue(searchText);

  const [draftQueue, setDraftQueue] = useState<NewActivityDraft[]>([]);
  const [pendingChanges, setPendingChanges] = useState<Record<string, ActivityUpdateDraft>>({});
  const [expandedActivities, setExpandedActivities] = useState<Record<string, boolean>>({});

  const [showRestorePrompt, setShowRestorePrompt] = useState(false);
  const [restorableDraft, setRestorableDraft] = useState<LocalDraftPayload | null>(null);
  const [hasInitializedDraftRecovery, setHasInitializedDraftRecovery] = useState(false);
  const [showRegistroAccordion, setShowRegistroAccordion] = useState(viewMode !== 'atividades');
  const draftSaveTimerRef = useRef<number | null>(null);
  const latestDraftPayloadRef = useRef<LocalDraftPayload | null>(null);
  const freshDataAttemptRef = useRef(false);

  const [formData, setFormData] = useState({
    contratoCodigo: '', osCodigo: '', setor: 'Engenharia', itemCodigo: '', todoId: '', profissionaisEmails: [] as string[], dificuldade: '' as DifficultyLevel | '', descricao: '', avancoInicial: 0,
  });

  const persistRegistroCache = (payload: RegistroViewCachePayload) => {
    try {
      localStorage.setItem(getRegistroCacheKey(currentUser.email), JSON.stringify({
        ...payload,
        updatedAt: new Date().toISOString(),
      }));
    } catch (error) {}
  };

  const applyActivitiesState = (nextActiveActivities: RegistroAtividade[], nextCompletedActivities: RegistroAtividade[]) => {
    setActiveActivities(nextActiveActivities);
    setCompletedActivities(nextCompletedActivities);
  };

  const applyRegistroSnapshot = (snapshot?: Partial<RegistroDataResponse>) => {
    if (!snapshot) return;
    if (Array.isArray(snapshot.contracts)) setContracts(snapshot.contracts);
    if (Array.isArray(snapshot.osOptions)) setOsOptions(snapshot.osOptions);
    if (Array.isArray(snapshot.itemOptions)) setItemOptions(snapshot.itemOptions);
    if (Array.isArray(snapshot.rootCodes)) setRootCodes(snapshot.rootCodes);
    const nextHierarchyNodes = normalizeHierarchyNodes(snapshot.hierarchyNodes, snapshot.contracts, snapshot.osOptions, snapshot.itemOptions);
    if (nextHierarchyNodes.length) {
      setHierarchyNodes(nextHierarchyNodes);
      setChildrenByParent(snapshot.childrenByParent && Object.keys(snapshot.childrenByParent).length > 0
        ? snapshot.childrenByParent
        : buildChildrenMapFromNodes(nextHierarchyNodes));
    }
    if (Array.isArray(snapshot.professionals)) setProfessionals(snapshot.professionals);
    if (Array.isArray(snapshot.activeActivities) || Array.isArray(snapshot.completedActivities)) {
      const osNameByCode = new Map<string, string>((snapshot.osOptions || osOptions).map((item: EapOsOption) => [String(item.codigo || ''), String(item.nome || '')]));
      const itemNameByCode = new Map<string, string>((snapshot.itemOptions || itemOptions).map((item: EapItemOption) => [String(item.codigo || ''), String(item.nome || '')]));
      applyActivitiesState(
        (snapshot.activeActivities || []).map((item: any) => normalizeRegistroActivity(item, osNameByCode, itemNameByCode)),
        (snapshot.completedActivities || []).map((item: any) => normalizeRegistroActivity(item, osNameByCode, itemNameByCode)),
      );
    }
  };

  useEffect(() => {
    if (preloadedData && Object.keys(preloadedData).length > 0) {
      const nextData = mergeRegistroViewData(buildRegistroViewModel(preloadedData, currentUser, viewMode), readRegistroCache(currentUser.email));
      setContracts(nextData.contracts);
      setOsOptions(nextData.osOptions);
      setItemOptions(nextData.itemOptions);
      setHierarchyNodes(normalizeHierarchyNodes(nextData.hierarchyNodes, nextData.contracts, nextData.osOptions, nextData.itemOptions));
      setChildrenByParent(Object.keys(nextData.childrenByParent || {}).length > 0
        ? nextData.childrenByParent
        : buildChildrenMapFromNodes(normalizeHierarchyNodes(nextData.hierarchyNodes, nextData.contracts, nextData.osOptions, nextData.itemOptions)));
      setRootCodes(nextData.rootCodes);
      setProfessionals(nextData.professionals);
      applyActivitiesState(
        nextData.activeActivities,
        nextData.completedActivities,
      );
    }
  }, [preloadedData, currentUser, viewMode]);

  useEffect(() => {
    setShowRegistroAccordion(viewMode !== 'atividades');
  }, [viewMode]);

  useEffect(() => {
    persistRegistroCache({
      contracts,
      osOptions,
      itemOptions,
      hierarchyNodes,
      childrenByParent,
      rootCodes,
      professionals,
      activeActivities,
      completedActivities,
    });
  }, [contracts, osOptions, itemOptions, hierarchyNodes, childrenByParent, rootCodes, professionals, activeActivities, completedActivities]);

  useEffect(() => {
    const lockedContract = String(currentUser.contrato || '').trim();
    if (!lockedContract) return;
    setFormData((prev) => prev.contratoCodigo === lockedContract
      ? prev
      : { ...prev, contratoCodigo: lockedContract, osCodigo: '', itemCodigo: '', todoId: '' });
  }, [currentUser.contrato]);

  const filteredProfessionals = useMemo(() => {
    const myDiscipline = String(currentUser.disciplina || '').trim().toLowerCase();
    if (!myDiscipline) return professionals;
    return professionals.filter(p => String(p.disciplina || '').trim().toLowerCase() === myDiscipline);
  }, [professionals, currentUser.disciplina]);

  const selectedContract = useMemo(() => contracts.find((c) => c.codigo === formData.contratoCodigo), [contracts, formData.contratoCodigo]);
  const filteredOs = useMemo(() => {
    return osOptions.filter((item) => item.contratoCodigo === formData.contratoCodigo).map((item) => ({
      ...item,
      tipo: 'os' as const,
      nivel: (item.codigo.match(/\./g) || []).length,
      parentCodigo: item.contratoCodigo,
      osCodigo: item.codigo,
    })).filter((item) => isOrderServiceName(item.nome || item.codigo));
  }, [osOptions, formData.contratoCodigo]);
  const selectedOs = useMemo(() => filteredOs.find((item) => item.codigo === formData.osCodigo), [filteredOs, formData.osCodigo]);
  const filteredItems = useMemo(() => {
    return itemOptions.filter((item) => item.osCodigo === formData.osCodigo).map((item) => ({
      ...item,
      tipo: 'item' as const,
      nivel: (item.codigo.match(/\./g) || []).length,
      parentCodigo: item.osCodigo,
      contratoCodigo: item.osCodigo.split('.')[0] || '',
    }));
  }, [itemOptions, formData.osCodigo]);
  const filteredTodos = useMemo(() => {
    const userDiscipline = normalizeDiscipline(currentUser.disciplina);
    return todoOptions.filter((item) => {
      const matchContract = !item.contratoCodigo || item.contratoCodigo === formData.contratoCodigo;
      const matchOs = !item.osCodigo || item.osCodigo === formData.osCodigo;
      const matchItem = !item.itemCodigo || item.itemCodigo === formData.itemCodigo;
      const matchDiscipline = !item.disciplina || normalizeDiscipline(item.disciplina) === userDiscipline;
      return matchContract && matchOs && matchItem && matchDiscipline;
    });
  }, [currentUser.disciplina, formData.contratoCodigo, formData.itemCodigo, formData.osCodigo, todoOptions]);
  const selectedTodo = useMemo(() => filteredTodos.find((item) => item.id === formData.todoId), [filteredTodos, formData.todoId]);

  const filteredActivities = useMemo(() => {
    const term = deferredSearchText.trim().toLowerCase();
    if (!term) return activeActivities;
    return activeActivities.filter((item) => (
      item.itemCodigo.toLowerCase().includes(term) || item.itemNome.toLowerCase().includes(term) || item.osNome.toLowerCase().includes(term) || item.profissionais.join(', ').toLowerCase().includes(term)
    ));
  }, [activeActivities, deferredSearchText]);

  const visibleCompletedActivities = useMemo(() => {
    return completedActivities.filter((item) => activityMatchesUserDiscipline(item, currentUser, professionals));
  }, [completedActivities, currentUser, professionals]);
  const disciplineTodos = useMemo(() => {
    const userDiscipline = normalizeDiscipline(currentUser.disciplina);
    return todoOptions.filter((item) => !item.disciplina || normalizeDiscipline(item.disciplina) === userDiscipline);
  }, [currentUser.disciplina, todoOptions]);

  const hasPendingChanges = Object.keys(pendingChanges).length > 0;
  const hasQueuedActivities = draftQueue.length > 0;
  const hasBothPending = hasQueuedActivities && hasPendingChanges;
  const isMissingCoreData = contracts.length === 0 || osOptions.length === 0 || itemOptions.length === 0;

  const fetchFreshData = async () => {
    const cachedData = readRegistroCache(currentUser.email);

    try {
      const registroResponse = await fetchRegistroData(currentUser);
      const registro = filterRegistroPayloadByContract<RegistroDataResponse>(registroResponse, currentUser.contrato || '');
      if (!registro) throw new Error('Dados de registro ausentes no Firebase.');

      const nextContracts = Array.isArray(registro.contracts) && registro.contracts.length > 0
        ? registro.contracts
        : cachedData?.contracts || [];
      const nextOsOptions = Array.isArray(registro.osOptions) && registro.osOptions.length > 0
        ? registro.osOptions
        : cachedData?.osOptions || [];
      const nextItemOptions = Array.isArray(registro.itemOptions) && registro.itemOptions.length > 0
        ? registro.itemOptions
        : cachedData?.itemOptions || [];
      const nextRootCodes = Array.isArray(registro.rootCodes) && registro.rootCodes.length > 0
        ? registro.rootCodes
        : cachedData?.rootCodes || [];
      const nextHierarchyNodes = normalizeHierarchyNodes(
        registro.hierarchyNodes,
        nextContracts,
        nextOsOptions,
        nextItemOptions,
      );
      const nextChildrenByParent = registro.childrenByParent && Object.keys(registro.childrenByParent).length > 0
        ? registro.childrenByParent
        : (cachedData?.childrenByParent && Object.keys(cachedData.childrenByParent).length > 0
          ? cachedData.childrenByParent
          : buildChildrenMapFromNodes(nextHierarchyNodes));

      if (nextContracts.length === 0 || nextOsOptions.length === 0 || nextItemOptions.length === 0) {
        throw new Error('EAP sem contratos, OS ou atividades no Firebase.');
      }

      const responseProfessionals = Array.isArray(registro.professionals) ? registro.professionals : [];
      const nextProfessionals = responseProfessionals.length > 0
        ? responseProfessionals
        : (cachedData?.professionals && cachedData.professionals.length > 0
          ? cachedData.professionals
          : professionals);
      const allActivities = Array.isArray((registro as any).activitiesList)
        ? (registro as any).activitiesList
        : [...(registro.activeActivities || []), ...(registro.completedActivities || [])];
      const visibleActivities = getVisibleRegistroActivities(allActivities, currentUser, viewMode);
      const osNameByCode = new Map<string, string>(nextOsOptions.map((item: EapOsOption) => [String(item.codigo || ''), String(item.nome || '')]));
      const itemNameByCode = new Map<string, string>(nextItemOptions.map((item: EapItemOption) => [String(item.codigo || ''), String(item.nome || '')]));

      const mappedActivities: RegistroAtividade[] = visibleActivities.map((item) => normalizeRegistroActivity(item, osNameByCode, itemNameByCode));

      setContracts(nextContracts);
      setOsOptions(nextOsOptions);
      setItemOptions(nextItemOptions);
      setRootCodes(nextRootCodes);
      setHierarchyNodes(nextHierarchyNodes);
      setChildrenByParent(nextChildrenByParent);
      setProfessionals(nextProfessionals);
      applyActivitiesState(
        mergeActivitiesWithCache(mappedActivities.filter((item) => item.status !== 'concluida'), cachedData?.activeActivities || []),
        mergeActivitiesWithCache(mappedActivities.filter((item) => item.status === 'concluida'), cachedData?.completedActivities || []),
      );
    } catch {}
  };

  useEffect(() => {
    if (contracts.length > 0 && osOptions.length > 0 && itemOptions.length > 0 && professionals.length > 0) return;
    if (freshDataAttemptRef.current) return;

    freshDataAttemptRef.current = true;
    void fetchFreshData();
  }, [contracts.length, currentUser.contrato, currentUser.disciplina, currentUser.email, currentUser.role, itemOptions.length, osOptions.length, preloadedData, professionals.length]);

  const refreshFromPublishedJsonAfterSheetUpdate = async () => {
    setSyncingPublishedJson(true);
    try {
      await wait(PUBLIC_JSON_SYNC_DELAY_MS);
      await fetchFreshData();
    } finally {
      setSyncingPublishedJson(false);
    }
  };

  useEffect(() => {
    if (!balloonMessage) return;
    const timer = window.setTimeout(() => setBalloonMessage(''), 5000);
    return () => window.clearTimeout(timer);
  }, [balloonMessage]);

  useEffect(() => {
    if (hasInitializedDraftRecovery) return;
    try {
      const raw = localStorage.getItem(getDraftStorageKey(currentUser.email));
      if (raw) {
        const parsed = JSON.parse(raw) as LocalDraftPayload;
        if (hasLocalDraftPayload(parsed)) {
          setRestorableDraft(parsed); setShowRestorePrompt(true);
        }
      }
    } catch (error) {} finally { setHasInitializedDraftRecovery(true); }
  }, [currentUser.email, hasInitializedDraftRecovery]);

  const flushLocalDraft = useCallback(() => {
    if (!hasInitializedDraftRecovery) return;
    if (draftSaveTimerRef.current) {
      window.clearTimeout(draftSaveTimerRef.current);
      draftSaveTimerRef.current = null;
    }

    const key = getDraftStorageKey(currentUser.email);
    const payload = latestDraftPayloadRef.current;
    try {
      if (payload && hasLocalDraftPayload(payload)) {
        localStorage.setItem(key, JSON.stringify(payload));
      } else {
        localStorage.removeItem(key);
      }
    } catch (error) {}
  }, [currentUser.email, hasInitializedDraftRecovery]);

  useEffect(() => {
    if (!hasInitializedDraftRecovery) return;
    latestDraftPayloadRef.current = { formData, draftQueue, pendingChanges, expandedActivities };
    if (draftSaveTimerRef.current) window.clearTimeout(draftSaveTimerRef.current);
    draftSaveTimerRef.current = window.setTimeout(flushLocalDraft, 250);
  }, [formData, draftQueue, pendingChanges, expandedActivities, hasInitializedDraftRecovery, flushLocalDraft]);

  useEffect(() => {
    const handlePageHide = () => flushLocalDraft();
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') flushLocalDraft();
    };

    window.addEventListener('pagehide', handlePageHide);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.removeEventListener('pagehide', handlePageHide);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      flushLocalDraft();
    };
  }, [flushLocalDraft]);

  const clearLocalDraft = () => {
    latestDraftPayloadRef.current = null;
    if (draftSaveTimerRef.current) {
      window.clearTimeout(draftSaveTimerRef.current);
      draftSaveTimerRef.current = null;
    }
    try { localStorage.removeItem(getDraftStorageKey(currentUser.email)); } catch (error) {}
  };
  const restoreLocalDraft = () => {
    if (!restorableDraft) return;
    const restoredFormData = restorableDraft.formData || {};
    setFormData({
      contratoCodigo: '',
      osCodigo: '',
      setor: 'Engenharia',
      itemCodigo: '',
      todoId: '',
      dificuldade: '',
      descricao: '',
      avancoInicial: 0,
      ...restoredFormData,
      profissionaisEmails: splitPipeList(restoredFormData.profissionaisEmails),
    });
    setDraftQueue(restorableDraft.draftQueue || []); setPendingChanges(restorableDraft.pendingChanges || {}); setExpandedActivities(restorableDraft.expandedActivities || {});
    setShowRestorePrompt(false); setRestorableDraft(null); setBalloonMessage('Últimas alterações restauradas com sucesso.');
  };
  const discardLocalDraft = () => { clearLocalDraft(); setShowRestorePrompt(false); setRestorableDraft(null); };

  const getDraftForActivity = (activity: RegistroAtividade): ActivityUpdateDraft => {
    const draft = pendingChanges[activity.id] || {
      profissionaisEmails: activity.profissionaisEmails,
      profissionaisNomes: activity.profissionais,
      avancoAtual: activity.avancoAtual,
      avaliacaoAtual: activity.avaliacaoAtual,
      observacaoAtual: activity.observacaoAtual,
    };

    return {
      ...draft,
      profissionaisEmails: splitPipeList(draft.profissionaisEmails),
      profissionaisNomes: splitPipeList(draft.profissionaisNomes),
    };
  };

  const queueCurrentActivity = () => {
    if (!formData.contratoCodigo || !formData.osCodigo || !formData.itemCodigo) return setBalloonMessage('Preencha contrato, OS e atividade.');
    if (!formData.dificuldade) return setBalloonMessage('Selecione a dificuldade da atividade.');
    if (formData.descricao.trim().length < 50) return setBalloonMessage('A descrição precisa ter no mínimo 50 caracteres.');
    if (formData.profissionaisEmails.length === 0) return setBalloonMessage('Selecione pelo menos um profissional.');

    const itemSelected = filteredItems.find((item) => item.codigo === formData.itemCodigo);
    if (!itemSelected) return setBalloonMessage('Atividade inválida.');
    if (draftQueue.some((item) => item.itemCodigo === formData.itemCodigo) || activeActivities.some((item) => item.itemCodigo === formData.itemCodigo)) return setBalloonMessage('Atividade já registrada ou já está na fila.');

    const selectedProfessionalNames = filteredProfessionals.filter((item) => formData.profissionaisEmails.includes(item.email)).map((item) => item.nome);

    setDraftQueue((prev) => [...prev, { localId: createLocalId(), contratoCodigo: formData.contratoCodigo, contratoNome: selectedContract?.nome || '', osCodigo: formData.osCodigo, osNome: selectedOs?.nome || '', setor: formData.setor, itemCodigo: formData.itemCodigo, itemNome: itemSelected.nome, profissionaisEmails: formData.profissionaisEmails, profissionaisNomes: selectedProfessionalNames, dificuldade: formData.dificuldade, descricao: formData.descricao.trim(), avancoInicial: normalizePercentage(formData.avancoInicial) }]);
    setFormData({ contratoCodigo: String(currentUser.contrato || '').trim(), osCodigo: '', setor: 'Engenharia', itemCodigo: '', todoId: '', profissionaisEmails: [], dificuldade: '', descricao: '', avancoInicial: 0 });
    setBalloonMessage('Atividade adicionada à fila. Você pode registrar a próxima.');
  };

  const sendQueuedActivities = async (): Promise<boolean> => {
    if (draftQueue.length === 0) return false;
    setSendingBatch(true);
    try {
      if (!isFirebaseConfigured()) throw new Error('Firebase nao configurado para Registro de Atividades.');
      const data = await registerActivitiesInFirebase(currentUser, draftQueue);
      if (!data.success) throw new Error(data.error || 'Erro ao enviar lote de atividades.');
      if (data.registroSnapshot) applyRegistroSnapshot(data.registroSnapshot);
      setDraftQueue([]);
      setBalloonMessage(data.syncUpdated === false
        ? `${data.message || 'Atividades enviadas com sucesso.'} O cache local foi atualizado e a sincronizacao segue em segundo plano.`
        : (data.message || 'Atividades enviadas com sucesso.'));
      return true;
    } catch (error) { setBalloonMessage(error instanceof Error ? error.message : 'Erro ao enviar atividades.'); return false; } finally { setSendingBatch(false); }
  };

  const updatePendingDraft = (activity: RegistroAtividade, patch: Partial<ActivityUpdateDraft>) => {
    const nextDraft = { ...getDraftForActivity(activity), ...patch };
    const sameAsOriginal = JSON.stringify(nextDraft.profissionaisEmails) === JSON.stringify(activity.profissionaisEmails) && nextDraft.avancoAtual === activity.avancoAtual && nextDraft.avaliacaoAtual === activity.avaliacaoAtual && nextDraft.observacaoAtual === activity.observacaoAtual;
    setPendingChanges((prev) => { const clone = { ...prev }; if (sameAsOriginal) delete clone[activity.id]; else clone[activity.id] = nextDraft; return clone; });
  };

  const savePendingChanges = async (): Promise<boolean> => {
    const updates = Object.entries(pendingChanges as Record<string, ActivityUpdateDraft>).map(([activityId, draft]) => ({ activityId, ...draft }));
    if (!updates.length) return false;
    setSavingChanges(true);
    try {
      if (!isFirebaseConfigured()) throw new Error('Firebase nao configurado para Registro de Atividades.');
      const data = await updateActivitiesInFirebase(currentUser, updates);
      if (!data.success) throw new Error(data.error || 'Erro ao salvar alterações.');
      if (data.registroSnapshot) {
        applyRegistroSnapshot(data.registroSnapshot);
      } else {
        const updatesById = new Map(updates.map((item) => [item.activityId, item]));
        const nextActiveActivities = activeActivities.map((activity) => {
          const draft = updatesById.get(activity.id);
          if (!draft) return activity;
          const avancoAtual = normalizePercentage(Number(draft.avancoAtual));
          return {
            ...activity,
            profissionaisEmails: draft.profissionaisEmails,
            profissionais: draft.profissionaisNomes,
            avancoAtual,
            avaliacaoAtual: draft.avaliacaoAtual,
            observacaoAtual: draft.observacaoAtual,
            status: avancoAtual === 100 ? 'aguardando_conclusao' : activity.status === 'aguardando_conclusao' ? 'em_andamento' : activity.status,
            data100: avancoAtual === 100 ? (activity.data100 || new Date().toLocaleString('pt-BR')) : '',
            ultimaAtualizacao: new Date().toLocaleString('pt-BR'),
          };
        });
        applyActivitiesState(nextActiveActivities, completedActivities);
      }
      setPendingChanges({});
      setBalloonMessage(updates.some((item) => Number(item.avancoAtual) === 100) ? 'Em 3 dias as atividades com 100% serão tidas como entregues e irão para concluídos.' : data.message || 'Alterações salvas com sucesso.');
      return true;
    } catch (error) { setBalloonMessage(error instanceof Error ? error.message : 'Erro ao salvar alterações.'); return false; } finally { setSavingChanges(false); }
  };

  const handleSaveAll = async () => {
    if (!hasBothPending) return;
    setSavingAll(true);
    try {
      await sendQueuedActivities();
      await savePendingChanges();
    } finally { setSavingAll(false); }
  };

  const showRegistroForm = viewMode === 'registro' || viewMode === 'atividades';
  const showAndamentoSection = viewMode === 'andamento' || viewMode === 'atividades';
  const showCompletedSection = viewMode === 'registro' || viewMode === 'atividades';
  const registroFormExpanded = viewMode === 'atividades' ? showRegistroAccordion : true;

  const applyPlannedItemToForm = (item: TodoOption) => {
    setFormData((prev) => ({
      ...prev,
      contratoCodigo: item.contratoCodigo || prev.contratoCodigo,
      osCodigo: item.osCodigo || prev.osCodigo,
      itemCodigo: item.itemCodigo || '',
      todoId: item.id,
      descricao: item.descricao || prev.descricao,
    }));
    setShowPlannedItems(false);
    setBalloonMessage('Item planejado aplicado. Complete os campos restantes e registre a atividade.');
  };

  return (
    <div className="w-full relative">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full">
        {showRestorePrompt && (
          <div className="mb-6 rounded-2xl border border-[#FDE68A] bg-[#FFFBEB] px-5 py-4">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div className="text-[13px] font-semibold text-[#92400E]">Você saiu sem salvar as últimas alterações. Quer restaurá-las?</div>
              <div className="flex gap-3">
                <button type="button" onClick={restoreLocalDraft} className="h-10 px-4 rounded-xl bg-[#F05D28] text-white text-[13px] font-bold hover:opacity-90 transition-all">Sim, restaurar</button>
                <button type="button" onClick={discardLocalDraft} className="h-10 px-4 rounded-xl border border-[#E5E7EB] bg-white text-[#2D2D2D] text-[13px] font-bold hover:bg-[#F9FAFB] transition-all">Não, descartar</button>
              </div>
            </div>

          </div>
        )}

        {balloonMessage && <div className="mb-6 rounded-2xl border border-[#FED7AA] bg-[#FFF7ED] px-5 py-4 text-[13px] font-semibold text-[#C2410C]">{balloonMessage}</div>}

        {isMissingCoreData && (
          <div className="mb-6 rounded-2xl border border-[#BFDBFE] bg-[#EFF6FF] px-5 py-4 text-[13px] font-semibold text-[#1D4ED8]">
            Carregando contratos, OS e atividades...
          </div>
        )}

        {showRegistroForm && (
        <div className="space-y-4">
        {viewMode === 'atividades' && (
          <button
            type="button"
            onClick={() => setShowRegistroAccordion((prev) => !prev)}
            className="flex w-full items-center justify-between rounded-2xl border border-[#E5E7EB] bg-white px-5 py-4 text-left transition hover:border-[#F05D28] hover:bg-[#FFF7ED]"
          >
            <span className="flex items-center gap-3 text-[14px] font-black text-[#2D2D2D]">
              <span>Registro de atividades</span>
              {disciplineTodos.length > 0 && (
                <span className="inline-flex min-w-[26px] items-center justify-center rounded-full bg-[#10B981] px-2.5 py-1 text-[11px] font-black text-white shadow-sm">
                  {disciplineTodos.length}
                </span>
              )}
            </span>
            {showRegistroAccordion ? <ChevronUp size={18} className="text-[#F05D28]" /> : <ChevronDown size={18} className="text-[#757575]" />}
          </button>
        )}

        {registroFormExpanded && (
        <form className="space-y-10" onSubmit={(e) => e.preventDefault()}>
          <div className="space-y-6">
            <div className="rounded-2xl border border-[#BBF7D0] bg-[#F0FDF4] p-4">
              <button
                type="button"
                onClick={() => setShowPlannedItems((prev) => !prev)}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#10B981] px-5 text-[13px] font-black text-white shadow-sm transition hover:bg-[#059669]"
              >
                <ClipboardList size={16} />
                Itens Planejamento
                <span className="rounded-full bg-white/20 px-2 py-0.5 text-[11px]">{disciplineTodos.length}</span>
              </button>

              {showPlannedItems && (
                <div className="mt-4 space-y-3">
                  {disciplineTodos.length === 0 && (
                    <div className="rounded-xl border border-dashed border-[#86EFAC] bg-white/70 p-4 text-[13px] font-semibold text-[#047857]">
                      Nenhum item planejado foi cadastrado para sua disciplina ainda.
                    </div>
                  )}
                  {disciplineTodos.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => applyPlannedItemToForm(item)}
                      className="w-full rounded-xl border border-[#BBF7D0] bg-white p-4 text-left transition hover:border-[#10B981] hover:bg-[#ECFDF5]"
                    >
                      <div className="text-[12px] font-black uppercase tracking-[1px] text-[#047857]">{item.disciplina || currentUser.disciplina}</div>
                      <div className="mt-1 text-[14px] font-black text-[#111827]">{item.titulo}</div>
                      <div className="mt-1 text-[12px] font-semibold text-[#64748B]">{getVisualLabel(item.osNome, item.osCodigo, 'OS nao informada')}</div>
                      {item.descricao && <p className="mt-2 text-[13px] leading-relaxed text-[#475569]">{item.descricao}</p>}
                      <div className="mt-3 text-[11px] font-black uppercase tracking-[1px] text-[#10B981]">Clique para preencher</div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="w-full">
              <label className="bentham-label">1. CONTRATO</label>
              <select className="bentham-select" value={formData.contratoCodigo} disabled={Boolean(String(currentUser.contrato || '').trim())} onChange={(e) => setFormData((prev) => ({ ...prev, contratoCodigo: e.target.value, osCodigo: '', itemCodigo: '', todoId: '' }))}>
                <option value="">{String(currentUser.contrato || '').trim() ? 'Contrato fixo' : 'Selecione...'}</option>
                {contracts.map((item) => (<option key={item.codigo} value={item.codigo}>{item.codigo} - {item.nome}</option>))}
              </select>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-6">
              <div>
                <label className="bentham-label">2. OS</label>
                <select className="bentham-select" value={formData.osCodigo} onChange={(e) => setFormData((prev) => ({ ...prev, osCodigo: e.target.value, itemCodigo: '', todoId: '' }))}>
                  <option value="">Selecione...</option>
                  {filteredOs.map((item) => (<option key={item.codigo} value={item.codigo}>{item.nome}</option>))}
                </select>
              </div>
              <div><label className="bentham-label">3. SETOR</label><input value="Engenharia" className="bentham-input" readOnly /></div>
              <div>
                <label className="bentham-label">4. ATIVIDADE</label>
                <select className="bentham-select" value={formData.itemCodigo} onChange={(e) => setFormData((prev) => ({ ...prev, itemCodigo: e.target.value, todoId: '' }))}>
                  <option value="">{formData.osCodigo ? 'Selecione...' : 'Aguardando OS...'}</option>
                  {filteredItems.map((item) => (<option key={item.codigo} value={item.codigo}>{item.nome}</option>))}
                </select>
              </div>
              <div>
                <label className="bentham-label">7. DIFICULDADE</label>
                <select className="bentham-select" value={formData.dificuldade} onChange={(e) => setFormData((prev) => ({ ...prev, dificuldade: e.target.value as DifficultyLevel }))}>
                  <option value="">Selecione...</option><option value="Facil">Fácil</option><option value="Moderada">Moderada</option><option value="Dificil">Difícil</option>
                </select>
              </div>
              <div>
                <label className="bentham-label">9. % INICIAL</label>
                <div className="relative">
                  <input type="number" min={0} max={100} value={formData.avancoInicial} onChange={(e) => setFormData((prev) => ({ ...prev, avancoInicial: normalizePercentage(Number(e.target.value)) }))} className="bentham-input pr-10" />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[12px] font-bold text-bentham-gray">%</span>
                </div>
              </div>
            </div>

            <div>
              <label className="bentham-label">5. PROFISSIONAIS</label>
              <MultiProfessionalSelector value={formData.profissionaisEmails} options={filteredProfessionals} onChange={(next) => setFormData((prev) => ({ ...prev, profissionaisEmails: next }))} />
            </div>

            <div className="relative">
              <label className="bentham-label">8. DESCRIÇÃO</label>
              <textarea placeholder="Descreva a atividade com no mínimo 50 caracteres..." className="bentham-textarea min-h-[100px]" value={formData.descricao} onChange={(e) => setFormData((prev) => ({ ...prev, descricao: e.target.value }))} />
              <div className="absolute bottom-3 right-3 text-[10px] font-medium text-bentham-gray">{formData.descricao.length} caracteres</div>
            </div>

          </div>

          <div className="flex flex-col lg:flex-row gap-4 lg:items-center">
            <button type="button" onClick={queueCurrentActivity} className="w-full max-w-md h-12 bg-white border border-bentham-border text-bentham-dark rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-[#F9FAFB] active:scale-[0.98] transition-all">
              Registrar próxima atividade <Plus size={18} />
            </button>
            {draftQueue.length > 0 && <div className="text-[13px] font-semibold text-bentham-gray">{draftQueue.length} atividade(s) na fila</div>}
          </div>

          {draftQueue.length > 0 && (
            <div className="bg-white border border-bentham-border rounded-2xl p-5 space-y-4">
              <div className="flex items-center justify-between gap-4">
                <div><h3 className="text-[15px] font-bold text-bentham-dark">Fila de envio</h3><p className="text-[12px] text-bentham-gray mt-1">Estas atividades serão enviadas em lote.</p></div>
                <div className="text-[13px] font-semibold text-bentham-gray">{draftQueue.length} atividade(s) pendente(s)</div>
              </div>
              <div className="space-y-3">
                {draftQueue.map((item, index) => (
                  <div key={item.localId} className="rounded-xl border border-bentham-border bg-[#F9FAFB] px-4 py-3">
                    <div className="text-[13px] font-bold text-bentham-dark">{index + 1}. {item.osNome} - {item.itemNome}</div>
                    {item.todoTitulo && <div className="text-[12px] text-[#F05D28] font-semibold mt-1">Item a fazer: {item.todoTitulo}</div>}
                    <div className="text-[12px] text-bentham-gray mt-1">{splitPipeList(item.profissionaisNomes).join(', ')}</div>
                    <div className="text-[12px] text-bentham-gray mt-1">AvanÃ§o inicial: {item.avancoInicial}%</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </form>
        )}
        </div>
        )}

        {showAndamentoSection && (
        <div className="mt-10 space-y-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h3 className="text-[16px] font-bold text-bentham-dark">{viewMode === 'atividades' ? 'Atividades da disciplina' : 'Atividades em andamento'}</h3>
              <p className="text-[12px] text-bentham-gray mt-1">
                {viewMode === 'atividades'
                  ? 'Aqui aparecem todas as atividades registradas da sua disciplina.'
                  : 'Aqui aparecem todas as atividades em andamento da sua disciplina.'}
              </p>
            </div>
            <div className="w-full max-w-sm relative">
              <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-bentham-gray" />
              <input className="bentham-input !pl-10" placeholder="Pesquisar atividade..." value={searchText} onChange={(e) => setSearchText(e.target.value)} />
            </div>
          </div>

          <div className="space-y-5">
            {filteredActivities.length === 0 && <div className="bg-white border border-bentham-border rounded-2xl p-6 text-[13px] text-bentham-gray">{viewMode === 'atividades' ? 'Nenhuma atividade registrada encontrada para sua disciplina.' : 'Nenhuma atividade em andamento encontrada.'}</div>}
            
            {filteredActivities.map((activity) => {
              const draft = getDraftForActivity(activity);
              const expanded = Boolean(expandedActivities[activity.id]);

              return (
                <div key={activity.id} className="bg-bentham-bg border border-bentham-border rounded-xl p-5 hover:border-[#CBD5E1] transition-all">
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="text-[15px] font-bold text-[#F05D28] mb-1 truncate">
                        {activity.osNome}
                      </div>
                      <div className="text-[13px] font-bold text-bentham-dark truncate">
                        {activity.itemNome}
                      </div>
                      {formatShortPtBrDate(activity.dataRegistro) ? (
                        <div className="mt-1 text-[11px] font-medium text-bentham-gray">
                          registrado dia {formatShortPtBrDate(activity.dataRegistro)}
                        </div>
                      ) : null}
                      <div className="mt-2 flex flex-wrap gap-3 text-[12px] text-bentham-gray">
                        <span>Usuarios cadastrados: {draft.profissionaisNomes.join(', ') || '-'}</span>
                        <span>Dias sem atualização: {getDaysWithoutUpdate(activity.ultimaAtualizacao)}</span>
                      </div>
                    </div>
                    
                    {/* AQUI: O INPUT DE AVANÇO FICA VISÍVEL MESMO COM O CARD FECHADO */}
                    <div className="flex items-center gap-4 shrink-0">
                      <div className="flex flex-col items-center">
                        <label className="text-[9px] font-bold text-bentham-gray uppercase tracking-[1px] mb-1">Avanço</label>
                        <div className="relative">
                          <input 
                            type="number" 
                            min={0} 
                            max={100} 
                            value={draft.avancoAtual} 
                            onChange={(e) => updatePendingDraft(activity, { avancoAtual: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })} 
                            className="w-[68px] h-10 pr-5 pl-2 text-center text-[14px] font-bold text-bentham-dark bg-white border border-bentham-border rounded-xl focus:outline-none focus:border-[#F05D28] transition-all" 
                          />
                          <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[12px] font-bold text-bentham-gray pointer-events-none">%</span>
                        </div>
                      </div>
                      <div className="w-px h-10 bg-bentham-border mx-1"></div>
                      <button type="button" onClick={() => setExpandedActivities((prev) => ({ ...prev, [activity.id]: !prev[activity.id] }))} className="h-10 w-10 rounded-xl border border-bentham-border bg-white flex items-center justify-center text-bentham-dark hover:bg-[#F9FAFB] transition-all">
                        {expanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                      </button>
                    </div>
                  </div>

                  {expanded && (
                    <div className="mt-5 space-y-4 border-t border-[#E5E7EB] pt-5">
                      {/* O input de % de avanço foi removido do interior para evitar repetição */}
                      <div className="grid grid-cols-1 xl:grid-cols-[1fr_220px] gap-4">
                        <div>
                          <label className="bentham-label">PROFISSIONAIS</label>
                          <MultiProfessionalSelector value={draft.profissionaisEmails} options={filteredProfessionals} onChange={(next) => updatePendingDraft(activity, { profissionaisEmails: next, profissionaisNomes: filteredProfessionals.filter((item) => next.includes(item.email)).map((item) => item.nome) })} />
                        </div>
                        <div className="flex items-end">
                          <div className={`w-full inline-flex items-center justify-center gap-2 px-3 h-11 rounded-xl border text-[12px] font-bold ${activity.status === 'aguardando_conclusao' ? 'bg-[#FFF7ED] text-[#C2410C] border-[#FED7AA]' : 'bg-[#EFF6FF] text-[#1D4ED8] border-[#BFDBFE]'}`}>
                            <Clock3 size={15} /> {activity.status === 'aguardando_conclusao' ? 'Aguardando conclusão' : 'Em andamento'}
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                        <div>
                          <label className="bentham-label">AVALIAÇÃO</label>
                          <select className="bentham-select" value={draft.avaliacaoAtual} onChange={(e) => updatePendingDraft(activity, { avaliacaoAtual: e.target.value as EvaluationType })}>
                            <option value="">Selecione...</option><option value="Dentro do esperado">Dentro do esperado</option><option value="Melhor que o esperado">Melhor que o esperado</option><option value="Pior que o esperado">Pior que o esperado</option><option value="Problema/Bloqueio">Problema/Bloqueio</option>
                          </select>
                        </div>
                        <div>
                          <label className="bentham-label">DIFICULDADE</label>
                          <div className={`bentham-input !h-11 flex items-center border ${difficultyColorMap[activity.dificuldade]}`}>{activity.dificuldade}</div>
                        </div>
                      </div>

                      <div>
                        <label className="bentham-label">OBSERVAÇÃO</label>
                        <textarea className="bentham-textarea min-h-[80px]" value={draft.observacaoAtual} onChange={(e) => updatePendingDraft(activity, { observacaoAtual: e.target.value })} placeholder="Atualização obrigatória nas quartas e sextas." />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
        )}

        {showCompletedSection && (
        <div className="mt-12 space-y-5">
          <div className="flex items-center gap-3">
            <CheckCircle2 size={18} className="text-[#10B981]" />
            <h3 className="text-[16px] font-bold text-bentham-dark">Itens concluídos</h3>
          </div>
          <div className="space-y-4">
            {visibleCompletedActivities.length === 0 && completedActivities.length > 0 && <div className="bg-white border border-bentham-border rounded-2xl p-6 text-[13px] text-bentham-gray">Nenhuma atividade concluida da sua disciplina ainda.</div>}
            {completedActivities.length === 0 && <div className="bg-white border border-bentham-border rounded-2xl p-6 text-[13px] text-bentham-gray">Nenhuma atividade concluída ainda.</div>}
            {visibleCompletedActivities.map((activity) => (
              <div key={activity.id} className="bg-white border border-[#D1FAE5] rounded-2xl p-5">
                <div className="grid grid-cols-1 xl:grid-cols-[1.2fr_1fr_180px] gap-4">
                  <div>
                    <label className="bentham-label">ATIVIDADE</label>
                    <div className="bentham-input !bg-[#F0FDF4] !h-auto min-h-[44px] flex flex-col justify-center py-2 leading-tight">
                      <span className="text-[13px] font-bold text-[#047857] truncate">
                        {activity.osNome}
                      </span>
                      <span className="text-[12px] font-medium text-bentham-dark mt-1 truncate">
                        {activity.itemNome}
                      </span>
                    </div>
                  </div>
                  <div><label className="bentham-label">PROFISSIONAIS</label><div className="bentham-input !bg-[#F0FDF4] !h-auto min-h-[44px] flex items-center">{activity.profissionais.join(', ')}</div></div>
                  <div><label className="bentham-label">% FINAL</label><div className="bentham-input !bg-[#F0FDF4] h-11 flex items-center font-bold text-[#047857]">{activity.avancoAtual}%</div></div>
                </div>
              </div>
            ))}
          </div>
        </div>
        )}
      </motion.div>

      {(hasQueuedActivities || hasPendingChanges) && (
        <div className="fixed right-8 bottom-8 z-30 flex flex-col sm:flex-row gap-3">
          {hasBothPending ? (
            <button type="button" disabled={savingAll || syncingPublishedJson} onClick={() => void handleSaveAll()} className="h-14 px-6 bg-bentham-orange text-white rounded-2xl font-bold flex items-center justify-center gap-2 hover:opacity-90 active:scale-[0.98] transition-all shadow-xl shadow-bentham-orange/25 disabled:opacity-70">
              Salvar tudo <Save size={18} />
            </button>
          ) : (
            <>
              {hasQueuedActivities && (
                <button type="button" disabled={sendingBatch || syncingPublishedJson} onClick={() => void sendQueuedActivities()} className="h-14 px-6 bg-bentham-orange text-white rounded-2xl font-bold flex items-center justify-center gap-2 hover:opacity-90 active:scale-[0.98] transition-all shadow-xl shadow-bentham-orange/25 disabled:opacity-70">
                  {draftQueue.length === 1 ? 'Enviar 1 atividade' : `Enviar ${draftQueue.length} atividades`} <Send size={18} />
                </button>
              )}
              {hasPendingChanges && (
                <button type="button" disabled={savingChanges || syncingPublishedJson} onClick={() => void savePendingChanges()} className="h-14 px-6 bg-bentham-orange text-white rounded-2xl font-bold flex items-center justify-center gap-2 hover:opacity-90 active:scale-[0.98] transition-all shadow-xl shadow-bentham-orange/25 disabled:opacity-70">
                  Salvar alterações <Save size={18} />
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
