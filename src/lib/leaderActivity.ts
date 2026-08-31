export type LeaderActivityEvent = {
  itemCodigo: string;
  autorEmail: string;
  criadoEm: string;
  executadoPor: string[] | string;
  status: string;
  dificuldade: string;
  percentual: number | null;
  observacao: string;
  productionStatus?: string;
  motivoBloqueio?: string;
  observacoesHistorico?: ActivityMessage[];
};

export type ActivityMessage = { autor: string; mensagem: string; dataHora: string };

export type ActivityIssueDocument = {
  itemCodigo: string;
  mensagens: ActivityMessage[];
  resolvido: boolean;
  resolvidoPor?: string;
  resolvidoEm?: string;
};

export const hasOpenActivityIssue = (issue?: ActivityIssueDocument | null) => Boolean(issue && !issue.resolvido && issue.mensagens.length > 0);

export const normalizeLeaderDifficulty = (value: unknown) => value === 'Regular' ? 'Normal' : String(value || '');
export const normalizeExecutors = (value: unknown) => Array.isArray(value) ? value.map(String) : value ? [String(value)] : [];

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
      executadoPor: normalizeExecutors(event.executadoPor),
      statusDaAtividade: event.status || '',
      dificuldadeAtividade: normalizeLeaderDifficulty(event.dificuldade),
      porcentagemAtividade: typeof event.percentual === 'number' ? event.percentual : null,
      observacaoLider: String(event.observacao || ''),
      ...(event.productionStatus ? { status: event.productionStatus } : {}),
      motivoBloqueio: String(event.motivoBloqueio || ''),
      observacoesHistorico: Array.isArray(event.observacoesHistorico) ? event.observacoesHistorico : [],
      leaderEdited: true,
    } as T;
  });
}
