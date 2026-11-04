// Analise das OS (CEPT v2) - derivacoes puras da tela: achatar, filtrar, agrupar, rotular.
// Regras de negocio vem de src/lib/cept/rules.ts; aqui so o que E (mapa da UI) define.
import {
  applicablePercent,
  type CeptComponent, type CeptDisplaySeverity, type CeptModel, type CeptStatus, type CeptValidacaoDoc,
} from '../../../lib/cept/rules';

export const STATUS_LABEL: Record<CeptStatus, string> = { delivered: 'Disponibilizado', pending: 'Pendente', na: 'Não aplicável', unknown: 'Não determinado' };
export const SEV_LABEL: Record<CeptDisplaySeverity, string> = { red: 'Vermelho', yellow: 'Amarelo', green: 'Validado', none: 'Sem alerta' };
export const VAL_LABEL: Record<string, string> = { resolved: 'Resolvido / validado', confirmed_outdated: 'Desatualização confirmada', open: 'Reaberto', unreviewed: 'Não verificado' };
export const ACTION_LABEL: Record<string, string> = { RESOLVED: 'Resolvido / validado', CONFIRMED_OUTDATED: 'Desatualização confirmada', REOPENED: 'Alerta reaberto' };
export const NATURE_OPTIONS: Record<string, string> = { editable: 'Editáveis', noneditable: 'Não editáveis' };
export const ALERT_OPTIONS: Record<string, string> = { red: 'Vermelho', yellow: 'Amarelo', green: 'Validado / Verde', none: 'Sem alerta' };

export interface Rec extends CeptComponent {
  projectName: string;
  responsible: string;
  responsibleKind: string;
  responsibilitySource: string;
  delivKey: string;
  chartKey: string;
  sev: CeptDisplaySeverity;
}

export type DateMode = '' | 'until' | 'between' | 'after';
export interface DateFilter { mode: DateMode; from: string; to: string } // iso AAAA-MM-DD
export interface Filters {
  project: string[]; subproject: string[]; discipline: string[]; deliverable: string[];
  nature: string[]; alert: string[]; responsible: string[]; date: DateFilter;
}
export const EMPTY_FILTERS: Filters = { project: [], subproject: [], discipline: [], deliverable: [], nature: [], alert: [], responsible: [], date: { mode: '', from: '', to: '' } };

export const norm = (v: unknown) => String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
export const ptSort = (a: string, b: string) => a.localeCompare(b, 'pt-BR', { numeric: true });

// E §3.4
export const displayFamily = (f: string) => (f === 'RT' ? 'RL' : f === 'RVT' || f === 'PDF' ? 'PRJ' : f);
const isRl = (f: string, catalog: string[]) => f === 'RT' || (f === 'ET/RT' && !catalog.includes('RT'));
export function deliverableKey(c: CeptComponent, catalog: string[]) {
  if (c.family === 'IFC') return 'IFC';
  if (c.family === 'RVT') return 'PRJ_EDIT';
  if (c.family === 'PDF') return 'PRJ_PDF';
  const base = isRl(c.family, catalog) ? 'RL' : displayFamily(c.family);
  if (c.editable === true || c.format === 'EDIT' || c.sourceType.includes('Editável')) return base + '_EDIT';
  if (c.editable === false || c.format === 'PDF' || c.sourceType.includes('PDF')) return base + '_PDF';
  return c.family;
}
export function chartKey(c: CeptComponent, catalog: string[]) {
  if (c.family === 'IFC') return 'IFC';
  if (c.family === 'RVT') return 'PRJ_EDIT';
  if (c.family === 'PDF') return 'PRJ_PDF';
  const base = isRl(c.family, catalog) ? 'RL' : c.family;
  if (!['MD', 'MC', 'RL'].includes(base) || c.editable === null) return ''; // B8 copiado: ET puro, MA e null ficam fora
  return base + (c.editable ? '_EDIT' : '_PDF');
}
export const deliverableLabel = (k: string) => (k.endsWith('_EDIT') ? k.slice(0, -5) + ' Edit.' : k.endsWith('_PDF') ? k.slice(0, -4) + ' PDF' : k);
const DELIV_ORDER = ['IFC', 'PRJ_EDIT', 'PRJ_PDF', 'MD_EDIT', 'MD_PDF', 'MC_EDIT', 'MC_PDF', 'ET_EDIT', 'ET_PDF', 'RL_EDIT', 'RL_PDF'];
export const CHART_COMPONENTS = ['IFC', 'PRJ_EDIT', 'PRJ_PDF', 'MD_EDIT', 'MD_PDF', 'MC_EDIT', 'MC_PDF', 'RL_EDIT', 'RL_PDF'];
export const CHART_GROUPS = ['IFC', 'PRJ', 'MD', 'MC', 'RL'];
/** Rotulo de linha de familia na matriz: PRJ duplicado vira "PRJ Ed." / "PRJ PDF" (B11). */
export const matrixFamilyCode = (f: string) => (f === 'RVT' ? 'PRJ Ed.' : f === 'PDF' ? 'PRJ PDF' : displayFamily(f));

