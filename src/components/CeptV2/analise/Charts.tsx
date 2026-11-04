// 7 visuais da origem (E §5.2) com tokens F0 §3/§6.4.
import type { ReactNode } from 'react';
import { List } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Cell, LabelList, Pie, PieChart, Rectangle, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { CHART_GROUPS, deliverableLabel, groupPercent, kpis, perfColor, statusPercentText, type Group, type Rec } from './model';
import { btnGhost, focusRing, SEV_TOKEN, STATUS_TOKEN } from './Ui';

const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const anim = { isAnimationActive: !reduced, animationDuration: 260 };
const axisTick = { fontSize: 11, fill: '#64748B' };
const pctTicks = [0, 25, 50, 75, 100];
const groupTooltip = (g: Group) => `${g.label}: ${g.percent}% (${g.delivered}/${g.applicable})`;

// Recharts' chart-level accessibility does not make individual bars buttons.
const keyboardBar = (label: (data: any) => string, activate: (data: any) => void) => (props: any) => (
  <g role="button" tabIndex={0} aria-label={label(props.payload)} className={focusRing}
    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activate(props.payload); } }}>
    <Rectangle {...props} />
  </g>
);

export function ChartCard({ title, subtitle, onList, children, id, className = '' }: { title: string; subtitle?: string; onList: () => void; children: ReactNode; id: string; className?: string }) {
  return (
    <section data-cept-chart={id} aria-label={title} className={`rounded-2xl bg-white p-6 shadow-[0_10px_30px_-22px_rgba(15,23,42,0.45)] ${className}`}>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div><h3 className="text-[15px] font-bold">{title}</h3>{subtitle && <p className="text-[12px] text-[#64748B]">{subtitle}</p>}</div>
        <button type="button" data-html2canvas-ignore onClick={onList} className={`${btnGhost} h-8 shrink-0`}><List size={14} aria-hidden />Abrir lista</button>
      </div>
      {children}
    </section>
  );
}
const Empty = ({ h = 200 }: { h?: number }) => <div style={{ height: h }} className="flex items-center justify-center text-[13px] text-[#64748B]">Sem dados</div>;

function GroupTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: Group & { children?: number } }> }) {
  if (!active || !payload?.length) return null;
  const g = payload[0].payload;
  return <div className="rounded-lg border border-[#E5E7EB] bg-white px-3 py-2 text-[12px] shadow">{groupTooltip(g)}{g.children ? ` · ${g.children} filho(s)` : ''}</div>;
}

/** G1a + G1b */
export function StatusCharts({ records, onStatus, onSeverity }: { records: Rec[]; onStatus: (s: 'delivered' | 'pending') => void; onSeverity: (s: 'red' | 'yellow' | 'green') => void }) {
  const k = kpis(records);
  const total = k.delivered + k.pending;
  const data = [
    { name: 'Disponibilizados', value: k.delivered, status: 'delivered' as const, fill: STATUS_TOKEN.delivered.fill },
    { name: 'Pendentes', value: k.pending, status: 'pending' as const, fill: STATUS_TOKEN.pending.fill },
  ];
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div>
        <h4 className="mb-1 text-[12px] font-bold uppercase tracking-[.04em] text-[#64748B]">Entregas</h4>
        {!total ? <Empty h={230} /> : (
          <div className="h-[230px]">
            <ResponsiveContainer>
              <PieChart accessibilityLayer>
                <Pie data={data} dataKey="value" nameKey="name" innerRadius="50%" outerRadius="85%" startAngle={90} endAngle={-270} {...anim}
                  onClick={(d: { payload?: { status: 'delivered' | 'pending' } }) => d.payload && onStatus(d.payload.status)} className="cursor-pointer"
                  labelLine={false}
                  label={({ cx, cy, midAngle, innerRadius, outerRadius, value }: { cx: number; cy: number; midAngle: number; innerRadius: number; outerRadius: number; value: number }) => {
                    if (!value) return null;
                    const r = (innerRadius + outerRadius) / 2; const a = -midAngle * Math.PI / 180;
                    return <text x={cx + r * Math.cos(a)} y={cy + r * Math.sin(a)} textAnchor="middle" dominantBaseline="central" fill="#fff" stroke="#1E293B" strokeWidth={3} paintOrder="stroke" fontSize={16} fontWeight={800}>{statusPercentText(value, total)}</text>;
                  }}>
                  {data.map((d) => <Cell key={d.status} fill={d.fill} />)}
                </Pie>
                <Tooltip formatter={(v) => [`${v}`, '']} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}
        <div className="flex justify-center gap-4 text-[12px]">
          {data.map((d) => (
            <button key={d.status} type="button" onClick={() => onStatus(d.status)} className={`inline-flex items-center gap-1.5 ${focusRing}`}>
              <span aria-hidden className="h-3 w-3 rounded-sm" style={{ background: d.fill }} />{d.name} ({d.value})
            </button>
          ))}
        </div>
      </div>
      <div>
        <h4 className="mb-1 text-[12px] font-bold uppercase tracking-[.04em] text-[#64748B]">Alertas</h4>
        <AlertBarsL values={{ red: k.red, yellow: k.yellow, green: k.green }} onSelect={onSeverity} />
      </div>
    </div>
  );
}

