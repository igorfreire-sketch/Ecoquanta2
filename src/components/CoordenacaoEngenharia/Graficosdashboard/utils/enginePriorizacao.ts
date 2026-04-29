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
  dados.forEach(reg => {
    const chave = `${reg.os}-${reg.descricao}`;
    if (!grupos[chave]) grupos[chave] = [];
    grupos[chave].push(reg);
  });

  return Object.keys(grupos).map(chave => {
    const registros = grupos[chave];
    const principal = registros[0];

    const alocacaoTotal = registros.reduce((sum, r) => sum + (r.alocacao || 0), 0);
    const progressoMedio = registros.reduce((sum, r) => sum + r.percentualConcluido, 0) / registros.length;
    const pendencia = 100 - progressoMedio;
    const difMaxima = Math.max(...registros.map(r => r.dificuldade || 1));
    const avaliacoesOrdenadas = registros.map(r => r.avaliacao).sort((a, b) => PESO_AVALIACAO[b] - PESO_AVALIACAO[a]);
    const piorAvaliacao = avaliacoesOrdenadas[0];
    const scoreAvaliacao = PESO_AVALIACAO[piorAvaliacao];

    // Motor central de scores dinâmicos de esforço e impacto
    const impacto = (scoreAvaliacao * 0.45) + (pendencia * 0.30) + (Math.min(alocacaoTotal, 100) * 0.25);
    const complexidadeEquipe = Math.min((registros.length / 5) * 100, 100);
    const esforco = ((difMaxima * 20) * 0.50) + (pendencia * 0.30) + (complexidadeEquipe * 0.20);

    return {
      id: chave,
      descricao: principal.descricao,
      os: principal.os,
      disciplina: principal.disciplina,
      piorAvaliacao: piorAvaliacao,
      impacto,
      esforco,
      alocacaoTotal,
      progressoMedio,
      profissionaisEnvolvidos: registros.length
    };
  }).filter(a => a.progressoMedio < 100);
}