/** Todos os componentes com responsavel/chaves (sem filtro). */
export function toRecords(model: CeptModel): Rec[] {
  const out: Rec[] = [];
  model.projects.forEach((p) => Object.values(p.disciplines).forEach((d) => Object.values(d.items).forEach((i) => i.components.forEach((c) => {
    out.push({
      ...c, projectName: p.name, responsible: d.responsible || '', responsibleKind: d.responsibleKind || '', responsibilitySource: d.responsibilitySource || '',
      delivKey: deliverableKey(c, model.familyCatalog), chartKey: chartKey(c, model.familyCatalog), sev: c.alert.displaySeverity || 'none',
    });
  }))));
  return out;
}

export const dateFilterValid = (d: DateFilter) =>
  (d.mode === 'until' || d.mode === 'after') ? !!d.from : d.mode === 'between' ? !!d.from && !!d.to && d.from <= d.to : false;

/** E §3.5 - ordem dos testes da origem. Subprojeto: OS061 nao tem, filtro fica desabilitado. */
export function applyFilters(records: Rec[], f: Filters): Rec[] {
  const has = (a: string[]) => a.length > 0;
  const dateOn = dateFilterValid(f.date);
  return records.filter((r) => {
    if (has(f.project) && !f.project.includes(r.projectCode)) return false;
    if (has(f.subproject)) return false;
    if (has(f.discipline) && !f.discipline.includes(r.disciplineCode)) return false;
    if (has(f.responsible) && !f.responsible.includes(r.responsible)) return false;
    if (has(f.deliverable) && !f.deliverable.includes(r.delivKey)) return false;
    if (has(f.nature) && !f.nature.includes(r.nature)) return false; // B12 copiado: unknown sai
    if (has(f.alert) && (r.status === 'na' || !f.alert.includes(r.sev))) return false;
    if (dateOn) {
      if (!r.dateIso) return false;
      if (f.date.mode === 'until' && !(r.dateIso <= f.date.from)) return false;
      if (f.date.mode === 'after' && !(r.dateIso > f.date.from)) return false;
      if (f.date.mode === 'between' && !(r.dateIso >= f.date.from && r.dateIso <= f.date.to)) return false;
    }
    return true;
  });
}

export function filterOptions(model: CeptModel, records: Rec[]) {
  const deliv = [...new Set(records.filter((r) => r.status !== 'na').map((r) => r.delivKey))]
    .sort((a, b) => { const ia = DELIV_ORDER.indexOf(a); const ib = DELIV_ORDER.indexOf(b); return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || ptSort(a, b); });
  const responsibles = [...new Set(records.map((r) => r.responsible).filter(Boolean))].sort(ptSort);
  return {
    project: model.projects.map((p) => p.code).sort(ptSort),
    projectLabel: Object.fromEntries(model.projects.map((p) => [p.code, `${p.code} - ${p.name}`])) as Record<string, string>,
    discipline: model.disciplineCatalog.filter((d) => model.projects.some((p) => p.disciplines[d])),
    deliverable: deliv,
    responsible: responsibles,
  };
}

export function filterCount(f: Filters) {
  return f.project.length + f.subproject.length + f.discipline.length + f.deliverable.length + f.nature.length + f.alert.length + f.responsible.length + (dateFilterValid(f.date) ? 1 : 0);
}

