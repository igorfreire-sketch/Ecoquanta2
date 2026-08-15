export type LeaderActivityEvent = {
  itemCodigo: string;
  autorEmail: string;
  criadoEm: string;
  executadoPor: string[];
  status: string;
  dificuldade: string;
  percentual: number | null;
  observacao: string;
};

type LeaderActivitySource = {
  id: string;
  itemCodigo?: string;
  origemItem?: string;
  [key: string]: unknown;
};

const itemCode = (activity: LeaderActivitySource) => String(activity.itemCodigo || activity.origemItem || activity.id || '').trim();

export function applyLeaderEventsToActivities<T extends LeaderActivitySource>(source: T[], events: LeaderActivityEvent[]): T[] {
  const latest = new Map<string, LeaderActivityEvent>();
  [...events]
    .sort((a, b) => String(a.criadoEm || '').localeCompare(String(b.criadoEm || '')))
    .forEach((event) => latest.set(String(event.itemCodigo || '').trim(), event));

  return source.map((activity) => {
    const event = latest.get(itemCode(activity));
    if (!event) return activity;
    return {
      ...activity,
      executadoPor: Array.isArray(event.executadoPor) ? event.executadoPor : [],
      statusDaAtividade: event.status || '',
      dificuldadeAtividade: event.dificuldade || '',
      porcentagemAtividade: typeof event.percentual === 'number' ? event.percentual : null,
      observacaoLider: String(event.observacao || ''),
      leaderEdited: true,
    } as T;
  });
}
