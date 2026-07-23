// Data da última EAP publicada, formatada pt-BR. Compartilhado entre o breadcrumb (App) e a
// Coordenação de Engenharia — sem duplicar a lógica e sem forçar o carregamento do componente lazy.

export function formatLatestEapDate(value?: string) {
  const raw = String(value || '').trim();
  if (!raw) return 'Nao publicada';

  const parsedDate = new Date(raw);
  if (raw.includes('T') && !Number.isNaN(parsedDate.getTime())) {
    return parsedDate.toLocaleDateString('pt-BR');
  }

  const br = raw.match(/^(\d{2})[\/\-.](\d{2})[\/\-.](\d{4})$/);
  if (br) return `${br[1]}/${br[2]}/${br[3]}`;

  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;

  return raw;
}

export function extractResolvedEapData(eap?: any) {
  if (!eap || typeof eap !== 'object') return null;
  if (eap.data && typeof eap.data === 'object') return eap.data;
  return eap;
}

export function getLatestEapDisplayDate(eap?: any) {
  const resolvedEap = extractResolvedEapData(eap);
  const lastSnapshotSheet = Array.isArray(resolvedEap?.dates) && resolvedEap.dates.length > 0
    ? resolvedEap.dates[resolvedEap.dates.length - 1]
    : '';
  const candidates = [
    resolvedEap?.latestEapDate,
    resolvedEap?.latestEapSheet,
    lastSnapshotSheet,
    resolvedEap?.latestEapPublishedAt,
    resolvedEap?.publishedAt,
    eap?.latestEapDate,
    eap?.latestEapSheet,
    eap?.latestEapPublishedAt,
    eap?.publishedAt,
  ];

  for (const candidate of candidates) {
    const formatted = formatLatestEapDate(candidate);
    if (formatted !== 'Nao publicada') return formatted;
  }

  return 'Nao publicada';
}