/** G1b - colunas em "L" em SVG proprio (E §5.2). */
function AlertBarsL({ values, onSelect }: { values: { red: number; yellow: number; green: number }; onSelect: (s: 'red' | 'yellow' | 'green') => void }) {
  const W = 300; const H = 230; const L = 36; const R = 14; const T = 28; const B = 38;
  const m = Math.max(values.red, values.yellow, values.green);
  const max = m <= 4 ? 4 : m <= 8 ? 8 : Math.ceil(m / 5) * 5;
  const keys = ['red', 'yellow', 'green'] as const;
  const labels = { red: 'Vermelhos', yellow: 'Amarelos', green: 'Validados' };
  const slot = (W - L - R) / 3; const bw = Math.max(30, Math.min(58, slot * 0.48)); const th = Math.max(4, bw * 0.15);
  const y = (v: number) => T + (H - T - B) * (1 - v / max);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-[230px] w-full" role="group" aria-label="Alertas por severidade">
      {[0, 1, 2, 3, 4].map((i) => { const v = max * i / 4; return <g key={i}><line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="#E5E7EB" /><text x={L - 6} y={y(v)} textAnchor="end" dominantBaseline="central" fontSize={10} fill="#64748B">{Math.round(v)}</text></g>; })}
      {keys.map((k, i) => {
        const x = L + slot * i + (slot - bw) / 2; const top = y(values[k]); const base = H - B; const c = SEV_TOKEN[k].fill;
        return (
          <g key={k} role="button" tabIndex={0} aria-label={`${labels[k]}: ${values[k]}`} className="cursor-pointer outline-none [&:focus-visible>rect:first-child]:stroke-[#F05D28]"
            onClick={() => onSelect(k)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(k); } }}>
            <rect x={x - 4} y={T - 4} width={bw + 8} height={base - T + 8} fill="transparent" strokeWidth={2} />
            {values[k] > 0 && <rect x={x} y={top} width={bw} height={base - top} fill="#94A3B8" />}
            {values[k] > 0 && <rect x={x} y={top} width={th} height={base - top} fill={c} />}
            <rect x={x} y={base - th} width={bw} height={th} fill={c} />
            <text x={x + bw / 2} y={top - 6} textAnchor="middle" fontSize={13} fontWeight={800} fill={SEV_TOKEN[k].text}>{values[k]}</text>
            <text x={x + bw / 2} y={base + 16} textAnchor="middle" fontSize={11} fill="#475569">{labels[k]}</text>
          </g>
        );
      })}
    </svg>
  );
}

