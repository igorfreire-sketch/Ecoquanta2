// Estado dos filtros de nota, compartilhado pela lista principal (Anotacoes) e pela
// janela "Nova nota" (Notes). Vive aqui, sem dependencia de componente, pra que as duas
// telas nao possam mais divergir: ate 09/2026 a janela tinha 6 filtros e a lista 9, e a
// diferenca so aparecia pro usuario.
//
// A UI e NotesFilterBar.tsx; a funcao que aplica (filtrarNotas) fica em Anotacoes.tsx,
// perto dos getters de nota, pra nao criar import circular.

export type NotesOrdenacao = 'alfabetica' | 'data-asc' | 'data-desc';

export interface NotesFilterState {
  autor: string;
  contrato: string;
  os: string;
  edificacao: string;
  disciplina: string;
  vinculo: string;
  texto: string;
  /** Busca tambem dentro do conteudo (bancos, checklists, textos), nao so no titulo. */
  buscarConteudo: boolean;
  ordenacao: NotesOrdenacao;
}

/** Sentinela do filtro de autor: nao colide com nenhum e-mail real. */
export const AUTOR_EU = '__eu__';

export const FILTRO_NOTAS_VAZIO: NotesFilterState = {
  autor: '',
  contrato: '',
  os: '',
  edificacao: '',
  disciplina: '',
  vinculo: '',
  texto: '',
  buscarConteudo: false,
  // Mantem o padrao historico da lista principal. Nao trocar sem o dono pedir.
  ordenacao: 'data-asc',
};

/**
 * `ordenacao` e `buscarConteudo` ficam FORA da conta: sao modo de exibicao, nao recorte.
 * Mostrar "Limpar filtros" so porque o usuario escolheu uma ordem seria ruido.
 */
export function temFiltroAtivo(f: NotesFilterState): boolean {
  return Boolean(f.autor || f.contrato || f.os || f.edificacao || f.disciplina || f.vinculo || f.texto);
}

/**
 * Limpa o recorte e PRESERVA a ordenacao escolhida — trocar a ordem do usuario por baixo
 * ao limpar filtro e surpresa, nao limpeza.
 */
export function limparFiltroNotas(f: NotesFilterState): NotesFilterState {
  return { ...FILTRO_NOTAS_VAZIO, ordenacao: f.ordenacao, buscarConteudo: f.buscarConteudo };
}

/** Contrato e pre-filtro de OS, e OS e pre-filtro de edificacao (padrão.md). */
export function aplicarCascata(f: NotesFilterState, campo: keyof NotesFilterState, valor: string | boolean): NotesFilterState {
  const proximo = { ...f, [campo]: valor } as NotesFilterState;
  if (campo === 'contrato') { proximo.os = ''; proximo.edificacao = ''; }
  if (campo === 'os') proximo.edificacao = '';
  return proximo;
}
