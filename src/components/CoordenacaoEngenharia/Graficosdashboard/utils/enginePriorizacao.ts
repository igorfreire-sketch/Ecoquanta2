export interface RegistroOriginal {
  id: string | number;
  activityId?: string;
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
    const chave = String(reg.activityId || `${reg.os}-${reg.descricao}`).trim();
    if (!grupos[chave]) grupos[chave] = [];
    grupos[chave].push(reg);
  });

  return Object.keys(grupos).map((chave) => {
    const registros = grupos[chave];
    const principal = registros[0];

    const alocacaoTotal = Math.min(100, registros.reduce((sum, item) => sum + (item.alocacao || 0), 0));
    const progressoMedio = registros.reduce((sum, item) => sum + item.percentualConcluido, 0) / registros.length;
    const dificuldadeMaxima = Math.max(...registros.map((item) => item.dificuldade || 1));
    const importanciaMaxima = Math.max(...registros.map((item) => item.importancia || 1));
    const avaliacoesOrdenadas = registros.map((item) => item.avaliacao).sort((a, b) => PESO_AVALIACAO[b] - PESO_AVALIACAO[a]);
    const piorAvaliacao = avaliacoesOrdenadas[0];
    const prazoCritico = Math.max(...registros.map((item) => {
      const prazo = Number(item.prazoAtual || 0);
      if (prazo < 0) return 100;
      if (prazo === 0) return 80;
      if (prazo <= 7) return 60;
      if (prazo <= 15) return 40;
      return 20;
    }));
    const impacto = Math.min(100, Math.round((((importanciaMaxima / 3) * 60) + (PESO_AVALIACAO[piorAvaliacao] * 0.25) + (prazoCritico * 0.15))));
    const esforco = Math.min(100, Math.round((((dificuldadeMaxima / 3) * 70) + (alocacaoTotal * 0.3))));
    const profissionaisUnicos = new Set(registros.map((item) => String(item.responsavel || '').trim()).filter(Boolean)).size;

    return {
      id: chave,
      descricao: principal.descricao,
      os: principal.os,
      disciplina: principal.disciplina,
      piorAvaliacao,
      impacto,
      esforco,
      alocacaoTotal,
      progressoMedio,
      profissionaisEnvolvidos: Math.max(profissionaisUnicos, registros.length ? 1 : 0)
    };
  }).filter((item) => item.progressoMedio < 100);
}
