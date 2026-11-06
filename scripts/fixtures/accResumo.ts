// Same wire shape as the real accSummary_: JSON dimensions -> count.
export default {
  osVersions: { '061': 'hash-061-v1', '068': 'hash-068-v1' },
  empresas: ['Quanta Consultoria', 'Projetos Alfa', 'Projetos Beta'],
  totais: {
    '["061","Arquitetura","Carimbo","Projetos Alfa","Aberto","2026-10"]': 1,
    '["061","Arquitetura","Desenho","Quanta Consultoria","Concluido","2026-10"]': 1,
    '["061","Eletrica","Relatorio","Projetos Beta","Pendente","2026-11"]': 1,
    '["068","Hidraulica","Arquivo","Projetos Alfa","Aberto","2026-11"]': 1,
    '["068","Arquitetura","Desenho","Quanta Consultoria","Fechado","2026-11"]': 1,
  },
  ultimaImportacao: { lidos: 5, novos: 5, alterados: 0, erros: [] },
};
