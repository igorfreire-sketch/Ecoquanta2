// Motor de planilha unico para as 3 grades (F0 §5.2-5.3): selecao em faixa, teclado, TSV,
// desfazer da sessao, estados por celula (salvando/erro/conflito/recusado), sticky.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check } from 'lucide-react';
import { saveCeptRecord, type CeptEditableCollection } from '../../../lib/cept/data';
import { parseTsv } from './parse';

export type CellKind = 'check' | 'status' | 'date' | 'text' | 'int' | 'select' | 'ro';

export interface CellWrite {
  collection: CeptEditableCollection;
  id: string;
  version: number;
  doc: Record<string, unknown>; // estado atual (base do merge de mapas aninhados: lod, etapas)
  patch: Record<string, unknown>; // mapas aninhados podem vir parciais
}

export interface Cell {
  kind: CellKind;
  text: string; // valor como texto (copiar / semente da edicao)
  display?: string; // texto exibido, se diferente
  options?: readonly string[];
  disabled?: string; // motivo (celula proibida)
  hint?: string; // title extra
  dot?: boolean; // ponto ambar (ex.: data sem check)
  note?: string; // comentario da planilha (triangulo laranja)
  italic?: boolean;
  tone?: 'delivered' | 'pending' | 'na' | 'unknown';
  naCont?: boolean; // continua um bloco N/A da linha de cima (simula a mescla)
  hideTop?: boolean; // mescla visual com a linha de cima
  commit?: (text: string) => CellWrite | { error: string };
}

export interface Column<R> {
  key: string;
  label: string;
  group?: string; // cabecalho de 1o nivel (colunas consecutivas iguais fundem)
  width: number;
  sticky?: boolean;
  cell: (row: R, index: number) => Cell;
}

type Pos = { r: number; c: number };
type CellState = { s: 'saving' | 'error' | 'conflict' | 'rejected'; msg: string; mine?: string };
type Change = { r: number; c: number; text: string };
type UndoEntry = Array<{ rowKey: string; colKey: string; text: string }>;

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
function deepMerge(base: unknown, patch: unknown): unknown {
  if (!isObj(base) || !isObj(patch)) return patch;
  const out: Record<string, unknown> = { ...base };
  Object.entries(patch).forEach(([k, v]) => { out[k] = deepMerge(base[k], v); });
  return out;
}
const CONFLICT_RE = /alterado por outra pessoa|vers[aã]o esperada/i;
const errMsg = (e: unknown) => {
  const code = (e as { code?: string })?.code;
  if (code === 'permission-denied') return 'Sem permissão para editar o CEPT.';
  return e instanceof Error ? e.message : String(e);
};

const TONE: Record<NonNullable<Cell['tone']>, string> = {
  delivered: 'bg-[#F0FDF4] text-[#15803D]',
  pending: 'text-[#C2410C]',
  na: 'bg-[#F1F5F9] text-[#64748B]',
  unknown: 'bg-[#FEFCE8] text-[#A16207]',
};

