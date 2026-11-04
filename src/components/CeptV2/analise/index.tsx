// Gerenciamento > Analise das OS (CEPT v2). Conteudo = origem (E), layout = F0 §6.
// Dados: tempo real via src/lib/cept/data.ts (substitui o polling de 5 min).
import { Fragment, useEffect, useMemo, useState, type ReactNode } from 'react';
import { getAuth } from 'firebase/auth';
import { Eraser, FileText, RefreshCw, SlidersHorizontal } from 'lucide-react';
import PdfOptions from './PdfOptions';
import { ensureFirebaseAuth, getDb } from '../../../lib/firebaseDb';
import type { PdfExportOptions } from '../../../lib/pdfExport';
import { ceptComponentId, saveCeptValidationBatch, subscribeCeptCollection } from '../../../lib/cept/data';
import {
  applyResponsibilities, buildCeptModel, buildResponsibilityMap, CEPT_OS061, staleMessage,
  type CeptAction, type CeptComponenteDoc, type CeptModel, type CeptResponsabilidadeRow, type CeptValidacaoDoc,
} from '../../../lib/cept/rules';
import {
  ALERT_OPTIONS, applyFilters, deliverableLabel, EMPTY_FILTERS, filterCount, filterDescription, filterOptions, fmtDate, fmtTime, groupPercent, historyRows,
  kpis, NATURE_OPTIONS, SEV_LABEL, toMillis, toRecords, validationHistory,
  type AlteracaoDoc, type DetailCtx, type FeedGroup, type Filters, type Rec,
} from './model';
import { Banner, btnGhost, btnPrimary, DateFilterControl, focusRing, MultiFilter, SEV_TOKEN } from './Ui';
import { ChartCard, DeliverableBars, disciplineHeight, GroupBars, ProjectBars, responsibleHeight, StatusCharts } from './Charts';
import { Matrix } from './Matrix';
import { DetailModal, HistoryFeed, HistoryModal, OverviewModal, ValidationModal, type HistoryStart } from './Modals';
import { exportDetailPdf, exportExecutivePdf, exportHistoryCsv, exportHistoryPdf, exportMatrixPdf, exportOverviewPdf, exportValidationPdf, OS_LABEL } from './exports';

const OS = CEPT_OS061.osCode;
const OS_KEY = 'quanta-dashboard-active-os-v1';
type FilterKey = 'project' | 'discipline' | 'deliverable' | 'nature' | 'alert' | 'responsible';

