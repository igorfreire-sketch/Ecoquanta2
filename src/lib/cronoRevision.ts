/** Normalize legacy revisions at the comparison boundary, without changing stored documents. */
export function normalizeCronogramaRevision(value: unknown): string | undefined {
  if (value == null || value === '') return undefined;
  if (value instanceof Date) return normalizeCronogramaRevision(value.toISOString());
  if (typeof value === 'object') {
    const timestamp = value as { toDate?: () => Date; seconds?: number; nanoseconds?: number };
    if (typeof timestamp.seconds === 'number') {
      const seconds = new Date(timestamp.seconds * 1000).toISOString();
      return seconds.replace('.000Z', `.${String(timestamp.nanoseconds || 0).padStart(9, '0')}Z`);
    }
    if (typeof timestamp.toDate === 'function') return normalizeCronogramaRevision(timestamp.toDate());
  }
  if (typeof value === 'string' || typeof value === 'number') {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    const fraction = typeof value === 'string' ? /\.(\d{1,9})(?:Z|[+-]\d\d:\d\d)$/.exec(value)?.[1] : undefined;
    return date.toISOString().replace(/\.(\d{3})Z$/, (_, milliseconds) => `.${(fraction || milliseconds).padEnd(9, '0')}Z`);
  }
  // Unknown legacy values still compare by value instead of object identity.
  return JSON.stringify(value);
}

export function nextCronogramaTimestamp(expected: unknown, current: unknown, allowCreate = false, exists = true): string {
  const expectedRevision = normalizeCronogramaRevision(expected);
  const currentRevision = normalizeCronogramaRevision(current);
  if (allowCreate ? exists : !exists || currentRevision !== expectedRevision) {
    throw new Error('Este Project foi alterado ou excluído em outra tela. Seu rascunho foi preservado. Reabra o Project para carregar a versão atual antes de salvar.');
  }
  return new Date(Math.max(Date.now(), (Date.parse(expectedRevision || '') || 0) + 1)).toISOString();
}
