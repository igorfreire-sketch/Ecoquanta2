import React, { useEffect, useMemo, useState } from 'react';
import {
  ChevronDown,
  Plus,
  Search,
  CheckCircle2,
  Clock3,
  Save,
  Send,
  ChevronUp,
} from 'lucide-react';
import { motion } from 'motion/react';
import type { AuthUser } from './LoginScreen';
import { fetchEapPublicData, fetchRegistroPublicData } from '../lib/publicJson';

const APPS_SCRIPT_URL =
  'https://script.google.com/macros/s/AKfycbyl1TyOHEuhWV-twFybZ3wQ1k7IOb4Ob-lvjNtODiK9rxgZB4TA4iVtFbRjXorhaK5G/exec';
const PUBLIC_JSON_SYNC_DELAY_MS = 15000;

type DifficultyLevel = 'Facil' | 'Moderada' | 'Dificil';
type EvaluationType =
  | 'Dentro do esperado'
  | 'Melhor que o esperado'
  | 'Pior que o esperado'
  | 'Problema/Bloqueio';

interface EapContractOption { codigo: string; nome: string; }
interface EapOsOption { codigo: string; nome: string; contratoCodigo: string; }
interface EapItemOption { codigo: string; nome: string; osCodigo: string; }
interface ProfessionalOption { nome: string; email: string; cargo: string; disciplina: string; }

interface RegistroAtividade {
  id: string; contratoCodigo: string; contratoNome: string; osCodigo: string; osNome: string;
  setor: string; itemCodigo: string; itemNome: string; profissionais: string[]; profissionaisEmails: string[];
  dificuldade: DifficultyLevel; descricao: string; avancoAtual: number; avaliacaoAtual: string; observacaoAtual: string;
  status: 'em_andamento' | 'aguardando_conclusao' | 'concluida'; dataRegistro: string; data100?: string;
  dataConclusaoEfetiva?: string; createdByEmail: string; ultimaAtualizacao?: string;
}

interface RegistroDataResponse {
  success: boolean; error?: string; contracts: EapContractOption[]; osOptions: EapOsOption[];
  itemOptions: EapItemOption[]; professionals: ProfessionalOption[]; activeActivities: RegistroAtividade[]; completedActivities: RegistroAtividade[];
}

interface PublicRegistroEnvelope {
  source?: string;
  publishedAt?: string;
  data?: {
    registro?: {
      contracts?: EapContractOption[];
      osOptions?: EapOsOption[];
      itemOptions?: EapItemOption[];
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
    };
    cronograma?: any[];
  };
}

interface BatchResponse {
  success: boolean; error?: string; message?: string; duplicateItems?: Array<{ itemCodigo: string; itemNome: string }>;
}

interface RegistroDeAtividadeProps {
  currentUser: AuthUser;
  preloadedData?: any;
}

interface NewActivityDraft {
  localId: string; contratoCodigo: string; contratoNome: string; osCodigo: string; osNome: string;
  setor: string; itemCodigo: string; itemNome: string; profissionaisEmails: string[]; profissionaisNomes: string[];
  dificuldade: DifficultyLevel; descricao: string;
}

interface ActivityUpdateDraft {
  profissionaisEmails: string[]; profissionaisNomes: string[]; avancoAtual: number; avaliacaoAtual: string; observacaoAtual: string;
}

interface LocalDraftPayload {
  formData: { contratoCodigo: string; osCodigo: string; setor: string; itemCodigo: string; profissionaisEmails: string[]; dificuldade: DifficultyLevel | ''; descricao: string; };
  draftQueue: NewActivityDraft[]; pendingChanges: Record<string, ActivityUpdateDraft>; expandedActivities: Record<string, boolean>;
}

