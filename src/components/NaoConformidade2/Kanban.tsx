import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, Lock, MessageCircle } from 'lucide-react';
import { sameContractCode } from '../../lib/contractCode';
import { subscribeFirebaseCollection } from '../../lib/firebaseDb';
import { getSheetStatus, GoogleIcon, moveSheetStatus, type AnnotationSheet } from '../CoordenacaoEngenharia/Anotacoes';
import { getDisciplineDisplayName, getDisciplineIconInfo } from '../Atividades';
import { isNoteOwner, previewNoteProposal, type NoteSaveIntent } from '../../lib/noteProposals';
import {
  confirmItemCorrection,
  canViewNc2Record,
  correctionStatus,
  getRecordItems,
  getRecordStatus,
  getRecords,
  isNc2Leader,
  isNc2ConformidadeUser,
  hasUnreadNc2Chat,
  markNc2ChatSeen,
  safeAmount,
  updateRecord,
  type Nc2Record,
} from './ncStore';

type RegistroOs = {
  id?: string;
  code?: string;
  codigo?: string;
  name?: string;
  nome?: string;
  contractCode?: string;
  contractCodigo?: string;
  contrato?: string;
  contratoCodigo?: string;
  contractId?: string;
};

interface KanbanProps {
  lockedContractCode?: string;
  preloadedData?: {
    registro?: {
      osOptions?: RegistroOs[];
    };
  };
  onEdit: (record: Nc2Record) => void;
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

const getOsCode = (os: RegistroOs) => String(os.code || os.codigo || os.id || '').trim();
const getOsName = (os: RegistroOs) => String(os.name || os.nome || getOsCode(os)).trim();

function displayNameWithCode(name: string, code: string) {
  return name && !sameContractCode(name, code) ? `${name} (${code})` : name || code;
}

// Um card por Nc2Record.id, para item encaminhado a Terceiro com C ou T preenchido.
// A selecao de Terceiro ja deixa o item pendente; a disciplina conclui no Kanban.
function outroSetorItems(record: Nc2Record) {
  return getRecordItems(record).filter(
    (item) => item.correcaoOrigem === 'outro_setor'
      && (safeAmount(item.quantidadeC) > 0 || safeAmount(item.quantidadeT) > 0),
  );
}

// Rodape "{Nome} Moveu" - so aparece quando alguem realmente arrastou o card.
function MovidoPor({ nome }: { nome?: string }) {
  if (!nome) return null;
  return <p className="mt-2 text-[10px] font-medium text-[#94A3B8]">{nome} Moveu</p>;
}

export default function Kanban({
  lockedContractCode,
  preloadedData,
  onEdit,
  notas = [],
  onAbrirNota,
  currentUser,
  onSalvarNota,
}: KanbanProps) {
  const [records, setRecords] = useState<Nc2Record[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  // Feedback visual do drag nativo (sem lib): card arrastado fica semitransparente,
  // coluna sob o cursor ganha destaque. Nenhum dos dois participa da logica de soltar.
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);
  const [cardSelecionado, setCardSelecionado] = useState<Nc2Record | null>(null);
  const [chatText, setChatText] = useState('');
  const [confirmacaoConcluido, setConfirmacaoConcluido] = useState<Nc2Record | null>(null);
  // Conformidade, lideranca e coordenacao podem mover; demais usuarios apenas visualizam/conversam.
  const ehLider = isNc2Leader(currentUser);
  const podeOperarKanban = isNc2ConformidadeUser(currentUser) || ehLider;

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError('');
    const load = () =>
      getRecords(lockedContractCode)
        .then((next) => {
          if (active) setRecords(next);
        })
        .catch((error: unknown) => {
          console.error('Erro ao carregar Kanban de conformidade:', error);
          if (!active) return;
          setRecords([]);
          setLoadError(
            error instanceof Error && error.message
              ? `Não foi possível carregar o Kanban: ${error.message}`
              : 'Não foi possível carregar o Kanban do Firebase.',
          );
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    void load();
    // Ao vivo: qualquer mudanca em nc2Records (de qualquer sessao, inclusive a propria escrita
    // otimista do persistRecord abaixo) refaz esse mesmo fetch, sem duplicar a logica de filtro.
    const unsubscribe = subscribeFirebaseCollection('nc2Records', () => void load());
    return () => {
      active = false;
      unsubscribe();
    };
  }, [lockedContractCode]);

  const osOptions = preloadedData?.registro?.osOptions || [];
  const resolveOsName = (code?: string) => {
    const found = osOptions.find((os) => sameContractCode(getOsCode(os), code));
    return found ? getOsName(found) : '';
  };

  // Card so existe enquanto sobrar item pendente: quando a lideranca da OK em todos, ele some.
  const cards = useMemo(
    () =>
      records
        .filter((record) => canViewNc2Record(currentUser, record))
        .map((record) => {
          const items = outroSetorItems(record);
          return { record, items, pendentes: items.filter((item) => correctionStatus(item) === 'pendente') };
        })
        .filter(({ record, pendentes }) => pendentes.length > 0 || record.kanbanStatus === 'concluido'),
    [currentUser, records],
  );

  // Otimista: a tela muda na hora e volta ao estado anterior se o Firebase recusar.
  const persistRecord = (next: Nc2Record) => {
    const anterior = records;
    setRecords((prev) => prev.map((item) => (item.id === next.id ? next : item)));
    void updateRecord(next, currentUser).catch((error: unknown) => {
      setRecords(anterior);
      window.alert(error instanceof Error ? error.message : 'Nao foi possivel mover o card.');
    });
  };

  const executarMovimento = (record: Nc2Record, coluna: 'criado' | 'iniciado' | 'concluido') => {
    if (!podeOperarKanban) return;
    const atual = record.kanbanStatus || 'criado';
    const ordem = { criado: 0, iniciado: 1, concluido: 2 } as const;
    if (coluna === 'criado' || ordem[coluna] <= ordem[atual]) return;
    // A movimentacao nao exige mais uma observacao; o chat do item continua disponivel.
    // Soltar em "Concluido" e o mesmo OK da tela de Revisoes: confirma todo item ainda pendente
    // (statusCorrecao continua sendo a unica verdade) e o card sai do quadro sozinho.
    let next = record;
    if (coluna === 'concluido') {
      next = outroSetorItems(record)
        .filter((item) => correctionStatus(item) === 'pendente')
        .reduce((acc, item) => confirmItemCorrection(acc, item.itemKey, currentUser.nome), record);
    }
    persistRecord({
      ...next,
      kanbanStatus: coluna,
      kanbanMovidoPor: currentUser.nome,
    });
  };

  const moverConformidade = (record: Nc2Record, coluna: 'criado' | 'iniciado' | 'concluido') => {
    if (coluna === 'concluido') {
      setConfirmacaoConcluido(record);
      return;
    }
    executarMovimento(record, coluna);
  };

  const enviarMensagemCard = async () => {
    if (!cardSelecionado || !chatText.trim()) return;
    const mensagem = { autor: currentUser.nome || currentUser.email, mensagem: chatText.trim(), dataHora: new Date().toISOString() };
    try {
      const saved = await updateRecord({
        ...cardSelecionado,
        observacoesHistorico: [...(cardSelecionado.observacoesHistorico || []), mensagem],
      }, currentUser);
      setCardSelecionado(saved);
      setRecords((previous) => previous.map((item) => (item.id === saved.id ? saved : item)));
      setChatText('');
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Não foi possível enviar a mensagem.');
    }
  };

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
    if (tipo === 'nc2') {
      const alvo = cards.find(({ record }) => record.id === id);
      if (alvo) moverConformidade(alvo.record, coluna);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[240px] items-center justify-center rounded-2xl bg-white text-[13px] font-bold text-[#757575] shadow-[0_10px_30px_-22px_rgba(15,23,42,0.45)]">
        <Loader2 size={16} className="mr-3 animate-spin text-[#F05D28]" />
        Carregando Kanban...
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="rounded-2xl border border-[#FECACA] bg-[#FEF2F2] px-5 py-4 text-[13px] font-medium text-[#B91C1C]">
        {loadError}
      </div>
    );
  }

  // Sem nada pra mostrar: some do Principal, sem texto de vazio.
  if (cards.length === 0 && notas.length === 0) return null;

  return (
    <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-4 pb-10 animate-in fade-in duration-500">
      {/* Janela translucida sobre o fundo decorativo da Principal (mesmo tratamento da barra de filtros da Conformidade). */}
      <div className="rounded-[28px] border border-[#E5E7EB] bg-white/70 p-3 shadow-[0_10px_30px_-22px_rgba(15,23,42,0.45)] backdrop-blur-xl md:p-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {COLUNAS.map((coluna) => {
            // Conformidade nunca ocupa "Concluido": ao receber o OK o card desaparece do quadro.
            const cardsColuna = cards.filter(({ record }) => (record.kanbanStatus || 'criado') === coluna.key);
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
                    {cardsColuna.length + notasColuna.length}
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
                  {cardsColuna.map(({ record }) => {
                    const status = getRecordStatus(record);
                    const osNome = resolveOsName(record.osCodigo || record.os) || record.os;

                    return (
                      <div
                        key={record.id}
                        className={`transition-all duration-150 ${
                          podeOperarKanban ? 'cursor-grab active:cursor-grabbing' : 'cursor-default'
                        } ${draggingId === record.id ? 'scale-[0.98] opacity-40' : ''}`}
                        draggable={podeOperarKanban}
                        onDragStart={(event) => {
                          event.dataTransfer.effectAllowed = 'move';
                          event.dataTransfer.setData('text/plain', `nc2:${record.id}`);
                          setDraggingId(record.id ?? null);
                        }}
                        onDragEnd={() => {
                          setDraggingId(null);
                          setDragOverColumn(null);
                        }}
                      >
                      <button
                        type="button"
                        onClick={() => { markNc2ChatSeen(record, currentUser.email); setChatText(''); setCardSelecionado(record); }}
                        data-kanban-status={status.key}
                        className={`relative w-full cursor-pointer overflow-hidden rounded-2xl border-l-4 border-y border-r bg-white/80 p-3 text-left shadow-[0_10px_24px_-20px_rgba(15,23,42,0.45)] backdrop-blur-md transition-colors hover:bg-white ${cores.borda}`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2"><p className={`text-[12px] font-black ${cores.texto}`}>Conformidade</p>{hasUnreadNc2Chat(record, currentUser.email) && <MessageCircle size={18} className="rounded-full bg-[#FFF3EC] p-1 text-[#D94E1F] ring-1 ring-[#F05D28]/25" aria-label="Mensagem não lida" />}</div>
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-black uppercase tracking-wide text-slate-500">OS</span>
                        </div>
                        <p className="mt-1 truncate text-[12px] font-bold text-[#2D2D2D]" title={osNome}>
                          OS {displayNameWithCode(osNome, record.osCodigo)}
                        </p>
                      </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {cardSelecionado && (
        <div className="fixed inset-0 z-[220] flex items-center justify-center bg-slate-950/30 p-4" onClick={() => setCardSelecionado(null)}>
          <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[1px] text-[#F05D28]">Conformidade</p>
                <h2 className="mt-1 text-[17px] font-black text-[#2D2D2D]">{cardSelecionado.os || cardSelecionado.osCodigo}</h2>
                <p className="mt-1 text-[12px] text-[#64748B]">{cardSelecionado.disciplina}</p>
              </div>
              <button type="button" onClick={() => setCardSelecionado(null)} className="rounded-lg border border-[#E5E7EB] px-3 py-1.5 text-[12px] font-bold text-[#64748B]">Fechar</button>
            </div>
            <div className="mt-4 space-y-2">
              {getRecordItems(cardSelecionado).map((item) => (
                <div key={item.itemKey} className="rounded-xl border border-[#E5E7EB] bg-[#F8FAFC] px-3 py-2 text-[12px] text-[#475569]">
                  <div className="flex items-center justify-between gap-3"><strong>{item.itemLabel}</strong><span>C {safeAmount(item.quantidadeC)} · T {safeAmount(item.quantidadeT)}</span></div>
                  {item.observacao && <p className="mt-1 text-[11px] text-[#64748B]">{item.observacao}</p>}
                </div>
              ))}
            </div>
            {cardSelecionado.kanbanObservacao && <p className="mt-4 rounded-xl bg-[#FFF7ED] px-3 py-2 text-[12px] text-[#92400E]">{cardSelecionado.kanbanObservacaoPor || 'Observação'}: {cardSelecionado.kanbanObservacao}</p>}
            <div className="mt-4 border-t border-[#E5E7EB] pt-4">
              <p className="mb-2 text-[11px] font-black uppercase tracking-[0.8px] text-[#94A3B8]">Chat do card</p>
              <div className="max-h-36 space-y-2 overflow-y-auto">
                {(cardSelecionado.observacoesHistorico || []).map((item, index) => (
                  <div key={`${item.dataHora}-${index}`} className="rounded-lg bg-[#F8FAFC] px-3 py-2 text-[12px] text-[#475569]"><strong>{item.autor}:</strong> {item.mensagem}</div>
                ))}
                {(cardSelecionado.observacoesHistorico || []).length === 0 && <p className="text-[12px] text-[#94A3B8]">Nenhuma observação ainda.</p>}
              </div>
              <div className="mt-3 flex items-end gap-2">
                <textarea value={chatText} onChange={(event) => setChatText(event.target.value)} rows={2} placeholder="Escreva uma observação..." className="min-w-0 flex-1 resize-none rounded-lg border border-[#E5E7EB] bg-white px-3 py-2 text-[12px] outline-none focus:border-[#F05D28]" />
                <button type="button" onClick={() => void enviarMensagemCard()} disabled={!chatText.trim()} className="rounded-lg bg-[#F05D28] px-3 py-2 text-[11px] font-bold text-white disabled:opacity-40">Enviar</button>
              </div>
            </div>
          </div>
        </div>
      )}
      {confirmacaoConcluido && (
        <div className="fixed inset-0 z-[230] flex items-center justify-center bg-slate-950/35 p-4" onClick={() => setConfirmacaoConcluido(null)}>
          <div className="w-full max-w-md rounded-3xl border border-white/70 bg-white p-6 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-[#ECFDF5] text-[#047857]">✓</div>
            <h2 className="text-[17px] font-black text-[#2D2D2D]">Concluir este card?</h2>
            <p className="mt-2 text-[13px] leading-relaxed text-[#64748B]">Tem certeza que deseja mover este card para Concluído? Essa ação confirma as correções pendentes.</p>
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" onClick={() => setConfirmacaoConcluido(null)} className="rounded-xl border border-[#E5E7EB] px-4 py-2.5 text-[12px] font-bold text-[#64748B] hover:bg-[#F8FAFC]">Cancelar</button>
              <button type="button" onClick={() => { const record = confirmacaoConcluido; setConfirmacaoConcluido(null); executarMovimento(record, 'concluido'); }} className="rounded-xl bg-[#047857] px-4 py-2.5 text-[12px] font-bold text-white hover:bg-[#036749]">Confirmar conclusão</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
