import React, { useEffect, useMemo, useState } from 'react';
import { CalendarDays, ChevronDown, ChevronRight, Filter } from 'lucide-react';
import { isFirebaseConfigured, setFirebaseDocument } from '../lib/firebaseDb';

interface CronogramaRow {
  code?: string;
  name?: string;
  progress?: number;
  duration?: number;
  plannedStart?: string;
  plannedEnd?: string;
  predecessor?: string;
  idealProgress?: number;
  realStart?: string;
  realEnd?: string;
  baselineIdealProgress?: number;
}

interface CronogramaProps {
  lockedContractCode?: string;
  viewMode?: 'default' | 'planning';
  currentUser?: {
    nome?: string;
    email?: string;
    role?: string;
  };
  preloadedData?: {
    cronograma?: CronogramaRow[];
    registro?: {
      contracts?: Array<{ codigo: string; nome: string }>;
      osOptions?: Array<{ codigo: string; nome: string; contratoCodigo: string }>;
      activitiesList?: Array<Record<string, any>>;
    };
    planningTodos?: Array<Record<string, any>>;
  };
  onPlannerApprovalSubmit?: (rows: Array<{
    id: string;
    itemCodigo: string;
    itemNome: string;
    progress: number;
    approved: boolean;
  }>) => Promise<void> | void;
}

interface TreeNode {
  code: string;
  name: string;
  row: CronogramaRow;
  children: TreeNode[];
}

function normalizeText(value: any) {
  return String(value || '').trim();
}

function normalizeKey(value: any) {
  return String(value || '').trim().toLowerCase();
}

function dotCount(code: string) {
  return (code.match(/\./g) || []).length;
}

function parseDate(value?: string) {
  const raw = normalizeText(value);
  if (!raw) return null;

  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));

  const br = raw.match(/^(\d{2})[\/\-.](\d{2})[\/\-.](\d{4})/);
  if (br) return new Date(Number(br[3]), Number(br[2]) - 1, Number(br[1]));

  return null;
}

