// Pecas compartilhadas da Analise das OS: casca de modal, filtros, glifos de status/alerta.
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { AlertTriangle, CalendarDays, Check, ChevronDown, Circle, ShieldCheck } from 'lucide-react';
import type { CeptDisplaySeverity, CeptStatus } from '../../../lib/cept/rules';
import { dateFilterText, dateFilterValid, isoToDisplay, norm, parseDigitsDate, SEV_LABEL, STATUS_LABEL, type DateFilter, type DateMode } from './model';

// Tokens F0 §3.1/3.2 (uma convencao so, corrige B5)
export const STATUS_TOKEN: Record<CeptStatus, { text: string; bg: string; fill: string }> = {
  delivered: { text: '#15803D', bg: '#F0FDF4', fill: '#16A34A' },
  pending: { text: '#C2410C', bg: '#FFF7ED', fill: '#EA580C' },
  unknown: { text: '#A16207', bg: '#FEFCE8', fill: '#CA8A04' },
  na: { text: '#64748B', bg: '#F1F5F9', fill: '#CBD5E1' },
};
export const SEV_TOKEN: Record<CeptDisplaySeverity, { text: string; fill: string }> = {
  red: { text: '#B91C1C', fill: '#DC2626' }, yellow: { text: '#B45309', fill: '#D97706' }, green: { text: '#15803D', fill: '#16A34A' }, none: { text: '#64748B', fill: '#CBD5E1' },
};
export const focusRing = 'outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F05D28]';

export function StatusGlyph({ status, size = 12 }: { status: CeptStatus; size?: number }) {
  const c = STATUS_TOKEN[status].text;
  if (status === 'delivered') return <Check size={size} color={c} strokeWidth={3} aria-hidden />;
  if (status === 'pending') return <Circle size={size - 2} color={c} fill={c} aria-hidden />;
  return <span aria-hidden style={{ color: c }} className="font-bold leading-none">{status === 'unknown' ? '?' : '—'}</span>;
}
export function SevGlyph({ sev, size = 12 }: { sev: CeptDisplaySeverity; size?: number }) {
  if (sev === 'none') return null;
  const Icon = sev === 'green' ? ShieldCheck : AlertTriangle;
  return <Icon size={size} color={SEV_TOKEN[sev].fill} fill={sev === 'green' ? 'none' : SEV_TOKEN[sev].fill} stroke={sev === 'green' ? SEV_TOKEN[sev].fill : '#fff'} aria-label={SEV_LABEL[sev]} />;
}
export const StatusText = ({ status }: { status: CeptStatus }) => (
  <span className="inline-flex items-center gap-1 font-semibold" style={{ color: STATUS_TOKEN[status].text }}><StatusGlyph status={status} />{STATUS_LABEL[status]}</span>
);

let openModals = 0;
let previousOverflow = '';
/** Casca unica: <dialog> nativo (foco preso, Esc, top layer, foco volta ao gatilho). Corrige B4. */
export function Modal({ title, subtitle, onClose, actions, children, footer, size = 'max-w-6xl' }: {
  title: ReactNode; subtitle?: ReactNode; onClose: () => void; actions?: ReactNode; children: ReactNode; footer?: ReactNode; size?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const d = ref.current;
    d?.showModal();
    if (!openModals) previousOverflow = document.body.style.overflow;
    openModals++;
    document.body.style.overflow = 'hidden';
    return () => { d?.close(); openModals--; if (!openModals) document.body.style.overflow = previousOverflow; };
  }, []);
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(e) => { e.preventDefault(); onClose(); }}
      onClick={(e) => { if (e.target === ref.current) onClose(); }}
      className={`m-auto w-[calc(100%_-_1rem)] ${size} max-h-[92vh] overflow-hidden rounded-[28px] bg-transparent p-0 backdrop:bg-[rgba(15,23,42,.46)] max-sm:h-full max-sm:max-h-full max-sm:w-full max-sm:rounded-none`}
    >
      <div className="flex max-h-[92vh] flex-col bg-white text-[#2D2D2D] max-sm:h-full max-sm:max-h-full">
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-[#E5E7EB] px-6 py-4">
          <div className="min-w-0">
            <h2 id={titleId} className="text-[18px] font-bold">{title}</h2>
            {subtitle && <p className="mt-0.5 text-[12px] text-[#64748B]">{subtitle}</p>}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {actions}
            <button type="button" onClick={onClose} className={`h-9 rounded-lg border border-[#E5E7EB] px-3 text-[12px] font-bold text-[#475569] hover:bg-[#F3F4F6] ${focusRing}`}>Fechar</button>
          </div>
        </header>
        <div className="min-h-0 flex-1 overflow-auto px-6 py-4">{children}</div>
        {footer}
      </div>
    </dialog>
  );
}

