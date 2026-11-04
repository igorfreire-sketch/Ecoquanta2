// Detalhe, visao consolidada, validacao, historico (3 niveis) e card de historico (E §5.3, §7).
import { useMemo, useState } from 'react';
import { ArrowRight, Check, ChevronLeft, ChevronRight, Undo2 } from 'lucide-react';
import type { CeptAction } from '../../../lib/cept/rules';
import type { PdfExportOptions } from '../../../lib/pdfExport';
import {
  alertText, applyChip, componentLabel, contextRecords, detailSearch, feedGroupValue, feedPage, groupPercent, histSearch, kpis, norm, perfColor, ptSort, sortRows,
  validationText, SEV_LABEL, validationHistory,
  type Chip, type DetailCtx, type FeedGroup, type HistRow, type Rec, type SortKey,
} from './model';
import { Banner, btnDark, btnGhost, btnPrimary, focusRing, Modal, SevGlyph, SEV_TOKEN, StatusText } from './Ui';

export type PdfRequest = (title: string, run: (opts: PdfExportOptions) => void | Promise<void>) => void;

const thCls = 'sticky top-0 z-10 bg-[#F8FAFC] px-2 py-2 text-left text-[11px] font-bold uppercase tracking-[.04em] text-[#475569]';
const tdCls = 'border-b border-[#E5E7EB] px-2 py-2 align-top';

function Change({ text }: { text: string }) {
  const i = text.indexOf('→');
  if (i < 0) return <>{text}</>;
  return <>{text.slice(0, i).trim()} <ArrowRight size={12} aria-label="para" className="inline text-[#F05D28]" /> <strong>{text.slice(i + 1).trim()}</strong></>;
}

