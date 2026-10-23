// Compatibilização > Preenchimento (ESPEC §3, F0 §5). Tempo real por colecao, gravacao por celula.
import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Loader2, Lock } from 'lucide-react';
import { CEPT_COLLECTIONS, subscribeCeptCollection } from '../../../lib/cept/data';
import { CEPT_OS061 } from '../../../lib/cept/rules';
import SheetGrid from './SheetGrid';
import {
  buildEntregavelRows, CRITERIOS_MEDICAO, entregavelColumns, medicaoColumns, planejamentoColumns,
  type ComponenteDoc, type EdificacaoDoc, type EntregavelRow, type MedicaoDoc, type PlanejamentoDoc,
} from './grids';

type Sheet = 'entregaveis' | 'planejamento' | 'medicoes';
const SHEETS: Array<{ key: Sheet; label: string }> = [
  { key: 'entregaveis', label: 'Entregáveis' },
  { key: 'planejamento', label: 'Responsabilidades e LOD' },
  { key: 'medicoes', label: 'Medições' },
];

interface Live<T> { rows: T[]; loading: boolean; error: string; denied: boolean; at: Date | null; retry: () => void }

function useCollection<T>(name: keyof typeof CEPT_COLLECTIONS, osCode: string): Live<T & { id: string }> {
  const [state, setState] = useState<Omit<Live<T & { id: string }>, 'retry'>>({ rows: [], loading: true, error: '', denied: false, at: null });
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    setState((s) => ({ ...s, loading: !s.at, error: '' }));
    return subscribeCeptCollection<T>(name, osCode,
      (rows) => setState({ rows, loading: false, error: '', denied: false, at: new Date() }),
      (e) => setState((s) => ({ ...s, loading: false, denied: (e as { code?: string }).code === 'permission-denied', error: e.message || 'Falha ao ler o Firestore.' })));
  }, [name, osCode, nonce]);
  return { ...state, retry: () => setNonce((n) => n + 1) };
}

function useOnline() {
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true); const off = () => setOnline(false);
    window.addEventListener('online', on); window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);
  return online;
}

const hhmm = (d: Date | null) => (d ? d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '--:--');
const millis = (v: unknown) => (v && typeof (v as { toMillis?: () => number }).toMillis === 'function' ? (v as { toMillis: () => number }).toMillis() : 0);

