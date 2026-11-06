import type { AccIssue } from '../../src/lib/accData';
export const largeIssues: AccIssue[] = Array.from({ length: 1298 }, (_, index) => ({
  id: `#${index + 1}`, os: '061', titulo: `Audit issue ${index + 1}`, status: 'Aberto', categoria: 'Quality', tipo: 'Desenho', empresa: '', criadoEm: '2026-11-06T12:00:00Z', setor: index < 1295 ? 'ARQ' : ['ELET', 'ZZZ', ''][index - 1295], origem: 'acc',
}));
export const largeResumo = { osVersions: { '061': 'large-audit-v1' }, empresas: [], totais: {
  '["061","ARQ","Desenho","","Aberto","2026-11"]': 1295,
  '["061","ELET","Desenho","","Aberto","2026-11"]': 1,
  '["061","ZZZ","Desenho","","Aberto","2026-11"]': 1,
  '["061","","Desenho","","Aberto","2026-11"]': 1,
} };
