// CEPT | Acompanhamento de Entregas -- dashboard somente-leitura + validacao de alerta.
// Modelo/regras vivem em src/lib/ceptModel.ts (ADR docs/decisoes/0001-cept-acompanhamento-entregas-firestore.md);
// este arquivo so le, agrega pra tela e escreve a decisao de validacao.
import React from 'react';
import { serverTimestamp } from 'firebase/firestore';
import { AlertTriangle, ChevronRight, ClipboardCheck, Loader2, Search, Sparkles, Table2, X } from 'lucide-react';
import {
  PieChart, Pie, Cell, Label, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from 'recharts';
import type { AuthUser } from '../LoginScreen';
import {
  fetchFirebaseCollection,
  fetchFirebaseAppData,
  subscribeFirebaseCollection,
  subscribeFirebaseAppData,
  setFirebaseDocument,
  isFirebaseConfigured,
} from '../../lib/firebaseDb';
import {
  buildCeptModel,
  buildSignature,
  type CeptComponent,
  type CeptValidacao,
  type CeptResponsavel,
  type CeptAlertView,
  type CeptFamilyRollup,
} from '../../lib/ceptModel';
import { buildCeptDemoData, snapshotData, temSnapshotReal } from '../../lib/ceptDemoData';
import SearchableMultiSelect from '../SearchableMultiSelect';
import { projectCodes, projectNames, deliverableOrder } from '../../lib/ceptCatalog';
import { isNc2Leader } from '../NaoConformidade2/ncStore';

type CeptDashboardProps = {
  currentUser: AuthUser;
  osOptions?: Array<{ codigo?: string; nome?: string }>;
};

type DetailKind = 'all' | 'applicable' | 'delivered' | 'pending' | 'alerts' | 'red' | 'yellow' | 'green' | 'projects' | 'disciplines' | 'project' | 'discipline' | 'family' | 'responsible';

type DetailContext = {
  kind: DetailKind;
  title: string;
  value?: string;
  projectCode?: string;
  disciplineCode?: string;
};

type DetailQuickFilter = 'all' | 'delivered' | 'pending' | 'applicable' | 'red' | 'yellow' | 'green';

type DetailRecord = CeptComponent & {
  projectName: string;
  responsible: string;
  alertSeverity: 'red' | 'yellow' | 'green' | 'none';
  alertReasons: string[];
};

const PIE_COLORS = ['#557786', '#F05D28'];

function completionColor(percent: number) {
  if (percent < 40) return '#F05D28';
  if (percent < 75) return '#7D929C';
  return '#0F8B8D';
}

function familyOrderIndex(family: string) {
  const idx = deliverableOrder.indexOf(family as (typeof deliverableOrder)[number]);
  return idx === -1 ? deliverableOrder.length : idx;
}

function familyIcon(status: CeptFamilyRollup['status']) {
  if (status === 'delivered') return { icon: '✓', className: 'text-emerald-700 bg-emerald-50 border-emerald-200' };
  if (status === 'pending') return { icon: '●', className: 'text-amber-700 bg-amber-50 border-amber-200' };
  if (status === 'unknown') return { icon: '?', className: 'text-slate-500 bg-slate-50 border-slate-200' };
  return { icon: '—', className: 'text-slate-400 bg-slate-50 border-slate-200' };
}

function severityRing(severity: 'red' | 'yellow' | 'green') {
  if (severity === 'red') return 'ring-2 ring-[#EF4444]';
  if (severity === 'yellow') return 'ring-2 ring-[#F59E0B]';
  return 'ring-2 ring-emerald-500';
}

// Pior severidade primeiro -- vermelho > amarelo > verde -- pra pintar a borda do badge da familia.
function worstSeverity(alerts: CeptAlertView[]): 'red' | 'yellow' | 'green' | null {
  if (alerts.some((a) => a.displaySeverity === 'red')) return 'red';
  if (alerts.some((a) => a.displaySeverity === 'yellow')) return 'yellow';
  if (alerts.some((a) => a.displaySeverity === 'green')) return 'green';
  return null;
}

type KpiTone = 'orange' | 'teal' | 'amber' | 'red' | 'blue' | 'slate';

const KPI_TONES: Record<KpiTone, { bar: string; value: string; wash: string }> = {
  orange: { bar: 'bg-[#F05D28]', value: 'text-[#D94E1F]', wash: 'from-[#FFF7F2]' },
  teal: { bar: 'bg-[#0F8B8D]', value: 'text-[#0F7476]', wash: 'from-[#F0FAFA]' },
  amber: { bar: 'bg-[#E9A23B]', value: 'text-[#B86D0B]', wash: 'from-[#FFF9EE]' },
  red: { bar: 'bg-[#D94B4B]', value: 'text-[#B93838]', wash: 'from-[#FFF4F4]' },
  blue: { bar: 'bg-[#557786]', value: 'text-[#3F6372]', wash: 'from-[#F2F7F9]' },
  slate: { bar: 'bg-[#82909A]', value: 'text-[#58656E]', wash: 'from-[#F6F8F9]' },
};

function KpiCard({ label, value, sub, tone = 'slate', onClick }: { label: string; value: string; sub?: string; tone?: KpiTone; onClick?: () => void }) {
  const colors = KPI_TONES[tone];
  return (
    <button type="button" onClick={onClick} className={`group relative overflow-hidden rounded-[20px] border border-[#ECEFF1] bg-gradient-to-br ${colors.wash} to-white p-4 text-left shadow-[0_14px_34px_-30px_rgba(15,23,42,.55)] transition hover:-translate-y-0.5 hover:border-[#D9DEE1] hover:shadow-[0_18px_35px_-24px_rgba(15,23,42,.45)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F05D28]/40`}>
      <span className={`absolute inset-y-0 left-0 w-1 ${colors.bar}`} />
      <ChevronRight size={15} className="absolute right-3 top-3 text-[#AAB1B5] transition group-hover:translate-x-0.5 group-hover:text-[#F05D28]" />
      <p className="text-[10px] font-extrabold uppercase tracking-[1.35px] text-[#7C878E]">{label}</p>
      <p className={`mt-2 text-[28px] font-black leading-none ${colors.value}`}>{value}</p>
      {sub && <p className="mt-2 text-[11px] font-semibold text-[#757575]">{sub}</p>}
    </button>
  );
}

function AlertKpiCard({ red, yellow, green, onOpen, onSeverity }: { red: number; yellow: number; green: number; onOpen: () => void; onSeverity: (severity: 'red' | 'yellow' | 'green') => void }) {
  return (
    <div role="button" tabIndex={0} onClick={onOpen} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onOpen(); } }} className="group relative cursor-pointer overflow-hidden rounded-[20px] border border-[#ECEFF1] bg-gradient-to-br from-[#FFF9EE] to-white p-4 text-left shadow-[0_14px_34px_-30px_rgba(15,23,42,.55)] transition hover:-translate-y-0.5 hover:border-[#D9DEE1] hover:shadow-[0_18px_35px_-24px_rgba(15,23,42,.45)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F05D28]/40">
      <span className="absolute inset-y-0 left-0 w-1 bg-[#E9A23B]" />
      <ChevronRight size={15} className="absolute right-3 top-3 text-[#AAB1B5] transition group-hover:translate-x-0.5 group-hover:text-[#F05D28]" />
      <p className="text-[10px] font-extrabold uppercase tracking-[1.35px] text-[#7C878E]">Alertas</p>
      <p className="mt-2 text-[28px] font-black leading-none text-[#B86D0B]">{red + yellow}</p>
      <div className="mt-2 flex flex-wrap gap-x-2 gap-y-1 text-[9px] font-extrabold">
        <button type="button" onKeyDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); onSeverity('red'); }} className="text-red-700 underline decoration-dotted underline-offset-2">{red} vermelhos</button>
        <button type="button" onKeyDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); onSeverity('yellow'); }} className="text-amber-700 underline decoration-dotted underline-offset-2">{yellow} amarelos</button>
        <button type="button" onKeyDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); onSeverity('green'); }} className="text-emerald-700 underline decoration-dotted underline-offset-2">{green} validados</button>
      </div>
    </div>
  );
}

