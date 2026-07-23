import React, { useDeferredValue, useMemo, useState } from 'react';
import SearchableSelect from '../SearchableSelect';
import {
  AlertTriangle,
  Building2,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  FileWarning,
  GitBranch,
  PencilLine,
  Plus,
  Route,
  Save,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import Atividades from '../Atividades';
import type { AuthUser } from '../LoginScreen';
import Cronograma from '../Cronograma';
import { deleteFirebaseDocument, isFirebaseConfigured, setFirebaseDocument } from '../../lib/firebaseDb';

interface ContratoProps {
  currentUser: AuthUser;
  preloadedData?: {
    registro?: any;
    cronograma?: any;
    admin?: any;
    contractPriorities?: ContractPriorityRecord[];
    contractInterferences?: Interferencia[];
    osSettings?: any[];
  };
  activeContractCode?: string;
  lockedContractCode?: string;
  activeView?: 'os' | 'interferencias' | 'prioridades' | 'cronograma' | 'atividades';
}

interface ActivityRow {
  id: string;
  contratoCodigo: string;
  contratoNome: string;
  criadoPorNome: string;
  criadoPorDisciplina: string;
  profissionais: string[];
  osCodigo: string;
  osNome: string;
  itemCodigo: string;
  itemNome: string;
  descricao: string;
  avancoAtual: number;
  dataFim: string;
  status: string;
}

interface Interferencia {
  id: string;
  nome: string;
  data: string;
  observacao: string;
  osImpactada: string;
  contratoCodigo?: string;
  contratoNome?: string;
  updatedAt?: string;
}

interface ContractPriorityRecord {
  id: string;
  activityId: string;
  monthlyCycle?: string;
  licitatoria?: boolean;
  updatedAt?: string;
}

interface StoredPrioritiesState {
  values: Record<string, string>;
  confirmed: Record<string, boolean>;
  monthly: Record<string, string>;
  licitatoria: Record<string, boolean>;
}

interface OsSettingRecord {
  id: string;
  osCodigo: string;
  tipoLicitacao: string;
  tipoProjeto: string;
  responsavel: string;
  prioridadeMensal?: string;
  prioridadeLicitatoria?: boolean;
  updatedAt?: string;
}

const TIPO_LICITACAO_OPTIONS = ['', 'Integrada', 'Semi-integrada'];
const TIPO_PROJETO_OPTIONS = ['Básico', 'Executivo', 'Anteprojeto', 'Conceitual', 'Detalhado', 'Legal'];

function extractProjectType(osNome?: string): string {
  const name = String(osNome || '').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (/\bBASICO\b/.test(name)) return 'Básico';
  if (/\bEXECUTIVO\b/.test(name)) return 'Executivo';
  if (/\bCONCEITUAL\b/.test(name)) return 'Conceitual';
  if (/\bLEGAL\b/.test(name)) return 'Legal';
  if (/\bDETALHADO\b/.test(name)) return 'Detalhado';
  if (/\bANTEPROJETO\b/.test(name)) return 'Anteprojeto';
  return '';
}

function buildOsSettingsMap(records: any[]): Record<string, OsSettingRecord> {
  const map: Record<string, OsSettingRecord> = {};
  (records || []).forEach((item: any) => {
    const code = String(item?.osCodigo || item?.id || '').trim();
    if (code) map[code] = item as OsSettingRecord;
  });
  return map;
}

const FLOW_STEPS = [
  { key: 'arquitetura', label: 'Arquitetura', icon: Building2, color: '#F05D28' },
  { key: 'engenharia', label: 'Engenharia', icon: GitBranch, color: '#1E40AF' },
  { key: 'compatibilidade', label: 'Compatibilidade', icon: Route, color: '#10B981' },
  { key: 'nao-conformidade', label: 'Nao conformidade', icon: FileWarning, color: '#EF4444' },
  { key: 'entrega', label: 'Entrega', icon: ClipboardList, color: '#0EA5E9' },
];

function normalizeText(value?: string) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
}

function isAllContract(value?: string) {
  const normalized = normalizeText(value);
  return !normalized || normalized === 'todos' || normalized === 'todos os contratos';
}

function matchesContract(activity: Pick<ActivityRow, 'contratoCodigo' | 'contratoNome'>, selectedContract?: string) {
  if (isAllContract(selectedContract)) return true;
  const target = normalizeText(selectedContract);
  return [activity.contratoCodigo, activity.contratoNome].some((value) => normalizeText(String(value || '')) === target);
}

function isDateLikeLabel(value?: string) {
  const text = String(value || '').trim();
  return Boolean(
    text.match(/^\d{4}-\d{2}-\d{2}T.*Z$/i)
    || text.match(/^\d{4}-\d{2}-\d{2}T/i)
    || text.match(/^\d{1,2}\/\d{1,2}\/\d{2,4}/)
    || text.match(/GMT|Hor.rio|Bras.lia/i)
  );
}

function cleanDisplayLabel(primary?: string, fallback?: string, emptyLabel = 'Sem informacao') {
  const first = String(primary || '').trim();
  const second = String(fallback || '').trim();
  if (first && !isDateLikeLabel(first)) return first;
  if (second && !isDateLikeLabel(second)) return second;
  return emptyLabel;
}

function sameDisplayText(a?: string, b?: string) {
  return normalizeText(a) === normalizeText(b);
}

function isHierarchyCode(value?: string) {
  return /^\d+(?:\.\d+)+$/.test(String(value || '').trim());
}

function isOsLabel(value?: string) {
  const text = String(value || '').trim();
  return /^OS(?=$|[\s_\-.0-9A-Za-zÀ-ÿ])/i.test(text);
}