function buildRegistroViewModel(preloadedData: any, currentUser: AuthUser) {
  const empty = {
    contracts: [] as EapContractOption[],
    osOptions: [] as EapOsOption[],
    itemOptions: [] as EapItemOption[],
    professionals: [] as ProfessionalOption[],
    activeActivities: [] as RegistroAtividade[],
    completedActivities: [] as RegistroAtividade[],
  };

  if (!preloadedData || typeof preloadedData !== 'object') return empty;

  if (Array.isArray(preloadedData.activeActivities) || Array.isArray(preloadedData.completedActivities)) {
    return {
      contracts: preloadedData.contracts || [],
      osOptions: preloadedData.osOptions || [],
      itemOptions: preloadedData.itemOptions || [],
      professionals: preloadedData.professionals || [],
      activeActivities: preloadedData.activeActivities || [],
      completedActivities: preloadedData.completedActivities || [],
    };
  }

  const disciplinaKey = String(currentUser.disciplina || '').trim() || 'Sem disciplina';
  const allActivities = Array.isArray(preloadedData.activitiesList) ? preloadedData.activitiesList : [];
  const roleLower = String(currentUser.role || '').trim().toLowerCase();
  const currentEmail = String(currentUser.email || '').trim().toLowerCase();
  const visibleActivities = roleLower === 'lider'
    ? allActivities.filter((item) => String(item.criadoPorEmail || '').trim().toLowerCase() === currentEmail)
    : allActivities;

  const mappedActivities: RegistroAtividade[] = visibleActivities.map((item) => ({
    id: String(item.activityId || ''),
    dataRegistro: String(item.dataRegistro || ''),
    createdByEmail: String(item.criadoPorEmail || ''),
    contratoCodigo: String(item.contratoCodigo || ''),
    contratoNome: String(item.contratoNome || ''),
    osCodigo: String(item.osCodigo || ''),
    osNome: String(item.osNome || ''),
    setor: String(item.setor || ''),
    itemCodigo: String(item.itemCodigo || ''),
    itemNome: String(item.itemNome || ''),
    profissionais: String(item.profissionais || '').split(' | ').filter(Boolean),
    profissionaisEmails: String(item.profissionaisEmails || '').split(' | ').filter(Boolean),
    dificuldade: String(item.dificuldade || 'Moderada') as DifficultyLevel,
    descricao: String(item.descricao || ''),
    avancoAtual: Number(item.avancoAtual || 0),
    avaliacaoAtual: String(item.avaliacaoAtual || ''),
    observacaoAtual: String(item.observacaoAtual || ''),
    status: String(item.status || 'em_andamento') as RegistroAtividade['status'],
    data100: String(item.data100 || ''),
    dataConclusaoEfetiva: String(item.dataConclusaoEfetiva || ''),
    ultimaAtualizacao: String(item.ultimaAtualizacao || ''),
  }));

  return {
    contracts: preloadedData.contracts || [],
    osOptions: preloadedData.osOptions || [],
    itemOptions: preloadedData.itemOptions || [],
    professionals: preloadedData.professionalsByDisciplina?.[disciplinaKey] || [],
    activeActivities: mappedActivities.filter((item) => item.status !== 'concluida'),
    completedActivities: mappedActivities.filter((item) => item.status === 'concluida'),
  };
}

function applyUnifiedEapToRegistro(registro: any, eapPayload: PublicEapEnvelope | null) {
  const eapRegistro = eapPayload?.data?.registro;
  if (!eapRegistro) return registro;

  return {
    ...(registro || {}),
    contracts: Array.isArray(eapRegistro.contracts) ? eapRegistro.contracts : registro?.contracts,
    osOptions: Array.isArray(eapRegistro.osOptions) ? eapRegistro.osOptions : registro?.osOptions,
    itemOptions: Array.isArray(eapRegistro.itemOptions) ? eapRegistro.itemOptions : registro?.itemOptions,
  };
}

const difficultyColorMap: Record<DifficultyLevel, string> = {
  Facil: 'bg-blue-50 text-blue-700 border-blue-200',
  Moderada: 'bg-green-50 text-green-700 border-green-200',
  Dificil: 'bg-red-50 text-red-700 border-red-200',
};

