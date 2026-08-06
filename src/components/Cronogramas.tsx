import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Copy, FileSpreadsheet, FileText, Globe, Lock, MoreVertical, Plus, Trash2 } from 'lucide-react';
import { isFirebaseConfigured, fetchFirebaseCollection, setFirebaseDocument, deleteFirebaseDocument, canDeleteNote } from '../lib/firebaseDb';
import { exportCronogramaToCsv, exportCronogramaToPdf, exportCronogramasToMarkdown } from '../lib/cronogramaExport';
import SearchableSelect from './SearchableSelect';
import SolucoesDigitais, { CRONOGRAMAS_COLLECTION, type CronogramaDoc, type CronoRow } from './SolucoesDigitais';
import type { AnnotationSheet } from './CoordenacaoEngenharia/Anotacoes';

// Colecao antiga (uma linha = um doc solto): migrada uma unica vez pro 1o doc de `cronogramas`,
// com id fixo — assim a migracao roda so na primeira vez que a colecao nova estiver vazia.
const LEGACY_COLLECTION = 'solucoesDigitaisCronograma';
const LEGACY_ID = 'legado-solucoes-digitais';

// Mesma classe (verbatim) dos selects de filtro da lista de notas em Anotacoes.tsx, pra bater
// exatamente o tamanho/estilo.
const filtroClass = 'h-11 w-[200px] rounded-xl border border-[#E5E7EB] bg-white px-3 text-[13px] font-medium text-[#2D2D2D] outline-none focus:border-[#F05D28]';

interface CronogramasProps {
  currentUser: { nome: string; email: string; role?: string; isAdmin?: boolean; disciplinas?: string[] };
  usuarios?: Array<{ nome: string; email: string; disciplinas?: string[] }>;
  notes?: AnnotationSheet[];
  onSaveNote?: (sheet: AnnotationSheet) => Promise<void>;
  onDeleteNote?: (id: string) => Promise<void>;
  preloadedData?: any;
}

// Mesma logica de deteccao de SolucoesDigitais.tsx: aponta a causa real (regra do Firestore nao
// publicada) em vez de deixar a acao parecer que nao fez nada.
function mensagemErro(acao: string, err: unknown): string {
  if ((err as { code?: string })?.code === 'permission-denied') {
    return `Não foi possível ${acao}: a regra do Firestore para a coleção "cronogramas" ainda não foi publicada no Console.`;
  }
  return `Não foi possível ${acao}: ${(err as Error)?.message || 'erro desconhecido'}.`;
}

