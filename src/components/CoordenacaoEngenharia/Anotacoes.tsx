import React from 'react';
import { createPortal } from 'react-dom';
import { AlignCenter, AlignLeft, AlignRight, ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Brush, Calendar, Check, FileSpreadsheet, FileText, Globe, GripHorizontal, GripVertical, Link2, ListChecks, Lock, Merge, MoreVertical, Scaling, Settings, Split, Trash2, X } from 'lucide-react';
import SearchableSelect from '../SearchableSelect';
import { getDisciplineDisplayName, getDisciplineIconInfo, type EngineeringActivity } from '../Atividades';
import { disciplineMatchesSector, getSectorOptions, getDisciplineGroups } from '../../lib/disciplineCatalog';
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
  // Indices de coluna marcados como checklist: toda celula (r>=1) da coluna vira checkbox+texto.
  checklistCols?: number[];
  // Celulas marcadas individualmente como checklist (fora de checklistCols), por cellKey(r,c).
  checklistCells?: string[];
  // Estado "feito" do checkbox por cellKey(r,c) - separado do texto, que continua em rows/cell.
  checklistChecked?: Record<string, boolean>;
  // Nome editavel do bloco. Ausente = usa o default "Banco N".
  nome?: string;
}

export interface AnnotationTextBlock {
  id: string;
  texto: string;
  // Nome editavel do bloco. Ausente = usa o default "Nota N".
  nome?: string;
}

export interface AnnotationChecklistItem {
  id: string;
  texto: string;
  feito: boolean;
}

export interface AnnotationChecklist {
  id: string;
  itens: AnnotationChecklistItem[];
  // Nome editavel do bloco. Ausente = usa o default "Checklist N".
  nome?: string;
}

