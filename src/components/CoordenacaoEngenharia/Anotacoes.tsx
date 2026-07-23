import React from 'react';
import { createPortal } from 'react-dom';
import { AlignCenter, AlignLeft, AlignRight, Brush, Check, FileSpreadsheet, FileText, Globe, Link2, ListChecks, Lock, Merge, MoreVertical, Scaling, Settings, Split, Trash2, X } from 'lucide-react';
import SearchableSelect from '../SearchableSelect';
import { getDisciplineDisplayName, getDisciplineIconInfo, type EngineeringActivity } from '../Atividades';
import { disciplineMatchesSector, getSectorOptions } from '../../lib/disciplineCatalog';
import { exportNoteToCsv, exportNoteToPdf, exportNotesToMarkdown } from '../../lib/noteExport';
import { canDeleteNote, canEditNote } from '../../lib/firebaseDb';
import {
  alturaParaLinhas, BANCO_COL_WIDTH, BANCO_ROW_HEIGHT, cellCss, cellKey, fonteCss, isCovered,
  LARGURA_QUEBRA_PX, mergeAt, mergeIntersects, PADDING_CELULA_X, quebrarTexto, remapMerges,
  remapStyles, spliceSizes, type BancoMerge, type CellStyle,
} from '../../lib/bancoGrid';
import { aquecerCorretor, sugerirCorrecoes, trocarPalavra, type SugestaoOrtografica } from '../../lib/spellcheck';
import CronogramaResumo from './CronogramaResumo';
import MindMap from './MindMap';

export interface AnnotationBanco {
  id: string;
  colCount: number;
  rows: string[][];
  // Campos abaixo sao opcionais: bancos salvos antes da formatacao nao os tem.
  styles?: Record<string, CellStyle>;
  colWidths?: number[];
  rowHeights?: number[];
  merges?: BancoMerge[];
}

export interface AnnotationTextBlock {
  id: string;
  texto: string;
}

export interface AnnotationChecklistItem {
  id: string;
  texto: string;
  feito: boolean;
}

export interface AnnotationChecklist {
  id: string;
  itens: AnnotationChecklistItem[];
}

export interface AnnotationSheet {
  id: string;
  disciplina: string;
  titulo: string;
  osCodigo?: string;
  // Nota de OS marcada em varias disciplinas (ver toggleDisciplina/markAllDisciplinas).
  // Ausente ou vazio = usa so o campo disciplina (comportamento antigo).
  disciplinas?: string[];
  bancos?: AnnotationBanco[];
  textos?: AnnotationTextBlock[];
  checklists?: AnnotationChecklist[];
  updatedAt: string;
  // Campos abaixo podem faltar em anotacoes salvas antes desta feature.
  // publica ausente = tratado como publica (nao muda a visibilidade de notas antigas).
  publica?: boolean;
  criadoEm?: string;
  autorNome?: string;
  autorEmail?: string;
  linkedNoteIds?: string[];
  // Emails de usuarios marcados na nota - o card fica alaranjado pra eles (ver isMarcadoPara).
  marcadosUsuarios?: string[];
  // Legado: antes de suportar varios blocos de notas, o texto livre unico ficava aqui. Migrado por getSheetTextos.
  texto?: string;
  // Legado: antes de suportar varios bancos, a tabela unica ficava aqui. Migrada por getSheetBancos.
  colCount?: number;
  rows?: string[][];
}

// Notas antigas guardavam uma unica tabela em colCount/rows; migra pra lista de bancos sob demanda.
export function getSheetBancos(sheet: AnnotationSheet): AnnotationBanco[] {
  if (sheet.bancos && sheet.bancos.length > 0) return sheet.bancos;
  if (sheet.colCount && sheet.colCount > 0 && sheet.rows) return [{ id: 'legacy', colCount: sheet.colCount, rows: sheet.rows }];
  return [];
}

// Notas antigas guardavam um unico bloco de texto livre em texto; migra pra lista de blocos sob demanda.
export function getSheetTextos(sheet: AnnotationSheet): AnnotationTextBlock[] {
  if (sheet.textos && sheet.textos.length > 0) return sheet.textos;
  if (sheet.texto && sheet.texto.trim()) return [{ id: 'legacy', texto: sheet.texto }];
  return [];
}

// Disciplinas de uma nota, considerando o campo multiplo novo com fallback pro singular antigo.
export function getSheetDisciplinas(sheet: AnnotationSheet): string[] {
  if (sheet.disciplinas && sheet.disciplinas.length > 0) return sheet.disciplinas;
  return sheet.disciplina ? [sheet.disciplina] : [];
}

type AnotacoesFilter = { type: 'disciplina'; value: string } | { type: 'os'; value: string } | { type: 'all' };

interface AnotacoesProps {
  filter: AnotacoesFilter;
  sheets: AnnotationSheet[];
  osOptions: Array<{ codigo: string; nome: string; contratoCodigo?: string }>;
  disciplinaOptions: string[];
  // Pre-filtro das OS por contrato no editor.
  contractOptions?: Array<{ codigo: string; nome: string }>;
  currentUser: { nome: string; email: string; role?: string; isAdmin?: boolean };
  activities?: EngineeringActivity[];
  // Lista de usuarios do sistema pra marcar numa nota (ver Vincular Usuarios).
  usuarios?: Array<{ nome: string; email: string }>;
  onSave: (sheet: AnnotationSheet) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  // Usados quando a nota e aberta de fora do fluxo normal (ex: clique num no do Mapa Mental).
  controlledSheet?: AnnotationSheet | null;
  onCloseControlled?: () => void;
}

type ContextMenuState = { bancoIndex: number; row: number; col: number; x: number; y: number } | null;
type CellSelection = { bancoIndex: number; r1: number; c1: number; r2: number; c2: number };

// Sentinela do filtro de autor: nao colide com nenhum email real.
const AUTOR_EU = '__eu__';

const FONTES = ['Montserrat', 'Arial', 'Times New Roman', 'Courier New', 'Georgia', 'Verdana'];
const TAMANHOS = [10, 11, 12, 13, 14, 16, 18, 20, 24];
const CORES_FUNDO: Array<[string, string]> = [
  ['Sem cor', ''],
  ['Azul', '#DBEAFE'],
  ['Vermelho', '#FEE2E2'],
  ['Verde', '#DCFCE7'],
  ['Amarelo', '#FEF9C3'],
  ['Laranja', '#FFE7D9'],
  ['Cinza', '#F3F4F6'],
];
const CORES_TEXTO: Array<[string, string]> = [
  ['Padrão', ''],
  ['Azul', '#2563EB'],
  ['Vermelho', '#DC2626'],
  ['Verde', '#16A34A'],
  ['Laranja', '#F05D28'],
  ['Cinza', '#64748B'],
  ['Preto', '#111827'],
];

function createEmptyRows(colCount: number, rowCount: number): string[][] {
  return Array.from({ length: rowCount }, () => Array.from({ length: colCount }, () => ''));
}

export function createBanco(colCount = 3, rowCount = 3): AnnotationBanco {
  return { id: makeId('banco'), colCount, rows: createEmptyRows(colCount, rowCount) };
}

// Nota nova ja nasce com um banco 5x3 (largo, pra ocupar a faixa lateral) e um bloco de notas.
export function novaNotaBase(autor: { nome: string; email: string }): AnnotationSheet {
  return {
    id: makeId('note'),
    disciplina: '',
    titulo: '',
    bancos: [createBanco(5, 3)],
    textos: [{ id: makeId('nota'), texto: '' }],
    checklists: [],
    updatedAt: new Date().toISOString(),
    criadoEm: new Date().toISOString(),
    autorNome: autor.nome,
    autorEmail: autor.email,
    publica: true,
  };
}

// Copia de uma nota existente: mesmo conteudo, dono e vinculos novos.
export function copiarNota(origem: AnnotationSheet, autor: { nome: string; email: string }): AnnotationSheet {
  return {
    ...origem,
    id: makeId('note'),
    titulo: `${origem.titulo || 'Sem título'} (cópia)`,
    bancos: getSheetBancos(origem).map((banco) => ({
      ...banco,
      id: makeId('banco'),
      rows: banco.rows.map((row) => [...row]),
      styles: banco.styles ? { ...banco.styles } : undefined,
      colWidths: banco.colWidths ? [...banco.colWidths] : undefined,
      rowHeights: banco.rowHeights ? [...banco.rowHeights] : undefined,
      merges: banco.merges ? banco.merges.map((item) => ({ ...item })) : undefined,
    })),
    textos: getSheetTextos(origem).map((bloco) => ({ ...bloco, id: makeId('nota') })),
    checklists: (origem.checklists || []).map((lista) => ({
      id: makeId('chk'),
      itens: lista.itens.map((item) => ({ ...item, id: makeId('chkitem') })),
    })),
    linkedNoteIds: [],
    marcadosUsuarios: [],
    updatedAt: new Date().toISOString(),
    criadoEm: new Date().toISOString(),
    autorNome: autor.nome,
    autorEmail: autor.email,
  };
}

// Campos de contrato/OS/disciplina do editor: mesmo visual dos selects do resto do site.
const campoClass = 'h-11 w-[240px] rounded-xl border border-[#E5E7EB] bg-white px-3 text-[13px] font-medium text-[#2D2D2D] outline-none focus:border-[#F05D28]';

function formatOsLabel(os: { codigo: string; nome: string }) {
  return `${os.codigo} - ${os.nome}`;
}

function makeId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function formatDateBR(value?: string) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('pt-BR');
}

function normalizeText(value: string) {
  return value.normalize('NFD').replace(new RegExp('[\\u0300-\\u036f]', 'g'), '').trim().toLowerCase();
}

