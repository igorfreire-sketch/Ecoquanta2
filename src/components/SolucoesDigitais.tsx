import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, ChevronRight, Globe, Indent, Link2, Lock, Outdent, X } from 'lucide-react';
import { isFirebaseConfigured, setFirebaseDocument } from '../lib/firebaseDb';
import SearchableSelect from './SearchableSelect';
import CampoDialog from './CampoDialog';
import Anotacoes, { extrairLinkDaCelula, novaNotaBase, REGEX_LINK_MARKDOWN, type AnnotationSheet } from './CoordenacaoEngenharia/Anotacoes';
import { buildActivitiesFromEap, type EngineeringActivity } from './Atividades';

export const CRONOGRAMAS_COLLECTION = 'cronogramas';
const DISCIPLINA_ALVO = 'bi - solucoes digitais';

// Paleta fixa p/ pintar linha (mesmo espirito do CORES_FUNDO da Anotacoes, sem acoplar aos dois arquivos).
const PALETA_CELULA: Array<[string, string]> = [
  ['Sem cor', ''],
  ['Amarelo', '#FEF9C3'],
  ['Verde', '#DCFCE7'],
  ['Azul', '#DBEAFE'],
  ['Vermelho', '#FEE2E2'],
  ['Laranja', '#FFE7D9'],
  ['Cinza', '#F3F4F6'],
];

const NOVA_NOTA_VALOR = '__nova__';

export interface CronoRow {
  id: string;
  seq: number;
  nome: string;
  predecessoraId: string;
  dataInicio: string;
  duracaoDias: number | null;
  dataFim: string;
  responsavelEmail: string;
  percentualConcluido: number | null;
  noteId: string;
  atividadeId?: string;
  ordem?: number;
  parentId?: string;
  colapsada?: boolean;
  corLinha?: string;
  // valores das colunas customizadas desse cronograma, chaveados por ColunaCustom.id
  custom?: Record<string, string>;
}

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
}

// Colunas fixas na ordem de renderizacao, com a largura padrao aproximada de como cada uma
// renderiza hoje (ID estreito, Atividade larga, Duracao/% estreitos etc.) — nao forca tudo pro
// mesmo tamanho como o BANCO_COL_WIDTH da nota faz.
const COLUNAS_FIXAS: Array<{ key: string; largura: number }> = [
  { key: 'id', largura: 60 },
  { key: 'nome', largura: 260 },
  { key: 'predecessora', largura: 200 },
  { key: 'inicio', largura: 130 },
  { key: 'duracao', largura: 100 },
  { key: 'fim', largura: 130 },
  { key: 'responsavel', largura: 160 },
  { key: 'percentual', largura: 90 },
  { key: 'nota', largura: 150 },
  { key: 'atividade', largura: 190 },
];
const LARGURA_COLUNA_CUSTOM_PADRAO = 160;
// "Detalhe" (a descricao longa que o seed do cronograma real usa) e tipicamente texto corrido -
// mesmo raciocinio de largura padrao das fixas, so por nome pq colunas customizadas nao tem chave fixa.
const LARGURA_COLUNA_DETALHE_PADRAO = 260;

interface SolucoesDigitaisProps {
  cronograma: CronogramaDoc;
  onVoltar: () => void;
  currentUser: { nome: string; email: string; role?: string; isAdmin?: boolean; disciplinas?: string[] };
  usuarios?: Array<{ nome: string; email: string; disciplinas?: string[] }>;
  notes?: AnnotationSheet[];
  onSaveNote?: (sheet: AnnotationSheet) => Promise<void>;
  onDeleteNote?: (id: string) => Promise<void>;
  preloadedData?: any;
}

function criarLinhaVazia(seq: number): CronoRow {
  return {
    id: crypto.randomUUID(),
    seq,
    nome: '',
    predecessoraId: '',
    dataInicio: '',
    duracaoDias: null,
    dataFim: '',
    responsavelEmail: '',
    percentualConcluido: null,
    noteId: '',
    atividadeId: '',
    ordem: 0,
    parentId: '',
    custom: {},
  };
}