function formatDateBR(value?: string) {
  const date = parseDate(value);
  if (!date || Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('pt-BR');
}

function toPercent(value: any) {
  const raw = typeof value === 'number'
    ? value
    : Number(String(value || 0).replace(/\./g, '').replace(',', '.'));
  const normalized = Number.isNaN(raw) ? 0 : raw;
  const percent = normalized > 0 && normalized <= 1 ? normalized * 100 : normalized;
  return Math.max(0, Math.min(100, Math.round(percent)));
}

function compareHierarchy(a: string, b: string) {
  const aParts = a.split('.').map((item) => Number(item.replace(/\D/g, '')) || 0);
  const bParts = b.split('.').map((item) => Number(item.replace(/\D/g, '')) || 0);
  const maxLength = Math.max(aParts.length, bParts.length);

  for (let index = 0; index < maxLength; index += 1) {
    const diff = (aParts[index] || 0) - (bParts[index] || 0);
    if (diff !== 0) return diff;
  }

  return a.localeCompare(b, 'pt-BR');
}

function getParentCode(code: string) {
  const parts = code.split('.');
  if (parts.length <= 1) return '';
  parts.pop();
  return parts.join('.');
}

function buildContractOptions(rows: CronogramaRow[], preloadedData?: CronogramaProps['preloadedData']) {
  const fromRegistro = Array.isArray(preloadedData?.registro?.contracts) ? preloadedData.registro.contracts : [];
  if (fromRegistro.length) return fromRegistro.map((item) => ({ code: item.codigo, name: item.nome }));

  return rows
    .filter((row) => dotCount(normalizeText(row.code)) === 0)
    .map((row) => ({ code: normalizeText(row.code), name: normalizeText(row.name || row.code) }))
    .filter((item) => item.code);
}

function buildOsOptions(rows: CronogramaRow[], preloadedData?: CronogramaProps['preloadedData']) {
  const fromRegistro = Array.isArray(preloadedData?.registro?.osOptions) ? preloadedData.registro.osOptions : [];
  if (fromRegistro.length) {
    return fromRegistro.map((item) => ({ code: item.codigo, name: item.nome, contractCode: item.contratoCodigo }));
  }

  return rows
    .filter((row) => dotCount(normalizeText(row.code)) === 1)
    .map((row) => {
      const code = normalizeText(row.code);
      return {
        code,
        name: normalizeText(row.name || row.code),
        contractCode: getParentCode(code),
      };
    })
    .filter((item) => item.code && item.contractCode);
}

function buildTree(rows: CronogramaRow[], contractFilter: string, osFilter: string) {
  const rowMap = new Map<string, CronogramaRow>();
  rows.forEach((row) => {
    const code = normalizeText(row.code);
    const name = normalizeText(row.name);
    if (code && name) rowMap.set(code, row);
  });

  const selectedCodes = Array.from(rowMap.keys()).filter((code) => {
    if (osFilter !== 'Todas') return code === osFilter || code.startsWith(`${osFilter}.`);
    if (contractFilter !== 'Todos') return code === contractFilter || code.startsWith(`${contractFilter}.`);
    return true;
  });

  const selectedSet = new Set(selectedCodes);
  const childrenMap = new Map<string, string[]>();

  selectedCodes.forEach((code) => {
    const parentCode = getParentCode(code);
    if (!selectedSet.has(parentCode)) return;
    const bucket = childrenMap.get(parentCode) || [];
    bucket.push(code);
    childrenMap.set(parentCode, bucket);
  });

  childrenMap.forEach((children, parentCode) => {
    children.sort(compareHierarchy);
    childrenMap.set(parentCode, children);
  });

  const buildNode = (code: string): TreeNode => {
    const row = rowMap.get(code)!;
    const childCodes = childrenMap.get(code) || [];
    return {
      code,
      name: normalizeText(row.name || row.code),
      row,
      children: childCodes.map(buildNode),
    };
  };

  const rootCodes = selectedCodes
    .filter((code) => !selectedSet.has(getParentCode(code)))
    .sort(compareHierarchy);

  return rootCodes.map(buildNode);
}

function flattenCodes(nodes: TreeNode[]): string[] {
  return nodes.flatMap((node) => [node.code, ...flattenCodes(node.children)]);
}

function ProgressBar({ progress }: { progress: number }) {
  return (
    <div className="flex items-center gap-3">
      <div className="h-2.5 flex-1 min-w-[160px] rounded-full bg-[#EEF2F7] overflow-hidden">
        <div className="h-full rounded-full bg-[#F05D28] transition-all duration-300" style={{ width: `${progress}%` }} />
      </div>
      <span className="w-12 text-right text-[12px] font-bold text-[#2D2D2D]">{progress}%</span>
    </div>
  );
}

function BlueProgressBar({ progress }: { progress: number }) {
  return (
    <div className="flex items-center gap-3">
      <div className="h-2.5 flex-1 min-w-[160px] rounded-full bg-[#EAF2FF] overflow-hidden">
        <div className="h-full rounded-full bg-[#2563EB] transition-all duration-300" style={{ width: `${progress}%` }} />
      </div>
      <span className="w-12 text-right text-[12px] font-bold text-[#1D4ED8]">{progress}%</span>
    </div>
  );
}

interface PlanningReviewRow {
  id: string;
  itemCodigo: string;
  itemNome: string;
  contratoCodigo: string;
  contratoNome: string;
  osCodigo: string;
  osNome: string;
  disciplina: string;
  plannedStart: string;
  plannedEnd: string;
  technicalProgress: number;
  hasTechnicalActivity: boolean;
  activityStatus: string;
  approved: boolean;
  sourceActivityId: string;
  plannerApprovedAt: string;
  plannerApprovedBy: string;
}

function buildPlanningReviewRows(preloadedData?: CronogramaProps['preloadedData']) {
  const planningTodoRows = Array.isArray(preloadedData?.planningTodos) ? preloadedData.planningTodos : [];
  const planningReviews = planningTodoRows.filter((item: any) => {
    const recordType = normalizeKey(item?.recordType);
    const origin = normalizeKey(item?.origin);
    return recordType === 'planning-review' || origin === 'planning-review';
  });
  const activitiesList = Array.isArray(preloadedData?.registro?.activitiesList) ? preloadedData.registro.activitiesList : [];

  const planningReviewById = new Map(
    planningReviews.map((item: any) => {
      const id = normalizeKey(item?.id || item?.activityId || item?.sourceActivityId || item?.itemCodigo);
      return [id, item];
    }),
  );
  const planningReviewByCode = new Map(
    planningReviews.map((item: any) => {
      const code = normalizeKey(item?.itemCodigo || item?.atividadeCodigo || item?.sourceCode || item?.id);
      return [code, item];
    }),
  );
  const activityById = new Map(
    activitiesList.map((item: any) => {
      const id = normalizeKey(item?.activityId || item?.id);
      return [id, item];
    }),
  );
  const activityByCode = new Map(
    activitiesList.map((item: any) => {
      const code = normalizeKey(item?.itemCodigo || item?.atividadeCodigo || item?.sourceCode);
      return [code, item];
    }),
  );
  const activitySources = activitiesList.length > 0 ? activitiesList : planningReviews;

  return activitySources
    .map((source: any) => {
      const itemCodigo = normalizeText(source?.itemCodigo || source?.atividadeCodigo || source?.sourceCode || source?.id || source?.activityId);
      if (!itemCodigo) return null;

      const sourceId = normalizeKey(source?.activityId || source?.id || itemCodigo);
      const activity = activityById.get(sourceId)
        || activityByCode.get(normalizeKey(itemCodigo))
        || {};
      const planningReview = planningReviewById.get(sourceId)
        || planningReviewByCode.get(normalizeKey(itemCodigo))
        || {};
      const sourceActivityId = normalizeText(activity?.activityId || activity?.id || planningReview?.sourceActivityId || planningReview?.id || source?.activityId || source?.id || itemCodigo);
      const hasTechnicalActivity = Boolean(activity?.activityId || activity?.id || activity?.status);
      const activityStatus = normalizeText(activity?.status || planningReview?.status || source?.status || '').toLowerCase();
      const technicalProgress = toPercent(activity?.avancoAtual ?? activity?.progress ?? planningReview?.technicalProgress ?? planningReview?.progress ?? source?.progress ?? 0);
      const approved = Boolean(planningReview?.plannerApproved || planningReview?.approvedByPlanner || planningReview?.plannerOk || source?.plannerApproved || source?.approvedByPlanner || source?.plannerOk);
      const plannerApprovedAt = normalizeText(planningReview?.plannerApprovedAt || planningReview?.approvedAt || source?.plannerApprovedAt || '');
      const plannerApprovedBy = normalizeText(planningReview?.plannerApprovedBy || planningReview?.approvedBy || source?.plannerApprovedBy || '');

      return {
        id: normalizeText(activity?.activityId || activity?.id || planningReview?.id || itemCodigo),
        itemCodigo,
        itemNome: normalizeText(activity?.itemNome || activity?.descricao || planningReview?.itemNome || planningReview?.titulo || itemCodigo),
        contratoCodigo: normalizeText(activity?.contratoCodigo || planningReview?.contratoCodigo || ''),
        contratoNome: normalizeText(activity?.contratoNome || planningReview?.contratoNome || activity?.contratoCodigo || planningReview?.contratoCodigo || ''),
        osCodigo: normalizeText(activity?.osCodigo || planningReview?.osCodigo || ''),
        osNome: normalizeText(activity?.osNome || planningReview?.osNome || ''),
        disciplina: normalizeText(activity?.criadoPorDisciplina || activity?.disciplina || planningReview?.disciplina || ''),
        plannedStart: normalizeText(planningReview?.plannedStart || planningReview?.inicioPlanejado || activity?.plannedStart || activity?.inicioPlanejado || ''),
        plannedEnd: normalizeText(planningReview?.plannedEnd || planningReview?.terminoPlanejado || activity?.plannedEnd || activity?.terminoPlanejado || ''),
        technicalProgress,
        hasTechnicalActivity,
        activityStatus,
        approved,
        sourceActivityId,
        plannerApprovedAt,
        plannerApprovedBy,
      } as PlanningReviewRow;
    })
    .filter(Boolean) as PlanningReviewRow[];
}

function serializePlanningReviewRow(row: PlanningReviewRow) {
  const now = new Date().toISOString();
  return {
    id: row.id,
    itemCodigo: row.itemCodigo,
    itemNome: row.itemNome,
    titulo: row.itemNome,
    sourceCode: row.itemCodigo,
    sourceName: row.itemNome,
    sourceActivityId: row.sourceActivityId,
    contratoCodigo: row.contratoCodigo,
    contratoNome: row.contratoNome,
    osCodigo: row.osCodigo,
    osNome: row.osNome,
    disciplina: row.disciplina,
    plannedStart: row.plannedStart,
    plannedEnd: row.plannedEnd,
    progress: row.technicalProgress,
    technicalProgress: row.technicalProgress,
    note: '',
    lodLabel: '',
    plannerApproved: row.approved,
    plannerApprovedAt: row.approved ? (row.plannerApprovedAt || now) : '',
    plannerApprovedBy: row.approved ? row.plannerApprovedBy : '',
    plannerApprovedProgress: row.approved ? row.technicalProgress : 0,
    approvedByPlanner: row.approved,
    approvedAt: row.approved ? (row.plannerApprovedAt || now) : '',
    approvedBy: row.approved ? row.plannerApprovedBy : '',
    recordType: 'planning-review',
    updatedAt: now,
    origin: 'planning-review',
  };
}

interface TreeRowProps {
  key?: React.Key;
  node: TreeNode;
  level: number;
  expandedRows: Set<string>;
  onToggle: (code: string) => void;
}

function TreeRow({
  node,
  level,
  expandedRows,
  onToggle,
}: TreeRowProps) {
  const hasChildren = node.children.length > 0;
  const expanded = expandedRows.has(node.code);
  const progress = toPercent(node.row.progress);
  const predecessor = normalizeText(node.row.predecessor);

  return (
    <>
      <div className="border-b border-[#F3F4F6] last:border-b-0">
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.3fr)_minmax(260px,0.7fr)] gap-4 px-5 py-4">
          <div className="min-w-0">
            <button
              type="button"
              onClick={() => hasChildren && onToggle(node.code)}
              className={`flex w-full items-start gap-3 text-left ${hasChildren ? 'cursor-pointer' : 'cursor-default'}`}
              style={{ paddingLeft: `${level * 18}px` }}
            >
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center text-[#757575]">
                {hasChildren ? (expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />) : <span className="h-2 w-2 rounded-full bg-[#D1D5DB]" />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-bold text-[#2D2D2D]">
                  {node.code} - {node.name}
                </p>
                <p className="mt-1 text-[11px] text-[#757575]">
                  {formatDateBR(node.row.plannedStart)} a {formatDateBR(node.row.plannedEnd)}
                </p>
                {predecessor && (
                  <p className="mt-1 text-[10px] text-[#94A3B8]">
                    Predecessora: {predecessor}
                  </p>
                )}
              </div>
            </button>
          </div>

          <div className="flex flex-col justify-center gap-2">
            <ProgressBar progress={progress} />
          </div>
        </div>
      </div>

      {hasChildren && expanded && node.children.map((child) => (
        <React.Fragment key={child.code}>
          <TreeRow
            node={child}
            level={level + 1}
            expandedRows={expandedRows}
            onToggle={onToggle}
          />
        </React.Fragment>
      ))}
    </>
  );
}

export default function Cronograma({
  preloadedData,
  lockedContractCode,
  viewMode = 'default',
  currentUser,
  onPlannerApprovalSubmit,
}: CronogramaProps) {
  const isPlanningMode = viewMode === 'planning';
  const rows = useMemo(
    () => Array.isArray(preloadedData?.cronograma)
      ? preloadedData.cronograma.filter((row) => normalizeText(row.code) && normalizeText(row.name))
      : [],
    [preloadedData?.cronograma],
  );
  const planningRows = useMemo(
    () => (isPlanningMode ? buildPlanningReviewRows(preloadedData) : []),
    [isPlanningMode, preloadedData],
  );

  const contracts = useMemo(() => buildContractOptions(rows, preloadedData), [rows, preloadedData]);
  const osOptions = useMemo(() => buildOsOptions(rows, preloadedData), [rows, preloadedData]);

  const [contractFilter, setContractFilter] = useState('Todos');
  const [osFilter, setOsFilter] = useState('Todas');
  const [showInProgressActivities, setShowInProgressActivities] = useState(false);
  const [approvalDrafts, setApprovalDrafts] = useState<Record<string, boolean>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [savingMessage, setSavingMessage] = useState('');

  useEffect(() => {
    const locked = normalizeText(lockedContractCode);
    if (!locked) return;
    setContractFilter(locked);
    setOsFilter('Todas');
  }, [lockedContractCode]);

  const tree = useMemo(
    () => buildTree(rows, contractFilter, osFilter),
    [rows, contractFilter, osFilter],
  );

  const expandedDefaults = useMemo(() => new Set(tree.map((node) => node.code)), [tree]);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  useEffect(() => {
    setExpandedRows(expandedDefaults);
  }, [expandedDefaults]);

  const toggleRow = (code: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  };

  const dateSummary = useMemo(() => {
    const dates = rows
      .flatMap((row) => [parseDate(row.plannedStart), parseDate(row.plannedEnd)])
      .filter((date): date is Date => Boolean(date && !Number.isNaN(date.getTime())));

    if (!dates.length) return '-';

    const start = new Date(Math.min(...dates.map((date) => date.getTime())));
    const end = new Date(Math.max(...dates.map((date) => date.getTime())));
    return `${start.toLocaleDateString('pt-BR')} ate ${end.toLocaleDateString('pt-BR')}`;
  }, [rows]);

  const planningDateSummary = useMemo(() => {
    if (!isPlanningMode) return dateSummary;

    const dates = planningRows
      .flatMap((row) => [parseDate(row.plannedStart), parseDate(row.plannedEnd)])
      .filter((date): date is Date => Boolean(date && !Number.isNaN(date.getTime())));

    if (!dates.length) return dateSummary;

    const start = new Date(Math.min(...dates.map((date) => date.getTime())));
    const end = new Date(Math.max(...dates.map((date) => date.getTime())));
    return `${start.toLocaleDateString('pt-BR')} ate ${end.toLocaleDateString('pt-BR')}`;
  }, [dateSummary, isPlanningMode, planningRows]);

  const planningVisibleRows = useMemo(() => {
    if (!isPlanningMode || !showInProgressActivities) return [];

    return planningRows
      .filter((row) => {
        const contractMatch = contractFilter === 'Todos' || normalizeKey(row.contratoCodigo) === normalizeKey(contractFilter);
        const osMatch = osFilter === 'Todas' || normalizeKey(row.osCodigo) === normalizeKey(osFilter);
        const progressMatch = row.hasTechnicalActivity && row.activityStatus !== 'concluida';
        return contractMatch && osMatch && progressMatch;
      })
      .sort((a, b) => {
        const contractDiff = a.contratoCodigo.localeCompare(b.contratoCodigo, 'pt-BR');
        if (contractDiff !== 0) return contractDiff;
        const osDiff = a.osCodigo.localeCompare(b.osCodigo, 'pt-BR');
        if (osDiff !== 0) return osDiff;
        return a.itemCodigo.localeCompare(b.itemCodigo, 'pt-BR');
      });
  }, [contractFilter, isPlanningMode, osFilter, planningRows, showInProgressActivities]);

  const togglePlannerApproval = (row: PlanningReviewRow) => {
    setApprovalDrafts((prev) => {
      const current = prev[row.id] ?? row.approved;
      if (current) return prev;
      const nextState = { ...prev };
      nextState[row.id] = true;
      return nextState;
    });
    setSavingMessage('');
  };

  const handlePlannerSend = async () => {
    if (!isPlanningMode || !onPlannerApprovalSubmit) return;
    if (!isFirebaseConfigured()) {
      setSavingMessage('Firebase nao configurado para salvar o cronograma de aprovacao.');
      return;
    }

    const changedRows = planningRows
      .filter((row) => approvalDrafts[row.id] && !row.approved)
      .map((row) => ({
        ...row,
        approved: true,
      }));

    if (!changedRows.length) {
      setSavingMessage('Nenhuma aprovacao pendente para enviar.');
      return;
    }

    setIsSaving(true);
    setSavingMessage('');
    try {
      const approverName = normalizeText(currentUser?.nome || currentUser?.email || 'Planejamento');
      const approverLabel = approverName || 'Planejamento';
      for (const row of changedRows) {
        await setFirebaseDocument('planningTodos', row.id, serializePlanningReviewRow({
          ...row,
          plannerApprovedBy: row.approved ? approverLabel : '',
          plannerApprovedAt: row.approved ? new Date().toISOString() : '',
        }));
      }

      const approvedRows = changedRows.map((row) => ({
        id: row.id,
        itemCodigo: row.itemCodigo,
        itemNome: row.itemNome,
        progress: row.technicalProgress,
        approved: row.approved,
      }));

      if (approvedRows.length > 0) {
        await onPlannerApprovalSubmit(approvedRows);
      }

      setApprovalDrafts({});
      setSavingMessage('Aprovacoes enviadas com sucesso.');
    } catch (error) {
      console.error('Erro ao salvar o cronograma de aprovacao:', error);
      setSavingMessage('Nao foi possivel enviar as informacoes do cronograma.');
    } finally {
      setIsSaving(false);
    }
  };

  const renderStandardCronograma = (title: string, description: string, includePlanningToggle = false) => (
    <div className="w-full animate-in fade-in duration-500 space-y-6">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <CalendarDays size={22} className="text-[#F05D28]" />
          <h1 className="text-[20px] font-bold text-[#2D2D2D]">{title}</h1>
        </div>
        <p className="text-[13px] text-[#757575]">{description}</p>
      </div>

      <section className="bg-white border border-[#E5E7EB] rounded-2xl shadow-sm p-5">
        <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-4 items-end">
          <div>
            <label className="text-[11px] font-medium text-[#757575] uppercase tracking-[1px]">Contrato</label>
            <div className="relative mt-1.5">
              <select
                value={contractFilter}
                disabled={Boolean(normalizeText(lockedContractCode))}
                onChange={(event) => {
                  setContractFilter(event.target.value);
                  setOsFilter('Todas');
                }}
                className="w-full h-11 px-4 bg-white border border-[#E5E7EB] rounded-xl text-[14px] font-medium text-[#2D2D2D] appearance-none focus:border-[#F05D28] focus:ring-2 focus:ring-[#F05D28]/20 outline-none"
              >
                {!normalizeText(lockedContractCode) && <option value="Todos">Todos</option>}
                {contracts.map((contract) => (
                  <option key={contract.code} value={contract.code}>
                    {contract.code} - {contract.name}
                  </option>
                ))}
              </select>
              <ChevronDown size={18} className="absolute right-4 top-1/2 -translate-y-1/2 text-[#757575] pointer-events-none" />
            </div>
          </div>

          <div>
            <label className="text-[11px] font-medium text-[#757575] uppercase tracking-[1px]">OS</label>
            <div className="relative mt-1.5">
              <select
                value={osFilter}
                onChange={(event) => setOsFilter(event.target.value)}
                className="w-full h-11 px-4 bg-white border border-[#E5E7EB] rounded-xl text-[14px] font-medium text-[#2D2D2D] appearance-none focus:border-[#F05D28] focus:ring-2 focus:ring-[#F05D28]/20 outline-none"
              >
                <option value="Todas">Todas</option>
                {osOptions
                  .filter((os) => contractFilter === 'Todos' || os.contractCode === contractFilter)
                  .map((os) => (
                    <option key={os.code} value={os.code}>
                      {os.code} - {os.name}
                    </option>
                  ))}
              </select>
              <ChevronDown size={18} className="absolute right-4 top-1/2 -translate-y-1/2 text-[#757575] pointer-events-none" />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            {includePlanningToggle ? (
              <label className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[1px] text-[#757575]">
                <input
                  type="checkbox"
                  checked={showInProgressActivities}
                  onChange={(event) => setShowInProgressActivities(event.target.checked)}
                  className="h-4 w-4 rounded border-[#CBD5E1] text-[#F05D28] accent-[#F05D28]"
                />
                Modo atividades em andamento
              </label>
            ) : null}
            <div className="h-11 px-4 rounded-xl bg-[#F9FAFB] border border-[#E5E7EB] flex items-center gap-2 text-[13px] font-bold text-[#2D2D2D]">
              <Filter size={16} className="text-[#F05D28]" />
              {rows.length} item(ns)
            </div>
          </div>
        </div>
      </section>

      <section className="bg-white border border-[#E5E7EB] rounded-2xl shadow-sm overflow-hidden">
        <div className="flex items-center justify-between gap-4 border-b border-[#E5E7EB] bg-[#F9FAFB] px-5 py-3">
          <p className="text-[11px] font-bold uppercase tracking-[1px] text-[#757575]">Cronograma</p>
          <p className="text-[11px] font-bold uppercase tracking-[1px] text-[#757575]">{dateSummary}</p>
        </div>

        <div className="max-h-[680px] overflow-auto">
          {tree.length === 0 ? (
            <div className="p-8 text-[13px] text-[#757575]">Nenhuma atividade encontrada no recorte atual.</div>
          ) : (
            tree.map((node) => (
              <TreeRow
                key={node.code}
                node={node}
                level={0}
                expandedRows={expandedRows}
                onToggle={toggleRow}
              />
            ))
          )}
        </div>
      </section>
    </div>
  );

  if (isPlanningMode) {
    const pendingCount = Object.keys(approvalDrafts).length;
    const progressRowsCount = planningVisibleRows.length;

    if (!showInProgressActivities) {
      return renderStandardCronograma(
        'Cronograma de Planejamento',
        'Sem o modo atividades em andamento, o cronograma se comporta como os demais.',
        true,
      );
    }

    return (
      <div className="w-full animate-in fade-in duration-500 space-y-6">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-3">
            <CalendarDays size={22} className="text-[#F05D28]" />
            <h1 className="text-[20px] font-bold text-[#2D2D2D]">Cronograma de Planejamento</h1>
          </div>
          <p className="text-[13px] text-[#757575]">
            As barras azuis mostram todas as atividades em andamento registradas pela Area Tecnica. Marque o check para aprovar a porcentagem e enviar a atualizacao.
          </p>
        </div>

        <section className="bg-white border border-[#E5E7EB] rounded-2xl shadow-sm p-5">
          <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-4 items-end">
            <div>
              <label className="text-[11px] font-medium text-[#757575] uppercase tracking-[1px]">Contrato</label>
              <div className="relative mt-1.5">
                <select
                  value={contractFilter}
                  disabled={Boolean(normalizeText(lockedContractCode))}
                  onChange={(event) => {
                    setContractFilter(event.target.value);
                    setOsFilter('Todas');
                  }}
                  className="w-full h-11 px-4 bg-white border border-[#E5E7EB] rounded-xl text-[14px] font-medium text-[#2D2D2D] appearance-none focus:border-[#F05D28] focus:ring-2 focus:ring-[#F05D28]/20 outline-none"
                >
                  {!normalizeText(lockedContractCode) && <option value="Todos">Todos</option>}
                  {contracts.map((contract) => (
                    <option key={contract.code} value={contract.code}>
                      {contract.code} - {contract.name}
                    </option>
                  ))}
                </select>
                <ChevronDown size={18} className="absolute right-4 top-1/2 -translate-y-1/2 text-[#757575] pointer-events-none" />
              </div>
            </div>

            <div>
              <label className="text-[11px] font-medium text-[#757575] uppercase tracking-[1px]">OS</label>
              <div className="relative mt-1.5">
                <select
                  value={osFilter}
                  onChange={(event) => setOsFilter(event.target.value)}
                  className="w-full h-11 px-4 bg-white border border-[#E5E7EB] rounded-xl text-[14px] font-medium text-[#2D2D2D] appearance-none focus:border-[#F05D28] focus:ring-2 focus:ring-[#F05D28]/20 outline-none"
                >
                  <option value="Todas">Todas</option>
                  {osOptions
                    .filter((os) => contractFilter === 'Todos' || os.contractCode === contractFilter)
                    .map((os) => (
                      <option key={os.code} value={os.code}>
                        {os.code} - {os.name}
                      </option>
                    ))}
                </select>
                <ChevronDown size={18} className="absolute right-4 top-1/2 -translate-y-1/2 text-[#757575] pointer-events-none" />
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <label className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[1px] text-[#757575]">
                <input
                  type="checkbox"
                  checked={showInProgressActivities}
                  onChange={(event) => setShowInProgressActivities(event.target.checked)}
                  className="h-4 w-4 rounded border-[#CBD5E1] text-[#F05D28] accent-[#F05D28]"
                />
                Modo atividades em andamento
              </label>
              <div className="h-11 px-4 rounded-xl bg-[#F9FAFB] border border-[#E5E7EB] flex items-center gap-2 text-[13px] font-bold text-[#2D2D2D]">
                <Filter size={16} className="text-[#F05D28]" />
                {progressRowsCount} item(ns)
              </div>
            </div>
          </div>
        </section>

        <section className="bg-white border border-[#E5E7EB] rounded-2xl shadow-sm overflow-hidden">
          <div className="flex items-center justify-between gap-4 border-b border-[#E5E7EB] bg-[#F9FAFB] px-5 py-3">
            <p className="text-[11px] font-bold uppercase tracking-[1px] text-[#757575]">Atividades em andamento</p>
            <p className="text-[11px] font-bold uppercase tracking-[1px] text-[#757575]">{planningDateSummary}</p>
          </div>

          <div className="max-h-[680px] overflow-auto divide-y divide-[#F3F4F6]">
            {planningVisibleRows.length === 0 ? (
              <div className="p-8 text-[13px] text-[#757575]">Nenhuma atividade em andamento no recorte atual.</div>
            ) : (
              planningVisibleRows.map((row) => {
                const approved = approvalDrafts[row.id] ?? row.approved;
                return (
                  <div key={row.id} className="grid grid-cols-1 gap-4 px-5 py-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(260px,0.75fr)_auto] lg:items-center">
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-bold text-[#2D2D2D]">
                        {row.itemCodigo} - {row.itemNome}
                      </p>
                      <p className="mt-1 text-[11px] text-[#757575]">
                        {row.contratoCodigo || 'Sem contrato'}{row.osCodigo ? ` · ${row.osCodigo}` : ''}{row.disciplina ? ` · ${row.disciplina}` : ''}
                      </p>
                      <div className="mt-3">
                        <BlueProgressBar progress={row.technicalProgress} />
                      </div>
                      <p className="mt-2 text-[11px] font-medium text-[#94A3B8]">
                        {approved ? 'Aprovado para atualizacao da EAP' : 'Aguardando aprovacao do Planejamento'}
                      </p>
                    </div>

                    <div className="rounded-2xl border border-[#E5E7EB] bg-[#F8FAFC] px-4 py-3">
                      <p className="text-[10px] font-black uppercase tracking-[0.8px] text-[#94A3B8]">Detalhes</p>
                      <div className="mt-2 grid grid-cols-2 gap-2 text-[12px] font-bold text-[#2D2D2D]">
                        <span>OS</span>
                        <span className="text-right text-[#64748B]">{row.osCodigo || '-'}</span>
                        <span>Disciplina</span>
                        <span className="text-right text-[#64748B]">{row.disciplina || '-'}</span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => togglePlannerApproval(row)}
                      disabled={approved}
                      className={`inline-flex h-12 items-center justify-center gap-2 rounded-2xl border px-4 text-[13px] font-bold transition-all ${
                        approved
                          ? 'cursor-default border-[#BBF7D0] bg-[#F0FDF4] text-[#166534]'
                          : 'border-[#E5E7EB] bg-white text-[#64748B] hover:border-[#CBD5E1]'
                      }`}
                    >
                      <span className="text-[16px]">{approved ? '✓' : '○'}</span>
                      {approved ? 'Aprovado' : 'Aprovar'}
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </section>

        {savingMessage && (
          <div className="rounded-2xl border border-[#E5E7EB] bg-white px-4 py-3 text-[13px] font-medium text-[#64748B] shadow-sm">
            {savingMessage}
          </div>
        )}

        {(Object.keys(approvalDrafts).length > 0 || pendingCount > 0) && (
          <div className="fixed bottom-6 right-6 z-[90] flex items-center gap-3 rounded-2xl border border-[#FED7AA] bg-white px-4 py-3 shadow-[0_18px_50px_rgba(240,93,40,0.18)]">
            <div>
              <div className="text-[11px] font-black uppercase tracking-[1px] text-[#C2410C]">Cronograma</div>
              <div className="text-[13px] font-semibold text-[#9A3412]">
                {Object.keys(approvalDrafts).length} aprovacao(oes) pronta(s) para envio
              </div>
            </div>
            <button
              type="button"
              onClick={() => void handlePlannerSend()}
              disabled={isSaving}
              className="inline-flex h-14 items-center justify-center gap-2 rounded-2xl bg-[#F05D28] px-6 font-bold text-white shadow-xl shadow-[#F05D28]/25 transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-70"
            >
              {isSaving ? 'Enviando...' : 'Enviar informacoes'}
            </button>
          </div>
        )}
      </div>
    );
  }

  return renderStandardCronograma(
    'Cronograma de Engenharia',
    'Visual em cascata com expansao por nivel. O cronograma agora mostra somente a hierarquia e as barras de progresso.',
  );
}
