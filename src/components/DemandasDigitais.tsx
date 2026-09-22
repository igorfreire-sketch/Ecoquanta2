import React from 'react';
import { Bug, CheckCircle2, ClipboardList, Clock3, FileSpreadsheet, GripVertical, Lightbulb, MoreHorizontal, Trash2 } from 'lucide-react';
import type { FeedbackReport, FeedbackReportStatus } from '../types/feedbackReport';
// Type-only: nao gera import em runtime (evita puxar Anotacoes.tsx, que carrega Atividades.tsx e
// seu import.meta.glob, pra dentro do modulo que o self-check .check.ts roda fora do Vite).
import type { AnnotationBanco } from './CoordenacaoEngenharia/Anotacoes';

export type DemandFeedbackReport = FeedbackReport;

// Colunas do banco de Demanda Digital, achadas pelo texto do cabecalho (rows[0]) em vez de indice
// fixo: moveCol/removeCol remapeiam rows (e o cabecalho vai junto), entao a coluna certa viaja com
// o header mesmo depois de arrastar. Cai pra posicao padrao (0/1/2) so se o header nao tiver aquele
// nome; -1 se nem a posicao padrao existir (banco mais estreito que o esperado).
function normalizarHeader(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}
export function demandaCols(rows: string[][]): { titulo: number; descricao: number; status: number } {
  const header = rows[0] ?? [];
  const acha = (nome: string, posicaoPadrao: number) => {
    const idx = header.findIndex((h) => normalizarHeader(h || '') === nome);
    if (idx !== -1) return idx;
    return posicaoPadrao < header.length ? posicaoPadrao : -1;
  };
  return { titulo: acha('titulo', 0), descricao: acha('descricao', 1), status: acha('status', 2) };
}

// Status do banco "+ Demanda Digital" - mesmos rotulos das colunas do kanban abaixo.
// Fonte unica da cor: Anotacoes.tsx reusa este mapa pra pintar a linha (nunca duplicar a paleta).
export const DEMANDA_STATUS_OPCOES = ['Recebidos', 'Em análise', 'Em andamento', 'Concluídos'] as const;
export type DemandaStatus = typeof DEMANDA_STATUS_OPCOES[number];
export const DEMANDA_STATUS_COR: Record<DemandaStatus, string> = {
  'Recebidos': '#F3F4F6',
  'Em análise': '#FEF9C3',
  'Em andamento': '#DBEAFE',
  'Concluídos': '#DCFCE7',
};

// Card derivado de uma linha do banco "+ Demanda Digital" de uma nota - a nota e a unica dona do
// dado (mesmo espirito do "+ Project"/CronogramaDoc.origemNotaId), este card e so leitura aqui.
export interface NoteDemand {
  id: string;
  titulo: string;
  descricao: string;
  status: DemandaStatus;
  noteId: string;
  noteTitulo: string;
}

// Forma minima de nota que a funcao pura precisa - evita importar AnnotationSheet inteiro so
// pra iterar bancos. AnnotationSheet[] real bate estruturalmente com isso sem cast.
interface NotaComBancos {
  id: string;
  titulo: string;
  bancos?: AnnotationBanco[];
}

// Pura: linhas do banco -> cards do kanban. Pula linha de cabecalho (r=0), pula linha vazia
// (sem titulo E sem descricao), e cai pra "Recebidos" se o status gravado for desconhecido/vazio
// (banco antigo editado fora do <select>, ou "".
export function mapNotesToDemandas(notes: NotaComBancos[]): NoteDemand[] {
  const cards: NoteDemand[] = [];
  for (const note of notes) {
    for (const banco of note.bancos ?? []) {
      if (banco.tipo !== 'demanda') continue;
      const cols = demandaCols(banco.rows);
      banco.rows.forEach((row, rowIndex) => {
        if (rowIndex === 0) return;
        const titulo = (row[cols.titulo] || '').trim();
        const descricao = (row[cols.descricao] || '').trim();
        if (!titulo && !descricao) return;
        const statusBruto = row[cols.status];
        const status = (DEMANDA_STATUS_OPCOES as readonly string[]).includes(statusBruto)
          ? (statusBruto as DemandaStatus)
          : DEMANDA_STATUS_OPCOES[0];
        // id: linha:banco:nota - indice de linha nao e estavel se a linha for reordenada.
        // ponytail: aceitavel enquanto nao ha reorder de linha dentro de um banco de demanda;
        // upgrade = um uuid por linha (gerado no createDemandaBanco/insertRow) se isso mudar.
        cards.push({ id: `${note.id}:${banco.id}:${rowIndex}`, titulo, descricao, status, noteId: note.id, noteTitulo: note.titulo || 'Sem título' });
      });
    }
  }
  return cards;
}

