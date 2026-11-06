import accOs from './accOs';
export default {
  osVersions: { '061': 'hash-061-v1', '068': 'hash-068-v1' },
  empresas: ['Quanta Consultoria', 'Projetos Alfa', 'Projetos Beta'],
  totais: { cruzamentos: Object.values(accOs).flat().map(issue => ({ ...issue, count: 1 })) },
  ultimaImportacao: { lidos: 5, novos: 5, alterados: 0, erros: [] },
};