// Clona um cronograma existente: mesma convencao de `copiarNota` (Anotacoes.tsx) — id novo,
// titulo com sufixo "(cópia)", autor = quem esta copiando, timestamps novos.
function copiarCronograma(origem: CronogramaDoc, autor: { nome: string; email: string }): CronogramaDoc {
  return {
    ...origem,
    id: crypto.randomUUID(),
    titulo: `${origem.titulo || 'Sem título'} (cópia)`,
    autorNome: autor.nome,
    autorEmail: autor.email,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

// Pagina "Project": mesmo padrao visual/comportamental da LISTA de Anotacoes.tsx (filtro de
// autor, botao .MD, abas Meus/Publicos, card com menu de 3 pontos) + o botao/modal de criacao
// no estilo de Notes.tsx, adaptados ao que CronogramaDoc realmente tem (sem contrato/OS/
// disciplina/edificação — esses campos nao existem no modelo, entao nao entraram nos filtros).
export default function Cronogramas({ currentUser, usuarios = [], notes = [], onSaveNote, onDeleteNote, preloadedData }: CronogramasProps) {
  const [cronogramas, setCronogramas] = useState<CronogramaDoc[]>([]);
  const [abertoId, setAbertoId] = useState<string | null>(null);
  const [carregado, setCarregado] = useState(false);
  // Filtro/abas da lista principal (equivalente a listaAutor/notasTab de Anotacoes.tsx).
  const [listaAutor, setListaAutor] = useState('');
  const [cronogramasTab, setCronogramasTab] = useState<'meus' | 'publicos'>('meus');
  const [openCardMenuId, setOpenCardMenuId] = useState<string | null>(null);
  const [cardMenuPos, setCardMenuPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [erroAcao, setErroAcao] = useState<string | null>(null);

  async function carregar() {
    if (!isFirebaseConfigured()) { setCarregado(true); return; }
    try {
      let lista = await fetchFirebaseCollection<CronogramaDoc>(CRONOGRAMAS_COLLECTION);
      if (lista.length === 0) {
        const legado = await fetchFirebaseCollection<CronoRow & { id: string }>(LEGACY_COLLECTION).catch(() => []);
        if (legado.length > 0) {
          const seed: CronogramaDoc = {
            id: LEGACY_ID,
            titulo: 'Cronograma — Soluções digitais',
            autorEmail: currentUser.email,
            autorNome: currentUser.nome,
            publica: true,
            colunasCustom: [],
            rows: legado.map((r) => ({ ...r, custom: {} })).sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0)),
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
          await setFirebaseDocument(CRONOGRAMAS_COLLECTION, seed.id, seed);
          lista = [seed];
        }
      }
      setCronogramas(lista.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || '')));
    } catch {
      // sem persistencia agora: segue vazio, sem travar a tela
    }
    setCarregado(true);
  }

  useEffect(() => { carregar(); }, []);

  // Mesma formula de visibilidade da Notes.tsx (`minhasNotas`)/Anotacoes.tsx: minhas (publicas
  // e particulares) + publicas de todo mundo.
  const visiveis = cronogramas
    .filter((c) => c.autorEmail === currentUser.email || c.publica !== false)
    .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));

  // Autores disponiveis nos filtros (criacao e lista): eu de fora, demais ordenados por nome.
  const autorOptions = usuarios
    .filter((u) => u.email && u.email !== currentUser.email)
    .sort((a, b) => (a.nome || a.email).localeCompare(b.nome || b.email, 'pt-BR'));

  // Lista principal filtrada por autor (equivalente a `listaFiltrada` de Anotacoes.tsx), depois
  // dividida em abas Meus/Publicos (equivalente a minhasNotasTodas/notasDeOutros).
  const listaFiltrada = listaAutor ? visiveis.filter((c) => c.autorEmail === listaAutor) : visiveis;
  const meusCronogramas = listaFiltrada.filter((c) => c.autorEmail === currentUser.email);
  const cronogramasPublicos = listaFiltrada.filter((c) => c.autorEmail !== currentUser.email);
  const temFiltroLista = Boolean(listaAutor);

  // Cria localmente e abre direto no editor fullscreen — nao grava no Firestore ainda (o doc so
  // existe de fato quando o usuario clicar "Salvar" no editor, que ja sabe fazer upsert por id).
  function abrirNovo() {
    const doc: CronogramaDoc = {
      id: crypto.randomUUID(),
      titulo: '',
      autorEmail: currentUser.email,
      autorNome: currentUser.nome,
      publica: true,
      colunasCustom: [],
      rows: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    setCronogramas((prev) => [doc, ...prev]);
    setAbertoId(doc.id);
  }

  const duplicarCronograma = (c: CronogramaDoc) => {
    setOpenCardMenuId(null);
    setErroAcao(null);
    const copia = copiarCronograma(c, currentUser);
    setCronogramas((prev) => [copia, ...prev]);
    if (isFirebaseConfigured()) {
      setFirebaseDocument(CRONOGRAMAS_COLLECTION, copia.id, copia).catch((err) => {
        console.error('Erro ao duplicar cronograma:', err);
        setErroAcao(mensagemErro('duplicar o cronograma', err));
      });
    }
    setAbertoId(copia.id);
  };

  const podeExcluir = (c: CronogramaDoc) => canDeleteNote(currentUser, c.autorEmail);

  const excluirCronograma = (c: CronogramaDoc) => {
    setOpenCardMenuId(null);
    if (!window.confirm(`Excluir o cronograma "${c.titulo || 'Sem título'}"?`)) return;
    setErroAcao(null);
    setCronogramas((prev) => prev.filter((item) => item.id !== c.id));
    if (isFirebaseConfigured()) {
      deleteFirebaseDocument(CRONOGRAMAS_COLLECTION, c.id).catch((err) => {
        console.error('Erro ao excluir cronograma:', err);
        setErroAcao(mensagemErro('excluir o cronograma', err));
      });
    }
  };

  const aberto = cronogramas.find((c) => c.id === abertoId);

  // Card com menu de 3 pontos (Duplicar, Exportar XLS/PDF, Excluir) — mesma posicao/clamp/click-catcher
  // de renderCard em Anotacoes.tsx (~linhas 2578-2658).
  const renderCard = (c: CronogramaDoc) => (
    <div key={c.id} className="relative overflow-hidden rounded-xl bg-white p-4 shadow-[0_6px_16px_-12px_rgba(15,23,42,0.5)] transition-colors">
      <div
        role="button"
        tabIndex={0}
        onClick={() => setAbertoId(c.id)}
        onKeyDown={(event) => { if (event.key === 'Enter') setAbertoId(c.id); }}
        className="cursor-pointer pr-8 text-left"
      >
        <div className="flex items-center gap-1.5">
          <p className="truncate text-[13px] font-bold text-[#2D2D2D]">{c.titulo || 'Sem título'}</p>
          {c.publica === false
            ? <Lock size={12} className="flex-shrink-0 text-[#B45309]" />
            : <Globe size={12} className="flex-shrink-0 text-[#10B981]" />}
        </div>
        <p className="mt-1 text-[11px] font-medium text-[#94A3B8]">
          {c.autorEmail !== currentUser.email ? `${c.autorNome || c.autorEmail} · ` : ''}
          {c.updatedAt ? new Date(c.updatedAt).toLocaleDateString('pt-BR') : ''}
        </p>
      </div>

      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          const r = event.currentTarget.getBoundingClientRect();
          setCardMenuPos({ x: Math.max(8, Math.min(r.right - 176, window.innerWidth - 184)), y: r.bottom + 4 });
          setOpenCardMenuId((prev) => (prev === c.id ? null : c.id));
        }}
        className="absolute right-2 top-2 z-10 flex h-6 w-6 items-center justify-center rounded-full text-[#94A3B8] hover:bg-[#F3F4F6] hover:text-[#2D2D2D]"
      >
        <MoreVertical size={14} />
      </button>

      {openCardMenuId === c.id && createPortal(
        <>
          <div className="fixed inset-0 z-[190]" onClick={() => setOpenCardMenuId(null)} />
          <div className="fixed z-[191] w-44 rounded-xl bg-white p-1.5 shadow-xl" style={{ left: cardMenuPos.x, top: cardMenuPos.y }}>
            <button
              type="button"
              onClick={() => { setOpenCardMenuId(null); exportCronogramaToCsv(c); }}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[12px] font-medium text-[#374151] hover:bg-[#F3F4F6]"
            >
              <FileSpreadsheet size={14} />
              Exportar XLS
            </button>
            <button
              type="button"
              onClick={() => { setOpenCardMenuId(null); exportCronogramaToPdf(c); }}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[12px] font-medium text-[#374151] hover:bg-[#F3F4F6]"
            >
              <FileText size={14} />
              Exportar PDF
            </button>
            <button
              type="button"
              onClick={() => duplicarCronograma(c)}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[12px] font-medium text-[#374151] hover:bg-[#F3F4F6]"
            >
              <Copy size={14} />
              Duplicar
            </button>
            {podeExcluir(c) && (
              <button
                type="button"
                onClick={() => excluirCronograma(c)}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[12px] font-medium text-[#DC2626] hover:bg-[#FEE2E2]"
              >
                <Trash2 size={14} />
                Excluir
              </button>
            )}
          </div>
        </>,
        document.body,
      )}
    </div>
  );

  return (
    <div className="rounded-2xl bg-white p-6 shadow-[0_10px_30px_-22px_rgba(15,23,42,0.45)]">
      <div className="mb-5 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={abrirNovo}
          className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#F05D28] px-4 text-[13px] font-bold text-white transition-colors hover:bg-[#D94E1F] cursor-pointer"
        >
          <Plus size={15} />
          Novo Cronograma
        </button>
      </div>

      {erroAcao && (
        <p className="mb-4 inline-flex items-center gap-1 rounded-full border border-[#FED7AA] bg-[#FFF7ED] px-2.5 py-1 text-[11px] font-bold text-[#B45309]">
          {erroAcao}
        </p>
      )}

      {visiveis.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <SearchableSelect
            value={listaAutor}
            onChange={(event) => setListaAutor(event.target.value)}
            searchPlaceholder="Pesquisar autor..."
            className={filtroClass}
          >
            <option value="">Todos os autores</option>
            <option value={currentUser.email}>Criado por mim</option>
            {autorOptions.map((autor) => (
              <option key={autor.email} value={autor.email}>{autor.nome || autor.email}</option>
            ))}
          </SearchableSelect>
          {temFiltroLista && (
            <button
              type="button"
              onClick={() => setListaAutor('')}
              className="h-11 rounded-xl px-3 text-[12px] font-bold text-[#64748B] hover:text-[#F05D28]"
            >
              Limpar filtros
            </button>
          )}
          <div className="ml-auto">
            <button
              type="button"
              onClick={() => exportCronogramasToMarkdown(listaFiltrada, currentUser.email)}
              className="inline-flex h-11 items-center gap-2 rounded-xl border border-[#E5E7EB] bg-white px-4 text-[13px] font-bold text-[#2D2D2D] hover:border-[#F7C7B7] hover:text-[#F05D28]"
            >
              <FileText size={15} />
              Exportar em .MD
            </button>
          </div>
        </div>
      )}

      {listaFiltrada.length === 0 ? (
        <p className="text-[13px] text-[#757575]">
          {temFiltroLista || cronogramas.length > 0
            ? 'Nenhum cronograma com esses filtros.'
            : 'Nenhum cronograma ainda. Clique em "Novo Cronograma" para começar.'}
        </p>
      ) : (
        <>
          {/* Abas: Meus Cronogramas / Cronogramas Públicos. Sem aba "Concluídos" — CronogramaDoc
              nao tem conceito de conclusao (so `percentualConcluido` por LINHA, nao pelo doc todo). */}
          <div className="mb-4 flex items-center gap-1 border-b border-[#E5E7EB]">
            <button
              type="button"
              onClick={() => setCronogramasTab('meus')}
              className={`border-b-2 px-3 py-2 text-[12px] font-bold transition-colors ${cronogramasTab === 'meus' ? 'border-[#F05D28] text-[#2D2D2D]' : 'border-transparent text-[#94A3B8] hover:text-[#2D2D2D]'}`}
            >
              Meus Cronogramas
            </button>
            <button
              type="button"
              onClick={() => setCronogramasTab('publicos')}
              className={`border-b-2 px-3 py-2 text-[12px] font-bold transition-colors ${cronogramasTab === 'publicos' ? 'border-[#F05D28] text-[#2D2D2D]' : 'border-transparent text-[#94A3B8] hover:text-[#2D2D2D]'}`}
            >
              Cronogramas Públicos
            </button>
          </div>

          {cronogramasTab === 'meus' ? (
            meusCronogramas.length === 0 ? (
              <p className="text-[12px] text-[#94A3B8]">Você ainda não criou nenhum cronograma aqui.</p>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {meusCronogramas.map((c) => renderCard(c))}
              </div>
            )
          ) : (
            cronogramasPublicos.length === 0 ? (
              <p className="text-[12px] text-[#94A3B8]">Nenhum cronograma público de outro usuário ainda.</p>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {cronogramasPublicos.map((c) => renderCard(c))}
              </div>
            )
          )}
        </>
      )}

      {aberto && (
        <SolucoesDigitais
          cronograma={aberto}
          onVoltar={() => { setAbertoId(null); carregar(); }}
          currentUser={currentUser}
          usuarios={usuarios}
          notes={notes}
          onSaveNote={onSaveNote}
          onDeleteNote={onDeleteNote}
          preloadedData={preloadedData}
        />
      )}
    </div>
  );
}