export const isoToDisplay = (iso: string) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(2, 4)}` : '');
export function dateFilterText(d: DateFilter) {
  if (!dateFilterValid(d)) return 'Todas';
  if (d.mode === 'until') return `Até ${isoToDisplay(d.from)}`;
  if (d.mode === 'after') return `Depois de ${isoToDisplay(d.from)}`;
  return `${isoToDisplay(d.from)} a ${isoToDisplay(d.to)}`;
}
/** E §3.3: 6 ou 8 digitos DDMMAA[AA], data real. */
export function parseDigitsDate(digits: string): string | null {
  const s = digits.replace(/\D/g, '');
  if (s.length !== 6 && s.length !== 8) return null;
  const day = +s.slice(0, 2); const month = +s.slice(2, 4); const year = s.length === 6 ? 2000 + +s.slice(4, 6) : +s.slice(4, 8);
  const dt = new Date(Date.UTC(year, month - 1, day));
  if (dt.getUTCFullYear() !== year || dt.getUTCMonth() !== month - 1 || dt.getUTCDate() !== day) return null;
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** E §11 */
export function filterDescription(f: Filters, projectLabel: Record<string, string>) {
  const parts: string[] = [];
  const add = (name: string, vals: string[], lab: (v: string) => string = (v) => v) => { if (vals.length) parts.push(`${name}: ${vals.map(lab).join(', ')}`); };
  add('Projetos', f.project, (v) => projectLabel[v] || v);
  add('Subprojetos', f.subproject);
  add('Disciplinas', f.discipline);
  add('Entregáveis', f.deliverable, deliverableLabel);
  add('Natureza', f.nature, (v) => NATURE_OPTIONS[v] || v);
  add('Responsáveis', f.responsible);
  add('Alertas', f.alert, (v) => ALERT_OPTIONS[v] || v);
  if (dateFilterValid(f.date)) {
    const d = f.date;
    parts.push(d.mode === 'until' ? `Postagem até ${isoToDisplay(d.from)}` : d.mode === 'after' ? `Postagem depois de ${isoToDisplay(d.from)}` : `Postagem entre ${isoToDisplay(d.from)} e ${isoToDisplay(d.to)}`);
  }
  return parts.length ? `Filtros ativos: ${parts.join(' · ')}` : 'Todos os filtros do dashboard estão considerados.';
}

// ---------- KPIs e grupos (E §5.1/5.2) ----------
export function kpis(records: Rec[]) {
  const delivered = records.filter((r) => r.status === 'delivered').length;
  const pending = records.filter((r) => r.status === 'pending').length;
  const ap = records.filter((r) => r.status === 'delivered' || r.status === 'pending');
  const sev = (s: string) => records.filter((r) => r.sev === s).length;
  return {
    delivered, pending, applicable: delivered + pending, percent: applicablePercent(delivered, pending),
    red: sev('red'), yellow: sev('yellow'), green: sev('green'), none: sev('none'),
    unknown: records.filter((r) => r.status === 'unknown').length,
    projects: new Set(ap.map((r) => r.projectCode)).size, disciplines: new Set(ap.map((r) => r.disciplineCode)).size,
  };
}

export interface Group { key: string; label: string; delivered: number; pending: number; applicable: number; percent: number; count: number }
export function groupPercent(records: Rec[], keyOf: (r: Rec) => string, labelOf: (k: string) => string = (k) => k): Group[] {
  const map = new Map<string, Group>();
  records.forEach((r) => {
    if (r.status !== 'delivered' && r.status !== 'pending') return;
    const key = keyOf(r);
    if (!key) return;
    const g = map.get(key) || { key, label: labelOf(key), delivered: 0, pending: 0, applicable: 0, percent: 0, count: 0 };
    if (r.status === 'delivered') g.delivered++; else g.pending++;
    g.applicable++;
    map.set(key, g);
  });
  const out = [...map.values()];
  out.forEach((g) => { g.percent = applicablePercent(g.delivered, g.pending); });
  return out.sort((a, b) => ptSort(a.label, b.label));
}
/** E §5.2 performanceColor, tokens F0 §3.3 */
export const perfColor = (p: number) => (p < 40 ? '#EA580C' : p >= 80 ? '#115E59' : p >= 65 ? '#0F766E' : '#64748B');
/** Inteiro se a diferenca < 0,05; senao 1 casa com virgula (E §5.2). */
export function statusPercentText(part: number, total: number) {
  if (!total) return '0%';
  const v = part / total * 100;
  return Math.abs(v - Math.round(v)) < 0.05 ? `${Math.round(v)}%` : `${v.toFixed(1).replace('.', ',')}%`;
}

// ---------- Contextos do detalhe (E §7.1) ----------
export type DetailKind = 'all' | 'clientDeliverables' | 'status' | 'alerts' | 'alertSeverity' | 'applicable' | 'project' | 'projectParent'
  | 'deliverable' | 'deliverableComponent' | 'deliverableGroup' | 'family' | 'familyAlerts' | 'discipline' | 'responsible';
export interface DetailCtx { kind: DetailKind; value?: string; title: string }
export function contextRecords(records: Rec[], ctx: DetailCtx): Rec[] {
  const v = ctx.value || '';
  switch (ctx.kind) {
    case 'clientDeliverables': return records.filter((r) => r.chartKey);
    case 'status': return records.filter((r) => r.status === v);
    case 'alerts': return records.filter((r) => r.sev === 'red' || r.sev === 'yellow');
    case 'alertSeverity': return records.filter((r) => r.sev === v);
    case 'applicable': return records.filter((r) => r.status === 'delivered' || r.status === 'pending');
    case 'project': case 'projectParent': return records.filter((r) => r.projectCode === v);
    case 'deliverable': return records.filter((r) => r.delivKey === v);
    case 'deliverableComponent': return records.filter((r) => r.chartKey === v);
    case 'deliverableGroup': return records.filter((r) => r.chartKey.split('_')[0] === v);
    case 'family': return records.filter((r) => `${r.projectCode}|${r.disciplineCode}|${r.family}` === v);
    case 'familyAlerts': return records.filter((r) => `${r.projectCode}|${r.disciplineCode}|${r.family}` === v && r.sev !== 'none');
    case 'discipline': return records.filter((r) => r.disciplineCode === v);
    case 'responsible': return records.filter((r) => r.responsible === v);
    default: return records;
  }
}

export type Chip = '' | 'delivered' | 'pending' | 'applicable' | 'red' | 'yellow' | 'green';
export function applyChip(rows: Rec[], chip: Chip) {
  if (!chip) return rows;
  if (chip === 'applicable') return rows.filter((r) => r.status === 'delivered' || r.status === 'pending');
  if (chip === 'delivered' || chip === 'pending') return rows.filter((r) => r.status === chip);
  return rows.filter((r) => r.sev === chip);
}
export const componentLabel = (r: Rec) => `${matrixFamilyCode(r.family)} · ${r.sourceType}`;
export const validationText = (r: Rec) => (r.sev === 'green' ? VAL_LABEL.resolved : VAL_LABEL[r.validationStatus] || VAL_LABEL.unreviewed);
export const alertText = (r: Rec) => (r.sev !== 'none' ? SEV_LABEL[r.sev] : r.validationHistoryCount ? `Histórico (${r.validationHistoryCount})` : '—');
export function detailSearch(rows: Rec[], q: string) {
  const s = norm(q); // B3 corrigido: sem acento
  if (!s) return rows;
  return rows.filter((r) => norm([r.projectCode, r.projectName, r.disciplineCode, r.responsible, r.family, r.familyLabel, r.sourceType, r.format, r.natureLabel,
    STATUS_LABEL[r.status], r.date, r.dateFull, r.validationObservation, SEV_LABEL[r.sev], validationText(r), r.alert.reasons.map((x) => x.message).join(' ')].join(' ')).includes(s));
}
const STATUS_RANK: Record<string, number> = { pending: 0, delivered: 1, unknown: 2, na: 3 };
export type SortKey = 'project' | 'discipline' | 'responsible' | 'component' | 'status' | 'date' | 'alert' | 'validation';
export function sortRows(rows: Rec[], key: SortKey, dir: 1 | -1) {
  const val = (r: Rec): string | number => key === 'status' ? STATUS_RANK[r.status] : key === 'date' ? r.dateIso || '' // B1: cronologico
    : key === 'project' ? r.projectCode : key === 'discipline' ? r.disciplineCode : key === 'responsible' ? r.responsible
      : key === 'component' ? componentLabel(r) : key === 'alert' ? alertText(r) : validationText(r); // B2: rotulo exibido
  return [...rows].sort((a, b) => { const x = val(a); const y = val(b); return dir * (typeof x === 'number' ? x - (y as number) : ptSort(String(x), String(y))); });
}

// ---------- Historico (cept2Alteracoes) ----------
export interface AlteracaoDoc { id: string; colecao: string; docId: string; campo: string; antes: unknown; depois: unknown; userEmail: string; at: unknown }
export interface HistRow {
  id: string; ms: number; when: string; date: string; time: string; user: string; userEmail: string;
  projectCode: string; projectName: string; discipline: string; responsible: string; family: string; famGroup: string;
  sourceType: string; deliverable: string; editable: boolean | null; field: string; fieldLabel: string; change: string; recordKey: string;
}
export const toMillis = (v: unknown) => (v && typeof (v as { toMillis?: () => number }).toMillis === 'function' ? (v as { toMillis: () => number }).toMillis() : Number(v) || 0);
export function shortUser(email: string) {
  const local = String(email || '').split('@')[0];
  if (!local) return 'Operador não identificado';
  const [first, second] = local.split(/[._-]+/);
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  return second ? `${cap(first)} ${second.charAt(0).toUpperCase()}.` : cap(first);
}
const pad = (n: number) => String(n).padStart(2, '0');
export const fmtDate = (ms: number) => { const d = new Date(ms); return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`; };
export const fmtTime = (ms: number) => { const d = new Date(ms); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const histDeliverable = (r: Rec) => (r.family === 'RVT' ? 'PRJ Edit.' : r.family === 'PDF' ? 'PRJ PDF' : `${displayFamily(r.family)} ${r.editable ? 'Edit.' : 'PDF'}`);
const FIELD_LABEL: Record<string, string> = { status: 'Status', dateRaw: 'Data' };
const valText = (campo: string, v: unknown) => (campo === 'status' ? STATUS_LABEL[v as CeptStatus] || String(v ?? '—') : String(v ?? '') || '—');

/** Liga cada alteracao de cept2Componentes ao componente vivo (docId -> recordKey). */
export function historyRows(alteracoes: AlteracaoDoc[], all: Rec[], idOf: (r: Rec) => string): HistRow[] {
  const byId = new Map(all.map((r) => [idOf(r), r]));
  const out: HistRow[] = [];
  alteracoes.forEach((a) => {
    if (a.colecao !== 'cept2Componentes') return; // ponytail: so o que liga a componente aparece no feed (origem filtra por recordKey)
    const r = byId.get(a.docId);
    if (!r) return;
    const ms = toMillis(a.at);
    const before = valText(a.campo, a.antes); const after = valText(a.campo, a.depois);
    out.push({
      id: a.id, ms, when: `${fmtDate(ms)} ${fmtTime(ms)}`, date: fmtDate(ms), time: fmtTime(ms), user: shortUser(a.userEmail), userEmail: a.userEmail,
      projectCode: r.projectCode, projectName: r.projectName, discipline: r.disciplineCode, responsible: r.responsible, family: r.family,
      famGroup: displayFamily(r.family), sourceType: r.sourceType, deliverable: histDeliverable(r), editable: r.editable,
      field: a.campo, fieldLabel: FIELD_LABEL[a.campo] || a.campo, change: a.campo === 'dateRaw' ? `Data: ${before} → ${after}` : `${before} → ${after}`, recordKey: r.recordKey,
    });
  });
  return out.sort((a, b) => b.ms - a.ms);
}
export function histSearch(rows: HistRow[], q: string) {
  const s = norm(q);
  return s ? rows.filter((h) => norm([h.when, h.user, h.userEmail, h.projectCode, h.projectName, h.discipline, h.responsible, h.deliverable, h.fieldLabel, h.change].join(' ')).includes(s)) : rows;
}
export type FeedGroup = '' | 'project' | 'discipline' | 'responsible' | 'user';
export const feedGroupValue = (h: HistRow, g: FeedGroup) => g === 'project' ? `${h.projectCode} - ${h.projectName}` : g === 'discipline' ? h.discipline || 'Sem disciplina'
  : g === 'responsible' ? h.responsible || 'Responsável não identificado' : h.user || 'Operador não identificado';
/** E §5.3: por grupo = max(1, floor(total/nGrupos)); paginas = maior ceil(linhas/porGrupo). */
export function feedPage(rows: HistRow[], group: FeedGroup, perPage: number, page: number) {
  if (!group) return { pages: Math.max(1, Math.ceil(rows.length / perPage)), blocks: [{ label: '', total: rows.length, rows: rows.slice(page * perPage, (page + 1) * perPage) }] };
  const groups = new Map<string, HistRow[]>();
  rows.forEach((h) => { const k = feedGroupValue(h, group); groups.set(k, [...(groups.get(k) || []), h]); });
  const list = [...groups.entries()].sort((a, b) => b[1][0].ms - a[1][0].ms);
  const per = Math.max(1, Math.floor(perPage / Math.max(1, list.length)));
  const pages = Math.max(1, ...list.map(([, r]) => Math.ceil(r.length / per)));
  return { pages, blocks: list.map(([label, r]) => ({ label, total: r.length, rows: r.slice(page * per, (page + 1) * per) })).filter((b) => b.rows.length) };
}

// ---------- Historico de validacao ----------
export function validationHistory(vals: CeptValidacaoDoc[], recordKey: string) {
  return vals.filter((v) => v.recordKey === recordKey || `${v.projectCode}|${v.disciplineCode}|${v.family}|${v.sourceType}` === recordKey)
    .map((v) => {
      const ms = toMillis(v.at); const sev = SEV_LABEL[v.severity as CeptDisplaySeverity] || v.severity;
      const change = v.action === 'RESOLVED' ? `${sev} → Validado` : v.action === 'REOPENED' ? `Validado → ${sev}` : `${sev} → Desatualização confirmada`;
      return { ms, when: ms ? `${fmtDate(ms)} ${fmtTime(ms)}` : '', user: shortUser(v.usuarioEmail), action: ACTION_LABEL[v.action] || v.action, severity: sev,
        fileDate: v.fileDate, counterpart: v.counterpartDates, reasons: v.reasons, observation: v.observation, change, discipline: v.disciplineCode, sourceType: v.sourceType };
    }).sort((a, b) => b.ms - a.ms);
}

// ---------- Matriz (E §6) ----------
export interface FamilyView { family: string; label: string; status: CeptStatus; sev: CeptDisplaySeverity; delivered: number; applicable: number; date: string; comps: Rec[]; interactive: boolean }
export function familyView(family: string, label: string, comps: Rec[]): FamilyView {
  const has = (s: string) => comps.some((c) => c.status === s);
  const status: CeptStatus = has('pending') ? 'pending' : has('unknown') ? 'unknown' : has('delivered') ? 'delivered' : 'na';
  const sev: CeptDisplaySeverity = comps.some((c) => c.sev === 'red') ? 'red' : comps.some((c) => c.sev === 'yellow') ? 'yellow' : comps.some((c) => c.sev === 'green') ? 'green' : 'none';
  const delivered = comps.filter((c) => c.status === 'delivered').length;
  const applicable = delivered + comps.filter((c) => c.status === 'pending').length;
  let date = comps.length === 1 ? comps[0].date : '';
  if (comps.length > 1 && applicable && delivered === applicable) {
    const latest = [...comps].filter((c) => c.status === 'delivered').sort((a, b) => (b.dateIso || '').localeCompare(a.dateIso || ''))[0];
    date = latest?.date || '';
  }
  return { family, label, status, sev, delivered, applicable, date, comps, interactive: comps.some((c) => c.status !== 'na') };
}

export function matrixModel(model: CeptModel, all: Rec[], filtered: Rec[], f: Filters) {
  const extra = f.deliverable.length || f.nature.length || f.alert.length || dateFilterValid(f.date);
  const inFiltered = new Set(filtered.map((r) => `${r.projectCode}|${r.disciplineCode}`));
  const projects = model.projects.filter((p) => (!f.project.length || f.project.includes(p.code))
    && (!f.responsible.length || Object.values(p.disciplines).some((d) => f.responsible.includes(d.responsible)))
    && (!extra || filtered.some((r) => r.projectCode === p.code)));
  const disciplines = filterOptions(model, all).discipline.filter((d) => (!f.discipline.length || f.discipline.includes(d))
    && projects.some((p) => p.disciplines[d] && (!f.responsible.length || f.responsible.includes(p.disciplines[d].responsible)))
    && (!extra || filtered.some((r) => r.disciplineCode === d)));
  const byFamily = new Map<string, Rec[]>();
  filtered.forEach((r) => { const k = `${r.projectCode}|${r.disciplineCode}|${r.family}`; byFamily.set(k, [...(byFamily.get(k) || []), r]); });
  return { projects, disciplines, byFamily, inFiltered };
}
