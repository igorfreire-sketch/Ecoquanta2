// Validacao de celula (digitar e colar passam pelo mesmo caminho). Puro, sem React.
// Retorno: { value } aceito ou { error } com o motivo literal mostrado na celula.
import { parseDateInfo, type CeptStatus } from '../../../lib/cept/rules';

export type Parsed<T> = { value: T; error?: undefined } | { error: string; value?: undefined };

const norm = (t: string) => t.trim().toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const TRUE_WORDS = ['TRUE', 'VERDADEIRO', 'SIM', 'V', '1', 'X'];
const FALSE_WORDS = ['', 'FALSE', 'FALSO', 'NAO', 'F', '0'];

export function parseStatus(text: string): Parsed<CeptStatus> {
  const t = norm(text);
  if (['-', 'N/A', 'NA', '—'].includes(t)) return { value: 'na' };
  if (TRUE_WORDS.includes(t)) return { value: 'delivered' };
  if (FALSE_WORDS.includes(t)) return { value: 'pending' };
  return { error: 'Use marcado (TRUE/x), desmarcado (FALSE/vazio) ou - para N/A' };
}

export function parseBool(text: string): Parsed<boolean> {
  const t = norm(text);
  if (TRUE_WORDS.includes(t)) return { value: true };
  if (FALSE_WORDS.includes(t)) return { value: false };
  return { error: 'Use marcado (TRUE/x) ou desmarcado (FALSE/vazio)' };
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Grava como a planilha exibe: dd/mm/aaaa, ou dd/mm sem ano (aceito, nao gera ISO -> nao alerta). */
export function parseDate(text: string): Parsed<string> {
  let t = text.trim();
  if (!t) return { value: '' };
  if (/^\d{5}$/.test(t) && Number(t) > 20000) { // data serial do Excel
    const d = new Date(Date.UTC(1899, 11, 30) + Number(t) * 86400000);
    t = `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
  } else if (/^\d{6}$|^\d{8}$/.test(t)) t = `${t.slice(0, 2)}/${t.slice(2, 4)}/${t.slice(4)}`;
  const m = t.match(/^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2}|\d{4}))?$/);
  if (!m) return { error: 'Data inválida. Use dd/mm/aaaa' };
  const [, d, mo, y] = m;
  if (!y) {
    const probe = parseDateInfo(`${d}/${mo}/2000`); // 2000 e bissexto: 29/02 passa
    return probe.iso ? { value: `${pad(+d)}/${pad(+mo)}` } : { error: 'Data inválida. Use dd/mm/aaaa' };
  }
  const info = parseDateInfo(`${d}/${mo}/${y}`);
  return info.iso ? { value: info.full } : { error: 'Data inválida. Use dd/mm/aaaa' };
}

/** LOD = numero de dias (inteiro), vazio permitido. */
export function parseDays(text: string): Parsed<number | null> {
  const t = text.trim();
  if (!t) return { value: null };
  if (!/^\d+$/.test(t) || Number(t) > 1000) return { error: 'Use um número inteiro de dias (0 a 1000) ou vazio' };
  return { value: Number(t) };
}

/** Coluna O: inteiro entra na soma; texto ("TALVEZ TODOS ANTES?") fica como nota, fora da soma. */
export function parseFinal(text: string): Parsed<{ final: number | null; finalNota: string }> {
  const t = text.trim();
  if (/^\d+$/.test(t)) return Number(t) > 1000 ? { error: 'Use até 1000 dias' } : { value: { final: Number(t), finalNota: '' } };
  if (t.length > 300) return { error: 'Texto longo demais (máx. 300)' };
  return { value: { final: null, finalNota: t } };
}

export function parseNota(text: string): Parsed<number | null> {
  const t = text.trim();
  if (!t || t === '—') return { value: null };
  return /^[1-6]$/.test(t) ? { value: Number(t) } : { error: 'Nota deve ser de 1 a 6 ou vazia' };
}

export const MODOS = ['Quanta', 'Terceirizado', 'Indefinido'] as const;
export function parseModo(text: string): Parsed<string | null> {
  const t = norm(text);
  if (!t || t === '—') return { value: null };
  const hit = MODOS.find((m) => norm(m).startsWith(t));
  return hit ? { value: hit } : { error: 'Use Quanta, Terceirizado, Indefinido ou vazio' };
}

export function parseText(text: string, max: number): Parsed<string> {
  return text.length > max ? { error: `Texto longo demais (máx. ${max})` } : { value: text.trim() };
}

/** TSV do Excel/Sheets -> matriz. ponytail: sem aspas multilinha; celula com quebra de linha chega partida. */
export function parseTsv(text: string): string[][] {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop();
  return lines.map((l) => l.split('\t'));
}
