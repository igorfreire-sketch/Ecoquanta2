import React from 'react';
import { AlertTriangle, ChevronDown, ChevronUp, ClipboardList, FileWarning, ListChecks, TimerReset } from 'lucide-react';

const CONTRACT_PRIORITY_STORAGE_KEY = 'quanta_contract_priorities';
const CONTRACT_INTERFERENCES_STORAGE_KEY = 'quanta_contract_interferences';
const PLANNING_TODOS_STORAGE_KEY = 'quanta_planejamento_tecnico_itens';

type AlertasProps = {
  preloadedData?: {
    registro?: any;
    admin?: any;
  };
  activeContractCode?: string;
};

type AlertActivity = {
  id: string;
  contratoCodigo: string;
  contratoNome: string;
  osCodigo: string;
  osNome: string;
  itemCodigo: string;
  itemNome: string;
  descricao: string;
  disciplina: string;
  avaliacao: string;
  avancoAtual: number;
  profissionais: string[];
  status: string;
};

type StoredInterference = {
  id: string;
  nome: string;
  data: string;
  observacao: string;
  osImpactada: string;
  contratoCodigo?: string;
  contratoNome?: string;
};

type PlannedItem = {
  id: string;
  contratoCodigo: string;
  contratoNome: string;
  osCodigo: string;
  osNome: string;
  disciplina: string;
  titulo: string;
  descricao: string;
  createdAt: string;
};

function normalizeText(value?: string) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
}

function isAllContract(value?: string) {
  const normalized = normalizeText(value);
  return !normalized || normalized === 'todos' || normalized === 'todos os contratos';
}