// Ordem em arvore: agrupa por parentId preservando a ordem de insercao dentro de cada pai.
// ignorarColapso=true devolve a arvore inteira (usado p/ achar "linha anterior" na indentacao).
export function ordemArvore(rows: CronoRow[], ignorarColapso = false): CronoRow[] {
  const porPai = new Map<string, CronoRow[]>();
  rows.forEach((r) => {
    const chave = r.parentId || '';
    if (!porPai.has(chave)) porPai.set(chave, []);
    porPai.get(chave)!.push(r);
  });
  const resultado: CronoRow[] = [];
  function visitar(paiId: string) {
    for (const r of porPai.get(paiId) || []) {
      resultado.push(r);
      if (ignorarColapso || !r.colapsada) visitar(r.id);
    }
  }
  visitar('');
  return resultado;
}

// Irmao imediatamente anterior a `row` no MESMO nivel/pai atual (nao o irmao anterior mais fundo
// da arvore inteira) — e quem vira o novo pai ao indentar, pra 1.1/1.2/1.3 ficarem irmaos em vez
// de aninhar cada indentacao um nivel mais fundo que a anterior. Sem limite de profundidade: so ha
// um guard anti-ciclo de 30 saltos (nivelDe/subtreeUltimoId), nao um teto de niveis.
function irmaoAnterior(rows: CronoRow[], row: CronoRow): CronoRow | null {
  const irmaos = ordemArvore(rows, true).filter((r) => (r.parentId || '') === (row.parentId || ''));
  const idx = irmaos.findIndex((r) => r.id === row.id);
  return idx > 0 ? irmaos[idx - 1] : null;
}

// Ultimo id (em ordem de arvore) dentro da subarvore cuja raiz e raizId — usado pra saber onde
// reinserir uma linha no array apos reparenta-la, sem ela "sumir" longe da posicao esperada.
function subtreeUltimoId(flat: CronoRow[], raizId: string): string {
  const idx = flat.findIndex((r) => r.id === raizId);
  if (idx === -1) return raizId;
  const mapa = new Map(flat.map((r) => [r.id, r]));
  function eDescendente(r: CronoRow): boolean {
    let atual: CronoRow | undefined = r;
    let guard = 0;
    while (atual?.parentId && guard++ < 30) {
      if (atual.parentId === raizId) return true;
      atual = mapa.get(atual.parentId);
    }
    return false;
  }
  let fim = idx;
  for (let i = idx + 1; i < flat.length; i++) {
    if (eDescendente(flat[i])) fim = i; else break;
  }
  return flat[fim].id;
}

function reposicionarApos(rowsArr: CronoRow[], id: string, ancoraId: string): CronoRow[] {
  const item = rowsArr.find((r) => r.id === id);
  if (!item) return rowsArr;
  const semItem = rowsArr.filter((r) => r.id !== id);
  const idxAncora = semItem.findIndex((r) => r.id === ancoraId);
  const pos = idxAncora === -1 ? semItem.length : idxAncora + 1;
  return [...semItem.slice(0, pos), item, ...semItem.slice(pos)];
}

function nivelDe(row: CronoRow, mapa: Map<string, CronoRow>): number {
  let nivel = 0;
  let atual = row;
  let guard = 0;
  while (atual.parentId && guard++ < 30) {
    const pai = mapa.get(atual.parentId);
    if (!pai) break;
    nivel += 1;
    atual = pai;
  }
  return nivel;
}

// Codigo hierarquico do ID: raiz = posicao entre os irmaos ("1", "2"...), filho = codigo do pai +
// posicao entre os irmaos ("1.1", "1.2"...), neto = "1.1.1" e assim por diante. Sem teto de nivel.
export function calcularCodigos(rows: CronoRow[]): Map<string, string> {
  const porPai = new Map<string, CronoRow[]>();
  rows.forEach((r) => {
    const chave = r.parentId || '';
    if (!porPai.has(chave)) porPai.set(chave, []);
    porPai.get(chave)!.push(r);
  });
  const codigos = new Map<string, string>();
  function visitar(paiId: string, prefixo: string) {
    (porPai.get(paiId) || []).forEach((r, i) => {
      const codigo = prefixo ? `${prefixo}.${i + 1}` : `${i + 1}`;
      codigos.set(r.id, codigo);
      visitar(r.id, codigo);
    });
  }
  visitar('', '');
  return codigos;
}