export const btn = `inline-flex h-9 items-center justify-center gap-1.5 rounded-lg px-3 text-[12px] font-bold disabled:opacity-50 ${focusRing}`;
export const btnPrimary = `${btn} bg-[#F05D28] text-white hover:bg-[#D94E1F]`;
export const btnDark = `${btn} bg-[#2D2D2D] text-white hover:bg-[#1E293B]`;
export const btnGhost = `${btn} border border-[#E5E7EB] bg-white text-[#475569] hover:bg-[#F3F4F6]`;

const triggerCls = `flex h-10 w-full items-center justify-between gap-2 rounded-lg border border-[#E5E7EB] bg-white px-3 text-left text-[12px] hover:border-[#F05D28] ${focusRing}`;
const panelCls = 'absolute left-0 top-full z-40 mt-1 w-72 max-w-[90vw] rounded-xl border border-[#E5E7EB] bg-white p-2 shadow-[0_22px_50px_-18px_rgba(15,23,42,.38)]';

/** Multi-filtro da origem (E §3.1-3.2): busca sem acento, Selecionar visiveis, Limpar filtro. */
export function MultiFilter({ label, value, options, labelOf = (v) => v, defaultText = 'Todos', open, onOpen, onChange, disabled }: {
  label: string; value: string[]; options: string[]; labelOf?: (v: string) => string; defaultText?: string;
  open: boolean; onOpen: (open: boolean) => void; onChange: (v: string[]) => void; disabled?: boolean;
}) {
  const [q, setQ] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const id = useId();
  useEffect(() => { if (open) { setQ(''); setTimeout(() => inputRef.current?.focus(), 20); } }, [open]);
  const visible = options.filter((o) => norm(labelOf(o)).includes(norm(q)));
  const text = !value.length ? defaultText : value.length === 1 ? labelOf(value[0]) : value.length === options.length ? `Todos selecionados (${value.length})` : `${value.length} selecionados`;
  return (
    <div data-cept-filter className={`relative min-w-0 ${disabled ? 'pointer-events-none opacity-[.48]' : ''}`}>
      <span id={id} className="mb-1 block text-[11px] font-bold uppercase tracking-[.04em] text-[#64748B]">{label}</span>
      <button type="button" disabled={disabled} aria-labelledby={id} aria-expanded={open} title={value.map(labelOf).join(' · ')} onClick={() => onOpen(!open)} className={triggerCls}>
        <span className={`truncate ${value.length ? 'font-bold' : ''}`}>{text}</span><ChevronDown size={14} aria-hidden className="shrink-0 text-[#64748B]" />
      </button>
      {open && (
        <div className={panelCls}>
          <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Digite para localizar..." aria-label={`Buscar em ${label}`}
            className={`h-9 w-full rounded-lg border border-[#E5E7EB] px-2 text-[12px] ${focusRing}`} />
          <div className="my-2 flex gap-2">
            <button type="button" className={`${btnGhost} h-8 flex-1`} onClick={() => onChange([...new Set([...value, ...visible])])}>Selecionar visíveis</button>
            <button type="button" className={`${btnGhost} h-8 flex-1`} onClick={() => onChange([])}>Limpar filtro</button>
          </div>
          <div className="max-h-64 overflow-auto">
            {!visible.length && <p className="px-2 py-2 text-[12px] text-[#64748B]">Nenhuma opção encontrada.</p>}
            {visible.map((o) => (
              <label key={o} className="flex min-h-8 cursor-pointer items-center gap-2 rounded-lg px-2 py-1 text-[12px] hover:bg-[#FFF3EC]">
                <input type="checkbox" className="accent-[#F05D28]" checked={value.includes(o)} onChange={(e) => onChange(e.target.checked ? [...value, o] : value.filter((x) => x !== o))} />
                <span className="truncate">{labelOf(o)}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function DateSlot({ label, iso, invalidMsg, onCommit }: { label: string; iso: string; invalidMsg: string; onCommit: (iso: string | null, raw: string) => void }) {
  const [raw, setRaw] = useState(iso ? isoToDisplay(iso).replace(/\//g, '') : '');
  const id = useId();
  useEffect(() => { setRaw(iso ? isoToDisplay(iso).replace(/\//g, '') : ''); }, [iso]);
  const commit = () => onCommit(raw ? parseDigitsDate(raw) : '', raw);
  return (
    <div className="mt-2">
      <label htmlFor={id} className="block text-[11px] font-bold uppercase tracking-[.04em] text-[#64748B]">{label}</label>
      <div className="relative mt-1 flex items-center gap-2">
        <input id={id} inputMode="numeric" maxLength={8} value={raw} placeholder="DDMMAA" aria-invalid={!!invalidMsg} aria-describedby={invalidMsg ? id + 'e' : undefined}
          onChange={(e) => setRaw(e.target.value.replace(/\D/g, ''))} onBlur={commit} onKeyDown={(e) => { if (e.key === 'Enter') commit(); }}
          className={`h-9 w-full rounded-lg border px-2 text-[12px] tabular-nums ${invalidMsg ? 'border-[#DC2626]' : 'border-[#E5E7EB]'} ${focusRing}`} />
        <span className="relative inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#E5E7EB]">
          <CalendarDays size={16} aria-hidden className="text-[#64748B]" />
          <input type="date" aria-label={`${label}: calendário`} className="absolute inset-0 cursor-pointer opacity-0" value={iso}
            onChange={(e) => { const v = e.target.value; if (v) onCommit(v, ''); }} />
        </span>
      </div>
      {invalidMsg && <p id={id + 'e'} className="mt-1 text-[11px] font-semibold text-[#B91C1C]">{invalidMsg}</p>}
    </div>
  );
}

/** E §3.3 + B7: between invertido marca as duas datas como invalidas. */
export function DateFilterControl({ value, onChange, open, onOpen }: { value: DateFilter; onChange: (d: DateFilter) => void; open: boolean; onOpen: (o: boolean) => void }) {
  const [bad, setBad] = useState<{ from?: boolean; to?: boolean }>({});
  const inverted = value.mode === 'between' && !!value.from && !!value.to && value.from > value.to;
  const msg = (slot: 'from' | 'to') => (bad[slot] ? 'Data inválida. Digite DDMMAA ou DDMMAAAA.' : inverted ? 'A data inicial é depois da final.' : '');
  const commit = (slot: 'from' | 'to') => (iso: string | null) => { setBad((b) => ({ ...b, [slot]: iso === null })); if (iso !== null) onChange({ ...value, [slot]: iso }); };
  const active = dateFilterValid(value);
  return (
    <div data-cept-filter className="relative min-w-0">
      <span className="mb-1 block text-[11px] font-bold uppercase tracking-[.04em] text-[#64748B]">Data de postagem</span>
      <button type="button" aria-expanded={open} onClick={() => onOpen(!open)} className={triggerCls}>
        <span className={`truncate ${active ? 'font-bold' : ''}`}>{dateFilterText(value)}</span><ChevronDown size={14} aria-hidden className="shrink-0 text-[#64748B]" />
      </button>
      {open && (
        <div className={`${panelCls} right-0 left-auto`}>
          <label className="block text-[11px] font-bold uppercase tracking-[.04em] text-[#64748B]">Modo
            <select value={value.mode} onChange={(e) => onChange({ ...value, mode: e.target.value as DateMode })}
              className={`mt-1 h-9 w-full rounded-lg border border-[#E5E7EB] bg-white px-2 text-[12px] normal-case ${focusRing}`}>
              <option value="">Sem filtro de data</option><option value="until">Até</option><option value="between">Entre</option><option value="after">Depois de</option>
            </select>
          </label>
          {value.mode && <DateSlot label={value.mode === 'between' ? 'De' : 'Até'} iso={value.from} invalidMsg={msg('from')} onCommit={commit('from')} />}
          {value.mode === 'between' && <DateSlot label="Até" iso={value.to} invalidMsg={msg('to')} onCommit={commit('to')} />}
          <div className="mt-3 flex gap-2">
            <button type="button" className={`${btnGhost} h-8 flex-1`} onClick={() => { setBad({}); onChange({ mode: '', from: '', to: '' }); }}>Limpar data</button>
            <button type="button" className={`${btnGhost} h-8 flex-1`} onClick={() => onOpen(false)}>Fechar</button>
          </div>
        </div>
      )}
    </div>
  );
}

export function Banner({ tone, children, action }: { tone: 'error' | 'warn'; children: ReactNode; action?: ReactNode }) {
  const c = tone === 'error' ? 'border-[#F0C7C2] bg-[#FFF0EE] text-[#9C3732]' : 'border-[#FDE68A] bg-[#FFFBEB] text-[#B45309]';
  return <div role={tone === 'error' ? 'alert' : 'status'} className={`flex flex-wrap items-center justify-between gap-2 rounded-xl border px-4 py-3 text-[13px] font-semibold ${c}`}><span>{children}</span>{action}</div>;
}
