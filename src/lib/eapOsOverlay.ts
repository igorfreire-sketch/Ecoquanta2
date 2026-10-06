export interface EapOsDocument {
  os: string;
  rowsJson: string;
  version: number;
  updatedAt?: unknown;
}

function rowCode(row: any): string {
  return String(Array.isArray(row) ? row[0] : row?.code || row?.codigo || '').trim();
}

function timestampIso(value: any): string {
  const date = typeof value?.toDate === 'function' ? value.toDate() : new Date(value || '');
  return date instanceof Date && !Number.isNaN(date.getTime()) ? date.toISOString() : '';
}

function firstRows(...sources: unknown[]): unknown[] {
  return sources.find((source) => Array.isArray(source) && source.length > 0) as unknown[] || [];
}

export function mergeEapOs(eap: any, documents: EapOsDocument[]): any {
  if (!documents.length) return eap;
  const replacements = new Map<string, any[]>();
  for (const document of documents) {
    if (!/^\d+\.\d+$/.test(document.os)) continue;
    let rows: unknown;
    try { rows = JSON.parse(document.rowsJson); } catch { continue; }
    if (!Array.isArray(rows) || !rows.length) continue;
    const normalized = rows.map((cells: unknown) => {
      if (!Array.isArray(cells) || cells.length !== 19 || cells.some((cell) => typeof cell !== 'string')) return null;
      const code = String(cells[3]).trim();
      if (code !== document.os && !code.startsWith(`${document.os}.`)) return null;
      return {
        alert: cells[0], status: cells[1], code, name: cells[4], progress: cells[2], duration: cells[5],
        plannedStart: cells[6], plannedEnd: cells[7], predecessor: cells[8],
        idealProgress: cells[9], resourceNames: cells[10], realStart: cells[11], realEnd: cells[12],
        baselineIdealProgress: cells[13], disciplina: cells[14],
        areaTecnica: cells[14], edificacao: cells[16], prioridade: cells[17],
        responsavelSubcontratado: cells[18], osCode: document.os,
        contractCode: document.os.split('.')[0],
        eapUpdatedAt: code === document.os ? timestampIso(document.updatedAt) : '',
        eapVersion: code === document.os ? document.version : undefined,
      };
    });
    if (normalized.some((row) => !row) || !normalized.some((row) => row?.code === document.os)) continue;
    replacements.set(document.os, normalized);
  }
  if (!replacements.size) return eap;
  const mergeRows = (source: unknown) => {
    const rows = Array.isArray(source) ? source : [];
    const kept = rows.filter((row) => {
      const code = rowCode(row);
      return !Array.from(replacements.keys()).some((os) => code === os || code.startsWith(`${os}.`));
    });
    return [...kept, ...Array.from(replacements.values()).flat()].sort((a, b) =>
      rowCode(a).localeCompare(rowCode(b), 'pt-BR', { numeric: true }));
  };
  const base = eap || {};
  return { ...base,
    cronograma: mergeRows(firstRows(base.cronograma, base.data?.cronograma, base.atual, base.data?.atual)),
    atual: mergeRows(firstRows(base.atual, base.data?.atual, base.cronograma, base.data?.cronograma)),
    eapOsUpdates: Array.from(replacements.entries()).map(([os, rows]) => ({ os, rows })) };
}