function ChartCard({ title, subtitle, children, className = '', onShowData }: { title: string; subtitle?: string; children: React.ReactNode; className?: string; onShowData?: () => void }) {
  return (
    <section className={`cept-chart-card rounded-[22px] border border-[#EAEEF0] bg-white p-5 shadow-[0_16px_38px_-30px_rgba(15,23,42,.5)] ${className}`}>
      <div className="relative z-10 mb-4 flex items-start justify-between gap-3 border-b border-[#F0F2F3] pb-3">
        <div>
          <h3 className="text-[13px] font-black text-[#2D2D2D]">{title}</h3>
          {subtitle && <p className="mt-1 text-[10px] font-semibold uppercase tracking-[.09em] text-[#98A1A7]">{subtitle}</p>}
        </div>
        {onShowData && <button type="button" onClick={onShowData} title="Ver dados do gráfico" className="rounded-lg border border-[#E7EBED] p-2 text-[#7C878E] outline-none transition hover:border-[#F05D28]/40 hover:bg-[#FFF7F2] hover:text-[#D94E1F] focus-visible:ring-2 focus-visible:ring-[#F05D28]/30"><Table2 size={15} /></button>}
      </div>
      <div className="cept-interactive-chart relative z-10 h-[270px] w-full cursor-pointer md:h-[300px]">{children}</div>
    </section>
  );
}

// Modo demo: ligado por `?ceptDemo=1` (na query OU depois do #) e GUARDADO na sessao.
// Sem guardar, o parametro se perde na primeira navegacao interna/F5 e a tela volta
// a tentar o Firestore -- que e exatamente o erro de permissao que estamos contornando.
const CHAVE_DEMO = 'cept-demo-mode';

function lerFlagDemo(): boolean {
  if (typeof window === 'undefined') return false;
  const naQuery = new URLSearchParams(window.location.search).get('ceptDemo');
  // No hash so interessa o que vem DEPOIS do '?': URLSearchParams('rota?ceptDemo=1')
  // leria "rota?ceptDemo" como nome da chave e devolveria null.
  const naHash = new URLSearchParams(window.location.hash.split('?')[1] || '').get('ceptDemo');
  const pedido = naQuery ?? naHash;
  try {
    if (pedido === '1') { window.sessionStorage.setItem(CHAVE_DEMO, '1'); return true; }
    if (pedido === '0') { window.sessionStorage.removeItem(CHAVE_DEMO); return false; }
    return window.sessionStorage.getItem(CHAVE_DEMO) === '1';
  } catch {
    // sessionStorage pode falhar (aba anonima, storage bloqueado): a URL ainda manda.
    return pedido === '1';
  }
}

const CEPT_DEMO = lerFlagDemo();

function ligarModoDemo(): void {
  try { window.sessionStorage.setItem(CHAVE_DEMO, '1'); } catch { /* cai na querystring abaixo */ }
  const url = new URL(window.location.href);
  url.searchParams.set('ceptDemo', '1');
  window.location.replace(url.toString());
}

// Mesma altura/borda dos outros filtros do app (ver NotesFilterBar).
const campoFiltro = 'w-full h-11 rounded-xl border border-[#E5E7EB] bg-white px-3 text-[12px] font-semibold text-[#2D2D2D] outline-none focus:border-[#F05D28]';

