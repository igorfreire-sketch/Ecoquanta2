import { COLUNAS_FIXAS } from '../lib/cronoColumns';
import { ordemColunasCronograma, ordemArvore, calcularCodigos, irmaoAnterior, nivelDe, moverDireita as moverDireitaRows, moverEsquerda as moverEsquerdaRows, editarPredecessora, salvarColuna, excluirColuna } from '../lib/cronoGridLogic';
export { ordemColunasCronograma, ordemArvore, calcularCodigos } from '../lib/cronoGridLogic';
import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, Globe, Indent, Link2, Lock, Outdent, Trash2, X } from 'lucide-react';
import { addDias, criarLinhaVazia, diffDias, proximoSeq, type CronoRow } from '../lib/cronoRow';
import SearchableSelect from './SearchableSelect';
import CampoDialog from './CampoDialog';
import { extrairLinkDaCelula, REGEX_LINK_MARKDOWN } from '../lib/cellLink';
import type { EngineeringActivity } from './Atividades';
export const CRONOGRAMAS_COLLECTION = 'cronogramas';
const DISCIPLINA_ALVO = 'bi - solucoes digitais';

// Paleta fixa p/ pintar linha (mesmo espirito do CORES_FUNDO da Anotacoes, sem acoplar aos dois arquivos).
const PALETA_CELULA: Array<[string, string]> = [
  ['Sem cor', ''],
  ['Azul', '#DBEAFE'],
  ['Vermelho', '#FEE2E2'],
  ['Verde', '#DCFCE7'],
  ['Amarelo', '#FEF9C3'],
  ['Laranja', '#FFE7D9'],
  ['Cinza', '#F3F4F6'],
];

const NOVA_NOTA_VALOR = '__nova__';

// A forma da linha mora em lib/cronoRow.ts (compartilhada com o bloco Project da nota);
// reexportada aqui pra nao mexer em quem ja importa `CronoRow` deste arquivo.
export type { CronoRow } from '../lib/cronoRow';

export interface ColunaCustom {
  id: string;
  nome: string;
}

// Um cronograma = um doc do Firestore (colecao `cronogramas`). Antes cada linha era um doc solto
// na colecao `solucoesDigitaisCronograma`; ver Cronogramas.tsx pra migracao unica dessa colecao antiga.
export interface CronogramaDoc {
  id: string;
  titulo: string;
  autorEmail: string;
  autorNome: string;
  publica: boolean;
  colunasCustom: ColunaCustom[];
  rows: CronoRow[];
  createdAt: string;
  updatedAt: string;
  // Largura das colunas, chaveada por uma CHAVE ESTAVEL (nao por indice, como o banco da nota
  // faz) — aqui as colunas fixas convivem com colunas customizadas que o usuario pode adicionar
  // ou remover a qualquer momento; um array por indice deslocaria (silenciosamente) a largura de
  // toda coluna a direita da que mudou. Chave = COLUNAS_FIXAS[].key pras fixas, ColunaCustom.id
  // pras customizadas.
  colWidths?: Record<string, number>;
  // Ordem visual das colunas. Ausente em documentos antigos = ordem padrao abaixo.
  colOrder?: string[];
  // Preenchido quando o Project nasceu DENTRO de uma nota (bloco "+ Project"): o doc continua
  // sendo um `cronogramas` normal, mas aqui na tela solta ele fica somente leitura — quem edita
  // e a nota de origem (a coluna Nota vira o atalho pra abrir essa nota).
  origemNotaId?: string;
}

// Colunas fixas na ordem de renderizacao, com a largura padrao aproximada de como cada uma
// renderiza hoje (ID estreito, Atividade larga, Duracao/% estreitos etc.) — nao forca tudo pro
// mesmo tamanho como o BANCO_COL_WIDTH da nota faz.
const LARGURA_COLUNA_CUSTOM_PADRAO = 160;
// "Detalhe" (a descricao longa que o seed do cronograma real usa) e tipicamente texto corrido -
// mesmo raciocinio de largura padrao das fixas, so por nome pq colunas customizadas nao tem chave fixa.
const LARGURA_COLUNA_DETALHE_PADRAO = 260;

function normalizar(valor: string) {
  return valor.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
}

function formatDateBRLocal(value?: string) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('pt-BR');
}

// Menu de contexto (botao direito/clique) generico: posicionado no cursor, via portal pro <body> —
// escapa do transform do framer-motion que envolve a pagina e quebraria position:fixed se ficasse
// aninhado na tabela. Usado tanto pra pintar linha quanto pra renomear/remover coluna custom.
function MenuFlutuante({ x, y, onFechar, children }: { x: number; y: number; onFechar: () => void; children: ReactNode }) {
  return createPortal(
    <>
      <div
        className="fixed inset-0 z-[210]"
        onClick={onFechar}
        onContextMenu={(e) => { e.preventDefault(); onFechar(); }}
      />
      <div
        className="fixed z-[211] rounded-lg border border-[#E5E7EB] bg-white p-1.5 shadow-lg"
        style={{ top: Math.max(8, Math.min(y, window.innerHeight - 300)), left: Math.max(8, Math.min(x, window.innerWidth - 180)) }}
      >
        {children}
      </div>
    </>,
    document.body,
  );
}