function parsePtBrDateTime(text?: string) {
  if (!text) return null;
  const parts = String(text).trim().split(' ');
  if (parts.length < 2) return null;
  const [datePart, timePart] = parts;
  const d = datePart.split('/'); const t = timePart.split(':');
  if (d.length !== 3 || t.length < 2) return null;
  const result = new Date(Number(d[2]), Number(d[1]) - 1, Number(d[0]), Number(t[0]), Number(t[1]), t[2] ? Number(t[2]) : 0);
  return Number.isNaN(result.getTime()) ? null : result;
}

function getDaysWithoutUpdate(value?: string) {
  const dt = parsePtBrDateTime(value);
  if (!dt) return '-';
  const diffDays = Math.floor((new Date().getTime() - dt.getTime()) / (1000 * 60 * 60 * 24));
  return String(Math.max(0, diffDays));
}

function createLocalId() {
  try { if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID(); } catch (e) {}
  return String(Date.now()) + Math.random().toString(16).slice(2);
}

function getDraftStorageKey(email: string) { return `quanta_registro_atividade_${String(email || '').trim().toLowerCase()}`; }

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function fetchRegistroDataFromAppsScript(currentUser: AuthUser): Promise<RegistroDataResponse> {
  const params = new URLSearchParams({
    action: 'getRegistroAtividadesData',
    userEmail: currentUser.email || '',
    userRole: currentUser.role || '',
    userDisciplina: currentUser.disciplina || '',
  });

  const response = await fetch(`${APPS_SCRIPT_URL}?${params.toString()}`, { cache: 'no-store' });
  const payload = await response.json() as RegistroDataResponse;

  if (!payload?.success) {
    throw new Error(payload?.error || 'Falha ao carregar Registro de Atividades pelo Apps Script.');
  }

  return payload;
}

