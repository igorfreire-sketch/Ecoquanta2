import React from 'react';
import { createPortal } from 'react-dom';
import { FileText, Globe, Lock, Network, Plus } from 'lucide-react';
import { getDisciplineDisplayName, buildActivitiesFromEap } from '../Atividades';
import SearchableSelect from '../SearchableSelect';
import { disciplineMatchesSector, getSectorOptions } from '../../lib/disciplineCatalog';
import Anotacoes, {
  copiarNota,
  getSheetDisciplinas,
  novaNotaBase,
  type AnnotationSheet,
} from './Anotacoes';
import MindMap from './MindMap';

// Pagina Notes: unica em todo o app, identica em qualquer area. Todo usuario ve as
// proprias notas (publicas ou privadas) e todas as notas publicas dos outros.
interface NotesProps {
  disciplinas: string[];
  notes: AnnotationSheet[];
  osOptions: Array<{ codigo: string; nome: string; contratoCodigo?: string }>;
  currentUser: { nome: string; email: string; role?: string; isAdmin?: boolean };
  preloadedData?: any;
  usuarios?: Array<{ nome: string; email: string }>;
  // Nota que veio de uma notificação: abre direto no editor.
  abrirNota?: AnnotationSheet | null;
  onNotaAberta?: () => void;
  onSaveNote: (sheet: AnnotationSheet) => Promise<void>;
  onDeleteNote: (id: string) => Promise<void>;
}