export default function SheetGrid<R>({
  rows, columns, rowKey, readOnly, label,
}: { rows: R[]; columns: Column<R>[]; rowKey: (row: R) => string; readOnly: boolean; label: string }) {
  const [active, setActive] = useState<Pos>({ r: 0, c: 0 });
  const [anchor, setAnchor] = useState<Pos>({ r: 0, c: 0 });
  const [editing, setEditing] = useState<{ draft: string; start: string } | null>(null);
  const [states, setStates] = useState<Record<string, CellState>>({});
  const [toast, setToast] = useState('');
  const undo = useRef<UndoEntry[]>([]);
  const redo = useRef<UndoEntry[]>([]);
  const gridRef = useRef<HTMLDivElement>(null);
  const idBase = useMemo(() => 'g' + Math.random().toString(36).slice(2, 8), []);

  const cellAt = useCallback((r: number, c: number) => columns[c].cell(rows[r], r), [columns, rows]);
  const sk = useCallback((r: number, c: number) => `${rowKey(rows[r])}|${columns[c].key}`, [rows, columns, rowKey]);
  const lastRow = rows.length - 1;
  const lastCol = columns.length - 1;
  const sel = {
    r0: Math.min(active.r, anchor.r), r1: Math.max(active.r, anchor.r),
    c0: Math.min(active.c, anchor.c), c1: Math.max(active.c, anchor.c),
  };

  const pending = (Object.values(states) as CellState[]).filter((s) => s.s === 'saving' || s.s === 'error').length;
  useEffect(() => {
    if (!pending) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [pending]);

  useEffect(() => { if (active.r > lastRow && lastRow >= 0) { setActive({ r: lastRow, c: active.c }); setAnchor({ r: lastRow, c: active.c }); } }, [lastRow, active]);
  useEffect(() => {
    document.getElementById(`${idBase}-${active.r}-${active.c}`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [active, idBase]);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(''), 6000); return () => clearTimeout(t); }, [toast]);

  /** Valida, agrupa por doc (varias celulas do mesmo doc = 1 gravacao) e salva. */
  const commit = useCallback(async (changes: Change[], record: 'undo' | 'redo' | 'none' = 'undo') => {
    if (readOnly) return;
    const byDoc = new Map<string, { w: CellWrite; keys: string[]; mine: string[] }>();
    const inverse: UndoEntry = [];
    const next: Record<string, CellState> = {};
    let rejected = 0;
    let lastReason = '';
    changes.forEach(({ r, c, text }) => {
      if (!rows[r] || !columns[c]) return;
      const cell = cellAt(r, c);
      if (!cell.commit || cell.disabled || cell.kind === 'ro') return;
      if (text === cell.text) return;
      const res = cell.commit(text);
      const key = sk(r, c);
      if ('error' in res) { rejected += 1; lastReason = res.error; next[key] = { s: 'rejected', msg: res.error, mine: text }; return; }
      inverse.push({ rowKey: rowKey(rows[r]), colKey: columns[c].key, text: cell.text });
      const id = `${res.collection}/${res.id}`;
      const prev = byDoc.get(id);
      if (prev) { prev.w = { ...prev.w, patch: deepMerge(prev.w.patch, res.patch) as Record<string, unknown> }; prev.keys.push(key); prev.mine.push(text); }
      else byDoc.set(id, { w: res, keys: [key], mine: [text] });
      next[key] = { s: 'saving', msg: 'Salvando...', mine: text };
    });
    setStates((s) => ({ ...s, ...next }));
    if (rejected) setToast(`${rejected} célula(s) recusada(s): ${lastReason}`);
    if (inverse.length && record !== 'none') {
      (record === 'redo' ? redo : undo).current.push(inverse);
      if (record === 'undo') redo.current = [];
    }
    await Promise.all([...byDoc.values()].map(async ({ w, keys, mine }) => {
      const patch: Record<string, unknown> = {};
      Object.entries(w.patch).forEach(([k, v]) => { patch[k] = deepMerge(w.doc[k], v); });
      try {
        await saveCeptRecord(w.collection, w.id, patch, w.version);
        setStates((s) => { const o = { ...s }; keys.forEach((k) => delete o[k]); return o; });
      } catch (e) {
        const msg = errMsg(e);
        const conflict = CONFLICT_RE.test(msg);
        setStates((s) => {
          const o = { ...s };
          keys.forEach((k, i) => {
            o[k] = conflict
              ? { s: 'conflict', msg: `Alterado por outra pessoa enquanto você editava. Seu valor: ${mine[i] || '(vazio)'}.`, mine: mine[i] }
              : { s: 'error', msg: `Não salvou: ${msg}. Enter para tentar de novo.`, mine: mine[i] };
          });
          return o;
        });
      }
    }));
  }, [readOnly, rows, columns, cellAt, sk, rowKey]);

  const applyUndo = (from: typeof undo, to: 'undo' | 'redo') => {
    const entry = from.current.pop();
    if (!entry) return;
    const changes = entry.flatMap(({ rowKey: rk, colKey, text }) => {
      const r = rows.findIndex((row) => rowKey(row) === rk);
      const c = columns.findIndex((col) => col.key === colKey);
      return r >= 0 && c >= 0 ? [{ r, c, text }] : [];
    });
    void commit(changes, to);
  };

  const forRange = (fn: (r: number, c: number) => string | null) => {
    const out: Change[] = [];
    for (let r = sel.r0; r <= sel.r1; r += 1) for (let c = sel.c0; c <= sel.c1; c += 1) {
      const t = fn(r, c);
      if (t !== null) out.push({ r, c, text: t });
    }
    return out;
  };

  const move = (dr: number, dc: number, extend = false) => {
    const p = { r: Math.max(0, Math.min(lastRow, active.r + dr)), c: Math.max(0, Math.min(lastCol, active.c + dc)) };
    setActive(p);
    if (!extend) setAnchor(p);
  };

  const startEdit = (seed?: string) => {
    if (readOnly) return;
    const cell = cellAt(active.r, active.c);
    if (cell.kind === 'ro' || cell.disabled || !cell.commit) return;
    const st = states[sk(active.r, active.c)];
    if (cell.kind === 'check' || cell.kind === 'status') { toggle(); return; }
    setEditing({ draft: seed ?? (st?.s === 'error' || st?.s === 'rejected' ? st.mine ?? cell.text : cell.text), start: cell.text });
  };

  const finishEdit = (dr: number, dc: number) => {
    if (!editing) return;
    const { r, c } = active;
    const now = cellAt(r, c).text;
    if (now !== editing.start && editing.draft !== now) {
      // a celula mudou no servidor durante a edicao: nunca sobrescrever (P15)
      setStates((s) => ({ ...s, [sk(r, c)]: { s: 'conflict', msg: `Alterado por outra pessoa enquanto você editava. Seu valor: ${editing.draft || '(vazio)'}.`, mine: editing.draft } }));
    } else void commit([{ r, c, text: editing.draft }]);
    setEditing(null);
    move(dr, dc);
    gridRef.current?.focus();
  };

  const toggle = () => {
    const first = cellAt(active.r, active.c);
    const on = first.kind === 'status' ? first.tone === 'delivered' : first.text === 'TRUE';
    void commit(forRange((r, c) => {
      const k = cellAt(r, c).kind;
      return k === 'check' || k === 'status' ? (on ? 'FALSE' : 'TRUE') : null;
    }));
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (editing) return; // o input cuida
    const ctrl = e.ctrlKey || e.metaKey;
    const k = e.key;
    const nav: Record<string, [number, number]> = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
    if (nav[k]) { e.preventDefault(); move(nav[k][0], nav[k][1], e.shiftKey); return; }
    if (k === 'Tab') { e.preventDefault(); move(0, e.shiftKey ? -1 : 1); return; }
    if (k === 'Home') { e.preventDefault(); move(ctrl ? -active.r : 0, -active.c, e.shiftKey); return; }
    if (k === 'End') { e.preventDefault(); move(ctrl ? lastRow - active.r : 0, lastCol - active.c, e.shiftKey); return; }
    if (k === 'PageDown' || k === 'PageUp') { e.preventDefault(); move(k === 'PageDown' ? 15 : -15, 0, e.shiftKey); return; }
    if (ctrl && k.toLowerCase() === 'c') {
      e.preventDefault();
      const tsv: string[] = [];
      for (let r = sel.r0; r <= sel.r1; r += 1) {
        const line: string[] = [];
        for (let c = sel.c0; c <= sel.c1; c += 1) line.push(cellAt(r, c).text);
        tsv.push(line.join('\t'));
      }
      void navigator.clipboard?.writeText(tsv.join('\r\n')).then(() => setToast('Copiado.'), () => setToast('Não foi possível copiar.'));
      return;
    }
    if (ctrl && k.toLowerCase() === 'z') { e.preventDefault(); applyUndo(undo, 'redo'); return; }
    if (ctrl && k.toLowerCase() === 'y') { e.preventDefault(); applyUndo(redo, 'undo'); return; }
    if (ctrl) return; // Ctrl+V cai no onPaste
    if (readOnly) return;
    if (k === 'Enter') {
      e.preventDefault();
      const st = states[sk(active.r, active.c)];
      if (st?.mine !== undefined && (st.s === 'error' || st.s === 'conflict')) { void commit([{ r: active.r, c: active.c, text: st.mine }]); return; }
      startEdit();
      return;
    }
    if (k === 'F2') { e.preventDefault(); startEdit(); return; }
    if (k === ' ') { e.preventDefault(); const kind = cellAt(active.r, active.c).kind; if (kind === 'check' || kind === 'status') toggle(); else startEdit(' '); return; }
    if (k === 'Delete' || k === 'Backspace') {
      e.preventDefault();
      void commit(forRange((r, c) => { const kind = cellAt(r, c).kind; return kind === 'check' || kind === 'status' ? 'FALSE' : ''; }));
      return;
    }
    if (k === '-' && cellAt(active.r, active.c).kind === 'status') {
      e.preventDefault();
      void commit(forRange((r, c) => (cellAt(r, c).kind === 'status' ? '-' : null))); // P4: N/A em bloco
      return;
    }
    if (k.length === 1 && !e.altKey) { e.preventDefault(); startEdit(k); }
  };

  const onPaste = (e: React.ClipboardEvent) => {
    if (editing || readOnly) return;
    e.preventDefault();
    const grid = parseTsv(e.clipboardData.getData('text/plain'));
    const single = grid.length === 1 && grid[0].length === 1;
    const changes: Change[] = [];
    if (single) changes.push(...forRange(() => grid[0][0])); // 1 valor colado em faixa = preenche a faixa
    else grid.forEach((line, dr) => line.forEach((text, dc) => changes.push({ r: active.r + dr, c: active.c + dc, text })));
    void commit(changes);
  };

  const groups = useMemo(() => {
    const out: Array<{ label: string; span: number; sticky?: boolean; left: number }> = [];
    let left = 0;
    columns.forEach((col) => {
      const g = col.group ?? '';
      const last = out[out.length - 1];
      if (last && last.label === g && g) last.span += 1;
      else out.push({ label: g, span: 1, sticky: col.sticky, left });
      left += col.width;
    });
    return out;
  }, [columns]);
  const lefts = useMemo(() => { let l = 0; return columns.map((c) => { const v = l; l += c.width; return v; }); }, [columns]);
  const hasGroups = columns.some((c) => c.group);

  const activeCell = rows.length ? cellAt(active.r, active.c) : null;
  const activeState = rows.length ? states[sk(active.r, active.c)] : undefined;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-10 flex-wrap items-center gap-3 border-b border-[#E5E7EB] px-4 py-2 text-xs text-[#64748B]" aria-live="polite">
        <span className="font-semibold text-[#2D2D2D]">{rows.length ? `${columns[active.c].group ? columns[active.c].group + ' · ' : ''}${columns[active.c].label}` : ''}</span>
        {activeState && <span className={activeState.s === 'conflict' ? 'text-[#B45309]' : activeState.s === 'saving' ? '' : 'text-[#B91C1C]'}>{activeState.msg}</span>}
        {activeState?.s === 'conflict' && activeState.mine !== undefined && (
          <button type="button" className="min-h-8 rounded-lg border border-[#D97706] px-3 font-semibold text-[#B45309] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F05D28]" onClick={() => void commit([{ ...active, text: activeState.mine! }])}>Reaplicar o meu</button>
        )}
        {!activeState && activeCell?.disabled && <span>{activeCell.disabled}</span>}
        {!activeState && activeCell?.hint && <span>{activeCell.hint}</span>}
        <span className="ml-auto">{pending ? `${pending} alteração(ões) pendente(s)` : ''}</span>
        {toast && <span role="status" className="rounded-lg bg-[#FFFBEB] px-2 py-1 text-[#B45309]">{toast}</span>}
      </div>
      <div
        ref={gridRef}
        role="grid"
        aria-label={label}
        aria-rowcount={rows.length}
        aria-colcount={columns.length}
        aria-readonly={readOnly || undefined}
        aria-multiselectable
        aria-activedescendant={rows.length ? `${idBase}-${active.r}-${active.c}` : undefined}
        tabIndex={0}
        onKeyDown={onKeyDown}
        onPaste={onPaste}
        className="min-h-0 flex-1 overflow-auto outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#F05D28]"
      >
        <table className="border-separate border-spacing-0 text-[13px] font-medium tabular-nums text-[#2D2D2D]" style={{ width: lefts[lastCol] + columns[lastCol].width }}>
          <thead className="sticky top-0 z-20">
            {hasGroups && (
              <tr role="row">
                {groups.map((g, i) => (
                  <th key={i} colSpan={g.span} scope="colgroup" title={g.label}
                    className={`truncate border-b border-r border-[#E5E7EB] bg-[#F8FAFC] px-2 py-1 text-left text-[11px] font-bold uppercase tracking-[0.04em] text-[#475569] ${g.sticky ? 'sticky z-30' : ''}`}
                    style={g.sticky ? { left: g.left } : undefined}>{g.label}</th>
                ))}
              </tr>
            )}
            <tr role="row">
              {columns.map((col, c) => (
                <th key={col.key} role="columnheader" scope="col" title={col.label}
                  className={`truncate border-b border-r border-[#E5E7EB] bg-[#F8FAFC] px-2 py-1.5 text-left text-[11px] font-bold uppercase tracking-[0.04em] text-[#475569] ${col.sticky ? 'sticky z-30' : ''}`}
                  style={{ width: col.width, minWidth: col.width, maxWidth: col.width, ...(col.sticky ? { left: lefts[c] } : {}) }}>{col.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, r) => (
              <tr key={rowKey(row)} role="row" aria-rowindex={r + 1}>
                {columns.map((col, c) => {
                  const cell = col.cell(row, r);
                  const st = states[`${rowKey(row)}|${col.key}`];
                  const isActive = active.r === r && active.c === c;
                  const inSel = r >= sel.r0 && r <= sel.r1 && c >= sel.c0 && c <= sel.c1 && (sel.r0 !== sel.r1 || sel.c0 !== sel.c1);
                  const editable = !readOnly && !!cell.commit && !cell.disabled && cell.kind !== 'ro';
                  const shown = st && (st.s === 'saving' || st.s === 'error') && st.mine !== undefined ? st.mine : (cell.display ?? cell.text);
                  const bg = cell.disabled
                    ? 'bg-[repeating-linear-gradient(45deg,#F1F5F9_0_6px,#E2E8F0_6px_12px)] text-[#94A3B8]'
                    : cell.tone ? TONE[cell.tone] : cell.kind === 'ro' ? 'bg-[#F8FAFC]' : 'bg-white';
                  const title = [st?.msg, cell.disabled, cell.hint, cell.note].filter(Boolean).join(' · ') || undefined;
                  return (
                    <td
                      key={col.key}
                      id={`${idBase}-${r}-${c}`}
                      role="gridcell"
                      aria-selected={isActive || inSel}
                      aria-readonly={!editable || undefined}
                      aria-disabled={cell.disabled ? true : undefined}
                      aria-invalid={st?.s === 'rejected' || st?.s === 'error' || undefined}
                      title={title}
                      onMouseDown={(e) => {
                        if (editing && !isActive) finishEdit(0, 0);
                        const p = { r, c };
                        setActive(p);
                        if (!e.shiftKey) setAnchor(p);
                        gridRef.current?.focus({ preventScroll: true });
                      }}
                      onMouseEnter={(e) => { if (e.buttons === 1 && !editing) setActive({ r, c }); }}
                      onClick={() => { if (isActive && editable && (cell.kind === 'check' || cell.kind === 'status')) toggle(); }}
                      onDoubleClick={() => { if (editable && cell.kind !== 'check' && cell.kind !== 'status') startEdit(); }}
                      className={`relative h-8 truncate border-r border-[#E5E7EB] px-2 [@media(pointer:coarse)]:h-11 ${cell.hideTop || cell.naCont ? '' : 'border-t'} ${r === lastRow ? 'border-b' : ''} ${bg} ${col.sticky ? 'sticky z-10' : ''} ${cell.italic ? 'italic text-[#64748B]' : ''} ${inSel ? '!bg-[rgba(240,93,40,.10)]' : ''} ${st?.s === 'rejected' ? 'outline outline-1 -outline-offset-1 outline-[#DC2626]' : ''} ${isActive ? 'outline outline-2 -outline-offset-2 outline-[#F05D28]' : ''} ${editable ? 'cursor-cell' : 'cursor-default'}`}
                      style={{ width: col.width, minWidth: col.width, maxWidth: col.width, ...(col.sticky ? { left: lefts[c] } : {}) }}
                    >
                      {isActive && editing ? (
                        cell.kind === 'select' ? (
                          <select
                            autoFocus aria-label={col.label} value={editing.draft}
                            className="absolute inset-0 h-full w-full bg-white px-1 text-[13px] outline-none"
                            onChange={(e) => setEditing({ ...editing, draft: e.target.value })}
                            onBlur={() => finishEdit(0, 0)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') { e.preventDefault(); finishEdit(1, 0); }
                              else if (e.key === 'Tab') { e.preventDefault(); finishEdit(0, e.shiftKey ? -1 : 1); }
                              else if (e.key === 'Escape') { e.preventDefault(); setEditing(null); gridRef.current?.focus(); }
                            }}
                          >
                            <option value="">—</option>
                            {cell.options?.map((o) => <option key={o} value={o}>{o}</option>)}
                          </select>
                        ) : (
                          <input
                            autoFocus aria-label={col.label} value={editing.draft}
                            inputMode={cell.kind === 'date' || cell.kind === 'int' ? 'numeric' : undefined}
                            placeholder={cell.kind === 'date' ? 'dd/mm/aaaa' : undefined}
                            className="absolute inset-0 h-full w-full bg-white px-2 text-[13px] outline-none"
                            onChange={(e) => setEditing({ ...editing, draft: e.target.value })}
                            onBlur={() => finishEdit(0, 0)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') { e.preventDefault(); finishEdit(1, 0); }
                              else if (e.key === 'Tab') { e.preventDefault(); finishEdit(0, e.shiftKey ? -1 : 1); }
                              else if (e.key === 'Escape') { e.preventDefault(); setEditing(null); gridRef.current?.focus(); }
                            }}
                          />
                        )
                      ) : cell.kind === 'check' || (cell.kind === 'status' && cell.tone !== 'na' && cell.tone !== 'unknown') ? (
                        <span className="flex justify-center" aria-label={cell.tone === 'delivered' || cell.text === 'TRUE' ? 'Marcado' : 'Desmarcado'}>
                          <span className={`flex h-4 w-4 items-center justify-center rounded border ${cell.tone === 'delivered' || cell.text === 'TRUE' ? 'border-[#15803D] bg-[#15803D] text-white' : 'border-[#94A3B8] bg-white'}`}>
                            {(cell.tone === 'delivered' || cell.text === 'TRUE') && <Check size={12} strokeWidth={3} aria-hidden />}
                          </span>
                        </span>
                      ) : cell.kind === 'status' ? (
                        <span className="flex justify-center font-bold">{cell.tone === 'na' ? (cell.naCont ? '' : '—') : '?'}<span className="sr-only">{cell.tone === 'na' ? 'Não aplicável' : 'Não determinado'}</span></span>
                      ) : (
                        <span>{shown}</span>
                      )}
                      {cell.dot && <span aria-hidden className="absolute right-1 top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full bg-[#D97706]" />}
                      {cell.note && <span aria-hidden className="absolute right-0 top-0 h-0 w-0 border-l-[6px] border-t-[6px] border-l-transparent border-t-[#F05D28]" />}
                      {st && st.s !== 'rejected' && (
                        <span aria-hidden className={`absolute right-0 top-0 h-0 w-0 border-l-[6px] border-t-[6px] border-l-transparent ${st.s === 'saving' ? 'animate-pulse border-t-[#94A3B8]' : st.s === 'conflict' ? 'border-t-[#D97706]' : 'border-t-[#DC2626]'}`} />
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