/** G2 - OS061 nao tem subprojeto: so pais (E §5.2 sem filtro de subprojeto). */
export function ProjectBars({ records, projectName, onSelect }: { records: Rec[]; projectName: (code: string) => string; onSelect: (code: string) => void }) {
  const groups = groupPercent(records, (r) => r.projectCode, (c) => `${c} - ${projectName(c)}`).sort((a, b) => a.key.localeCompare(b.key, 'pt-BR', { numeric: true }));
  if (!groups.length) return <Empty h={330} />;
  return (
    <div className="h-[330px]">
      <ResponsiveContainer>
        <BarChart data={groups} margin={{ top: 24, right: 8, left: 0, bottom: 8 }} accessibilityLayer>
          <CartesianGrid vertical={false} stroke="#E5E7EB" />
          <XAxis dataKey="label" angle={-28} textAnchor="end" height={80} interval={0} tick={{ ...axisTick, fontSize: 10 }} />
          <YAxis domain={[0, 115]} ticks={pctTicks} tickFormatter={(v) => `${v}%`} tick={axisTick} width={44} />
          <Tooltip content={<GroupTooltip />} cursor={{ fill: 'rgba(240,93,40,.06)' }} />
          <Bar dataKey="percent" {...anim} shape={keyboardBar(groupTooltip, (g: Group) => onSelect(g.key))} className="cursor-pointer" onClick={(d: { payload?: Group }) => d.payload && onSelect(d.payload.key)}>
            {groups.map((g) => <Cell key={g.key} fill={perfColor(g.percent)} />)}
            <LabelList dataKey="percent" position="top" formatter={(v: unknown) => `${v}%`} style={{ fontSize: 11, fontWeight: 700, fill: '#475569' }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** G3 - 9 componentes fixos em 5 grupos, so grupos com aplicavel > 0 (B8 copiado). */
export function DeliverableBars({ records, onComponent, onGroup }: { records: Rec[]; onComponent: (k: string) => void; onGroup: (g: string) => void }) {
  const byKey = new Map(groupPercent(records, (r) => r.chartKey).map((g) => [g.key, g]));
  const rows = CHART_GROUPS.map((grp) => {
    const edit = grp === 'IFC' ? byKey.get('IFC') : byKey.get(grp + '_EDIT');
    const pdf = grp === 'IFC' ? undefined : byKey.get(grp + '_PDF');
    const delivered = (edit?.delivered || 0) + (pdf?.delivered || 0); const applicable = (edit?.applicable || 0) + (pdf?.applicable || 0);
    return { grp, edit: edit?.percent, pdf: pdf?.percent, editG: edit, pdfG: pdf, delivered, applicable };
  }).filter((r) => r.applicable > 0);
  if (!rows.length) return <Empty h={225} />;
  const tip = ({ active, payload }: { active?: boolean; payload?: Array<{ dataKey: string; payload: typeof rows[number] }> }) => {
    if (!active || !payload?.length) return null;
    return <div className="rounded-lg border border-[#E5E7EB] bg-white px-3 py-2 text-[12px] shadow">{payload.map((p) => { const g = p.dataKey === 'edit' ? p.payload.editG : p.payload.pdfG; return g ? <div key={p.dataKey}>{groupTooltip({ ...g, label: deliverableLabel(g.key) })}</div> : null; })}</div>;
  };
  const click = (series: 'edit' | 'pdf') => (d: { payload?: typeof rows[number] }) => {
    const r = d.payload; if (!r) return;
    onComponent(r.grp === 'IFC' ? 'IFC' : `${r.grp}_${series === 'edit' ? 'EDIT' : 'PDF'}`);
  };
  return (
    <div>
      <div className="h-[225px]">
        <ResponsiveContainer>
          <BarChart data={rows} margin={{ top: 22, right: 8, left: 0, bottom: 0 }} barCategoryGap="18%" accessibilityLayer>
            <CartesianGrid vertical={false} stroke="#E5E7EB" />
            <XAxis dataKey="grp" tick={axisTick} />
            <YAxis domain={[0, 115]} ticks={pctTicks} tickFormatter={(v) => `${v}%`} tick={axisTick} width={44} />
            <Tooltip content={tip} cursor={{ fill: 'rgba(240,93,40,.06)' }} />
            {(['edit', 'pdf'] as const).map((s) => (
              <Bar key={s} dataKey={s} name={s === 'edit' ? 'Editável' : 'PDF'} {...anim}
                shape={keyboardBar((r) => `${r.grp} ${s === 'edit' ? 'Editável' : 'PDF'}: ${r[s] ?? 0}%`, (r) => click(s)({ payload: r }))}
                className="cursor-pointer" onClick={click(s)}>
                {rows.map((r) => <Cell key={r.grp} fill={perfColor((s === 'edit' ? r.edit : r.pdf) ?? 0)} />)}
                <LabelList dataKey={s} position="top" content={({ x, y, width, value, index }: { x?: number | string; y?: number | string; width?: number | string; value?: unknown; index?: number }) => {
                  if (value === undefined || value === null) return null;
                  const r = rows[index ?? 0]; const tag = r.grp === 'IFC' ? '—' : s === 'edit' ? 'Edit' : 'PDF';
                  return <text x={Number(x) + Number(width) / 2} y={Number(y) - 6} textAnchor="middle" fontSize={10} fontWeight={700} fill="#475569">{`${value}% · ${tag}`}</text>;
                }} />
              </Bar>
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-4 flex flex-wrap justify-center gap-4">
        {rows.map((r) => <div key={r.grp}><HalfDonut label={r.grp} delivered={r.delivered} applicable={r.applicable} onClick={() => onGroup(r.grp)} /></div>)}
      </div>
    </div>
  );
}

function HalfDonut({ label, delivered, applicable, onClick }: { label: string; delivered: number; applicable: number; onClick: () => void }) {
  const pct = applicable ? delivered / applicable * 100 : 0;
  const arc = 'M 11 80 A 69 69 0 0 1 149 80';
  return (
    <button type="button" onClick={onClick} className={`flex w-[180px] flex-col items-center rounded-xl p-2 hover:bg-[#FFF3EC] ${focusRing}`} aria-label={`${label}: ${statusPercentText(delivered, applicable)} concluído`}>
      <svg viewBox="0 0 160 88" className="h-[88px] w-[160px]" aria-hidden>
        <path d={arc} fill="none" stroke={STATUS_TOKEN.pending.fill} strokeWidth={22} />
        {delivered > 0 && <path d={arc} fill="none" stroke={STATUS_TOKEN.delivered.fill} strokeWidth={22} pathLength={100} strokeDasharray={`${pct} 100`} />}
        <text x={80} y={74} textAnchor="middle" fontSize={18} fontWeight={800} fill="#2D2D2D">{statusPercentText(delivered, applicable)}</text>
      </svg>
      <span className="text-[13px] font-bold">{label}</span>
      <span className="text-[11px] text-[#64748B]">{delivered} disponibilizados · {applicable - delivered} pendentes</span>
    </button>
  );
}

/** G4 / G5 - barras horizontais com altura dinamica da origem. */
export function GroupBars({ groups, heightOf, yWidth, onSelect }: { groups: Group[]; heightOf: (n: number) => number; yWidth: number; onSelect: (key: string) => void }) {
  if (!groups.length) return <Empty h={300} />;
  return (
    <div style={{ height: heightOf(groups.length) }}>
      <ResponsiveContainer>
        <BarChart data={groups} layout="vertical" margin={{ top: 8, right: 36, left: 4, bottom: 8 }} accessibilityLayer>
          <CartesianGrid horizontal={false} stroke="#E5E7EB" />
          <XAxis type="number" domain={[0, 115]} ticks={pctTicks} tickFormatter={(v) => `${v}%`} tick={axisTick} />
          <YAxis type="category" dataKey="label" width={yWidth} interval={0} tick={axisTick} />
          <Tooltip content={<GroupTooltip />} cursor={{ fill: 'rgba(240,93,40,.06)' }} />
          <Bar dataKey="percent" {...anim} shape={keyboardBar(groupTooltip, (g: Group) => onSelect(g.key))} className="cursor-pointer" onClick={(d: { payload?: Group }) => d.payload && onSelect(d.payload.key)}>
            {groups.map((g) => <Cell key={g.key} fill={perfColor(g.percent)} />)}
            <LabelList dataKey="percent" position="right" formatter={(v: unknown) => `${v}%`} style={{ fontSize: 11, fontWeight: 700, fill: '#475569' }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
export const disciplineHeight = (n: number) => Math.max(350, Math.min(710, n * 23 + 95));
export const responsibleHeight = (n: number) => Math.max(300, Math.min(430, n * 29 + 90));
