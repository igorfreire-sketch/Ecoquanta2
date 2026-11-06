import { buildActivitiesFromEap } from './Atividades';
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Lock, X } from 'lucide-react';
import { isFirebaseConfigured, setFirebaseDocument } from '../lib/firebaseDb';
import CronogramaGrid, { CRONOGRAMAS_COLLECTION, type CronogramaDoc } from './CronogramaGrid';
import Anotacoes, { novaNotaBase, type AnnotationSheet } from './CoordenacaoEngenharia/Anotacoes';
export { CRONOGRAMAS_COLLECTION, ordemArvore, calcularCodigos, ordemColunasCronograma } from './CronogramaGrid';
export type { CronogramaDoc, ColunaCustom, CronoRow } from './CronogramaGrid';

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

function formatDateBRLocal(value?: string) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('pt-BR');
}

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
  const bloqueado = Boolean(doc.origemNotaId);
  const [sheetAberta, setSheetAberta] = useState<AnnotationSheet | null>(null);
  const [linhaDaNotaEmCriacao, setLinhaDaNotaEmCriacao] = useState<string | null>(null);
  function atualizarDoc(patch: Partial<CronogramaDoc>) {
    if (bloqueado) return;
    setDoc((prev) => ({ ...prev, ...patch, updatedAt: new Date().toISOString() }));
    setSujo(true);
    setErroSalvar(null);
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

  async function salvarNotaCriada(sheet: AnnotationSheet) {
    await onSaveNote?.(sheet);
    if (linhaDaNotaEmCriacao) {
      atualizarDoc({ rows: doc.rows.map((row) => row.id === linhaDaNotaEmCriacao ? { ...row, noteId: sheet.id } : row) });
      setLinhaDaNotaEmCriacao(null);
    }
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
          {bloqueado && (
            <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-[#E5E7EB] bg-[#F9FAFB] px-2.5 py-1 text-[11px] font-bold text-[#64748B]">
              <Lock size={11} />
              Somente leitura — edite pela nota de origem
            </span>
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
              readOnly={bloqueado}
              className="h-11 min-w-[220px] flex-1 rounded-xl border border-[#E5E7EB] bg-white px-3 text-[14px] font-bold text-[#2D2D2D] outline-none focus:border-[#F05D28]"
            />
            <label className="flex h-11 items-center gap-2 rounded-xl border border-[#E5E7EB] bg-white px-3 text-[13px] font-medium text-[#2D2D2D] cursor-pointer">
              <input
                type="checkbox"
                checked={doc.publica !== false}
                disabled={bloqueado}
                onChange={(e) => atualizarDoc({ publica: e.target.checked })}
                className="h-4 w-4 accent-[#F05D28] cursor-pointer"
              />
              Público
            </label>
            {!bloqueado && (
              <button
                type="button"
                onClick={() => void handleSalvar()}
                disabled={salvando}
                className="h-11 rounded-xl bg-[#F05D28] px-5 text-[13px] font-bold text-white transition-colors hover:bg-[#D94E1F] disabled:opacity-60"
              >
                {salvando ? 'Salvando...' : 'Salvar'}
              </button>
            )}
            {erroSalvar && (
              <span className="inline-flex items-center gap-1 rounded-full border border-[#FED7AA] bg-[#FFF7ED] px-2.5 py-1 text-[11px] font-bold text-[#B45309]">
                {erroSalvar}
              </span>
            )}
          </div>

          <CronogramaGrid doc={doc} onChange={atualizarDoc} currentUser={currentUser} usuarios={usuarios} notes={notes} activities={buildActivitiesFromEap(preloadedData, currentUser)} readOnly={bloqueado}
            onCreateNote={onSaveNote ? (rowId) => { setLinhaDaNotaEmCriacao(rowId); setSheetAberta(novaNotaBase(currentUser)); } : undefined}
            onOpenNote={(id) => setSheetAberta(notes.find((note) => note.id === id) || null)} />
        </div>
      </div>
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

    </div>,
    document.body,
  );
}
