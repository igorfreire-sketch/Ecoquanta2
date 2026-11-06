import React, { useEffect, useMemo, useState } from 'react';
import { Lock } from 'lucide-react';
import { sameContractCode } from '../../lib/contractCode';
import { getSheetStatus, GoogleIcon, moveSheetStatus, type AnnotationSheet } from '../CoordenacaoEngenharia/Anotacoes';
import { getDisciplineDisplayName, getDisciplineIconInfo } from '../Atividades';
import { isNoteOwner, previewNoteProposal, type NoteSaveIntent } from '../../lib/noteProposals';
import { isNc2Leader } from './ncStore';
export interface KanbanProps {
  lockedContractCode?: string;
  preloadedData?: unknown;
  onOpenOs?: (os: string) => void;
  // Notas de disciplina que entram no mesmo quadro (ja filtradas em App.tsx: setor so pra
  // lider/coordenador, mais as notas em que o usuario foi marcado).
  notas?: AnnotationSheet[];
  onAbrirNota?: (id: string) => void;
  currentUser: { nome: string; email: string; role?: string; isAdmin?: boolean; disciplina?: string; disciplinas?: string[] | string };
  // Mesma persistencia que Anotacoes.tsx usa (App.saveAnnotationSheet); ausente = quadro so leitura.
  onSalvarNota?: (sheet: AnnotationSheet, intent?: NoteSaveIntent) => Promise<void>;
}

const COLUNAS: Array<{ key: 'criado' | 'iniciado' | 'concluido'; label: string }> = [
  { key: 'criado', label: 'Criado' },
  { key: 'iniciado', label: 'Iniciado' },
  { key: 'concluido', label: 'Concluído' },
];

const COLUNA_CORES = {
  criado: { faixa: 'bg-white/70', texto: 'text-[#B91C1C]', borda: 'border-[#E5E7EB]', dot: 'bg-[#EF4444]', pill: 'bg-[#F8FAFC]' },
  iniciado: { faixa: 'bg-white/70', texto: 'text-[#1D4ED8]', borda: 'border-[#E5E7EB]', dot: 'bg-[#3B82F6]', pill: 'bg-[#F8FAFC]' },
  concluido: { faixa: 'bg-white/70', texto: 'text-[#047857]', borda: 'border-[#E5E7EB]', dot: 'bg-[#10B981]', pill: 'bg-[#F8FAFC]' },
} as const;

function MovidoPor({ nome }: { nome?: string }) {
  if (!nome) return null;
  return <p className="mt-2 text-[10px] font-medium text-[#94A3B8]">{nome} Moveu</p>;
}