export default function Notes({ disciplinas, notes, osOptions, currentUser, preloadedData, usuarios = [], abrirNota, onNotaAberta, onSaveNote, onDeleteNote }: NotesProps) {
  const [mapaAberto, setMapaAberto] = React.useState(false);
  // Nota aberta no editor por um botao daqui (Nova nota) ou por um no do Mapa Mental.
  const [sheetAberta, setSheetAberta] = React.useState<AnnotationSheet | null>(null);
  // Janela de criacao: escolher uma nota existente pra copiar, ou comecar em branco.
  const [criarAberto, setCriarAberto] = React.useState(false);
  const [filtroContrato, setFiltroContrato] = React.useState('');
  const [filtroOs, setFiltroOs] = React.useState('');
  const [filtroDisciplina, setFiltroDisciplina] = React.useState('');
  const [filtroAutor, setFiltroAutor] = React.useState('');

  React.useEffect(() => {
    if (!abrirNota) return;
    setSheetAberta(abrirNota);
    onNotaAberta?.();
  }, [abrirNota]);

  const allActivities = React.useMemo(
    () => buildActivitiesFromEap(preloadedData, currentUser),
    [preloadedData, currentUser]
  );

  const sortedDisciplinas = React.useMemo(
    () => Array.from(new Set(disciplinas)).sort((a, b) => getDisciplineDisplayName(a).localeCompare(getDisciplineDisplayName(b), 'pt-BR')),
    [disciplinas]
  );

  const contractOptions = React.useMemo(() => {
    const list = Array.isArray(preloadedData?.registro?.contracts) ? preloadedData.registro.contracts : [];
    return list
      .map((item: any) => ({ codigo: String(item?.codigo || '').trim(), nome: String(item?.nome || item?.codigo || '').trim() }))
      .filter((item: { codigo: string }) => item.codigo)
      .sort((a: { nome: string }, b: { nome: string }) => a.nome.localeCompare(b.nome, 'pt-BR'));
  }, [preloadedData]);

  const sortedOs = React.useMemo(
    () => Array.from(new Map(osOptions.map((os) => [os.codigo, os])).values()).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')),
    [osOptions]
  );

  // OS do contrato escolhido: o filtro de contrato e pre-filtro do de OS.
  const osFiltradas = React.useMemo(
    () => (filtroContrato ? sortedOs.filter((os) => os.contratoCodigo === filtroContrato) : sortedOs),
    [sortedOs, filtroContrato]
  );

  // Autores disponiveis no filtro: eu primeiro, depois os usuarios cadastrados.
  const autorOptions = React.useMemo(
    () => usuarios
      .filter((item) => item.email && item.email !== currentUser.email)
      .sort((a, b) => (a.nome || a.email).localeCompare(b.nome || b.email, 'pt-BR')),
    [usuarios, currentUser.email]
  );

  // Janela de criacao: minhas notas (publicas e particulares) + todas as publicas dos outros.
  const minhasNotas = React.useMemo(() => {
    const codigosDoContrato = new Set(osFiltradas.map((os) => os.codigo));
    return notes
      .filter((nota) => nota.autorEmail === currentUser.email || nota.publica !== false)
      .filter((nota) => !filtroAutor || nota.autorEmail === filtroAutor)
      .filter((nota) => !filtroContrato || (nota.osCodigo ? codigosDoContrato.has(nota.osCodigo) : false))
      .filter((nota) => !filtroOs || nota.osCodigo === filtroOs)
      .filter((nota) => !filtroDisciplina || getSheetDisciplinas(nota).some((item) => disciplineMatchesSector(item, filtroDisciplina)))
      .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
  }, [notes, currentUser.email, filtroAutor, filtroContrato, filtroOs, filtroDisciplina, osFiltradas]);

  const abrirCriacao = () => {
    setFiltroContrato('');
    setFiltroOs('');
    setFiltroDisciplina('');
    setFiltroAutor('');
    setCriarAberto(true);
  };

  const criarEmBranco = () => {
    setCriarAberto(false);
    setSheetAberta(novaNotaBase(currentUser));
  };

  const criarCopia = (origem: AnnotationSheet) => {
    setCriarAberto(false);
    setSheetAberta(copiarNota(origem, currentUser));
  };

  const editor = (
    <Anotacoes
      filter={{ type: 'all' }}
      sheets={notes}
      osOptions={osOptions}
      disciplinaOptions={sortedDisciplinas}
      contractOptions={contractOptions}
      usuarios={usuarios}
      currentUser={currentUser}
      activities={allActivities}
      onSave={onSaveNote}
      onDelete={onDeleteNote}
      controlledSheet={sheetAberta}
      onCloseControlled={() => setSheetAberta(null)}
    />
  );

  if (mapaAberto) {
    return (
      <>
        <MindMap
          sheets={notes}
          currentUserEmail={currentUser.email}
          osOptions={sortedOs}
          onOpenNote={(sheet) => setSheetAberta(sheet)}
          onClose={() => { setMapaAberto(false); setSheetAberta(null); }}
        />
        {sheetAberta && editor}
      </>
    );
  }

  return (
    <div className="rounded-2xl bg-white p-6 shadow-[0_10px_30px_-22px_rgba(15,23,42,0.45)]">
      <div className="mb-5 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={abrirCriacao}
          className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#F05D28] px-4 text-[13px] font-bold text-white transition-colors hover:bg-[#D94E1F] cursor-pointer"
        >
          <Plus size={15} />
          Nova nota
        </button>
        <button
          type="button"
          onClick={() => setMapaAberto(true)}
          className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#E5E7EB] bg-white px-4 text-[13px] font-bold text-[#2D2D2D] transition-colors hover:border-[#F7C7B7] hover:text-[#F05D28] cursor-pointer"
        >
          <Network size={15} />
          Mapa Mental
        </button>
      </div>

      {editor}

      {criarAberto && createPortal(
        // Portal pro body + ancorado no alto: fora do <main> o overflow nao empurra o modal pra
        // baixo; ele nasce mais alto (pt-[8vh]) em vez de centralizado lá embaixo.
        <div className="fixed inset-0 z-[220] flex items-start justify-center bg-slate-950/40 px-4 pb-4 pt-[8vh]" onClick={() => setCriarAberto(false)}>
          <div
            className="flex max-h-[80vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white p-5 shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-[15px] font-black text-[#2D2D2D]">Nova nota</h3>
              <button
                type="button"
                onClick={criarEmBranco}
                className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#F05D28] px-4 text-[13px] font-bold text-white hover:bg-[#D94E1F]"
              >
                <Plus size={15} />
                Criar em branco
              </button>
            </div>

            <p className="mt-2 text-[12px] text-[#94A3B8]">
              Ou parta de uma nota já criada (sua ou pública de outro usuário) — ela será copiada com bancos, notas e checklists.
            </p>

            <div className="mt-3 flex flex-wrap gap-2">
              <SearchableSelect
                value={filtroAutor}
                onChange={(event) => setFiltroAutor(event.target.value)}
                searchPlaceholder="Pesquisar autor..."
                className="h-11 w-[240px] rounded-xl border border-[#E5E7EB] bg-white px-3 text-[13px] font-medium text-[#2D2D2D] outline-none focus:border-[#F05D28]"
              >
                <option value="">Todas as notas públicas</option>
                <option value={currentUser.email}>Notas criadas por mim</option>
                {autorOptions.map((autor) => (
                  <option key={autor.email} value={autor.email}>{autor.nome || autor.email}</option>
                ))}
              </SearchableSelect>
              <SearchableSelect
                value={filtroContrato}
                onChange={(event) => { setFiltroContrato(event.target.value); setFiltroOs(''); }}
                searchPlaceholder="Todos os contratos"
                className="h-11 w-[240px] rounded-xl border border-[#E5E7EB] bg-white px-3 text-[13px] font-medium text-[#2D2D2D] outline-none focus:border-[#F05D28]"
              >
                <option value="">Todos os contratos</option>
                {contractOptions.map((contrato: { codigo: string; nome: string }) => (
                  <option key={contrato.codigo} value={contrato.codigo}>{contrato.codigo} - {contrato.nome}</option>
                ))}
              </SearchableSelect>
              <SearchableSelect
                value={filtroOs}
                onChange={(event) => setFiltroOs(event.target.value)}
                searchPlaceholder="Pesquisar OS..."
                className="h-11 w-[240px] rounded-xl border border-[#E5E7EB] bg-white px-3 text-[13px] font-medium text-[#2D2D2D] outline-none focus:border-[#F05D28]"
              >
                <option value="">Ordem de Serviço</option>
                {osFiltradas.map((os) => (
                  <option key={os.codigo} value={os.codigo}>{os.codigo} - {os.nome}</option>
                ))}
              </SearchableSelect>
              <SearchableSelect
                value={filtroDisciplina}
                onChange={(event) => setFiltroDisciplina(event.target.value)}
                searchPlaceholder="Pesquisar disciplina..."
                className="h-11 w-[240px] rounded-xl border border-[#E5E7EB] bg-white px-3 text-[13px] font-medium text-[#2D2D2D] outline-none focus:border-[#F05D28]"
              >
                <option value="">Todas as disciplinas</option>
                {getSectorOptions(sortedDisciplinas).map((setor) => (
                  <option key={setor} value={setor}>{setor}</option>
                ))}
              </SearchableSelect>
            </div>

            <div className="mt-4 flex-1 overflow-auto">
              {minhasNotas.length === 0 ? (
                <p className="px-1 py-3 text-[13px] text-[#94A3B8]">
                  Nenhuma nota com esses filtros. Use "Criar em branco".
                </p>
              ) : (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {minhasNotas.map((nota) => {
                    const os = sortedOs.find((item) => item.codigo === nota.osCodigo);
                    return (
                      <button
                        key={nota.id}
                        type="button"
                        onClick={() => criarCopia(nota)}
                        className="rounded-xl bg-white p-3 text-left shadow-[0_6px_16px_-12px_rgba(15,23,42,0.5)] transition-colors hover:bg-[#FFF7F3]"
                      >
                        <div className="flex items-center gap-1.5">
                          <FileText size={13} className="flex-shrink-0 text-[#F05D28]" />
                          <span className="truncate text-[13px] font-bold text-[#2D2D2D]">{nota.titulo || 'Sem título'}</span>
                          {nota.publica === false
                            ? <Lock size={11} className="flex-shrink-0 text-[#B45309]" />
                            : <Globe size={11} className="flex-shrink-0 text-[#10B981]" />}
                        </div>
                        <p className="mt-1 truncate text-[11px] font-medium text-[#94A3B8]">
                          {nota.autorEmail !== currentUser.email ? `${nota.autorNome || nota.autorEmail} · ` : ''}
                          {os ? `OS ${os.codigo} - ${os.nome}` : getDisciplineDisplayName(nota.disciplina) || 'Sem disciplina'}
                        </p>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