function MultiProfessionalSelector({ value, options, onChange }: { value: string[]; options: ProfessionalOption[]; onChange: (next: string[]) => void; }) {
  const [open, setOpen] = useState(false);
  const toggleItem = (email: string) => onChange(value.includes(email) ? value.filter((item) => item !== email) : [...value, email]);
  const selectedNames = options.filter((o) => value.includes(o.email)).map((o) => o.nome);

  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen((prev) => !prev)} className="bentham-input flex items-center justify-between text-left">
        <span className={selectedNames.length ? 'text-bentham-dark' : 'text-bentham-gray'}>{selectedNames.length ? selectedNames.join(', ') : 'Selecione os profissionais'}</span>
        <ChevronDown size={18} className="text-bentham-gray" />
      </button>
      {open && (
        <div className="absolute z-20 mt-2 w-full bg-white border border-bentham-border rounded-xl shadow-lg max-h-64 overflow-y-auto">
          <div className="p-2 space-y-1">
            {options.map((option) => (
              <label key={option.email} className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg hover:bg-[#F9FAFB] cursor-pointer">
                <div className="min-w-0"><p className="text-[13px] font-semibold text-bentham-dark truncate">{option.nome}</p><p className="text-[11px] text-bentham-gray truncate">{option.email}</p></div>
                <input type="checkbox" checked={value.includes(option.email)} onChange={() => toggleItem(option.email)} className="w-4 h-4 accent-[#F05D28]" />
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function RegistroDeAtividade({ currentUser, preloadedData }: RegistroDeAtividadeProps) {
  const initialRegistroData = buildRegistroViewModel(preloadedData, currentUser);
  const [contracts, setContracts] = useState<EapContractOption[]>(initialRegistroData.contracts);
  const [osOptions, setOsOptions] = useState<EapOsOption[]>(initialRegistroData.osOptions);
  const [itemOptions, setItemOptions] = useState<EapItemOption[]>(initialRegistroData.itemOptions);
  const [professionals, setProfessionals] = useState<ProfessionalOption[]>(initialRegistroData.professionals);
  const [activeActivities, setActiveActivities] = useState<RegistroAtividade[]>(initialRegistroData.activeActivities);
  const [completedActivities, setCompletedActivities] = useState<RegistroAtividade[]>(initialRegistroData.completedActivities);

  const [sendingBatch, setSendingBatch] = useState(false);
  const [savingChanges, setSavingChanges] = useState(false);
  const [savingAll, setSavingAll] = useState(false);
  const [syncingPublishedJson, setSyncingPublishedJson] = useState(false);
  const [balloonMessage, setBalloonMessage] = useState('');
  const [searchText, setSearchText] = useState('');

  const [draftQueue, setDraftQueue] = useState<NewActivityDraft[]>([]);
  const [pendingChanges, setPendingChanges] = useState<Record<string, ActivityUpdateDraft>>({});
  const [expandedActivities, setExpandedActivities] = useState<Record<string, boolean>>({});

  const [showRestorePrompt, setShowRestorePrompt] = useState(false);
  const [restorableDraft, setRestorableDraft] = useState<LocalDraftPayload | null>(null);
  const [hasInitializedDraftRecovery, setHasInitializedDraftRecovery] = useState(false);

  const [formData, setFormData] = useState({
    contratoCodigo: '', osCodigo: '', setor: 'Engenharia', itemCodigo: '', profissionaisEmails: [] as string[], dificuldade: '' as DifficultyLevel | '', descricao: '',
  });

  useEffect(() => {
    if (preloadedData && Object.keys(preloadedData).length > 0) {
      const nextData = buildRegistroViewModel(preloadedData, currentUser);
      setContracts(nextData.contracts);
      setOsOptions(nextData.osOptions);
      setItemOptions(nextData.itemOptions);
      setProfessionals(nextData.professionals);
      setActiveActivities(nextData.activeActivities);
      setCompletedActivities(nextData.completedActivities);
    }
  }, [preloadedData, currentUser]);

  const filteredProfessionals = useMemo(() => {
    const myDiscipline = String(currentUser.disciplina || '').trim().toLowerCase();
    if (!myDiscipline) return professionals;
    return professionals.filter(p => String(p.disciplina || '').trim().toLowerCase() === myDiscipline);
  }, [professionals, currentUser.disciplina]);

  const selectedContract = useMemo(() => contracts.find((c) => c.codigo === formData.contratoCodigo), [contracts, formData.contratoCodigo]);
  const filteredOs = useMemo(() => osOptions.filter((item) => item.contratoCodigo === formData.contratoCodigo), [osOptions, formData.contratoCodigo]);
  const selectedOs = useMemo(() => filteredOs.find((item) => item.codigo === formData.osCodigo), [filteredOs, formData.osCodigo]);
  const filteredItems = useMemo(() => itemOptions.filter((item) => item.osCodigo === formData.osCodigo), [itemOptions, formData.osCodigo]);

  const filteredActivities = useMemo(() => {
    const term = searchText.trim().toLowerCase();
    if (!term) return activeActivities;
    return activeActivities.filter((item) => (
      item.itemCodigo.toLowerCase().includes(term) || item.itemNome.toLowerCase().includes(term) || item.osNome.toLowerCase().includes(term) || item.profissionais.join(', ').toLowerCase().includes(term)
    ));
  }, [activeActivities, searchText]);

  const hasPendingChanges = Object.keys(pendingChanges).length > 0;
  const hasQueuedActivities = draftQueue.length > 0;
  const hasBothPending = hasQueuedActivities && hasPendingChanges;

  const fetchFreshData = async () => {
    try {
      const [payload, eapPayload] = await Promise.all([
        fetchRegistroPublicData<PublicRegistroEnvelope>(),
        fetchEapPublicData<PublicEapEnvelope>().catch(() => null),
      ]);
      const registro = applyUnifiedEapToRegistro(payload.data?.registro, eapPayload);
      if (!registro) throw new Error('Dados de registro ausentes no JSON publico.');
      if (!Array.isArray(registro.contracts) || !Array.isArray(registro.osOptions) || !Array.isArray(registro.itemOptions)) {
        throw new Error('Estrutura da EAP ausente no JSON publico.');
      }
      if (registro.contracts.length === 0 || registro.osOptions.length === 0 || registro.itemOptions.length === 0) {
        throw new Error('EAP sem contratos, OS ou atividades no JSON publico.');
      }

      const disciplinaKey = String(currentUser.disciplina || '').trim() || 'Sem disciplina';
      const allActivities = Array.isArray(registro.activitiesList) ? registro.activitiesList : [];
      const roleLower = String(currentUser.role || '').trim().toLowerCase();
      const currentEmail = String(currentUser.email || '').trim().toLowerCase();
      const visibleActivities = roleLower === 'lider'
        ? allActivities.filter((item) => String(item.criadoPorEmail || '').trim().toLowerCase() === currentEmail)
        : allActivities;

      const mappedActivities: RegistroAtividade[] = visibleActivities.map((item) => ({
        id: String(item.activityId || ''),
        dataRegistro: String(item.dataRegistro || ''),
        createdByEmail: String(item.criadoPorEmail || ''),
        contratoCodigo: String(item.contratoCodigo || ''),
        contratoNome: String(item.contratoNome || ''),
        osCodigo: String(item.osCodigo || ''),
        osNome: String(item.osNome || ''),
        setor: String(item.setor || ''),
        itemCodigo: String(item.itemCodigo || ''),
        itemNome: String(item.itemNome || ''),
        profissionais: String(item.profissionais || '').split(' | ').filter(Boolean),
        profissionaisEmails: String(item.profissionaisEmails || '').split(' | ').filter(Boolean),
        dificuldade: String(item.dificuldade || 'Moderada') as DifficultyLevel,
        descricao: String(item.descricao || ''),
        avancoAtual: Number(item.avancoAtual || 0),
        avaliacaoAtual: String(item.avaliacaoAtual || ''),
        observacaoAtual: String(item.observacaoAtual || ''),
        status: String(item.status || 'em_andamento') as RegistroAtividade['status'],
        data100: String(item.data100 || ''),
        dataConclusaoEfetiva: String(item.dataConclusaoEfetiva || ''),
        ultimaAtualizacao: String(item.ultimaAtualizacao || ''),
      }));

      setContracts(registro.contracts || []);
      setOsOptions(registro.osOptions || []);
      setItemOptions(registro.itemOptions || []);
      setProfessionals(registro.professionalsByDisciplina?.[disciplinaKey] || []);
      setActiveActivities(mappedActivities.filter((item) => item.status !== 'concluida'));
      setCompletedActivities(mappedActivities.filter((item) => item.status === 'concluida'));
    } catch {
      try {
        const fallback = await fetchRegistroDataFromAppsScript(currentUser);
        setContracts(fallback.contracts || []);
        setOsOptions(fallback.osOptions || []);
        setItemOptions(fallback.itemOptions || []);
        setProfessionals(fallback.professionals || []);
        setActiveActivities(fallback.activeActivities || []);
        setCompletedActivities(fallback.completedActivities || []);
      } catch {}
    }
  };

  useEffect(() => {
    if (!preloadedData || Object.keys(preloadedData).length === 0) return;
    if (contracts.length > 0 && osOptions.length > 0 && itemOptions.length > 0) return;
    void fetchFreshData();
  }, [preloadedData, currentUser.email, currentUser.role, currentUser.disciplina]);

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
        if (Boolean(parsed?.formData?.descricao) || Boolean(parsed?.formData?.itemCodigo) || (parsed?.draftQueue?.length || 0) > 0 || Object.keys(parsed?.pendingChanges || {}).length > 0) {
          setRestorableDraft(parsed); setShowRestorePrompt(true);
        }
      }
    } catch (error) {} finally { setHasInitializedDraftRecovery(true); }
  }, [currentUser.email, hasInitializedDraftRecovery]);

  useEffect(() => {
    if (!hasInitializedDraftRecovery) return;
    const key = getDraftStorageKey(currentUser.email);
    if (!formData.descricao && !formData.itemCodigo && draftQueue.length === 0 && Object.keys(pendingChanges).length === 0) {
      localStorage.removeItem(key); return;
    }
    try { localStorage.setItem(key, JSON.stringify({ formData, draftQueue, pendingChanges, expandedActivities })); } catch (error) {}
  }, [currentUser.email, formData, draftQueue, pendingChanges, expandedActivities, hasInitializedDraftRecovery]);

  const clearLocalDraft = () => { try { localStorage.removeItem(getDraftStorageKey(currentUser.email)); } catch (error) {} };
  const restoreLocalDraft = () => {
    if (!restorableDraft) return;
    setFormData(restorableDraft.formData || { contratoCodigo: '', osCodigo: '', setor: 'Engenharia', itemCodigo: '', profissionaisEmails: [], dificuldade: '', descricao: '' });
    setDraftQueue(restorableDraft.draftQueue || []); setPendingChanges(restorableDraft.pendingChanges || {}); setExpandedActivities(restorableDraft.expandedActivities || {});
    setShowRestorePrompt(false); setRestorableDraft(null); setBalloonMessage('Últimas alterações restauradas com sucesso.');
  };
  const discardLocalDraft = () => { clearLocalDraft(); setShowRestorePrompt(false); setRestorableDraft(null); };

  const getDraftForActivity = (activity: RegistroAtividade): ActivityUpdateDraft => (pendingChanges[activity.id] || { profissionaisEmails: activity.profissionaisEmails, profissionaisNomes: activity.profissionais, avancoAtual: activity.avancoAtual, avaliacaoAtual: activity.avaliacaoAtual, observacaoAtual: activity.observacaoAtual });

  const queueCurrentActivity = () => {
    if (!formData.contratoCodigo || !formData.osCodigo || !formData.itemCodigo) return setBalloonMessage('Preencha contrato, OS e atividade.');
    if (!formData.dificuldade) return setBalloonMessage('Selecione a dificuldade da atividade.');
    if (formData.descricao.trim().length < 50) return setBalloonMessage('A descrição precisa ter no mínimo 50 caracteres.');
    if (formData.profissionaisEmails.length === 0) return setBalloonMessage('Selecione pelo menos um profissional.');

    const itemSelected = filteredItems.find((item) => item.codigo === formData.itemCodigo);
    if (!itemSelected) return setBalloonMessage('Atividade inválida.');
    if (draftQueue.some((item) => item.itemCodigo === formData.itemCodigo) || activeActivities.some((item) => item.itemCodigo === formData.itemCodigo)) return setBalloonMessage('Atividade já registrada ou já está na fila.');

    const selectedProfessionalNames = filteredProfessionals.filter((item) => formData.profissionaisEmails.includes(item.email)).map((item) => item.nome);

    setDraftQueue((prev) => [...prev, { localId: createLocalId(), contratoCodigo: formData.contratoCodigo, contratoNome: selectedContract?.nome || '', osCodigo: formData.osCodigo, osNome: selectedOs?.nome || '', setor: formData.setor, itemCodigo: formData.itemCodigo, itemNome: itemSelected.nome, profissionaisEmails: formData.profissionaisEmails, profissionaisNomes: selectedProfessionalNames, dificuldade: formData.dificuldade, descricao: formData.descricao.trim() }]);
    setFormData({ contratoCodigo: '', osCodigo: '', setor: 'Engenharia', itemCodigo: '', profissionaisEmails: [], dificuldade: '', descricao: '' });
    setBalloonMessage('Atividade adicionada à fila. Você pode registrar a próxima.');
  };

  const sendQueuedActivities = async (): Promise<boolean> => {
    if (draftQueue.length === 0) return false;
    setSendingBatch(true);
    try {
      const response = await fetch(APPS_SCRIPT_URL, { method: 'POST', body: JSON.stringify({ action: 'registerActivitiesBatch', userEmail: currentUser.email, userName: currentUser.nome, userRole: currentUser.role, userDisciplina: currentUser.disciplina, activities: draftQueue }) });
      const data: BatchResponse = await response.json();
      if (!data.success) throw new Error(data.error || 'Erro ao enviar lote de atividades.');
      setDraftQueue([]); setBalloonMessage(data.message || 'Atividades enviadas com sucesso.');
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
      const response = await fetch(APPS_SCRIPT_URL, { method: 'POST', body: JSON.stringify({ action: 'updateActivitiesBatch', userEmail: currentUser.email, userName: currentUser.nome, updates }) });
      const data: BatchResponse = await response.json();
      if (!data.success) throw new Error(data.error || 'Erro ao salvar alterações.');
      setPendingChanges({});
      setBalloonMessage(updates.some((item) => Number(item.avancoAtual) === 100) ? 'Em 3 dias as atividades com 100% serão tidas como entregues e irão para concluídos.' : data.message || 'Alterações salvas com sucesso.');
      return true;
    } catch (error) { setBalloonMessage(error instanceof Error ? error.message : 'Erro ao salvar alterações.'); return false; } finally { setSavingChanges(false); }
  };

  const handleSaveAll = async () => {
    if (!hasBothPending) return;
    setSavingAll(true);
    try {
      if (await sendQueuedActivities() && await savePendingChanges()) { await refreshFromPublishedJsonAfterSheetUpdate(); clearLocalDraft(); }
    } finally { setSavingAll(false); }
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

        <form className="space-y-10" onSubmit={(e) => e.preventDefault()}>
          <div className="space-y-6">
            <div className="w-full">
              <label className="bentham-label">1. CONTRATO</label>
              <select className="bentham-select" value={formData.contratoCodigo} onChange={(e) => setFormData((prev) => ({ ...prev, contratoCodigo: e.target.value, osCodigo: '', itemCodigo: '' }))}>
                <option value="">Selecione...</option>
                {contracts.map((item) => (<option key={item.codigo} value={item.codigo}>{item.codigo} - {item.nome}</option>))}
              </select>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
              <div>
                <label className="bentham-label">2. OS</label>
                <select className="bentham-select" value={formData.osCodigo} onChange={(e) => setFormData((prev) => ({ ...prev, osCodigo: e.target.value, itemCodigo: '' }))}>
                  <option value="">Selecione...</option>
                  {filteredOs.map((item) => (<option key={item.codigo} value={item.codigo}>{item.codigo} - {item.nome}</option>))}
                </select>
              </div>
              <div><label className="bentham-label">3. SETOR</label><input value="Engenharia" className="bentham-input" readOnly /></div>
              <div>
                <label className="bentham-label">4. ATIVIDADE</label>
                <select className="bentham-select" value={formData.itemCodigo} onChange={(e) => setFormData((prev) => ({ ...prev, itemCodigo: e.target.value }))}>
                  <option value="">{formData.osCodigo ? 'Selecione...' : 'Aguardando OS...'}</option>
                  {filteredItems.map((item) => (<option key={item.codigo} value={item.codigo}>{item.codigo} - {item.nome}</option>))}
                </select>
              </div>
              <div>
                <label className="bentham-label">6. DIFICULDADE</label>
                <select className="bentham-select" value={formData.dificuldade} onChange={(e) => setFormData((prev) => ({ ...prev, dificuldade: e.target.value as DifficultyLevel }))}>
                  <option value="">Selecione...</option><option value="Facil">Fácil</option><option value="Moderada">Moderada</option><option value="Dificil">Difícil</option>
                </select>
              </div>
            </div>

            <div>
              <label className="bentham-label">5. PROFISSIONAIS</label>
              <MultiProfessionalSelector value={formData.profissionaisEmails} options={filteredProfessionals} onChange={(next) => setFormData((prev) => ({ ...prev, profissionaisEmails: next }))} />
            </div>

            <div className="relative">
              <label className="bentham-label">7. DESCRIÇÃO</label>
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
                    <div className="text-[13px] font-bold text-bentham-dark">{index + 1}. {item.itemCodigo} - {item.itemNome}</div>
                    <div className="text-[12px] text-bentham-gray mt-1">{item.profissionaisNomes.join(', ')}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </form>

        <div className="mt-10 space-y-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h3 className="text-[16px] font-bold text-bentham-dark">Atividades em andamento</h3>
              <p className="text-[12px] text-bentham-gray mt-1">Líder vê somente as atividades cadastradas por ele.</p>
            </div>
            <div className="w-full max-w-sm relative">
              <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-bentham-gray" />
              <input className="bentham-input !pl-10" placeholder="Pesquisar atividade..." value={searchText} onChange={(e) => setSearchText(e.target.value)} />
            </div>
          </div>

          <div className="space-y-5">
            {filteredActivities.length === 0 && <div className="bg-white border border-bentham-border rounded-2xl p-6 text-[13px] text-bentham-gray">Nenhuma atividade em andamento encontrada.</div>}
            
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
                        {activity.itemCodigo} - {activity.itemNome}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-3 text-[12px] text-bentham-gray">
                        <span>Profissionais: {draft.profissionaisNomes.join(', ') || '-'}</span>
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

        <div className="mt-12 space-y-5">
          <div className="flex items-center gap-3">
            <CheckCircle2 size={18} className="text-[#10B981]" />
            <h3 className="text-[16px] font-bold text-bentham-dark">Itens concluídos</h3>
          </div>
          <div className="space-y-4">
            {completedActivities.length === 0 && <div className="bg-white border border-bentham-border rounded-2xl p-6 text-[13px] text-bentham-gray">Nenhuma atividade concluída ainda.</div>}
            {completedActivities.map((activity) => (
              <div key={activity.id} className="bg-white border border-[#D1FAE5] rounded-2xl p-5">
                <div className="grid grid-cols-1 xl:grid-cols-[1.2fr_1fr_180px] gap-4">
                  <div>
                    <label className="bentham-label">ATIVIDADE</label>
                    <div className="bentham-input !bg-[#F0FDF4] !h-auto min-h-[44px] flex flex-col justify-center py-2 leading-tight">
                      <span className="text-[13px] font-bold text-[#047857] truncate">
                        {activity.osNome}
                      </span>
                      <span className="text-[12px] font-medium text-bentham-dark mt-1 truncate">
                        {activity.itemCodigo} - {activity.itemNome}
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
                <button type="button" disabled={sendingBatch || syncingPublishedJson} onClick={async () => { if (await sendQueuedActivities()) { await refreshFromPublishedJsonAfterSheetUpdate(); clearLocalDraft(); } }} className="h-14 px-6 bg-bentham-orange text-white rounded-2xl font-bold flex items-center justify-center gap-2 hover:opacity-90 active:scale-[0.98] transition-all shadow-xl shadow-bentham-orange/25 disabled:opacity-70">
                  {draftQueue.length === 1 ? 'Enviar 1 atividade' : `Enviar ${draftQueue.length} atividades`} <Send size={18} />
                </button>
              )}
              {hasPendingChanges && (
                <button type="button" disabled={savingChanges || syncingPublishedJson} onClick={async () => { if (await savePendingChanges()) { await refreshFromPublishedJsonAfterSheetUpdate(); clearLocalDraft(); } }} className="h-14 px-6 bg-bentham-orange text-white rounded-2xl font-bold flex items-center justify-center gap-2 hover:opacity-90 active:scale-[0.98] transition-all shadow-xl shadow-bentham-orange/25 disabled:opacity-70">
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
