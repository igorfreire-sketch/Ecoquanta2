import React from 'react';
import { FileSpreadsheet, FileText, Globe, Link2, Lock, MoreVertical, Plus, Trash2, X } from 'lucide-react';
import { getDisciplineDisplayName, getDisciplineIconInfo, type EngineeringActivity } from '../Atividades';
import { exportNoteToCsv, exportNoteToPdf, exportNotesToMarkdown } from '../../lib/noteExport';
import { isLeadershipOrAdmin } from '../../lib/firebaseDb';
import CronogramaResumo from './CronogramaResumo';
import MindMap from './MindMap';

export interface AnnotationBanco {
  id: string;
  colCount: number;
  rows: string[][];
}

export interface AnnotationTextBlock {
  id: string;
  texto: string;
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
  updatedAt: string;
  // Campos abaixo podem faltar em anotacoes salvas antes desta feature.
  // publica ausente = tratado como publica (nao muda a visibilidade de notas antigas).
  publica?: boolean;
  criadoEm?: string;
  autorNome?: string;
  autorEmail?: string;
  linkedNoteIds?: string[];
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

export interface AnnotationTemplate {
  id: string;
  nome: string;
  titulo: string;
  colCount: number;
  rows: string[][];
  autorEmail: string;
  autorNome?: string;
  criadoEm: string;
  // publica ausente = tratado como privado (templates salvos antes desta feature so aparecem pro autor).
  publica?: boolean;
}

type AnotacoesFilter = { type: 'disciplina'; value: string } | { type: 'os'; value: string } | { type: 'all' };

interface AnotacoesProps {
  filter: AnotacoesFilter;
  sheets: AnnotationSheet[];
  osOptions: Array<{ codigo: string; nome: string }>;
  disciplinaOptions: string[];
  currentUser: { nome: string; email: string; role?: string; isAdmin?: boolean };
  templates: AnnotationTemplate[];
  activities?: EngineeringActivity[];
  // Area Tecnica: notas de OS sempre publicas e com a disciplina do proprio usuario, sem opcao de escolha.
  forcePublica?: boolean;
  autoDisciplinaOs?: string;
  // Area Tecnica: nota publica de outra pessoa so aparece se ela for cadastrada na mesma disciplina do usuario.
  authorDisciplinaByEmail?: Record<string, string>;
  onSave: (sheet: AnnotationSheet) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onSaveTemplate: (template: AnnotationTemplate) => Promise<void>;
  onDeleteTemplate: (id: string) => Promise<void>;
  // Usados quando a nota e aberta de fora do fluxo normal (ex: clique num no do Mapa Mental).
  controlledSheet?: AnnotationSheet | null;
  onCloseControlled?: () => void;
}

type ContextMenuState = { bancoIndex: number; row: number; col: number; x: number; y: number } | null;

function createEmptyRows(colCount: number, rowCount: number): string[][] {
  return Array.from({ length: rowCount }, () => Array.from({ length: colCount }, () => ''));
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
  filter, sheets, osOptions, disciplinaOptions, currentUser, templates, activities = [], forcePublica, autoDisciplinaOs, authorDisciplinaByEmail, onSave, onDelete, onSaveTemplate, onDeleteTemplate, controlledSheet, onCloseControlled,
}: AnotacoesProps) {
  const normalizeForEditing = (sheet: AnnotationSheet): AnnotationSheet => ({ ...sheet, bancos: getSheetBancos(sheet), textos: getSheetTextos(sheet) });
  const [editing, setEditing] = React.useState<AnnotationSheet | null>(() => (controlledSheet ? normalizeForEditing(controlledSheet) : null));
  const [creating, setCreating] = React.useState(false);
  const [newColCount, setNewColCount] = React.useState(3);
  const [contextMenu, setContextMenu] = React.useState<ContextMenuState>(null);
  const [saving, setSaving] = React.useState(false);
  const [templateNamePrompt, setTemplateNamePrompt] = React.useState<string | null>(null);
  const [templatePublica, setTemplatePublica] = React.useState(true);
  const [linkPickerOpen, setLinkPickerOpen] = React.useState(false);
  const [linkSearch, setLinkSearch] = React.useState('');
  const [openCardMenuId, setOpenCardMenuId] = React.useState<string | null>(null);
  const textoRefs = React.useRef<Record<string, HTMLTextAreaElement | null>>({});

  React.useEffect(() => {
    if (controlledSheet) setEditing(normalizeForEditing(controlledSheet));
  }, [controlledSheet]);

  const openNote = (sheet: AnnotationSheet) => setEditing(normalizeForEditing(sheet));

  const uniqueOsOptions = React.useMemo(
    () => Array.from(new Map(osOptions.map((os) => [os.codigo, os])).values()),
    [osOptions]
  );
  const filteredSheets = sheets.filter((sheet) => {
    const matchesFilter = filter.type === 'all'
      ? true
      : filter.type === 'disciplina' ? getSheetDisciplinas(sheet).includes(filter.value) : sheet.osCodigo === filter.value;
    if (!matchesFilter) return false;
    if (sheet.autorEmail === currentUser.email) return true;
    if (sheet.publica === false) return false;
    // Area Tecnica: nota publica de outra pessoa so aparece se ela for da mesma disciplina.
    if (autoDisciplinaOs && authorDisciplinaByEmail) {
      return authorDisciplinaByEmail[sheet.autorEmail || ''] === autoDisciplinaOs;
    }
    return true;
  });
  const visibleTemplates = templates.filter((tpl) => tpl.autorEmail === currentUser.email || tpl.publica);
  const canDeleteTemplate = (tpl: AnnotationTemplate) => tpl.autorEmail === currentUser.email || isLeadershipOrAdmin(currentUser);

  const closeEditing = () => {
    setEditing(null);
    setContextMenu(null);
    setLinkPickerOpen(false);
    onCloseControlled?.();
  };

  if (editing) {
    const bancos = editing.bancos ?? [];
    const textos = editing.textos ?? [];
    const selectedDisciplinas = getSheetDisciplinas(editing);

    const updateBanco = (bancoIndex: number, updater: (banco: AnnotationBanco) => AnnotationBanco) => setEditing((prev) => {
      if (!prev) return prev;
      return { ...prev, bancos: (prev.bancos ?? []).map((banco, index) => (index === bancoIndex ? updater(banco) : banco)) };
    });
    const addBanco = (colCount: number, rows: string[][], titulo?: string) => setEditing((prev) => (
      prev ? { ...prev, bancos: [...(prev.bancos ?? []), { id: makeId('banco'), colCount, rows }], titulo: prev.titulo.trim() ? prev.titulo : (titulo ?? prev.titulo) } : prev
    ));
    const removeBanco = (bancoIndex: number) => setEditing((prev) => (
      prev ? { ...prev, bancos: (prev.bancos ?? []).filter((_, index) => index !== bancoIndex) } : prev
    ));
    const updateCell = (bancoIndex: number, r: number, c: number, value: string) => updateBanco(bancoIndex, (banco) => ({
      ...banco,
      rows: banco.rows.map((row, ri) => (ri === r ? row.map((cell, ci) => (ci === c ? value : cell)) : row)),
    }));
    const insertRow = (bancoIndex: number, at: number) => updateBanco(bancoIndex, (banco) => {
      const rows = [...banco.rows];
      rows.splice(at, 0, Array.from({ length: banco.colCount }, () => ''));
      return { ...banco, rows };
    });
    const removeRow = (bancoIndex: number, at: number) => updateBanco(bancoIndex, (banco) => (
      banco.rows.length <= 1 ? banco : { ...banco, rows: banco.rows.filter((_, ri) => ri !== at) }
    ));
    const insertCol = (bancoIndex: number, at: number) => updateBanco(bancoIndex, (banco) => {
      const rows = banco.rows.map((row) => {
        const next = [...row];
        next.splice(at, 0, '');
        return next;
      });
      return { ...banco, rows, colCount: banco.colCount + 1 };
    });
    const removeCol = (bancoIndex: number, at: number) => updateBanco(bancoIndex, (banco) => (
      banco.colCount <= 1 ? banco : { ...banco, rows: banco.rows.map((row) => row.filter((_, ci) => ci !== at)), colCount: banco.colCount - 1 }
    ));

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
    // Fora do contexto de uma disciplina/OS especifica (ex: aberta pela visao "Notas"
    // global ou pelo Mapa Mental), decide qual seletor mostrar pelo que a propria nota
    // ja tem: se tem OS, mostra o seletor de OS; senao, o de disciplina (sempre obrigatoria).
    const showOsSelector = filter.type === 'disciplina' || (filter.type === 'all' && Boolean(editing.osCodigo));
    // Nota de OS: disciplina vira multi-select (pode marcar varias, ou todas de uma vez).
    // Excecao: com autoDisciplinaOs (Area Tecnica), a disciplina e a do proprio usuario, sem escolha.
    const isOsNote = filter.type === 'os';
    const showDisciplinaMultiSelect = isOsNote && !autoDisciplinaOs;
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

    const handleSaveTemplate = async () => {
      if (!templateNamePrompt?.trim()) return;
      const primeiroBanco = bancos[0];
      await onSaveTemplate({
        id: makeId('tpl'),
        nome: templateNamePrompt.trim(),
        titulo: editing.titulo,
        colCount: primeiroBanco?.colCount ?? 0,
        rows: (primeiroBanco?.rows ?? []).map((row) => [...row]),
        autorEmail: currentUser.email,
        autorNome: currentUser.nome,
        criadoEm: new Date().toISOString(),
        publica: templatePublica,
      });
      setTemplateNamePrompt(null);
    };

    const menuActions: Array<[string, () => void]> = contextMenu ? [
      ['Inserir linha acima', () => insertRow(contextMenu.bancoIndex, contextMenu.row)],
      ['Inserir linha abaixo', () => insertRow(contextMenu.bancoIndex, contextMenu.row + 1)],
      ['Remover linha', () => removeRow(contextMenu.bancoIndex, contextMenu.row)],
      ['Inserir coluna à esquerda', () => insertCol(contextMenu.bancoIndex, contextMenu.col)],
      ['Inserir coluna à direita', () => insertCol(contextMenu.bancoIndex, contextMenu.col + 1)],
      ['Remover coluna', () => removeCol(contextMenu.bancoIndex, contextMenu.col)],
    ] : [];

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

    const noteActivities = editing.osCodigo
      ? activities.filter((activity) => activity.osCodigo === editing.osCodigo)
      : editing.disciplina
        ? activities.filter((activity) => activity.disciplinas.some((disciplina) => getDisciplineDisplayName(disciplina) === getDisciplineDisplayName(editing.disciplina)))
        : [];

    return (
      <div className="fixed inset-0 z-[200] flex flex-col overflow-hidden bg-white">
        <div className="flex items-center justify-between gap-4 border-b border-[#E5E7EB] px-5 py-2.5">
          <div className="flex min-w-0 items-center gap-3">
            <h2 className="truncate text-[15px] font-black text-[#2D2D2D]">{editing.titulo || 'Nova anotação'}</h2>
            {autorInfo && <span className="whitespace-nowrap text-[11px] text-[#94A3B8]">{autorInfo}</span>}
            {editing.publica === false && (
              <span className="inline-flex items-center gap-1 rounded-full border border-[#FED7AA] bg-[#FFF7ED] px-2.5 py-1 text-[11px] font-bold text-[#B45309]">
                <Lock size={11} />
                Privada
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              type="button"
              onClick={() => { setNewColCount(3); setCreating(true); }}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#E5E7EB] bg-white px-3 text-[12px] font-bold text-[#64748B] transition-colors hover:border-[#F7C7B7] hover:bg-[#F9FAFB] hover:text-[#2D2D2D]"
            >
              <FileSpreadsheet size={14} />
              + Banco
            </button>
            <button
              type="button"
              onClick={addTextoBlock}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#E5E7EB] bg-white px-3 text-[12px] font-bold text-[#64748B] transition-colors hover:border-[#F7C7B7] hover:bg-[#F9FAFB] hover:text-[#2D2D2D]"
            >
              <FileText size={14} />
              + Notas
            </button>
            <button
              type="button"
              onClick={() => { setTemplateNamePrompt(editing.titulo || 'Novo template'); setTemplatePublica(true); }}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#E5E7EB] bg-white px-3 text-[12px] font-bold text-[#64748B] transition-colors hover:border-[#F7C7B7] hover:bg-[#F9FAFB] hover:text-[#2D2D2D]"
            >
              Salvar como template
            </button>
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
              className="h-11 min-w-[220px] flex-1 rounded-xl border border-[#E5E7EB] bg-white px-3 text-[14px] font-bold text-[#2D2D2D] outline-none focus:border-[#F05D28]"
            />
            {showOsSelector ? (
              <select
                value={editing.osCodigo || ''}
                onChange={(event) => updateOs(event.target.value)}
                className="h-11 rounded-xl border border-[#E5E7EB] bg-white px-3 text-[13px] font-medium text-[#2D2D2D] outline-none focus:border-[#F05D28]"
              >
                <option value="">Nome customizado (sem OS)</option>
                {uniqueOsOptions.map((os) => (
                  <option key={os.codigo} value={os.codigo}>{os.codigo} - {os.nome}</option>
                ))}
              </select>
            ) : !isOsNote ? (
              <select
                value={editing.disciplina}
                onChange={(event) => updateDisciplina(event.target.value)}
                className="h-11 rounded-xl border border-[#E5E7EB] bg-white px-3 text-[13px] font-medium text-[#2D2D2D] outline-none focus:border-[#F05D28]"
              >
                <option value="">Selecione a disciplina...</option>
                {disciplinaOptions.map((disciplina) => (
                  <option key={disciplina} value={disciplina}>{getDisciplineDisplayName(disciplina)}</option>
                ))}
              </select>
            ) : null}
            {!forcePublica && (
              <label className="flex h-11 items-center gap-2 rounded-xl border border-[#E5E7EB] bg-white px-3 text-[13px] font-medium text-[#2D2D2D] cursor-pointer">
                <input
                  type="checkbox"
                  checked={editing.publica !== false}
                  onChange={(event) => updatePublica(event.target.checked)}
                  className="h-4 w-4 accent-[#F05D28] cursor-pointer"
                />
                Pública
              </label>
            )}
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving || !editing.titulo.trim() || disciplinaPendente}
              className="h-11 rounded-xl bg-[#F05D28] px-5 text-[13px] font-bold text-white transition-colors hover:bg-[#D94E1F] disabled:opacity-60"
            >
              {saving ? 'Salvando...' : 'Salvar'}
            </button>
          </div>

          {showDisciplinaMultiSelect && (
            <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-[#E5E7EB] bg-white p-3">
              <span className="text-[12px] font-bold text-[#2D2D2D]">Disciplinas:</span>
              <button
                type="button"
                onClick={markAllDisciplinas}
                className="rounded-full border border-[#F05D28] px-2.5 py-1 text-[11px] font-bold text-[#F05D28] hover:bg-[#FFF3EE]"
              >
                Marcar todas
              </button>
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
            Clique com o botão direito em uma célula para inserir ou remover linhas e colunas. A linha 1 fica fixa ao rolar.
          </p>

          {bancos.length > 0 ? (
            <div className="mt-3 flex flex-col gap-4">
              {bancos.map((banco, bancoIndex) => (
                <div key={banco.id} className="overflow-hidden rounded-xl border border-[#E5E7EB]">
                  <div className="flex items-center justify-between border-b border-[#E5E7EB] bg-[#F9FAFB] px-3 py-1.5">
                    <span className="text-[11px] font-bold text-[#64748B]">Banco {bancoIndex + 1}</span>
                    <button
                      type="button"
                      title="Excluir banco"
                      onClick={() => removeBanco(bancoIndex)}
                      className="flex h-5 w-5 items-center justify-center rounded-full text-[#94A3B8] hover:bg-[#FEE2E2] hover:text-[#DC2626]"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                  <div className="overflow-auto">
                    <table className="w-full border-collapse text-[13px]">
                      <tbody>
                        {banco.rows.map((row, r) => (
                          <tr key={r}>
                            {row.map((cell, c) => (
                              <td
                                key={c}
                                onContextMenu={(event) => {
                                  event.preventDefault();
                                  setContextMenu({ bancoIndex, row: r, col: c, x: event.clientX, y: event.clientY });
                                }}
                                className={`border border-[#E5E7EB] p-0 ${r === 0 ? 'sticky top-0 z-10 bg-[#F3F4F6]' : 'bg-white'}`}
                              >
                                <input
                                  value={cell}
                                  onChange={(event) => updateCell(bancoIndex, r, c, event.target.value)}
                                  className={`h-9 w-full min-w-[110px] bg-transparent px-2 outline-none ${r === 0 ? 'font-bold text-[#2D2D2D]' : 'text-[#374151]'}`}
                                />
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-3 text-[12px] text-[#94A3B8]">Nenhum banco de dados ainda. Clique em "+ Banco" para criar uma planilha.</p>
          )}

          {textos.length > 0 ? (
            <div className="mt-4 flex flex-col gap-4">
              {textos.map((bloco, index) => {
                const links = Array.from(bloco.texto.matchAll(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g));
                return (
                  <div key={bloco.id} className="rounded-xl border border-[#E5E7EB] p-4">
                    <div className="mb-2 flex items-center justify-between">
                      <h4 className="text-[13px] font-bold text-[#2D2D2D]">Notas {index + 1}</h4>
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
                    </div>
                    <textarea
                      ref={(el) => { textoRefs.current[bloco.id] = el; }}
                      value={bloco.texto}
                      onChange={(event) => updateTextoBlock(index, event.target.value)}
                      placeholder="Escreva livremente aqui, como um bloco de texto... Use + Link para inserir hiperlinks."
                      rows={5}
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
          ) : (
            <p className="mt-3 text-[12px] text-[#94A3B8]">Nenhum bloco de notas ainda. Clique em "+ Notas" para escrever.</p>
          )}

          <div className="mt-4 rounded-xl border border-[#E5E7EB] p-4">
            <div className="flex items-center justify-between">
              <h4 className="text-[13px] font-bold text-[#2D2D2D]">Notas vinculadas</h4>
              <button
                type="button"
                onClick={() => { setLinkPickerOpen(true); setLinkSearch(''); }}
                className="text-[12px] font-bold text-[#F05D28] hover:underline"
              >
                + Vincular nota
              </button>
            </div>
            {linkedNotes.length === 0 ? (
              <p className="mt-2 text-[12px] text-[#94A3B8]">Nenhuma nota vinculada ainda.</p>
            ) : (
              <div className="mt-2 flex flex-wrap gap-2">
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

        <div className="w-[30%] flex-shrink-0 overflow-auto border-l border-[#E5E7EB] p-5">
          {controlledSheet ? (
            <>
              <h4 className="mb-3 text-[13px] font-bold text-[#2D2D2D]">Mapa Mental</h4>
              <div className="h-[calc(100%-2rem)]">
                <MindMap
                  embedded
                  highlightId={editing.id}
                  sheets={sheets}
                  currentUserEmail={currentUser.email}
                  osOptions={osOptions}
                  onOpenNote={(sheet) => openNote(sheet)}
                />
              </div>
            </>
          ) : (
            <>
              <h4 className="mb-3 text-[13px] font-bold text-[#2D2D2D]">Cronograma</h4>
              <CronogramaResumo activities={noteActivities} contextLabel={editing.osCodigo ? 'disciplina' : 'os'} />
            </>
          )}
        </div>
        </div>

        {contextMenu && (
          <>
            <div
              className="fixed inset-0 z-[210]"
              onClick={() => setContextMenu(null)}
              onContextMenu={(event) => { event.preventDefault(); setContextMenu(null); }}
            />
            <div className="fixed z-[211] w-56 rounded-xl border border-[#E5E7EB] bg-white p-1.5 shadow-lg" style={{ left: contextMenu.x, top: contextMenu.y }}>
              {menuActions.map(([label, action]) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => { action(); setContextMenu(null); }}
                  className="block w-full rounded-lg px-3 py-2 text-left text-[12px] font-medium text-[#374151] hover:bg-[#F3F4F6]"
                >
                  {label}
                </button>
              ))}
            </div>
          </>
        )}

        {creating && (
          <div className="fixed inset-0 z-[220] flex items-center justify-center bg-slate-950/40 p-4" onClick={() => setCreating(false)}>
            <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl" onClick={(event) => event.stopPropagation()}>
              <p className="mb-3 text-[13px] font-bold text-[#2D2D2D]">Quantas colunas o banco vai ter?</p>
              <div className="flex items-center gap-3">
                <input
                  autoFocus
                  type="number"
                  min={1}
                  max={26}
                  value={newColCount}
                  onChange={(event) => setNewColCount(Math.max(1, Math.min(26, Number(event.target.value) || 1)))}
                  className="h-10 w-24 rounded-lg border border-[#E5E7EB] bg-white px-3 text-[13px] font-medium text-[#2D2D2D] outline-none focus:border-[#F05D28]"
                />
                <button
                  type="button"
                  onClick={() => { addBanco(newColCount, createEmptyRows(newColCount, 4)); setCreating(false); }}
                  className="h-10 rounded-lg bg-[#F05D28] px-4 text-[13px] font-bold text-white hover:bg-[#D94E1F]"
                >
                  Criar em branco
                </button>
                <button type="button" onClick={() => setCreating(false)} className="text-[12px] font-bold text-[#757575] hover:text-[#2D2D2D]">
                  Cancelar
                </button>
              </div>

              {visibleTemplates.length > 0 && (
                <div className="mt-4 border-t border-[#E5E7EB] pt-4">
                  <p className="mb-2 text-[12px] font-bold text-[#2D2D2D]">Ou comece a partir de um template:</p>
                  <div className="flex flex-wrap gap-2">
                    {visibleTemplates.map((tpl) => (
                      <div key={tpl.id} className="flex items-center overflow-hidden rounded-lg border border-[#E5E7EB] bg-white hover:border-[#F7C7B7]">
                        <button
                          type="button"
                          onClick={() => { addBanco(tpl.colCount, tpl.rows.map((row) => [...row]), tpl.titulo); setCreating(false); }}
                          className="flex items-center gap-1.5 px-3 py-2 text-[12px] font-bold text-[#2D2D2D] hover:text-[#F05D28]"
                          title={tpl.autorEmail === currentUser.email ? undefined : `De ${tpl.autorNome || tpl.autorEmail}`}
                        >
                          {tpl.publica ? <Globe size={11} className="text-[#10B981]" /> : <Lock size={11} className="text-[#B45309]" />}
                          {tpl.nome}
                        </button>
                        {canDeleteTemplate(tpl) && (
                          <button
                            type="button"
                            title="Excluir template"
                            onClick={() => {
                              if (window.confirm(`Excluir o template "${tpl.nome}"?`)) void onDeleteTemplate(tpl.id);
                            }}
                            className="flex h-full items-center px-2 py-2 text-[#94A3B8] hover:bg-[#FEE2E2] hover:text-[#DC2626]"
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {templateNamePrompt !== null && (
          <div className="fixed inset-0 z-[220] flex items-center justify-center bg-slate-950/40 p-4" onClick={() => setTemplateNamePrompt(null)}>
            <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl" onClick={(event) => event.stopPropagation()}>
              <p className="mb-3 text-[13px] font-bold text-[#2D2D2D]">Nome do template</p>
              <input
                autoFocus
                value={templateNamePrompt}
                onChange={(event) => setTemplateNamePrompt(event.target.value)}
                className="h-11 w-full rounded-xl border border-[#E5E7EB] bg-white px-3 text-[13px] font-medium text-[#2D2D2D] outline-none focus:border-[#F05D28]"
              />
              <label className="mt-3 flex items-center gap-2 text-[13px] font-medium text-[#2D2D2D] cursor-pointer">
                <input
                  type="checkbox"
                  checked={templatePublica}
                  onChange={(event) => setTemplatePublica(event.target.checked)}
                  className="h-4 w-4 accent-[#F05D28] cursor-pointer"
                />
                Público (visível para todos)
              </label>
              <div className="mt-4 flex justify-end gap-2">
                <button type="button" onClick={() => setTemplateNamePrompt(null)} className="text-[12px] font-bold text-[#757575] hover:text-[#2D2D2D]">
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => void handleSaveTemplate()}
                  disabled={!templateNamePrompt.trim()}
                  className="h-9 rounded-lg bg-[#F05D28] px-4 text-[12px] font-bold text-white hover:bg-[#D94E1F] disabled:opacity-60"
                >
                  Salvar template
                </button>
              </div>
            </div>
          </div>
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
      </div>
    );
  }

  const minhasNotas = filteredSheets.filter((sheet) => sheet.autorEmail === currentUser.email);
  const notasDeOutros = filteredSheets.filter((sheet) => sheet.autorEmail !== currentUser.email);
  // Nota publica: so quem criou, coordenador ou admin pode excluir. Nota privada so
  // aparece pro proprio criador (ver filteredSheets), entao autorEmail ja cobre esse caso.
  const canDeleteSheet = (sheet: AnnotationSheet) => sheet.autorEmail === currentUser.email || isLeadershipOrAdmin(currentUser);

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

    return (
      <div key={sheet.id} className="relative overflow-hidden rounded-xl border border-[#E5E7EB] bg-white p-4 transition-colors hover:border-[#F7C7B7]">
        {disciplinaIcon && (
          <div className="absolute inset-y-0 right-9 flex w-12 items-center justify-center border-l border-[#F3F4F6] bg-[#F9FAFB]">
            {disciplinaIcon.imageSrc
              ? <img src={disciplinaIcon.imageSrc} alt={disciplinaIcon.label} className="h-9 w-9 rounded-full object-cover" />
              : DisciplinaIcon ? <DisciplinaIcon size={26} className="text-[#F05D28]" /> : null}
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
          onClick={(event) => { event.stopPropagation(); setOpenCardMenuId((prev) => (prev === sheet.id ? null : sheet.id)); }}
          className="absolute right-2 top-2 z-10 flex h-6 w-6 items-center justify-center rounded-full text-[#94A3B8] hover:bg-[#F3F4F6] hover:text-[#2D2D2D]"
        >
          <MoreVertical size={14} />
        </button>

        {openCardMenuId === sheet.id && (
          <>
            <div className="fixed inset-0 z-[190]" onClick={() => setOpenCardMenuId(null)} />
            <div className="absolute right-2 top-9 z-[191] w-44 rounded-xl border border-[#E5E7EB] bg-white p-1.5 shadow-lg">
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

  return (
    <div>
      {filter.type !== 'all' && (
        <button
          type="button"
          onClick={() => setEditing({
            id: makeId('note'),
            disciplina: filter.type === 'disciplina' ? filter.value : (filter.type === 'os' && autoDisciplinaOs ? autoDisciplinaOs : ''),
            osCodigo: filter.type === 'os' ? filter.value : undefined,
            titulo: '',
            bancos: [],
            textos: [{ id: makeId('nota'), texto: '' }],
            updatedAt: new Date().toISOString(),
            criadoEm: new Date().toISOString(),
            autorNome: currentUser.nome,
            autorEmail: currentUser.email,
            publica: true,
          })}
          className="mb-4 inline-flex h-10 items-center gap-2 rounded-xl bg-[#F05D28] px-4 text-[13px] font-bold text-white hover:bg-[#D94E1F]"
        >
          <Plus size={15} />
          Nova anotação
        </button>
      )}

      {filter.type === 'all' && filteredSheets.length > 0 && (
        <button
          type="button"
          onClick={() => exportNotesToMarkdown(filteredSheets, currentUser.email)}
          className="mb-4 inline-flex h-10 items-center gap-2 rounded-xl border border-[#E5E7EB] bg-white px-4 text-[13px] font-bold text-[#2D2D2D] hover:border-[#F7C7B7] hover:text-[#F05D28]"
        >
          <FileText size={15} />
          Exportar em .MD
        </button>
      )}

      {filteredSheets.length === 0 ? (
        <p className="text-[13px] text-[#757575]">
          {filter.type === 'all'
            ? 'Nenhuma anotação encontrada ainda.'
            : filter.type === 'disciplina' ? 'Nenhuma anotação salva para esta disciplina ainda.' : 'Nenhuma anotação salva para esta OS ainda.'}
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
