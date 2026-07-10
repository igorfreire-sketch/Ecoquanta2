export interface PatchNoteEntry {
  version: string;
  date: string;
  title: string;
  items: string[];
}

// Mais recente primeiro. Ao lancar uma versao nova, adicione uma entrada no topo
// (nao edite as antigas) e suba o numero em src/config/appVersion.ts.
export const PATCH_NOTES: PatchNoteEntry[] = [
  {
    version: '1.1.0',
    date: '10/07/2026',
    title: 'Notas com múltiplos bancos, Cronograma no menu principal e mais',
    items: [
      'Notas agora podem ter várias tabelas ("Bancos") e vários blocos de texto livre — cada um pode ser adicionado ou apagado sem mexer nos outros.',
      'Exportar notas em .MD ficou muito mais completo: sai com índice, todos os metadados de cada nota e já pensado pra colar direto numa IA.',
      'Templates de notas agora podem ser marcados como públicos, pra qualquer pessoa usar como ponto de partida.',
      'Notas criadas dentro de uma Ordem de Serviço podem marcar várias disciplinas de uma vez, ou todas.',
      'Corrigido o Cronograma dentro de Notas > Disciplinas, que não mostrava as atividades da disciplina certa.',
      'Cronograma virou um item próprio no menu principal (à esquerda) — saiu de dentro de Área Técnica, Coordenação de Engenharia, Planejamento, Contrato e Conformidade.',
      'A aba Notas (a mesma de Coordenação de Engenharia) agora existe em todas as áreas, menos Administração.',
      'Área Técnica: a aba Notas ficou mais simples — só Ordem de Serviço e Notas, sempre públicas e já na disciplina do próprio usuário.',
      'Removida a aba OS de dentro de Planejamento; a Configuração do MS Project saiu de Administração e foi pra Planejamento.',
      'Notas > Ordem de Serviço ganhou um filtro por Contrato.',
      'O card da nota agora mostra o ícone da disciplina quando ela pertence a só uma.',
      'Curva S: removido aquele quadro de topo com título e botão de forçar atualização — ficou só o quadro de filtros e o gráfico.',
      'Cor da nota privada no Mapa Mental trocada pra azul, pra não confundir mais com a cor de pública.',
    ],
  },
];