export default function Anotacoes({
  filter, sheets, osOptions, disciplinaOptions, contractOptions = [], currentUser, activities = [], usuarios = [], onSave, onDelete, controlledSheet, onCloseControlled,
}: AnotacoesProps) {
  const normalizeForEditing = (sheet: AnnotationSheet): AnnotationSheet => ({ ...sheet, bancos: getSheetBancos(sheet), textos: getSheetTextos(sheet) });
  const [editing, setEditing] = React.useState<AnnotationSheet | null>(() => (controlledSheet ? normalizeForEditing(controlledSheet) : null));
  const [contextMenu, setContextMenu] = React.useState<ContextMenuState>(null);
  const [sugestoesOrtografia, setSugestoesOrtografia] = React.useState<SugestaoOrtografica[]>([]);
  const [saving, setSaving] = React.useState(false);
  const [configOpen, setConfigOpen] = React.useState(false);
  // Selecao retangular de celulas (clicar e arrastar). Base do menu de formatacao,
  // da limpeza em massa, da mesclagem e do pincel.
  const [selecao, setSelecao] = React.useState<CellSelection | null>(null);
  const arrastandoRef = React.useRef(false);
  // Pincel de formatacao: guarda o estilo copiado; null = pincel desligado.
  const [pincel, setPincel] = React.useState<CellStyle | null>(null);
  const pincelRef = React.useRef<CellStyle | null>(null);
  // Modo Dim: proxima celula clicada se ajusta ao texto (quebrando a ~3cm).
  const [dimAtivo, setDimAtivo] = React.useState(false);
  const dimRef = React.useRef(false);
  // Canvas so pra medir texto - nunca vai ao DOM.
  const medidorRef = React.useRef<CanvasRenderingContext2D | null>(null);
  const redimensionarRef = React.useRef<
    { tipo: 'col' | 'row'; bancoIndex: number; indice: number; inicioPx: number; tamanhoInicial: number } | null
  >(null);
  const [linkPickerOpen, setLinkPickerOpen] = React.useState(false);
  const [linkSearch, setLinkSearch] = React.useState('');
  const [userPickerOpen, setUserPickerOpen] = React.useState(false);
  const [userSearch, setUserSearch] = React.useState('');
  const [openCardMenuId, setOpenCardMenuId] = React.useState<string | null>(null);
  // Aba do painel direito do editor. null = segue a primeira disponivel (OS > Disciplina > Mapa).
  const [sidebarTab, setSidebarTab] = React.useState<'os' | 'disciplina' | 'mapa' | null>(null);
  const [contratoFiltro, setContratoFiltro] = React.useState('');
  // Filtro da lista de notas (Autor > Contrato > OS > Disciplina), independente do filtro do editor.
  const [listaAutor, setListaAutor] = React.useState('');
  const [listaContrato, setListaContrato] = React.useState('');
  const [listaOs, setListaOs] = React.useState('');
  const [listaDisciplina, setListaDisciplina] = React.useState('');
  // Menu do card em posicao FIXED (calculada do botao) para nao ser recortado pelo overflow-hidden do card.
  const [cardMenuPos, setCardMenuPos] = React.useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const textoRefs = React.useRef<Record<string, HTMLTextAreaElement | null>>({});

  // Fecha o menu do card ao rolar, redimensionar ou apertar Escape (menu fixed nao acompanha o scroll do card).
  React.useEffect(() => {
    if (!openCardMenuId) return;
    const close = () => setOpenCardMenuId(null);
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
      window.removeEventListener('keydown', onKey);
    };
  }, [openCardMenuId]);

  React.useEffect(() => {
    if (controlledSheet) setEditing(normalizeForEditing(controlledSheet));
  }, [controlledSheet]);

  // Fim do arrasto de selecao e do arrasto de redimensionamento acontecem fora da celula:
  // o mouse pode sair da tabela antes de soltar, entao o listener e na janela.
  React.useEffect(() => {
    const onMove = (event: MouseEvent) => {
      const alvo = redimensionarRef.current;
      if (!alvo) return;
      const delta = (alvo.tipo === 'col' ? event.clientX : event.clientY) - alvo.inicioPx;
      const minimo = alvo.tipo === 'col' ? 60 : 24;
      const tamanho = Math.max(minimo, alvo.tamanhoInicial + delta);
      updateBanco(alvo.bancoIndex, (banco) => (alvo.tipo === 'col'
        ? { ...banco, colWidths: Object.assign(Array.from({ length: banco.colCount }, (_, i) => banco.colWidths?.[i] ?? BANCO_COL_WIDTH), { [alvo.indice]: tamanho }) }
        : { ...banco, rowHeights: Object.assign(Array.from({ length: banco.rows.length }, (_, i) => banco.rowHeights?.[i] ?? BANCO_ROW_HEIGHT), { [alvo.indice]: tamanho }) }
      ));
    };
    const onUp = () => {
      redimensionarRef.current = null;
      if (arrastandoRef.current) {
        arrastandoRef.current = false;
        // Arrastar entre celulas deixa um trecho de texto marcado dentro do input de origem.
        if (selecao && (selecao.r1 !== selecao.r2 || selecao.c1 !== selecao.c2)) window.getSelection()?.removeAllRanges();
        // Soltou o mouse com o pincel ligado: carimba o estilo copiado na area selecionada.
        if (pincelRef.current) aplicarEstilo(pincelRef.current, true);
        else if (dimRef.current) dimensionarSelecao();
      }
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  });

  const resetEditorFields = () => {
    setSidebarTab(null);
    setContratoFiltro('');
    setSelecao(null);
    setPincel(null);
    pincelRef.current = null;
    setDimAtivo(false);
    dimRef.current = false;
    setConfigOpen(false);
  };
  const openNote = (sheet: AnnotationSheet) => { setEditing(normalizeForEditing(sheet)); resetEditorFields(); };

  // ---- Operacoes de banco (escopo do componente: os listeners de janela abaixo precisam delas) ----
  const updateBanco = (bancoIndex: number, updater: (banco: AnnotationBanco) => AnnotationBanco) => setEditing((prev) => {
    if (!prev) return prev;
    return { ...prev, bancos: (prev.bancos ?? []).map((banco, index) => (index === bancoIndex ? updater(banco) : banco)) };
  });
  const addBanco = () => setEditing((prev) => (
    prev ? { ...prev, bancos: [...(prev.bancos ?? []), createBanco(3, 3)] } : prev
  ));
  const removeBanco = (bancoIndex: number) => setEditing((prev) => (
    prev ? { ...prev, bancos: (prev.bancos ?? []).filter((_, index) => index !== bancoIndex) } : prev
  ));
  const updateCell = (bancoIndex: number, r: number, c: number, value: string) => updateBanco(bancoIndex, (banco) => ({
    ...banco,
    rows: banco.rows.map((row, ri) => (ri === r ? row.map((cell, ci) => (ci === c ? value : cell)) : row)),
  }));
  // Editor aberto: comeca a montar o dicionario ja, pra o menu nao esperar os ~13s de carga.
  React.useEffect(() => { if (editing) aquecerCorretor(); }, [Boolean(editing)]);

  // Menu aberto: procura erros de ortografia na celula pra montar a coluna de correcoes.
  const textoDaCelulaDoMenu = contextMenu
    ? (editing?.bancos ?? [])[contextMenu.bancoIndex]?.rows?.[contextMenu.row]?.[contextMenu.col] || ''
    : '';
  React.useEffect(() => {
    if (!contextMenu) { setSugestoesOrtografia([]); return; }
    let cancelado = false;
    void sugerirCorrecoes(textoDaCelulaDoMenu).then((lista) => { if (!cancelado) setSugestoesOrtografia(lista); });
    return () => { cancelado = true; };
  }, [contextMenu, textoDaCelulaDoMenu]);

  const corrigirPalavra = (de: string, para: string) => {
    if (!contextMenu) return;
    updateCell(contextMenu.bancoIndex, contextMenu.row, contextMenu.col, trocarPalavra(textoDaCelulaDoMenu, de, para));
    setContextMenu(null);
  };

  const insertRow = (bancoIndex: number, at: number) => updateBanco(bancoIndex, (banco) => {
    const rows = [...banco.rows];
    rows.splice(at, 0, Array.from({ length: banco.colCount }, () => ''));
    return {
      ...banco,
      rows,
      styles: remapStyles(banco.styles, (r, c) => ({ r: r >= at ? r + 1 : r, c })),
      merges: remapMerges(banco.merges, 'row', at, 1),
      rowHeights: spliceSizes(banco.rowHeights, at, 1, BANCO_ROW_HEIGHT, banco.rows.length),
    };
  });
  const removeRow = (bancoIndex: number, at: number) => updateBanco(bancoIndex, (banco) => (
    banco.rows.length <= 1 ? banco : {
      ...banco,
      rows: banco.rows.filter((_, ri) => ri !== at),
      styles: remapStyles(banco.styles, (r, c) => (r === at ? null : { r: r > at ? r - 1 : r, c })),
      merges: remapMerges(banco.merges, 'row', at, -1),
      rowHeights: spliceSizes(banco.rowHeights, at, -1, BANCO_ROW_HEIGHT, banco.rows.length),
    }
  ));
  const insertCol = (bancoIndex: number, at: number) => updateBanco(bancoIndex, (banco) => ({
    ...banco,
    rows: banco.rows.map((row) => {
      const next = [...row];
      next.splice(at, 0, '');
      return next;
    }),
    colCount: banco.colCount + 1,
    styles: remapStyles(banco.styles, (r, c) => ({ r, c: c >= at ? c + 1 : c })),
    merges: remapMerges(banco.merges, 'col', at, 1),
    colWidths: spliceSizes(banco.colWidths, at, 1, BANCO_COL_WIDTH, banco.colCount),
  }));
  const removeCol = (bancoIndex: number, at: number) => updateBanco(bancoIndex, (banco) => (
    banco.colCount <= 1 ? banco : {
      ...banco,
      rows: banco.rows.map((row) => row.filter((_, ci) => ci !== at)),
      colCount: banco.colCount - 1,
      styles: remapStyles(banco.styles, (r, c) => (c === at ? null : { r, c: c > at ? c - 1 : c })),
      merges: remapMerges(banco.merges, 'col', at, -1),
      colWidths: spliceSizes(banco.colWidths, at, -1, BANCO_COL_WIDTH, banco.colCount),
    }
  ));

  // ---- Selecao e formatacao ----
  const selRect = (sel: CellSelection) => ({
    rMin: Math.min(sel.r1, sel.r2),
    rMax: Math.max(sel.r1, sel.r2),
    cMin: Math.min(sel.c1, sel.c2),
    cMax: Math.max(sel.c1, sel.c2),
  });
  const naSelecao = (bancoIndex: number, r: number, c: number) => {
    if (!selecao || selecao.bancoIndex !== bancoIndex) return false;
    const { rMin, rMax, cMin, cMax } = selRect(selecao);
    return r >= rMin && r <= rMax && c >= cMin && c <= cMax;
  };
  const celulasSelecionadas = (sel: CellSelection) => {
    const { rMin, rMax, cMin, cMax } = selRect(sel);
    const lista: Array<{ r: number; c: number }> = [];
    for (let r = rMin; r <= rMax; r += 1) for (let c = cMin; c <= cMax; c += 1) lista.push({ r, c });
    return lista;
  };
  const aplicarEstilo = (patch: Partial<CellStyle>, substituir = false) => {
    if (!selecao) return;
    const alvo = selecao;
    updateBanco(alvo.bancoIndex, (banco) => {
      const styles = { ...(banco.styles || {}) };
      celulasSelecionadas(alvo).forEach(({ r, c }) => {
        const atual = substituir ? {} : (styles[cellKey(r, c)] || {});
        const proximo: CellStyle = { ...atual, ...patch };
        // Campo vazio ('' ou undefined) remove a propriedade em vez de gravar vazio.
        Object.keys(proximo).forEach((key) => {
          const valor = (proximo as any)[key];
          if (valor === '' || valor === undefined || valor === false) delete (proximo as any)[key];
        });
        if (Object.keys(proximo).length === 0) delete styles[cellKey(r, c)];
        else styles[cellKey(r, c)] = proximo;
      });
      return { ...banco, styles };
    });
  };
  const alternarEstilo = (chave: 'bold' | 'italic' | 'strike') => {
    if (!editing || !selecao) return;
    const banco = (editing.bancos ?? [])[selecao.bancoIndex];
    if (!banco) return;
    // Se todas ja tem, desliga; senao liga em todas (igual editor de planilha).
    const todas = celulasSelecionadas(selecao).every(({ r, c }) => banco.styles?.[cellKey(r, c)]?.[chave]);
    aplicarEstilo({ [chave]: !todas } as Partial<CellStyle>);
  };
  const limparConteudoSelecao = () => {
    if (!selecao) return;
    const alvo = selecao;
    updateBanco(alvo.bancoIndex, (banco) => {
      const alvos = new Set(celulasSelecionadas(alvo).map(({ r, c }) => cellKey(r, c)));
      return { ...banco, rows: banco.rows.map((row, r) => row.map((cell, c) => (alvos.has(cellKey(r, c)) ? '' : cell))) };
    });
  };
  const limparFormatacaoSelecao = () => {
    if (!selecao) return;
    const alvo = selecao;
    updateBanco(alvo.bancoIndex, (banco) => {
      const styles = { ...(banco.styles || {}) };
      celulasSelecionadas(alvo).forEach(({ r, c }) => { delete styles[cellKey(r, c)]; });
      return { ...banco, styles };
    });
  };
  const mesclarSelecao = () => {
    if (!selecao) return;
    const alvo = selecao;
    const { rMin, rMax, cMin, cMax } = selRect(alvo);
    if (rMin === rMax && cMin === cMax) return;
    updateBanco(alvo.bancoIndex, (banco) => {
      // Descarta mesclagens que cruzam a area nova e limpa o conteudo das engolidas.
      const merges = (banco.merges || []).filter((item) => (
        !mergeIntersects(item, rMin, rMax, cMin, cMax)
      ));
      merges.push({ r: rMin, c: cMin, rowSpan: rMax - rMin + 1, colSpan: cMax - cMin + 1 });
      const rows = banco.rows.map((row, r) => row.map((cell, c) => (
        r >= rMin && r <= rMax && c >= cMin && c <= cMax && !(r === rMin && c === cMin) ? '' : cell
      )));
      return { ...banco, rows, merges };
    });
    setSelecao({ ...alvo, r1: rMin, c1: cMin, r2: rMin, c2: cMin });
  };
  const desmesclarSelecao = () => {
    if (!selecao) return;
    const alvo = selecao;
    const { rMin, rMax, cMin, cMax } = selRect(alvo);
    updateBanco(alvo.bancoIndex, (banco) => ({
      ...banco,
      merges: (banco.merges || []).filter((item) => !mergeIntersects(item, rMin, rMax, cMin, cMax)),
    }));
  };
  const selecaoTemMerge = () => {
    if (!editing || !selecao) return false;
    const banco = (editing.bancos ?? [])[selecao.bancoIndex];
    if (!banco) return false;
    const { rMin, rMax, cMin, cMax } = selRect(selecao);
    return (banco.merges || []).some((item) => mergeIntersects(item, rMin, rMax, cMin, cMax));
  };

  // Pincel: 1o clique copia o estilo da ancora da selecao, 2o clique desliga.
  const alternarPincel = () => {
    if (pincel) { setPincel(null); pincelRef.current = null; return; }
    if (!editing || !selecao) return;
    const banco = (editing.bancos ?? [])[selecao.bancoIndex];
    const estilo = banco?.styles?.[cellKey(selecao.r1, selecao.c1)] || {};
    setPincel(estilo);
    pincelRef.current = estilo;
    setDimAtivo(false);
    dimRef.current = false;
  };

  const alternarDim = () => {
    const proximo = !dimAtivo;
    setDimAtivo(proximo);
    dimRef.current = proximo;
    if (proximo) { setPincel(null); pincelRef.current = null; }
  };

  const medirCom = (fonte: string) => {
    if (!medidorRef.current) medidorRef.current = document.createElement('canvas').getContext('2d');
    const ctx = medidorRef.current;
    if (!ctx) return (t: string) => t.length * 7; // fallback grosseiro se canvas faltar
    ctx.font = fonte;
    return (t: string) => ctx.measureText(t).width;
  };

  // Dim: ajusta largura da coluna e altura da linha ao conteudo, quebrando a ~3cm.
  // Largura e altura sao da coluna/linha inteira - e o que uma tabela permite.
  const dimensionarSelecao = () => {
    if (!selecao) return;
    const alvo = selecao;
    updateBanco(alvo.bancoIndex, (banco) => {
      const colWidths = Array.from({ length: banco.colCount }, (_, i) => banco.colWidths?.[i] ?? BANCO_COL_WIDTH);
      const rowHeights = Array.from({ length: banco.rows.length }, (_, i) => banco.rowHeights?.[i] ?? BANCO_ROW_HEIGHT);
      const larguraPorColuna = new Map<number, number>();
      const alturaPorLinha = new Map<number, number>();

      celulasSelecionadas(alvo).forEach(({ r, c }) => {
        const texto = banco.rows[r]?.[c] ?? '';
        const estilo = banco.styles?.[cellKey(r, c)];
        const medir = medirCom(fonteCss(estilo));
        // Largura do texto sem quebrar, limitada a 3cm.
        const natural = Math.max(0, ...quebrarTexto(texto, Infinity, medir).map(medir));
        const largura = Math.min(Math.max(natural, 48), LARGURA_QUEBRA_PX);
        const linhas = quebrarTexto(texto, largura, medir);
        larguraPorColuna.set(c, Math.max(larguraPorColuna.get(c) ?? 0, largura));
        alturaPorLinha.set(r, Math.max(alturaPorLinha.get(r) ?? 0, alturaParaLinhas(linhas.length, estilo?.fontSize ?? 13)));
      });

      larguraPorColuna.forEach((valor, c) => { colWidths[c] = Math.ceil(valor) + PADDING_CELULA_X; });
      alturaPorLinha.forEach((valor, r) => { rowHeights[r] = valor; });
      return { ...banco, colWidths, rowHeights };
    });
  };

  // ---- Checklists ----
  const addChecklist = () => setEditing((prev) => (
    prev ? { ...prev, checklists: [...(prev.checklists ?? []), { id: makeId('chk'), itens: [{ id: makeId('chkitem'), texto: '', feito: false }] }] } : prev
  ));
  const removeChecklist = (index: number) => setEditing((prev) => (
    prev ? { ...prev, checklists: (prev.checklists ?? []).filter((_, i) => i !== index) } : prev
  ));
  const updateChecklist = (index: number, updater: (lista: AnnotationChecklist) => AnnotationChecklist) => setEditing((prev) => {
    if (!prev) return prev;
    return { ...prev, checklists: (prev.checklists ?? []).map((lista, i) => (i === index ? updater(lista) : lista)) };
  });
  const addChecklistItem = (index: number) => updateChecklist(index, (lista) => ({
    ...lista, itens: [...lista.itens, { id: makeId('chkitem'), texto: '', feito: false }],
  }));
  const setChecklistItem = (index: number, itemId: string, patch: Partial<AnnotationChecklistItem>) => updateChecklist(index, (lista) => ({
    ...lista, itens: lista.itens.map((item) => (item.id === itemId ? { ...item, ...patch } : item)),
  }));
  const removeChecklistItem = (index: number, itemId: string) => updateChecklist(index, (lista) => ({
    ...lista, itens: lista.itens.filter((item) => item.id !== itemId),
  }));

  const uniqueOsOptions = React.useMemo(
    () => Array.from(new Map(osOptions.map((os) => [os.codigo, os])).values()),
    [osOptions]
  );
  const visiveis = sheets.filter((sheet) => {
    const matchesFilter = filter.type === 'all'
      ? true
      : filter.type === 'disciplina' ? getSheetDisciplinas(sheet).includes(filter.value) : sheet.osCodigo === filter.value;
    if (!matchesFilter) return false;
    // Regra unica: nota propria sempre, nota de outro so se publica.
    if (sheet.autorEmail === currentUser.email) return true;
    return sheet.publica !== false;
  });

  // OS do contrato escolhido: o filtro de contrato e pre-filtro do de OS (padrao do Instrucoes.md).
  const osDaLista = listaContrato
    ? uniqueOsOptions.filter((os) => os.contratoCodigo === listaContrato)
    : uniqueOsOptions;
  const codigosDoContrato = new Set(osDaLista.map((os) => os.codigo));
  const listaFiltrada = visiveis
    .filter((sheet) => {
      if (!listaAutor) return true;
      if (listaAutor === AUTOR_EU) return sheet.autorEmail === currentUser.email;
      return sheet.autorEmail === listaAutor;
    })
    .filter((sheet) => !listaContrato || (sheet.osCodigo ? codigosDoContrato.has(sheet.osCodigo) : false))
    .filter((sheet) => !listaOs || sheet.osCodigo === listaOs)
    // Filtro fala em setor: escolher 'Arquitetura' traz URB, LAY, LUM...
    .filter((sheet) => !listaDisciplina || getSheetDisciplinas(sheet).some((item) => disciplineMatchesSector(item, listaDisciplina)));
  const temFiltroLista = Boolean(listaAutor || listaContrato || listaOs || listaDisciplina);
  const limparFiltroLista = () => { setListaAutor(''); setListaContrato(''); setListaOs(''); setListaDisciplina(''); };
  // Autores que aparecem no seletor: os cadastrados no sistema, sem o proprio usuario
  // (ele ja tem a opcao "Criado por mim").
  const autoresDisponiveis = usuarios
    .filter((user) => user.email !== currentUser.email)
    .sort((a, b) => (a.nome || a.email).localeCompare(b.nome || b.email, 'pt-BR'));
  const closeEditing = () => {
    setEditing(null);
    setContextMenu(null);
    setLinkPickerOpen(false);
    resetEditorFields();
    onCloseControlled?.();
  };

  if (editing) {
    const bancos = editing.bancos ?? [];
    const textos = editing.textos ?? [];
    const checklists = editing.checklists ?? [];
    const selectedDisciplinas = getSheetDisciplinas(editing);
    // Nota existente so e editavel pelo autor, admin ou usuario vinculado. Nota recem-criada
    // (ainda nao salva, sem autor gravado) e sempre editavel por quem esta criando.
    const notaJaSalva = sheets.some((sheet) => sheet.id === editing.id);
    const podeEditar = !notaJaSalva || canEditNote(currentUser, editing.autorEmail, editing.marcadosUsuarios);

    const updateTitulo = (titulo: string) => setEditing((prev) => (prev ? { ...prev, titulo } : prev));
    const updateOs = (osCodigo: string) => setEditing((prev) => (prev ? { ...prev, osCodigo: osCodigo || undefined } : prev));
    const updateDisciplina = (disciplina: string) => setEditing((prev) => (prev ? { ...prev, disciplina } : prev));
    const toggleDisciplina = (disciplina: string) => setEditing((prev) => {
      if (!prev) return prev;
      const current = getSheetDisciplinas(prev);
      const next = current.includes(disciplina) ? current.filter((item) => item !== disciplina) : [...current, disciplina];
      return { ...prev, disciplinas: next, disciplina: next[0] || '' };
    });
    const markAllDisciplinas = () => setEditing((prev) => (
      prev ? { ...prev, disciplinas: [...disciplinaOptions], disciplina: disciplinaOptions[0] || '' } : prev
    ));
    const updatePublica = (publica: boolean) => setEditing((prev) => (prev ? { ...prev, publica } : prev));
    const addLink = (targetId: string) => setEditing((prev) => {
      if (!prev || prev.linkedNoteIds?.includes(targetId)) return prev;
      return { ...prev, linkedNoteIds: [...(prev.linkedNoteIds || []), targetId] };
    });
    const removeLink = (targetId: string) => setEditing((prev) => {
      if (!prev) return prev;
      return { ...prev, linkedNoteIds: (prev.linkedNoteIds || []).filter((id) => id !== targetId) };
    });
    const toggleMarcado = (email: string) => setEditing((prev) => {
      if (!prev) return prev;
      const atual = prev.marcadosUsuarios || [];
      const next = atual.includes(email) ? atual.filter((item) => item !== email) : [...atual, email];
      return { ...prev, marcadosUsuarios: next };
    });

    const addTextoBlock = () => setEditing((prev) => (
      prev ? { ...prev, textos: [...(prev.textos ?? []), { id: makeId('nota'), texto: '' }] } : prev
    ));
    const updateTextoBlock = (index: number, texto: string) => setEditing((prev) => {
      if (!prev) return prev;
      return { ...prev, textos: (prev.textos ?? []).map((bloco, i) => (i === index ? { ...bloco, texto } : bloco)) };
    });
    const removeTextoBlock = (index: number) => setEditing((prev) => (
      prev ? { ...prev, textos: (prev.textos ?? []).filter((_, i) => i !== index) } : prev
    ));
    const insertLinkIntoTexto = (index: number, blocoId: string, textoAtual: string) => {
      const url = window.prompt('Endereço do link (URL):');
      if (!url || !url.trim()) return;
      const label = window.prompt('Texto do link:', url) || url;
      const markdown = `[${label}](${url.trim()})`;
      const textarea = textoRefs.current[blocoId];
      const start = textarea?.selectionStart ?? textoAtual.length;
      const end = textarea?.selectionEnd ?? textoAtual.length;
      updateTextoBlock(index, `${textoAtual.slice(0, start)}${markdown}${textoAtual.slice(end)}`);
    };
    // OS do contrato escolhido (ou todas). A busca por texto fica a cargo do SearchableSelect.
    const osFiltradas = contratoFiltro
      ? uniqueOsOptions.filter((os) => os.contratoCodigo === contratoFiltro)
      : uniqueOsOptions;

    // Sem contexto de disciplina/OS: a nota escolhe os dois - OS opcional, disciplina obrigatoria.
    const isOsNote = filter.type === 'os';
    const showOsSelector = !isOsNote;
    const showDisciplinaSelect = filter.type === 'all';
    // Nota de OS: disciplina vira multi-select (pode marcar varias, ou todas de uma vez).
    const showDisciplinaMultiSelect = isOsNote;
    const disciplinaPendente = isOsNote ? selectedDisciplinas.length === 0 : !editing.disciplina.trim();

    const handleSave = async () => {
      if (!editing.titulo.trim() || disciplinaPendente) return;
      setSaving(true);
      try {
        await onSave({ ...editing, updatedAt: new Date().toISOString() });
        closeEditing();
      } finally {
        setSaving(false);
      }
    };

    const autorInfo = [
      editing.autorNome ? `Criado por ${editing.autorNome}` : null,
      formatDateBR(editing.criadoEm) ? `em ${formatDateBR(editing.criadoEm)}` : null,
    ].filter(Boolean).join(' ');

    const linkedNotes = (editing.linkedNoteIds || [])
      .map((id) => sheets.find((sheet) => sheet.id === id))
      .filter((sheet): sheet is AnnotationSheet => Boolean(sheet));
    const backlinkNotes = sheets.filter((sheet) => sheet.id !== editing.id && (sheet.linkedNoteIds || []).includes(editing.id));
    const linkPickerResults = sheets.filter((sheet) => {
      if (sheet.id === editing.id) return false;
      const isVisible = sheet.publica !== false || sheet.autorEmail === currentUser.email;
      if (!isVisible) return false;
      const query = normalizeText(linkSearch);
      return !query || normalizeText(sheet.titulo).includes(query);
    });
    const marcadosUsuarios = editing.marcadosUsuarios || [];
    const userPickerResults = usuarios.filter((user) => {
      const query = normalizeText(userSearch);
      return !query || normalizeText(user.nome).includes(query) || normalizeText(user.email).includes(query);
    });

    // Painel direito: cronograma da OS, cronograma da disciplina, ou o mapa mental.
    // As duas primeiras abas so existem depois que o usuario escolhe OS / disciplina.
    const osActivities = editing.osCodigo
      ? activities.filter((activity) => activity.osCodigo === editing.osCodigo)
      : [];
    const disciplinaActivities = editing.disciplina
      ? activities.filter((activity) => activity.disciplinas.some((disciplina) => getDisciplineDisplayName(disciplina) === getDisciplineDisplayName(editing.disciplina)))
      : [];
    const sidebarTabs: Array<{ key: 'os' | 'disciplina' | 'mapa'; label: string }> = [
      ...(editing.osCodigo ? [{ key: 'os' as const, label: 'Ordem de Serviço' }] : []),
      ...(editing.disciplina ? [{ key: 'disciplina' as const, label: 'Disciplina' }] : []),
      { key: 'mapa' as const, label: 'Mapa Mental' },
    ];
    // Se a aba escolhida sumiu (usuario limpou a OS, por ex.), cai na primeira disponivel.
    const abaAtiva = sidebarTabs.find((tab) => tab.key === sidebarTab)?.key ?? sidebarTabs[0].key;

    // Portal pro body: fullscreen de verdade (fora do <main> relative z-10). Sem isso o editor
    // ficava preso no contexto do main — rail por cima, cortado pelo overflow e "jogado pra baixo".
    // Igual Gantt e Mapa Mental.
    return createPortal(
      <div className="fixed inset-0 z-[200] flex flex-col overflow-hidden bg-white">
        <div className="flex items-center justify-between gap-4 px-5 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <h2 className="truncate text-[15px] font-black text-[#2D2D2D]">{editing.titulo || 'Nova anotação'}</h2>
            {autorInfo && <span className="whitespace-nowrap text-[11px] text-[#94A3B8]">{autorInfo}</span>}
            {editing.publica === false && (
              <span className="inline-flex items-center gap-1 rounded-full border border-[#FED7AA] bg-[#FFF7ED] px-2.5 py-1 text-[11px] font-bold text-[#B45309]">
                <Lock size={11} />
                Privada
              </span>
            )}
            {!podeEditar && (
              <span className="inline-flex items-center gap-1 rounded-full border border-[#E5E7EB] bg-[#F9FAFB] px-2.5 py-1 text-[11px] font-bold text-[#64748B]">
                <Lock size={11} />
                Somente leitura
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {podeEditar && (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setConfigOpen((prev) => !prev)}
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#E5E7EB] bg-white px-3 text-[12px] font-bold text-[#64748B] transition-colors hover:border-[#F7C7B7] hover:bg-[#F9FAFB] hover:text-[#2D2D2D]"
                >
                  <Settings size={14} />
                  Configuração
                </button>
                {configOpen && (
                  <>
                    <div className="fixed inset-0 z-[205]" onClick={() => setConfigOpen(false)} />
                    <div className="absolute right-0 top-full z-[206] mt-1 w-44 rounded-xl bg-white p-1.5 shadow-xl">
                      <button
                        type="button"
                        onClick={() => { addTextoBlock(); setConfigOpen(false); }}
                        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[12px] font-medium text-[#374151] hover:bg-[#F3F4F6]"
                      >
                        <FileText size={14} />
                        + Nota
                      </button>
                      <button
                        type="button"
                        onClick={() => { addBanco(); setConfigOpen(false); }}
                        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[12px] font-medium text-[#374151] hover:bg-[#F3F4F6]"
                      >
                        <FileSpreadsheet size={14} />
                        + Banco
                      </button>
                      <button
                        type="button"
                        onClick={() => { addChecklist(); setConfigOpen(false); }}
                        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[12px] font-medium text-[#374151] hover:bg-[#F3F4F6]"
                      >
                        <ListChecks size={14} />
                        + Checklist
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
            <button
              type="button"
              onClick={closeEditing}
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
              value={editing.titulo}
              onChange={(event) => updateTitulo(event.target.value)}
              placeholder="Título da anotação"
              readOnly={!podeEditar}
              spellCheck
              lang="pt-BR"
              className="h-11 min-w-[220px] flex-1 rounded-xl border border-[#E5E7EB] bg-white px-3 text-[14px] font-bold text-[#2D2D2D] outline-none focus:border-[#F05D28]"
            />
            {showOsSelector && contractOptions.length > 0 && (
              <SearchableSelect
                value={contratoFiltro}
                onChange={(event) => setContratoFiltro(event.target.value)}
                title="Filtra a lista de OS por contrato"
                disabled={!podeEditar}
                searchPlaceholder="Todos os contratos"
                className={campoClass}
              >
                <option value="">Todos os contratos</option>
                {contractOptions.map((contrato) => (
                  <option key={contrato.codigo} value={contrato.codigo}>{contrato.codigo} - {contrato.nome}</option>
                ))}
              </SearchableSelect>
            )}
            {showOsSelector && (
              <SearchableSelect
                value={editing.osCodigo || ''}
                onChange={(event) => updateOs(event.target.value)}
                disabled={!podeEditar}
                searchPlaceholder="Pesquisar OS..."
                className={campoClass}
              >
                <option value="">Ordem de Serviço</option>
                {osFiltradas.map((os) => (
                  <option key={os.codigo} value={os.codigo}>{formatOsLabel(os)}</option>
                ))}
              </SearchableSelect>
            )}
            {showDisciplinaSelect && (
              <SearchableSelect
                value={editing.disciplina}
                onChange={(event) => updateDisciplina(event.target.value)}
                disabled={!podeEditar}
                searchPlaceholder="Pesquisar disciplina..."
                className={campoClass}
              >
                <option value="">Selecione a disciplina...</option>
                {disciplinaOptions.map((disciplina) => (
                  <option key={disciplina} value={disciplina}>{getDisciplineDisplayName(disciplina)}</option>
                ))}
              </SearchableSelect>
            )}
            <label className="flex h-11 items-center gap-2 rounded-xl border border-[#E5E7EB] bg-white px-3 text-[13px] font-medium text-[#2D2D2D] cursor-pointer">
              <input
                type="checkbox"
                checked={editing.publica !== false}
                disabled={!podeEditar}
                onChange={(event) => updatePublica(event.target.checked)}
                className="h-4 w-4 accent-[#F05D28] cursor-pointer"
              />
              Pública
            </label>
            {podeEditar && (
              <button
                type="button"
                onClick={() => void handleSave()}
                disabled={saving || !editing.titulo.trim() || disciplinaPendente}
                className="h-11 rounded-xl bg-[#F05D28] px-5 text-[13px] font-bold text-white transition-colors hover:bg-[#D94E1F] disabled:opacity-60"
              >
                {saving ? 'Salvando...' : 'Salvar'}
              </button>
            )}
          </div>

          {showDisciplinaMultiSelect && (
            <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-[#E5E7EB] bg-white p-3">
              <span className="text-[12px] font-bold text-[#2D2D2D]">Disciplinas:</span>
              {podeEditar && (
                <button
                  type="button"
                  onClick={markAllDisciplinas}
                  className="rounded-full border border-[#F05D28] px-2.5 py-1 text-[11px] font-bold text-[#F05D28] hover:bg-[#FFF3EE]"
                >
                  Marcar todas
                </button>
              )}
              {disciplinaOptions.map((disciplina) => {
                const checked = selectedDisciplinas.includes(disciplina);
                return (
                  <label
                    key={disciplina}
                    className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium cursor-pointer ${checked ? 'border-[#F05D28] bg-[#FFF3EE] text-[#F05D28]' : 'border-[#E5E7EB] text-[#64748B]'}`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={!podeEditar}
                      onChange={() => toggleDisciplina(disciplina)}
                      className="h-3 w-3 accent-[#F05D28] cursor-pointer"
                    />
                    {getDisciplineDisplayName(disciplina)}
                  </label>
                );
              })}
            </div>
          )}

          <p className="mt-2 text-[11px] text-[#94A3B8]">
            {editing.publica === false ? 'Privada: só visível para quem criou. ' : 'Pública: visível para todos. '}
            {podeEditar
              ? 'Clique e arraste para selecionar células, botão direito para formatar. Arraste a borda da linha/coluna para redimensionar.'
              : 'Você não tem permissão para alterar esta nota.'}
          </p>

          {bancos.length > 0 && (
            <div className="mt-3 flex flex-col gap-4">
              {bancos.map((banco, bancoIndex) => (
                <div key={banco.id} className="overflow-hidden rounded-xl border border-[#E5E7EB]">
                  <div className="flex items-center justify-between border-b border-[#E5E7EB] bg-[#F9FAFB] px-3 py-1.5">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-bold text-[#64748B]">Banco {bancoIndex + 1}</span>
                      {podeEditar && (
                        <button
                          type="button"
                          onClick={alternarPincel}
                          title={pincel
                            ? 'Pincel ligado: clique ou arraste nas células de destino. Clique aqui para desligar.'
                            : 'Selecione uma célula e clique para copiar a formatação dela'}
                          className={`inline-flex h-7 items-center gap-1.5 rounded-full px-3 text-[11px] font-bold transition-colors ${pincel
                            ? 'bg-[#F05D28] text-white shadow-[0_0_0_3px_rgba(240,93,40,0.25)]'
                            : 'border border-[#F05D28] bg-white text-[#F05D28] hover:bg-[#FFF3EC]'}`}
                        >
                          <Brush size={13} />
                          {pincel ? 'Pincel ligado' : 'Pincel'}
                        </button>
                      )}
                      {podeEditar && (
                        <button
                          type="button"
                          onClick={alternarDim}
                          title="Dimensionar célula para o texto: ligue e clique na célula. O texto quebra a cada ~3 cm."
                          className={`inline-flex h-7 items-center gap-1.5 rounded-full px-3 text-[11px] font-bold transition-colors ${dimAtivo
                            ? 'bg-[#F05D28] text-white shadow-[0_0_0_3px_rgba(240,93,40,0.25)]'
                            : 'border border-[#F05D28] bg-white text-[#F05D28] hover:bg-[#FFF3EC]'}`}
                        >
                          <Scaling size={13} />
                          {dimAtivo ? 'Dim ligado' : 'Dim'}
                        </button>
                      )}
                      {(pincel || dimAtivo) && (
                        <span className="text-[11px] font-medium text-[#B45309]">
                          {pincel ? 'Clique ou arraste nas células para aplicar' : 'Clique na célula para ajustá-la ao texto'}
                        </span>
                      )}
                    </div>
                    {podeEditar && (
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => insertCol(bancoIndex, banco.colCount)}
                          className="text-[12px] font-bold text-[#F05D28] hover:underline"
                        >
                          + Coluna
                        </button>
                        <button
                          type="button"
                          title="Excluir banco"
                          onClick={() => removeBanco(bancoIndex)}
                          className="flex h-5 w-5 items-center justify-center rounded-full text-[#94A3B8] hover:bg-[#FEE2E2] hover:text-[#DC2626]"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="overflow-auto">
                    {/* table-fixed + colgroup: sem isso o navegador ignora as larguras arrastadas. */}
                    <table className="border-collapse text-[13px]" style={{ tableLayout: 'fixed' }}>
                      <colgroup>
                        {Array.from({ length: banco.colCount }, (_, c) => (
                          <col key={c} style={{ width: `${banco.colWidths?.[c] ?? BANCO_COL_WIDTH}px` }} />
                        ))}
                      </colgroup>
                      <tbody>
                        {banco.rows.map((row, r) => (
                          <tr key={r} style={{ height: `${banco.rowHeights?.[r] ?? BANCO_ROW_HEIGHT}px` }}>
                            {row.map((cell, c) => {
                              if (isCovered(banco.merges, r, c)) return null;
                              const merge = mergeAt(banco.merges, r, c);
                              const estilo = banco.styles?.[cellKey(r, c)];
                              const selecionada = naSelecao(bancoIndex, r, c);
                              // Altura explicita na celula (nao so na linha): "height" em % nao
                              // resolve dentro de <td>, entao o textarea h-full ficava preso ao
                              // tamanho intrinseco (~2 linhas) mesmo com a linha maior. Soma as
                              // linhas cobertas pela mesclagem pra nao espremer celula mesclada.
                              const alturaCelulaPx = Array.from({ length: merge?.rowSpan || 1 }, (_, i) => banco.rowHeights?.[r + i] ?? BANCO_ROW_HEIGHT)
                                .reduce((total, altura) => total + altura, 0);
                              return (
                                <td
                                  key={c}
                                  rowSpan={merge?.rowSpan}
                                  colSpan={merge?.colSpan}
                                  onMouseDown={(event) => {
                                    if (!podeEditar || event.button !== 0) return;
                                    arrastandoRef.current = true;
                                    setSelecao({ bancoIndex, r1: r, c1: c, r2: r, c2: c });
                                  }}
                                  onMouseEnter={() => {
                                    if (!arrastandoRef.current) return;
                                    setSelecao((prev) => (prev && prev.bancoIndex === bancoIndex ? { ...prev, r2: r, c2: c } : prev));
                                  }}
                                  onContextMenu={(event) => {
                                    if (!podeEditar) return;
                                    event.preventDefault();
                                    // Botao direito fora da selecao: passa a mirar so aquela celula.
                                    if (!naSelecao(bancoIndex, r, c)) setSelecao({ bancoIndex, r1: r, c1: c, r2: r, c2: c });
                                    setContextMenu({ bancoIndex, row: r, col: c, x: event.clientX, y: event.clientY });
                                  }}
                                  style={{ backgroundColor: estilo?.bg || (r === 0 ? '#F3F4F6' : '#FFFFFF'), height: `${alturaCelulaPx}px` }}
                                  className={`relative border border-[#E5E7EB] p-0 ${selecionada ? 'shadow-[inset_0_0_0_2px_#F05D28]' : ''} ${pincel ? 'cursor-copy' : ''}`}
                                >
                                  {/* textarea (nao input) pra que o texto quebre em varias linhas. */}
                                  <textarea
                                    value={cell}
                                    onChange={(event) => updateCell(bancoIndex, r, c, event.target.value)}
                                    readOnly={!podeEditar}
                                    spellCheck
                                    lang="pt-BR"
                                    style={cellCss(estilo)}
                                    className={`h-full w-full resize-none overflow-auto bg-transparent px-2 py-1.5 leading-[1.4] outline-none ${r === 0 && !estilo ? 'font-bold text-[#2D2D2D]' : 'text-[#374151]'}`}
                                  />
                                  {/* Alcas de redimensionamento: coluna na 1a linha, linha na 1a coluna. */}
                                  {podeEditar && r === 0 && (
                                    <div
                                      onMouseDown={(event) => {
                                        event.preventDefault();
                                        event.stopPropagation();
                                        redimensionarRef.current = {
                                          tipo: 'col', bancoIndex, indice: c,
                                          inicioPx: event.clientX,
                                          tamanhoInicial: banco.colWidths?.[c] ?? BANCO_COL_WIDTH,
                                        };
                                      }}
                                      className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize hover:bg-[#F05D28]"
                                    />
                                  )}
                                  {podeEditar && c === 0 && (
                                    <div
                                      onMouseDown={(event) => {
                                        event.preventDefault();
                                        event.stopPropagation();
                                        redimensionarRef.current = {
                                          tipo: 'row', bancoIndex, indice: r,
                                          inicioPx: event.clientY,
                                          tamanhoInicial: banco.rowHeights?.[r] ?? BANCO_ROW_HEIGHT,
                                        };
                                      }}
                                      className="absolute bottom-0 left-0 h-1.5 w-full cursor-row-resize hover:bg-[#F05D28]"
                                    />
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {podeEditar && (
                    <div className="border-t border-[#E5E7EB] bg-[#F9FAFB] px-3 py-1.5">
                      <button
                        type="button"
                        onClick={() => insertRow(bancoIndex, banco.rows.length)}
                        className="text-[12px] font-bold text-[#F05D28] hover:underline"
                      >
                        + Linha
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {checklists.length > 0 && (
            <div className="mt-4 flex flex-col gap-4">
              {checklists.map((lista, index) => (
                <div key={lista.id} className="rounded-xl bg-white p-4 shadow-[0_6px_16px_-12px_rgba(15,23,42,0.5)]">
                  <div className="mb-2 flex items-center justify-between">
                    <h4 className="text-[13px] font-bold text-[#2D2D2D]">
                      Checklist {index + 1}
                      <span className="ml-2 text-[11px] font-medium text-[#94A3B8]">
                        {lista.itens.filter((item) => item.feito).length}/{lista.itens.length}
                      </span>
                    </h4>
                    {podeEditar && (
                      <button
                        type="button"
                        title="Excluir checklist"
                        onClick={() => removeChecklist(index)}
                        className="flex h-5 w-5 items-center justify-center rounded-full text-[#94A3B8] hover:bg-[#FEE2E2] hover:text-[#DC2626]"
                      >
                        <Trash2 size={12} />
                      </button>
                    )}
                  </div>
                  <div className="flex flex-col gap-1.5">
                    {lista.itens.map((item) => (
                      <div key={item.id} className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={item.feito}
                          disabled={!podeEditar}
                          onChange={(event) => setChecklistItem(index, item.id, { feito: event.target.checked })}
                          className="h-4 w-4 flex-shrink-0 accent-[#F05D28] cursor-pointer"
                        />
                        <input
                          value={item.texto}
                          readOnly={!podeEditar}
                          onChange={(event) => setChecklistItem(index, item.id, { texto: event.target.value })}
                          placeholder="Descreva o item..."
                          spellCheck
                          lang="pt-BR"
                          className={`h-8 flex-1 rounded-lg border border-transparent bg-transparent px-2 text-[13px] outline-none focus:border-[#E5E7EB] ${item.feito ? 'text-[#94A3B8] line-through' : 'text-[#374151]'}`}
                        />
                        {podeEditar && (
                          <button
                            type="button"
                            onClick={() => removeChecklistItem(index, item.id)}
                            className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full text-[#94A3B8] hover:bg-[#FEE2E2] hover:text-[#DC2626]"
                          >
                            <X size={11} />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                  {podeEditar && (
                    <button
                      type="button"
                      onClick={() => addChecklistItem(index)}
                      className="mt-2 text-[12px] font-bold text-[#F05D28] hover:underline"
                    >
                      + Item
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {textos.length > 0 ? (
            <div className="mt-4 flex flex-col gap-4">
              {textos.map((bloco, index) => {
                const links = Array.from(bloco.texto.matchAll(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g));
                return (
                  <div key={bloco.id} className="rounded-xl bg-white p-4 shadow-[0_6px_16px_-12px_rgba(15,23,42,0.5)]">
                    <div className="mb-2 flex items-center justify-between">
                      <h4 className="text-[13px] font-bold text-[#2D2D2D]">Notas {index + 1}</h4>
                      {podeEditar && (
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            title="Inserir link"
                            onClick={() => insertLinkIntoTexto(index, bloco.id, bloco.texto)}
                            className="flex h-5 w-5 items-center justify-center rounded-full text-[#94A3B8] hover:bg-[#F3F4F6] hover:text-[#F05D28]"
                          >
                            <Link2 size={12} />
                          </button>
                          <button
                            type="button"
                            title="Excluir bloco de notas"
                            onClick={() => removeTextoBlock(index)}
                            className="flex h-5 w-5 items-center justify-center rounded-full text-[#94A3B8] hover:bg-[#FEE2E2] hover:text-[#DC2626]"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      )}
                    </div>
                    <textarea
                      ref={(el) => { textoRefs.current[bloco.id] = el; }}
                      value={bloco.texto}
                      onChange={(event) => updateTextoBlock(index, event.target.value)}
                      placeholder="Escreva livremente aqui, como um bloco de texto... Use + Link para inserir hiperlinks."
                      readOnly={!podeEditar}
                      rows={5}
                      spellCheck
                      lang="pt-BR"
                      className="w-full resize-y rounded-lg border border-[#E5E7EB] bg-white p-3 text-[13px] text-[#374151] outline-none focus:border-[#F05D28]"
                    />
                    {links.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {links.map((match, linkIndex) => (
                          <a
                            key={linkIndex}
                            href={match[2]}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 rounded-full border border-[#E5E7EB] bg-[#F9FAFB] px-2.5 py-1 text-[11px] font-medium text-[#F05D28] hover:underline"
                          >
                            <Link2 size={11} />
                            {match[1]}
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : null}

          <div className="mt-4 rounded-xl bg-white p-4 shadow-[0_6px_16px_-12px_rgba(15,23,42,0.5)]">
            {podeEditar && (
              <div className="flex items-center gap-4">
                <button
                  type="button"
                  onClick={() => { setLinkPickerOpen(true); setLinkSearch(''); }}
                  className="text-[12px] font-bold text-[#F05D28] hover:underline"
                >
                  Vincular Nota
                </button>
                <button
                  type="button"
                  onClick={() => { setUserPickerOpen(true); setUserSearch(''); }}
                  className="text-[12px] font-bold text-[#F05D28] hover:underline"
                >
                  Vincular Usuários
                </button>
              </div>
            )}
            {linkedNotes.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {linkedNotes.map((note) => (
                  <span key={note.id} className="inline-flex items-center gap-1.5 rounded-full border border-[#E5E7EB] bg-[#F9FAFB] py-1 pl-3 pr-1.5 text-[12px] font-medium text-[#2D2D2D]">
                    <button type="button" onClick={() => openNote(note)} className="hover:text-[#F05D28]">
                      {note.titulo || 'Sem título'}
                    </button>
                    <button
                      type="button"
                      onClick={() => removeLink(note.id)}
                      className="flex h-5 w-5 items-center justify-center rounded-full text-[#94A3B8] hover:bg-[#FEE2E2] hover:text-[#DC2626]"
                    >
                      <X size={11} />
                    </button>
                  </span>
                ))}
              </div>
            )}

            {marcadosUsuarios.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {marcadosUsuarios.map((email) => {
                  const user = usuarios.find((item) => item.email === email);
                  return (
                    <span key={email} className="inline-flex items-center gap-1.5 rounded-full border border-[#FED7AA] bg-[#FFF3EC] py-1 pl-3 pr-1.5 text-[12px] font-medium text-[#B45309]">
                      {user?.nome || email}
                      <button
                        type="button"
                        onClick={() => toggleMarcado(email)}
                        className="flex h-5 w-5 items-center justify-center rounded-full text-[#B45309] hover:bg-[#FEE2E2] hover:text-[#DC2626]"
                      >
                        <X size={11} />
                      </button>
                    </span>
                  );
                })}
              </div>
            )}

            {backlinkNotes.length > 0 && (
              <>
                <h4 className="mt-4 text-[13px] font-bold text-[#2D2D2D]">Mencionada em</h4>
                <div className="mt-2 flex flex-wrap gap-2">
                  {backlinkNotes.map((note) => (
                    <button
                      key={note.id}
                      type="button"
                      onClick={() => openNote(note)}
                      className="rounded-full border border-[#E5E7EB] bg-[#F9FAFB] px-3 py-1 text-[12px] font-medium text-[#2D2D2D] hover:border-[#F7C7B7] hover:text-[#F05D28]"
                    >
                      {note.titulo || 'Sem título'}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        <div className="flex w-[30%] flex-shrink-0 flex-col overflow-hidden border-l border-[#E5E7EB] p-5">
          <div className="mb-3 flex flex-wrap items-center gap-1.5">
            {sidebarTabs.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setSidebarTab(tab.key)}
                className={`h-8 rounded-full px-3 text-[11px] font-bold transition-colors cursor-pointer ${abaAtiva === tab.key ? 'bg-[#F05D28] text-white' : 'border border-[#E5E7EB] bg-white text-[#64748B] hover:border-[#F7C7B7] hover:text-[#F05D28]'}`}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <div className="min-h-0 flex-1 overflow-auto">
            {abaAtiva === 'mapa' ? (
              <div className="h-full">
                <MindMap
                  embedded
                  highlightId={editing.id}
                  sheets={sheets}
                  currentUserEmail={currentUser.email}
                  osOptions={osOptions}
                  onOpenNote={(sheet) => openNote(sheet)}
                />
              </div>
            ) : abaAtiva === 'os' ? (
              <CronogramaResumo activities={osActivities} contextLabel="disciplina" />
            ) : (
              <CronogramaResumo activities={disciplinaActivities} contextLabel="os" />
            )}
          </div>
        </div>
        </div>

        {contextMenu && podeEditar && (
          <>
            <div
              className="fixed inset-0 z-[210]"
              onClick={() => setContextMenu(null)}
              onContextMenu={(event) => { event.preventDefault(); setContextMenu(null); }}
            />
            <div
              className="fixed z-[211] flex items-start gap-2"
              style={{
                left: Math.min(contextMenu.x, window.innerWidth - (sugestoesOrtografia.length ? 540 : 272)),
                top: Math.min(contextMenu.y, window.innerHeight - 430),
              }}
            >
            <div className="w-64 rounded-xl bg-white p-2 shadow-xl">
              <div className="flex items-center gap-1">
                {([['bold', 'N', 'font-black'], ['italic', 'I', 'italic'], ['strike', 'S', 'line-through']] as const).map(([chave, rotulo, classe]) => (
                  <button
                    key={chave}
                    type="button"
                    onClick={() => alternarEstilo(chave)}
                    className={`h-8 w-8 rounded-lg border border-[#E5E7EB] text-[13px] text-[#374151] hover:border-[#F7C7B7] hover:text-[#F05D28] ${classe}`}
                  >
                    {rotulo}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => { limparFormatacaoSelecao(); setContextMenu(null); }}
                  className="ml-auto rounded-lg px-2 py-1 text-[11px] font-bold text-[#64748B] hover:bg-[#F3F4F6] hover:text-[#F05D28]"
                >
                  Limpar formato
                </button>
              </div>

              <div className="mt-1.5 flex items-center gap-1">
                {([['left', AlignLeft, 'Alinhar à esquerda'], ['center', AlignCenter, 'Centralizar'], ['right', AlignRight, 'Alinhar à direita']] as const).map(([align, Icone, titulo]) => {
                  const ativo = ((editing.bancos ?? [])[contextMenu.bancoIndex]?.styles?.[cellKey(contextMenu.row, contextMenu.col)]?.align || 'left') === align;
                  return (
                    <button
                      key={align}
                      type="button"
                      title={titulo}
                      onClick={() => aplicarEstilo({ align })}
                      className={`flex h-8 w-8 items-center justify-center rounded-lg border text-[#374151] hover:border-[#F7C7B7] hover:text-[#F05D28] ${ativo ? 'border-[#F05D28] bg-[#FFF3EC] text-[#F05D28]' : 'border-[#E5E7EB]'}`}
                    >
                      <Icone size={14} />
                    </button>
                  );
                })}
              </div>

              <p className="mt-2 text-[10px] font-bold uppercase tracking-wide text-[#94A3B8]">Cor de fundo</p>
              <div className="mt-1 flex flex-wrap gap-1">
                {CORES_FUNDO.map(([nome, cor]) => (
                  <button
                    key={nome}
                    type="button"
                    title={nome}
                    onClick={() => aplicarEstilo({ bg: cor })}
                    className="h-6 w-6 rounded-md border border-[#E5E7EB] hover:ring-2 hover:ring-[#F05D28]"
                    style={{ backgroundColor: cor || '#FFFFFF' }}
                  />
                ))}
              </div>

              <p className="mt-2 text-[10px] font-bold uppercase tracking-wide text-[#94A3B8]">Cor do texto</p>
              <div className="mt-1 flex flex-wrap gap-1">
                {CORES_TEXTO.map(([nome, cor]) => (
                  <button
                    key={nome}
                    type="button"
                    title={nome}
                    onClick={() => aplicarEstilo({ color: cor })}
                    className="flex h-6 w-6 items-center justify-center rounded-md border border-[#E5E7EB] text-[13px] font-black hover:ring-2 hover:ring-[#F05D28]"
                    style={{ color: cor || '#374151' }}
                  >
                    A
                  </button>
                ))}
              </div>

              <div className="mt-2 flex gap-1">
                <select
                  value={(editing.bancos ?? [])[contextMenu.bancoIndex]?.styles?.[cellKey(contextMenu.row, contextMenu.col)]?.fontFamily || ''}
                  onChange={(event) => aplicarEstilo({ fontFamily: event.target.value })}
                  className="h-8 flex-1 rounded-lg border border-[#E5E7EB] px-2 text-[12px] text-[#374151] outline-none focus:border-[#F05D28]"
                >
                  <option value="">Fonte padrão</option>
                  {FONTES.map((fonte) => <option key={fonte} value={fonte}>{fonte}</option>)}
                </select>
                <select
                  value={(editing.bancos ?? [])[contextMenu.bancoIndex]?.styles?.[cellKey(contextMenu.row, contextMenu.col)]?.fontSize || ''}
                  onChange={(event) => aplicarEstilo({ fontSize: event.target.value ? Number(event.target.value) : undefined })}
                  className="h-8 w-16 rounded-lg border border-[#E5E7EB] px-2 text-[12px] text-[#374151] outline-none focus:border-[#F05D28]"
                >
                  <option value="">Tam.</option>
                  {TAMANHOS.map((tam) => <option key={tam} value={tam}>{tam}</option>)}
                </select>
              </div>

              <div className="mt-2 border-t border-[#F1F5F9] pt-1.5">
                {selecaoTemMerge() ? (
                  <button
                    type="button"
                    onClick={() => { desmesclarSelecao(); setContextMenu(null); }}
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[12px] font-medium text-[#374151] hover:bg-[#F3F4F6]"
                  >
                    <Split size={14} />
                    Desmesclar células
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => { mesclarSelecao(); setContextMenu(null); }}
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[12px] font-medium text-[#374151] hover:bg-[#F3F4F6]"
                  >
                    <Merge size={14} />
                    Mesclar células
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => { limparConteudoSelecao(); setContextMenu(null); }}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[12px] font-medium text-[#374151] hover:bg-[#F3F4F6]"
                >
                  <X size={14} />
                  Apagar conteúdo
                </button>
                <button
                  type="button"
                  onClick={() => { removeRow(contextMenu.bancoIndex, contextMenu.row); setContextMenu(null); setSelecao(null); }}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[12px] font-medium text-[#DC2626] hover:bg-[#FEE2E2]"
                >
                  <Trash2 size={14} />
                  Remover linha
                </button>
                <button
                  type="button"
                  onClick={() => { removeCol(contextMenu.bancoIndex, contextMenu.col); setContextMenu(null); setSelecao(null); }}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[12px] font-medium text-[#DC2626] hover:bg-[#FEE2E2]"
                >
                  <Trash2 size={14} />
                  Remover coluna
                </button>
              </div>
            </div>

            {/* Segunda coluna: so aparece quando o corretor achou erro na celula. */}
            {sugestoesOrtografia.length > 0 && (
              <div className="w-64 rounded-xl bg-white p-2 shadow-xl">
                <p className="text-[10px] font-bold uppercase tracking-wide text-[#94A3B8]">Ortografia</p>
                {sugestoesOrtografia.map((item) => (
                  <div key={item.palavra} className="mt-1.5 border-t border-[#F1F5F9] pt-1.5 first:border-t-0 first:pt-0">
                    <p className="px-1 text-[11px] font-bold text-[#DC2626] line-through">{item.palavra}</p>
                    {item.opcoes.map((opcao) => (
                      <button
                        key={opcao}
                        type="button"
                        onClick={() => corrigirPalavra(item.palavra, opcao)}
                        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[12px] font-medium text-[#374151] hover:bg-[#F3F4F6] hover:text-[#F05D28]"
                      >
                        <Check size={14} />
                        {opcao}
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            )}
            </div>
          </>
        )}

        {linkPickerOpen && (
          <div className="fixed inset-0 z-[220] flex items-center justify-center bg-slate-950/40 p-4" onClick={() => setLinkPickerOpen(false)}>
            <div className="flex max-h-[70vh] w-full max-w-md flex-col overflow-hidden rounded-xl bg-white p-4 shadow-xl" onClick={(event) => event.stopPropagation()}>
              <input
                autoFocus
                value={linkSearch}
                onChange={(event) => setLinkSearch(event.target.value)}
                placeholder="Buscar nota..."
                className="h-10 rounded-lg border border-[#E5E7EB] px-3 text-[13px] outline-none focus:border-[#F05D28]"
              />
              <div className="mt-3 flex-1 overflow-auto">
                {linkPickerResults.length === 0 ? (
                  <p className="px-1 py-2 text-[12px] text-[#94A3B8]">Nenhuma nota encontrada.</p>
                ) : (
                  linkPickerResults.map((sheet) => (
                    <button
                      key={sheet.id}
                      type="button"
                      onClick={() => { addLink(sheet.id); setLinkPickerOpen(false); }}
                      className="block w-full rounded-lg px-3 py-2 text-left text-[13px] text-[#2D2D2D] hover:bg-[#F9FAFB]"
                    >
                      {sheet.titulo || 'Sem título'}
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {userPickerOpen && (
          <div className="fixed inset-0 z-[220] flex items-center justify-center bg-slate-950/40 p-4" onClick={() => setUserPickerOpen(false)}>
            <div className="flex max-h-[70vh] w-full max-w-md flex-col overflow-hidden rounded-xl bg-white p-4 shadow-xl" onClick={(event) => event.stopPropagation()}>
              <input
                autoFocus
                value={userSearch}
                onChange={(event) => setUserSearch(event.target.value)}
                placeholder="Buscar usuário..."
                className="h-10 rounded-lg border border-[#E5E7EB] px-3 text-[13px] outline-none focus:border-[#F05D28]"
              />
              <div className="mt-3 flex-1 overflow-auto">
                {userPickerResults.length === 0 ? (
                  <p className="px-1 py-2 text-[12px] text-[#94A3B8]">Nenhum usuário encontrado.</p>
                ) : (
                  userPickerResults.map((user) => {
                    const marcado = marcadosUsuarios.includes(user.email);
                    return (
                      <button
                        key={user.email}
                        type="button"
                        onClick={() => toggleMarcado(user.email)}
                        className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-[13px] ${marcado ? 'bg-[#FFF3EC] text-[#B45309]' : 'text-[#2D2D2D] hover:bg-[#F9FAFB]'}`}
                      >
                        {user.nome || user.email}
                        {marcado && <Check size={14} />}
                      </button>
                    );
                  })
                )}
              </div>
              <button
                type="button"
                onClick={() => setUserPickerOpen(false)}
                className="mt-3 h-9 rounded-lg bg-[#F05D28] px-4 text-[12px] font-bold text-white hover:bg-[#D94E1F]"
              >
                Concluído
              </button>
            </div>
          </div>
        )}
      </div>,
      document.body,
    );
  }

  const minhasNotas = listaFiltrada.filter((sheet) => sheet.autorEmail === currentUser.email);
  const notasDeOutros = listaFiltrada.filter((sheet) => sheet.autorEmail !== currentUser.email);
  // So o autor ou um admin do sistema pode excluir a nota.
  const canDeleteSheet = (sheet: AnnotationSheet) => canDeleteNote(currentUser, sheet.autorEmail);

  const handleDeleteSheet = (sheet: AnnotationSheet) => {
    setOpenCardMenuId(null);
    if (window.confirm(`Excluir a anotação "${sheet.titulo || 'Sem título'}"?`)) void onDelete(sheet.id);
  };

  const renderCard = (sheet: AnnotationSheet) => {
    const os = uniqueOsOptions.find((item) => item.codigo === sheet.osCodigo);
    const sheetDisciplinas = getSheetDisciplinas(sheet);
    const subtitulo = filter.type === 'os'
      ? (sheetDisciplinas.length > 0 ? sheetDisciplinas.map((item) => getDisciplineDisplayName(item)).join(', ') : 'Sem disciplina')
      : (os ? `OS ${os.codigo} - ${os.nome}` : (filter.type === 'all' ? getDisciplineDisplayName(sheet.disciplina) : 'Personalizado'));
    const disciplinaNome = sheetDisciplinas.length === 1 ? getDisciplineDisplayName(sheetDisciplinas[0]) : '';
    const autorData = [sheet.autorNome, formatDateBR(sheet.criadoEm), disciplinaNome].filter(Boolean).join(' · ');
    const isPublica = sheet.publica !== false;
    const disciplinaIcon = sheetDisciplinas.length === 1 ? getDisciplineIconInfo(sheetDisciplinas[0]) : null;
    const DisciplinaIcon = disciplinaIcon?.icon;
    const marcadoParaMim = (sheet.marcadosUsuarios || []).includes(currentUser.email);

    return (
      <div key={sheet.id} className={`relative overflow-hidden rounded-xl p-4 shadow-[0_6px_16px_-12px_rgba(15,23,42,0.5)] transition-colors ${marcadoParaMim ? 'bg-[#FFF3EC]' : 'bg-white'}`}>
        {/* Selo redondo no canto, sem a faixa cinza que cortava o card ao meio. */}
        {disciplinaIcon && (
          <div
            title={disciplinaIcon.label}
            className="absolute right-9 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-[#F7C7B7] bg-white shadow-[0_2px_6px_rgba(240,93,40,0.14)]"
          >
            {disciplinaIcon.imageSrc
              ? <img src={disciplinaIcon.imageSrc} alt={disciplinaIcon.label} className="h-9 w-9 rounded-full object-cover" />
              : DisciplinaIcon ? <DisciplinaIcon size={22} className="text-[#F05D28]" /> : null}
          </div>
        )}

        <div
          role="button"
          tabIndex={0}
          onClick={() => openNote(sheet)}
          onKeyDown={(event) => { if (event.key === 'Enter') openNote(sheet); }}
          className="cursor-pointer pr-24 text-left"
        >
          <div className="flex items-center gap-1.5">
            <p className="truncate text-[13px] font-bold text-[#2D2D2D]">{sheet.titulo}</p>
            {isPublica
              ? <Globe size={12} className="flex-shrink-0 text-[#10B981]" />
              : <Lock size={12} className="flex-shrink-0 text-[#B45309]" />}
          </div>
          <p className="mt-1 text-[11px] font-medium text-[#94A3B8]">{subtitulo}</p>
          {autorData && <p className="mt-0.5 text-[11px] text-[#94A3B8]">{autorData}</p>}
        </div>

        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            const r = event.currentTarget.getBoundingClientRect();
            // Alinha a borda direita do menu (w-44 = 176px) ao botao; clampa dentro da viewport.
            setCardMenuPos({ x: Math.max(8, Math.min(r.right - 176, window.innerWidth - 184)), y: r.bottom + 4 });
            setOpenCardMenuId((prev) => (prev === sheet.id ? null : sheet.id));
          }}
          className="absolute right-2 top-2 z-10 flex h-6 w-6 items-center justify-center rounded-full text-[#94A3B8] hover:bg-[#F3F4F6] hover:text-[#2D2D2D]"
        >
          <MoreVertical size={14} />
        </button>

        {openCardMenuId === sheet.id && (
          <>
            <div className="fixed inset-0 z-[190]" onClick={() => setOpenCardMenuId(null)} />
            <div className="fixed z-[191] w-44 rounded-xl bg-white p-1.5 shadow-xl" style={{ left: cardMenuPos.x, top: cardMenuPos.y }}>
              <button
                type="button"
                onClick={() => { setOpenCardMenuId(null); exportNoteToCsv(sheet); }}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[12px] font-medium text-[#374151] hover:bg-[#F3F4F6]"
              >
                <FileSpreadsheet size={14} />
                Exportar XLS
              </button>
              <button
                type="button"
                onClick={() => {
                  setOpenCardMenuId(null);
                  const linkedTitles = (sheet.linkedNoteIds || [])
                    .map((id) => sheets.find((item) => item.id === id)?.titulo)
                    .filter((title): title is string => Boolean(title));
                  exportNoteToPdf(sheet, linkedTitles);
                }}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[12px] font-medium text-[#374151] hover:bg-[#F3F4F6]"
              >
                <FileText size={14} />
                Exportar PDF
              </button>
              {canDeleteSheet(sheet) && (
                <button
                  type="button"
                  onClick={() => handleDeleteSheet(sheet)}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[12px] font-medium text-[#DC2626] hover:bg-[#FEE2E2]"
                >
                  <Trash2 size={14} />
                  Excluir
                </button>
              )}
            </div>
          </>
        )}
      </div>
    );
  };

  const filtroClass = 'h-11 w-[200px] rounded-xl border border-[#E5E7EB] bg-white px-3 text-[13px] font-medium text-[#2D2D2D] outline-none focus:border-[#F05D28]';

  return (
    <div>
      {visiveis.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <SearchableSelect
            value={listaAutor}
            onChange={(event) => setListaAutor(event.target.value)}
            searchPlaceholder="Pesquisar autor..."
            className={filtroClass}
          >
            <option value="">Todos os autores</option>
            <option value={AUTOR_EU}>Criado por mim</option>
            {autoresDisponiveis.map((user) => (
              <option key={user.email} value={user.email}>{user.nome || user.email}</option>
            ))}
          </SearchableSelect>
          <SearchableSelect
            value={listaContrato}
            onChange={(event) => { setListaContrato(event.target.value); setListaOs(''); }}
            searchPlaceholder="Pesquisar contrato..."
            className={filtroClass}
          >
            <option value="">Todos os contratos</option>
            {contractOptions.map((contrato) => (
              <option key={contrato.codigo} value={contrato.codigo}>{contrato.codigo} - {contrato.nome}</option>
            ))}
          </SearchableSelect>
          <SearchableSelect
            value={listaOs}
            onChange={(event) => setListaOs(event.target.value)}
            searchPlaceholder="Pesquisar OS..."
            className={filtroClass}
          >
            <option value="">Todas as OS</option>
            {osDaLista.map((os) => (
              <option key={os.codigo} value={os.codigo}>{formatOsLabel(os)}</option>
            ))}
          </SearchableSelect>
          <SearchableSelect
            value={listaDisciplina}
            onChange={(event) => setListaDisciplina(event.target.value)}
            searchPlaceholder="Pesquisar disciplina..."
            className={filtroClass}
          >
            <option value="">Todas as disciplinas</option>
            {getSectorOptions(disciplinaOptions).map((setor) => (
              <option key={setor} value={setor}>{setor}</option>
            ))}
          </SearchableSelect>
          {temFiltroLista && (
            <button
              type="button"
              onClick={limparFiltroLista}
              className="h-11 rounded-xl px-3 text-[12px] font-bold text-[#64748B] hover:text-[#F05D28]"
            >
              Limpar filtros
            </button>
          )}
          <button
            type="button"
            onClick={() => exportNotesToMarkdown(listaFiltrada, currentUser.email)}
            className="ml-auto inline-flex h-11 items-center gap-2 rounded-xl border border-[#E5E7EB] bg-white px-4 text-[13px] font-bold text-[#2D2D2D] hover:border-[#F7C7B7] hover:text-[#F05D28]"
          >
            <FileText size={15} />
            Exportar em .MD
          </button>
        </div>
      )}

      {listaFiltrada.length === 0 ? (
        <p className="text-[13px] text-[#757575]">
          {temFiltroLista
            ? 'Nenhuma nota com esses filtros.'
            : 'Nenhuma anotação encontrada ainda.'}
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div>
            <h4 className="mb-2 text-[12px] font-bold uppercase tracking-wide text-[#64748B]">Minhas notas</h4>
            {minhasNotas.length === 0 ? (
              <p className="text-[12px] text-[#94A3B8]">Você ainda não criou nenhuma anotação aqui.</p>
            ) : (
              <div className="flex flex-col gap-3">{minhasNotas.map(renderCard)}</div>
            )}
          </div>
          <div>
            <h4 className="mb-2 text-[12px] font-bold uppercase tracking-wide text-[#64748B]">Notas públicas de outros usuários</h4>
            {notasDeOutros.length === 0 ? (
              <p className="text-[12px] text-[#94A3B8]">Nenhuma anotação pública de outra pessoa aqui ainda.</p>
            ) : (
              <div className="flex flex-col gap-3">{notasDeOutros.map(renderCard)}</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
