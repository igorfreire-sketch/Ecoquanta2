export interface RegistroOriginal {
  id: string | number;
  os: string;
  descricao: string;
  contrato: string;
  disciplina: string;
  prazoAtual?: number;
  dificuldade: number;
  importancia?: number;
  responsavel?: string;
  percentualConcluido: number;
  avaliacao: 'Melhor que o esperado' | 'Dentro do esperado' | 'Pior que o esperado' | 'Problema/Bloqueio';
  alocacao?: number;
}

export interface AtividadeConsolidada {
  id: string;
  descricao: string;
  os: string;
  disciplina: string;
  piorAvaliacao: string;
  impacto: number;
  esforco: number;
  alocacaoTotal: number;
  progressoMedio: number;
  profissionaisEnvolvidos: number;
}

const PESO_AVALIACAO: Record<string, number> = {
  'Problema/Bloqueio': 100,
  'Pior que o esperado': 75,
  'Dentro do esperado': 35,
  'Melhor que o esperado': 10
};

export function processarAtividades(dados: RegistroOriginal[]): AtividadeConsolidada[] {
  if (!dados || dados.length === 0) return [];

  const grupos: Record<string, RegistroOriginal[]> = {};
  dados.forEach((reg) => {
    const chave = `${reg.os}-${reg.descricao}`;
    if (!grupos[chave]) grupos[chave] = [];
    grupos[chave].push(reg);
  });

  return Object.keys(grupos).map((chave) => {
    const registros = grupos[chave];
    const principal = registros[0];

    const alocacaoTotal = registros.reduce((sum, item) => sum + (item.alocacao || 0), 0);
    const progressoMedio = registros.reduce((sum, item) => sum + item.percentualConcluido, 0) / registros.length;
    const dificuldadeMaxima = Math.max(...registros.map((item) => item.dificuldade || 1));
    const importanciaMaxima = Math.max(...registros.map((item) => item.importancia || 1));
    const avaliacoesOrdenadas = registros.map((item) => item.avaliacao).sort((a, b) => PESO_AVALIACAO[b] - PESO_AVALIACAO[a]);
    const piorAvaliacao = avaliacoesOrdenadas[0];

    return {
      id: chave,
      descricao: principal.descricao,
      os: principal.os,
      disciplina: principal.disciplina,
      piorAvaliacao,
      impacto: (importanciaMaxima / 3) * 100,
      esforco: ((4 - dificuldadeMaxima) / 3) * 100,
      alocacaoTotal,
      progressoMedio,
      profissionaisEnvolvidos: registros.length
    };
  }).filter((item) => item.progressoMedio < 100);
}