export default function CeptPreenchimento({ currentUser }: { currentUser?: { email?: string; isAdmin?: boolean } | null }) {
  const osCode = CEPT_OS061.osCode;
  const [sheet, setSheet] = useState<Sheet>('entregaveis');
  const [showCriterios, setShowCriterios] = useState(false);
  const online = useOnline();
  // rules: isCeptEditor = e-mail @quantaconsultoria.com ou admin (F0 G4). A UI so espelha; quem decide sao as rules.
  const canEdit = !!currentUser && (!!currentUser.isAdmin || /@quantaconsultoria\.com$/i.test(String(currentUser.email || '')));

  const comp = useCollection<ComponenteDoc>('componentes', osCode);
  const plan = useCollection<PlanejamentoDoc>('planejamento', osCode);
  const edif = useCollection<EdificacaoDoc>('edificacoes', osCode);
  const med = useCollection<MedicaoDoc>('medicoes', osCode);

  const entRows = useMemo(() => buildEntregavelRows(comp.rows), [comp.rows]);
  const entCols = useMemo(() => entregavelColumns(entRows, osCode), [entRows, osCode]);
  const planRows = useMemo(() => [...plan.rows].sort((a, b) => a.sourceRow - b.sourceRow), [plan.rows]);
  const edifMap = useMemo(() => Object.fromEntries(edif.rows.map((e) => [e.projectCode, e])), [edif.rows]);
  const planCols = useMemo(() => planejamentoColumns(planRows, edifMap, osCode), [planRows, edifMap, osCode]);
  const medRows = useMemo(() => [...med.rows].sort((a, b) => a.projectCode.localeCompare(b.projectCode) || a.sourceRow - b.sourceRow), [med.rows]);
  const medCols = useMemo(() => medicaoColumns(medRows, osCode), [medRows, osCode]);

  const live = sheet === 'entregaveis' ? [comp] : sheet === 'planejamento' ? [plan, edif] : [med];
  const loading = live.some((l) => l.loading);
  const error = live.find((l) => l.error);
  const denied = live.some((l) => l.denied);
  const at = live[0].at;
  const count = sheet === 'entregaveis' ? entRows.length : sheet === 'planejamento' ? planRows.length : medRows.length;

  const last = useMemo(() => {
    const all = (sheet === 'entregaveis' ? comp.rows : sheet === 'planejamento' ? [...plan.rows, ...edif.rows] : med.rows) as Array<{ updatedAt?: unknown; updatedBy?: string }>;
    const top = all.reduce<{ updatedAt?: unknown; updatedBy?: string } | null>((m, r) => (millis(r.updatedAt) > millis(m?.updatedAt) ? r : m), null);
    if (!top || !millis(top.updatedAt)) return '';
    const d = new Date(millis(top.updatedAt));
    return `Última alteração: ${String(top.updatedBy || '').split('@')[0]} · ${d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} ${hhmm(d)}`;
  }, [sheet, comp.rows, plan.rows, edif.rows, med.rows]);

  return (
    <div className="flex h-[calc(100vh-7rem)] min-h-[480px] flex-col gap-3">
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-bold text-[#2D2D2D]">Preenchimento</h1>
        <div role="group" aria-label="OS" className="flex rounded-xl bg-white p-1 shadow-sm">
          <button type="button" aria-pressed="true" className="min-h-8 rounded-lg bg-[#2D2D2D] px-3 text-sm font-semibold text-white">OS {osCode}</button>
          <button type="button" disabled title="OS054 depende do Sincronizador" className="min-h-8 rounded-lg px-3 text-sm font-semibold text-[#94A3B8]">OS 054</button>
        </div>
        <div role="tablist" aria-label="Planilha" className="flex flex-wrap gap-1">
          {SHEETS.map((s) => (
            <button key={s.key} type="button" role="tab" aria-selected={sheet === s.key} onClick={() => setSheet(s.key)}
              className={`min-h-9 rounded-xl px-4 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F05D28] ${sheet === s.key ? 'bg-[#F05D28] text-white' : 'bg-white text-[#2D2D2D] hover:bg-[#FFF3EC]'}`}>
              {s.label}
            </button>
          ))}
        </div>
        <span className={`ml-auto inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${online && !error ? 'bg-[#F0FDF4] text-[#15803D]' : 'bg-[#FFFBEB] text-[#B45309]'}`}>
          <span aria-hidden className={`h-2 w-2 rounded-full ${online && !error ? 'bg-[#16A34A]' : 'bg-[#D97706]'}`} />
          {online && !error ? 'Ao vivo' : `Sem conexão · dados de ${hhmm(at)}`}
        </span>
      </header>

      {error && !denied && (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertTriangle size={16} aria-hidden /> <span>{error.error}</span>
          <button type="button" onClick={() => live.forEach((l) => l.retry())} className="ml-auto min-h-8 rounded-lg border border-red-200 bg-white px-3 font-semibold focus-visible:outline-2 focus-visible:outline-[#F05D28]">Tentar de novo</button>
        </div>
      )}
      {!canEdit && !denied && (
        <div className="flex items-center gap-2 rounded-2xl bg-[#FFFBEB] px-4 py-2 text-sm text-[#B45309]"><Lock size={14} aria-hidden /> Somente leitura: edição restrita a contas @quantaconsultoria.com.</div>
      )}

      <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl bg-white shadow-[0_10px_30px_-22px_rgba(15,23,42,0.45)]" aria-busy={loading}>
        {denied ? (
          <div className="m-auto max-w-md p-6 text-center text-sm text-[#64748B]"><Lock className="mx-auto mb-2" aria-hidden /> Você não tem permissão para ler o CEPT. Peça acesso a um administrador.</div>
        ) : loading ? (
          <div className="m-auto flex items-center gap-2 p-6 text-sm text-[#64748B]"><Loader2 className="animate-spin" size={16} aria-hidden /> Atualizando dados...</div>
        ) : !count ? (
          <div className="m-auto max-w-md p-6 text-center text-sm text-[#64748B]">Nenhum registro da OS {osCode} nesta planilha ainda. Os dados chegam pela migração da planilha original.</div>
        ) : sheet === 'entregaveis' ? (
          <SheetGrid<EntregavelRow> label="Entregáveis" rows={entRows} columns={entCols} rowKey={(r) => String(r.sourceRow)} readOnly={!canEdit} />
        ) : sheet === 'planejamento' ? (
          <SheetGrid<PlanejamentoDoc> label="Responsabilidades e LOD" rows={planRows} columns={planCols} rowKey={(r) => r.id} readOnly={!canEdit} />
        ) : (
          <SheetGrid<MedicaoDoc> label="Medições" rows={medRows} columns={medCols} rowKey={(r) => r.id} readOnly={!canEdit} />
        )}
        <footer className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-[#E5E7EB] px-4 py-2 text-xs text-[#64748B]">
          {sheet === 'entregaveis' && <>
            <span className="text-[#15803D]">✓ Disponibilizado</span><span className="text-[#C2410C]">□ Pendente</span>
            <span>— Não aplicável (tecla -)</span><span className="text-[#A16207]">? Não determinado</span>
          </>}
          {sheet === 'medicoes' && <span>Aprovação para pagamento · Tec. = Coordenação técnica da área · Con. = Coordenação do Contrato</span>}
          <span>Espaço marca · Delete limpa · Ctrl+C/Ctrl+V com Excel · Ctrl+Z desfaz</span>
          <span className="ml-auto">{last}</span>
        </footer>
      </section>

      {sheet === 'medicoes' && (
        <div className="rounded-2xl bg-white px-4 py-2 shadow-sm">
          <button type="button" aria-expanded={showCriterios} onClick={() => setShowCriterios((v) => !v)} className="min-h-8 text-sm font-semibold text-[#2D2D2D] focus-visible:outline-2 focus-visible:outline-[#F05D28]">
            {showCriterios ? 'Ocultar' : 'Mostrar'} critérios de medição
          </button>
          {showCriterios && <div className="max-h-64 overflow-auto pb-2 text-sm text-[#475569]">{CRITERIOS_MEDICAO.map((t, i) => (t ? <p key={i} className={/^\d\.|^Crit/.test(t) ? 'mt-2 font-semibold text-[#2D2D2D]' : ''}>{t}</p> : null))}</div>}
        </div>
      )}
    </div>
  );
}