interface DemandasDigitaisProps {
  reports: DemandFeedbackReport[];
  noteDemands?: NoteDemand[];
  canAccess: boolean;
  loading?: boolean;
  error?: string;
  onStatusChange?: (id: string, status: FeedbackReportStatus) => Promise<void> | void;
  onArchive?: (id: string) => Promise<void> | void;
}

const columns: Array<{ key: 'new' | 'triage' | 'doing' | 'done'; label: DemandaStatus; hint: string }> = [
  { key: 'new', label: 'Recebidos', hint: 'Ainda não analisados' },
  { key: 'triage', label: 'Em análise', hint: 'Priorização e contexto' },
  { key: 'doing', label: 'Em andamento', hint: 'Já entrou no trabalho' },
  { key: 'done', label: 'Concluídos', hint: 'Resolvidos ou entregues' },
];

export default function DemandasDigitais({ reports, noteDemands = [], canAccess, loading, error, onStatusChange, onArchive }: DemandasDigitaisProps) {
  if (!canAccess) return <div className="mx-auto mt-8 max-w-xl rounded-3xl border border-[#FDE2D5] bg-white p-8 text-center shadow-sm"><h1 className="text-[20px] font-black text-[#2D2D2D]">Demandas Digitais</h1><p className="mt-3 text-[13px] leading-relaxed text-[#757575]">Esta área fica disponível somente para usuários aprovados. Aguarde a liberação do administrador.</p></div>;
  return <section className="mx-auto w-full max-w-[1500px] font-['Montserrat']">
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4"><div><p className="text-[10px] font-black uppercase tracking-[1.2px] text-[#F05D28]">Retorno do time</p><h1 className="mt-1 text-[26px] font-black text-[#2D2D2D]">Demandas Digitais</h1><p className="mt-2 text-[13px] text-[#757575]">Bugs e ideias organizados como notas para acompanhar cada pedido.</p></div><div className="rounded-2xl border border-[#E5E7EB] bg-white px-4 py-3 text-right"><span className="block text-[20px] font-black text-[#2D2D2D]">{reports.length + noteDemands.length}</span><span className="text-[11px] font-bold uppercase tracking-wider text-[#94A3B8]">pedidos</span></div></header>
    {error && <div role="alert" className="mb-4 rounded-xl border border-[#FECACA] bg-[#FEF2F2] px-4 py-3 text-[12px] font-bold text-[#B91C1C]">{error}</div>}
{loading ? <div className="rounded-3xl border border-[#E5E7EB] bg-white p-10 text-center text-[13px] font-medium text-[#757575]">Carregando demandas...</div> : error ? <div role="alert" className="rounded-3xl border border-red-200 bg-red-50 p-6 text-center text-[13px] font-medium text-red-700">{error}</div> : <div className="grid min-h-[360px] grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">{columns.map((column) => <KanbanColumn key={column.key} column={column} reports={reports.filter((report) => report.status !== 'archived' && displayStatus(report.status) === column.key)} demands={noteDemands.filter((demand) => demand.status === column.label)} onStatusChange={onStatusChange} onArchive={onArchive} />)}</div>}
  </section>;
}

function displayStatus(status: DemandFeedbackReport['status']): typeof columns[number]['key'] {
  if (status === 'done' || status === 'archived') return 'done';
  if (status === 'doing') return 'doing';
  if (status === 'triage' || status === 'planned') return 'triage';
  return 'new';
}

function KanbanColumn({ column, reports, demands, onStatusChange, onArchive }: { key?: React.Key; column: typeof columns[number]; reports: DemandFeedbackReport[]; demands: NoteDemand[]; onStatusChange?: DemandasDigitaisProps['onStatusChange']; onArchive?: DemandasDigitaisProps['onArchive'] }) {
  return <div className="rounded-2xl border border-[#E5E7EB] bg-white/70 p-3"><div className="mb-3 flex items-start justify-between gap-2 px-1"><div><h2 className="text-[13px] font-black text-[#2D2D2D]">{column.label}</h2><p className="mt-1 text-[11px] text-[#94A3B8]">{column.hint}</p></div><span className="rounded-full bg-[#F9FAFB] px-2 py-1 text-[11px] font-black text-[#757575]">{reports.length + demands.length}</span></div><div className="space-y-3">{reports.map((report) => <DemandCard key={report.id} report={report} onStatusChange={onStatusChange} onArchive={onArchive} />)}{demands.map((demand) => <NoteDemandCard key={demand.id} demand={demand} />)}</div>{reports.length === 0 && demands.length === 0 && <div className="rounded-xl border border-dashed border-[#E5E7EB] px-3 py-8 text-center text-[11px] font-medium text-[#A0A7B2]">Nenhum pedido aqui</div>}</div>;
}

function DemandMenu({ title, onArchive }: { title: string; onArchive?: () => void }) {
  const [open, setOpen] = React.useState(false);
  if (!onArchive) return null;
  return <div className="relative"><button type="button" aria-label={`Ações: ${title}`} title="Ações do card" onClick={(event) => { event.stopPropagation(); setOpen((value) => !value); }} className="flex h-8 w-8 items-center justify-center rounded-lg text-[#64748B] hover:bg-[#F1F5F9] focus:outline-none focus:ring-2 focus:ring-[#F05D28]"><MoreHorizontal size={17} /></button>{open && <button type="button" onClick={(event) => { event.stopPropagation(); setOpen(false); if (window.confirm(`Arquivar “${title}”? O registro não será apagado.`)) onArchive(); }} className="absolute right-0 top-9 z-10 flex items-center gap-2 rounded-lg border border-[#FECACA] bg-white px-3 py-2 text-[12px] font-bold text-[#DC2626] shadow-lg hover:bg-[#FEF2F2]"><Trash2 size={14} />Excluir</button>}</div>;
}

function DemandCard({ report, onStatusChange, onArchive }: { key?: React.Key; report: DemandFeedbackReport; onStatusChange?: DemandasDigitaisProps['onStatusChange']; onArchive?: DemandasDigitaisProps['onArchive'] }) {
  const [expanded, setExpanded] = React.useState(false);
  const kindBug = report.kind === 'bug';
  const status = displayStatus(report.status);
  const currentIndex = columns.findIndex((column) => column.key === status);
  const move = (direction: -1 | 1) => {
    const next = columns[currentIndex + direction];
    if (next) void onStatusChange?.(report.id, next.key);
  };
  if (report.kind === 'request') return <article tabIndex={0} onClick={() => setExpanded((value) => !value)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setExpanded((value) => !value); } }} className="cursor-pointer rounded-xl border border-[#E7D9C9] bg-white p-3 shadow-[0_8px_20px_-18px_rgba(15,23,42,0.5)] focus:outline-none focus:ring-2 focus:ring-[#F05D28]"><div className="flex items-start justify-between gap-2"><div className="flex items-center gap-2"><ClipboardList size={15} className="text-[#B7791F]" /><span className="text-[10px] font-black uppercase tracking-wider text-[#B7791F]">Pedido</span></div><DemandMenu title={report.title || 'Pedido de alteração'} onArchive={onArchive ? () => onArchive(report.id) : undefined} /></div><h3 className="mt-2 text-[13px] font-black leading-snug text-[#2D2D2D]">{report.title || 'Pedido de alteração'}</h3><p className={`mt-2 text-[12px] leading-relaxed text-[#64748B] ${expanded ? 'whitespace-pre-wrap' : 'line-clamp-4'}`}>{report.body || 'Sem descrição.'}</p><div className="mt-3 flex items-center justify-between gap-2 border-t border-[#F1F5F9] pt-2"><span className="flex min-w-0 items-center gap-1 truncate text-[10px] text-[#94A3B8]"><Clock3 size={12} />{report.authorEmail}</span>{onStatusChange && <div className="flex items-center gap-1"><button type="button" title="Mover para coluna anterior" disabled={currentIndex <= 0} onClick={(event) => { event.stopPropagation(); move(-1); }} className="rounded p-1 text-[#94A3B8] hover:bg-[#F9FAFB] disabled:invisible"><GripVertical size={14} /></button><button type="button" title="Mover para próxima coluna" disabled={currentIndex >= columns.length - 1} onClick={(event) => { event.stopPropagation(); move(1); }} className="rounded p-1 text-[#F05D28] hover:bg-[#FFF4EE] disabled:invisible"><CheckCircle2 size={14} /></button></div>}</div></article>;
  return <article tabIndex={0} onClick={() => setExpanded((value) => !value)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setExpanded((value) => !value); } }} className="cursor-pointer rounded-xl border border-[#E5E7EB] bg-white p-3 shadow-[0_8px_20px_-18px_rgba(15,23,42,0.5)] focus:outline-none focus:ring-2 focus:ring-[#F05D28]"><div className="flex items-start justify-between gap-2"><div className="flex items-center gap-2">{kindBug ? <Bug size={15} className="text-[#EF4444]" /> : <Lightbulb size={15} className="text-[#F59E0B]" />}<span className="text-[10px] font-black uppercase tracking-wider text-[#94A3B8]">{kindBug ? 'Bug' : 'Ideia'}</span></div><DemandMenu title={report.title || (kindBug ? 'Relato de bug' : 'Nova ideia')} onArchive={onArchive ? () => onArchive(report.id) : undefined} /></div><h3 className="mt-2 text-[13px] font-black leading-snug text-[#2D2D2D]">{report.title || (kindBug ? 'Relato de bug' : 'Nova ideia')}</h3><p className={`mt-2 text-[12px] leading-relaxed text-[#64748B] ${expanded ? 'whitespace-pre-wrap' : 'line-clamp-4'}`}>{report.body || 'Sem descrição.'}</p>{report.solutionNote && <p className="mt-2 rounded-lg bg-[#FFF4EE] px-2 py-1.5 text-[11px] font-bold text-[#9A3412]">Feito: {report.solutionNote}</p>}{report.route && <p className="mt-2 rounded-lg bg-[#F9FAFB] px-2 py-1.5 text-[10px] font-medium text-[#64748B]">Local: {report.route}{report.xRatio !== undefined && report.yRatio !== undefined ? ` · ${Math.round(report.xRatio * 100)}%, ${Math.round(report.yRatio * 100)}%` : ''}</p>}<div className="mt-3 flex items-center justify-between gap-2 border-t border-[#F1F5F9] pt-2"><span className="flex min-w-0 items-center gap-1 truncate text-[10px] text-[#94A3B8]"><Clock3 size={12} />{report.authorEmail}{report.createdAt ? ` · ${String(report.createdAt)}` : ''}</span>{onStatusChange && <div className="flex items-center gap-1"><button type="button" title="Mover para coluna anterior" disabled={currentIndex <= 0} onClick={(event) => { event.stopPropagation(); move(-1); }} className="rounded p-1 text-[#94A3B8] hover:bg-[#F9FAFB] disabled:invisible"><GripVertical size={14} /></button><button type="button" title="Mover para próxima coluna" disabled={currentIndex >= columns.length - 1} onClick={(event) => { event.stopPropagation(); move(1); }} className="rounded p-1 text-[#F05D28] hover:bg-[#FFF4EE] disabled:invisible"><CheckCircle2 size={14} /></button></div>}</div></article>;
}

// Somente leitura: quem edita e a nota de origem (bloco "+ Demanda Digital"), igual ao cronograma
// de um "+ Project" ficar read-only em SolucoesDigitais (CronogramaDoc.origemNotaId).
function NoteDemandCard({ demand }: { key?: React.Key; demand: NoteDemand }) {
  return <article style={{ backgroundColor: DEMANDA_STATUS_COR[demand.status] }} className="rounded-xl border border-[#E5E7EB] p-3 shadow-[0_8px_20px_-18px_rgba(15,23,42,0.5)]">
    <div className="flex items-center gap-2"><FileSpreadsheet size={15} className="text-[#F05D28]" /><span className="text-[10px] font-black uppercase tracking-wider text-[#94A3B8]">Demanda Digital</span></div>
    <h3 className="mt-2 text-[13px] font-black leading-snug text-[#2D2D2D]">{demand.titulo || 'Sem título'}</h3>
    <p className="mt-2 line-clamp-4 text-[12px] leading-relaxed text-[#64748B]">{demand.descricao || 'Sem descrição.'}</p>
    <p className="mt-3 truncate border-t border-black/10 pt-2 text-[10px] font-medium text-[#64748B]">Nota: {demand.noteTitulo}</p>
  </article>;
}
