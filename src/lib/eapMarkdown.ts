import { parseColado, COLUNAS } from './eapImport';

function osNumber(value: string): number | null {
  const match = value.match(/\bOS\s*[-_.]?\s*0*(\d+)\b/i);
  return match ? Number(match[1]) : null;
}

/** Lê apenas o bloco TSV gerado pela macro local do MS Project. */
export function parseEapMarkdown(markdown: string): string[][] {
  const match = markdown.replace(/^\uFEFF/, '').match(/^# EAP Ecoquanta\s+~~~tsv\r?\n([\s\S]*?)\r?\n~~~\s*$/);
  if (!match) throw new Error('Arquivo .md fora do formato gerado pela macro Ecoquanta.');
  const parsed = parseColado(match[1]).map((line) => line.celulas);
  if (!parsed.length || parsed.some((row) => row.length !== COLUNAS.length)) {
    throw new Error('A EAP não contém as 19 colunas esperadas.');
  }
  return parsed;
}

export function readEapMarkdown(markdown: string, os: string, osName: string): string[][] {
  return scopeProjectRows(parseEapMarkdown(markdown), os, osName);
}

/** Associa os WBS locais do Project à OS escolhida antes da publicação. */
export function scopeProjectRows(parsed: string[][], os: string, osName: string, predecessorsAreWbs = false): string[][] {
  if (!/^\d+\.\d+$/.test(os)) throw new Error('Informe um código de OS no formato contrato.OS, por exemplo 2.25.');
  if (!parsed.length || parsed.some((row) => row.length !== COLUNAS.length)) throw new Error('A EAP não contém as 19 colunas esperadas.');
  const root = parsed.find((row) => row[3].trim() === '0');
  const rebase = Boolean(root && /^OS\b/i.test(root[4].trim()));
  if (rebase) {
    const projectNumber = osNumber(root![4]);
    const chosenNumber = osNumber(osName);
    if (projectNumber !== null && chosenNumber !== null && projectNumber !== chosenNumber) {
      throw new Error('O número da OS no Project não confere com a OS escolhida.');
    }
  }
  const rows = parsed.map((original) => {
    const row = original.slice();
    const source = row[3].trim();
    if (rebase) {
      row[3] = source === '0' ? os : `${os}.${source}`;
      if (predecessorsAreWbs) row[8] = row[8].split(',').map((value) => {
        const predecessor = value.trim();
        if (!/^\d+(?:\.\d+)*$/.test(predecessor)) return predecessor;
        return predecessor === '0' ? os : `${os}.${predecessor}`;
      }).filter(Boolean).join(',');
    }
    if (row[3] === os && osName.trim()) row[4] = osName.trim();
    return row;
  }).filter((row) => row[3] === os || row[3].startsWith(`${os}.`));
  if (!rows.some((row) => row[3] === os) || rows.length < 2) {
    throw new Error('O arquivo não contém a raiz e as tarefas da OS selecionada.');
  }
  return rows;
}