// Alca de redimensionar coluna: mesma classe/comportamento da alca de coluna do banco da nota
// (Anotacoes.tsx ~1609-1620) — preventDefault+stopPropagation pra nao disparar o menu de
// contexto (cor da linha / renomear coluna) nem selecao, que tambem vivem nesse `<th>`.
function AlcaColuna({ onMouseDown }: { onMouseDown: (event: ReactMouseEvent) => void }) {
  return (
    <div
      draggable={false}
      onMouseDown={onMouseDown}
      className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize hover:bg-[#F05D28]"
    />
  );
}

export interface CronogramaGridProps {
  doc: CronogramaDoc;
  onChange: (doc: CronogramaDoc) => void;
  currentUser: { nome: string; email: string; role?: string; isAdmin?: boolean; disciplinas?: string[] };
  usuarios?: Array<{ nome: string; email: string; disciplinas?: string[] }>;
  notes?: Array<{ id: string; titulo: string }>;
  activities?: EngineeringActivity[];
  readOnly?: boolean;
  onCreateNote?: (rowId: string) => void;
  onOpenNote?: (noteId: string) => void;
}

export default function CronogramaGrid({ doc, onChange, currentUser, usuarios = [], notes = [], activities = [], readOnly = false, onCreateNote, onOpenNote }: CronogramaGridProps) {
  // Filtro por usuário: so lista quem de fato tem linha no cronograma (evita opcao que sempre da zero).
  const [filtroResponsavel, setFiltroResponsavel] = useState('');
  // comHiperlink: so true quando o botao direito foi na celula Atividade (menu ganha o item
  // Hiperlink ali em cima); nas outras celulas da linha, botao direito so mostra as cores.
  const [menuCor, setMenuCor] = useState<{ id: string; x: number; y: number; comHiperlink: boolean } | null>(null);
  const [menuColuna, setMenuColuna] = useState<{ id: string; x: number; y: number } | null>(null);
  // Dialogo de nome de coluna (adicionar/renomear) — substitui window.prompt. id=null -> criar nova.
  const [dialogoColuna, setDialogoColuna] = useState<{ id: string | null; nomeAtual: string } | null>(null);
  // Dialogo de hiperlink no nome da atividade — mesma convencao markdown [label](url) da nota.
  const [dialogoLink, setDialogoLink] = useState<{ rowId: string } | null>(null);
  // Nome de atividade com foco: enquanto nao focado, se tiver link markdown mostra so o rotulo
  // (igual celula da nota); focado, mostra o texto bruto pra poder editar.
  const [linhaNomeFocada, setLinhaNomeFocada] = useState<string | null>(null);
  const [linhaArrastada, setLinhaArrastada] = useState<string | null>(null);
  const [alvoArrastoLinha, setAlvoArrastoLinha] = useState<{ id: string; depois: boolean } | null>(null);
  const alvoArrastoLinhaRef = useRef<{ id: string; depois: boolean } | null>(null);
  const [colunaArrastada, setColunaArrastada] = useState<string | null>(null);
  // Arrasto de redimensionar coluna em andamento — mesma logica do banco da nota (Anotacoes.tsx
  // ~386-388/505-534), so pra coluna (aqui nao existe redimensionar linha).
  const redimensionarRef = useRef<{ key: string; inicioPx: number; tamanhoInicial: number } | null>(null);

  const rows = doc.rows;
  const bloqueado = readOnly;
  const notaOrigem = doc.origemNotaId ? notes.find((n) => n.id === doc.origemNotaId) : undefined;
  // Cronograma novo (ou esvaziado) abre com 1 linha ja pronta pra digitar — sem precisar clicar
  // em "+ Linha" primeiro. So roda uma vez, na abertura.
  useEffect(() => {
    if (doc.rows.length === 0 && !bloqueado) {
      onChange({ ...doc, rows: [criarLinhaVazia(1)] });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fim do arrasto acontece fora do <th> (o mouse sai da tabela antes de soltar) - listener na
  // janela, igual Anotacoes.tsx. Sem array de deps de proposito: precisa fechar sobre o `doc`
  // mais recente a cada render (mesmo padrao da fonte).
  useEffect(() => {
    const onMove = (event: globalThis.MouseEvent) => {
      const alvo = redimensionarRef.current;
      if (!alvo) return;
      const delta = event.clientX - alvo.inicioPx;
      const tamanho = Math.max(60, alvo.tamanhoInicial + delta);
      atualizarDoc({ colWidths: { ...doc.colWidths, [alvo.key]: tamanho } });
    };
    const onUp = () => { redimensionarRef.current = null; };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  });

  function larguraColuna(key: string, padrao: number): number {
    return doc.colWidths?.[key] ?? padrao;
  }

  function iniciarRedimensionar(key: string, larguraAtual: number) {
    return (event: ReactMouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      redimensionarRef.current = { key, inicioPx: event.clientX, tamanhoInicial: larguraAtual };
    };
  }



  const responsaveis = usuarios.filter((u) =>
    (u.disciplinas || []).some((d) => {
      const n = normalizar(d);
      return n === DISCIPLINA_ALVO || n.includes('solucoes digitais');
    }),
  );

  const emailsComLinha: string[] = Array.from(new Set(rows.map((r) => r.responsavelEmail).filter(Boolean)));
  const opcoesFiltroResponsavel = emailsComLinha
    .map((email) => ({ email, nome: usuarios.find((u) => u.email === email)?.nome || email }))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));

  // ponytail: com filtro de responsavel a lista vira plana (indentacao/colapso de arvore ficam
  // fora de escopo aqui, pois o filtro quebra a hierarquia pai/filho).
  const modoArvore = !filtroResponsavel;
  const linhasFiltradas = modoArvore ? ordemArvore(rows) : rows.filter((r) => r.responsavelEmail === filtroResponsavel);
  const mapaPorId = new Map<string, CronoRow>(rows.map((r) => [r.id, r]));
  const codigos = calcularCodigos(rows);
  const colunasVisiveis = ordemColunasCronograma(doc).map((key) => {
    const fixa = COLUNAS_FIXAS.find((col) => col.key === key);
    if (fixa) return fixa;
    const custom = doc.colunasCustom.find((col) => col.id === key)!;
    return {
      key,
      nome: custom.nome,
      largura: normalizar(custom.nome) === 'detalhe' ? LARGURA_COLUNA_DETALHE_PADRAO : LARGURA_COLUNA_CUSTOM_PADRAO,
      custom: true,
    };
  });

  // Salvar e explicito (botao), nao autosave: toda edicao so muda o estado local (`atualizarDoc`)
  // e marca `sujo`; so "Salvar" grava no Firestore e limpa o `sujo`.
  function atualizarDoc(patch: Partial<CronogramaDoc>) {
    // Trava unica: TODA edicao (celula, coluna, cor, ordem, hierarquia) passa por aqui, entao o
    // Project vindo de nota fica imutavel nesta tela sem precisar de guarda em cada handler.
    if (bloqueado) return;
    onChange({ ...doc, ...patch });
  }

  function atualizarLinha(id: string, patch: Partial<CronoRow>) {
    atualizarDoc({ rows: rows.map((r) => (r.id === id ? { ...r, ...patch } : r)) });
  }

  function adicionarLinha() {
    atualizarDoc({ rows: [...rows, { ...criarLinhaVazia(proximoSeq(rows)), ordem: rows.length }] });
  }

  function inserirLinhaPerto(id: string, posicao: 'above' | 'below') {
    const indice = rows.findIndex((row) => row.id === id);
    if (indice === -1) return;
    const nova = { ...criarLinhaVazia(proximoSeq(rows)), parentId: rows[indice].parentId || '' };
    const destino = indice + (posicao === 'below' ? 1 : 0);
    atualizarDoc({ rows: [...rows.slice(0, destino), nova, ...rows.slice(destino)] });
    setMenuCor(null);
  }

  function pintarLinha(id: string, cor: string) {
    atualizarLinha(id, { corLinha: cor || '' });
    setMenuCor(null);
  }

  function alternarColapso(id: string) {
    const row = rows.find((r) => r.id === id);
    if (!row) return;
    atualizarLinha(id, { colapsada: !row.colapsada });
  }

  function reordenar(novo: CronoRow[]) {
    atualizarDoc({ rows: novo });
  }

  function soltarLinha(alvoId: string, depois: boolean) {
    const origem = rows.find((row) => row.id === linhaArrastada);
    const alvo = rows.find((row) => row.id === alvoId);
    if (!origem || !alvo || origem.id === alvo.id || (origem.parentId || '') !== (alvo.parentId || '')) return;
    const semOrigem = rows.filter((row) => row.id !== origem.id);
    const indiceAlvo = semOrigem.findIndex((row) => row.id === alvo.id);
    const destino = indiceAlvo + (depois ? 1 : 0);
    reordenar([...semOrigem.slice(0, destino), origem, ...semOrigem.slice(destino)]);
  }

  function podeSoltarLinha(alvoId: string) {
    const origem = rows.find((row) => row.id === linhaArrastada);
    const alvo = rows.find((row) => row.id === alvoId);
    return Boolean(origem && alvo && origem.id !== alvo.id && (origem.parentId || '') === (alvo.parentId || ''));
  }

  function marcarAlvoArrastoLinha(alvoId: string, event: ReactMouseEvent<HTMLTableRowElement>) {
    if (!podeSoltarLinha(alvoId)) return;
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    const proximo = { id: alvoId, depois: event.clientY > rect.top + rect.height / 2 };
    if (alvoArrastoLinhaRef.current?.id === proximo.id && alvoArrastoLinhaRef.current.depois === proximo.depois) return;
    alvoArrastoLinhaRef.current = proximo;
    setAlvoArrastoLinha(proximo);
  }

  function abrirMenuLinha(id: string, event: ReactMouseEvent, comHiperlink: boolean) {
    event.preventDefault();
    event.stopPropagation();
    setMenuCor({ id, x: event.clientX, y: event.clientY, comHiperlink });
  }

  function soltarColuna(alvo: string, depois: boolean) {
    if (!colunaArrastada || colunaArrastada === alvo) return;
    const semOrigem = ordemColunasCronograma(doc).filter((key) => key !== colunaArrastada);
    const indiceAlvo = semOrigem.indexOf(alvo);
    const destino = indiceAlvo + (depois ? 1 : 0);
    atualizarDoc({ colOrder: [...semOrigem.slice(0, destino), colunaArrastada, ...semOrigem.slice(destino)] });
  }

  // Direita: vira filha do irmao imediatamente anterior NO MESMO NIVEL atual — assim varias
  // indentacoes seguidas viram irmas (1.1, 1.2, 1.3...) em vez de aninhar cada uma um nivel mais
  // fundo que a anterior. So aninha mais fundo se vc indentar de novo um item que ja e filho.
  function moverDireita(id: string) { reordenar(moverDireitaRows(rows, id)); }

  function moverEsquerda(id: string) { reordenar(moverEsquerdaRows(rows, id)); }

  function onEscolherNota(rowId: string, valor: string) {
    if (valor === NOVA_NOTA_VALOR) { onCreateNote?.(rowId); return; }
    atualizarLinha(rowId, { noteId: valor });
  }

  function removerLinha(id: string) {
    atualizarDoc({ rows: rows.filter((r) => r.id !== id) });
  }

  function onEditarInicio(id: string, valor: string) {
    const row = rows.find((r) => r.id === id);
    if (!row) return;
    if (row.duracaoDias != null) {
      atualizarLinha(id, { dataInicio: valor, dataFim: valor ? addDias(valor, row.duracaoDias) : '' });
    } else if (row.dataFim) {
      atualizarLinha(id, { dataInicio: valor, duracaoDias: diffDias(valor, row.dataFim) });
    } else {
      atualizarLinha(id, { dataInicio: valor });
    }
  }

  function onEditarDuracao(id: string, valorTexto: string) {
    const row = rows.find((r) => r.id === id);
    if (!row) return;
    const duracao = valorTexto === '' ? null : Number(valorTexto);
    const duracaoValida = duracao !== null && Number.isFinite(duracao) ? duracao : null;
    if (row.dataInicio && duracaoValida != null) {
      atualizarLinha(id, { duracaoDias: duracaoValida, dataFim: addDias(row.dataInicio, duracaoValida) });
    } else {
      atualizarLinha(id, { duracaoDias: duracaoValida });
    }
  }

  function onEditarFim(id: string, valor: string) {
    const row = rows.find((r) => r.id === id);
    if (!row) return;
    if (row.dataInicio) {
      atualizarLinha(id, { dataFim: valor, duracaoDias: valor ? diffDias(row.dataInicio, valor) : null });
    } else {
      atualizarLinha(id, { dataFim: valor });
    }
  }

  function onEditarPredecessora(id: string, predecessoraId: string) {
    atualizarDoc({ rows: editarPredecessora(rows, id, predecessoraId) });
  }

  function adicionarColuna() {
    setDialogoColuna({ id: null, nomeAtual: '' });
  }

  function renomearColuna(id: string) {
    const atual = doc.colunasCustom.find((c) => c.id === id);
    setMenuColuna(null);
    setDialogoColuna({ id, nomeAtual: atual?.nome || '' });
  }

  function confirmarDialogoColuna(values: Record<string, string>) {
    if (!dialogoColuna) return;
    const nome = (values.nome || '').trim();
    if (nome) {
      if (dialogoColuna.id === null) {
        const coluna: ColunaCustom = { id: crypto.randomUUID(), nome };
        atualizarDoc(salvarColuna(doc, coluna));
      } else {
        atualizarDoc(salvarColuna(doc, { id: dialogoColuna.id, nome }));
      }
    }
    setDialogoColuna(null);
  }

  // Link no nome da atividade: mesma convencao markdown [label](url) da nota (extrairLinkDaCelula
  // etc., reexportados de Anotacoes.tsx). Sem textarea/selecao pra capturar aqui — o campo e um
  // <input> de uma linha só, entao o link so pode ser inserido no FIM do texto atual (nunca
  // sobrescreve o que ja tinha, mesma cautela da celula de nota).
  function confirmarDialogoLink(values: Record<string, string>) {
    if (!dialogoLink) return;
    const url = (values.url || '').trim();
    if (url) {
      const row = rows.find((r) => r.id === dialogoLink.rowId);
      if (row) {
        const label = (values.label || '').trim() || url;
        const markdown = `[${label}](${url})`;
        const separador = row.nome && !row.nome.endsWith(' ') ? ' ' : '';
        atualizarLinha(row.id, { nome: `${row.nome}${separador}${markdown}` });
      }
    }
    setDialogoLink(null);
  }

  function removerColuna(id: string) {
    setMenuColuna(null);
    atualizarDoc(excluirColuna(doc, id));
  }

  function editarCelulaCustom(rowId: string, colId: string, valor: string) {
    const row = rows.find((r) => r.id === rowId);
    if (!row) return;
    atualizarLinha(rowId, { custom: { ...(row.custom || {}), [colId]: valor } });
  }

  function renderCelula(row: CronoRow, key: string, nivel: number, temFilhos: boolean) {
    switch (key) {
      case 'id':
        return <td key={key} draggable onDragStart={(e) => { if (e.buttons && e.buttons !== 1) { e.preventDefault(); return; } setLinhaArrastada(row.id); e.dataTransfer.setData('text/plain', row.id); e.dataTransfer.effectAllowed = 'move'; }} className={`${linhaArrastada === row.id ? 'cursor-grabbing' : 'cursor-default'} px-3 py-1 text-gray-500`} title="Clique e arraste para reordenar entre linhas do mesmo nível">#{codigos.get(row.id)}</td>;
      case 'nome': {
        const match = linhaNomeFocada !== row.id ? REGEX_LINK_MARKDOWN.exec(row.nome) : null;
        return (
          <td
            key={key}
            className="px-3 py-1"
            onContextMenu={(e) => abrirMenuLinha(row.id, e, true)}
            title="Botão direito para editar a linha ou hiperlink"
          >
            <div className="flex items-center gap-1" style={{ paddingLeft: nivel * 20 }}>
              {modoArvore && (
                <button
                  type="button"
                  onClick={() => alternarColapso(row.id)}
                  className={`shrink-0 text-gray-400 hover:text-[#F05D28] ${temFilhos ? '' : 'invisible'}`}
                  title={row.colapsada ? 'Expandir' : 'Retrair'}
                >
                  {row.colapsada ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                </button>
              )}
              {match ? (
                <div
                  onClick={() => setLinhaNomeFocada(row.id)}
                  className="w-full flex-1 cursor-text truncate rounded border border-[#E5E7EB] px-2 py-1"
                >
                  {row.nome.slice(0, match.index)}
                  <span className="text-[#2563EB] underline">{match[1]}</span>
                  {row.nome.slice(match.index + match[0].length)}
                </div>
              ) : (
                <input
                  type="text"
                  value={row.nome}
                  onChange={(e) => atualizarLinha(row.id, { nome: e.target.value })}
                  onFocus={() => setLinhaNomeFocada(row.id)}
                  onBlur={() => setLinhaNomeFocada((prev) => (prev === row.id ? null : prev))}
                  className="w-full flex-1 border border-[#E5E7EB] rounded px-2 py-1"
                  placeholder="Nome da atividade"
                />
              )}
              {extrairLinkDaCelula(row.nome) && (
                <button
                  type="button"
                  title="Abrir link"
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={() => window.open(extrairLinkDaCelula(row.nome)!, '_blank', 'noopener')}
                  className="shrink-0 rounded p-0.5 text-[#2563EB] hover:bg-[#DBEAFE]"
                >
                  <Link2 size={12} />
                </button>
              )}
              {modoArvore && (
                <>
                  <button
                    type="button"
                    onClick={() => moverEsquerda(row.id)}
                    disabled={!row.parentId}
                    className="shrink-0 text-gray-400 hover:text-[#F05D28] disabled:opacity-30"
                    title="Promover (shift+tab)"
                  >
                    <Outdent size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => moverDireita(row.id)}
                    disabled={!irmaoAnterior(rows, row)}
                    className="shrink-0 text-gray-400 hover:text-[#F05D28] disabled:opacity-30"
                    title="Indentar (tab)"
                  >
                    <Indent size={14} />
                  </button>
                </>
              )}
            </div>
          </td>
        );
      }
      case 'predecessora':
        return (
          <td key={key} className="px-3 py-1">
            <select
              value={row.predecessoraId}
              onChange={(e) => onEditarPredecessora(row.id, e.target.value)}
              className="w-full border border-[#E5E7EB] rounded px-2 py-1"
            >
              <option value="">Nenhuma</option>
              {rows.filter((r) => r.id !== row.id).map((r) => (
                <option key={r.id} value={r.id}>#{codigos.get(r.id)} - {r.nome || '(sem nome)'}</option>
              ))}
            </select>
          </td>
        );
      case 'inicio':
        return <td key={key} className="px-3 py-1"><input type="date" value={row.dataInicio} onChange={(e) => onEditarInicio(row.id, e.target.value)} className="w-full border border-[#E5E7EB] rounded px-2 py-1" /></td>;
      case 'duracao':
        return <td key={key} className="px-3 py-1"><input type="number" value={row.duracaoDias ?? ''} onChange={(e) => onEditarDuracao(row.id, e.target.value)} className="w-24 border border-[#E5E7EB] rounded px-2 py-1" /></td>;
      case 'fim':
        return <td key={key} className="px-3 py-1"><input type="date" value={row.dataFim} onChange={(e) => onEditarFim(row.id, e.target.value)} className="w-full border border-[#E5E7EB] rounded px-2 py-1" /></td>;
      case 'responsavel':
        return (
          <td key={key} className="px-3 py-1">
            <select value={row.responsavelEmail} onChange={(e) => atualizarLinha(row.id, { responsavelEmail: e.target.value })} className="w-full border border-[#E5E7EB] rounded px-2 py-1">
              <option value="">Sem responsável</option>
              {responsaveis.map((u) => <option key={u.email} value={u.email}>{u.nome}</option>)}
            </select>
          </td>
        );
      case 'percentual':
        return <td key={key} className="px-3 py-1"><input type="number" min={0} max={100} value={row.percentualConcluido ?? ''} onChange={(e) => atualizarLinha(row.id, { percentualConcluido: e.target.value === '' ? null : Number(e.target.value) })} className="w-20 border border-[#E5E7EB] rounded px-2 py-1" placeholder="%" /></td>;
      case 'nota':
        // Project vindo de nota: a coluna Nota deixa de ser seletor e vira o atalho pra ABRIR a
        // nota de origem (mesmo mecanismo de `sheetAberta` usado pelo "+ Criar nova nota").
        if (bloqueado) {
          return (
            <td key={key} className="px-3 py-1">
              {/* role=button em vez de <button>: a tabela inteira fica dentro de um <fieldset
                  disabled>, que desabilitaria um botao de verdade junto com os campos. */}
              <span
                role="button"
                tabIndex={0}
                onClick={() => notaOrigem && onOpenNote?.(notaOrigem.id)}
                onKeyDown={(e) => { if (e.key === 'Enter' && notaOrigem) onOpenNote?.(notaOrigem.id); }}
                title={notaOrigem ? 'Abrir a nota que criou este Project' : 'Nota de origem indisponível'}
                className={`block w-full truncate rounded border border-[#E5E7EB] px-2 py-1 text-left ${notaOrigem ? 'cursor-pointer text-[#F05D28] hover:bg-[#FFF3EC]' : 'text-[#94A3B8]'}`}
              >
                {notaOrigem?.titulo || 'Nota de origem'}
              </span>
            </td>
          );
        }
        return (
          <td key={key} className="px-3 py-1">
            <SearchableSelect value={row.noteId} onChange={(e) => onEscolherNota(row.id, e.target.value)} className="w-full border border-[#E5E7EB] rounded px-2 py-1 bg-white" searchPlaceholder="Sem nota">
              <option value="">Sem nota</option>
              {onCreateNote && <option value={NOVA_NOTA_VALOR}>+ Criar nova nota</option>}
              {notes.map((n) => <option key={n.id} value={n.id}>{n.titulo || '(sem título)'}</option>)}
            </SearchableSelect>
          </td>
        );
      case 'atividade':
        return (
          <td key={key} className="px-3 py-1">
            <SearchableSelect value={row.atividadeId || ''} onChange={(e) => atualizarLinha(row.id, { atividadeId: e.target.value })} className="w-full border border-[#E5E7EB] rounded px-2 py-1 bg-white" searchPlaceholder="Sem vínculo">
              <option value="">Sem vínculo</option>
              {activities.map((a) => <option key={a.id} value={a.id}>{a.osCodigo} - {a.atividade || a.itemNome || '(sem nome)'}</option>)}
            </SearchableSelect>
          </td>
        );
      default:
        return (
          <td key={key} className="px-3 py-1">
            <input type="text" value={row.custom?.[key] || ''} onChange={(e) => editarCelulaCustom(row.id, key, e.target.value)} className="w-full border border-[#E5E7EB] rounded px-2 py-1" />
          </td>
        );
    }
  }

  return (
    <>
          <div className="mt-3 overflow-hidden rounded-xl border border-[#E5E7EB]">
            <div className="flex items-center justify-between border-b border-[#E5E7EB] bg-[#F9FAFB] px-3 py-1.5">
              <select
                value={filtroResponsavel}
                onChange={(e) => setFiltroResponsavel(e.target.value)}
                className="h-7 rounded-md border border-[#E5E7EB] bg-white px-2 text-[12px] text-[#2D2D2D]"
              >
                <option value="">Todos os usuários</option>
                {opcoesFiltroResponsavel.map((o) => (
                  <option key={o.email} value={o.email}>{o.nome}</option>
                ))}
              </select>
              {!bloqueado && (
                <button
                  type="button"
                  onClick={adicionarColuna}
                  className="text-[12px] font-bold text-[#F05D28] hover:underline"
                >
                  + Coluna
                </button>
              )}
            </div>

            <div className="overflow-auto">
              {/* fieldset disabled = trava nativa de todos os campos da tabela quando o Project
                  veio de uma nota (nao ha handler pra esquecer). */}
              <fieldset disabled={bloqueado} className="m-0 min-w-full border-0 p-0">
              {/* table-fixed + colgroup: sem isso o navegador ignora as larguras arrastadas (mesmo aviso do banco da nota). */}
              <table className="min-w-full table-fixed text-sm text-[#2D2D2D]">
                <colgroup>
                  {colunasVisiveis.map((col) => <col key={col.key} style={{ width: `${larguraColuna(col.key, col.largura)}px` }} />)}
                  <col style={{ width: '40px' }} />
                </colgroup>
                <thead className="bg-gray-50 border-b border-[#E5E7EB]">
                  <tr>
                    {colunasVisiveis.map((col) => (
                      <th
                        key={col.key}
                        draggable
                        onDragStart={(e) => { setColunaArrastada(col.key); e.dataTransfer.setData('text/plain', col.key); e.dataTransfer.effectAllowed = 'move'; }}
                        onDragOver={(e) => { if (colunaArrastada) e.preventDefault(); }}
                        onDrop={(e) => {
                          e.preventDefault();
                          const rect = e.currentTarget.getBoundingClientRect();
                          soltarColuna(col.key, e.clientX > rect.left + rect.width / 2);
                          setColunaArrastada(null);
                        }}
                        onDragEnd={() => setColunaArrastada(null)}
                        className="relative cursor-move px-3 py-2 text-left font-medium"
                        onContextMenu={'custom' in col ? (e) => { e.preventDefault(); setMenuColuna({ id: col.key, x: e.clientX, y: e.clientY }); } : undefined}
                        title={'custom' in col ? 'Arraste para reordenar; botão direito para renomear/remover' : 'Arraste para reordenar'}
                      >
                        {col.nome}
                        <AlcaColuna onMouseDown={iniciarRedimensionar(col.key, larguraColuna(col.key, col.largura))} />
                      </th>
                    ))}
                    <th className="px-3 py-2 text-left font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {linhasFiltradas.map((row) => {
                    const nivel = modoArvore ? nivelDe(row, mapaPorId) : 0;
                    const temFilhos = rows.some((r) => r.parentId === row.id);
                    return (
                    <tr
                      key={row.id}
                      onMouseDownCapture={(e) => { if (e.button === 2) { e.preventDefault(); e.stopPropagation(); } }}
                      onDragOver={(e) => marcarAlvoArrastoLinha(row.id, e)}
                      onDrop={(e) => {
                        if (!podeSoltarLinha(row.id)) return;
                        e.preventDefault();
                        const rect = e.currentTarget.getBoundingClientRect();
                        soltarLinha(row.id, e.clientY > rect.top + rect.height / 2);
                        setLinhaArrastada(null);
                        alvoArrastoLinhaRef.current = null;
                        setAlvoArrastoLinha(null);
                      }}
                      onDragEnd={() => { setLinhaArrastada(null); alvoArrastoLinhaRef.current = null; setAlvoArrastoLinha(null); }}
                      className={`border-b border-[#E5E7EB] last:border-b-0 ${linhaArrastada === row.id ? 'opacity-50' : ''} ${linhaArrastada && !podeSoltarLinha(row.id) ? 'cursor-not-allowed' : ''}`}
                      style={{ backgroundColor: row.corLinha, boxShadow: alvoArrastoLinha?.id === row.id ? `inset 0 ${alvoArrastoLinha.depois ? '-4px' : '4px'} #F05D28` : undefined }}
                      onContextMenuCapture={(e) => { e.preventDefault(); setMenuCor({ id: row.id, x: e.clientX, y: e.clientY, comHiperlink: false }); }}
                      title="Arraste para reordenar; botão direito para editar a linha"
                    >
                      {colunasVisiveis.map((col) => renderCelula(row, col.key, nivel, temFilhos))}
                      <td className="px-3 py-1 text-center">
                        {!bloqueado && (
                          <button
                            onClick={() => removerLinha(row.id)}
                            className="text-gray-400 hover:text-[#F05D28]"
                            title="Excluir"
                          >
                            🗑
                          </button>
                        )}
                      </td>
                    </tr>
                    );
                  })}
                  {linhasFiltradas.length === 0 && (
                    <tr>
                      <td colSpan={11 + doc.colunasCustom.length} className="px-3 py-4 text-center text-gray-400">
                        Nenhuma atividade para esse usuário.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
              </fieldset>
            </div>

            {!bloqueado && (
              <div className="border-t border-[#E5E7EB] bg-[#F9FAFB] px-3 py-1.5">
                <button
                  type="button"
                  onClick={adicionarLinha}
                  className="text-[12px] font-bold text-[#F05D28] hover:underline"
                >
                  + Linha
                </button>
              </div>
            )}
          </div>

      {menuCor && (
        <MenuFlutuante x={menuCor.x} y={menuCor.y} onFechar={() => setMenuCor(null)}>
          <div className="flex w-40 flex-col">
            <button
              type="button"
              onClick={() => inserirLinhaPerto(menuCor.id, 'above')}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[12px] font-medium text-[#374151] hover:bg-[#F3F4F6]"
            >
              <ArrowUp size={14} />
              Inserir linha acima
            </button>
            <button
              type="button"
              onClick={() => inserirLinhaPerto(menuCor.id, 'below')}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[12px] font-medium text-[#374151] hover:bg-[#F3F4F6]"
            >
              <ArrowDown size={14} />
              Inserir linha abaixo
            </button>
            <button
              type="button"
              onClick={() => { removerLinha(menuCor.id); setMenuCor(null); }}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[12px] font-medium text-[#DC2626] hover:bg-[#FEF2F2]"
            >
              <Trash2 size={14} />
              Excluir linha
            </button>
            {menuCor.comHiperlink && (
              <button
                type="button"
                onClick={() => { setDialogoLink({ rowId: menuCor.id }); setMenuCor(null); }}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[12px] font-medium text-[#374151] hover:bg-[#F3F4F6]"
              >
                <Link2 size={14} />
                Hiperlink
              </button>
            )}
            <div className="border-t border-[#F1F5F9] px-3 py-2">
              <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-[#94A3B8]">Cor da linha</p>
              <div className="flex flex-wrap gap-1">
                {PALETA_CELULA.map(([label, valor]) => (
                  <button
                    key={label}
                    type="button"
                    title={label}
                    onClick={() => pintarLinha(menuCor.id, valor)}
                    className={`h-6 w-6 rounded-md border border-[#E5E7EB] hover:ring-2 hover:ring-[#F05D28] ${rows.find((row) => row.id === menuCor.id)?.corLinha === valor ? 'ring-2 ring-[#F05D28]' : ''}`}
                    style={{ backgroundColor: valor || '#FFFFFF' }}
                  />
                ))}
              </div>
            </div>
          </div>
        </MenuFlutuante>
      )}

      {menuColuna && (
        <MenuFlutuante x={menuColuna.x} y={menuColuna.y} onFechar={() => setMenuColuna(null)}>
          <div className="flex w-40 flex-col">
            <button
              type="button"
              onClick={() => renomearColuna(menuColuna.id)}
              className="rounded-lg px-3 py-2 text-left text-[12px] font-medium text-[#374151] hover:bg-[#F3F4F6]"
            >
              Renomear coluna
            </button>
            <button
              type="button"
              onClick={() => removerColuna(menuColuna.id)}
              className="rounded-lg px-3 py-2 text-left text-[12px] font-medium text-[#DC2626] hover:bg-[#FEE2E2]"
            >
              Remover coluna
            </button>
          </div>
        </MenuFlutuante>
      )}

      {dialogoColuna && (
        <CampoDialog
          title={dialogoColuna.id === null ? 'Nova coluna' : 'Renomear coluna'}
          fields={[{ id: 'nome', label: 'Nome da coluna', valorInicial: dialogoColuna.nomeAtual }]}
          onConfirm={confirmarDialogoColuna}
          onCancel={() => setDialogoColuna(null)}
        />
      )}

      {dialogoLink && (
        <CampoDialog
          title="Inserir link"
          fields={[
            { id: 'url', label: 'Endereço do link (URL)', placeholder: 'https://...' },
            { id: 'label', label: 'Texto do link' },
          ]}
          onConfirm={confirmarDialogoLink}
          onCancel={() => setDialogoLink(null)}
        />
      )}
    </>
  );
}