export default function NotesKanban({ notas = [], onAbrirNota, currentUser, onSalvarNota }: KanbanProps) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);
  const ehLider = isNc2Leader(currentUser);
  // Lider/coordenador move qualquer nota do quadro; quem so foi marcado move as suas.
  const podeMoverNota = (sheet: AnnotationSheet) =>
    Boolean(onSalvarNota) && (ehLider || (sheet.marcadosUsuarios || []).includes(currentUser.email));

  // Autor decide sobre a proposta pendente direto no card do Kanban (mesma persistencia da nota:
  // App.saveAnnotationSheet resolve accept/reject a partir da nota atual no Firebase via intent,
  // igual ao reviewProposal de Anotacoes.tsx - nunca aplicar a decisao no cliente e reenviar a
  // nota inteira, senao o proximo save do dono restaura a proposta que acabou de ser aceita).
  const decidirProposta = (sheet: AnnotationSheet, decisao: 'accept' | 'reject') => {
    if (!onSalvarNota) return;
    void onSalvarNota(sheet, { proposalDecision: decisao }).catch((error) => {
      window.alert(error instanceof Error ? error.message : 'Nao foi possivel revisar a proposta.');
    });
  };

  const soltarNaColuna = (event: React.DragEvent, coluna: 'criado' | 'iniciado' | 'concluido') => {
    event.preventDefault();
    setDragOverColumn(null);
    const raw = event.dataTransfer.getData('text/plain');
    const [tipo, id] = raw.split(':');
    if (tipo === 'nota') {
      const sheet = notas.find((item) => item.id === id);
      if (sheet && onSalvarNota && podeMoverNota(sheet)) {
        moveSheetStatus(sheet, coluna, currentUser.nome, onSalvarNota);
      }
      return;
    }
  };
  if (!notas.length) return null;
  return (
    <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-4 pb-10 animate-in fade-in duration-500">
      {/* Janela translucida sobre o fundo decorativo da Principal (mesmo tratamento da barra de filtros da Conformidade). */}
      <div className="rounded-[28px] border border-[#E5E7EB] bg-white/70 p-3 shadow-[0_10px_30px_-22px_rgba(15,23,42,0.45)] backdrop-blur-xl md:p-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {COLUNAS.map((coluna) => {
            // Conformidade nunca ocupa "Concluido": ao receber o OK o card desaparece do quadro.
            const cores = COLUNA_CORES[coluna.key];
            // Mais antiga primeiro (data de criacao; nota sem criadoEm usa updatedAt). Nota com
            // proposta pendente aparece na coluna do status PROPOSTO (previewNoteProposal), pra
            // parecer que ja foi movida, ate o autor aceitar ou rejeitar.
            const notasColuna = notas
              .filter((sheet) => getSheetStatus(sheet.pendingProposal ? previewNoteProposal(sheet) : sheet) === coluna.key)
              .sort((a, b) => (a.criadoEm || a.updatedAt || '').localeCompare(b.criadoEm || b.updatedAt || ''));
            return (
              <div
                key={coluna.key}
                className={`min-h-[150px] rounded-2xl border px-3 py-3 backdrop-blur-xl transition-all duration-150 ${cores.borda} ${cores.faixa} ${
                  dragOverColumn === coluna.key ? 'bg-white ring-2 ring-inset ring-[#F05D28]/25' : ''
                }`}
                onDragOver={(event) => {
                  event.preventDefault();
                  event.dataTransfer.dropEffect = 'move';
                  if (dragOverColumn !== coluna.key) setDragOverColumn(coluna.key);
                }}
                onDragLeave={(event) => {
                  // So limpa quando sai de fato da coluna, nao ao passar por um filho.
                  if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragOverColumn(null);
                }}
                onDrop={(event) => soltarNaColuna(event, coluna.key)}
              >
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h4 className={`flex items-center gap-2 text-[11px] font-black uppercase tracking-[1.2px] ${cores.texto}`}>
                    <span className={`h-2.5 w-2.5 rounded-full ${cores.dot}`} />
                    {coluna.label}
                  </h4>
                  <span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${cores.texto} ${cores.pill}`}>
                    {notasColuna.length}
                  </span>
                </div>
                <div className="flex flex-col gap-2">
                  {notasColuna.map((sheet) => {
                    const proposal = sheet.pendingProposal;
                    // Enquanto ha proposta pendente, o card mostra a nota como se ja tivesse sido
                    // movida/alterada (previewNoteProposal) - o autor decide aceitar ou rejeitar.
                    const displaySheet = proposal ? previewNoteProposal(sheet) : sheet;
                    const disciplinaIcon = getDisciplineIconInfo(displaySheet.disciplina);
                    const DisciplinaIcon = disciplinaIcon.icon;
                    const podeRevisar = Boolean(proposal && onSalvarNota && isNoteOwner(sheet, currentUser.email));
                    return (
                      <div
                        key={sheet.id}
                        className={`transition-all duration-150 ${
                          podeMoverNota(sheet) && !proposal ? 'cursor-grab active:cursor-grabbing' : ''
                        } ${draggingId === sheet.id ? 'scale-[0.98] opacity-40' : ''}`}
                        draggable={podeMoverNota(sheet) && !proposal}
                        onDragStart={(event) => {
                          event.dataTransfer.effectAllowed = 'move';
                          event.dataTransfer.setData('text/plain', `nota:${sheet.id}`);
                          setDraggingId(sheet.id);
                        }}
                        onDragEnd={() => {
                          setDraggingId(null);
                          setDragOverColumn(null);
                        }}
                      >
                        <div className={`rounded-2xl border border-[#E5E7EB] bg-white/80 shadow-[0_10px_24px_-20px_rgba(15,23,42,0.45)] ${proposal ? 'ring-2 ring-[#DC2626]/40' : ''}`}>
                          <button
                            type="button"
                            onClick={() => onAbrirNota?.(sheet.id)}
                            className="w-full rounded-2xl p-4 text-left"
                          >
                            <div className="flex items-center gap-2">
                              {disciplinaIcon.imageSrc ? (
                                <img
                                  src={disciplinaIcon.imageSrc}
                                  alt={disciplinaIcon.label}
                                  className="h-6 w-6 flex-shrink-0 rounded-full object-cover"
                                />
                              ) : DisciplinaIcon ? (
                                <DisciplinaIcon size={16} className="flex-shrink-0 text-[#0F766E]" />
                              ) : null}
                              <p className="text-[13px] font-black text-[#0F766E]">Nota</p>
                            </div>
                            <div className="mt-2 flex items-center gap-1">
                              <p className="line-clamp-2 flex-1 text-[13px] font-bold text-[#2D2D2D]" title={displaySheet.titulo}>
                                {displaySheet.titulo || 'Sem título'}
                              </p>
                              {displaySheet.publica === false && (
                                <Lock size={12} className="flex-shrink-0 text-[#B45309]" aria-label="Nota privada" />
                              )}
                              {displaySheet.googleEventUrl && (
                                <span className="flex-shrink-0" aria-label="Vinculada a Agenda do Google">
                                  <GoogleIcon size={12} />
                                </span>
                              )}
                            </div>
                            <p className="mt-0.5 truncate text-[11px] font-medium text-[#757575]">
                              {[displaySheet.autorNome, getDisciplineDisplayName(displaySheet.disciplina)].filter(Boolean).join(' · ')}
                            </p>
                            <MovidoPor nome={sheet.movidoPor} />
                          </button>
                          {proposal && (
                            <div className="flex items-center justify-between gap-2 px-4 pb-3">
                              <p className="truncate text-[10px] font-bold text-[#DC2626]">
                                {proposal.proposerName || proposal.proposerEmail} moveu
                              </p>
                              {podeRevisar && (
                                <div className="flex flex-shrink-0 items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() => decidirProposta(sheet, 'accept')}
                                    aria-label={`Aceitar alteracoes de ${proposal.proposerName || proposal.proposerEmail}`}
                                    title="Aceitar alteracoes"
                                    className="flex h-6 w-6 items-center justify-center rounded-full bg-[#16A34A] text-white hover:bg-[#15803D]"
                                  >
                                    ✓
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => decidirProposta(sheet, 'reject')}
                                    aria-label={`Rejeitar alteracoes de ${proposal.proposerName || proposal.proposerEmail}`}
                                    title="Rejeitar alteracoes"
                                    className="flex h-6 w-6 items-center justify-center rounded-full bg-[#DC2626] text-white hover:bg-[#B91C1C]"
                                  >
                                    ✕
                                  </button>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