function readStoredPriorities() {
  try {
    const raw = localStorage.getItem(CONTRACT_PRIORITY_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return {
      values: parsed?.values && typeof parsed.values === 'object' ? parsed.values as Record<string, string> : {},
      confirmed: parsed?.confirmed && typeof parsed.confirmed === 'object' ? parsed.confirmed as Record<string, boolean> : {},
    };
  } catch {
    return { values: {}, confirmed: {} };
  }
}

function readStoredInterferencias() {
  try {
    const raw = localStorage.getItem(CONTRACT_INTERFERENCES_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed as StoredInterference[] : [];
  } catch {
    return [];
  }
}

function readPlannedItems() {
  try {
    const raw = localStorage.getItem(PLANNING_TODOS_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed as PlannedItem[] : [];
  } catch {
    return [];
  }
}

function getSourceActivities(registro: any) {
  const activitiesList = Array.isArray(registro?.activitiesList) ? registro.activitiesList : [];
  const activeActivities = Array.isArray(registro?.activeActivities) ? registro.activeActivities : [];
  const completedActivities = Array.isArray(registro?.completedActivities) ? registro.completedActivities : [];
  return activitiesList.length > 0 ? activitiesList : [...activeActivities, ...completedActivities];
}

function buildActivities(registro: any): AlertActivity[] {
  const activities = getSourceActivities(registro);
  const seen = new Set<string>();

  return activities
    .map((item: any, index: number) => {
      const id = String(item?.activityId || item?.id || `${item?.itemCodigo || 'atividade'}-${index}`).trim();
      const profissionais = Array.isArray(item?.profissionais)
        ? item.profissionais.map((entry: any) => String(entry || '').trim()).filter(Boolean)
        : String(item?.profissionais || '').split(' | ').map((entry) => entry.trim()).filter(Boolean);

      return {
        id,
        contratoCodigo: String(item?.contratoCodigo || '').trim(),
        contratoNome: String(item?.contratoNome || item?.contrato || item?.contratoCodigo || '').trim(),
        osCodigo: String(item?.osCodigo || '').trim(),
        osNome: String(item?.osNome || item?.os || item?.osCodigo || '').trim(),
        itemCodigo: String(item?.itemCodigo || '').trim(),
        itemNome: String(item?.itemNome || item?.descricao || item?.itemCodigo || '').trim(),
        descricao: String(item?.descricao || '').trim(),
        disciplina: String(item?.criadoPorDisciplina || item?.disciplina || '').trim(),
        avaliacao: String(item?.avaliacaoAtual || item?.avaliacao || '').trim(),
        avancoAtual: Number(item?.avancoAtual || 0),
        profissionais,
        status: String(item?.status || '').trim(),
      };
    })
    .filter((item) => {
      if (!item.id || seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });
}

function filterByContract<T extends { contratoCodigo?: string }>(list: T[], contractCode?: string) {
  if (isAllContract(contractCode)) return list;
  const target = normalizeText(contractCode);
  return list.filter((item) => normalizeText(item.contratoCodigo) === target);
}

function AccordionSection({
  title,
  count,
  icon,
  children,
}: {
  title: string;
  count: number;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);

  return (
    <section className="rounded-2xl border border-[#E5E7EB] bg-white shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition hover:bg-[#F8F9FA]"
      >
        <span className="flex items-center gap-3">
          <span className="text-[#F05D28]">{icon}</span>
          <span className="text-[14px] font-black text-[#2D2D2D]">{title}</span>
          <span className="inline-flex min-w-[26px] items-center justify-center rounded-full bg-[#F05D28]/10 px-2.5 py-1 text-[11px] font-black text-[#F05D28]">
            {count}
          </span>
        </span>
        {open ? <ChevronUp size={18} className="text-[#F05D28]" /> : <ChevronDown size={18} className="text-[#757575]" />}
      </button>
      {open && <div className="border-t border-[#E5E7EB] p-4 sm:p-5">{children}</div>}
    </section>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-[#CBD5E1] bg-[#F8FAFC] p-6 text-[13px] font-medium text-[#64748B]">
      {text}
    </div>
  );
}

export default function Alertas({ preloadedData, activeContractCode }: AlertasProps) {
  const activities = React.useMemo(() => buildActivities(preloadedData?.registro), [preloadedData?.registro]);
  const criticalActivities = React.useMemo(
    () => filterByContract(
      activities.filter((item) => {
        const avaliacao = normalizeText(item.avaliacao);
        return avaliacao === normalizeText('Pior que o esperado') || avaliacao === normalizeText('Problema/Bloqueio');
      }),
      activeContractCode
    ),
    [activities, activeContractCode]
  );

  const storedPriorities = React.useMemo(() => readStoredPriorities(), []);
  const priorityActivities = React.useMemo(() => {
    const confirmedIds = new Set(
      Object.entries(storedPriorities.confirmed)
        .filter(([, confirmed]) => Boolean(confirmed))
        .map(([id]) => id)
    );
    return filterByContract(
      activities
        .filter((item) => confirmedIds.has(item.id))
        .sort((a, b) => Number(storedPriorities.values[b.id] || 1) - Number(storedPriorities.values[a.id] || 1)),
      activeContractCode
    );
  }, [activities, activeContractCode, storedPriorities]);

  const interferencias = React.useMemo(
    () => filterByContract(readStoredInterferencias(), activeContractCode).sort((a, b) => String(b.data || '').localeCompare(String(a.data || ''))),
    [activeContractCode]
  );

  const planningTodos = React.useMemo(() => filterByContract(readPlannedItems(), activeContractCode), [activeContractCode]);
  const pendingPlanningItems = React.useMemo(() => {
    return planningTodos.filter((todo) => {
      return !activities.some((activity) => (
        normalizeText(activity.contratoCodigo) === normalizeText(todo.contratoCodigo)
        && normalizeText(activity.osCodigo) === normalizeText(todo.osCodigo)
        && normalizeText(activity.disciplina) === normalizeText(todo.disciplina)
      ));
    });
  }, [planningTodos, activities]);

  return (
    <div className="space-y-6 font-['Montserrat']">
      <AccordionSection title="Atividades com alerta de execução" count={criticalActivities.length} icon={<AlertTriangle size={18} />}>
        <div className="space-y-3">
          {criticalActivities.length === 0 && <EmptyState text="Nenhuma atividade marcada como Pior que o esperado ou Problema/Bloqueio." />}
          {criticalActivities.map((item) => (
            <div key={item.id} className="rounded-2xl border border-[#FECACA] bg-[#FEF2F2] p-4">
              <div className="text-[12px] font-black uppercase tracking-[1px] text-[#B91C1C]">{item.avaliacao}</div>
              <div className="mt-1 text-[15px] font-black text-[#111827]">{item.itemNome}</div>
              <div className="mt-1 text-[12px] font-semibold text-[#64748B]">{item.contratoCodigo} · {item.osNome || item.osCodigo} · {item.disciplina || 'Sem disciplina'}</div>
              {item.descricao && <p className="mt-2 text-[13px] text-[#4B5563]">{item.descricao}</p>}
            </div>
          ))}
        </div>
      </AccordionSection>

      <AccordionSection title="Atividades marcadas como prioridade pelo contrato" count={priorityActivities.length} icon={<ClipboardList size={18} />}>
        <div className="space-y-3">
          {priorityActivities.length === 0 && <EmptyState text="Nenhuma atividade foi marcada como prioridade pelo contrato ainda." />}
          {priorityActivities.map((item) => (
            <div key={item.id} className="rounded-2xl border border-[#FED7AA] bg-[#FFF7ED] p-4">
              <div className="text-[12px] font-black uppercase tracking-[1px] text-[#C2410C]">Prioridade {storedPriorities.values[item.id] || '1'}</div>
              <div className="mt-1 text-[15px] font-black text-[#111827]">{item.itemNome}</div>
              <div className="mt-1 text-[12px] font-semibold text-[#64748B]">{item.contratoCodigo} · {item.osNome || item.osCodigo} · {item.disciplina || 'Sem disciplina'}</div>
            </div>
          ))}
        </div>
      </AccordionSection>

      <AccordionSection title="Interferencias feitas pelo contrato" count={interferencias.length} icon={<FileWarning size={18} />}>
        <div className="space-y-3">
          {interferencias.length === 0 && <EmptyState text="Nenhuma interferencia registrada para este recorte de contrato." />}
          {interferencias.map((item) => (
            <div key={item.id} className="rounded-2xl border border-[#E5E7EB] bg-[#F8FAFC] p-4">
              <div className="text-[14px] font-black text-[#111827]">{item.nome}</div>
              <div className="mt-1 text-[12px] font-semibold text-[#64748B]">{item.contratoCodigo || item.contratoNome || 'Sem contrato'} · OS {item.osImpactada} · {item.data || 'Sem data'}</div>
              <p className="mt-2 text-[13px] text-[#4B5563]">{item.observacao}</p>
            </div>
          ))}
        </div>
      </AccordionSection>

      <AccordionSection title="Atividades do planejamento ainda nao iniciadas" count={pendingPlanningItems.length} icon={<TimerReset size={18} />}>
        <div className="space-y-3">
          {pendingPlanningItems.length === 0 && <EmptyState text="Todos os itens do Planejamento Tecnico desse recorte ja foram iniciados pelas disciplinas." />}
          {pendingPlanningItems.map((item) => (
            <div key={item.id} className="rounded-2xl border border-[#BFDBFE] bg-[#EFF6FF] p-4">
              <div className="text-[12px] font-black uppercase tracking-[1px] text-[#1D4ED8]">{item.disciplina}</div>
              <div className="mt-1 text-[15px] font-black text-[#111827]">{item.titulo}</div>
              <div className="mt-1 text-[12px] font-semibold text-[#64748B]">{item.contratoCodigo} · {item.osNome || item.osCodigo}</div>
              {item.descricao && <p className="mt-2 text-[13px] text-[#4B5563]">{item.descricao}</p>}
            </div>
          ))}
        </div>
      </AccordionSection>
    </div>
  );
}