function getMonthlyPriorityCycleKey(referenceDate = new Date()) {
  const baseDate = new Date(referenceDate);
  if (baseDate.getDate() < 5) {
    baseDate.setMonth(baseDate.getMonth() - 1);
  }
  const year = baseDate.getFullYear();
  const month = String(baseDate.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

function formatMonthlyCycleLabel(cycleKey: string) {
  const match = cycleKey.match(/^(\d{4})-(\d{2})$/);
  if (!match) return cycleKey;
  return `${match[2]}/${match[1]}`;
}

function isMonthlyPriorityActive(value: string | undefined, cycleKey: string) {
  return String(value || '').trim() === cycleKey;
}

function buildLegacyPriorityState(
  monthly: Record<string, string>,
  licitatoria: Record<string, boolean>,
  cycleKey: string
) {
  const values: Record<string, string> = {};
  const confirmed: Record<string, boolean> = {};
  const allIds = new Set([...Object.keys(monthly || {}), ...Object.keys(licitatoria || {})]);

  allIds.forEach((id) => {
    const monthlyActive = isMonthlyPriorityActive(monthly[id], cycleKey);
    const licitatoriaActive = Boolean(licitatoria[id]);
    if (licitatoriaActive) values[id] = '3';
    else if (monthlyActive) values[id] = '2';
    confirmed[id] = monthlyActive || licitatoriaActive;
  });

  return { values, confirmed };
}

function readStoredPriorities(records: ContractPriorityRecord[], cycleKey: string): StoredPrioritiesState {
  const monthly: Record<string, string> = {};
  const licitatoria: Record<string, boolean> = {};

  records.forEach((record) => {
    const id = String(record?.activityId || record?.id || '').trim();
    if (!id) return;
    if (record.monthlyCycle) monthly[id] = String(record.monthlyCycle);
    if (record.licitatoria) licitatoria[id] = true;
  });

  const legacy = buildLegacyPriorityState(monthly, licitatoria, cycleKey);
  return {
    values: legacy.values,
    confirmed: legacy.confirmed,
    monthly,
    licitatoria,
  };
}

function readStoredInterferencias(items?: Interferencia[]) {
  return Array.isArray(items) ? items : [];
}

function formatDateBR(value?: string) {
  const raw = String(value || '').trim();
  if (!raw) return 'Sem prazo';

  const parsed = new Date(raw);
  if (raw.includes('T') && !Number.isNaN(parsed.getTime())) return parsed.toLocaleDateString('pt-BR');

  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;

  return raw;
}

function getCronogramaMap(cronograma: any) {
  const rows = Array.isArray(cronograma) ? cronograma : [];
  return rows.reduce((acc: Record<string, any>, row: any) => {
    const code = String(row?.code || '').trim();
    if (code) acc[code] = row;
    return acc;
  }, {});
}

function buildProfessionalsList(activity: any) {
  if (Array.isArray(activity?.profissionais)) {
    return activity.profissionais.map((item: any) => String(item || '').trim()).filter(Boolean);
  }
  return String(activity?.profissionais || '')
    .split('|')
    .map((item) => item.trim())
    .filter(Boolean);
}

function buildActivities(preloadedData?: ContratoProps['preloadedData']): ActivityRow[] {
  const activitiesList = Array.isArray(preloadedData?.registro?.activitiesList) ? preloadedData.registro.activitiesList : [];
  const activeActivities = Array.isArray(preloadedData?.registro?.activeActivities) ? preloadedData.registro.activeActivities : [];
  const completedActivities = Array.isArray(preloadedData?.registro?.completedActivities) ? preloadedData.registro.completedActivities : [];
  const sourceActivities = activitiesList.length > 0 ? activitiesList : [...activeActivities, ...completedActivities];
  const cronogramaByCode = getCronogramaMap(preloadedData?.cronograma);
  const seenIds = new Set<string>();

  return sourceActivities
    .filter((activity: any) => normalizeText(activity?.status) !== 'concluida')
    .map((activity: any, index: number) => {
      const itemCodigo = String(activity?.itemCodigo || '').trim();
      const cronograma = cronogramaByCode[itemCodigo] || {};
      const activityId = String(activity?.activityId || activity?.id || `${itemCodigo}-${index}`);

      return {
        id: activityId,
        contratoCodigo: String(activity?.contratoCodigo || '').trim(),
        contratoNome: String(activity?.contratoNome || activity?.contratoCodigo || '').trim(),
        criadoPorNome: String(activity?.criadoPorNome || activity?.registradoPorNome || activity?.userName || '').trim(),
        criadoPorDisciplina: String(activity?.criadoPorDisciplina || activity?.disciplina || activity?.userDisciplina || '').trim(),
        profissionais: buildProfessionalsList(activity),
        osCodigo: cleanDisplayLabel(activity?.osCodigo, activity?.osNome, 'Sem OS'),
        osNome: cleanDisplayLabel(activity?.osNome, activity?.osCodigo, ''),
        itemCodigo: cleanDisplayLabel(itemCodigo, activity?.itemNome, ''),
        itemNome: cleanDisplayLabel(activity?.itemNome, activity?.descricao, 'Atividade sem nome'),
        descricao: String(activity?.descricao || '').trim(),
        avancoAtual: Math.max(0, Math.min(100, Number(activity?.avancoAtual || 0))),
        dataFim: formatDateBR(cronograma?.plannedEnd || activity?.data100 || activity?.dataConclusaoEfetiva),
        status: String(activity?.status || '').trim(),
      };
    })
    .filter((activity) => {
      if (!activity.id || seenIds.has(activity.id)) return false;
      seenIds.add(activity.id);
      return true;
    });
}

function getContracts(preloadedData?: ContratoProps['preloadedData'], activities: ActivityRow[] = []) {
  const fromRegistro = Array.isArray(preloadedData?.registro?.contracts)
    ? preloadedData.registro.contracts.map((item: any) => ({
        id: String(item?.codigo || '').trim(),
        nome: String(item?.nome || item?.codigo || '').trim(),
      }))
    : [];

  const fromActivities = activities.map((item) => ({
    id: item.contratoCodigo,
    nome: item.contratoNome || item.contratoCodigo,
  }));

  const map = new Map<string, { id: string; nome: string }>();
  [...fromRegistro, ...fromActivities].forEach((item) => {
    if (item.id && !map.has(item.id)) map.set(item.id, item);
  });

  return Array.from(map.values());
}

function getOsOptions(preloadedData?: ContratoProps['preloadedData'], activities: ActivityRow[] = [], selectedContract?: string) {
  const targetContract = isAllContract(selectedContract) ? '' : normalizeText(selectedContract);
  const osFromRegistro = Array.isArray(preloadedData?.registro?.osOptions)
    ? preloadedData.registro.osOptions
        .filter((os: any) => !targetContract || [os?.contratoCodigo, os?.contratoNome, os?.contrato].some((value: any) => normalizeText(String(value || '')) === targetContract))
        .map((os: any) => ({
          codigo: String(os?.codigo || '').trim(),
          nome: cleanDisplayLabel(os?.nome, os?.codigo, ''),
        }))
    : [];

  const osFromActivities = activities
    .filter((activity) => matchesContract(activity, selectedContract))
    .map((activity) => ({
      codigo: String(activity.osCodigo || '').trim(),
      nome: cleanDisplayLabel(activity.osNome, activity.osCodigo, ''),
    }));

  const map = new Map<string, { codigo: string; nome: string }>();
  [...osFromRegistro, ...osFromActivities].forEach((os) => {
    const key = os.codigo || os.nome;
    if (key && !map.has(key)) map.set(key, os);
  });

  return Array.from(map.values());
}

function getContractInitialValue(activeContractCode?: string, lockedContractCode?: string) {
  const locked = String(lockedContractCode || '').trim();
  if (locked) return locked;
  const active = String(activeContractCode || '').trim();
  return isAllContract(active) ? 'Todos' : active || 'Todos';
}

function getOsDisplayName(activity: ActivityRow) {
  if (activity.osNome && !isHierarchyCode(activity.osNome)) return activity.osNome;
  if (activity.osCodigo && !isHierarchyCode(activity.osCodigo)) return activity.osCodigo;
  return activity.osNome || 'Sem OS';
}

function getActivityDisplayName(activity: ActivityRow) {
  if (activity.itemNome && !sameDisplayText(activity.itemNome, activity.osCodigo) && !sameDisplayText(activity.itemNome, activity.osNome)) return activity.itemNome;
  if (activity.descricao && !sameDisplayText(activity.descricao, activity.osCodigo) && !sameDisplayText(activity.descricao, activity.osNome)) return activity.descricao;
  return 'Atividade sem nome';
}

function getPeopleLabel(activity: ActivityRow) {
  if (activity.profissionais.length > 0) return activity.profissionais.join(', ');
  if (activity.criadoPorNome || activity.criadoPorDisciplina) {
    return [activity.criadoPorNome, activity.criadoPorDisciplina].filter(Boolean).join(' - ');
  }
  return 'Sem profissional vinculado';
}

function ActivityJourney({ activity }: { activity: ActivityRow }) {
  return (
    <div className="bg-white rounded-[12px] p-6 shadow-[0_10px_30px_-22px_rgba(15,23,42,0.45)]">
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        {FLOW_STEPS.map((step, index) => {
          const Icon = step.icon;
          const done = activity.avancoAtual >= (index + 1) * 25;

          return (
            <div key={step.key} className="relative flex flex-col items-center text-center gap-3">
              {index < FLOW_STEPS.length - 1 && (
                <span className="hidden md:block absolute top-9 left-[calc(50%+36px)] right-[calc(-50%+36px)] h-px bg-[#E2E8F0]" />
              )}
              <div className="relative z-10 w-[76px] h-[76px] rounded-full border border-[#BFE8F1] bg-[#F8FDFF] flex items-center justify-center">
                <div className="w-[58px] h-[58px] rounded-full bg-white border border-[#D7F2F7] flex items-center justify-center shadow-sm">
                  <Icon size={25} style={{ color: step.color }} />
                </div>
                {done && (
                  <span className="absolute -right-1 -top-1 w-6 h-6 rounded-full bg-[#10B981] text-white flex items-center justify-center border-2 border-white">
                    <CheckCircle2 size={14} />
                  </span>
                )}
              </div>
              <div>
                <p className="text-[12px] font-bold text-[#2D2D2D]">{step.label}</p>
                <p className="text-[10px] font-medium text-[#757575] mt-1">{done ? 'Em andamento' : 'Aguardando'}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ActivitiesList({
  activities,
  selectedActivity,
  onSelect,
  monthlyPriorityMap,
  licitatoriaMap,
  monthlyCycle,
}: {
  activities: ActivityRow[];
  selectedActivity: ActivityRow | null;
  onSelect: (activityId: string) => void;
  monthlyPriorityMap: Record<string, string>;
  licitatoriaMap: Record<string, boolean>;
  monthlyCycle: string;
}) {
  return (
    <div className="xl:sticky xl:top-6 xl:self-start bg-white rounded-[12px] shadow-[0_10px_30px_-22px_rgba(15,23,42,0.45)] overflow-hidden xl:max-h-[calc(100vh-9rem)] flex flex-col">
      <div className="px-6 pt-5 pb-4 flex items-center justify-between gap-4">
        <div>
          <p className="text-[10px] font-extrabold uppercase tracking-[1.2px] text-[#94A3B8]">Execução</p>
          <h3 className="text-[18px] font-black text-[#2D2D2D] mt-0.5">Atividades sendo executadas</h3>
        </div>
        <span className="text-[11px] font-bold text-[#757575]">{activities.length} em execucao</span>
      </div>

      <div className="xl:overflow-y-auto">
        {activities.length === 0 && (
          <div className="py-12 px-6 text-center text-[13px] font-medium text-[#757575]">
            Nenhuma atividade em execucao para este contrato.
          </div>
        )}

        {activities.map((activity) => {
          const monthlyActive = isMonthlyPriorityActive(monthlyPriorityMap[activity.id], monthlyCycle);
          const licitatoriaActive = Boolean(licitatoriaMap[activity.id]);

          return (
            <button
              type="button"
              key={activity.id}
              onClick={() => onSelect(activity.id)}
              className={`w-full text-left px-5 py-4 transition-colors ${selectedActivity?.id === activity.id ? 'bg-[#FFF7ED]' : 'hover:bg-[#F9FAFB]'}`}
            >
              <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.45fr)_140px_150px] gap-4 items-center">
                <div className="min-w-0">
                  <p className="text-[12px] font-bold text-[#2D2D2D] truncate">{getOsDisplayName(activity)}</p>
                  <p className="text-[13px] font-bold text-[#2D2D2D] truncate mt-2">{getActivityDisplayName(activity)}</p>
                  <p className="text-[10px] font-semibold text-[#4B5563] mt-2 leading-tight">{getPeopleLabel(activity)}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {monthlyActive && (
                      <span className="rounded-full bg-[#DCFCE7] px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-[#166534]">
                        Prioridade do mes
                      </span>
                    )}
                    {licitatoriaActive && (
                      <span className="rounded-full bg-[#E0E7FF] px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-[#3730A3]">
                        Licitatoria
                      </span>
                    )}
                  </div>
                </div>

                <div className="min-w-0">
                  <div className="h-2 rounded-full bg-[#F3F4F6] overflow-hidden">
                    <span className="block h-full bg-[#10B981]" style={{ width: `${activity.avancoAtual}%` }} />
                  </div>
                  <p className="text-[11px] font-bold text-[#2D2D2D] mt-1">{activity.avancoAtual}%</p>
                </div>

                <div className="inline-flex items-center gap-2 text-[12px] font-semibold text-[#757575]">
                  <CalendarDays size={15} />
                  {activity.dataFim}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function PriorityDesk({
  activity,
  pendingCount,
  monthlyActive,
  licitatoriaActive,
  currentCycleLabel,
  onToggleMonthly,
  onToggleLicitatoria,
}: {
  activity: ActivityRow | null;
  pendingCount: number;
  monthlyActive: boolean;
  licitatoriaActive: boolean;
  currentCycleLabel: string;
  onToggleMonthly: () => void;
  onToggleLicitatoria: () => void;
}) {
  return (
    <div className="bg-white rounded-[12px] shadow-[0_10px_30px_-22px_rgba(15,23,42,0.45)] overflow-hidden min-h-[360px]">
      <div className="px-6 pt-5 pb-4 flex items-center justify-between gap-4">
        <div>
          <p className="text-[10px] font-extrabold uppercase tracking-[1.2px] text-[#94A3B8]">Balcao unido</p>
          <h3 className="text-[18px] font-black text-[#2D2D2D] mt-0.5">Prioridades do contrato</h3>
        </div>
        <span className="rounded-full bg-[#FFF7ED] px-3 py-1 text-[11px] font-bold text-[#C2410C]">
          {pendingCount} pendentes
        </span>
      </div>

      <div className="px-6 pb-6 space-y-5">
        {activity ? (
          <>
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-black uppercase tracking-widest text-[#166534]">
                    Prioridade do mes {monthlyActive ? '· Ativa' : '· Pendente'}
                  </p>
                  <p className="mt-2 text-[13px] font-semibold text-[#1F2937]">Fica ativa no ciclo atual e reseta automaticamente no dia 05.</p>
                  <p className="mt-2 text-[12px] text-[#4B5563]">Ciclo atual: {currentCycleLabel}</p>
                </div>
                <button
                  type="button"
                  onClick={onToggleMonthly}
                  className={`min-w-[92px] rounded-full px-3 py-2 text-[10px] font-bold uppercase tracking-wide transition ${
                    monthlyActive
                      ? 'bg-[#10B981] text-white hover:bg-[#059669]'
                      : 'bg-[#FFFBEB] text-[#166534] hover:bg-[#ECFDF5]'
                  }`}
                >
                  {monthlyActive ? 'Ativa' : 'Marcar'}
                </button>
              </div>

              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-black uppercase tracking-widest text-[#3730A3]">
                    Prioridade licitatoria {licitatoriaActive ? '· Ativa' : '· Pendente'}
                  </p>
                  <p className="mt-2 text-[13px] font-semibold text-[#1F2937]">Nao reseta. Permanece marcada ate o contrato remover manualmente.</p>
                </div>
                <button
                  type="button"
                  onClick={onToggleLicitatoria}
                  className={`min-w-[92px] rounded-full px-3 py-2 text-[10px] font-bold uppercase tracking-wide transition ${
                    licitatoriaActive
                      ? 'bg-[#4F46E5] text-white hover:bg-[#4338CA]'
                      : 'bg-[#F8FAFC] text-[#3730A3] hover:bg-[#EEF2FF]'
                  }`}
                >
                  {licitatoriaActive ? 'Ativa' : 'Marcar'}
                </button>
              </div>
            </div>

            <div className="pt-1">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0">
                  <p className="text-[11px] font-bold text-[#757575] uppercase tracking-widest">{getOsDisplayName(activity)}</p>
                  <p className="mt-1 text-[15px] font-bold text-[#2D2D2D] leading-snug break-words">{getActivityDisplayName(activity)}</p>
                  <p className="mt-2 text-[12px] font-semibold text-[#4B5563]">{getPeopleLabel(activity)}</p>
                </div>
                <div className="shrink-0 rounded-full bg-[#FEF2F2] px-3 py-1 text-[11px] font-bold uppercase tracking-widest text-[#B91C1C]">
                  Nao Operante
                </div>
              </div>
              <p className="mt-4 text-[12px] font-semibold text-[#64748B]">
                Uma atividade deixa de ficar pendente quando recebe pelo menos uma prioridade do contrato.
              </p>
            </div>
          </>
        ) : (
          <div className="min-h-[260px] flex items-center justify-center text-[13px] font-bold text-[#94A3B8] uppercase tracking-widest">
            Selecione uma atividade
          </div>
        )}
      </div>
    </div>
  );
}

export default function Contrato({
  currentUser: _currentUser,
  preloadedData,
  activeContractCode,
  lockedContractCode,
  activeView = 'os',
}: ContratoProps) {
  const activities = useMemo(() => buildActivities(preloadedData), [preloadedData]);
  const contracts = useMemo(() => getContracts(preloadedData, activities), [preloadedData, activities]);
  const [selectedContract, setSelectedContract] = useState(() => getContractInitialValue(activeContractCode, lockedContractCode));
  const [selectedOs, setSelectedOs] = useState('Todas');
  const [selectedActivityId, setSelectedActivityId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);
  const monthlyPriorityCycle = useMemo(() => getMonthlyPriorityCycleKey(), []);
  const monthlyPriorityCycleLabel = useMemo(() => formatMonthlyCycleLabel(monthlyPriorityCycle), [monthlyPriorityCycle]);
  const priorityRecords = useMemo<ContractPriorityRecord[]>(
    () => Array.isArray(preloadedData?.contractPriorities) ? preloadedData.contractPriorities : [],
    [preloadedData?.contractPriorities]
  );
  const storedPriorities = useMemo<StoredPrioritiesState>(
    () => readStoredPriorities(priorityRecords, monthlyPriorityCycle),
    [monthlyPriorityCycle, priorityRecords]
  );
  const [prioridadeMensal, setPrioridadeMensal] = useState<Record<string, string>>(storedPriorities.monthly);
  const [prioridadeLicitatoria, setPrioridadeLicitatoria] = useState<Record<string, boolean>>(storedPriorities.licitatoria);
  const [showInterferenciaForm, setShowInterferenciaForm] = useState(false);
  const [interferencias, setInterferencias] = useState<Interferencia[]>(() => readStoredInterferencias(preloadedData?.contractInterferences));
  const [interferenciaDraft, setInterferenciaDraft] = useState({ nome: '', data: '', osImpactada: '', observacao: '' });

  const [osSettingsMap, setOsSettingsMap] = useState<Record<string, OsSettingRecord>>(
    () => buildOsSettingsMap(Array.isArray(preloadedData?.osSettings) ? preloadedData.osSettings : [])
  );
  const [selectedOsCodigo, setSelectedOsCodigo] = useState<string | null>(null);
  const [osDraft, setOsDraft] = useState<{
    tipoLicitacao: string;
    tipoProjeto: string;
    responsavel: string;
    prioridadeMensal: string;
    prioridadeLicitatoria: boolean;
  } | null>(null);
  const [isSavingOs, setIsSavingOs] = useState(false);
  const [osToastVisible, setOsToastVisible] = useState(false);
  const prioridadesPersistidas = useMemo(
    () => buildLegacyPriorityState(prioridadeMensal, prioridadeLicitatoria, monthlyPriorityCycle),
    [monthlyPriorityCycle, prioridadeLicitatoria, prioridadeMensal]
  );

  React.useEffect(() => {
    setSelectedContract(getContractInitialValue(activeContractCode, lockedContractCode));
    setSelectedOs('Todas');
  }, [activeContractCode, lockedContractCode]);

  React.useEffect(() => {
    setPrioridadeMensal(storedPriorities.monthly);
    setPrioridadeLicitatoria(storedPriorities.licitatoria);
  }, [storedPriorities]);

  React.useEffect(() => {
    setInterferencias(readStoredInterferencias(preloadedData?.contractInterferences));
  }, [preloadedData?.contractInterferences]);

  React.useEffect(() => {
    setOsSettingsMap(buildOsSettingsMap(Array.isArray(preloadedData?.osSettings) ? preloadedData.osSettings : []));
  }, [preloadedData?.osSettings]);

  const locked = Boolean(String(lockedContractCode || '').trim());

  const filteredActivities = useMemo(() => {
    const termo = normalizeText(deferredSearch);
    return activities.filter((activity) => {
      const matchContract = matchesContract(activity, selectedContract);
      const matchOs = selectedOs === 'Todas'
        || normalizeText(activity.osCodigo) === normalizeText(selectedOs)
        || normalizeText(activity.osNome) === normalizeText(selectedOs);
      const matchSearch = !termo || normalizeText([
        activity.osCodigo,
        activity.osNome,
        activity.itemNome,
        activity.descricao,
        ...activity.profissionais,
      ].join(' ')).includes(termo);
      return matchContract && matchOs && matchSearch;
    });
  }, [activities, deferredSearch, selectedContract, selectedOs]);

  const selectedActivity = filteredActivities.find((activity) => activity.id === selectedActivityId) || filteredActivities[0] || null;
  const selectedOsActivities = selectedActivity
    ? filteredActivities.filter((activity) => normalizeText(activity.osCodigo) === normalizeText(selectedActivity.osCodigo))
    : [];
  const selectedOsJourney = selectedActivity
    ? {
        ...selectedActivity,
        itemNome: selectedActivity.osNome || selectedActivity.itemNome,
        avancoAtual: selectedOsActivities.length
          ? Math.max(...selectedOsActivities.map((activity) => activity.avancoAtual))
          : selectedActivity.avancoAtual,
      }
    : null;

  const osOptions = useMemo(() => getOsOptions(preloadedData, activities, selectedContract), [preloadedData, activities, selectedContract]);
  const observationMinLength = 35;
  const isInterferenciaValid = Boolean(
    interferenciaDraft.nome.trim()
    && interferenciaDraft.data
    && interferenciaDraft.osImpactada
    && interferenciaDraft.observacao.trim().length >= observationMinLength
  );

  const pendingPrioritiesCount = filteredActivities.filter((activity) => {
    const monthlyActive = isMonthlyPriorityActive(prioridadeMensal[activity.id], monthlyPriorityCycle);
    const licitatoriaActive = Boolean(prioridadeLicitatoria[activity.id]);
    return !monthlyActive && !licitatoriaActive;
  }).length;

  const persistPriority = async (activityId: string, nextMonthly?: string, nextLicitatoria?: boolean) => {
    if (!isFirebaseConfigured()) return;
    if (!nextMonthly && !nextLicitatoria) {
      await deleteFirebaseDocument('contractPriorities', activityId);
      return;
    }

    await setFirebaseDocument('contractPriorities', activityId, {
      id: activityId,
      activityId,
      monthlyCycle: nextMonthly || '',
      licitatoria: Boolean(nextLicitatoria),
      updatedAt: new Date().toISOString(),
    });
  };

  const handleSelectOs = (osCodigo: string, osNome: string) => {
    setSelectedOsCodigo(osCodigo);
    const existing = osSettingsMap[osCodigo];
    const inferredProjeto = existing?.tipoProjeto || extractProjectType(osNome) || 'Básico';
    setOsDraft({
      tipoLicitacao: existing?.tipoLicitacao || '',
      tipoProjeto: inferredProjeto,
      responsavel: existing?.responsavel || '',
      prioridadeMensal: existing?.prioridadeMensal || '',
      prioridadeLicitatoria: Boolean(existing?.prioridadeLicitatoria),
    });
  };

  const handleEnviarOs = async () => {
    if (!selectedOsCodigo || !osDraft) return;
    setIsSavingOs(true);
    try {
      const record: OsSettingRecord = {
        id: selectedOsCodigo,
        osCodigo: selectedOsCodigo,
        tipoLicitacao: osDraft.tipoLicitacao,
        tipoProjeto: osDraft.tipoProjeto,
        responsavel: osDraft.responsavel,
        prioridadeMensal: osDraft.prioridadeMensal,
        prioridadeLicitatoria: osDraft.prioridadeLicitatoria,
        updatedAt: new Date().toISOString(),
      };
      if (isFirebaseConfigured()) {
        await setFirebaseDocument('osSettings', selectedOsCodigo, record);
      }
      setOsSettingsMap((prev) => ({ ...prev, [selectedOsCodigo]: record }));
      setOsToastVisible(true);
      setTimeout(() => setOsToastVisible(false), 6000);
    } finally {
      setIsSavingOs(false);
    }
  };

  const handleAddInterferencia = async () => {
    if (!isInterferenciaValid) return;
    if (!isFirebaseConfigured()) return;
    const contratoAtual = contracts.find((item) => normalizeText(item.id) === normalizeText(selectedContract));
    const nextInterferencia = {
      id: `${Date.now()}-${interferenciaDraft.osImpactada}`,
      nome: interferenciaDraft.nome.trim(),
      data: interferenciaDraft.data,
      osImpactada: interferenciaDraft.osImpactada,
      observacao: interferenciaDraft.observacao.trim(),
      contratoCodigo: selectedContract,
      contratoNome: contratoAtual?.nome || selectedContract,
      updatedAt: new Date().toISOString(),
    };
    await setFirebaseDocument('contractInterferences', nextInterferencia.id, nextInterferencia);
    setInterferenciaDraft({ nome: '', data: '', osImpactada: '', observacao: '' });
    setShowInterferenciaForm(false);
  };

  return (
    <div className="space-y-6 font-['Montserrat']">
      {activeView !== 'cronograma' && activeView !== 'atividades' && activeView !== 'os' && (
        <section className="bg-white rounded-[12px] shadow-[0_10px_30px_-22px_rgba(15,23,42,0.45)] p-5">
          <div className="grid grid-cols-1 xl:grid-cols-[minmax(220px,280px)_minmax(220px,280px)_minmax(0,1fr)] gap-4">
            <div>
              <label className="text-[10px] font-bold text-[#757575] uppercase tracking-widest">Contrato</label>
              <SearchableSelect
                value={selectedContract}
                disabled={locked}
                onChange={(event) => {
                  setSelectedContract(event.target.value);
                  setSelectedOs('Todas');
                }}
                className="mt-1 w-full h-11 rounded-xl border border-[#E5E7EB] bg-white px-3 text-[13px] font-medium text-[#2D2D2D] outline-none disabled:bg-[#F8FAFC] disabled:text-[#94A3B8]"
              >
                {!locked && <option value="Todos">Todos os contratos</option>}
                {contracts.map((contract) => (
                  <option key={contract.id} value={contract.id}>
                    {contract.nome || contract.id}
                  </option>
                ))}
              </SearchableSelect>
            </div>

            <div>
              <label className="text-[10px] font-bold text-[#757575] uppercase tracking-widest">OS</label>
              <SearchableSelect
                value={selectedOs}
                onChange={(event) => setSelectedOs(event.target.value)}
                className="mt-1 w-full h-11 rounded-xl border border-[#E5E7EB] bg-white px-3 text-[13px] font-medium text-[#2D2D2D] outline-none"
              >
                <option value="Todas">Todas as OS</option>
                {osOptions.map((os) => (
                  <option key={os.codigo} value={os.codigo}>
                    {os.nome || os.codigo}
                  </option>
                ))}
              </SearchableSelect>
            </div>

            <div>
              <label className="text-[10px] font-bold text-[#757575] uppercase tracking-widest">Buscar atividade</label>
              <div className="mt-1 relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#94A3B8]" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Buscar por OS, atividade ou profissional"
                  className="w-full h-11 rounded-xl border border-[#E5E7EB] bg-white pl-10 pr-3 text-[13px] font-medium text-[#2D2D2D] outline-none focus:border-[#F05D28]"
                />
              </div>
            </div>
          </div>
        </section>
      )}

      {activeView === 'atividades' && (
        <div className="w-full flex flex-col font-['Montserrat']">
          <div className="mb-3 flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-[#757575]">
            <span>Contrato</span>
            <ChevronRight size={12} />
            <span className="text-[#F05D28]">Atividades</span>
          </div>
          <Atividades
            currentUser={_currentUser}
            preloadedData={preloadedData}
            showAllDisciplines
            disciplineFilterEnabled
          />
        </div>
      )}

      {activeView === 'os' && (
        <section className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(420px,420px)] gap-6">
          {/* OS List */}
          <div className="bg-white rounded-[12px] shadow-[0_10px_30px_-22px_rgba(15,23,42,0.45)] overflow-hidden">
            <div className="px-6 pt-5 pb-4 flex items-center justify-between gap-4">
              <div>
                <p className="text-[10px] font-extrabold uppercase tracking-[1.2px] text-[#94A3B8]">Contrato</p>
                <h3 className="text-[18px] font-black text-[#2D2D2D] mt-0.5">Ordens de Serviço</h3>
              </div>
              {!locked && (
                <SearchableSelect
                  value={selectedContract}
                  onChange={(e) => setSelectedContract(e.target.value)}
                  className="h-9 rounded-xl border border-[#E5E7EB] bg-white px-3 text-[12px] font-medium text-[#2D2D2D] outline-none focus:border-[#F05D28]"
                >
                  <option value="Todos">Todos os contratos</option>
                  {contracts.map((c) => (
                    <option key={c.id} value={c.id}>{c.nome || c.id}</option>
                  ))}
                </SearchableSelect>
              )}
            </div>
            <div className="xl:overflow-y-auto xl:max-h-[calc(100vh-14rem)]">
              {osOptions.length === 0 && (
                <div className="py-12 px-6 text-center text-[13px] font-medium text-[#757575]">
                  Nenhuma OS encontrada.
                </div>
              )}
              {osOptions.map((os) => {
                const settings = osSettingsMap[os.codigo];
                const isSelected = selectedOsCodigo === os.codigo;
                const monthlyActive = isMonthlyPriorityActive(settings?.prioridadeMensal, monthlyPriorityCycle);
                const licitatoriaActive = Boolean(settings?.prioridadeLicitatoria);
                const isOperante = monthlyActive || licitatoriaActive;
                return (
                  <button
                    type="button"
                    key={os.codigo}
                    onClick={() => handleSelectOs(os.codigo, os.nome)}
                    className={`w-full text-left px-5 py-4 transition-colors ${isSelected ? 'bg-[#FFF7ED]' : 'hover:bg-[#F9FAFB]'}`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-[11px] font-bold text-[#F05D28] uppercase tracking-widest">{os.codigo}</p>
                        <p className="mt-0.5 text-[13px] font-bold text-[#2D2D2D] truncate">{os.nome}</p>
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          {settings?.tipoLicitacao && (
                            <span className="rounded-full bg-[#EFF6FF] px-2 py-0.5 text-[10px] font-bold text-[#1D4ED8]">{settings.tipoLicitacao}</span>
                          )}
                          {settings?.tipoProjeto && (
                            <span className="rounded-full bg-[#F3F4F6] px-2 py-0.5 text-[10px] font-bold text-[#374151]">{settings.tipoProjeto}</span>
                          )}
                          {monthlyActive && (
                            <span className="rounded-full bg-[#DCFCE7] px-2 py-0.5 text-[10px] font-bold text-[#166534]">Prioridade do mês</span>
                          )}
                          {licitatoriaActive && (
                            <span className="rounded-full bg-[#E0E7FF] px-2 py-0.5 text-[10px] font-bold text-[#3730A3]">Licitatória</span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {!isOperante && (
                          <span className="shrink-0 rounded-full bg-[#FEF2F2] px-2.5 py-0.5 text-[10px] font-bold uppercase text-[#B91C1C]">
                            Não Operante
                          </span>
                        )}
                        <ChevronRight size={16} className="text-[#CBD5E1] shrink-0" />
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* OS Detail Panel */}
          {selectedOsCodigo && osDraft ? (
            <div className="bg-white rounded-[12px] shadow-[0_10px_30px_-22px_rgba(15,23,42,0.45)] overflow-hidden xl:sticky xl:top-6 xl:self-start">
              <div className="px-6 pt-5 pb-4">
                <p className="text-[10px] font-extrabold uppercase tracking-[1.2px] text-[#94A3B8]">{selectedOsCodigo}</p>
                <h3 className="mt-0.5 text-[18px] font-black text-[#2D2D2D] leading-snug">
                  {osOptions.find((o) => o.codigo === selectedOsCodigo)?.nome || selectedOsCodigo}
                </h3>
              </div>
              <div className="p-6 space-y-5">
                <div className="space-y-3">
                  <div>
                    <label className="text-[10px] font-bold text-[#757575] uppercase tracking-widest">Tipo de Projeto</label>
                    <SearchableSelect
                      value={osDraft.tipoProjeto}
                      onChange={(e) => setOsDraft((prev) => prev ? { ...prev, tipoProjeto: e.target.value } : prev)}
                      className="mt-1 w-full h-10 rounded-xl border border-[#E5E7EB] bg-white px-3 text-[13px] font-medium text-[#2D2D2D] outline-none focus:border-[#F05D28]"
                    >
                      {TIPO_PROJETO_OPTIONS.map((opt) => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </SearchableSelect>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-[#757575] uppercase tracking-widest">Tipo de Licitação</label>
                    <SearchableSelect
                      value={osDraft.tipoLicitacao}
                      onChange={(e) => setOsDraft((prev) => prev ? { ...prev, tipoLicitacao: e.target.value } : prev)}
                      className="mt-1 w-full h-10 rounded-xl border border-[#E5E7EB] bg-white px-3 text-[13px] font-medium text-[#2D2D2D] outline-none focus:border-[#F05D28]"
                    >
                      {TIPO_LICITACAO_OPTIONS.map((opt) => (
                        <option key={opt} value={opt}>{opt || 'Não definido'}</option>
                      ))}
                    </SearchableSelect>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-[#757575] uppercase tracking-widest">Responsável</label>
                    <input
                      value={osDraft.responsavel}
                      onChange={(e) => setOsDraft((prev) => prev ? { ...prev, responsavel: e.target.value } : prev)}
                      placeholder="Nome do responsável"
                      className="mt-1 w-full h-10 rounded-xl border border-[#E5E7EB] bg-white px-3 text-[13px] font-medium text-[#2D2D2D] outline-none focus:border-[#F05D28]"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[11px] font-black uppercase tracking-widest text-[#166534]">
                        Prioridade do mês {osDraft.prioridadeMensal === monthlyPriorityCycle ? '· Ativa' : '· Pendente'}
                      </p>
                      <p className="mt-2 text-[13px] font-semibold text-[#1F2937]">Fica ativa no ciclo atual e reseta automaticamente no dia 05.</p>
                      <p className="mt-1 text-[11px] text-[#4B5563]">Ciclo: {monthlyPriorityCycleLabel}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setOsDraft((prev) => prev ? {
                        ...prev,
                        prioridadeMensal: prev.prioridadeMensal === monthlyPriorityCycle ? '' : monthlyPriorityCycle,
                      } : prev)}
                      className={`min-w-[84px] rounded-full px-3 py-2 text-[10px] font-bold uppercase tracking-wide transition ${
                        osDraft.prioridadeMensal === monthlyPriorityCycle
                          ? 'bg-[#10B981] text-white hover:bg-[#059669]'
                          : 'bg-[#FFFBEB] text-[#166534] hover:bg-[#ECFDF5]'
                      }`}
                    >
                      {osDraft.prioridadeMensal === monthlyPriorityCycle ? 'Ativa' : 'Marcar'}
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-4">
                  <button
                    type="button"
                    onClick={() => { setSelectedOsCodigo(null); setOsDraft(null); }}
                    className="inline-flex items-center gap-2 rounded-xl border border-[#FECACA] bg-white px-4 py-2 text-[12px] font-bold text-[#B91C1C] hover:bg-[#FEF2F2] transition-colors"
                  >
                    <Trash2 size={14} />
                    Excluir da lista
                  </button>
                  <button
                    type="button"
                    disabled={isSavingOs}
                    onClick={handleEnviarOs}
                    className="h-14 px-6 rounded-2xl bg-[#F05D28] text-white text-[15px] font-bold shadow-lg hover:bg-[#D94E1F] transition-colors inline-flex items-center gap-3 disabled:opacity-70"
                  >
                    {isSavingOs ? <Save size={18} className="animate-pulse" /> : <Save size={18} />}
                    {isSavingOs ? 'Salvando...' : 'Enviar informações'}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-[12px] shadow-[0_10px_30px_-22px_rgba(15,23,42,0.45)] flex items-center justify-center min-h-[360px]">
              <p className="text-[13px] font-bold text-[#94A3B8] uppercase tracking-widest">Selecione uma OS</p>
            </div>
          )}
        </section>
      )}

      {activeView === 'prioridades' && (
        <section className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.15fr)_minmax(420px,0.85fr)] gap-6">
          <ActivitiesList
            activities={filteredActivities}
            selectedActivity={selectedActivity}
            onSelect={setSelectedActivityId}
            monthlyPriorityMap={prioridadeMensal}
            licitatoriaMap={prioridadeLicitatoria}
            monthlyCycle={monthlyPriorityCycle}
          />

          <div className="space-y-6">
            {selectedOsJourney ? <ActivityJourney activity={selectedOsJourney} /> : (
              <div className="bg-white rounded-[12px] p-6 shadow-[0_10px_30px_-22px_rgba(15,23,42,0.45)] min-h-[240px] flex items-center justify-center text-[13px] font-bold text-[#94A3B8] uppercase tracking-widest">
                Selecione uma OS
              </div>
            )}
            <PriorityDesk
              activity={selectedActivity}
              pendingCount={pendingPrioritiesCount}
              monthlyActive={selectedActivity ? isMonthlyPriorityActive(prioridadeMensal[selectedActivity.id], monthlyPriorityCycle) : false}
              licitatoriaActive={selectedActivity ? Boolean(prioridadeLicitatoria[selectedActivity.id]) : false}
              currentCycleLabel={monthlyPriorityCycleLabel}
              onToggleMonthly={() => {
                if (!selectedActivity) return;
                const currentValue = prioridadeMensal[selectedActivity.id];
                const nextMonthly = isMonthlyPriorityActive(currentValue, monthlyPriorityCycle) ? '' : monthlyPriorityCycle;
                const nextState = { ...prioridadeMensal };
                if (nextMonthly) nextState[selectedActivity.id] = nextMonthly;
                else delete nextState[selectedActivity.id];
                setPrioridadeMensal(nextState);
                void persistPriority(selectedActivity.id, nextMonthly, prioridadeLicitatoria[selectedActivity.id]);
              }}
              onToggleLicitatoria={() => {
                if (!selectedActivity) return;
                const nextValue = !prioridadeLicitatoria[selectedActivity.id];
                const nextState = { ...prioridadeLicitatoria };
                if (nextValue) nextState[selectedActivity.id] = true;
                else delete nextState[selectedActivity.id];
                setPrioridadeLicitatoria(nextState);
                void persistPriority(selectedActivity.id, prioridadeMensal[selectedActivity.id], nextValue);
              }}
            />
          </div>
        </section>
      )}

      {activeView === 'prioridades' && (
        <section className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.15fr)_minmax(420px,0.85fr)] gap-6">
          <ActivitiesList
            activities={filteredActivities}
            selectedActivity={selectedActivity}
            onSelect={setSelectedActivityId}
            monthlyPriorityMap={prioridadeMensal}
            licitatoriaMap={prioridadeLicitatoria}
            monthlyCycle={monthlyPriorityCycle}
          />

          <PriorityDesk
            activity={selectedActivity}
            pendingCount={pendingPrioritiesCount}
            monthlyActive={selectedActivity ? isMonthlyPriorityActive(prioridadeMensal[selectedActivity.id], monthlyPriorityCycle) : false}
            licitatoriaActive={selectedActivity ? Boolean(prioridadeLicitatoria[selectedActivity.id]) : false}
            currentCycleLabel={monthlyPriorityCycleLabel}
            onToggleMonthly={() => {
              if (!selectedActivity) return;
              const currentValue = prioridadeMensal[selectedActivity.id];
              const nextMonthly = isMonthlyPriorityActive(currentValue, monthlyPriorityCycle) ? '' : monthlyPriorityCycle;
              const nextState = { ...prioridadeMensal };
              if (nextMonthly) nextState[selectedActivity.id] = nextMonthly;
              else delete nextState[selectedActivity.id];
              setPrioridadeMensal(nextState);
              void persistPriority(selectedActivity.id, nextMonthly, prioridadeLicitatoria[selectedActivity.id]);
            }}
            onToggleLicitatoria={() => {
              if (!selectedActivity) return;
              const nextValue = !prioridadeLicitatoria[selectedActivity.id];
              const nextState = { ...prioridadeLicitatoria };
              if (nextValue) nextState[selectedActivity.id] = true;
              else delete nextState[selectedActivity.id];
              setPrioridadeLicitatoria(nextState);
              void persistPriority(selectedActivity.id, prioridadeMensal[selectedActivity.id], nextValue);
            }}
          />
        </section>
      )}

      {activeView === 'interferencias' && (
        <section className="bg-white rounded-[12px] shadow-[0_10px_30px_-22px_rgba(15,23,42,0.45)] overflow-hidden">
          <div className="px-6 pt-5 pb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <p className="text-[10px] font-extrabold uppercase tracking-[1.2px] text-[#94A3B8]">Contrato</p>
              <h3 className="text-[18px] font-black text-[#2D2D2D] mt-0.5">Interferências</h3>
            </div>
            <button
              type="button"
              onClick={() => setShowInterferenciaForm(true)}
              className="h-10 px-4 rounded-xl border border-[#F05D28] text-[#F05D28] text-[12px] font-bold inline-flex items-center justify-center gap-2 hover:bg-[#FFF7ED]"
            >
              <Plus size={15} />
              Nova interferência
            </button>
          </div>

          <div className="px-5 pb-5 grid grid-cols-1 lg:grid-cols-2 gap-4">
            {interferencias.length === 0 && (
              <div className="lg:col-span-2 py-8 text-center text-[13px] font-medium text-[#757575]">
                Nenhuma interferência registrada nesta sessão.
              </div>
            )}

            {interferencias.map((item) => (
              <div key={item.id} className="rounded-xl bg-[#F9FAFB] p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[14px] font-bold text-[#2D2D2D]">{item.nome}</p>
                    <p className="text-[11px] font-semibold text-[#757575] mt-1">{formatDateBR(item.data)} - OS {item.osImpactada}</p>
                  </div>
                  <AlertTriangle size={17} className="text-[#F59E0B] shrink-0" />
                </div>
                <p className="mt-3 text-[13px] leading-relaxed text-[#4B5563]">{item.observacao}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {activeView === 'cronograma' && (
        <Cronograma
          preloadedData={preloadedData}
          lockedContractCode={lockedContractCode}
        />
      )}

      {showInterferenciaForm && (
        <div className="fixed inset-0 bg-black/30 z-[80] flex items-center justify-center p-4">
          <div className="w-full max-w-[620px] bg-white rounded-[12px] shadow-2xl overflow-hidden">
            <div className="px-6 pt-5 pb-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <PencilLine size={18} className="text-[#F05D28]" />
                <h3 className="text-[15px] font-bold text-[#2D2D2D] uppercase tracking-widest">Interferência</h3>
              </div>
              <button type="button" onClick={() => setShowInterferenciaForm(false)} className="p-2 rounded-lg text-[#757575] hover:bg-[#F3F4F6]">
                <X size={18} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-bold text-[#757575] uppercase tracking-widest">Nome da interferência</label>
                  <input
                    value={interferenciaDraft.nome}
                    onChange={(event) => setInterferenciaDraft((prev) => ({ ...prev, nome: event.target.value }))}
                    className="mt-1 w-full h-11 rounded-xl border border-[#E5E7EB] px-3 text-[13px] font-medium outline-none focus:border-[#F05D28]"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-[#757575] uppercase tracking-widest">Data</label>
                  <input
                    type="date"
                    value={interferenciaDraft.data}
                    onChange={(event) => setInterferenciaDraft((prev) => ({ ...prev, data: event.target.value }))}
                    className="mt-1 w-full h-11 rounded-xl border border-[#E5E7EB] px-3 text-[13px] font-medium outline-none focus:border-[#F05D28]"
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] font-bold text-[#757575] uppercase tracking-widest">OS impactada</label>
                <SearchableSelect
                  value={interferenciaDraft.osImpactada}
                  onChange={(event) => setInterferenciaDraft((prev) => ({ ...prev, osImpactada: event.target.value }))}
                  className="mt-1 w-full h-11 rounded-xl border border-[#E5E7EB] px-3 text-[13px] font-medium outline-none focus:border-[#F05D28]"
                >
                  <option value="">Selecionar OS</option>
                  {osOptions.map((os) => (
                    <option key={os.codigo || os.nome} value={os.codigo || os.nome}>
                      {os.codigo && os.nome && os.nome !== os.codigo ? `${os.codigo} - ${os.nome}` : os.nome || os.codigo}
                    </option>
                  ))}
                </SearchableSelect>
              </div>

              <div>
                <label className="text-[10px] font-bold text-[#757575] uppercase tracking-widest">Observacao</label>
                <textarea
                  value={interferenciaDraft.observacao}
                  onChange={(event) => setInterferenciaDraft((prev) => ({ ...prev, observacao: event.target.value }))}
                  className="mt-1 w-full min-h-[130px] resize-none rounded-xl border border-[#E5E7EB] p-3 text-[13px] font-medium outline-none focus:border-[#F05D28]"
                  placeholder="Descreva a interferência com pelo menos 35 caracteres"
                />
                <p className={`mt-1 text-[11px] font-semibold ${interferenciaDraft.observacao.trim().length >= observationMinLength ? 'text-[#10B981]' : 'text-[#B45309]'}`}>
                  {interferenciaDraft.observacao.trim().length}/{observationMinLength} caracteres minimos
                </p>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowInterferenciaForm(false)}
                  className="h-11 px-4 rounded-xl border border-[#E5E7EB] text-[#757575] text-[13px] font-bold hover:bg-[#F9FAFB]"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={!isInterferenciaValid}
                  onClick={handleAddInterferencia}
                  className="h-11 px-5 rounded-xl bg-[#F05D28] text-white text-[13px] font-bold hover:bg-[#D94E1F] disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  Adicionar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {osToastVisible && (
        <div className="fixed bottom-6 right-6 z-[100] flex items-start gap-3 rounded-2xl bg-[#FFF7ED] px-5 py-4 shadow-xl max-w-[340px]">
          <Save size={18} className="text-[#F05D28] mt-0.5 shrink-0" />
          <div>
            <p className="text-[13px] font-bold text-[#2D2D2D]">Informações enviadas</p>
            <p className="mt-1 text-[12px] font-medium text-[#64748B]">Modificações podem demorar até 5 minutos para ser aplicadas.</p>
          </div>
          <button type="button" onClick={() => setOsToastVisible(false)} className="ml-2 text-[#94A3B8] hover:text-[#2D2D2D]">
            <X size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