export interface AnnotationSheet {
  id: string;
  disciplina: string;
  titulo: string;
  osCodigo?: string;
  // Nota vinculada a varias OS (ver toggleOs). Ausente ou vazio = usa so o campo
  // osCodigo (comportamento antigo). osCodigo e sempre mantido = primeira desta lista,
  // pois ~20 outros arquivos (Notes, MindMap, Cronograma...) leem so o campo singular.
  osCodigos?: string[];
  // Nota de OS marcada em varias disciplinas (ver toggleDisciplina/markAllDisciplinas).
  // Ausente ou vazio = usa so o campo disciplina (comportamento antigo).
  disciplinas?: string[];
  bancos?: AnnotationBanco[];
  textos?: AnnotationTextBlock[];
  checklists?: AnnotationChecklist[];
  // Link colado do evento do Google Agenda (sem OAuth). Ausente = nota sem vinculo.
  googleEventUrl?: string;
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
  // Coluna do Kanban de "Minhas Notas". Ausente = tratado como 'criado' (nota antiga sem o campo).
  status?: 'criado' | 'iniciado' | 'concluido';
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

// Status de uma nota no Kanban - ausente (nota antiga) = 'criado'.
export function getSheetStatus(sheet: AnnotationSheet): 'criado' | 'iniciado' | 'concluido' {
  return sheet.status || 'criado';
}

// Concluida ha 10 dias ou mais (sem alteracao): sai do Kanban e vai pra aba "Notas Concluidas".
const DEZ_DIAS_MS = 10 * 24 * 60 * 60 * 1000;
export function isConcluidaAntiga(sheet: AnnotationSheet): boolean {
  if (getSheetStatus(sheet) !== 'concluido' || !sheet.updatedAt) return false;
  return (Date.now() - new Date(sheet.updatedAt).getTime()) >= DEZ_DIAS_MS;
}

// Disciplinas de uma nota, considerando o campo multiplo novo com fallback pro singular antigo.
export function getSheetDisciplinas(sheet: AnnotationSheet): string[] {
  if (sheet.disciplinas && sheet.disciplinas.length > 0) return sheet.disciplinas;
  return sheet.disciplina ? [sheet.disciplina] : [];
}

// OS de uma nota, considerando o campo multiplo novo com fallback pro singular antigo.
export function getSheetOsCodigos(sheet: AnnotationSheet): string[] {
  if (sheet.osCodigos && sheet.osCodigos.length > 0) return sheet.osCodigos;
  return sheet.osCodigo ? [sheet.osCodigo] : [];
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
    status: 'criado',
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

// ---- Rascunho anti-F5: backup local do editor, sem backend. ----
// Chave ecoquanta:nota-rascunho:<id> ("nova" quando a nota ainda nao tem id).
export interface NotaRascunho {
  ts: number;
  autorEmail: string;
  titulo: string;
  sheet: AnnotationSheet;
}

const RASCUNHO_PREFIXO = 'ecoquanta:nota-rascunho:';

function chaveRascunho(id: string) {
  return `${RASCUNHO_PREFIXO}${id}`;
}

export function lerRascunho(id: string): NotaRascunho | null {
  try {
    const raw = localStorage.getItem(chaveRascunho(id));
    return raw ? (JSON.parse(raw) as NotaRascunho) : null;
  } catch {
    return null;
  }
}

function salvarRascunho(id: string, sheet: AnnotationSheet, autorEmail: string) {
  try {
    localStorage.setItem(chaveRascunho(id), JSON.stringify({ ts: Date.now(), autorEmail, titulo: sheet.titulo, sheet }));
  } catch {
    // modo privado ou quota cheia: so nao persiste, o editor continua funcionando normalmente.
  }
}

export function removerRascunho(id: string) {
  try { localStorage.removeItem(chaveRascunho(id)); } catch { /* ignore */ }
}

// Rascunho de nota nunca salva (id ainda nao existe em `sheets`), do mesmo autor.
// Usado ao abrir uma nota nova: oferece continuar o que ficou pra tras num F5 anterior.
export function encontrarRascunhoOrfao(email: string, sheets: AnnotationSheet[], excludeId?: string): NotaRascunho | null {
  const salvos = new Set(sheets.map((sheet) => sheet.id));
  let melhor: NotaRascunho | null = null;
  for (let i = 0; i < localStorage.length; i += 1) {
    const chave = localStorage.key(i);
    if (!chave || !chave.startsWith(RASCUNHO_PREFIXO)) continue;
    const id = chave.slice(RASCUNHO_PREFIXO.length);
    if (id === excludeId || salvos.has(id)) continue;
    const rascunho = lerRascunho(id);
    if (rascunho && rascunho.autorEmail === email && (!melhor || rascunho.ts > melhor.ts)) melhor = rascunho;
  }
  return melhor;
}

// Pro menu Principal (item 5): qualquer rascunho nao salvo do usuario, o mais recente primeiro.
export function encontrarRascunhoRecente(email: string): NotaRascunho | null {
  let melhor: NotaRascunho | null = null;
  for (let i = 0; i < localStorage.length; i += 1) {
    const chave = localStorage.key(i);
    if (!chave || !chave.startsWith(RASCUNHO_PREFIXO)) continue;
    const rascunho = lerRascunho(chave.slice(RASCUNHO_PREFIXO.length));
    if (rascunho && rascunho.autorEmail === email && (!melhor || rascunho.ts > melhor.ts)) melhor = rascunho;
  }
  return melhor;
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
  const [exportMenuOpen, setExportMenuOpen] = React.useState(false);
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
  // Arrasto da alca "#" pra REORDENAR linha/coluna (drag-and-drop nativo, sem mouse tracking manual).
  const ordemArrastoRef = React.useRef<{ tipo: 'row' | 'col'; bancoIndex: number; indice: number } | null>(null);
  const [linkPickerOpen, setLinkPickerOpen] = React.useState(false);
  const [linkSearch, setLinkSearch] = React.useState('');
  const [userPickerOpen, setUserPickerOpen] = React.useState(false);
  const [userSearch, setUserSearch] = React.useState('');
  const [osPickerOpen, setOsPickerOpen] = React.useState(false);
  const [osPickerSearch, setOsPickerSearch] = React.useState('');
  const [disciplinaPickerOpen, setDisciplinaPickerOpen] = React.useState(false);
  const [disciplinaPickerSearch, setDisciplinaPickerSearch] = React.useState('');
  const [openCardMenuId, setOpenCardMenuId] = React.useState<string | null>(null);
  // Aba do painel direito do editor. null = segue a primeira disponivel (OS > Disciplina > Mapa).
  const [sidebarTab, setSidebarTab] = React.useState<'os' | 'disciplina' | 'mapa' | null>(null);
  // Chip selecionado dentro das abas OS/Disciplina, quando ha mais de um vinculo.
  const [sidebarOsCodigo, setSidebarOsCodigo] = React.useState<string | null>(null);
  const [sidebarDisciplina, setSidebarDisciplina] = React.useState<string | null>(null);
  const [contratoFiltro, setContratoFiltro] = React.useState('');
  // Filtro da lista de notas (Autor > Contrato > OS > Disciplina), independente do filtro do editor.
  const [listaAutor, setListaAutor] = React.useState('');
  const [listaContrato, setListaContrato] = React.useState('');
  const [listaOs, setListaOs] = React.useState('');
  const [listaDisciplina, setListaDisciplina] = React.useState('');
  const [listaVinculo, setListaVinculo] = React.useState('');
  // Aba ativa da lista de notas: minhas (Kanban), publicas de outros, ou concluidas ha 10+ dias.
  const [notasTab, setNotasTab] = React.useState<'minhas' | 'publicas' | 'concluidas'>('minhas');
  // Menu do card em posicao FIXED (calculada do botao) para nao ser recortado pelo overflow-hidden do card.
  const [cardMenuPos, setCardMenuPos] = React.useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const textoRefs = React.useRef<Record<string, HTMLTextAreaElement | null>>({});
  // Rascunho anti-F5 encontrado ao abrir a nota (mais novo que o que esta salvo). null = nenhum.
  const [rascunhoDisponivel, setRascunhoDisponivel] = React.useState<NotaRascunho | null>(null);

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

  // Autosave anti-F5: grava `editing` no localStorage com debounce a cada mudanca, enquanto
  // o editor estiver aberto e a pessoa puder editar (leitura nunca escreve rascunho por cima).
  React.useEffect(() => {
    if (!editing) return;
    const jaSalva = sheets.some((sheet) => sheet.id === editing.id);
    const podeSalvar = !jaSalva || canEditNote(currentUser, editing.autorEmail, editing.marcadosUsuarios);
    if (!podeSalvar) return;
    const timer = setTimeout(() => salvarRascunho(editing.id || 'nova', editing, currentUser.email), 800);
    return () => clearTimeout(timer);
  }, [editing, sheets, currentUser]);

  // Ao abrir uma nota (ou uma nova), procura um rascunho pra oferecer "continuar de onde parou".
  // So roda quando o id muda (abrir/trocar de nota) - nao a cada tecla, senao o autosave que
  // acabou de gravar reapareceria como "rascunho encontrado" a cada digitacao.
  React.useEffect(() => {
    if (!editing) { setRascunhoDisponivel(null); return; }
    const jaSalva = sheets.some((sheet) => sheet.id === editing.id);
    const rascunho = jaSalva
      ? lerRascunho(editing.id)
      : encontrarRascunhoOrfao(currentUser.email, sheets, editing.id);
    const valeAPena = rascunho && (!jaSalva || rascunho.ts > new Date(editing.updatedAt || 0).getTime());
    setRascunhoDisponivel(valeAPena ? rascunho : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing?.id]);

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
    setSidebarOsCodigo(null);
    setSidebarDisciplina(null);
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

  // checklistCells/checklistChecked usam a mesma chave cellKey(r,c) dos styles - remapStyles so
  // olha a chave (nunca o formato do valor), entao da pra reusar pra remapear os dois tambem.
  type Move = (r: number, c: number) => { r: number; c: number } | null;
  const remapChecklistCells = (cells: string[] | undefined, move: Move) => {
    if (!cells) return undefined;
    const asRecord: Record<string, CellStyle> = {};
    cells.forEach((key) => { asRecord[key] = {}; });
    return Object.keys(remapStyles(asRecord, move) || {});
  };
  const remapChecklistChecked = (checked: Record<string, boolean> | undefined, move: Move) => (
    remapStyles(checked as unknown as Record<string, CellStyle> | undefined, move) as unknown as Record<string, boolean> | undefined
  );
  const insertRow = (bancoIndex: number, at: number) => updateBanco(bancoIndex, (banco) => {
    const rows = [...banco.rows];
    rows.splice(at, 0, Array.from({ length: banco.colCount }, () => ''));
    const move: Move = (r, c) => ({ r: r >= at ? r + 1 : r, c });
    return {
      ...banco,
      rows,
      styles: remapStyles(banco.styles, move),
      merges: remapMerges(banco.merges, 'row', at, 1),
      rowHeights: spliceSizes(banco.rowHeights, at, 1, BANCO_ROW_HEIGHT, banco.rows.length),
      checklistCells: remapChecklistCells(banco.checklistCells, move),
      checklistChecked: remapChecklistChecked(banco.checklistChecked, move),
    };
  });
  const removeRow = (bancoIndex: number, at: number) => updateBanco(bancoIndex, (banco) => {
    if (banco.rows.length <= 1) return banco;
    const move: Move = (r, c) => (r === at ? null : { r: r > at ? r - 1 : r, c });
    return {
      ...banco,
      rows: banco.rows.filter((_, ri) => ri !== at),
      styles: remapStyles(banco.styles, move),
      merges: remapMerges(banco.merges, 'row', at, -1),
      rowHeights: spliceSizes(banco.rowHeights, at, -1, BANCO_ROW_HEIGHT, banco.rows.length),
      checklistCells: remapChecklistCells(banco.checklistCells, move),
      checklistChecked: remapChecklistChecked(banco.checklistChecked, move),
    };
  });
  const insertCol = (bancoIndex: number, at: number) => updateBanco(bancoIndex, (banco) => {
    const move: Move = (r, c) => ({ r, c: c >= at ? c + 1 : c });
    return {
      ...banco,
      rows: banco.rows.map((row) => {
        const next = [...row];
        next.splice(at, 0, '');
        return next;
      }),
      colCount: banco.colCount + 1,
      styles: remapStyles(banco.styles, move),
      merges: remapMerges(banco.merges, 'col', at, 1),
      colWidths: spliceSizes(banco.colWidths, at, 1, BANCO_COL_WIDTH, banco.colCount),
      checklistCols: banco.checklistCols?.map((c) => (c >= at ? c + 1 : c)),
      checklistCells: remapChecklistCells(banco.checklistCells, move),
      checklistChecked: remapChecklistChecked(banco.checklistChecked, move),
    };
  });
  const removeCol = (bancoIndex: number, at: number) => updateBanco(bancoIndex, (banco) => {
    if (banco.colCount <= 1) return banco;
    const move: Move = (r, c) => (c === at ? null : { r, c: c > at ? c - 1 : c });
    return {
      ...banco,
      rows: banco.rows.map((row) => row.filter((_, ci) => ci !== at)),
      colCount: banco.colCount - 1,
      styles: remapStyles(banco.styles, move),
      merges: remapMerges(banco.merges, 'col', at, -1),
      colWidths: spliceSizes(banco.colWidths, at, -1, BANCO_COL_WIDTH, banco.colCount),
      checklistCols: banco.checklistCols?.filter((c) => c !== at).map((c) => (c > at ? c - 1 : c)),
      checklistCells: remapChecklistCells(banco.checklistCells, move),
      checklistChecked: remapChecklistChecked(banco.checklistChecked, move),
    };
  });
  // Liga/desliga a coluna `col` como checklist (usado no menu de contexto da celula).
  const toggleChecklistCol = (bancoIndex: number, col: number) => updateBanco(bancoIndex, (banco) => {
    const atual = banco.checklistCols || [];
    return { ...banco, checklistCols: atual.includes(col) ? atual.filter((c) => c !== col) : [...atual, col] };
  });
  // Liga/desliga UMA celula como checklist (independente da coluna inteira).
  const toggleChecklistCell = (bancoIndex: number, r: number, c: number) => updateBanco(bancoIndex, (banco) => {
    const key = cellKey(r, c);
    const atual = banco.checklistCells || [];
    return { ...banco, checklistCells: atual.includes(key) ? atual.filter((k) => k !== key) : [...atual, key] };
  });
  // So o estado "feito" do checkbox - o texto da celula continua no updateCell de sempre.
  const toggleChecklistChecked = (bancoIndex: number, r: number, c: number) => updateBanco(bancoIndex, (banco) => {
    const key = cellKey(r, c);
    return { ...banco, checklistChecked: { ...banco.checklistChecked, [key]: !banco.checklistChecked?.[key] } };
  });

  // ---- Reordenar linha/coluna (drag da alca "#") ----
  // Pura e testavel: velho indice -> novo indice apos mover de `from` pra `to`.
  // Ex.: calcularNovoIndice(0, 0, 2) === 2; calcularNovoIndice(1, 0, 2) === 0; calcularNovoIndice(2, 0, 2) === 1.
  const calcularNovoIndice = (velho: number, from: number, to: number) => {
    if (velho === from) return to;
    if (from < to) return velho > from && velho <= to ? velho - 1 : velho;
    return velho >= to && velho < from ? velho + 1 : velho;
  };
  const moverPosicao = <T,>(lista: T[], from: number, to: number): T[] => {
    const copia = [...lista];
    const [item] = copia.splice(from, 1);
    copia.splice(to, 0, item);
    return copia;
  };
  const moveRow = (bancoIndex: number, from: number, to: number) => updateBanco(bancoIndex, (banco) => {
    if (from === to || from < 0 || to < 0 || from >= banco.rows.length || to >= banco.rows.length) return banco;
    const rMin = Math.min(from, to);
    const rMax = Math.max(from, to);
    // ponytail: merge de mais de 1 linha cruzando o trecho movido bloqueia o reorder (no-op) em vez
    // de remendar a mesclagem. Desfaca o merge antes se precisar mover atraves dele.
    if ((banco.merges || []).some((m) => m.rowSpan > 1 && m.r <= rMax && m.r + m.rowSpan - 1 >= rMin)) return banco;
    return {
      ...banco,
      rows: moverPosicao(banco.rows, from, to),
      rowHeights: moverPosicao(Array.from({ length: banco.rows.length }, (_, i) => banco.rowHeights?.[i] ?? BANCO_ROW_HEIGHT), from, to),
      styles: remapStyles(banco.styles, (r, c) => ({ r: calcularNovoIndice(r, from, to), c })),
      merges: (banco.merges || []).map((m) => ({ ...m, r: calcularNovoIndice(m.r, from, to) })),
      checklistCells: remapChecklistCells(banco.checklistCells, (r, c) => ({ r: calcularNovoIndice(r, from, to), c })),
      checklistChecked: remapChecklistChecked(banco.checklistChecked, (r, c) => ({ r: calcularNovoIndice(r, from, to), c })),
    };
  });
  const moveCol = (bancoIndex: number, from: number, to: number) => updateBanco(bancoIndex, (banco) => {
    if (from === to || from < 0 || to < 0 || from >= banco.colCount || to >= banco.colCount) return banco;
    const cMin = Math.min(from, to);
    const cMax = Math.max(from, to);
    // ponytail: mesmo limite acima, no eixo coluna.
    if ((banco.merges || []).some((m) => m.colSpan > 1 && m.c <= cMax && m.c + m.colSpan - 1 >= cMin)) return banco;
    return {
      ...banco,
      rows: banco.rows.map((row) => moverPosicao(row, from, to)),
      colWidths: moverPosicao(Array.from({ length: banco.colCount }, (_, i) => banco.colWidths?.[i] ?? BANCO_COL_WIDTH), from, to),
      styles: remapStyles(banco.styles, (r, c) => ({ r, c: calcularNovoIndice(c, from, to) })),
      merges: (banco.merges || []).map((m) => ({ ...m, c: calcularNovoIndice(m.c, from, to) })),
      checklistCols: banco.checklistCols?.map((c) => calcularNovoIndice(c, from, to)),
      checklistCells: remapChecklistCells(banco.checklistCells, (r, c) => ({ r, c: calcularNovoIndice(c, from, to) })),
      checklistChecked: remapChecklistChecked(banco.checklistChecked, (r, c) => ({ r, c: calcularNovoIndice(c, from, to) })),
    };
  });

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
      : filter.type === 'disciplina' ? getSheetDisciplinas(sheet).includes(filter.value) : getSheetOsCodigos(sheet).includes(filter.value);
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
    .filter((sheet) => !listaContrato || getSheetOsCodigos(sheet).some((codigo) => codigosDoContrato.has(codigo)))
    .filter((sheet) => !listaOs || getSheetOsCodigos(sheet).includes(listaOs))
    // Filtro fala em setor: escolher 'Arquitetura' traz URB, LAY, LUM...
    .filter((sheet) => !listaDisciplina || getSheetDisciplinas(sheet).some((item) => disciplineMatchesSector(item, listaDisciplina)))
    .filter((sheet) => listaVinculo !== 'vinculado' || (sheet.marcadosUsuarios || []).includes(currentUser.email));
  const temFiltroLista = Boolean(listaAutor || listaContrato || listaOs || listaDisciplina || listaVinculo);
  const limparFiltroLista = () => { setListaAutor(''); setListaContrato(''); setListaOs(''); setListaDisciplina(''); setListaVinculo(''); };
  // Autores que aparecem no seletor: os cadastrados no sistema, sem o proprio usuario
  // (ele ja tem a opcao "Criado por mim").
  const autoresDisponiveis = usuarios
    .filter((user) => user.email !== currentUser.email)
    .sort((a, b) => (a.nome || a.email).localeCompare(b.nome || b.email, 'pt-BR'));
  const closeEditing = () => {
    setEditing(null);
    setContextMenu(null);
    setLinkPickerOpen(false);
    setRascunhoDisponivel(null);
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
    const updateGoogleEventUrl = (googleEventUrl: string) => setEditing((prev) => (prev ? { ...prev, googleEventUrl } : prev));
    const toggleOs = (codigo: string) => setEditing((prev) => {
      if (!prev) return prev;
      const current = getSheetOsCodigos(prev);
      const next = current.includes(codigo) ? current.filter((item) => item !== codigo) : [...current, codigo];
      // osCodigo (legado) sempre = primeira da lista: ~20 outros arquivos ainda leem so ele.
      return { ...prev, osCodigos: next, osCodigo: next[0] || undefined };
    });
    const toggleDisciplina = (disciplina: string) => setEditing((prev) => {
      if (!prev) return prev;
      const current = getSheetDisciplinas(prev);
      const next = current.includes(disciplina) ? current.filter((item) => item !== disciplina) : [...current, disciplina];
      return { ...prev, disciplinas: next, disciplina: next[0] || '' };
    });
    const markAllDisciplinas = () => setEditing((prev) => (
      prev ? { ...prev, disciplinas: [...disciplinaGroupOptions], disciplina: disciplinaGroupOptions[0] || '' } : prev
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
    const updateTextoBlockNome = (index: number, nome: string) => setEditing((prev) => {
      if (!prev) return prev;
      return { ...prev, textos: (prev.textos ?? []).map((bloco, i) => (i === index ? { ...bloco, nome } : bloco)) };
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

    // OS e disciplina agora se vinculam so pelos botoes do rodape (Vincular OS/Disciplina) -
    // OS opcional, disciplina obrigatoria (pelo menos uma).
    const disciplinaPendente = selectedDisciplinas.length === 0;

    const handleSave = async () => {
      if (!editing.titulo.trim() || disciplinaPendente) return;
      setSaving(true);
      try {
        await onSave({ ...editing, updatedAt: new Date().toISOString() });
        removerRascunho(editing.id || 'nova');
        closeEditing();
      } finally {
        setSaving(false);
      }
    };

    const continuarRascunho = () => {
      if (!rascunhoDisponivel) return;
      setEditing(normalizeForEditing(rascunhoDisponivel.sheet));
      setRascunhoDisponivel(null);
    };
    const descartarRascunho = () => {
      if (!rascunhoDisponivel) return;
      removerRascunho(rascunhoDisponivel.sheet.id || 'nova');
      setRascunhoDisponivel(null);
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
    const osPickerResults = osFiltradas.filter((os) => {
      const query = normalizeText(osPickerSearch);
      return !query || normalizeText(formatOsLabel(os)).includes(query);
    });
    // Picker "Vincular Disciplina" oferece os GRUPOS (nao mais as disciplinas finas de disciplinaOptions).
    const disciplinaGroupOptions = getDisciplineGroups();
    const disciplinaPickerResults = disciplinaGroupOptions.filter((disciplina) => {
      const query = normalizeText(disciplinaPickerSearch);
      return !query || normalizeText(getDisciplineDisplayName(disciplina)).includes(query);
    });

    // Painel direito: cronograma da OS, cronograma da disciplina, ou o mapa mental.
    // As duas primeiras abas so existem depois que o usuario vincula OS / disciplina.
    // Com varios vinculos, um chip escolhe qual OS/disciplina o cronograma mostra.
    const editingOsCodigos = getSheetOsCodigos(editing);
    const osCodigoAtivo = (sidebarOsCodigo && editingOsCodigos.includes(sidebarOsCodigo)) ? sidebarOsCodigo : editingOsCodigos[0];
    const disciplinaAtiva = (sidebarDisciplina && selectedDisciplinas.includes(sidebarDisciplina)) ? sidebarDisciplina : selectedDisciplinas[0];
    const osActivities = osCodigoAtivo
      ? activities.filter((activity) => activity.osCodigo === osCodigoAtivo)
      : [];
    const disciplinaActivities = disciplinaAtiva
      // disciplinaAtiva agora é um grupo (T20); as atividades guardam disciplina fina.
      // Casa por setor/grupo, igual a lista de notas — comparar displayName não casava.
      ? activities.filter((activity) => activity.disciplinas.some((disciplina) => disciplineMatchesSector(disciplina, disciplinaAtiva)))
      : [];
    const sidebarTabs: Array<{ key: 'os' | 'disciplina' | 'mapa'; label: string }> = [
      ...(editingOsCodigos.length > 0 ? [{ key: 'os' as const, label: 'Ordem de Serviço' }] : []),
      ...(selectedDisciplinas.length > 0 ? [{ key: 'disciplina' as const, label: 'Disciplina' }] : []),
      { key: 'mapa' as const, label: 'Mapa Mental' },
    ];
    // Se a aba escolhida sumiu (usuario removeu o vinculo, por ex.), cai na primeira disponivel.
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
          {rascunhoDisponivel && (
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#FED7AA] bg-[#FFF7ED] px-4 py-3">
              <p className="text-[12px] font-medium text-[#B45309]">
                Encontramos um rascunho não salvo desta nota, de {new Date(rascunhoDisponivel.ts).toLocaleString('pt-BR')}. Continuar de onde parou?
              </p>
              <div className="flex flex-shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={continuarRascunho}
                  className="h-8 rounded-lg bg-[#F05D28] px-3 text-[12px] font-bold text-white hover:bg-[#D94E1F]"
                >
                  Continuar de onde parou
                </button>
                <button
                  type="button"
                  onClick={descartarRascunho}
                  className="h-8 rounded-lg border border-[#FED7AA] bg-white px-3 text-[12px] font-bold text-[#B45309] hover:bg-[#FFF3EC]"
                >
                  Descartar
                </button>
              </div>
            </div>
          )}
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

          <div className="mt-2 flex flex-wrap items-center gap-2 text-[12px] text-[#64748B]">
            <Calendar size={12} />
            <span className="font-bold">Google Agenda</span>
            {podeEditar && (
              <input
                type="url"
                value={editing.googleEventUrl || ''}
                onChange={(event) => updateGoogleEventUrl(event.target.value)}
                placeholder="Colar link do evento do Google Agenda"
                className="h-7 min-w-[220px] flex-1 rounded-lg border border-[#E5E7EB] bg-white px-2 text-[12px] text-[#2D2D2D] outline-none focus:border-[#F05D28]"
              />
            )}
            {editing.googleEventUrl && /^https?:\/\//.test(editing.googleEventUrl) && (
              <a
                href={editing.googleEventUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 font-bold text-[#F05D28] hover:underline"
              >
                <Link2 size={12} />
                Abrir evento
              </a>
            )}
          </div>

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
                      {podeEditar ? (
                        <input
                          value={banco.nome ?? ''}
                          onChange={(event) => updateBanco(bancoIndex, (b) => ({ ...b, nome: event.target.value }))}
                          placeholder={`Banco ${bancoIndex + 1}`}
                          className="h-6 w-28 rounded-md border border-transparent bg-transparent px-1 text-[11px] font-bold text-[#64748B] outline-none focus:border-[#F05D28] focus:bg-white"
                        />
                      ) : (
                        <span className="text-[11px] font-bold text-[#64748B]">{banco.nome || `Banco ${bancoIndex + 1}`}</span>
                      )}
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
                  {/* pl-4/pt-4: calha pras alcas "#" ficarem FORA das celulas (sem sobrepor checklist). */}
                  <div className="overflow-auto pl-4 pt-4">
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
                                  onDragOver={(event) => {
                                    const alvo = ordemArrastoRef.current;
                                    if (alvo && alvo.bancoIndex === bancoIndex) event.preventDefault();
                                  }}
                                  onDrop={(event) => {
                                    const alvo = ordemArrastoRef.current;
                                    ordemArrastoRef.current = null;
                                    if (!alvo || alvo.bancoIndex !== bancoIndex) return;
                                    event.preventDefault();
                                    if (alvo.tipo === 'row') moveRow(bancoIndex, alvo.indice, r);
                                    else moveCol(bancoIndex, alvo.indice, c);
                                  }}
                                  style={{ backgroundColor: estilo?.bg || (r === 0 ? '#F3F4F6' : '#FFFFFF'), height: `${alturaCelulaPx}px` }}
                                  className={`relative border border-[#E5E7EB] p-0 ${selecionada ? 'shadow-[inset_0_0_0_2px_#F05D28]' : ''} ${pincel ? 'cursor-copy' : ''}`}
                                >
                                  {/* Celula de checklist (coluna inteira via checklistCols OU celula avulsa via
                                      checklistCells), r>=1: checkbox + texto lado a lado. r===0 continua
                                      textarea normal (titulo/rotulo), mesmo numa coluna de checklist. */}
                                  {r > 0 && (banco.checklistCols?.includes(c) || banco.checklistCells?.includes(cellKey(r, c))) ? (
                                    <div className="flex h-full w-full items-center gap-1.5 px-1.5">
                                      <input
                                        type="checkbox"
                                        checked={banco.checklistChecked?.[cellKey(r, c)] ?? false}
                                        disabled={!podeEditar}
                                        onChange={() => toggleChecklistChecked(bancoIndex, r, c)}
                                        className="h-4 w-4 flex-shrink-0 accent-[#F05D28] cursor-pointer"
                                      />
                                      <textarea
                                        value={cell}
                                        onChange={(event) => updateCell(bancoIndex, r, c, event.target.value)}
                                        readOnly={!podeEditar}
                                        spellCheck
                                        lang="pt-BR"
                                        style={cellCss(estilo)}
                                        className="h-full flex-1 resize-none overflow-auto bg-transparent py-1.5 leading-[1.4] outline-none text-[#374151]"
                                      />
                                    </div>
                                  ) : (
                                    // textarea (nao input) pra que o texto quebre em varias linhas.
                                    <textarea
                                      value={cell}
                                      onChange={(event) => updateCell(bancoIndex, r, c, event.target.value)}
                                      readOnly={!podeEditar}
                                      spellCheck
                                      lang="pt-BR"
                                      style={cellCss(estilo)}
                                      className={`h-full w-full resize-none overflow-auto bg-transparent px-2 py-1.5 leading-[1.4] outline-none ${r === 0 && !estilo ? 'font-bold text-[#2D2D2D]' : 'text-[#374151]'}`}
                                    />
                                  )}
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
                                  {/* Alcas de REORDENAR (drag nativo): "#" a esquerda da linha, "#" no topo da coluna. */}
                                  {podeEditar && c === 0 && (
                                    <div
                                      draggable
                                      title="Arrastar para reordenar a linha"
                                      onMouseDown={(event) => event.stopPropagation()}
                                      onDragStart={(event) => {
                                        event.stopPropagation();
                                        event.dataTransfer.effectAllowed = 'move';
                                        event.dataTransfer.setData('text/plain', '');
                                        ordemArrastoRef.current = { tipo: 'row', bancoIndex, indice: r };
                                      }}
                                      className="absolute -left-3.5 top-1/2 -translate-y-1/2 cursor-grab text-[#F05D28] opacity-30 hover:opacity-100"
                                    >
                                      <GripVertical size={12} />
                                    </div>
                                  )}
                                  {podeEditar && r === 0 && (
                                    <div
                                      draggable
                                      title="Arrastar para reordenar a coluna"
                                      onMouseDown={(event) => event.stopPropagation()}
                                      onDragStart={(event) => {
                                        event.stopPropagation();
                                        event.dataTransfer.effectAllowed = 'move';
                                        event.dataTransfer.setData('text/plain', '');
                                        ordemArrastoRef.current = { tipo: 'col', bancoIndex, indice: c };
                                      }}
                                      className="absolute left-1/2 -top-3.5 -translate-x-1/2 cursor-grab text-[#F05D28] opacity-30 hover:opacity-100"
                                    >
                                      <GripHorizontal size={12} />
                                    </div>
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
                    <h4 className="flex items-center text-[13px] font-bold text-[#2D2D2D]">
                      {podeEditar ? (
                        <input
                          value={lista.nome ?? ''}
                          onChange={(event) => updateChecklist(index, (l) => ({ ...l, nome: event.target.value }))}
                          placeholder={`Checklist ${index + 1}`}
                          className="h-6 w-32 rounded-md border border-transparent bg-transparent px-1 text-[13px] font-bold text-[#2D2D2D] outline-none focus:border-[#F05D28] focus:bg-[#F9FAFB]"
                        />
                      ) : (
                        <span>{lista.nome || `Checklist ${index + 1}`}</span>
                      )}
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
                      {podeEditar ? (
                        <input
                          value={bloco.nome ?? ''}
                          onChange={(event) => updateTextoBlockNome(index, event.target.value)}
                          placeholder={`Nota ${index + 1}`}
                          className="h-6 w-32 rounded-md border border-transparent bg-transparent px-1 text-[13px] font-bold text-[#2D2D2D] outline-none focus:border-[#F05D28] focus:bg-[#F9FAFB]"
                        />
                      ) : (
                        <h4 className="text-[13px] font-bold text-[#2D2D2D]">{bloco.nome || `Nota ${index + 1}`}</h4>
                      )}
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
                <button
                  type="button"
                  onClick={() => { setOsPickerOpen(true); setOsPickerSearch(''); }}
                  className="text-[12px] font-bold text-[#F05D28] hover:underline"
                >
                  Vincular Ordem de Serviço
                </button>
                <button
                  type="button"
                  onClick={() => { setDisciplinaPickerOpen(true); setDisciplinaPickerSearch(''); }}
                  className="text-[12px] font-bold text-[#F05D28] hover:underline"
                >
                  Vincular Disciplina
                </button>
              </div>
            )}
            {editingOsCodigos.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {editingOsCodigos.map((codigo) => {
                  const os = uniqueOsOptions.find((item) => item.codigo === codigo);
                  return (
                    <span key={codigo} className="inline-flex items-center gap-1.5 rounded-full border border-[#E5E7EB] bg-[#F9FAFB] py-1 pl-3 pr-1.5 text-[12px] font-medium text-[#2D2D2D]">
                      {os ? formatOsLabel(os) : codigo}
                      {podeEditar && (
                        <button
                          type="button"
                          onClick={() => toggleOs(codigo)}
                          className="flex h-5 w-5 items-center justify-center rounded-full text-[#94A3B8] hover:bg-[#FEE2E2] hover:text-[#DC2626]"
                        >
                          <X size={11} />
                        </button>
                      )}
                    </span>
                  );
                })}
              </div>
            )}

            {selectedDisciplinas.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {selectedDisciplinas.map((disciplina) => (
                  <span key={disciplina} className="inline-flex items-center gap-1.5 rounded-full border border-[#E5E7EB] bg-[#F9FAFB] py-1 pl-3 pr-1.5 text-[12px] font-medium text-[#2D2D2D]">
                    {getDisciplineDisplayName(disciplina)}
                    {podeEditar && (
                      <button
                        type="button"
                        onClick={() => toggleDisciplina(disciplina)}
                        className="flex h-5 w-5 items-center justify-center rounded-full text-[#94A3B8] hover:bg-[#FEE2E2] hover:text-[#DC2626]"
                      >
                        <X size={11} />
                      </button>
                    )}
                  </span>
                ))}
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
          {/* Varias OS/disciplinas vinculadas: chip escolhe qual cronograma a aba mostra. */}
          {abaAtiva === 'os' && editingOsCodigos.length > 1 && (
            <div className="mb-3 flex flex-wrap gap-1.5">
              {editingOsCodigos.map((codigo) => (
                <button
                  key={codigo}
                  type="button"
                  onClick={() => setSidebarOsCodigo(codigo)}
                  className={`h-7 rounded-full px-2.5 text-[11px] font-bold transition-colors ${osCodigoAtivo === codigo ? 'bg-[#2D2D2D] text-white' : 'border border-[#E5E7EB] bg-white text-[#64748B] hover:border-[#F7C7B7] hover:text-[#F05D28]'}`}
                >
                  {codigo}
                </button>
              ))}
            </div>
          )}
          {abaAtiva === 'disciplina' && selectedDisciplinas.length > 1 && (
            <div className="mb-3 flex flex-wrap gap-1.5">
              {selectedDisciplinas.map((disciplina) => (
                <button
                  key={disciplina}
                  type="button"
                  onClick={() => setSidebarDisciplina(disciplina)}
                  className={`h-7 rounded-full px-2.5 text-[11px] font-bold transition-colors ${disciplinaAtiva === disciplina ? 'bg-[#2D2D2D] text-white' : 'border border-[#E5E7EB] bg-white text-[#64748B] hover:border-[#F7C7B7] hover:text-[#F05D28]'}`}
                >
                  {getDisciplineDisplayName(disciplina)}
                </button>
              ))}
            </div>
          )}
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
                left: Math.max(8, Math.min(contextMenu.x, window.innerWidth - (sugestoesOrtografia.length ? 540 : 272) - 8)),
                top: Math.max(8, Math.min(contextMenu.y, window.innerHeight - 430)),
                maxHeight: 'calc(100vh - 16px)',
              }}
            >
            <div className="w-64 max-h-[90vh] overflow-y-auto rounded-xl bg-white p-2 shadow-xl">
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
                  onClick={() => { toggleChecklistCol(contextMenu.bancoIndex, contextMenu.col); setContextMenu(null); }}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[12px] font-medium text-[#374151] hover:bg-[#F3F4F6]"
                >
                  <ListChecks size={14} />
                  {(editing.bancos ?? [])[contextMenu.bancoIndex]?.checklistCols?.includes(contextMenu.col)
                    ? 'Desmarcar coluna de checklist'
                    : 'Marcar como coluna de checklist'}
                </button>
                <button
                  type="button"
                  onClick={() => { toggleChecklistCell(contextMenu.bancoIndex, contextMenu.row, contextMenu.col); setContextMenu(null); }}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[12px] font-medium text-[#374151] hover:bg-[#F3F4F6]"
                >
                  <ListChecks size={14} />
                  {(editing.bancos ?? [])[contextMenu.bancoIndex]?.checklistCells?.includes(cellKey(contextMenu.row, contextMenu.col))
                    ? 'Desmarcar célula de checklist'
                    : 'Marcar célula de checklist'}
                </button>
                <div className="mt-1.5 border-t border-[#F1F5F9] pt-1.5">
                  <button
                    type="button"
                    onClick={() => { insertRow(contextMenu.bancoIndex, contextMenu.row); setContextMenu(null); setSelecao(null); }}
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[12px] font-medium text-[#374151] hover:bg-[#F3F4F6]"
                  >
                    <ArrowUp size={14} />
                    Inserir linha acima
                  </button>
                  <button
                    type="button"
                    onClick={() => { insertRow(contextMenu.bancoIndex, contextMenu.row + 1); setContextMenu(null); setSelecao(null); }}
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[12px] font-medium text-[#374151] hover:bg-[#F3F4F6]"
                  >
                    <ArrowDown size={14} />
                    Inserir linha abaixo
                  </button>
                  <button
                    type="button"
                    onClick={() => { insertCol(contextMenu.bancoIndex, contextMenu.col); setContextMenu(null); setSelecao(null); }}
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[12px] font-medium text-[#374151] hover:bg-[#F3F4F6]"
                  >
                    <ArrowLeft size={14} />
                    Inserir coluna à esquerda
                  </button>
                  <button
                    type="button"
                    onClick={() => { insertCol(contextMenu.bancoIndex, contextMenu.col + 1); setContextMenu(null); setSelecao(null); }}
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[12px] font-medium text-[#374151] hover:bg-[#F3F4F6]"
                  >
                    <ArrowRight size={14} />
                    Inserir coluna à direita
                  </button>
                </div>
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
              <div className="w-64 max-h-[90vh] overflow-y-auto rounded-xl bg-white p-2 shadow-xl">
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

        {osPickerOpen && (
          <div className="fixed inset-0 z-[220] flex items-center justify-center bg-slate-950/40 p-4" onClick={() => setOsPickerOpen(false)}>
            <div className="flex max-h-[70vh] w-full max-w-md flex-col overflow-hidden rounded-xl bg-white p-4 shadow-xl" onClick={(event) => event.stopPropagation()}>
              {contractOptions.length > 0 && (
                <SearchableSelect
                  value={contratoFiltro}
                  onChange={(event) => setContratoFiltro(event.target.value)}
                  title="Filtra a lista de OS por contrato"
                  searchPlaceholder="Todos os contratos"
                  className={`${campoClass} mb-2 w-full`}
                >
                  <option value="">Todos os contratos</option>
                  {contractOptions.map((contrato) => (
                    <option key={contrato.codigo} value={contrato.codigo}>{contrato.codigo} - {contrato.nome}</option>
                  ))}
                </SearchableSelect>
              )}
              <input
                autoFocus
                value={osPickerSearch}
                onChange={(event) => setOsPickerSearch(event.target.value)}
                placeholder="Buscar OS..."
                className="h-10 rounded-lg border border-[#E5E7EB] px-3 text-[13px] outline-none focus:border-[#F05D28]"
              />
              <div className="mt-3 flex-1 overflow-auto">
                {osPickerResults.length === 0 ? (
                  <p className="px-1 py-2 text-[12px] text-[#94A3B8]">Nenhuma OS encontrada.</p>
                ) : (
                  osPickerResults.map((os) => {
                    const marcado = editingOsCodigos.includes(os.codigo);
                    return (
                      <button
                        key={os.codigo}
                        type="button"
                        onClick={() => toggleOs(os.codigo)}
                        className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-[13px] ${marcado ? 'bg-[#FFF3EC] text-[#B45309]' : 'text-[#2D2D2D] hover:bg-[#F9FAFB]'}`}
                      >
                        {formatOsLabel(os)}
                        {marcado && <Check size={14} />}
                      </button>
                    );
                  })
                )}
              </div>
              <button
                type="button"
                onClick={() => setOsPickerOpen(false)}
                className="mt-3 h-9 rounded-lg bg-[#F05D28] px-4 text-[12px] font-bold text-white hover:bg-[#D94E1F]"
              >
                Concluído
              </button>
            </div>
          </div>
        )}

        {disciplinaPickerOpen && (
          <div className="fixed inset-0 z-[220] flex items-center justify-center bg-slate-950/40 p-4" onClick={() => setDisciplinaPickerOpen(false)}>
            <div className="flex max-h-[70vh] w-full max-w-md flex-col overflow-hidden rounded-xl bg-white p-4 shadow-xl" onClick={(event) => event.stopPropagation()}>
              <div className="flex items-center gap-2">
                <input
                  autoFocus
                  value={disciplinaPickerSearch}
                  onChange={(event) => setDisciplinaPickerSearch(event.target.value)}
                  placeholder="Buscar disciplina..."
                  className="h-10 flex-1 rounded-lg border border-[#E5E7EB] px-3 text-[13px] outline-none focus:border-[#F05D28]"
                />
                <button
                  type="button"
                  onClick={markAllDisciplinas}
                  className="h-10 flex-shrink-0 rounded-lg border border-[#F05D28] px-3 text-[12px] font-bold text-[#F05D28] hover:bg-[#FFF3EE]"
                >
                  Marcar todas
                </button>
              </div>
              <div className="mt-3 flex-1 overflow-auto">
                {disciplinaPickerResults.length === 0 ? (
                  <p className="px-1 py-2 text-[12px] text-[#94A3B8]">Nenhuma disciplina encontrada.</p>
                ) : (
                  disciplinaPickerResults.map((disciplina) => {
                    const marcado = selectedDisciplinas.includes(disciplina);
                    return (
                      <button
                        key={disciplina}
                        type="button"
                        onClick={() => toggleDisciplina(disciplina)}
                        className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-[13px] ${marcado ? 'bg-[#FFF3EC] text-[#B45309]' : 'text-[#2D2D2D] hover:bg-[#F9FAFB]'}`}
                      >
                        {getDisciplineDisplayName(disciplina)}
                        {marcado && <Check size={14} />}
                      </button>
                    );
                  })
                )}
              </div>
              <button
                type="button"
                onClick={() => setDisciplinaPickerOpen(false)}
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

  const minhasNotasTodas = listaFiltrada.filter((sheet) => sheet.autorEmail === currentUser.email);
  const notasDeOutros = listaFiltrada.filter((sheet) => sheet.autorEmail !== currentUser.email);
  // Concluidas ha 10+ dias saem do Kanban e vao pra aba propria.
  const minhasNotasKanban = minhasNotasTodas.filter((sheet) => !isConcluidaAntiga(sheet));
  const minhasNotasConcluidas = minhasNotasTodas.filter(isConcluidaAntiga);
  // So o autor ou um admin do sistema pode excluir a nota.
  const canDeleteSheet = (sheet: AnnotationSheet) => canDeleteNote(currentUser, sheet.autorEmail);

  // Move a nota pra outra coluna do Kanban (drag-and-drop ou clique nos botoes de status).
  const moverStatus = (sheet: AnnotationSheet, status: 'criado' | 'iniciado' | 'concluido') => {
    if (getSheetStatus(sheet) === status) return;
    void onSave({ ...sheet, status, updatedAt: new Date().toISOString() });
  };
  const KANBAN_COLUNAS: Array<{ key: 'criado' | 'iniciado' | 'concluido'; label: string }> = [
    { key: 'criado', label: 'Criado' },
    { key: 'iniciado', label: 'Iniciado' },
    { key: 'concluido', label: 'Concluído' },
  ];

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
          <SearchableSelect
            value={listaVinculo}
            onChange={(event) => setListaVinculo(event.target.value)}
            searchPlaceholder="Pesquisar vinculo..."
            className={filtroClass}
          >
            <option value="">Todas as notas</option>
            <option value="vinculado">Fui vinculado</option>
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
          <div className="relative ml-auto">
            <button
              type="button"
              onClick={() => setExportMenuOpen((prev) => !prev)}
              className="inline-flex h-11 items-center gap-2 rounded-xl border border-[#E5E7EB] bg-white px-4 text-[13px] font-bold text-[#2D2D2D] hover:border-[#F7C7B7] hover:text-[#F05D28]"
            >
              <FileText size={15} />
              Exportar em .MD
            </button>
            {exportMenuOpen && (
              <>
                <div className="fixed inset-0 z-[205]" onClick={() => setExportMenuOpen(false)} />
                <div className="absolute right-0 top-full z-[206] mt-1 w-48 rounded-xl bg-white p-1.5 shadow-xl">
                  {[
                    { label: 'Exportar tudo', groupBy: undefined },
                    { label: 'Por Contrato', groupBy: 'contrato' as const },
                    { label: 'Por OS', groupBy: 'os' as const },
                    { label: 'Por Disciplina', groupBy: 'disciplina' as const },
                  ].map((opcao) => (
                    <button
                      key={opcao.label}
                      type="button"
                      onClick={() => {
                        exportNotesToMarkdown(listaFiltrada, currentUser.email, opcao.groupBy && {
                          groupBy: opcao.groupBy,
                          osContrato: Object.fromEntries(osOptions.map((os) => [os.codigo, os.contratoCodigo || ''])),
                          osLabel: Object.fromEntries(osOptions.map((os) => [os.codigo, formatOsLabel(os)])),
                          contratoLabel: Object.fromEntries(contractOptions.map((contrato) => [contrato.codigo, `${contrato.codigo} - ${contrato.nome}`])),
                        });
                        setExportMenuOpen(false);
                      }}
                      className="flex w-full items-center rounded-lg px-3 py-2 text-left text-[12px] font-medium text-[#374151] hover:bg-[#F3F4F6]"
                    >
                      {opcao.label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {listaFiltrada.length === 0 ? (
        <p className="text-[13px] text-[#757575]">
          {temFiltroLista
            ? 'Nenhuma nota com esses filtros.'
            : 'Nenhuma anotação encontrada ainda.'}
        </p>
      ) : (
        <>
          {/* Abas sutis: Minhas Notas / Notas Públicas a esquerda, Notas Concluídas (verde) a direita. */}
          <div className="mb-4 flex items-center gap-1 border-b border-[#E5E7EB]">
            <button
              type="button"
              onClick={() => setNotasTab('minhas')}
              className={`border-b-2 px-3 py-2 text-[12px] font-bold transition-colors ${notasTab === 'minhas' ? 'border-[#F05D28] text-[#2D2D2D]' : 'border-transparent text-[#94A3B8] hover:text-[#2D2D2D]'}`}
            >
              Minhas Notas
            </button>
            <button
              type="button"
              onClick={() => setNotasTab('publicas')}
              className={`border-b-2 px-3 py-2 text-[12px] font-bold transition-colors ${notasTab === 'publicas' ? 'border-[#F05D28] text-[#2D2D2D]' : 'border-transparent text-[#94A3B8] hover:text-[#2D2D2D]'}`}
            >
              Notas Públicas
            </button>
            <button
              type="button"
              onClick={() => setNotasTab('concluidas')}
              className={`ml-auto border-b-2 px-3 py-2 text-[12px] font-bold transition-colors ${notasTab === 'concluidas' ? 'border-emerald-500 text-emerald-700' : 'border-transparent text-emerald-600/70 hover:text-emerald-700'}`}
            >
              Notas Concluídas{minhasNotasConcluidas.length > 0 ? ` (${minhasNotasConcluidas.length})` : ''}
            </button>
          </div>

          {notasTab === 'minhas' && (
            minhasNotasKanban.length === 0 ? (
              <p className="text-[12px] text-[#94A3B8]">Você ainda não criou nenhuma anotação aqui.</p>
            ) : (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                {KANBAN_COLUNAS.map((coluna) => {
                  const notasColuna = minhasNotasKanban.filter((sheet) => getSheetStatus(sheet) === coluna.key);
                  return (
                    <div
                      key={coluna.key}
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={(event) => {
                        event.preventDefault();
                        const id = event.dataTransfer.getData('text/plain');
                        const sheet = minhasNotasKanban.find((item) => item.id === id);
                        if (sheet) moverStatus(sheet, coluna.key);
                      }}
                      className="min-h-[80px] rounded-xl bg-[#F9FAFB] p-3"
                    >
                      <h4 className="mb-2 text-[12px] font-bold uppercase tracking-wide text-[#64748B]">
                        {coluna.label} <span className="text-[#94A3B8]">({notasColuna.length})</span>
                      </h4>
                      <div className="flex flex-col gap-3">
                        {notasColuna.map((sheet) => (
                          <div
                            key={sheet.id}
                            draggable
                            onDragStart={(event) => event.dataTransfer.setData('text/plain', sheet.id)}
                          >
                            {renderCard(sheet)}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          )}

          {notasTab === 'publicas' && (
            notasDeOutros.length === 0 ? (
              <p className="text-[12px] text-[#94A3B8]">Nenhuma anotação pública de outra pessoa aqui ainda.</p>
            ) : (
              <div className="flex flex-col gap-3">{notasDeOutros.map(renderCard)}</div>
            )
          )}

          {notasTab === 'concluidas' && (
            minhasNotasConcluidas.length === 0 ? (
              <p className="text-[12px] text-[#94A3B8]">Nenhuma nota concluída há mais de 10 dias.</p>
            ) : (
              <div className="flex flex-col gap-3">
                {minhasNotasConcluidas.map((sheet) => (
                  <div key={sheet.id} className="rounded-xl border-l-4 border-emerald-400">{renderCard(sheet)}</div>
                ))}
              </div>
            )
          )}
        </>
      )}
    </div>
  );
}