function normalizar(valor: string) {
  return valor.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
}

function parseDataLocal(valor: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valor || '');
  if (!match) return null;
  const data = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(data.getTime()) ? null : data;
}

function formatarDataLocal(data: Date): string {
  const y = data.getFullYear();
  const m = String(data.getMonth() + 1).padStart(2, '0');
  const d = String(data.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// ponytail: dias corridos (calendario), sem considerar feriados/dias uteis
function diffDias(inicio: string, fim: string): number | null {
  const dIni = parseDataLocal(inicio);
  const dFim = parseDataLocal(fim);
  if (!dIni || !dFim) return null;
  return Math.round((dFim.getTime() - dIni.getTime()) / 86400000);
}

function addDias(inicio: string, dias: number): string {
  const dIni = parseDataLocal(inicio);
  if (!dIni || !Number.isFinite(dias)) return '';
  const resultado = new Date(dIni);
  resultado.setDate(resultado.getDate() + dias);
  return formatarDataLocal(resultado);
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
        className="fixed inset-0 z-40"
        onClick={onFechar}
        onContextMenu={(e) => { e.preventDefault(); onFechar(); }}
      />
      <div
        className="fixed z-50 rounded-lg border border-[#E5E7EB] bg-white p-1.5 shadow-lg"
        style={{ top: Math.min(y, window.innerHeight - 120), left: Math.min(x, window.innerWidth - 180) }}
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
      onMouseDown={onMouseDown}
      className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize hover:bg-[#F05D28]"
    />
  );
}

// Editor fullscreen (portal pro <body>), mesmo shell do editor de nota em Anotacoes.tsx
// (~linhas 1221-1350): header com titulo/pill/Fechar, corpo com titulo editavel + Publico +
// Salvar, e a tabela emoldurada como um "banco" (caixa arredondada, barra de ferramentas com
// + Coluna acima, rodape com + Linha abaixo — nada de dropdown de Configuração).
export default function SolucoesDigitais({
  cronograma,
  onVoltar,
  currentUser,
  usuarios = [],
  notes = [],
  onSaveNote,
  onDeleteNote,
  preloadedData,
}: SolucoesDigitaisProps) {
  const [doc, setDoc] = useState<CronogramaDoc>(cronograma);
  const [sujo, setSujo] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erroSalvar, setErroSalvar] = useState<string | null>(null);
  // Filtro por usuário: so lista quem de fato tem linha no cronograma (evita opcao que sempre da zero).
  const [filtroResponsavel, setFiltroResponsavel] = useState('');
  // Nota nova pendente de vinculo: abre o editor controlado da Anotacoes e, ao salvar, liga o noteId na linha.
  const [sheetAberta, setSheetAberta] = useState<AnnotationSheet | null>(null);
  const [linhaDaNotaEmCriacao, setLinhaDaNotaEmCriacao] = useState<string | null>(null);
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
  // Arrasto de redimensionar coluna em andamento — mesma logica do banco da nota (Anotacoes.tsx
  // ~386-388/505-534), so pra coluna (aqui nao existe redimensionar linha).
  const redimensionarRef = useRef<{ key: string; inicioPx: number; tamanhoInicial: number } | null>(null);

  const rows = doc.rows;

  // Cronograma novo (ou esvaziado) abre com 1 linha ja pronta pra digitar — sem precisar clicar
  // em "+ Linha" primeiro. So roda uma vez, na abertura.
  useEffect(() => {
    if (doc.rows.length === 0) {
      setDoc((prev) => ({ ...prev, rows: [criarLinhaVazia(1)] }));
      setSujo(true);
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

  const activities: EngineeringActivity[] = buildActivitiesFromEap(preloadedData, currentUser);

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

  // Salvar e explicito (botao), nao autosave: toda edicao so muda o estado local (`atualizarDoc`)
  // e marca `sujo`; so "Salvar" grava no Firestore e limpa o `sujo`.
  function atualizarDoc(patch: Partial<CronogramaDoc>) {
    setDoc((prev) => ({ ...prev, ...patch, updatedAt: new Date().toISOString() }));
    setSujo(true);
    setErroSalvar(null); // edicao nova: o erro do save anterior nao se aplica mais
  }

  function atualizarLinha(id: string, patch: Partial<CronoRow>) {
    atualizarDoc({ rows: rows.map((r) => (r.id === id ? { ...r, ...patch } : r)) });
  }

  async function handleSalvar() {
    if (!isFirebaseConfigured()) return;
    setSalvando(true);
    try {
      await setFirebaseDocument(CRONOGRAMAS_COLLECTION, doc.id, doc);
      setSujo(false);
      setErroSalvar(null);
    } catch (err) {
      console.error('Erro ao salvar cronograma:', err);
      // code 'permission-denied' = regra do Firestore ausente/nao publicada (armadilha conhecida
      // deste projeto) — aponta a causa real em vez de deixar o botao parecer quebrado.
      setErroSalvar(
        (err as { code?: string })?.code === 'permission-denied'
          ? 'Não foi possível salvar: a regra do Firestore para a coleção "cronogramas" ainda não foi publicada no Console.'
          : `Não foi possível salvar: ${(err as Error)?.message || 'erro desconhecido'}.`
      );
      // mantem sujo=true: o aviso de "nao salvo" ao fechar continua valendo
    } finally {
      setSalvando(false);
    }
  }

  // Guarda contra perda de dados: sem autosave, fechar com edicao pendente perderia o
  // cronograma inteiro sem aviso — nao e opcional, fica mesmo sendo lazy no resto.
  function handleFechar() {
    if (sujo && !window.confirm('Este cronograma tem alterações não salvas. Fechar mesmo assim e perder essas alterações?')) return;
    onVoltar();
  }

  function adicionarLinha() {
    const proximoSeq = rows.reduce((max, r) => Math.max(max, r.seq || 0), 0) + 1;
    atualizarDoc({ rows: [...rows, { ...criarLinhaVazia(proximoSeq), ordem: rows.length }] });
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
    atualizarDoc({ rows: novo.map((r, i) => ({ ...r, ordem: i })) });
  }

  // Direita: vira filha do irmao imediatamente anterior NO MESMO NIVEL atual — assim varias
  // indentacoes seguidas viram irmas (1.1, 1.2, 1.3...) em vez de aninhar cada uma um nivel mais
  // fundo que a anterior. So aninha mais fundo se vc indentar de novo um item que ja e filho.
  function moverDireita(id: string) {
    const row = rows.find((r) => r.id === id);
    if (!row) return;
    const anterior = irmaoAnterior(rows, row);
    if (!anterior) return; // primeiro do seu nivel, nao ha quem virar pai
    const ancoraId = subtreeUltimoId(ordemArvore(rows, true), anterior.id);
    const patched = rows.map((r) => (r.id === id ? { ...r, parentId: anterior.id } : r));
    reordenar(ancoraId === id ? patched : reposicionarApos(patched, id, ancoraId));
  }

  // Esquerda: promove pra irma do proprio pai atual (sobe um nivel), reaparecendo logo apos toda
  // a subarvore do ex-pai (nao deixa a linha "sumir" longe de onde estava).
  function moverEsquerda(id: string) {
    const row = rows.find((r) => r.id === id);
    if (!row || !row.parentId) return;
    const pai = rows.find((r) => r.id === row.parentId);
    const ancoraId = subtreeUltimoId(ordemArvore(rows, true), row.parentId);
    const patched = rows.map((r) => (r.id === id ? { ...r, parentId: pai?.parentId || '' } : r));
    reordenar(ancoraId === id ? patched : reposicionarApos(patched, id, ancoraId));
  }

  function onEscolherNota(rowId: string, valor: string) {
    if (valor === NOVA_NOTA_VALOR) {
      if (!onSaveNote) return; // sem callback de salvar, nao ha como criar nota daqui
      setLinhaDaNotaEmCriacao(rowId);
      setSheetAberta(novaNotaBase(currentUser));
      return;
    }
    atualizarLinha(rowId, { noteId: valor });
  }

  // A NOTA vinculada e uma entidade a parte (colecao `notes`) — continua salvando na hora, como
  // sempre fez; so o CRONOGRAMA em si (este doc) passou a exigir o botao Salvar.
  async function salvarNotaCriada(sheet: AnnotationSheet) {
    await onSaveNote?.(sheet);
    if (linhaDaNotaEmCriacao) {
      atualizarLinha(linhaDaNotaEmCriacao, { noteId: sheet.id });
      setLinhaDaNotaEmCriacao(null);
    }
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
    const row = rows.find((r) => r.id === id);
    if (!row) return;
    // ponytail: validacao de ciclo de 1 nivel apenas (A->B e B->A); ciclos maiores nao sao detectados
    if (predecessoraId) {
      const predecessora = rows.find((r) => r.id === predecessoraId);
      if (predecessoraId === id) return;
      if (predecessora && predecessora.predecessoraId === id) return;
    }
    const predecessora = rows.find((r) => r.id === predecessoraId);
    const sugerirInicio = predecessora?.dataFim && !row.dataInicio ? predecessora.dataFim : row.dataInicio;
    atualizarLinha(id, { predecessoraId, dataInicio: sugerirInicio });
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
        atualizarDoc({ colunasCustom: [...doc.colunasCustom, coluna] });
      } else {
        atualizarDoc({ colunasCustom: doc.colunasCustom.map((c) => (c.id === dialogoColuna.id ? { ...c, nome } : c)) });
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
    atualizarDoc({
      colunasCustom: doc.colunasCustom.filter((c) => c.id !== id),
      rows: rows.map((r) => {
        if (!r.custom || !(id in r.custom)) return r;
        const custom = { ...r.custom };
        delete custom[id];
        return { ...r, custom };
      }),
    });
  }

  function editarCelulaCustom(rowId: string, colId: string, valor: string) {
    const row = rows.find((r) => r.id === rowId);
    if (!row) return;
    atualizarLinha(rowId, { custom: { ...(row.custom || {}), [colId]: valor } });
  }

  const autorInfo = [
    doc.autorNome ? `Criado por ${doc.autorNome}` : null,
    formatDateBRLocal(doc.createdAt) ? `em ${formatDateBRLocal(doc.createdAt)}` : null,
  ].filter(Boolean).join(' ');

  return createPortal(
    <div className="fixed inset-0 z-[200] flex flex-col overflow-hidden bg-white">
      <div className="flex items-center justify-between gap-4 px-5 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <h2 className="truncate text-[15px] font-black text-[#2D2D2D]">{doc.titulo || 'Novo cronograma'}</h2>
          {autorInfo && <span className="whitespace-nowrap text-[11px] text-[#94A3B8]">{autorInfo}</span>}
          {doc.publica === false && (
            <span className="inline-flex items-center gap-1 rounded-full border border-[#FED7AA] bg-[#FFF7ED] px-2.5 py-1 text-[11px] font-bold text-[#B45309]">
              <Lock size={11} />
              Particular
            </span>
          )}
          {sujo && (
            <span className="whitespace-nowrap text-[11px] font-bold text-[#B45309]">Alterações não salvas</span>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            type="button"
            onClick={handleFechar}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#E5E7EB] bg-white px-3 text-[12px] font-bold text-[#64748B] transition-colors hover:border-[#F7C7B7] hover:bg-[#F9FAFB] hover:text-[#2D2D2D]"
          >
            <X size={14} />
            Fechar
          </button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div className="min-w-0 flex-1 overflow-auto p-5">
          <div className="flex flex-wrap items-center gap-3">
            <input
              value={doc.titulo}
              onChange={(e) => atualizarDoc({ titulo: e.target.value })}
              placeholder="Nome do cronograma"
              className="h-11 min-w-[220px] flex-1 rounded-xl border border-[#E5E7EB] bg-white px-3 text-[14px] font-bold text-[#2D2D2D] outline-none focus:border-[#F05D28]"
            />
            <label className="flex h-11 items-center gap-2 rounded-xl border border-[#E5E7EB] bg-white px-3 text-[13px] font-medium text-[#2D2D2D] cursor-pointer">
              <input
                type="checkbox"
                checked={doc.publica !== false}
                onChange={(e) => atualizarDoc({ publica: e.target.checked })}
                className="h-4 w-4 accent-[#F05D28] cursor-pointer"
              />
              Público
            </label>
            <button
              type="button"
              onClick={() => void handleSalvar()}
              disabled={salvando}
              className="h-11 rounded-xl bg-[#F05D28] px-5 text-[13px] font-bold text-white transition-colors hover:bg-[#D94E1F] disabled:opacity-60"
            >
              {salvando ? 'Salvando...' : 'Salvar'}
            </button>
            {erroSalvar && (
              <span className="inline-flex items-center gap-1 rounded-full border border-[#FED7AA] bg-[#FFF7ED] px-2.5 py-1 text-[11px] font-bold text-[#B45309]">
                {erroSalvar}
              </span>
            )}
          </div>

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
              <button
                type="button"
                onClick={adicionarColuna}
                className="text-[12px] font-bold text-[#F05D28] hover:underline"
              >
                + Coluna
              </button>
            </div>

            <div className="overflow-auto">
              {/* table-fixed + colgroup: sem isso o navegador ignora as larguras arrastadas (mesmo aviso do banco da nota). */}
              <table className="min-w-full table-fixed text-sm text-[#2D2D2D]">
                <colgroup>
                  {COLUNAS_FIXAS.map((col) => (
                    <col key={col.key} style={{ width: `${larguraColuna(col.key, col.largura)}px` }} />
                  ))}
                  {doc.colunasCustom.map((col) => (
                    <col
                      key={col.id}
                      style={{ width: `${larguraColuna(col.id, normalizar(col.nome) === 'detalhe' ? LARGURA_COLUNA_DETALHE_PADRAO : LARGURA_COLUNA_CUSTOM_PADRAO)}px` }}
                    />
                  ))}
                  <col style={{ width: '40px' }} />
                </colgroup>
                <thead className="bg-gray-50 border-b border-[#E5E7EB]">
                  <tr>
                    <th className="relative px-3 py-2 text-left font-medium">
                      ID
                      <AlcaColuna onMouseDown={iniciarRedimensionar('id', larguraColuna('id', 60))} />
                    </th>
                    <th className="relative px-3 py-2 text-left font-medium">
                      Atividade
                      <AlcaColuna onMouseDown={iniciarRedimensionar('nome', larguraColuna('nome', 260))} />
                    </th>
                    <th className="relative px-3 py-2 text-left font-medium">
                      Predecessora
                      <AlcaColuna onMouseDown={iniciarRedimensionar('predecessora', larguraColuna('predecessora', 200))} />
                    </th>
                    <th className="relative px-3 py-2 text-left font-medium">
                      Início
                      <AlcaColuna onMouseDown={iniciarRedimensionar('inicio', larguraColuna('inicio', 130))} />
                    </th>
                    <th className="relative px-3 py-2 text-left font-medium">
                      Duração (dias)
                      <AlcaColuna onMouseDown={iniciarRedimensionar('duracao', larguraColuna('duracao', 100))} />
                    </th>
                    <th className="relative px-3 py-2 text-left font-medium">
                      Fim
                      <AlcaColuna onMouseDown={iniciarRedimensionar('fim', larguraColuna('fim', 130))} />
                    </th>
                    <th className="relative px-3 py-2 text-left font-medium">
                      Responsável
                      <AlcaColuna onMouseDown={iniciarRedimensionar('responsavel', larguraColuna('responsavel', 160))} />
                    </th>
                    <th className="relative px-3 py-2 text-left font-medium">
                      % Concluído
                      <AlcaColuna onMouseDown={iniciarRedimensionar('percentual', larguraColuna('percentual', 90))} />
                    </th>
                    <th className="relative px-3 py-2 text-left font-medium">
                      Nota
                      <AlcaColuna onMouseDown={iniciarRedimensionar('nota', larguraColuna('nota', 150))} />
                    </th>
                    <th className="relative px-3 py-2 text-left font-medium">
                      Atividade agenda
                      <AlcaColuna onMouseDown={iniciarRedimensionar('atividade', larguraColuna('atividade', 190))} />
                    </th>
                    {doc.colunasCustom.map((col) => (
                      <th
                        key={col.id}
                        className="relative px-3 py-2 text-left font-medium cursor-context-menu"
                        onContextMenu={(e) => { e.preventDefault(); setMenuColuna({ id: col.id, x: e.clientX, y: e.clientY }); }}
                        title="Botão direito para renomear/remover"
                      >
                        {col.nome}
                        <AlcaColuna onMouseDown={iniciarRedimensionar(col.id, larguraColuna(col.id, normalizar(col.nome) === 'detalhe' ? LARGURA_COLUNA_DETALHE_PADRAO : LARGURA_COLUNA_CUSTOM_PADRAO))} />
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
                      className="border-b border-[#E5E7EB] last:border-b-0"
                      style={{ backgroundColor: row.corLinha }}
                      onContextMenu={(e) => { e.preventDefault(); setMenuCor({ id: row.id, x: e.clientX, y: e.clientY, comHiperlink: false }); }}
                      title="Botão direito para pintar a linha"
                    >
                      <td className="px-3 py-1 text-gray-500">#{codigos.get(row.id)}</td>
                      <td
                        className="px-3 py-1"
                        onContextMenu={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setMenuCor({ id: row.id, x: e.clientX, y: e.clientY, comHiperlink: true });
                        }}
                        title="Botão direito para hiperlink ou cor"
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
                          {(() => {
                            // Diferente da celula de nota (que costuma SER so o link): o nome da
                            // atividade e o conteudo principal da linha, o link e so um extra nele.
                            // Sem foco, troca apenas o trecho "[rotulo](url)" pelo rotulo azul
                            // sublinhado, mantendo o texto ao redor visivel — nunca esconde o nome
                            // inteiro atras do rotulo do link (URL solta sem colchetes fica como
                            // esta hoje, sem split, pra nao complicar o parse por pouco ganho).
                            const match = linhaNomeFocada !== row.id ? REGEX_LINK_MARKDOWN.exec(row.nome) : null;
                            if (match) {
                              const antes = row.nome.slice(0, match.index);
                              const depois = row.nome.slice(match.index + match[0].length);
                              return (
                                <div
                                  onClick={() => setLinhaNomeFocada(row.id)}
                                  className="w-full flex-1 cursor-text truncate rounded border border-[#E5E7EB] px-2 py-1"
                                >
                                  {antes}
                                  <span className="text-[#2563EB] underline">{match[1]}</span>
                                  {depois}
                                </div>
                              );
                            }
                            return (
                              <input
                                type="text"
                                value={row.nome}
                                onChange={(e) => atualizarLinha(row.id, { nome: e.target.value })}
                                onFocus={() => setLinhaNomeFocada(row.id)}
                                onBlur={() => setLinhaNomeFocada((prev) => (prev === row.id ? null : prev))}
                                className="w-full flex-1 border border-[#E5E7EB] rounded px-2 py-1"
                                placeholder="Nome da atividade"
                              />
                            );
                          })()}
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
                      <td className="px-3 py-1">
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
                      <td className="px-3 py-1">
                        <input
                          type="date"
                          value={row.dataInicio}
                          onChange={(e) => onEditarInicio(row.id, e.target.value)}
                          className="w-full border border-[#E5E7EB] rounded px-2 py-1"
                        />
                      </td>
                      <td className="px-3 py-1">
                        <input
                          type="number"
                          value={row.duracaoDias ?? ''}
                          onChange={(e) => onEditarDuracao(row.id, e.target.value)}
                          className="w-24 border border-[#E5E7EB] rounded px-2 py-1"
                        />
                      </td>
                      <td className="px-3 py-1">
                        <input
                          type="date"
                          value={row.dataFim}
                          onChange={(e) => onEditarFim(row.id, e.target.value)}
                          className="w-full border border-[#E5E7EB] rounded px-2 py-1"
                        />
                      </td>
                      <td className="px-3 py-1">
                        <select
                          value={row.responsavelEmail}
                          onChange={(e) => atualizarLinha(row.id, { responsavelEmail: e.target.value })}
                          className="w-full border border-[#E5E7EB] rounded px-2 py-1"
                        >
                          <option value="">Sem responsável</option>
                          {responsaveis.map((u) => (
                            <option key={u.email} value={u.email}>{u.nome}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-1">
                        <input
                          type="number"
                          min={0}
                          max={100}
                          value={row.percentualConcluido ?? ''}
                          onChange={(e) => atualizarLinha(row.id, { percentualConcluido: e.target.value === '' ? null : Number(e.target.value) })}
                          className="w-20 border border-[#E5E7EB] rounded px-2 py-1"
                          placeholder="%"
                        />
                      </td>
                      <td className="px-3 py-1">
                        <SearchableSelect
                          value={row.noteId}
                          onChange={(e) => onEscolherNota(row.id, e.target.value)}
                          className="w-full border border-[#E5E7EB] rounded px-2 py-1 bg-white"
                          searchPlaceholder="Sem nota"
                        >
                          <option value="">Sem nota</option>
                          {onSaveNote && <option value={NOVA_NOTA_VALOR}>+ Criar nova nota</option>}
                          {notes.map((n) => (
                            <option key={n.id} value={n.id}>{n.titulo || '(sem título)'}</option>
                          ))}
                        </SearchableSelect>
                      </td>
                      <td className="px-3 py-1">
                        <SearchableSelect
                          value={row.atividadeId || ''}
                          onChange={(e) => atualizarLinha(row.id, { atividadeId: e.target.value })}
                          className="w-full border border-[#E5E7EB] rounded px-2 py-1 bg-white"
                          searchPlaceholder="Sem vínculo"
                        >
                          <option value="">Sem vínculo</option>
                          {activities.map((a) => (
                            <option key={a.id} value={a.id}>{a.osCodigo} - {a.atividade || a.itemNome || '(sem nome)'}</option>
                          ))}
                        </SearchableSelect>
                      </td>
                      {doc.colunasCustom.map((col) => (
                        <td key={col.id} className="px-3 py-1">
                          <input
                            type="text"
                            value={row.custom?.[col.id] || ''}
                            onChange={(e) => editarCelulaCustom(row.id, col.id, e.target.value)}
                            className="w-full border border-[#E5E7EB] rounded px-2 py-1"
                          />
                        </td>
                      ))}
                      <td className="px-3 py-1 text-center">
                        <button
                          onClick={() => removerLinha(row.id)}
                          className="text-gray-400 hover:text-[#F05D28]"
                          title="Excluir"
                        >
                          🗑
                        </button>
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
            </div>

            <div className="border-t border-[#E5E7EB] bg-[#F9FAFB] px-3 py-1.5">
              <button
                type="button"
                onClick={adicionarLinha}
                className="text-[12px] font-bold text-[#F05D28] hover:underline"
              >
                + Linha
              </button>
            </div>
          </div>
        </div>
      </div>

      {menuCor && (
        <MenuFlutuante x={menuCor.x} y={menuCor.y} onFechar={() => setMenuCor(null)}>
          <div className="flex w-40 flex-col">
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
            <div className={`flex flex-wrap gap-1 px-1 py-1.5 ${menuCor.comHiperlink ? 'border-t border-[#F1F5F9]' : ''}`}>
              {PALETA_CELULA.map(([label, valor]) => (
                <button
                  key={label}
                  type="button"
                  title={label}
                  onClick={() => pintarLinha(menuCor.id, valor)}
                  className="h-6 w-6 rounded-full border border-[#D1D5DB]"
                  style={{ backgroundColor: valor || '#fff' }}
                />
              ))}
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

      {sheetAberta && (
        <Anotacoes
          filter={{ type: 'all' }}
          sheets={notes}
          osOptions={[]}
          disciplinaOptions={[]}
          currentUser={currentUser}
          onSave={salvarNotaCriada}
          onDelete={async (id) => { await onDeleteNote?.(id); }}
          controlledSheet={sheetAberta}
          onCloseControlled={() => { setSheetAberta(null); setLinhaDaNotaEmCriacao(null); }}
        />
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
    </div>,
    document.body,
  );
}
