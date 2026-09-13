// Catalogo estatico do CEPT (ADR 0001 §1). NAO e collection do Firestore --
// muda por decisao de contrato, sem gatilho de escala. Ver docs/decisoes/0001-cept-acompanhamento-entregas-firestore.md

export const projectNames: Record<string, string> = {
  '001': 'Implantação',
  '002': 'Expressões',
  '003': 'Linguagens',
  '004': 'Tecnologias',
  '005': 'Complexo Esportivo',
  '006': 'Cineteatro',
  '007': 'Planetário',
  '008': 'Guarita',
  '009': 'Skatepark',
};

export const projectCodes = Object.keys(projectNames) as Array<keyof typeof projectNames>;

export const deliverableOrder = ['RVT', 'PDF', 'IFC', 'MC', 'MD', 'ET/RT', 'MA'];

export const disciplineAliases: Record<string, string> = {
  ELE: 'ELET',
};

export const restrictedDisciplines: Record<string, string[]> = {
  TOPO: ['001'],
  TSD: ['001'],
};