export default function CeptDashboard({ currentUser, osOptions = [] }: CeptDashboardProps) {
  const [components, setComponents] = React.useState<CeptComponent[]>([]);
  const [validations, setValidations] = React.useState<CeptValidacao[]>([]);
  const [responsaveis, setResponsaveis] = React.useState<Record<string, CeptResponsavel>>({});
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState('');

  const [selectedProjects, setSelectedProjects] = React.useState<string[]>([]);
  const [selectedDisciplines, setSelectedDisciplines] = React.useState<string[]>([]);
  const [selectedOsCode, setSelectedOsCode] = React.useState('');
  const [detail, setDetail] = React.useState<DetailContext | null>(null);
  const [detailSearch, setDetailSearch] = React.useState('');
  const [detailQuickFilter, setDetailQuickFilter] = React.useState<DetailQuickFilter>('all');
  const [detailShowNa, setDetailShowNa] = React.useState(false);

  const [openFamilyAlerts, setOpenFamilyAlerts] = React.useState<CeptAlertView[] | null>(null);
  const [validatingKey, setValidatingKey] = React.useState('');
  const [validationError, setValidationError] = React.useState('');

  const ehLider = isNc2Leader(currentUser);

  React.useEffect(() => {
    if (!detail && !openFamilyAlerts) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (openFamilyAlerts) setOpenFamilyAlerts(null);
      else setDetail(null);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [detail, openFamilyAlerts]);

  React.useEffect(() => {
    let active = true;

    // Enquanto a carga definitiva no banco nao e aprovada, a copia das planilhas
    // fica no bundle publico. Ela e a fonte da tela e nunca recebe escrita daqui.
    const loadSeed = async () => {
      const response = await fetch('/cept-sheet-seed.json', { cache: 'no-store' });
      if (!response.ok) throw new Error('Copia local das planilhas indisponivel.');
      const seed = await response.json() as { components?: CeptComponent[]; responsaveis?: Record<string, CeptResponsavel>; validations?: CeptValidacao[] };
      if (!active) return true;
      setComponents(Array.isArray(seed.components) ? seed.components : []);
      setResponsaveis(seed.responsaveis || {});
      setValidations(Array.isArray(seed.validations) ? seed.validations : []);
      setLoading(false);
      return true;
    };

    // MODO DEMO (`?ceptDemo=1`): dado ficticio, em memoria, sem tocar no Firestore.
    // Existe porque ceptComponentes ainda esta vazia e as rules do CEPT nao foram
    // publicadas -- serve so pra apresentar a tela. Remover junto com ceptDemoData.ts.
    if (CEPT_DEMO) {
      const demo = buildCeptDemoData();
      setComponents(demo.componentes);
      setValidations(demo.validacoes);
      setResponsaveis(demo.responsaveis);
      setLoading(false);
      return () => { active = false; };
    }

    const load = () => {
      setLoading(true);
      setLoadError('');
      return loadSeed().catch(() => Promise.all([
        fetchFirebaseCollection<CeptComponent>('ceptComponentes'),
        fetchFirebaseCollection<CeptValidacao>('ceptValidacoes'),
        fetchFirebaseAppData<Record<string, CeptResponsavel>>('ceptResponsaveis'),
      ])
        .then(([comps, vals, resp]) => {
          if (!active) return;
          setComponents(Array.isArray(comps) ? comps : []);
          setValidations(Array.isArray(vals) ? vals : []);
          setResponsaveis(resp && typeof resp === 'object' ? resp : {});
        })
        .catch((error: unknown) => {
          console.error('Erro ao carregar CEPT:', error);
          if (!active) return;
          setLoadError(
            error instanceof Error && error.message
              ? `Não foi possível carregar o CEPT: ${error.message}`
              : 'Não foi possível carregar o CEPT do Firebase.',
          );
        })
        .finally(() => {
          if (active) setLoading(false);
        }));
    };
    void load();
    // Ao vivo: qualquer mudanca em qualquer uma das 3 fontes refaz o fetch das 3 (mesmo idioma
    // de Kanban.tsx) -- barato o suficiente pro volume de dados do CEPT (ver ADR, secao Piora).
    const unsubComponentes = () => {};
    const unsubValidacoes = () => {};
    const unsubResponsaveis = () => {};
    return () => {
      active = false;
      unsubComponentes();
      unsubValidacoes();
      unsubResponsaveis();
    };
  }, []);

  const scopedComponents = React.useMemo(
    // Sem OS selecionada, mostrar somente legado: agregar "001" de OS distintas mistura dados.
    () => selectedOsCode ? components.filter((component) => component.osCode === selectedOsCode) : components.filter((component) => !component.osCode),
    [components, selectedOsCode],
  );
  const model = React.useMemo(
    () => buildCeptModel(scopedComponents, validations, responsaveis),
    [scopedComponents, validations, responsaveis],
  );

  const allProjectCodes = React.useMemo(
    () => [...projectCodes.filter((code) => model.projects.some((p) => p.projectCode === code))],
    [model],
  );
  const allDisciplineCodes = React.useMemo(
    () => Array.from(new Set(model.projects.flatMap((p) => p.disciplines.map((d) => d.disciplineCode)))).sort(),
    [model],
  );

  // Nada marcado = SEM filtro (mostra tudo), que e como um dropdown de checkbox se le e o
  // que o dashboard do Apps Script fazia ("Todos os projetos"). O <select multiple> antigo
  // precisava do oposto -- semeava tudo marcado -- porque nao tinha estado "sem filtro".
  // As colunas da matriz e o recorte dos dados TEM que sair da mesma lista. Quando eram duas
  // expressoes diferentes ("selectedDisciplines" cru no cabecalho, "vazio = todas" no corpo),
  // nenhuma disciplina marcada gerava zero colunas com o corpo achando que mostrava tudo.
  const visibleDisciplines = React.useMemo(
    () => (selectedDisciplines.length
      ? allDisciplineCodes.filter((code) => selectedDisciplines.includes(code))
      : allDisciplineCodes),
    [allDisciplineCodes, selectedDisciplines],
  );

  const filteredProjects = React.useMemo(
    () => model.projects
      .filter((p) => !selectedProjects.length || selectedProjects.includes(p.projectCode))
      .map((p) => ({
        ...p,
        disciplines: p.disciplines.filter((d) => !selectedDisciplines.length || selectedDisciplines.includes(d.disciplineCode)),
      })),
    [model, selectedProjects, selectedDisciplines],
  );

  const filteredAlerts = React.useMemo(
    () => model.alerts.filter((a) => (!selectedProjects.length || selectedProjects.includes(a.projectCode)) && (!selectedDisciplines.length || selectedDisciplines.includes(a.disciplineCode))),
    [model, selectedProjects, selectedDisciplines],
  );

  const detailBaseRecords = React.useMemo<DetailRecord[]>(() => {
    const alertsByRecord = new Map<string, CeptAlertView[]>();
    model.alerts.forEach((alert) => alertsByRecord.set(alert.recordKey, [...(alertsByRecord.get(alert.recordKey) || []), alert]));
    return components
      .filter((component) => !selectedProjects.length || selectedProjects.includes(component.projectCode))
      .filter((component) => !selectedDisciplines.length || selectedDisciplines.includes(component.disciplineCode))
      .map((component) => {
        const alerts = alertsByRecord.get(component.recordKey) || [];
        const alertSeverity = alerts.some((alert) => alert.displaySeverity === 'red') ? 'red'
          : alerts.some((alert) => alert.displaySeverity === 'yellow') ? 'yellow'
            : alerts.some((alert) => alert.displaySeverity === 'green') ? 'green' : 'none';
        return {
          ...component,
          projectName: projectNames[component.projectCode] || component.projectCode,
          responsible: responsaveis[`${component.projectCode}|${component.disciplineCode}`]?.responsavel || 'Responsável não identificado',
          alertSeverity,
          alertReasons: Array.from(new Set(alerts.flatMap((alert) => alert.reasons))),
        };
      });
  }, [components, model.alerts, responsaveis, selectedDisciplines, selectedProjects]);

  const openDetail = React.useCallback((context: DetailContext) => {
    setDetail(context);
    setDetailSearch('');
    setDetailQuickFilter('all');
    setDetailShowNa(false);
  }, []);

  const contextualDetailRecords = React.useMemo(() => {
    if (!detail) return [];
    return detailBaseRecords.filter((record) => {
      if (detail.kind === 'applicable') return record.status === 'delivered' || record.status === 'pending';
      if (detail.kind === 'delivered' || detail.kind === 'pending') return record.status === detail.kind;
      if (detail.kind === 'alerts') return record.alertSeverity === 'red' || record.alertSeverity === 'yellow';
      if (detail.kind === 'red' || detail.kind === 'yellow' || detail.kind === 'green') return record.alertSeverity === detail.kind;
      if (detail.kind === 'project') return record.projectCode === detail.value;
      if (detail.kind === 'discipline') return record.disciplineCode === detail.value;
      if (detail.kind === 'responsible') return record.responsible === detail.value;
      if (detail.kind === 'family') return record.family === detail.value
        && (!detail.projectCode || record.projectCode === detail.projectCode)
        && (!detail.disciplineCode || record.disciplineCode === detail.disciplineCode);
      return true;
    });
  }, [detail, detailBaseRecords]);

  const visibleDetailRecords = React.useMemo(() => {
    const query = detailSearch.trim().toLocaleLowerCase('pt-BR');
    return contextualDetailRecords.filter((record) => {
      if (!detailShowNa && record.status === 'na') return false;
      if (detailQuickFilter === 'delivered' || detailQuickFilter === 'pending') {
        if (record.status !== detailQuickFilter) return false;
      } else if (detailQuickFilter === 'applicable') {
        if (record.status !== 'delivered' && record.status !== 'pending') return false;
      } else if (detailQuickFilter === 'red' || detailQuickFilter === 'yellow' || detailQuickFilter === 'green') {
        if (record.alertSeverity !== detailQuickFilter) return false;
      }
      if (!query) return true;
      return [record.projectCode, record.projectName, record.disciplineCode, record.responsible, record.family, record.sourceType, record.format, record.status, record.dateIso, record.alertSeverity, ...record.alertReasons]
        .join(' ').toLocaleLowerCase('pt-BR').includes(query);
    });
  }, [contextualDetailRecords, detailQuickFilter, detailSearch, detailShowNa]);

  const detailSummary = React.useMemo(() => {
    const delivered = contextualDetailRecords.filter((record) => record.status === 'delivered').length;
    const pending = contextualDetailRecords.filter((record) => record.status === 'pending').length;
    const applicable = delivered + pending;
    return {
      delivered,
      pending,
      applicable,
      percent: applicable ? Math.round((delivered / applicable) * 100) : 0,
      red: contextualDetailRecords.filter((record) => record.alertSeverity === 'red').length,
      yellow: contextualDetailRecords.filter((record) => record.alertSeverity === 'yellow').length,
      green: contextualDetailRecords.filter((record) => record.alertSeverity === 'green').length,
    };
  }, [contextualDetailRecords]);

  const detailOverviewRows = React.useMemo(() => {
    if (detail?.kind !== 'projects' && detail?.kind !== 'disciplines') return [];
    const groups = new Map<string, { key: string; label: string; delivered: number; pending: number; applicable: number; projects: Set<string>; disciplines: Set<string> }>();
    detailBaseRecords.forEach((record) => {
      if (record.status !== 'delivered' && record.status !== 'pending') return;
      const key = detail.kind === 'projects' ? record.projectCode : record.disciplineCode;
      const current = groups.get(key) || {
        key,
        label: detail.kind === 'projects' ? `${record.projectCode} · ${record.projectName}` : record.disciplineCode,
        delivered: 0,
        pending: 0,
        applicable: 0,
        projects: new Set<string>(),
        disciplines: new Set<string>(),
      };
      current.applicable += 1;
      if (record.status === 'delivered') current.delivered += 1;
      if (record.status === 'pending') current.pending += 1;
      current.projects.add(record.projectCode);
      current.disciplines.add(record.disciplineCode);
      groups.set(key, current);
    });
    const query = detailSearch.trim().toLocaleLowerCase('pt-BR');
    return [...groups.values()]
      .filter((row) => !query || row.label.toLocaleLowerCase('pt-BR').includes(query))
      .map((row) => ({ ...row, percent: row.applicable ? Math.round((row.delivered / row.applicable) * 100) : 0 }))
      .sort((a, b) => b.percent - a.percent || a.label.localeCompare(b.label, 'pt-BR'));
  }, [detail, detailBaseRecords, detailSearch]);

  // recordKey ja contem [projeto, disciplina, familia, sourceType] -- agrupar por familia pra
  // colorir o badge do grid sem precisar de outro campo no CeptAlertView.
  const alertsByFamily = React.useMemo(() => {
    const map = new Map<string, CeptAlertView[]>();
    for (const alert of model.alerts) {
      const family = alert.recordKey.split('|')[2] || '';
      const key = `${alert.projectCode}|${alert.disciplineCode}|${family}`;
      const list = map.get(key) || [];
      list.push(alert);
      map.set(key, list);
    }
    return map;
  }, [model]);

  const kpi = React.useMemo(() => {
    const families = filteredProjects.flatMap((p) => p.disciplines.flatMap((d) => d.families));
    const delivered = families.reduce((sum, f) => sum + f.delivered, 0);
    const pending = families.reduce((sum, f) => sum + f.pending, 0);
    const applicable = families.reduce((sum, f) => sum + f.applicable, 0);
    const percent = applicable > 0 ? Math.round((delivered / applicable) * 100) : 0;
    const red = filteredAlerts.filter((a) => a.displaySeverity === 'red').length;
    const yellow = filteredAlerts.filter((a) => a.displaySeverity === 'yellow').length;
    const green = filteredAlerts.filter((a) => a.displaySeverity === 'green').length;
    const applicableRecords = detailBaseRecords.filter((record) => record.status === 'delivered' || record.status === 'pending');
    const projects = new Set(applicableRecords.map((record) => record.projectCode)).size;
    const disciplines = new Set(applicableRecords.map((record) => record.disciplineCode)).size;
    return { delivered, pending, applicable, percent, red, yellow, green, projects, disciplines };
  }, [detailBaseRecords, filteredProjects, filteredAlerts]);

  const pieData = React.useMemo(
    () => [
      { name: 'Entregue', value: kpi.delivered },
      { name: 'Pendente', value: kpi.pending },
    ],
    [kpi],
  );

  const barPorProjeto = React.useMemo(() => filteredProjects.map((p) => {
    const families = p.disciplines.flatMap((d) => d.families);
    const delivered = families.reduce((sum, f) => sum + f.delivered, 0);
    const applicable = families.reduce((sum, f) => sum + f.applicable, 0);
    return { name: p.projectCode, percent: applicable > 0 ? Math.round((delivered / applicable) * 100) : 0 };
  }), [filteredProjects]);

  const barPorDisciplina = React.useMemo(() => {
    const byDiscipline = new Map<string, CeptFamilyRollup[]>();
    filteredProjects.forEach((p) => p.disciplines.forEach((d) => {
      const list = byDiscipline.get(d.disciplineCode) || [];
      byDiscipline.set(d.disciplineCode, [...list, ...d.families]);
    }));
    return Array.from(byDiscipline.entries()).map(([disciplineCode, families]) => {
      const delivered = families.reduce((sum, f) => sum + f.delivered, 0);
      const applicable = families.reduce((sum, f) => sum + f.applicable, 0);
      return { name: disciplineCode, percent: applicable > 0 ? Math.round((delivered / applicable) * 100) : 0 };
    }).sort((a, b) => a.name.localeCompare(b.name));
  }, [filteredProjects]);

  const barPorTipo = React.useMemo(() => {
    const byFamily = new Map<string, CeptFamilyRollup[]>();
    filteredProjects.forEach((project) => project.disciplines.forEach((discipline) => discipline.families.forEach((family) => {
      byFamily.set(family.family, [...(byFamily.get(family.family) || []), family]);
    })));
    return [...byFamily.entries()].map(([name, families]) => {
      const delivered = families.reduce((sum, family) => sum + family.delivered, 0);
      const applicable = families.reduce((sum, family) => sum + family.applicable, 0);
      return { name, percent: applicable ? Math.round((delivered / applicable) * 100) : 0 };
    }).sort((a, b) => familyOrderIndex(a.name) - familyOrderIndex(b.name));
  }, [filteredProjects]);

  const barPorResponsavel = React.useMemo(() => {
    const byOwner = new Map<string, CeptFamilyRollup[]>();
    filteredProjects.forEach((project) => project.disciplines.forEach((discipline) => {
      const name = discipline.responsavel?.responsavel || 'Responsável não identificado';
      byOwner.set(name, [...(byOwner.get(name) || []), ...discipline.families]);
    }));
    return [...byOwner.entries()].map(([name, families]) => {
      const delivered = families.reduce((sum, family) => sum + family.delivered, 0);
      const applicable = families.reduce((sum, family) => sum + family.applicable, 0);
      return { name, percent: applicable ? Math.round((delivered / applicable) * 100) : 0 };
    }).sort((a, b) => a.percent - b.percent);
  }, [filteredProjects]);

  async function handleValidate(alert: CeptAlertView, action: 'RESOLVED' | 'CONFIRMED_OUTDATED') {
    setValidationError('');
    if (!isFirebaseConfigured()) {
      setValidationError('Firebase não configurado para validar este alerta.');
      return;
    }
    // Guarda de escrita (ADR §3): recomputa a assinatura contra o dado vivo (componentes em
    // estado, atualizados por onSnapshot) e recusa se mudou desde que o modal foi aberto.
    const component = components.find((c) => c.recordKey === alert.recordKey);
    const liveSignature = component ? buildSignature(component, components) : '';
    if (!component || liveSignature !== alert.signature) {
      setValidationError('Dados alterados desde que você abriu esta validação. Feche e reabra o alerta para validar com os dados atuais.');
      return;
    }
    setValidatingKey(alert.recordKey);
    try {
      await setFirebaseDocument('ceptValidacoes', crypto.randomUUID(), {
        recordKey: alert.recordKey,
        projectCode: alert.projectCode,
        signature: alert.signature,
        action,
        usuarioEmail: currentUser.email,
        usuarioNome: currentUser.nome,
        criadoEm: serverTimestamp(),
        severity: alert.severity,
        reasons: alert.reasons,
        fileDate: alert.fileDate,
        counterpartDate: alert.counterpartDate || '',
        observacao: '',
        version: 1,
      });
      // A colecao e append-only e o onSnapshot ja refaz o load; so fecha o alerta resolvido na tela.
      setOpenFamilyAlerts((prev) => (prev ? prev.filter((a) => a.recordKey !== alert.recordKey || action !== 'RESOLVED') : prev));
    } catch (error) {
      console.error('Erro ao gravar validação CEPT:', error);
      setValidationError(error instanceof Error && error.message ? error.message : 'Não foi possível gravar a validação.');
    } finally {
      setValidatingKey('');
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-3 rounded-2xl bg-white p-10 text-[13px] font-semibold text-[#757575]">
        <Loader2 size={18} className="animate-spin" />
        Carregando CEPT...
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="rounded-2xl bg-[#FEF2F2] p-6">
        <p className="text-[13px] font-medium text-[#B91C1C]">{loadError}</p>
        <p className="mt-2 text-[12px] text-[#7F1D1D]">
          As regras do Firestore para <code>ceptComponentes</code> e <code>ceptValidacoes</code>{' '}
          existem no repositório mas ainda não foram publicadas no Console — até lá a leitura é
          negada. Dá para ver a tela com o snapshot/demonstração enquanto isso.
        </p>
        <button
          type="button"
          onClick={ligarModoDemo}
          className="mt-4 rounded-xl bg-[#B91C1C] px-4 py-2 text-[12px] font-bold text-white hover:bg-[#991B1B]"
        >
          Abrir sem o Firebase
        </button>
      </div>
    );
  }

  if (scopedComponents.length === 0) {
    return (
      <div className="rounded-2xl bg-[#F8FAFC] p-6 text-[13px] font-medium text-[#64748B]">
        Nenhum componente encontrado para esta OS.
      </div>
    );
  }

  return (
    <div className="cept-os-dashboard w-full space-y-5 font-['Montserrat']">
      <section className="relative overflow-hidden rounded-[26px] border border-[#EEE5E1] bg-white px-6 py-6 text-[#2D2D2D] shadow-[0_18px_44px_-34px_rgba(15,23,42,.48)] md:px-7">
        <div className="absolute -right-14 -top-20 h-64 w-64 rounded-full border-[34px] border-[#F05D28]/10" />
        <div className="relative flex flex-col justify-between gap-5 md:flex-row md:items-end">
          <div><div className="mb-3 inline-flex items-center gap-2 rounded-full bg-[#FFF3EC] px-3 py-1 text-[10px] font-black uppercase tracking-[.17em] text-[#D94E1F]"><Sparkles size={13} /> Compatibilização</div><h1 className="text-2xl font-black tracking-tight text-[#2D2D2D] md:text-3xl">Análise de OS</h1><p className="mt-2 max-w-2xl text-[13px] font-medium leading-relaxed text-[#6F777C]">Acompanhamento consolidado das entregas, responsáveis e alertas do CEPT.</p></div>
          <div className="inline-flex items-center gap-2 self-start rounded-xl border border-[#DCEBEC] bg-[#F2FAFA] px-3 py-2 text-[11px] font-bold text-[#23696B] md:self-auto"><ClipboardCheck size={15} /> Base temporária das planilhas</div>
        </div>
      </section>
      {CEPT_DEMO && (temSnapshotReal ? (
        <div className="rounded-2xl border-2 border-[#2F6F9F] bg-[#EFF6FB] px-4 py-3">
          <p className="text-[13px] font-extrabold text-[#1D4E73] uppercase tracking-wide">
            Snapshot do Apps Script — dados reais, congelados
          </p>
          <p className="mt-1 text-[12px] text-[#2A5A7D]">
            Cópia tirada em {new Date(snapshotData).toLocaleString('pt-BR')}. É uma foto: não
            atualiza sozinha e nada é gravado. Para atualizar, rode o
            {' '}<code>cept-from-appsscript.ts</code> de novo.
          </p>
        </div>
      ) : (
        <div className="rounded-2xl border-2 border-[#F05D28] bg-[#FFF3EC] px-4 py-3">
          <p className="text-[13px] font-extrabold text-[#B7410E] uppercase tracking-wide">
            Dados de demonstração — não são reais
          </p>
          <p className="mt-1 text-[12px] text-[#7C4A2D]">
            Números fictícios, gerados localmente para apresentar a tela. Nada aqui vem do Firebase
            e nada é gravado. Remova <code>?ceptDemo=1</code> da URL para voltar aos dados reais.
          </p>
        </div>
      ))}
      <section className="rounded-[22px] border border-[#EAEEF0] bg-white p-4 shadow-[0_14px_34px_-30px_rgba(15,23,42,.5)]">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div><p className="text-[10px] font-black uppercase tracking-[.14em] text-[#F05D28]">Recorte da análise</p><p className="mt-1 text-[11px] font-medium text-[#8A9297]">Selecione uma OS; vazio mostra apenas o legado CEPT.</p></div>
          {(selectedOsCode || selectedProjects.length > 0 || selectedDisciplines.length > 0) && <button type="button" onClick={() => { setSelectedOsCode(''); setSelectedProjects([]); setSelectedDisciplines([]); }} className="rounded-lg border border-[#E5E7EB] px-3 py-2 text-[10px] font-black uppercase tracking-[.08em] text-[#687077] hover:border-[#F05D28] hover:text-[#D94E1F]">Limpar filtros</button>}
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <div className="space-y-1.5"><label className="text-[10px] font-bold text-[#757575] uppercase tracking-widest">OS</label><select value={selectedOsCode} onChange={(event) => setSelectedOsCode(event.target.value)} className={campoFiltro}><option value="">Legado CEPT (sem OS)</option>{osOptions.map((os) => <option key={os.codigo} value={os.codigo}>{os.nome || os.codigo || 'Sem nome'}</option>)}</select></div>
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-[#757575] uppercase tracking-widest">Projeto</label>
            <SearchableMultiSelect
              value={selectedProjects}
              onChange={setSelectedProjects}
              options={allProjectCodes}
              getOptionLabel={(code) => `${code} · ${projectNames[code] || code}`}
              placeholder="Todos os projetos"
              emptyMessage="Nenhum projeto nos dados carregados."
              className={campoFiltro}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-[#757575] uppercase tracking-widest">Disciplina</label>
            <SearchableMultiSelect
              value={selectedDisciplines}
              onChange={setSelectedDisciplines}
              options={allDisciplineCodes}
              placeholder="Todas as disciplinas"
              emptyMessage="Nenhuma disciplina nos dados carregados."
              className={campoFiltro}
            />
          </div>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <KpiCard label="Conclusão" value={`${kpi.percent}%`} sub="Ver entregáveis aplicáveis" tone="orange" onClick={() => openDetail({ kind: 'applicable', title: 'Conclusão · entregáveis aplicáveis' })} />
        <KpiCard label="Entregues" value={String(kpi.delivered)} sub={`de ${kpi.applicable} aplicáveis`} tone="teal" onClick={() => openDetail({ kind: 'delivered', title: 'Entregáveis concluídos' })} />
        <KpiCard label="Pendentes" value={String(kpi.pending)} sub="Ver pendências" tone="amber" onClick={() => openDetail({ kind: 'pending', title: 'Entregáveis pendentes' })} />
        <AlertKpiCard red={kpi.red} yellow={kpi.yellow} green={kpi.green} onOpen={() => openDetail({ kind: 'alerts', title: 'Alertas ativos' })} onSeverity={(severity) => openDetail({ kind: severity, title: severity === 'red' ? 'Alertas vermelhos' : severity === 'yellow' ? 'Alertas amarelos' : 'Alertas resolvidos e validados' })} />
        <KpiCard label="Projetos" value={String(kpi.projects)} sub="No filtro atual" tone="blue" onClick={() => openDetail({ kind: 'projects', title: 'Projetos · visão consolidada' })} />
        <KpiCard label="Disciplinas" value={String(kpi.disciplines)} sub="No filtro atual" tone="blue" onClick={() => openDetail({ kind: 'disciplines', title: 'Disciplinas · visão consolidada' })} />
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <ChartCard title="Situação geral" subtitle="Clique em uma fatia para aprofundar" onShowData={() => openDetail({ kind: 'all', title: 'Dados da situação geral' })}>
          <ResponsiveContainer>
            <PieChart>
              <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90} onClick={(entry) => {
                const delivered = String(entry.name).toLocaleLowerCase('pt-BR').startsWith('entreg');
                openDetail({ kind: delivered ? 'delivered' : 'pending', title: delivered ? 'Entregáveis concluídos' : 'Entregáveis pendentes' });
              }}>
                {pieData.map((entry, index) => (
                  <Cell key={entry.name} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                ))}
                <Label value={`${kpi.percent}%`} position="center" fill="#2D2D2D" fontSize={22} fontWeight={800} />
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Conclusão por projeto" subtitle="Clique em uma barra para ver o projeto" onShowData={() => openDetail({ kind: 'all', title: 'Dados por projeto' })}>
          <ResponsiveContainer>
            <BarChart data={barPorProjeto} onClick={(state) => {
              const name = state?.activeLabel;
              if (name) openDetail({ kind: 'project', value: String(name), title: `${name} · ${projectNames[String(name)] || name}` });
            }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
              <Tooltip formatter={(value: number) => `${value}%`} />
              <Bar dataKey="percent" radius={[6, 6, 0, 0]}>{barPorProjeto.map((item) => <Cell key={item.name} fill={completionColor(item.percent)} />)}</Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Conclusão por disciplina" subtitle="Clique em uma barra para ver a disciplina" onShowData={() => openDetail({ kind: 'all', title: 'Dados por disciplina' })}>
          <ResponsiveContainer>
            <BarChart data={barPorDisciplina} onClick={(state) => {
              const name = state?.activeLabel;
              if (name) openDetail({ kind: 'discipline', value: String(name), title: `Disciplina · ${name}` });
            }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-35} textAnchor="end" height={60} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
              <Tooltip formatter={(value: number) => `${value}%`} />
              <Bar dataKey="percent" radius={[6, 6, 0, 0]}>{barPorDisciplina.map((item) => <Cell key={item.name} fill={completionColor(item.percent)} />)}</Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Conclusão por tipo de entregável" subtitle="Clique em uma barra para ver os arquivos" onShowData={() => openDetail({ kind: 'all', title: 'Dados por tipo de entregável' })}>
          <ResponsiveContainer><BarChart data={barPorTipo} onClick={(state) => { const name = state?.activeLabel; if (name) openDetail({ kind: 'family', value: String(name), title: `Entregável · ${name}` }); }}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="name" tick={{ fontSize: 10 }} /><YAxis domain={[0, 100]} tick={{ fontSize: 11 }} /><Tooltip formatter={(value: number) => `${value}%`} /><Bar dataKey="percent" fill="#14B8A6" radius={[6, 6, 0, 0]} /></BarChart></ResponsiveContainer>
        </ChartCard>
        <section className="xl:col-span-2"><ChartCard title="Conclusão por responsável" subtitle="Clique em uma barra para ver a equipe" onShowData={() => openDetail({ kind: 'all', title: 'Dados por responsável' })}><ResponsiveContainer><BarChart data={barPorResponsavel} layout="vertical" margin={{ left: 28 }} onClick={(state) => { const name = state?.activeLabel; if (name) openDetail({ kind: 'responsible', value: String(name), title: `Responsável · ${name}` }); }}><CartesianGrid strokeDasharray="3 3" horizontal={false} /><XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11 }} /><YAxis dataKey="name" type="category" width={140} tick={{ fontSize: 10 }} /><Tooltip formatter={(value: number) => `${value}%`} /><Bar dataKey="percent" radius={[0, 6, 6, 0]}>{barPorResponsavel.map((item) => <Cell key={item.name} fill={completionColor(item.percent)} />)}</Bar></BarChart></ResponsiveContainer></ChartCard></section>
      </div>

      <section className="rounded-[22px] border border-[#EAEEF0] bg-white p-5 shadow-[0_16px_38px_-30px_rgba(15,23,42,.5)]">
        <div className="mb-4 flex flex-col justify-between gap-3 border-b border-[#F0F2F3] pb-4 lg:flex-row lg:items-center">
          <div><h3 className="text-[14px] font-black text-[#2D2D2D]">Matriz Projeto × Disciplina</h3><p className="mt-1 text-[11px] font-medium text-[#8A9297]">Cada selo representa uma família contratual. Clique nos contornos de alerta para revisar.</p></div>
          <div className="flex flex-wrap gap-3 text-[10px] font-bold text-[#687077]"><span className="text-emerald-700">✓ entregue</span><span className="text-amber-700">● pendente</span><span className="text-slate-400">— não aplicável</span><span className="text-slate-500">? indeterminado</span></div>
        </div>
        {filteredProjects.length === 0 ? (
          <div className="rounded-xl bg-[#F8FAFC] p-6 text-[13px] font-medium text-[#64748B]">
            Nenhum projeto/disciplina selecionado.
          </div>
        ) : (
          // max-h + sticky: com 9 projetos x ate 18 disciplinas a tabela estoura a tela nos dois
          // eixos; sem coluna fixa some o nome do projeto ao rolar pro lado.
          <div className="max-h-[60vh] overflow-auto rounded-xl border border-[#F1F5F9]">
            <table className="w-full text-left" style={{ borderCollapse: 'separate', borderSpacing: 0 }}>
              <thead>
                <tr className="bg-[#F8F9FA]">
                  <th className="sticky left-0 top-0 z-20 min-w-[190px] bg-[#F8F9FA] py-3 px-4 text-[10px] font-bold text-[#757575] uppercase tracking-widest">Projeto</th>
                  {visibleDisciplines.map((code) => (
                    <th
                      key={code}
                      className="sticky top-0 z-10 bg-[#F8F9FA] py-3 px-3 text-center text-[10px] font-bold text-[#757575] uppercase tracking-widest"
                    >
                      <button type="button" onClick={() => openDetail({ kind: 'discipline', value: code, title: `Disciplina · ${code}` })} className="rounded px-2 py-1 transition hover:bg-white hover:text-[#D94E1F] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F05D28]/30">{code}</button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredProjects.map((project, linha) => (
                  <tr key={project.projectCode} className={linha % 2 === 1 ? 'bg-[#FAFAFB]' : 'bg-white'}>
                    <td className={`sticky left-0 z-10 min-w-[190px] whitespace-nowrap py-3 px-4 text-[12px] font-bold text-[#2D2D2D] shadow-[1px_0_0_0_#F1F5F9] ${linha % 2 === 1 ? 'bg-[#FAFAFB]' : 'bg-white'}`}>
                      <button type="button" onClick={() => openDetail({ kind: 'project', value: project.projectCode, title: `${project.projectCode} · ${project.projectName}` })} className="group flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left transition hover:bg-[#FFF7F2] hover:text-[#D94E1F] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F05D28]/30"><span>{project.projectCode} · {project.projectName}</span><ChevronRight size={14} className="opacity-0 transition group-hover:opacity-100" /></button>
                    </td>
                    {visibleDisciplines.map((disciplineCode) => {
                      const discipline = project.disciplines.find((d) => d.disciplineCode === disciplineCode);
                      // Disciplina nao aplicavel neste projeto: marcador explicito. Celula em
                      // branco lia como "carregando" / "esqueceram de preencher".
                      if (!discipline) {
                        return (
                          <td key={disciplineCode} className="py-3 px-3 text-center text-[12px] text-[#CBD5E1]" title="Disciplina não aplicável neste projeto">
                            —
                          </td>
                        );
                      }
                      const families = [...discipline.families].sort(
                        (a, b) => familyOrderIndex(a.family) - familyOrderIndex(b.family),
                      );
                      return (
                        <td key={disciplineCode} className="py-3 px-3">
                          <div className="flex flex-wrap gap-1">
                            {families.map((family) => {
                              const { icon, className } = familyIcon(family.status);
                              const familyAlerts = alertsByFamily.get(`${project.projectCode}|${disciplineCode}|${family.family}`) || [];
                              const severity = worstSeverity(familyAlerts);
                              return (
                                <span key={family.family} className="relative inline-flex">
                                  <button
                                    type="button"
                                    onClick={() => openDetail({ kind: 'family', value: family.family, projectCode: project.projectCode, disciplineCode, title: `${project.projectCode} · ${project.projectName} · ${disciplineCode} · ${family.family}` })}
                                    title={`${family.family}: ${family.delivered}/${family.applicable} · clique para aprofundar`}
                                    className={`inline-flex h-7 min-w-[44px] items-center justify-center gap-1 rounded-md border px-1.5 text-[10px] font-bold transition hover:-translate-y-px hover:shadow-sm ${className} ${severity ? severityRing(severity) : ''}`}
                                  >
                                    {family.family} {icon}
                                  </button>
                                  {familyAlerts.length > 0 && <button type="button" onClick={() => setOpenFamilyAlerts(familyAlerts)} title="Abrir alerta e validação" className={`absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full text-white shadow ${severity === 'red' ? 'bg-red-500' : severity === 'yellow' ? 'bg-amber-500' : 'bg-emerald-500'}`}><AlertTriangle size={10} /></button>}
                                </span>
                              );
                            })}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {detail && (
        <div className="fixed inset-0 z-[180] flex items-center justify-center bg-[#15232B]/55 p-3 backdrop-blur-[2px] md:p-6" onClick={() => setDetail(null)}>
          <section role="dialog" aria-modal="true" aria-labelledby="cept-detail-title" className="flex max-h-[90vh] w-full max-w-6xl flex-col overflow-hidden rounded-[24px] border border-white/70 bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <header className="flex items-start justify-between gap-4 border-b border-[#E9EDEF] bg-gradient-to-r from-[#FFF8F4] to-white px-5 py-4 md:px-6">
              <div>
                <p className="text-[9px] font-black uppercase tracking-[.17em] text-[#F05D28]">Detalhamento do recorte atual</p>
                <h2 id="cept-detail-title" className="mt-1 text-lg font-black text-[#29343A]">{detail.title}</h2>
                <p className="mt-1 text-[11px] font-medium text-[#7B878E]">Os filtros de projeto e disciplina da dashboard continuam aplicados.</p>
              </div>
              <button type="button" onClick={() => setDetail(null)} aria-label="Fechar detalhamento" className="rounded-xl border border-[#E1E6E8] bg-white p-2 text-[#7B878E] transition hover:border-[#F05D28]/40 hover:text-[#D94E1F]"><X size={18} /></button>
            </header>

            <div className="border-b border-[#EDF0F2] px-5 py-4 md:px-6">
              {detail.kind !== 'projects' && detail.kind !== 'disciplines' && <div className="flex flex-wrap gap-2">
                {([
                  ['all', `${detailSummary.percent}% conclusão`, 'slate'],
                  ['delivered', `${detailSummary.delivered} entregues`, 'teal'],
                  ['pending', `${detailSummary.pending} pendentes`, 'amber'],
                  ['applicable', `${detailSummary.applicable} aplicáveis`, 'orange'],
                  ['red', `${detailSummary.red} vermelhos`, 'red'],
                  ['yellow', `${detailSummary.yellow} amarelos`, 'amber'],
                  ['green', `${detailSummary.green} validados`, 'teal'],
                ] as Array<[DetailQuickFilter, string, KpiTone]>).map(([filter, label, tone]) => (
                  <button key={filter} type="button" onClick={() => setDetailQuickFilter(filter)} className={`rounded-full border px-3 py-1.5 text-[10px] font-extrabold transition ${detailQuickFilter === filter ? `${KPI_TONES[tone].bar} border-transparent text-white shadow-sm` : 'border-[#E3E8EA] bg-white text-[#657178] hover:border-[#F05D28]/40'}`}>{label}</button>
                ))}
              </div>}
              <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
                <label className="relative block max-w-md flex-1">
                  <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#98A2A8]" />
                  <input value={detailSearch} onChange={(event) => setDetailSearch(event.target.value)} placeholder={detail.kind === 'projects' ? 'Buscar projeto...' : detail.kind === 'disciplines' ? 'Buscar disciplina...' : 'Buscar projeto, disciplina, responsável ou arquivo...'} className="h-10 w-full rounded-xl border border-[#E1E6E8] bg-[#FAFBFB] pl-9 pr-3 text-[11px] font-semibold text-[#354047] outline-none transition focus:border-[#F05D28] focus:bg-white" />
                </label>
                {detail.kind !== 'projects' && detail.kind !== 'disciplines' && <label className="inline-flex items-center gap-2 text-[10px] font-bold text-[#68747B]"><input type="checkbox" checked={detailShowNa} onChange={(event) => setDetailShowNa(event.target.checked)} className="h-4 w-4 accent-[#F05D28]" />Exibir não aplicáveis</label>}
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-auto">
              {detail.kind === 'projects' || detail.kind === 'disciplines' ? (
                <table className="w-full min-w-[720px] border-collapse text-left">
                  <thead className="sticky top-0 z-10 bg-[#F7F9FA]"><tr className="border-b border-[#E8ECEE] text-[9px] font-black uppercase tracking-[.08em] text-[#7C878E]"><th className="px-5 py-3">{detail.kind === 'projects' ? 'Projeto' : 'Disciplina'}</th><th className="px-4 py-3 text-right">Conclusão</th><th className="px-4 py-3 text-right">Entregues</th><th className="px-4 py-3 text-right">Pendentes</th><th className="px-4 py-3">Abrangência</th><th className="w-12 px-4 py-3" /></tr></thead>
                  <tbody>
                    {detailOverviewRows.map((row) => (
                      <tr key={row.key} onClick={() => openDetail({ kind: detail.kind === 'projects' ? 'project' : 'discipline', value: row.key, title: row.label })} className="group cursor-pointer border-b border-[#F0F2F3] text-[11px] text-[#445057] transition hover:bg-[#FFF9F5]">
                        <td className="px-5 py-3 font-extrabold text-[#29343A]">{row.label}</td><td className="px-4 py-3 text-right"><span className="font-black" style={{ color: completionColor(row.percent) }}>{row.percent}%</span></td><td className="px-4 py-3 text-right font-bold text-emerald-700">{row.delivered}</td><td className="px-4 py-3 text-right font-bold text-amber-700">{row.pending}</td><td className="px-4 py-3 text-[#7B878E]">{detail.kind === 'projects' ? `${row.disciplines.size} disciplinas` : `${row.projects.size} projetos`}</td><td className="px-4 py-3"><ChevronRight size={15} className="text-[#AAB2B7] transition group-hover:translate-x-0.5 group-hover:text-[#F05D28]" /></td>
                      </tr>
                    ))}
                    {detailOverviewRows.length === 0 && <tr><td colSpan={6} className="px-6 py-12 text-center text-[12px] font-semibold text-[#899399]">Nenhum resultado consolidado neste recorte.</td></tr>}
                  </tbody>
                </table>
              ) : (
              <table className="w-full min-w-[980px] border-collapse text-left">
                <thead className="sticky top-0 z-10 bg-[#F7F9FA]">
                  <tr className="border-b border-[#E8ECEE] text-[9px] font-black uppercase tracking-[.08em] text-[#7C878E]">
                    <th className="px-4 py-3">Projeto</th><th className="px-4 py-3">Disciplina</th><th className="px-4 py-3">Responsável</th><th className="px-4 py-3">Entregável</th><th className="px-4 py-3">Formato</th><th className="px-4 py-3">Situação</th><th className="px-4 py-3">Data</th><th className="px-4 py-3">Alerta</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleDetailRecords.map((record) => (
                    <tr key={record.recordKey} className="border-b border-[#F0F2F3] text-[11px] text-[#445057] transition hover:bg-[#FFF9F5]">
                      <td className="px-4 py-3"><strong className="text-[#29343A]">{record.projectCode}</strong><span className="ml-1 text-[#899399]">· {record.projectName}</span></td>
                      <td className="px-4 py-3 font-bold">{record.disciplineCode}</td>
                      <td className="max-w-[180px] px-4 py-3">{record.responsible}</td>
                      <td className="px-4 py-3"><strong>{record.family}</strong><span className="mt-0.5 block text-[9px] text-[#8A949A]">{record.sourceType}</span></td>
                      <td className="px-4 py-3">{record.format || '—'}</td>
                      <td className="px-4 py-3"><span className={`rounded-full px-2 py-1 text-[9px] font-black uppercase ${record.status === 'delivered' ? 'bg-emerald-50 text-emerald-700' : record.status === 'pending' ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-500'}`}>{record.status === 'delivered' ? 'Entregue' : record.status === 'pending' ? 'Pendente' : record.status === 'na' ? 'N/A' : 'Indeterminado'}</span></td>
                      <td className="whitespace-nowrap px-4 py-3">{record.dateIso || '—'}</td>
                      <td className="px-4 py-3">{record.alertSeverity === 'none' ? <span className="text-[#B0B7BB]">—</span> : <button type="button" onClick={() => setOpenFamilyAlerts(model.alerts.filter((alert) => alert.recordKey === record.recordKey))} title={record.alertReasons.join(' · ')} className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[9px] font-black uppercase ${record.alertSeverity === 'red' ? 'bg-red-50 text-red-700' : record.alertSeverity === 'yellow' ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'}`}><AlertTriangle size={11} />{record.alertSeverity === 'green' ? 'Validado' : record.alertSeverity}</button>}</td>
                    </tr>
                  ))}
                  {visibleDetailRecords.length === 0 && <tr><td colSpan={8} className="px-6 py-12 text-center text-[12px] font-semibold text-[#899399]">Nenhum registro encontrado neste recorte.</td></tr>}
                </tbody>
              </table>
              )}
            </div>
            <footer className="flex items-center justify-between border-t border-[#E9EDEF] bg-[#FAFBFB] px-5 py-3 text-[10px] font-bold text-[#7B878E] md:px-6"><span>{detail.kind === 'projects' || detail.kind === 'disciplines' ? `${detailOverviewRows.length} linhas consolidadas` : `${visibleDetailRecords.length} de ${contextualDetailRecords.length} registros exibidos`}</span><span>Clique em uma linha para aprofundar.</span></footer>
          </section>
        </div>
      )}

      {openFamilyAlerts && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-950/40 p-4" onClick={() => { setOpenFamilyAlerts(null); setValidationError(''); }}>
          <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h4 className="flex items-center gap-2 text-[14px] font-black text-[#2D2D2D]">
                <AlertTriangle size={16} className="text-[#F05D28]" />
                Alertas do entregável
              </h4>
              <button type="button" onClick={() => { setOpenFamilyAlerts(null); setValidationError(''); }} className="text-[#94A3B8] hover:text-[#2D2D2D]">
                <X size={18} />
              </button>
            </div>

            {openFamilyAlerts.length === 0 && (
              <p className="text-[12px] font-medium text-[#64748B]">Alerta resolvido.</p>
            )}

            <div className="space-y-3">
              {openFamilyAlerts.map((alert) => (
                <div key={alert.recordKey + alert.rule} className="rounded-xl bg-[#F8FAFC] p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wider ${
                      alert.displaySeverity === 'red' ? 'bg-[#FEF2F2] text-[#B91C1C]'
                        : alert.displaySeverity === 'yellow' ? 'bg-[#FFF7ED] text-[#C2410C]'
                          : 'bg-[#ECFDF5] text-[#047857]'
                    }`}
                    >
                      {alert.displaySeverity === 'green' ? 'resolvido' : alert.displaySeverity}
                    </span>
                    <span className="text-[10px] font-semibold text-[#94A3B8]">{alert.validationStatus}</span>
                  </div>
                  <ul className="mt-2 list-disc space-y-1 pl-4">
                    {alert.reasons.map((reason) => (
                      <li key={reason} className="text-[12px] text-[#374151]">{reason}</li>
                    ))}
                  </ul>
                  {ehLider && alert.displaySeverity !== 'green' && (
                    <div className="mt-3 flex gap-2">
                      <button
                        type="button"
                        disabled={validatingKey === alert.recordKey}
                        onClick={() => void handleValidate(alert, 'RESOLVED')}
                        className="h-8 rounded-lg bg-[#F05D28] px-3 text-[11px] font-black text-white disabled:opacity-60"
                      >
                        Marcar resolvido
                      </button>
                      <button
                        type="button"
                        disabled={validatingKey === alert.recordKey}
                        onClick={() => void handleValidate(alert, 'CONFIRMED_OUTDATED')}
                        className="h-8 rounded-lg border border-[#E5E7EB] px-3 text-[11px] font-black text-[#2D2D2D] disabled:opacity-60"
                      >
                        Confirmar desatualizado
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {validationError && (
              <p className="mt-3 rounded-lg bg-[#FEF2F2] p-2 text-[11px] font-semibold text-[#B91C1C]">{validationError}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
