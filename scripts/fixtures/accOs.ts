import type { AccIssue } from '../../src/lib/accData';

const accOs: Record<string, AccIssue[]> = {
  '061': [
    { id: '#1', key: '061-#1', os: '061', contratoCodigo: 'MRK', titulo: 'Folha sem carimbo', status: 'Aberto', categoria: 'Quality', tipo: 'Carimbo', empresa: 'Projetos Alfa', criadoEm: '2026-10-03T12:00:00-03:00', setor: 'Arquitetura' },
    { id: '#2', key: '061-#2', os: '061', contratoCodigo: 'MRK', titulo: 'Cota divergente', status: 'Concluido', categoria: 'Quality', tipo: 'Desenho', empresa: 'Quanta Consultoria', criadoEm: '2026-10-15T12:00:00-03:00', setor: 'Arquitetura' },
    { id: '#3', key: '061-#3', os: '061', contratoCodigo: 'MRK', titulo: 'Relatorio incompleto', status: 'Pendente', categoria: 'Quality', tipo: 'Relatorio', empresa: 'Projetos Beta', criadoEm: '2026-11-01T12:00:00-03:00', setor: 'Eletrica' },
  ],
  '068': [
    { id: '#1', key: '068-#1', os: '068', contratoCodigo: 'MRK', titulo: 'Arquivo ausente', status: 'Aberto', categoria: 'Quality', tipo: 'Arquivo', empresa: 'Projetos Alfa', criadoEm: '2026-11-02T12:00:00-03:00', setor: 'Hidraulica' },
    { id: '#2', key: '068-#2', os: '068', contratoCodigo: 'MRK', titulo: 'Revisao incorreta', status: 'Fechado', categoria: 'Quality', tipo: 'Desenho', empresa: 'Quanta Consultoria', criadoEm: '2026-11-04T12:00:00-03:00', setor: 'Arquitetura' },
  ],
};

export default accOs;
