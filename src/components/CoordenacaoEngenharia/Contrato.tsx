import React, { useDeferredValue, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Building2,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  FileWarning,
  GitBranch,
  MessageSquareText,
  PencilLine,
  Plus,
  Route,
  Search,
  X
} from 'lucide-react';

const CONTRACT_PRIORITY_STORAGE_KEY = 'quanta_contract_priorities';

interface ContratoProps {
  preloadedData?: {
    registro?: any;
    cronograma?: any;
  };
  activeContractCode?: string;
  lockedContractCode?: string;
}

interface ActivityRow {
  id: string;
  contratoCodigo: string;
  contratoNome: string;
  criadoPorNome: string;
  criadoPorDisciplina: string;
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
}

function readStoredPriorities() {
  try {
    const raw = localStorage.getItem(CONTRACT_PRIORITY_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return {
      values: parsed?.values && typeof parsed.values === 'object' ? parsed.values as Record<string, string> : {},
      confirmed: parsed?.confirmed && typeof parsed.confirmed === 'object' ? parsed.confirmed as Record<string, boolean> : {},
    };
  } catch (error) {
    return { values: {}, confirmed: {} };
  }
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

function isDateLikeLabel(value?: string) {
  const text = String(value || '').trim();
  return Boolean(
    text.match(/^\d{4}-\d{2}-\d{2}T.*Z$/i) ||
    text.match(/^\d{4}-\d{2}-\d{2}T/i) ||
    text.match(/^\d{1,2}\/\d{1,2}\/\d{2,4}/) ||
    text.match(/GMT|Hor.rio|Bras.lia/i)
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

function getActivityDisplayName(activity: ActivityRow) {
  if (activity.itemNome && !sameDisplayText(activity.itemNome, activity.osCodigo) && !sameDisplayText(activity.itemNome, activity.osNome)) return activity.itemNome;
  if (activity.descricao && !sameDisplayText(activity.descricao, activity.osCodigo) && !sameDisplayText(activity.descricao, activity.osNome)) return activity.descricao;
  if (activity.itemCodigo && !sameDisplayText(activity.itemCodigo, activity.osCodigo) && !sameDisplayText(activity.itemCodigo, activity.osNome)) return activity.itemCodigo;
  return 'Atividade sem nome';
}

function isOsLabel(value?: string) {
  const text = String(value || '').trim();
  return /^OS(?=$|[\s_\-.0-9A-Za-zÀ-ÿ])/i.test(text);
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

function buildActivities(preloadedData?: ContratoProps['preloadedData']): ActivityRow[] {
  const activitiesList = Array.isArray(preloadedData?.registro?.activitiesList) ? preloadedData.registro.activitiesList : [];
  const activeActivities = Array.isArray(preloadedData?.registro?.activeActivities) ? preloadedData.registro.activeActivities : [];
  const completedActivities = Array.isArray(preloadedData?.registro?.completedActivities) ? preloadedData.registro.completedActivities : [];
  const sourceActivities = activitiesList.length > 0
    ? activitiesList
    : [...activeActivities, ...completedActivities];
  const cronogramaByCode = getCronogramaMap(preloadedData?.cronograma);
  const seenIds = new Set<string>();

  return sourceActivities
    .filter((activity: any) => String(activity?.status || '').trim().toLowerCase() !== 'concluida')
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
        osCodigo: cleanDisplayLabel(activity?.osCodigo, activity?.osNome, 'Sem OS'),
        osNome: cleanDisplayLabel(activity?.osNome, activity?.contratoNome, ''),
        itemCodigo: cleanDisplayLabel(itemCodigo, activity?.itemNome, ''),
        itemNome: cleanDisplayLabel(activity?.itemNome, activity?.descricao, 'Atividade sem nome'),
        descricao: String(activity?.descricao || '').trim(),
        avancoAtual: Math.max(0, Math.min(100, Number(activity?.avancoAtual || 0))),
        dataFim: formatDateBR(cronograma?.plannedEnd || activity?.data100 || activity?.dataConclusaoEfetiva),
        status: String(activity?.status || '').trim()
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
        .filter((os: any) => !targetContract || normalizeText(os?.contratoCodigo) === targetContract)
        .filter((os: any) => isOsLabel(cleanDisplayLabel(os?.nome, os?.codigo, '')) || isOsLabel(cleanDisplayLabel(os?.codigo, os?.nome, '')))
        .map((os: any) => ({
          codigo: cleanDisplayLabel(os?.codigo, os?.nome, ''),
          nome: cleanDisplayLabel(os?.nome, os?.codigo, ''),
        }))
    : [];

  const osFromActivities = activities
    .filter((activity) => !targetContract || normalizeText(activity.contratoCodigo) === targetContract)
    .filter((activity) => isOsLabel(activity.osNome) || isOsLabel(activity.osCodigo))
    .map((activity) => ({
      codigo: cleanDisplayLabel(activity.osCodigo, activity.osNome, ''),
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

function ActivityJourney({ activity }: { activity: ActivityRow }) {
  return (
    <div className="border border-[#E5E7EB] bg-white rounded-[12px] p-6 shadow-sm">
      <div className="flex flex-col gap-1 mb-6">
        <p className="text-[11px] font-bold uppercase tracking-widest text-[#757575]">{activity.osCodigo}</p>
        <h3 className="text-[18px] font-bold text-[#2D2D2D] leading-tight">{activity.itemNome}</h3>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        {FLOW_STEPS.map((step, index) => {
          const Icon = step.icon;
          const done = activity.avancoAtual >= (index + 1) * 25;

          return (
            <div key={step.key} className="relative flex flex-col items-center text-center gap-3">
              {index < FLOW_STEPS.length - 1 && (
                <span className="hidden md:block absolute top-9 left-[calc(50%+36px)] right-[calc(-50%+36px)] border-t border-dashed border-[#CBD5E1]" />
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

export default function Contrato({ preloadedData, activeContractCode, lockedContractCode }: ContratoProps) {
  const activities = useMemo(() => buildActivities(preloadedData), [preloadedData]);
  const contracts = useMemo(() => getContracts(preloadedData, activities), [preloadedData, activities]);
  const [selectedContract, setSelectedContract] = useState(() => getContractInitialValue(activeContractCode, lockedContractCode));
  const [selectedActivityId, setSelectedActivityId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);
  const storedPriorities = readStoredPriorities();
  const [prioridades, setPrioridades] = useState<Record<string, string>>(storedPriorities.values);
  const [prioridadesConfirmadas, setPrioridadesConfirmadas] = useState<Record<string, boolean>>(storedPriorities.confirmed);
  const [observacoes, setObservacoes] = useState<Record<string, string>>({});
  const [showInterferenciaForm, setShowInterferenciaForm] = useState(false);
  const [interferencias, setInterferencias] = useState<Interferencia[]>([]);
  const [interferenciaDraft, setInterferenciaDraft] = useState({ nome: '', data: '', osImpactada: '', observacao: '' });

  React.useEffect(() => {
    setSelectedContract(getContractInitialValue(activeContractCode, lockedContractCode));
  }, [activeContractCode, lockedContractCode]);

  React.useEffect(() => {
    try {
      localStorage.setItem(CONTRACT_PRIORITY_STORAGE_KEY, JSON.stringify({
        values: prioridades,
        confirmed: prioridadesConfirmadas,
      }));
    } catch (error) {}
  }, [prioridades, prioridadesConfirmadas]);

  React.useEffect(() => {
    setPrioridades((prev) => {
      const next = { ...prev };
      activities.forEach((activity) => {
        if (!next[activity.id]) next[activity.id] = '1';
      });
      return next;
    });
  }, [activities]);

  const locked = Boolean(String(lockedContractCode || '').trim());

  const filteredActivities = useMemo(() => {
    const termo = normalizeText(deferredSearch);
    return activities.filter((activity) => {
      const matchContract = isAllContract(selectedContract) || normalizeText(activity.contratoCodigo) === normalizeText(selectedContract);
      const matchSearch = !termo || normalizeText(`${activity.osCodigo} ${activity.osNome} ${activity.itemNome}`).includes(termo);
      return matchContract && matchSearch;
    });
  }, [activities, deferredSearch, selectedContract]);

  const selectedActivity = filteredActivities.find((activity) => activity.id === selectedActivityId) || filteredActivities[0] || null;
  const osOptions = useMemo(() => getOsOptions(preloadedData, activities, selectedContract), [preloadedData, activities, selectedContract]);
  const observationMinLength = 35;
  const isInterferenciaValid =
    interferenciaDraft.nome.trim() &&
    interferenciaDraft.data &&
    interferenciaDraft.osImpactada &&
    interferenciaDraft.observacao.trim().length >= observationMinLength;

  const handleAddInterferencia = () => {
    if (!isInterferenciaValid) return;
    setInterferencias((prev) => [
      {
        id: `${Date.now()}-${interferenciaDraft.osImpactada}`,
        nome: interferenciaDraft.nome.trim(),
        data: interferenciaDraft.data,
        osImpactada: interferenciaDraft.osImpactada,
        observacao: interferenciaDraft.observacao.trim(),
      },
      ...prev,
    ]);
    setInterferenciaDraft({ nome: '', data: '', osImpactada: '', observacao: '' });
    setShowInterferenciaForm(false);
  };

  return (
    <div className="space-y-6 font-['Montserrat']">
      <section className="bg-white border border-[#E5E7EB] rounded-[12px] p-6 lg:p-7 shadow-sm">
        <div className="flex flex-col xl:flex-row xl:items-end xl:justify-between gap-5">
          <div>
            <h2 className="text-[22px] font-bold text-[#2D2D2D]">Contrato</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-[minmax(220px,280px)_minmax(240px,360px)_auto] gap-3 w-full xl:w-auto">
            <div>
              <label className="text-[10px] font-bold text-[#757575] uppercase tracking-widest">Contrato</label>
              <select
                value={selectedContract}
                disabled={locked}
                onChange={(event) => setSelectedContract(event.target.value)}
                className="mt-1 w-full h-11 px-3 bg-[#F8F9FA] border border-[#E5E7EB] rounded-xl text-[13px] font-bold text-[#2D2D2D] disabled:opacity-70 outline-none focus:border-[#F05D28]"
              >
                {!locked && <option value="Todos">Todos os contratos</option>}
                {contracts.map((contract) => (
                  <option key={contract.id} value={contract.id}>{contract.id} - {contract.nome}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-[10px] font-bold text-[#757575] uppercase tracking-widest">Pesquisar</label>
              <div className="relative mt-1">
                <Search size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#757575]" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  className="w-full h-11 pl-10 pr-3 bg-white border border-[#E5E7EB] rounded-xl text-[13px] font-medium outline-none focus:border-[#F05D28]"
                  placeholder="OS ou atividade"
                />
              </div>
            </div>

          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.25fr)_minmax(360px,0.75fr)] gap-6">
        <div className="bg-white border border-[#E5E7EB] rounded-[12px] shadow-sm overflow-hidden">
          <div className="px-6 py-5 border-b border-[#E5E7EB] flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <ClipboardList size={18} className="text-[#F05D28]" />
              <h3 className="text-[14px] font-bold text-[#2D2D2D] uppercase tracking-widest">Atividades sendo executadas</h3>
            </div>
            <span className="text-[11px] font-bold text-[#757575]">{filteredActivities.length} em execução</span>
          </div>

          <div className="divide-y divide-[#E5E7EB]">
            {filteredActivities.length === 0 && (
              <div className="py-12 px-6 text-center text-[13px] font-medium text-[#757575]">
                Nenhuma atividade em execução para este contrato.
              </div>
            )}

            {filteredActivities.map((activity) => (
              <button
                type="button"
                key={activity.id}
                onClick={() => setSelectedActivityId(activity.id)}
                className={`w-full text-left px-5 py-4 transition-colors ${selectedActivity?.id === activity.id ? 'bg-[#FFF7ED]' : 'hover:bg-[#F9FAFB]'}`}
              >
                <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.35fr)_120px_170px_130px] gap-4 items-center">
                  <div className="min-w-0">
                    <p className="text-[12px] font-bold text-[#2D2D2D] truncate">{activity.osCodigo}</p>
                    {activity.osNome && normalizeText(activity.osNome) !== normalizeText(activity.osCodigo) && (
                      <p className="text-[10px] text-[#757575] uppercase tracking-wider mt-1 truncate">{activity.osNome}</p>
                    )}
                    <p className="text-[13px] font-bold text-[#2D2D2D] truncate mt-2">{getActivityDisplayName(activity)}</p>
                    {activity.itemCodigo && !sameDisplayText(activity.itemCodigo, activity.osCodigo) && !sameDisplayText(activity.itemCodigo, activity.itemNome) && (
                      <p className="text-[11px] text-[#757575] mt-1 truncate">{activity.itemCodigo}</p>
                    )}
                  </div>

                  <div className="min-w-0">
                    <div className="h-2 rounded-full bg-[#F3F4F6] overflow-hidden">
                      <span className="block h-full bg-[#10B981]" style={{ width: `${activity.avancoAtual}%` }} />
                    </div>
                    <p className="text-[11px] font-bold text-[#2D2D2D] mt-1">{activity.avancoAtual}%</p>
                    {(activity.criadoPorNome || activity.criadoPorDisciplina) && (
                      <p className="text-[10px] font-semibold text-[#4B5563] mt-2 leading-tight">
                        {activity.criadoPorNome || 'Sem nome'}
                        {activity.criadoPorDisciplina ? (
                          <>
                            <br />
                            {activity.criadoPorDisciplina}
                          </>
                        ) : null}
                      </p>
                    )}
                  </div>

                  <div onClick={(event) => event.stopPropagation()} className="max-w-[170px]">
                  <label className="text-[9px] font-bold text-[#92400E] uppercase tracking-widest">Prioridade do contrato</label>
                  <div className={`mt-1.5 grid grid-cols-[minmax(0,1fr)_42px] gap-1.5 rounded-xl ${prioridadesConfirmadas[activity.id] ? '' : 'ring-2 ring-[#EF4444] ring-offset-2 animate-pulse'}`}>
                    <select
                      value={prioridades[activity.id] || '1'}
                      disabled={Boolean(prioridadesConfirmadas[activity.id])}
                      onChange={(event) => setPrioridades((prev) => ({ ...prev, [activity.id]: event.target.value }))}
                      className="w-full min-w-0 h-10 rounded-xl border border-[#FDE68A] bg-[#FEF3C7] px-2 text-[11px] font-bold text-[#92400E] outline-none disabled:opacity-80"
                    >
                      <option value="1">1 - Baixa</option>
                      <option value="2">2 - Media</option>
                      <option value="3">3 - Alta</option>
                    </select>
                    <button
                      type="button"
                      disabled={Boolean(prioridadesConfirmadas[activity.id])}
                      onClick={() => {
                        setPrioridades((prev) => ({ ...prev, [activity.id]: prev[activity.id] || '1' }));
                        setPrioridadesConfirmadas((prev) => ({ ...prev, [activity.id]: true }));
                      }}
                      className="h-10 rounded-xl bg-[#F05D28] text-white text-[10px] font-black uppercase tracking-wide hover:bg-[#D94E1F] disabled:bg-[#10B981] disabled:opacity-100"
                    >
                      OK
                    </button>
                  </div>
                </div>

                  <div className="inline-flex items-center gap-2 text-[12px] font-semibold text-[#757575]">
                    <CalendarDays size={15} />
                    {activity.dataFim}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-6">
          {selectedActivity && <ActivityJourney activity={selectedActivity} />}

          {selectedActivity && (
            <div className="bg-white border border-[#E5E7EB] rounded-[12px] p-5 shadow-sm">
              <label className="flex items-center gap-2 text-[11px] font-bold text-[#757575] uppercase tracking-widest">
                <MessageSquareText size={16} className="text-[#F05D28]" />
                Observacoes
              </label>
              <textarea
                value={observacoes[selectedActivity.id] || ''}
                onChange={(event) => setObservacoes((prev) => ({ ...prev, [selectedActivity.id]: event.target.value }))}
                className="mt-3 w-full min-h-[120px] resize-none rounded-xl border border-[#E5E7EB] bg-[#F8F9FA] p-4 text-[13px] font-medium text-[#2D2D2D] outline-none focus:border-[#F05D28]"
                placeholder="Observacoes da atividade"
              />
            </div>
          )}
        </div>
      </section>

      <section className="bg-white border border-[#E5E7EB] rounded-[12px] shadow-sm overflow-hidden">
        <div className="px-6 py-5 border-b border-[#E5E7EB] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-3">
            <FileWarning size={18} className="text-[#F05D28]" />
            <h3 className="text-[14px] font-bold text-[#2D2D2D] uppercase tracking-widest">Interferencias</h3>
          </div>
          <button
            type="button"
            onClick={() => setShowInterferenciaForm(true)}
            className="h-10 px-4 rounded-xl border border-[#F05D28] text-[#F05D28] text-[12px] font-bold inline-flex items-center justify-center gap-2 hover:bg-[#FFF7ED]"
          >
            <Plus size={15} />
            Nova interferencia
          </button>
        </div>

        <div className="p-5 grid grid-cols-1 lg:grid-cols-2 gap-4">
          {interferencias.length === 0 && (
            <div className="lg:col-span-2 py-8 text-center text-[13px] font-medium text-[#757575]">
              Nenhuma interferencia registrada nesta sessao.
            </div>
          )}

          {interferencias.map((item) => (
            <div key={item.id} className="rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] p-4">
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

      {showInterferenciaForm && (
        <div className="fixed inset-0 bg-black/30 z-[80] flex items-center justify-center p-4">
          <div className="w-full max-w-[620px] bg-white rounded-[12px] shadow-2xl border border-[#E5E7EB] overflow-hidden">
            <div className="px-6 py-5 border-b border-[#E5E7EB] flex items-center justify-between">
              <div className="flex items-center gap-3">
                <PencilLine size={18} className="text-[#F05D28]" />
                <h3 className="text-[15px] font-bold text-[#2D2D2D] uppercase tracking-widest">Interferencia</h3>
              </div>
              <button type="button" onClick={() => setShowInterferenciaForm(false)} className="p-2 rounded-lg text-[#757575] hover:bg-[#F3F4F6]">
                <X size={18} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-bold text-[#757575] uppercase tracking-widest">Nome da interferencia</label>
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
                <select
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
                </select>
              </div>

              <div>
                <label className="text-[10px] font-bold text-[#757575] uppercase tracking-widest">Observacao</label>
                <textarea
                  value={interferenciaDraft.observacao}
                  onChange={(event) => setInterferenciaDraft((prev) => ({ ...prev, observacao: event.target.value }))}
                  className="mt-1 w-full min-h-[130px] resize-none rounded-xl border border-[#E5E7EB] p-3 text-[13px] font-medium outline-none focus:border-[#F05D28]"
                  placeholder="Descreva a interferencia com pelo menos 35 caracteres"
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
    </div>
  );
}
