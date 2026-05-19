import React from 'react';
import { AlertTriangle, Check, ChevronDown, ChevronUp, ClipboardList, FileWarning, Save, TimerReset } from 'lucide-react';
import type { AuthUser } from '../LoginScreen';
import { isFirebaseConfigured, setFirebaseDocument, updateFirebaseRegistroActivity } from '../../lib/firebaseDb';

type AlertasProps = {
  currentUser: AuthUser;
  preloadedData?: {
    registro?: any;
    admin?: any;
    planningTodos?: PlannedItem[];
    contractPriorities?: Array<{ id: string; activityId: string; monthlyCycle?: string; licitatoria?: boolean }>;
    contractInterferences?: StoredInterference[];
    resolvedAlerts?: Array<{ id: string; activityId: string; signature: string }>;
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
  ultimaAtualizacao: string;
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

function readStoredPriorities(records?: AlertasProps['preloadedData']['contractPriorities']) {
  const values: Record<string, string> = {};
  const confirmed: Record<string, boolean> = {};

  (Array.isArray(records) ? records : []).forEach((record) => {
    const id = String(record?.activityId || record?.id || '').trim();
    if (!id) return;
    if (record?.licitatoria) values[id] = '3';
    else if (record?.monthlyCycle) values[id] = '2';
    confirmed[id] = Boolean(record?.licitatoria || record?.monthlyCycle);
  });

  return { values, confirmed };
}

function readStoredInterferencias(items?: StoredInterference[]) {
  return Array.isArray(items) ? items : [];
}

function readPlannedItems(items?: PlannedItem[]) {
  return Array.isArray(items) ? items : [];
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
        ultimaAtualizacao: String(item?.ultimaAtualizacao || '').trim(),
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
  return list.filter((item: any) => (
    normalizeText(item.contratoCodigo) === target
    || normalizeText(item.contratoNome) === target
  ));
}

function buildActivityAlertSignature(activity: Pick<AlertActivity, 'id' | 'avaliacao' | 'ultimaAtualizacao'>) {
  return [
    String(activity.id || '').trim(),
    normalizeText(activity.avaliacao),
    String(activity.ultimaAtualizacao || '').trim(),
  ].join('|');
}

function nowPtBr() {
  return new Date().toLocaleString('pt-BR');
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

export default function Alertas({ currentUser: _currentUser, preloadedData, activeContractCode }: AlertasProps) {
  const [savingResolvedAlerts, setSavingResolvedAlerts] = React.useState(false);
  const [resolvedAlertSignatures, setResolvedAlertSignatures] = React.useState<string[]>(
    () => (Array.isArray(preloadedData?.resolvedAlerts) ? preloadedData.resolvedAlerts : []).map((item) => String(item.signature || '').trim()).filter(Boolean)
  );
  const [pendingResolvedAlerts, setPendingResolvedAlerts] = React.useState<Array<{ activityId: string; signature: string }>>([]);

  const activities = React.useMemo(() => buildActivities(preloadedData?.registro), [preloadedData?.registro]);

  const criticalActivitiesBase = React.useMemo(
    () => filterByContract(
      activities.filter((item) => {
        const avaliacao = normalizeText(item.avaliacao);
        return avaliacao === normalizeText('Pior que o esperado') || avaliacao === normalizeText('Problema/Bloqueio');
      }),
      activeContractCode
    ),
    [activities, activeContractCode]
  );

  React.useEffect(() => {
    if (!resolvedAlertSignatures.length) return;
    const activeSignatures = new Set(criticalActivitiesBase.map(buildActivityAlertSignature));
    setResolvedAlertSignatures((prev) => prev.filter((signature) => activeSignatures.has(signature)));
  }, [criticalActivitiesBase, resolvedAlertSignatures.length]);

  React.useEffect(() => {
    const activeSignatures = new Set(criticalActivitiesBase.map(buildActivityAlertSignature));
    setPendingResolvedAlerts((prev) => prev.filter((item) => activeSignatures.has(item.signature)));
  }, [criticalActivitiesBase]);

  const criticalActivities = React.useMemo(
    () => criticalActivitiesBase.filter((item) => {
      const signature = buildActivityAlertSignature(item);
      return !resolvedAlertSignatures.includes(signature)
        && !pendingResolvedAlerts.some((entry) => entry.signature === signature);
    }),
    [criticalActivitiesBase, pendingResolvedAlerts, resolvedAlertSignatures]
  );

  React.useEffect(() => {
    setResolvedAlertSignatures(
      (Array.isArray(preloadedData?.resolvedAlerts) ? preloadedData.resolvedAlerts : [])
        .map((item) => String(item.signature || '').trim())
        .filter(Boolean)
    );
  }, [preloadedData?.resolvedAlerts]);

  const storedPriorities = React.useMemo(() => readStoredPriorities(preloadedData?.contractPriorities), [preloadedData?.contractPriorities]);
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
    () => filterByContract(readStoredInterferencias(preloadedData?.contractInterferences), activeContractCode).sort((a, b) => String(b.data || '').localeCompare(String(a.data || ''))),
    [activeContractCode, preloadedData?.contractInterferences]
  );

  const planningTodos = React.useMemo(() => filterByContract(readPlannedItems(preloadedData?.planningTodos), activeContractCode), [activeContractCode, preloadedData?.planningTodos]);
  const pendingPlanningItems = React.useMemo(() => {
    return planningTodos.filter((todo) => {
      return !activities.some((activity) => (
        normalizeText(activity.contratoCodigo) === normalizeText(todo.contratoCodigo)
        && normalizeText(activity.osCodigo) === normalizeText(todo.osCodigo)
        && normalizeText(activity.disciplina) === normalizeText(todo.disciplina)
      ));
    });
  }, [planningTodos, activities]);

  const handleToggleResolveCriticalActivity = (activity: AlertActivity) => {
    const signature = buildActivityAlertSignature(activity);
    setPendingResolvedAlerts((prev) => {
      const exists = prev.some((item) => item.signature === signature);
      if (exists) return prev.filter((item) => item.signature !== signature);
      return [...prev, { activityId: activity.id, signature }];
    });
  };

  const handleSaveResolvedAlerts = async () => {
    if (!pendingResolvedAlerts.length || savingResolvedAlerts) return;
    try {
      setSavingResolvedAlerts(true);
      if (!isFirebaseConfigured()) {
        throw new Error('Firebase nao configurado para atualizar o alerta.');
      }

      for (const item of pendingResolvedAlerts) {
        await updateFirebaseRegistroActivity(item.activityId, {
          avaliacaoAtual: 'Dentro do esperado',
          ultimaAtualizacao: nowPtBr(),
        });
        await setFirebaseDocument('resolvedAlerts', item.signature, {
          id: item.signature,
          activityId: item.activityId,
          signature: item.signature,
          updatedAt: new Date().toISOString(),
        });
      }

      setResolvedAlertSignatures((prev) => [
        ...prev,
        ...pendingResolvedAlerts.map((item) => item.signature).filter((signature) => !prev.includes(signature)),
      ]);
      setPendingResolvedAlerts([]);
    } catch (error) {
      console.error('Erro ao enviar resolucao dos alertas:', error);
    } finally {
      setSavingResolvedAlerts(false);
    }
  };

  return (
    <div className="space-y-6 font-['Montserrat']">
      <AccordionSection title="Atividades com alerta de execucao" count={criticalActivities.length} icon={<AlertTriangle size={18} />}>
        <div className="space-y-3">
          {criticalActivities.length === 0 && <EmptyState text="Nenhuma atividade marcada como Pior que o esperado ou Problema/Bloqueio." />}
          {criticalActivities.map((item) => (
            <div key={item.id} className="rounded-2xl border border-[#FECACA] bg-[#FEF2F2] p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="text-[12px] font-black uppercase tracking-[1px] text-[#B91C1C]">{item.avaliacao}</div>
                <button
                  type="button"
                  onClick={() => handleToggleResolveCriticalActivity(item)}
                  className="inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-[#FCA5A5] bg-white px-3 text-[11px] font-black uppercase tracking-[1px] text-[#B91C1C] transition hover:bg-[#FEE2E2] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Check size={14} />
                  Resolvido
                </button>
              </div>
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

      {pendingResolvedAlerts.length > 0 && (
        <div className="fixed right-8 bottom-8 z-30 flex">
          <button
            type="button"
            onClick={() => void handleSaveResolvedAlerts()}
            disabled={savingResolvedAlerts}
            className="h-14 px-6 bg-[#F05D28] text-white rounded-2xl font-bold flex items-center justify-center gap-2 hover:opacity-90 active:scale-[0.98] transition-all shadow-xl shadow-[#F05D28]/25 disabled:opacity-70"
          >
            <Save size={18} />
            {savingResolvedAlerts ? 'Enviando...' : `Enviar informacoes (${pendingResolvedAlerts.length})`}
          </button>
        </div>
      )}
    </div>
  );
}
