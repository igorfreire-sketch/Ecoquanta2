// Matriz Projetos x Disciplinas (E §6, F0 §6.6).
import { useState } from 'react';
import type { CeptModel } from '../../../lib/cept/rules';
import { applicablePercent } from '../../../lib/cept/rules';
import { familyView, matrixFamilyCode, perfColor, SEV_LABEL, STATUS_LABEL, type FamilyView, type Filters, type Rec } from './model';
import { btnDark, btnGhost, focusRing, SevGlyph, STATUS_TOKEN, StatusGlyph } from './Ui';
import { matrixModel } from './model';

const OWNER = { internal: { c: '#15803D', bg: '#F0FDF4' }, external: { c: '#1D4ED8', bg: '#EFF6FF' }, unidentified: { c: '#C2410C', bg: '#FFF7ED' } } as Record<string, { c: string; bg: string }>;

function natureLine(r: Rec) {
  const n = r.editable === true ? 'Editável' : r.editable === false ? 'Não editável' : 'Natureza não determinada';
  return `${n} · ${r.format} — ${STATUS_LABEL[r.status]}${r.date ? ' ' + r.date : ''}${r.sev !== 'none' ? ` · alerta ${SEV_LABEL[r.sev].toLowerCase()}` : ''}`;
}

export function Matrix({ model, all, filtered, filters, onDetail, onFamilyAlert, onExport }: {
  model: CeptModel; all: Rec[]; filtered: Rec[]; filters: Filters;
  onDetail: (kind: 'project' | 'discipline' | 'family', value: string, title: string) => void;
  onFamilyAlert: (familyKey: string) => void; onExport: (full: boolean) => void;
}) {
  const m = matrixModel(model, all, filtered, filters);
  const [tip, setTip] = useState<{ view: FamilyView; x: number; y: number } | null>(null);
  const showTip = (view: FamilyView, el: HTMLElement) => {
    const r = el.getBoundingClientRect(); const w = 300;
    const x = r.right + 8 + w > window.innerWidth ? Math.max(8, r.left - w - 8) : r.right + 8;
    setTip({ view, x, y: Math.min(Math.max(8, r.top), window.innerHeight - 200) });
  };
  return (
    <section className="rounded-2xl bg-white p-6 shadow-[0_10px_30px_-22px_rgba(15,23,42,0.45)]" aria-label="Projetos × Disciplinas">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-[15px] font-bold">Projetos × Disciplinas</h3>
          <p className="text-[12px] text-[#64748B]">Responsável, RVT, PDF, IFC e todos os relatórios existentes na fonte. Colunas compactadas para reduzir rolagem horizontal.</p>
        </div>
        <div className="flex gap-2">
          <button type="button" className={btnGhost} onClick={() => onExport(false)}>PDF · filtro atual</button>
          <button type="button" className={btnDark} onClick={() => onExport(true)}>PDF · matriz completa</button>
        </div>
      </div>
      <ul className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-[#475569]" aria-label="Legenda">
        {(['delivered', 'pending', 'na', 'unknown'] as const).map((s) => <li key={s} className="inline-flex items-center gap-1"><StatusGlyph status={s} />{s === 'delivered' ? 'disponibilizado' : s === 'pending' ? 'pendente' : s === 'na' ? 'não aplicável' : 'não determinado'}</li>)}
        {(['red', 'yellow', 'green'] as const).map((s) => <li key={s} className="inline-flex items-center gap-1"><SevGlyph sev={s} />{s === 'green' ? 'validado' : `alerta ${SEV_LABEL[s].toLowerCase()}`}</li>)}
      </ul>
      {!m.projects.length || !m.disciplines.length ? <p className="py-10 text-center text-[13px] text-[#64748B]">Nenhum registro para os filtros selecionados.</p> : (
        <div className="max-h-[75vh] overflow-auto rounded-xl border border-[#E5E7EB]">
          <table className="border-separate border-spacing-0 text-[11px]">
            <thead>
              <tr>
                <th className="sticky left-0 top-0 z-20 w-[140px] min-w-[140px] bg-[#1E293B] px-2 py-2 text-left font-bold text-white">Projeto</th>
                {m.disciplines.map((d) => (
                  <th key={d} className="sticky top-0 z-10 w-[124px] min-w-[124px] bg-[#1E293B] p-0 font-bold text-white">
                    <button type="button" className={`h-full w-full px-2 py-2 hover:bg-[#334155] ${focusRing}`} onClick={() => onDetail('discipline', d, `Disciplina — ${d}`)}>{d}</button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {m.projects.map((p) => {
                const pr = filtered.filter((r) => r.projectCode === p.code);
                const dl = pr.filter((r) => r.status === 'delivered').length; const pe = pr.filter((r) => r.status === 'pending').length; const pct = applicablePercent(dl, pe);
                return (
                  <tr key={p.code}>
                    <th scope="row" className="sticky left-0 z-10 border-b border-r border-[#E5E7EB] bg-white p-0 text-left align-top">
                      <button type="button" title={`${dl}/${dl + pe} entregáveis aplicáveis concluídos`} onClick={() => onDetail('project', p.code, `Projeto — ${p.code} - ${p.name}`)} className={`block w-full px-2 py-2 text-left hover:bg-[#FFF3EC] ${focusRing}`}>
                        <span className="block text-[13px] font-extrabold text-[#C2410C]">{p.code}</span>
                        <span className="block text-[11px] font-medium text-[#2D2D2D]">{p.name}</span>
                        <span className="mt-1 inline-block rounded-full px-2 py-0.5 text-[11px] font-bold text-white" style={{ background: perfColor(pct) }}>{pct}% concluído</span>
                      </button>
                    </th>
                    {m.disciplines.map((d) => {
                      const disc = p.disciplines[d];
                      const cls = 'border-b border-r border-[#E5E7EB] align-top';
                      if (!disc) return <td key={d} className={`${cls} bg-[#F8FAFC] text-center text-[#94A3B8]`} title="Disciplina não aplicável neste projeto">—</td>;
                      if (filters.responsible.length && !filters.responsible.includes(disc.responsible)) return <td key={d} className={cls} title="Fora do filtro de responsável" />;
                      const views = p.deliverableTypes.filter((f) => disc.items[f]).map((f) => familyView(f, disc.items[f].label, m.byFamily.get(`${p.code}|${d}|${f}`) || [])).filter((v) => v.comps.length);
                      if (!views.length) return <td key={d} className={`${cls} text-center text-[#94A3B8]`} title="Disciplina sem arquivos no filtro atual">—</td>;
                      const owner = OWNER[disc.responsibleKind] || OWNER.unidentified;
                      return (
                        <td key={d} className={`${cls} p-1`}>
                          <span title={disc.responsibilitySource || undefined} className="mb-1 block truncate rounded px-1 py-0.5 text-[11px] font-bold" style={{ color: owner.c, background: owner.bg }}>{disc.responsible || 'Responsável não identificado'}</span>
                          {views.map((v) => {
                            const key = `${p.code}|${d}|${v.family}`; const t = STATUS_TOKEN[v.status];
                            const multi = v.comps.length > 1; const partial = multi && v.delivered > 0 && v.delivered < v.applicable;
                            return (
                              <div key={v.family} className="mb-0.5 grid grid-cols-[52px_16px_26px_1fr] items-center rounded" style={{ background: t.bg, opacity: v.status === 'na' ? 0.62 : 1 }}>
                                <span className="truncate pl-1 font-bold">{matrixFamilyCode(v.family)}</span>
                                <span className="flex justify-center">
                                  {v.sev !== 'none' && <button type="button" aria-label={`Alerta ${SEV_LABEL[v.sev]} em ${matrixFamilyCode(v.family)}`} className={`rounded ${focusRing}`} onClick={() => onFamilyAlert(key)}><SevGlyph sev={v.sev} /></button>}
                                </span>
                                {v.interactive ? (
                                  <button type="button" className={`col-span-2 grid grid-cols-[26px_1fr] items-center text-left ${focusRing}`} aria-label={`${matrixFamilyCode(v.family)} · ${v.label}: ${STATUS_LABEL[v.status]}`}
                                    onMouseEnter={(e) => showTip(v, e.currentTarget)} onFocus={(e) => showTip(v, e.currentTarget)} onMouseLeave={() => setTip(null)} onBlur={() => setTip(null)}
                                    onClick={() => onDetail('family', key, `${matrixFamilyCode(v.family)} · ${v.label} — detalhamento`)}>
                                    <span className="flex justify-center tabular-nums font-bold" style={{ color: t.text }}>{partial ? `${v.delivered}/${v.applicable}` : <StatusGlyph status={v.status} />}</span>
                                    <span className="truncate tabular-nums text-[#475569]">{multi && v.delivered === 0 ? '' : v.date}</span>
                                  </button>
                                ) : <span className="col-span-2 pl-2"><StatusGlyph status={v.status} /></span>}
                              </div>
                            );
                          })}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {tip && (
        <div role="tooltip" className="pointer-events-none fixed z-50 w-[300px] rounded-xl border border-[#E5E7EB] bg-white p-3 text-[12px] shadow-xl" style={{ left: tip.x, top: tip.y }}>
          <p className="font-bold">{matrixFamilyCode(tip.view.family)} · {tip.view.label}</p>
          <p className="mb-1 text-[#64748B]">{tip.view.applicable ? `${applicablePercent(tip.view.delivered, tip.view.applicable - tip.view.delivered)}% · ${tip.view.delivered}/${tip.view.applicable} disponibilizados · clique para aprofundar` : 'Sem componentes aplicáveis no filtro atual'}</p>
          {tip.view.comps.map((c) => <p key={c.recordKey} style={{ color: STATUS_TOKEN[c.status].text }}>{natureLine(c)}</p>)}
        </div>
      )}
    </section>
  );
}
