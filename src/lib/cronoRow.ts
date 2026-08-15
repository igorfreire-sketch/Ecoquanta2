// Forma de uma LINHA de Project (colecao `cronogramas`) + os helpers de data que ela usa.
// Mora aqui, e nao em SolucoesDigitais.tsx, porque a nota (Anotacoes.tsx) tambem cria/edita
// linhas do bloco Project embutido — e SolucoesDigitais.tsx ja importa Anotacoes.tsx, entao
// importar na volta fecharia um ciclo de modulos.

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

// `id` e a chave tecnica imutavel; `seq` e a base estavel do ID exibido (ver padrão.md):
// linha nova sempre recebe UUID novo e um seq acima do maior ja existente.
export function criarLinhaVazia(seq: number): CronoRow {
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

export function proximoSeq(rows: CronoRow[]): number {
  return rows.reduce((max, row) => Math.max(max, row.seq || 0), 0) + 1;
}

export function parseDataLocal(valor: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valor || '');
  if (!match) return null;
  const data = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(data.getTime()) ? null : data;
}

export function formatarDataLocal(data: Date): string {
  const y = data.getFullYear();
  const m = String(data.getMonth() + 1).padStart(2, '0');
  const d = String(data.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// ponytail: dias corridos (calendario), sem considerar feriados/dias uteis
export function diffDias(inicio: string, fim: string): number | null {
  const dIni = parseDataLocal(inicio);
  const dFim = parseDataLocal(fim);
  if (!dIni || !dFim) return null;
  return Math.round((dFim.getTime() - dIni.getTime()) / 86400000);
}

export function addDias(inicio: string, dias: number): string {
  const dIni = parseDataLocal(inicio);
  if (!dIni || !Number.isFinite(dias)) return '';
  const resultado = new Date(dIni);
  resultado.setDate(resultado.getDate() + dias);
  return formatarDataLocal(resultado);
}
