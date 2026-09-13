// Barra de filtros de nota — UNICA no app. Usada pela lista principal (Anotacoes) e pela
// janela "Nova nota" (Notes). Componente puro: so recebe estado e opcoes por props, nao
// busca dado nem conhece Firebase, entao nao ha import circular com Anotacoes.
//
// Antes existiam duas barras quase iguais que derivaram: a janela ficou sem Vinculo,
// ordenacao, "Buscar dentro da nota" e "Limpar filtros". Qualquer filtro novo daqui pra
// frente entra aqui uma vez e aparece nos dois lugares.

import React from 'react';
import SearchableSelect from '../SearchableSelect';
import { getSectorOptions } from '../../lib/disciplineCatalog';
import {
  AUTOR_EU,
  aplicarCascata,
  limparFiltroNotas,
  temFiltroAtivo,
  type NotesFilterState,
  type NotesOrdenacao,
} from '../../lib/notesFilter';

export interface NotesFilterBarProps {
  value: NotesFilterState;
  onChange: (proximo: NotesFilterState) => void;
  autores: Array<{ nome?: string; email: string }>;
  contratos: Array<{ codigo: string; nome: string }>;
  /** Ja filtradas pelo contrato escolhido — quem chama resolve a cascata de dados. */
  osOptions: Array<{ codigo: string; nome: string; contratoCodigo?: string }>;
  edificacoes: string[];
  disciplinas: string[];
  /** Rotulo da OS: a lista usa `formatOsLabel`, que conhece o formato do contrato. */
  formatOs?: (os: { codigo: string; nome: string }) => string;
  /** Conteudo colado a direita (ex.: o menu "Exportar em .MD", que so a lista tem). */
  acoes?: React.ReactNode;
  /** Densidade: a janela modal e mais estreita que a pagina. */
  largura?: 'auto' | 'fluida';
}

export default function NotesFilterBar({
  value,
  onChange,
  autores,
  contratos,
  osOptions,
  edificacoes,
  disciplinas,
  formatOs,
  acoes,
  largura = 'auto',
}: NotesFilterBarProps) {
  // 'fluida' deixa cada campo crescer/encolher dentro do container (janela); 'auto' mantem
  // a largura fixa de 200px que a pagina ja usava.
  const campo =
    largura === 'fluida'
      ? 'h-11 min-w-[170px] flex-1 rounded-xl border border-[#E5E7EB] bg-white px-3 text-[13px] font-medium text-[#2D2D2D] outline-none focus:border-[#F05D28]'
      : 'h-11 w-[200px] rounded-xl border border-[#E5E7EB] bg-white px-3 text-[13px] font-medium text-[#2D2D2D] outline-none focus:border-[#F05D28]';

  const set = (chave: keyof NotesFilterState, valor: string | boolean) => onChange(aplicarCascata(value, chave, valor));
  const rotuloOs = formatOs || ((os: { codigo: string; nome: string }) => `${os.codigo} - ${os.nome}`);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <SearchableSelect
        value={value.autor}
        onChange={(event) => set('autor', event.target.value)}
        searchPlaceholder="Pesquisar autor..."
        className={campo}
      >
        <option value="">Todos os autores</option>
        <option value={AUTOR_EU}>Criado por mim</option>
        {autores.map((user) => (
          <option key={user.email} value={user.email}>{user.nome || user.email}</option>
        ))}
      </SearchableSelect>

      <SearchableSelect
        value={value.contrato}
        onChange={(event) => set('contrato', event.target.value)}
        searchPlaceholder="Pesquisar contrato..."
        className={campo}
      >
        <option value="">Todos os contratos</option>
        {contratos.map((contrato) => (
          <option key={contrato.codigo} value={contrato.codigo}>{contrato.codigo} - {contrato.nome}</option>
        ))}
      </SearchableSelect>

      <SearchableSelect
        value={value.os}
        onChange={(event) => set('os', event.target.value)}
        searchPlaceholder="Pesquisar OS..."
        className={campo}
      >
        <option value="">Todas as OS</option>
        {osOptions.map((os) => (
          <option key={os.codigo} value={os.codigo}>{rotuloOs(os)}</option>
        ))}
      </SearchableSelect>

      <select
        disabled={edificacoes.length === 0}
        value={value.edificacao}
        onChange={(event) => set('edificacao', event.target.value)}
        title={edificacoes.length === 0 ? 'Escolha uma OS com edificação cadastrada' : undefined}
        className={`${campo} disabled:cursor-not-allowed disabled:opacity-50`}
      >
        <option value="">{edificacoes.length === 0 ? 'Sem edificação nesta OS' : 'Todas as edificações'}</option>
        {edificacoes.map((edificio) => (
          <option key={edificio} value={edificio}>{edificio}</option>
        ))}
      </select>

      <SearchableSelect
        value={value.disciplina}
        onChange={(event) => set('disciplina', event.target.value)}
        searchPlaceholder="Pesquisar disciplina..."
        className={campo}
      >
        <option value="">Todas as disciplinas</option>
        {getSectorOptions(disciplinas).map((setor) => (
          <option key={setor} value={setor}>{setor}</option>
        ))}
      </SearchableSelect>

      <SearchableSelect
        value={value.vinculo}
        onChange={(event) => set('vinculo', event.target.value)}
        searchPlaceholder="Pesquisar vínculo..."
        className={campo}
      >
        <option value="">Todas as notas</option>
        <option value="vinculado">Fui vinculado</option>
      </SearchableSelect>

      <select
        value={value.ordenacao}
        onChange={(event) => set('ordenacao', event.target.value as NotesOrdenacao)}
        aria-label="Ordenar notas"
        className={campo}
      >
        <option value="data-desc">Mais recentes primeiro</option>
        <option value="data-asc">Mais antigas primeiro</option>
        <option value="alfabetica">Alfabética</option>
      </select>

      <input
        type="search"
        value={value.texto}
        onChange={(event) => set('texto', event.target.value)}
        aria-label="Buscar nas notas"
        placeholder="Buscar nas notas..."
        className={campo}
      />

      <label className="flex h-11 items-center gap-1.5 whitespace-nowrap text-[12px] font-medium text-[#64748B]">
        <input
          type="checkbox"
          checked={value.buscarConteudo}
          onChange={(event) => set('buscarConteudo', event.target.checked)}
          className="h-4 w-4 cursor-pointer accent-[#F05D28]"
        />
        Buscar dentro da nota
      </label>

      {temFiltroAtivo(value) && (
        <button
          type="button"
          onClick={() => onChange(limparFiltroNotas(value))}
          className="h-11 rounded-xl px-3 text-[12px] font-bold text-[#64748B] hover:text-[#F05D28]"
        >
          Limpar filtros
        </button>
      )}

      {acoes && <div className="relative ml-auto">{acoes}</div>}
    </div>
  );
}