// ---------- Detalhe ----------
export function DetailModal({ ctx, records, canEdit, subtitle, onClose, onOpenValidation, onBatch, requestPdf, exportPdf }: {
  ctx: DetailCtx; records: Rec[]; canEdit: boolean; subtitle: string; onClose: () => void;
  onOpenValidation: (recordKey: string) => void; onBatch: (action: CeptAction, recs: Rec[]) => Promise<string | null>;
  requestPdf: PdfRequest; exportPdf: (title: string, subtitle: string, recorte: string, rows: Rec[], opts: PdfExportOptions) => void;
}) {
  const [chip, setChip] = useState<Chip>('');
  const [showNa, setShowNa] = useState(false);
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'status', dir: 1 });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [msg, setMsg] = useState<{ tone: 'error' | 'warn'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  // B13: recalcula a cada snapshot (records vem ao vivo), mantendo chip/busca/selecao.
  const base = useMemo(() => contextRecords(records, ctx), [records, ctx]);
  const k = kpis(base);
  const visible = useMemo(() => sortRows(detailSearch(applyChip(base, chip).filter((r) => showNa || r.status !== 'na'), q), sort.key, sort.dir), [base, chip, showNa, q, sort]);
  const selectable = (r: Rec) => r.sev !== 'none';
  const sel = visible.filter((r) => selected.has(r.recordKey) && selectable(r));
  const visSel = visible.filter(selectable);
  const allOn = visSel.length > 0 && visSel.every((r) => selected.has(r.recordKey));
  const someOn = visSel.some((r) => selected.has(r.recordKey));
  const toggle = (key: string, on: boolean) => setSelected((s) => { const n = new Set(s); if (on) n.add(key); else n.delete(key); return n; });
  const recorte = [chip && `Recorte: ${chip}`, showNa ? 'N/A visíveis' : 'N/A ocultos', q && `Busca: ${q}`].filter(Boolean).join(' · ');
  const runBatch = async (action: CeptAction) => {
    const items = action === 'RESOLVED' ? sel.filter((r) => r.sev === 'red' || r.sev === 'yellow') : sel.filter((r) => r.sev === 'green');
    if (!items.length) { setMsg({ tone: 'error', text: action === 'RESOLVED' ? 'Nenhum alerta vermelho ou amarelo selecionado para validar.' : 'Nenhum alerta validado/verde selecionado para reabrir.' }); return; }
    setBusy(true); setMsg(null);
    try { const warn = await onBatch(action, items); setSelected(new Set()); if (warn) setMsg({ tone: 'warn', text: warn }); }
    catch (e) { setMsg({ tone: 'error', text: (e as Error).message }); }
    finally { setBusy(false); }
  };
  const chips: Array<[Chip, string]> = [['', `${k.percent}% conclusão`], ['delivered', `${k.delivered} disponibilizados`], ['pending', `${k.pending} pendentes`], ['applicable', `${k.applicable} aplicáveis`],
    ['red', `${k.red} alertas vermelhos`], ['yellow', `${k.yellow} alertas amarelos`], ['green', `${k.green} alertas validados`]];
  const cols: Array<[SortKey, string]> = [['project', 'Projeto'], ['discipline', 'Disciplina'], ['responsible', 'Responsável'], ['component', 'Entregável'], ['status', 'Situação'], ['date', 'Data'], ['alert', 'Alerta'], ['validation', 'Validação']];
  return (
    <Modal title={ctx.title} subtitle={subtitle} onClose={onClose}
      actions={<button type="button" className={btnPrimary} onClick={() => requestPdf('Exportar detalhe em PDF', (o) => exportPdf(ctx.title, subtitle, recorte, visible, o))}>Exportar PDF</button>}
      footer={canEdit && sel.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2 border-t border-[#E5E7EB] bg-white px-6 py-3">
          <span className="text-[13px] font-bold">{sel.length} selecionado(s)</span>
          <button type="button" disabled={busy} className={btnPrimary} onClick={() => runBatch('RESOLVED')}><Check size={14} aria-hidden />Validar selecionados</button>
          <button type="button" disabled={busy} className={btnGhost} onClick={() => runBatch('REOPENED')}><Undo2 size={14} aria-hidden />Reabrir selecionados</button>
          <button type="button" disabled={busy} className={btnGhost} onClick={() => setSelected(new Set())}>Limpar seleção</button>
        </div>
      ) : undefined}>
      <div className="mb-3 flex flex-wrap gap-2">
        {chips.map(([c, label]) => (
          <button key={label} type="button" role="switch" aria-checked={chip === c && c !== ''} onClick={() => setChip(chip === c ? '' : c)}
            className={`rounded-full border px-3 py-1 text-[12px] font-bold ${focusRing} ${chip === c && c ? 'border-[#F05D28] bg-[#FFF3EC] text-[#F05D28]' : 'border-[#E5E7EB] text-[#475569] hover:bg-[#F3F4F6]'}`}>{label}</button>
        ))}
        {k.unknown > 0 && <span className="rounded-full border border-[#FDE68A] bg-[#FEFCE8] px-3 py-1 text-[12px] font-bold text-[#A16207]">{k.unknown} não determinados</span>}
      </div>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <label className="inline-flex items-center gap-2 text-[12px] font-semibold"><input type="checkbox" className="accent-[#F05D28]" checked={showNa} onChange={(e) => setShowNa(e.target.checked)} />Mostrar N/A</label>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar projeto, disciplina, responsável..." aria-label="Buscar no detalhe"
          className={`h-9 min-w-[240px] flex-1 rounded-lg border border-[#E5E7EB] px-3 text-[12px] ${focusRing}`} />
      </div>
      {msg && <div className="mb-3"><Banner tone={msg.tone}>{msg.text}</Banner></div>}
      {!visible.length ? <p className="py-10 text-center text-[13px] text-[#64748B]">Nenhum registro para os filtros selecionados.</p> : (
        <table className="w-full border-separate border-spacing-0 text-[12px]">
          <thead><tr>
            <th className={`${thCls} w-8`}>
              {canEdit && <input type="checkbox" aria-label="Selecionar visíveis" className="accent-[#F05D28]" checked={allOn} disabled={busy || !visSel.length}
                ref={(el) => { if (el) el.indeterminate = someOn && !allOn; }}
                onChange={(e) => setSelected((s) => { const n = new Set(s); visSel.forEach((r) => (e.target.checked ? n.add(r.recordKey) : n.delete(r.recordKey))); return n; })} />}
            </th>
            {cols.map(([key, label]) => (
              <th key={key} className={thCls} aria-sort={sort.key === key ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}>
                <button type="button" className={`uppercase ${focusRing}`} onClick={() => setSort((s) => ({ key, dir: s.key === key ? (s.dir === 1 ? -1 : 1) : 1 }))}>{label}{sort.key === key ? (sort.dir === 1 ? ' ▲' : ' ▼') : ''}</button>
              </th>
            ))}
          </tr></thead>
          <tbody>
            {visible.map((r) => {
              const clickable = r.sev !== 'none' || r.validationHistoryCount > 0;
              return (
                <tr key={r.recordKey} onClick={clickable ? () => onOpenValidation(r.recordKey) : undefined}
                  className={`${r.status === 'pending' ? 'bg-[#FFF7ED]' : ''} ${clickable ? 'cursor-pointer hover:bg-[#FFF3EC]' : ''}`}>
                  <td className={tdCls} onClick={(e) => e.stopPropagation()}>
                    {canEdit && selectable(r) && <input type="checkbox" disabled={busy} aria-label={`Selecionar ${componentLabel(r)}`} className="accent-[#F05D28]" checked={selected.has(r.recordKey)} onChange={(e) => toggle(r.recordKey, e.target.checked)} />}
                  </td>
                  <td className={tdCls}><strong>{r.projectCode}</strong> · {r.projectName}</td>
                  <td className={tdCls}>{r.disciplineCode}</td>
                  <td className={tdCls}>{r.responsible || 'Responsável não identificado'}</td>
                  <td className={tdCls}>{clickable ? <button type="button" className={`text-left underline decoration-dotted ${focusRing}`} onClick={(e) => { e.stopPropagation(); onOpenValidation(r.recordKey); }}>{componentLabel(r)}</button> : componentLabel(r)}</td>
                  <td className={tdCls}><StatusText status={r.status} /></td>
                  <td className={`${tdCls} tabular-nums`}>{r.date || '—'}</td>
                  <td className={tdCls}><span className="inline-flex items-center gap-1 font-semibold" style={{ color: SEV_TOKEN[r.sev].text }}><SevGlyph sev={r.sev} />{alertText(r)}</span></td>
                  <td className={tdCls}>{validationText(r)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </Modal>
  );
}

// ---------- Visao consolidada (KPIs Projetos/Disciplinas) ----------
export function OverviewModal({ kind, records, subtitle, onClose, onDetail, requestPdf, exportPdf }: {
  kind: 'projects' | 'disciplines'; records: Rec[]; subtitle: string; onClose: () => void;
  onDetail: (ctx: DetailCtx) => void; requestPdf: PdfRequest;
  exportPdf: (kind: 'projects' | 'disciplines', rows: ReturnType<typeof groupPercent>, extra: (k: string) => number, search: string, opts: PdfExportOptions) => void;
}) {
  const isP = kind === 'projects';
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<{ key: 'label' | 'percent' | 'delivered' | 'pending' | 'extra'; dir: 1 | -1 }>({ key: 'percent', dir: -1 });
  const ap = records.filter((r) => r.status === 'delivered' || r.status === 'pending');
  const groups = groupPercent(ap, (r) => (isP ? r.projectCode : r.disciplineCode), (c) => (isP ? `${c} - ${ap.find((r) => r.projectCode === c)?.projectName || ''}` : c));
  const extra = (key: string) => new Set(ap.filter((r) => (isP ? r.projectCode : r.disciplineCode) === key).map((r) => (isP ? r.disciplineCode : r.projectCode))).size;
  const val = (g: typeof groups[number]) => (sort.key === 'extra' ? extra(g.key) : sort.key === 'label' ? g.label : g[sort.key]);
  const rows = groups.filter((g) => norm(g.label).includes(norm(q))).sort((a, b) => { const x = val(a); const y = val(b); return sort.dir * (typeof x === 'number' ? x - (y as number) : ptSort(String(x), String(y))); });
  const k = kpis(ap);
  const cols: Array<[typeof sort.key, string]> = [['label', isP ? 'Projeto' : 'Disciplina'], ['percent', 'Conclusão'], ['delivered', 'Disponibilizados'], ['pending', 'Pendentes'], ['extra', isP ? 'Disciplinas' : 'Projetos']];
  const chipCls = `rounded-full border border-[#E5E7EB] px-3 py-1 text-[12px] font-bold text-[#475569] hover:bg-[#F3F4F6] ${focusRing}`;
  return (
    <Modal title={isP ? 'Projetos — visão consolidada' : 'Disciplinas — visão consolidada'} subtitle={subtitle} onClose={onClose}
      actions={<button type="button" className={btnPrimary} onClick={() => requestPdf('Exportar visão consolidada', (o) => exportPdf(kind, rows, extra, q, o))}>Exportar PDF</button>}>
      <div className="mb-3 flex flex-wrap gap-2">
        <button type="button" className={chipCls} onClick={() => { setQ(''); setSort({ key: 'percent', dir: -1 }); }}>{groups.length} {isP ? 'projetos' : 'disciplinas'}</button>
        <button type="button" className={chipCls} onClick={() => onDetail({ kind: 'applicable', title: 'Aplicáveis — lista' })}>{k.percent}% conclusão</button>
        <button type="button" className={chipCls} onClick={() => onDetail({ kind: 'status', value: 'delivered', title: 'Disponibilizados — lista' })}>{k.delivered} disponibilizados</button>
        <button type="button" className={chipCls} onClick={() => onDetail({ kind: 'status', value: 'pending', title: 'Pendentes — lista' })}>{k.pending} pendentes</button>
      </div>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={isP ? 'Buscar projeto...' : 'Buscar disciplina...'} aria-label="Buscar"
        className={`mb-3 h-9 w-full max-w-sm rounded-lg border border-[#E5E7EB] px-3 text-[12px] ${focusRing}`} />
      {!rows.length ? <p className="py-10 text-center text-[13px] text-[#64748B]">Nenhum registro para os filtros selecionados.</p> : (
        <table className="w-full border-separate border-spacing-0 text-[12px]">
          <thead><tr>
            {cols.map(([key, label]) => (
              <th key={key} className={thCls} aria-sort={sort.key === key ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}>
                <button type="button" className={`uppercase ${focusRing}`} onClick={() => setSort((s) => ({ key, dir: s.key === key ? (s.dir === 1 ? -1 : 1) : key === 'label' ? 1 : -1 }))}>{label}</button>
              </th>
            ))}
            <th className={thCls}><span className="sr-only">Abrir</span></th>
          </tr></thead>
          <tbody>
            {rows.map((g) => (
              <tr key={g.key} className="hover:bg-[#FFF3EC]">
                <td className={`${tdCls} font-bold`}>{g.label}</td>
                <td className={tdCls}><span className="rounded-full px-2 py-0.5 text-[11px] font-bold text-white" style={{ background: perfColor(g.percent) }}>{g.percent}%</span></td>
                <td className={`${tdCls} tabular-nums`}>{g.delivered}</td>
                <td className={`${tdCls} tabular-nums`}>{g.pending}</td>
                <td className={`${tdCls} tabular-nums`}>{extra(g.key)}</td>
                <td className={tdCls}>
                  <button type="button" className={`inline-flex items-center gap-1 font-bold text-[#C2410C] ${focusRing}`}
                    onClick={() => onDetail(isP ? { kind: 'project', value: g.key, title: `Projeto — ${g.label}` } : { kind: 'discipline', value: g.key, title: `Disciplina — ${g.key}` })}>
                    Ver entregáveis<ChevronRight size={14} aria-hidden />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Modal>
  );
}

// ---------- Validacao ----------
type VHist = ReturnType<typeof validationHistory>;
export function ValidationModal({ rec, canEdit, userEmail, history, onClose, onSubmit, requestPdf, exportPdf }: {
  rec: Rec | undefined; canEdit: boolean; userEmail: string; history: VHist; onClose: () => void;
  onSubmit: (action: CeptAction, observation: string) => Promise<{ saved: number; warn: string | null }>;
  requestPdf: PdfRequest; exportPdf: (rec: Rec, history: VHist, opts: PdfExportOptions) => void;
}) {
  const [obs, setObs] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'error' | 'warn'; text: string } | null>(null);
  if (!rec) return <Modal title="Validação" onClose={onClose} size="max-w-3xl"><Banner tone="error">Este alerta não está mais ativo no filtro atual. Atualize o dashboard.</Banner></Modal>;
  const run = async (action: CeptAction) => {
    setBusy(true); setMsg(null);
    try { const r = await onSubmit(action, obs); if (r.warn) setMsg({ tone: 'warn', text: r.warn }); else if (r.saved) onClose(); }
    catch (e) { setMsg({ tone: 'error', text: (e as Error).message }); }
    finally { setBusy(false); }
  };
  const green = rec.sev === 'green';
  return (
    <Modal size="max-w-3xl" title={`${rec.projectCode} · ${rec.disciplineCode} · ${componentLabel(rec)}`} subtitle={`${rec.projectName} · ${rec.responsible || 'Responsável não identificado'}`} onClose={onClose}
      actions={<button type="button" className={btnGhost} onClick={() => requestPdf('Exportar validação em PDF', (o) => exportPdf(rec, history, o))}>Exportar PDF</button>}>
      <dl className="grid gap-3 md:grid-cols-2">
        {[['Arquivo', `${rec.sourceType} · ${rec.natureLabel}`], ['Data de postagem', rec.dateFull || rec.date || '—']].map(([l, v]) => (
          <div key={l} className="rounded-xl border border-[#E5E7EB] p-3"><dt className="text-[11px] font-bold uppercase text-[#64748B]">{l}</dt><dd className="text-[13px] font-semibold">{v}</dd></div>
        ))}
        <div className="rounded-xl border border-[#E5E7EB] p-3"><dt className="text-[11px] font-bold uppercase text-[#64748B]">Alerta atual</dt>
          <dd className="inline-flex items-center gap-1 text-[13px] font-semibold" style={{ color: SEV_TOKEN[rec.sev].text }}><SevGlyph sev={rec.sev} />{SEV_LABEL[rec.sev]}</dd></div>
        <div className="rounded-xl border border-[#E5E7EB] p-3"><dt className="text-[11px] font-bold uppercase text-[#64748B]">Validação atual</dt><dd className="text-[13px] font-semibold">{validationText(rec)}</dd></div>
      </dl>
      <div className="mt-3 rounded-xl bg-[#F8FAFC] p-4 text-[13px]">
        {rec.alert.reasons.length ? rec.alert.reasons.map((r) => (
          <p key={r.code + r.counterpartDate}>• {r.message}{r.counterpartDate && <> <strong>Contraparte: {r.counterpartDate}</strong></>}</p>
        )) : <p>Nenhum alerta automático no estado atual.</p>}
      </div>
      {msg && <div className="mt-3"><Banner tone={msg.tone}>{msg.text}</Banner></div>}
      <div className="mt-3">
        {!canEdit ? <p className="text-[13px] text-[#64748B]">Somente os validadores autorizados podem alterar este registro. Usuário atual: {userEmail || 'não identificado'}.</p>
          : rec.alert.autoSeverity === 'none' ? <p className="text-[13px] text-[#64748B]">O estado atual não possui alerta automático. O histórico permanece disponível.</p>
            : (
              <div>
                <label className="block text-[12px] font-bold text-[#475569]">Observação opcional
                  <textarea value={obs} onChange={(e) => setObs(e.target.value)} rows={2} className={`mt-1 w-full rounded-lg border border-[#E5E7EB] p-2 text-[13px] font-normal ${focusRing}`} />
                </label>
                <div className="mt-2 flex flex-wrap gap-2">
                  {!green && <button type="button" disabled={busy} className={btnPrimary} onClick={() => run('RESOLVED')}><Check size={14} aria-hidden />Validar / marcar resolvido</button>}
                  {!green && rec.validationStatus !== 'confirmed_outdated' && <button type="button" disabled={busy} className={btnGhost} onClick={() => run('CONFIRMED_OUTDATED')}>Confirmar desatualização</button>}
                  {green && <button type="button" disabled={busy} className={btnDark} onClick={() => run('REOPENED')}><Undo2 size={14} aria-hidden />Reabrir alerta</button>}
                </div>
              </div>
            )}
      </div>
      <h3 className="mt-5 text-[13px] font-bold">Histórico de decisões</h3>
      {!history.length ? <p className="mt-1 text-[13px] text-[#64748B]">Nenhuma decisão registrada anteriormente para este arquivo.</p> : (
        <ul className="mt-1 divide-y divide-[#E5E7EB] text-[12px]">
          {history.map((h, i) => (
            <li key={i} className="grid grid-cols-[110px_90px_1fr] gap-2 py-1.5">
              <span className="font-bold tabular-nums">{h.when}</span><span>{h.user}</span>
              <span>{h.discipline} · {h.sourceType} · <Change text={h.change} />{h.observation && <span className="block text-[#64748B]">Obs.: {h.observation}</span>}</span>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}

// ---------- Historico 3 niveis ----------
export type HistoryStart = { level: 'general'; group?: { key: FeedGroup; label: string } } | { level: 'family'; row: HistRow };
const PAIRED = ['PRJ', 'MC', 'MD', 'ET', 'RL', 'ET/RT'];
export function HistoryModal({ rows, start, onClose, onCsv, requestPdf, exportPdf }: {
  rows: HistRow[]; start: HistoryStart; onClose: () => void; onCsv: (rows: HistRow[]) => void; requestPdf: PdfRequest;
  exportPdf: (rows: HistRow[], title: string, opts: PdfExportOptions) => void;
}) {
  const [family, setFamily] = useState<HistRow | null>(start.level === 'family' ? start.row : null);
  const [cell, setCell] = useState<HistRow | null>(null);
  const [search, setSearch] = useState({ general: '', family: '', cell: '' });
  const [variants, setVariants] = useState({ Edit: true, PDF: true });
  const group = start.level === 'general' && start.group?.key ? start.group : undefined;
  const level = cell ? 'cell' : family ? 'family' : 'general';
  const general = group ? rows.filter((h) => feedGroupValue(h, group.key) === group.label) : rows;
  const famRows = family ? rows.filter((h) => h.projectCode === family.projectCode && h.discipline === family.discipline && h.famGroup === family.famGroup)
    .sort((a, b) => (a.sourceType === family.sourceType ? 0 : 1) - (b.sourceType === family.sourceType ? 0 : 1) || b.ms - a.ms) : [];
  const famVariants = new Set(famRows.map((h) => (h.editable ? 'Edit' : 'PDF')));
  const paired = family && (PAIRED.includes(family.famGroup) || famVariants.size > 1);
  const levelRows = level === 'cell' ? rows.filter((h) => h.recordKey === cell!.recordKey && h.field === cell!.field)
    : level === 'family' ? famRows.filter((h) => !paired || variants[h.editable ? 'Edit' : 'PDF']) : general;
  const view = histSearch(levelRows, search[level]);
  const title = level === 'cell' ? `Histórico da célula — ${cell!.deliverable} · ${cell!.fieldLabel}` : level === 'family' ? `Histórico — ${family!.famGroup}` : group ? `Histórico — ${group.label}` : 'Histórico de modificações';
  const sub = level === 'family' ? `${family!.projectCode} · ${family!.discipline} · Edit + PDF` : level === 'general' ? (group ? 'Mais recentes primeiro · grupo selecionado' : 'Mais recentes primeiro') : undefined;
  const crumb = `${focusRing} rounded font-bold text-[#C2410C] underline decoration-dotted`;
  return (
    <Modal title={title} subtitle={sub} onClose={onClose}
      actions={<>
        <button type="button" className={btnGhost} onClick={() => onCsv(view)}>Exportar CSV</button>
        <button type="button" className={btnGhost} onClick={() => requestPdf('Exportar histórico em PDF', (o) => exportPdf(view, title, o))}>Exportar PDF</button>
      </>}>
      <nav aria-label="Nível do histórico" className="mb-3 flex flex-wrap items-center gap-1 text-[12px]">
        {level !== 'general' ? <button type="button" className={crumb} onClick={() => { setFamily(null); setCell(null); }}>Histórico geral</button> : <span className="font-bold">Histórico geral</span>}
        {family && <><ChevronRight size={12} aria-hidden />{cell ? <button type="button" className={crumb} onClick={() => setCell(null)}>{family.famGroup}</button> : <span className="font-bold">{family.famGroup}</span>}</>}
        {cell && <><ChevronRight size={12} aria-hidden /><span className="font-bold">{cell.deliverable} · {cell.fieldLabel}</span></>}
      </nav>
      {level === 'family' && paired && (
        <div className="mb-3 flex gap-2">
          {(['Edit', 'PDF'] as const).map((v) => (
            <button key={v} type="button" role="switch" aria-checked={variants[v]} onClick={() => setVariants((s) => ({ ...s, [v]: !s[v] }))}
              className={`rounded-xl border px-4 py-2 text-[12px] font-bold ${focusRing} ${variants[v] ? 'border-[#F05D28] bg-[#FFF3EC] text-[#F05D28]' : 'border-[#E5E7EB] text-[#64748B]'}`}>{v}</button>
          ))}
        </div>
      )}
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <span className="text-[12px] text-[#64748B]">{view.length} alterações{level === 'general' && !group ? ' no filtro atual' : ''} · mais recentes primeiro</span>
        <input value={search[level]} onChange={(e) => setSearch((s) => ({ ...s, [level]: e.target.value }))} placeholder="Buscar projeto, disciplina, operador..." aria-label="Buscar no histórico"
          className={`h-9 min-w-[240px] flex-1 rounded-lg border border-[#E5E7EB] px-3 text-[12px] ${focusRing}`} />
      </div>
      {!view.length ? <p className="py-10 text-center text-[13px] text-[#64748B]">Nenhuma alteração encontrada.</p> : (
        <table className="w-full border-separate border-spacing-0 text-[12px]">
          <thead><tr>{['Data / hora', 'Autor', 'Projeto', 'Disciplina', 'Responsável', 'Entregável', 'Campo', 'Alteração'].map((h) => <th key={h} className={thCls}>{h}</th>)}</tr></thead>
          <tbody>
            {view.map((h) => {
              const go = level === 'general' ? () => setFamily(h) : level === 'family' ? () => setCell(h) : undefined;
              return (
                <tr key={h.id} className={go ? 'cursor-pointer hover:bg-[#FFF3EC]' : ''} onClick={go}>
                  <td className={`${tdCls} tabular-nums`}>{go ? <button type="button" className={focusRing} onClick={(e) => { e.stopPropagation(); go(); }}>{h.when}</button> : h.when}</td>
                  <td className={tdCls}>{h.user}</td>
                  <td className={tdCls}>{h.projectCode} - {h.projectName}</td>
                  <td className={`${tdCls} font-bold`}>{h.discipline}</td>
                  <td className={tdCls}>{h.responsible}</td>
                  <td className={`${tdCls} font-bold`}>{h.deliverable}</td>
                  <td className={tdCls}>{h.fieldLabel}</td>
                  <td className={tdCls}><Change text={h.change} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </Modal>
  );
}

// ---------- Card Historico (feed) ----------
const PER_PAGE = 30; // 2 colunas x 15 linhas (307 px / 20 px), igual em 1 coluna (614 px)
export function HistoryFeed({ rows, onOpenFamily, onOpenGroup }: { rows: HistRow[]; onOpenFamily: (h: HistRow) => void; onOpenGroup: (g: FeedGroup, label: string) => void }) {
  const [group, setGroup] = useState<FeedGroup>('');
  const [page, setPage] = useState(0);
  const { pages } = feedPage(rows, group, PER_PAGE, 0);
  const p = Math.min(page, pages - 1);
  const { blocks } = feedPage(rows, group, PER_PAGE, p);
  const opts: Array<[FeedGroup, string]> = [['project', 'Projeto'], ['discipline', 'Disciplina'], ['responsible', 'Responsável'], ['user', 'Operador']];
  return (
    <section className="rounded-2xl bg-white p-6 shadow-[0_10px_30px_-22px_rgba(15,23,42,0.45)]" aria-label="Histórico">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-[15px] font-bold">Histórico</h3>
        <div className="flex flex-wrap items-center gap-1">
          <button type="button" className={`${btnGhost} h-8`} onClick={() => onOpenGroup('', '')}>Abrir histórico</button>
          {opts.map(([g, l]) => (
            <button key={g} type="button" aria-pressed={group === g} onClick={() => { setGroup(group === g ? '' : g); setPage(0); }}
              className={`rounded-full px-3 py-1 text-[12px] font-bold ${focusRing} ${group === g ? 'bg-[#FFF3EC] text-[#F05D28]' : 'text-[#475569] hover:bg-[#F3F4F6]'}`}>{l}</button>
          ))}
          <button type="button" aria-label="Página anterior" disabled={p <= 0} onClick={() => setPage(p - 1)} className={`${btnGhost} h-8 w-8 px-0`}><ChevronLeft size={14} /></button>
          <span className="text-[12px] tabular-nums text-[#64748B]">{p + 1} - {pages}</span>
          <button type="button" aria-label="Próxima página" disabled={p >= pages - 1} onClick={() => setPage(p + 1)} className={`${btnGhost} h-8 w-8 px-0`}><ChevronRight size={14} /></button>
        </div>
      </div>
      {!rows.length ? <p className="flex min-h-[200px] items-center justify-center text-[13px] text-[#64748B]">Nenhuma modificação registrada no filtro atual.</p> : (
        // ponytail: CSS columns no lugar do "coluna menos carregada" da origem
        <div className="columns-1 gap-4 lg:columns-2">
          {blocks.map((b) => (
            <div key={b.label || 'all'} className={b.label ? "mb-2 break-inside-avoid" : "mb-2"}>
              {b.label && <button type="button" onClick={() => onOpenGroup(group, b.label)} className={`mb-1 text-[12px] font-bold text-[#C2410C] hover:underline ${focusRing}`}>{b.label} · {b.total}</button>}
              {b.rows.map((h) => (
                <button key={h.id} type="button" onClick={() => onOpenFamily(h)} className={`grid w-full grid-cols-[118px_72px_1fr] gap-1 rounded break-inside-avoid px-1 py-0.5 text-left text-[12px] hover:bg-[#FFF3EC] ${focusRing}`}>
                  <span className="whitespace-nowrap"><strong className="tabular-nums">{h.date}</strong> <span className="text-[#64748B]">{h.time}</span></span>
                  <span className="truncate">{h.user}</span>
                  <span className="truncate">{h.discipline} · {h.deliverable} · <Change text={h.change} /></span>
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