export default function CeptAnaliseOS({ currentUser }: { currentUser?: { email?: string; isAdmin?: boolean } | null }) {
  const [reloadKey, setReloadKey] = useState(0);
  const [comps, setComps] = useState<CeptComponenteDoc[] | null>(null);
  const [vals, setVals] = useState<CeptValidacaoDoc[]>([]);
  const [plan, setPlan] = useState<CeptResponsabilidadeRow[]>([]);
  const [alts, setAlts] = useState<AlteracaoDoc[]>([]);
  const [validators, setValidators] = useState<string[]>([]);
  const [model, setModel] = useState<CeptModel | null>(null);
  const [error, setError] = useState('');
  const [online, setOnline] = useState(() => typeof navigator === 'undefined' || navigator.onLine);
  const [streams, setStreams] = useState<Record<string, boolean>>({});
  const [readErrors, setReadErrors] = useState<Record<string, string>>({});
  const [loadedAt, setLoadedAt] = useState(0);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [openFilter, setOpenFilter] = useState<FilterKey | 'date' | ''>('');
  const [mobileFilters, setMobileFilters] = useState(false);
  const [view, setView] = useState<'dashboard' | 'matrix'>('dashboard');
  const [detail, setDetail] = useState<DetailCtx | null>(null);
  const [overview, setOverview] = useState<'projects' | 'disciplines' | null>(null);
  const [validationKey, setValidationKey] = useState('');
  const [history, setHistory] = useState<HistoryStart | null>(null);
  const [pdfReq, setPdfReq] = useState<{ title: string; run: (o: PdfExportOptions) => void | Promise<void> } | null>(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    const on = () => setOnline(true); const off = () => setOnline(false);
    window.addEventListener('online', on); window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);
  const ready = Object.keys(streams).length === 5 && Object.values(streams).every(Boolean);
  const live = online && ready && !Object.values(readErrors).some(Boolean);
  const displayError = [error, ...Object.entries(readErrors).filter(([, v]) => v).map(([key, v]) => `${key}: ${v}`)].filter(Boolean).join(' · ');

  // Tempo real: 5 colecoes da OS. Erro mantem os dados antigos na tela (E §10).
  useEffect(() => {
    let off: Array<() => void> = [];
    let cancelled = false;
    setStreams({}); setReadErrors({});
    const receive = <T,>(key: string, set: (rows: T[]) => void) => (rows: T[]) => {
      if (cancelled) return;
      set(rows); setLoadedAt(Date.now());
      setStreams((s) => ({ ...s, [key]: true }));
      setReadErrors((s) => ({ ...s, [key]: '' }));
    };
    const fail = (key: string) => (e: Error) => {
      if (cancelled) return;
      setReadErrors((s) => ({ ...s, [key]: e.message }));
    };
    ensureFirebaseAuth().then(() => {
      if (cancelled) return;
      off = [
        subscribeCeptCollection<CeptComponenteDoc>('componentes', OS, receive('componentes', setComps), fail('componentes')),
        subscribeCeptCollection<CeptValidacaoDoc>('validacoes', OS, receive('validacoes', setVals), fail('validacoes')),
        subscribeCeptCollection<CeptResponsabilidadeRow>('planejamento', OS, receive('planejamento', setPlan), fail('planejamento')),
        subscribeCeptCollection<Omit<AlteracaoDoc, 'id'>>('alteracoes', OS, receive('alteracoes', setAlts), fail('alteracoes')),
        subscribeCeptCollection<{ emails?: string[] }>('config', OS, receive('config', (rows) => setValidators(rows.find((r) => r.id === 'validadores')?.emails || [])), fail('config')),
      ];
    }).catch(fail('auth'));
    return () => { cancelled = true; off.forEach((f) => f()); };
  }, [reloadKey]);

  useEffect(() => {
    if (!comps || !ready) return;
    let stale = false;
    buildCeptModel(comps, vals).then((m) => {
      if (stale) return;
      applyResponsibilities(m.projects, buildResponsibilityMap(plan).map);
      setModel(m);
    }).catch((e: Error) => { if (!stale) setError(e.message); });
    return () => { stale = true; };
  }, [comps, vals, plan, ready]);

  // Esc e clique fora fecham menus de filtro (origem).
  useEffect(() => {
    if (!openFilter) return;
    const down = (e: MouseEvent) => { if (!(e.target as HTMLElement).closest('[data-cept-filter]')) setOpenFilter(''); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpenFilter(''); };
    document.addEventListener('mousedown', down); document.addEventListener('keydown', key);
    return () => { document.removeEventListener('mousedown', down); document.removeEventListener('keydown', key); };
  }, [openFilter]);

  const records = useMemo(() => (model ? toRecords(model) : []), [model]);
  const filtered = useMemo(() => applyFilters(records, filters), [records, filters]);
  const options = useMemo(() => (model ? filterOptions(model, records) : null), [model, records]);
  const hist = useMemo(() => historyRows(alts, records, (r) => ceptComponentId(OS, r.projectCode, r.disciplineCode, r.sourceType)), [alts, records]);
  const filteredKeys = useMemo(() => new Set(filtered.map((r) => r.recordKey)), [filtered]);
  const histFiltered = useMemo(() => hist.filter((h) => filteredKeys.has(h.recordKey)), [hist, filteredKeys]);

  // Selecao que sumiu das opcoes apos recarga sai do filtro (E §3.2).
  useEffect(() => {
    if (!options) return;
    setFilters((f) => {
      const keep = (v: string[], opts: string[]) => v.filter((x) => opts.includes(x));
      const next = { ...f, project: keep(f.project, options.project), discipline: keep(f.discipline, options.discipline), deliverable: keep(f.deliverable, options.deliverable), responsible: keep(f.responsible, options.responsible) };
      return JSON.stringify(next) === JSON.stringify(f) ? f : next;
    });
  }, [options]);
  useEffect(() => { try { localStorage.setItem(OS_KEY, OS); } catch { /* modo privado */ } }, []);

  const email = String(currentUser?.email || (model ? getAuth(getDb().app).currentUser?.email : '') || '').trim().toLowerCase();
  const canEdit = live && !!email && validators.map((v) => String(v).trim().toLowerCase()).includes(email);
  const k = kpis(filtered);
  const projectLabel = options?.projectLabel || {};
  const filterText = filterDescription(filters, projectLabel);
  const lastUpdatedMs = Math.max(0, ...(comps || []).map((c) => toMillis((c as unknown as { updatedAt?: unknown }).updatedAt)));
  const sourceUpdated = lastUpdatedMs ? `${fmtDate(lastUpdatedMs)} ${fmtTime(lastUpdatedMs)}` : '';
  const unidentified = model ? model.projects.flatMap((p) => Object.values(p.disciplines)).filter((d) => d.responsibleKind === 'unidentified').length : 0;
  const nFilters = filterCount(filters);
  const setF = <K extends keyof Filters>(key: K, v: Filters[K]) => setFilters((f) => ({ ...f, [key]: v }));
  const recByKey = (key: string) => records.find((r) => r.recordKey === key);

  const requestPdf = (title: string, run: (o: PdfExportOptions) => void | Promise<void>) => setPdfReq({ title, run });
  const openDetail = (ctx: DetailCtx) => { setOverview(null); setDetail(ctx); };
  const openFamilyAlert = (familyKey: string) => {
    const recs = filtered.filter((r) => `${r.projectCode}|${r.disciplineCode}|${r.family}` === familyKey && r.sev !== 'none');
    if (recs.length === 1) setValidationKey(recs[0].recordKey);
    else if (recs.length > 1) openDetail({ kind: 'familyAlerts', value: familyKey, title: 'Alertas da família — lista' });
    else setError('Este alerta não está mais ativo no filtro atual. Atualize o dashboard.');
  };
  const submit = async (action: CeptAction, recs: Rec[], observation = '') => {
    if (!model) throw new Error('Os dados da OS ainda não foram carregados.');
    try {
      const res = await saveCeptValidationBatch({
        osCode: OS, action, observation, model,
        items: recs.map((r) => ({ projectCode: r.projectCode, discipline: r.disciplineCode, family: r.family, sourceType: r.sourceType, signature: r.signature, recordKey: r.recordKey })),
      });
      const warn = res.staleCount ? staleMessage(res.staleCount)
        : !res.savedCount && res.skippedCount ? 'O estado atual não possui alerta automático. O histórico permanece disponível.' : null;
      return { saved: res.savedCount, warn };
    } catch (e) {
      const code = (e as { code?: string }).code;
      throw new Error(code === 'permission-denied' ? 'Seu usuário não possui permissão para alterar validações do CEPT.' : (e as Error).message);
    }
  };
  const switchOs = (code: string) => {
    if (code === OS) return;
    try { localStorage.setItem(OS_KEY, code); } catch { /* modo privado */ }
    setFilters(EMPTY_FILTERS); // U8: trocar de OS zera filtros e data
  };

  const filterUi = options && (
    <>
      <MultiFilter label="Projeto" value={filters.project} options={options.project} labelOf={(v) => projectLabel[v] || v} open={openFilter === 'project'} onOpen={(o) => setOpenFilter(o ? 'project' : '')} onChange={(v) => setF('project', v)} />
      {/* ponytail: OS061 nao tem subprojeto; filtro desabilitado como na origem. OS054 traz as opcoes. */}
      <MultiFilter label="Subprojeto" value={[]} options={[]} disabled open={false} onOpen={() => undefined} onChange={() => undefined} />
      <MultiFilter label="Disciplina" defaultText="Todas" value={filters.discipline} options={options.discipline} open={openFilter === 'discipline'} onOpen={(o) => setOpenFilter(o ? 'discipline' : '')} onChange={(v) => setF('discipline', v)} />
      <MultiFilter label="Entregável" value={filters.deliverable} options={options.deliverable} labelOf={deliverableLabel} open={openFilter === 'deliverable'} onOpen={(o) => setOpenFilter(o ? 'deliverable' : '')} onChange={(v) => setF('deliverable', v)} />
      <MultiFilter label="Natureza do arquivo" value={filters.nature} options={Object.keys(NATURE_OPTIONS)} labelOf={(v) => NATURE_OPTIONS[v]} open={openFilter === 'nature'} onOpen={(o) => setOpenFilter(o ? 'nature' : '')} onChange={(v) => setF('nature', v)} />
      <MultiFilter label="Alertas" value={filters.alert} options={Object.keys(ALERT_OPTIONS)} labelOf={(v) => ALERT_OPTIONS[v]} open={openFilter === 'alert'} onOpen={(o) => setOpenFilter(o ? 'alert' : '')} onChange={(v) => setF('alert', v)} />
      <MultiFilter label="Responsável" value={filters.responsible} options={options.responsible} open={openFilter === 'responsible'} onOpen={(o) => setOpenFilter(o ? 'responsible' : '')} onChange={(v) => setF('responsible', v)} />
      <DateFilterControl value={filters.date} onChange={(d) => setF('date', d)} open={openFilter === 'date'} onOpen={(o) => setOpenFilter(o ? 'date' : '')} />
      <div className="flex items-end">
        <button type="button" disabled={!nFilters} title={`Limpar filtros (${nFilters})`} aria-label={`Limpar filtros (${nFilters})`} onClick={() => setFilters(EMPTY_FILTERS)}
          className={`relative inline-flex h-10 w-10 items-center justify-center rounded-lg border ${nFilters ? 'border-[#F05D28] text-[#F05D28]' : 'border-[#E5E7EB] text-[#94A3B8]'} disabled:cursor-not-allowed ${focusRing}`}>
          <Eraser size={16} aria-hidden />
          {nFilters > 0 && <span className="absolute -right-1.5 -top-1.5 rounded-full bg-[#F05D28] px-1.5 text-[10px] font-bold text-white">{nFilters}</span>}
        </button>
      </div>
    </>
  );

  const kpiCard = (label: string, value: string, sub: ReactNode, border: string, onClick: () => void) => (
    <div className="rounded-2xl border border-white bg-white shadow-[0_18px_40px_-28px_rgba(15,23,42,.55)]" style={{ borderTop: `4px solid ${border}` }}>
      <button type="button" onClick={onClick} className={`block w-full rounded-t-2xl px-4 pt-3 text-left ${focusRing}`}>
        <span className="block text-[11px] font-bold uppercase tracking-[.04em] text-[#64748B]">{label}</span>
        <span className="block text-[28px] font-extrabold tabular-nums">{value}</span>
      </button>
      <div className="px-4 pb-3 text-[12px] text-[#64748B]">{sub}</div>
    </div>
  );
  const sevLink = (s: 'red' | 'yellow' | 'green', n: number, word: string) => (
    <button type="button" onClick={() => openDetail({ kind: 'alertSeverity', value: s, title: `Alertas ${SEV_LABEL[s].toLowerCase()} — lista` })}
      className={`underline decoration-dotted underline-offset-2 ${focusRing}`} style={{ color: SEV_TOKEN[s].text }}>{n} {word}</button>
  );

  return (
    <div className="space-y-4 text-[#2D2D2D]">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[20px] font-bold">{OS_LABEL} | Compatibilização Final</h1>
          <p className="text-[12px] text-[#64748B]">EcoQuanta - Gestão de Projetos</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div role="group" aria-label="Ordem de serviço" className="inline-flex rounded-xl bg-[#F1F5F9] p-1">
            {['054', '061'].map((c) => (
              <button key={c} type="button" aria-pressed={c === OS} disabled={c !== OS} title={c === '054' ? 'OS054 depende do Sincronizador' : undefined} onClick={() => switchOs(c)}
                className={`h-8 rounded-lg px-3 text-[12px] font-bold disabled:opacity-50 ${focusRing} ${c === OS ? 'bg-[#F05D28] text-white' : 'text-[#475569]'}`}>OS {c}</button>
            ))}
          </div>
          <span role="status" className={`inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[12px] font-bold ${live ? 'bg-[#F0FDF4] text-[#15803D]' : 'bg-[#FFFBEB] text-[#B45309]'}`}>
            <span aria-hidden className={`h-2 w-2 rounded-full ${live ? 'bg-[#16A34A]' : 'bg-[#D97706]'}`} />
          {live ? 'Conectado · dados recebidos' : loadedAt ? `${online ? 'Dados parciais' : 'Sem conexão'} · recebidos às ${fmtTime(loadedAt)}` : 'Conectando...'}
          </span>
          <button type="button" aria-label="Atualizar dados" title="Atualizar dados" onClick={() => setReloadKey((n) => n + 1)} className={`${btnGhost} w-9 px-0`}><RefreshCw size={16} aria-hidden /></button>
          <button type="button" disabled={!model || exporting} className={btnPrimary}
            onClick={() => requestPdf('Relatório PDF', (o) => exportExecutivePdf(filtered, filterText, sourceUpdated, o))}>
            <FileText size={14} aria-hidden />{exporting ? 'Gerando PDF...' : 'Relatório PDF'}
          </button>
        </div>
      </header>

      <div className="sticky top-0 z-30 rounded-2xl bg-white/90 p-4 shadow-[0_10px_30px_-22px_rgba(15,23,42,0.45)] backdrop-blur">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div role="tablist" aria-label="Visão" className="inline-flex rounded-xl bg-[#F1F5F9] p-1">
            {(['dashboard', 'matrix'] as const).map((v) => (
              <button key={v} type="button" role="tab" aria-selected={view === v} onClick={() => setView(v)}
                className={`h-8 rounded-lg px-3 text-[12px] font-bold ${focusRing} ${view === v ? 'bg-[#F05D28] text-white' : 'text-[#475569]'}`}>{v === 'dashboard' ? 'Dashboard' : 'Matriz'}</button>
            ))}
          </div>
          <button type="button" aria-expanded={mobileFilters} onClick={() => setMobileFilters((o) => !o)} className={`${btnGhost} md:hidden`}><SlidersHorizontal size={14} aria-hidden />Filtros ({nFilters})</button>
        </div>
        <div className={`${mobileFilters ? 'grid' : 'hidden'} grid-cols-1 gap-3 sm:grid-cols-2 md:grid lg:grid-cols-4 xl:grid-cols-[repeat(8,minmax(0,1fr))_auto]`}>{filterUi}</div>
      </div>

      {displayError && <Banner tone="error" action={<button type="button" className={btnGhost} onClick={() => { setError(''); setReloadKey((n) => n + 1); }}>Tentar de novo</button>}>{displayError}</Banner>}
      {unidentified > 0 && <Banner tone="warn">{unidentified} combinações Projeto × Disciplina estão sem responsável inequívoco e foram marcadas como "Responsável não identificado".</Banner>}
      <p className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-[#64748B]">
        <span><span aria-hidden className="mr-1 inline-block h-2 w-2 rounded-full bg-[#F05D28]" />Última atualização: {sourceUpdated || '—'}</span>
        <span>Fonte: dados do CEPT</span>
        <span>Dados carregados: {loadedAt ? `${fmtDate(loadedAt)} ${fmtTime(loadedAt)}` : '—'}</span>
        <span>Responsáveis: Planejamento</span>
        <span>Validações: histórico de decisões</span>
      </p>

      {!model && !displayError && (
        <div role="status" className="space-y-4">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">{Array.from({ length: 6 }, (_, i) => <div key={i} className="h-[104px] animate-pulse rounded-2xl bg-white motion-reduce:animate-none" />)}</div>
          <p className="flex items-center justify-center gap-2 text-[13px] text-[#64748B]"><RefreshCw size={16} className="animate-spin motion-reduce:animate-none" aria-hidden />Atualizando dados...</p>
        </div>
      )}
      {model && !records.length && <p className="rounded-2xl bg-white p-10 text-center text-[13px] text-[#64748B]">Nenhum registro para os filtros selecionados.</p>}

      {model && view === 'dashboard' && (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
            {kpiCard('Conclusão', `${k.percent}%`, 'Entregáveis aplicáveis concluídos', '#F05D28', () => openDetail({ kind: 'applicable', title: 'Aplicáveis — lista' }))}
            {kpiCard('Disponibilizados', String(k.delivered), 'Checks confirmados', '#16A34A', () => openDetail({ kind: 'status', value: 'delivered', title: 'Disponibilizados — lista' }))}
            {kpiCard('Pendentes', String(k.pending), 'Entregáveis ainda sem check', '#EA580C', () => openDetail({ kind: 'status', value: 'pending', title: 'Pendentes — lista' }))}
            {kpiCard('Alertas', String(k.red + k.yellow), <span className="flex flex-wrap gap-x-2">{sevLink('red', k.red, 'vermelhos')}{sevLink('yellow', k.yellow, 'amarelos')}{sevLink('green', k.green, 'validados')}</span>, '#D97706', () => openDetail({ kind: 'alerts', title: 'Alertas — lista' }))}
            {kpiCard('Projetos', String(k.projects), 'No filtro atual', '#475569', () => setOverview('projects'))}
            {kpiCard('Disciplinas', String(k.disciplines), 'No filtro atual', '#475569', () => setOverview('disciplines'))}
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <ChartCard id="status" title="Situação geral" subtitle="Entregas e alertas no filtro atual" onList={() => openDetail({ kind: 'all', title: 'Dados da situação geral' })}>
              <StatusCharts records={filtered}
                onStatus={(s) => openDetail({ kind: 'status', value: s, title: `${s === 'delivered' ? 'Disponibilizados' : 'Pendentes'} — lista` })}
                onSeverity={(s) => openDetail({ kind: 'alertSeverity', value: s, title: `Alertas ${SEV_LABEL[s].toLowerCase()} — lista` })} />
            </ChartCard>
            <HistoryFeed rows={histFiltered} onOpenFamily={(row) => setHistory({ level: 'family', row })} onOpenGroup={(g: FeedGroup, label) => setHistory({ level: 'general', group: { key: g, label } })} />
          </div>
          <ChartCard id="project" title="Conclusão por projeto" subtitle="Laranja = crítico · cinza-azulado = normal · teal = forte" onList={() => openDetail({ kind: 'all', title: 'Dados por projeto' })}>
            <ProjectBars records={filtered} projectName={(c) => model.projects.find((p) => p.code === c)?.name || c} onSelect={(c) => openDetail({ kind: 'project', value: c, title: `Projeto — ${projectLabel[c] || c}` })} />
          </ChartCard>
          <ChartCard id="deliverable" title="Conclusão por tipo de entregável" subtitle="IFC isolado · PRJ, MD, MC e RL em pares Edit/PDF · cor = conclusão" onList={() => openDetail({ kind: 'clientDeliverables', title: 'Dados por tipo de entregável' })}>
            <DeliverableBars records={filtered} onComponent={(key) => openDetail({ kind: 'deliverableComponent', value: key, title: `${deliverableLabel(key)} — detalhamento` })}
              onGroup={(g) => openDetail({ kind: 'deliverableGroup', value: g, title: `${g} — detalhamento` })} />
          </ChartCard>
          <div className="grid gap-4 lg:grid-cols-2">
            <ChartCard id="discipline" title="Conclusão por disciplina" subtitle="Laranja = crítico · cinza-azulado = normal · teal = forte" onList={() => openDetail({ kind: 'all', title: 'Dados por disciplina' })}>
              <GroupBars groups={groupPercent(filtered, (r) => r.disciplineCode)} heightOf={disciplineHeight} yWidth={60} onSelect={(d) => openDetail({ kind: 'discipline', value: d, title: `Disciplina — ${d}` })} />
            </ChartCard>
            <ChartCard id="responsible" title="Conclusão por responsável" subtitle="Equipe interna e terceirizados · clique para abrir a lista de cobrança" onList={() => openDetail({ kind: 'all', title: 'Dados por responsável' })}>
              <GroupBars groups={groupPercent(filtered.filter((r) => r.responsible), (r) => r.responsible)} heightOf={responsibleHeight} yWidth={150} onSelect={(r) => openDetail({ kind: 'responsible', value: r, title: `Responsável — ${r}` })} />
            </ChartCard>
          </div>
        </>
      )}

      {model && records.length > 0 && view === 'matrix' && (
        <Matrix model={model} all={records} filtered={filtered} filters={filters}
          onDetail={(kind, value, title) => openDetail({ kind, value, title })} onFamilyAlert={openFamilyAlert}
          onExport={(full) => requestPdf(full ? 'PDF · matriz completa' : 'PDF · filtro atual', (o) => exportMatrixPdf(model, records, full ? records : filtered, full ? EMPTY_FILTERS : filters, full, full ? filterDescription(EMPTY_FILTERS, projectLabel) : filterText, sourceUpdated, o))} />
      )}

      {detail && (
        <Fragment key={`${detail.kind}:${detail.value || ''}`}><DetailModal ctx={detail} records={filtered} canEdit={canEdit} subtitle={filterText} onClose={() => setDetail(null)}
          onOpenValidation={setValidationKey}
          onBatch={async (action, recs) => (await submit(action, recs)).warn}
          requestPdf={requestPdf} exportPdf={(t, s, rec, rows, o) => exportDetailPdf(t, s, rec, rows, sourceUpdated, o)} /></Fragment>
      )}
      {overview && (
        <OverviewModal kind={overview} records={filtered} subtitle={filterText} onClose={() => setOverview(null)} onDetail={openDetail}
          requestPdf={requestPdf} exportPdf={(kind, rows, extra, q, o) => exportOverviewPdf(kind, rows, extra, filterText, q, o)} />
      )}
      {validationKey && (
        <Fragment key={validationKey}><ValidationModal rec={recByKey(validationKey)} canEdit={canEdit} userEmail={email} history={validationHistory(vals, validationKey)}
          onClose={() => setValidationKey('')}
          onSubmit={(action, obs) => { const r = recByKey(validationKey); return r ? submit(action, [r], obs) : Promise.reject(new Error('Este alerta não está mais ativo no filtro atual. Atualize o dashboard.')); }}
          requestPdf={requestPdf} exportPdf={exportValidationPdf} /></Fragment>
      )}
      {history && (
        <HistoryModal rows={histFiltered} start={history} onClose={() => setHistory(null)} onCsv={exportHistoryCsv} requestPdf={requestPdf} exportPdf={exportHistoryPdf} />
      )}
      {pdfReq && (
        <PdfOptions title={pdfReq.title} onCancel={() => setPdfReq(null)}
          onConfirm={async (o) => {
            const run = pdfReq.run; setPdfReq(null); setExporting(true);
            try { await run(o); } catch (e) { setError((e as Error).message || 'Biblioteca de PDF indisponível.'); } finally { setExporting(false); }
          }} />
      )}
    </div>
  );
}
