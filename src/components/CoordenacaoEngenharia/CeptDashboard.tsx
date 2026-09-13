// CEPT | Acompanhamento de Entregas -- dashboard somente-leitura + validacao de alerta.
// Modelo/regras vivem em src/lib/ceptModel.ts (ADR docs/decisoes/0001-cept-acompanhamento-entregas-firestore.md);
// este arquivo so le, agrega pra tela e escreve a decisao de validacao.
import React from 'react';
import { serverTimestamp } from 'firebase/firestore';
import { AlertTriangle, Loader2, X } from 'lucide-react';
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid,
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
};

const PIE_COLORS = ['#10B981', '#F59E0B'];

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

function KpiCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl bg-white p-4 shadow-[0_10px_30px_-22px_rgba(15,23,42,0.45)]">
      <p className="text-[10px] font-extrabold uppercase tracking-[1.2px] text-[#94A3B8]">{label}</p>
      <p className="mt-1 text-[26px] font-black text-[#2D2D2D]">{value}</p>
      {sub && <p className="mt-0.5 text-[11px] font-semibold text-[#757575]">{sub}</p>}
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl bg-white p-4 shadow-[0_10px_30px_-22px_rgba(15,23,42,0.45)]">
      <h3 className="text-[13px] font-black text-[#2D2D2D] mb-3">{title}</h3>
      <div style={{ width: '100%', height: 260 }}>{children}</div>
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

export default function CeptDashboard({ currentUser }: CeptDashboardProps) {
  const [components, setComponents] = React.useState<CeptComponent[]>([]);
  const [validations, setValidations] = React.useState<CeptValidacao[]>([]);
  const [responsaveis, setResponsaveis] = React.useState<Record<string, CeptResponsavel>>({});
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState('');

  const [selectedProjects, setSelectedProjects] = React.useState<string[]>([]);
  const [selectedDisciplines, setSelectedDisciplines] = React.useState<string[]>([]);

  const [openFamilyAlerts, setOpenFamilyAlerts] = React.useState<CeptAlertView[] | null>(null);
  const [validatingKey, setValidatingKey] = React.useState('');
  const [validationError, setValidationError] = React.useState('');

  const ehLider = isNc2Leader(currentUser);

  React.useEffect(() => {
    let active = true;

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
      return Promise.all([
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
        });
    };
    void load();
    // Ao vivo: qualquer mudanca em qualquer uma das 3 fontes refaz o fetch das 3 (mesmo idioma
    // de Kanban.tsx) -- barato o suficiente pro volume de dados do CEPT (ver ADR, secao Piora).
    const unsubComponentes = subscribeFirebaseCollection('ceptComponentes', () => void load());
    const unsubValidacoes = subscribeFirebaseCollection('ceptValidacoes', () => void load());
    const unsubResponsaveis = subscribeFirebaseAppData('ceptResponsaveis', () => void load());
    return () => {
      active = false;
      unsubComponentes();
      unsubValidacoes();
      unsubResponsaveis();
    };
  }, []);

  const model = React.useMemo(
    () => buildCeptModel(components, validations, responsaveis),
    [components, validations, responsaveis],
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
    () => model.alerts.filter((a) => selectedProjects.includes(a.projectCode) && selectedDisciplines.includes(a.disciplineCode)),
    [model, selectedProjects, selectedDisciplines],
  );

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
    return { delivered, pending, applicable, percent, red, yellow, green };
  }, [filteredProjects, filteredAlerts]);

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

  if (components.length === 0) {
    return (
      <div className="rounded-2xl bg-[#F8FAFC] p-6 text-[13px] font-medium text-[#64748B]">
        Nenhum componente CEPT importado ainda.
      </div>
    );
  }

  return (
    <div className="w-full space-y-6 font-['Montserrat']">
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
      <section className="rounded-2xl bg-white p-4 shadow-[0_10px_30px_-22px_rgba(15,23,42,0.45)]">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
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

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <KpiCard label="Conclusão" value={`${kpi.percent}%`} />
        <KpiCard label="Entregues" value={String(kpi.delivered)} sub={`de ${kpi.applicable} aplicáveis`} />
        <KpiCard label="Pendentes" value={String(kpi.pending)} />
        <KpiCard label="Alertas vermelhos" value={String(kpi.red)} />
        <KpiCard label="Alertas amarelos" value={String(kpi.yellow)} />
        <KpiCard label="Alertas resolvidos" value={String(kpi.green)} />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <ChartCard title="Status geral">
          <ResponsiveContainer>
            <PieChart>
              <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90}>
                {pieData.map((entry, index) => (
                  <Cell key={entry.name} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Conclusão por projeto">
          <ResponsiveContainer>
            <BarChart data={barPorProjeto}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
              <Tooltip formatter={(value: number) => `${value}%`} />
              <Bar dataKey="percent" fill="#F05D28" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Conclusão por disciplina">
          <ResponsiveContainer>
            <BarChart data={barPorDisciplina}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-35} textAnchor="end" height={60} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
              <Tooltip formatter={(value: number) => `${value}%`} />
              <Bar dataKey="percent" fill="#1D4ED8" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <section className="rounded-2xl bg-white p-4 shadow-[0_10px_30px_-22px_rgba(15,23,42,0.45)]">
        <h3 className="text-[13px] font-black text-[#2D2D2D] mb-3">Matriz Projeto × Disciplina</h3>
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
                      {code}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredProjects.map((project, linha) => (
                  <tr key={project.projectCode} className={linha % 2 === 1 ? 'bg-[#FAFAFB]' : 'bg-white'}>
                    <td className={`sticky left-0 z-10 min-w-[190px] whitespace-nowrap py-3 px-4 text-[12px] font-bold text-[#2D2D2D] shadow-[1px_0_0_0_#F1F5F9] ${linha % 2 === 1 ? 'bg-[#FAFAFB]' : 'bg-white'}`}>
                      {project.projectCode} · {project.projectName}
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
                                <button
                                  key={family.family}
                                  type="button"
                                  disabled={familyAlerts.length === 0}
                                  onClick={() => setOpenFamilyAlerts(familyAlerts)}
                                  title={`${family.family}: ${family.delivered}/${family.applicable}`}
                                  className={`inline-flex h-7 min-w-[44px] items-center justify-center gap-1 rounded-md border px-1.5 text-[10px] font-bold ${className} ${severity ? severityRing(severity) : ''} ${familyAlerts.length ? 'cursor-pointer' : 'cursor-default'}`}
                                >
                                  {family.family} {icon}
                                </button>
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
