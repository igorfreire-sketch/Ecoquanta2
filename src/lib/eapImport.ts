// Importação semi-automática da EAP colada do MS Project / Excel.
// Funções puras, zero React. Ver ImportarEAP.tsx para a tela que usa isso.

import JSZip from 'jszip';

export const COLUNAS = [
  'Alerta', 'Status', '% Concluída', 'N° item', 'Nome da Tarefa', 'Duração',
  'Início do Plano Base', 'Conclusão do Plano Base', 'Predecessoras', '%ideal REPROG',
  'Nome do Recurso', 'Início Real', 'Conclusão Reprogramada', '%ideal Plano Base',
  'Área Técnica', 'Área Técnica (dup)', 'EDIFICAÇÃO', 'Prioridade', 'Respons. Subcontratado',
] as const;

export interface LinhaEAP {
  celulas: string[]; // 19 colunas, índice 0-based conforme COLUNAS
}

export type NivelDiagnostico = 'erro' | 'aviso';
export type CodigoDiagnostico =
  | 'I_J' | 'DATA_INVERTIDA' | 'CODIGO_DUPLICADO' | 'ORFAO' | 'OS_NIVEL_ERRADO' | 'LOD_ORFAO';

export interface Diagnostico {
  linha: number; // índice 0-based dentro de `linhas`
  codigo: CodigoDiagnostico;
  nivel: NivelDiagnostico;
  mensagem: string;
  corrigivel: boolean;
}

export interface ResumoValidacao {
  diagnosticos: Diagnostico[];
  totalLinhas: number;
  erros: number;
  avisos: number;
  osDetectadas: number;
}

// --- parsing -----------------------------------------------------------

/** Divide um bloco colado (TSV) em linhas de células, tratando aspas e \n internos ao estilo Excel. */
export function parseColado(texto: string): LinhaEAP[] {
  const linhas = parseTSV(texto.replace(/\r\n/g, '\n').replace(/\r/g, '\n'));
  const semVazias = linhas.filter((c) => c.some((v) => v.trim() !== ''));
  if (semVazias.length === 0) return [];
  const primeira = semVazias[0].join(' ');
  const temCabecalho = /N° item|Nome da Tarefa/i.test(primeira);
  const corpo = temCabecalho ? semVazias.slice(1) : semVazias;
  return corpo.map((celulas) => ({ celulas: normalizarLargura(celulas) }));
}

export async function parseXlsx(buffer: ArrayBuffer): Promise<LinhaEAP[]> {
  const zip = await JSZip.loadAsync(buffer);
  const shared = zip.file('xl/sharedStrings.xml');
  const sharedValues = shared ? Array.from((await shared.async('text')).matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g), (m) => decodeXml(m[1])) : [];
  const sheet = zip.file('xl/worksheets/sheet1.xml');
  if (!sheet) throw new Error('A planilha XLSX não possui a primeira aba esperada.');
  const xml = await sheet.async('text');
  const rows: string[] = [];
  for (const row of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const cells = new Array<string>(COLUNAS.length).fill('');
    for (const cell of row[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const ref = cell[1].match(/\br="([A-Z]+)\d+"/);
      if (!ref) continue;
      const col = ref[1].split('').reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;
      if (col < 0 || col >= cells.length) continue;
      const type = cell[1].match(/\bt="([^"]+)"/)?.[1];
      const body = cell[2] || '';
      const value = body.match(/<v[^>]*>([\s\S]*?)<\/v>/)?.[1] || body.match(/<t[^>]*>([\s\S]*?)<\/t>/)?.[1] || '';
      cells[col] = type === 's' ? (sharedValues[Number(value)] || '') : decodeXml(value);
    }
    rows.push(cells.map(escaparCelula).join('\t'));
  }
  return parseColado(rows.join('\n'));
}

function decodeXml(value: string): string {
  return value.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

function normalizarLargura(celulas: string[]): string[] {
  const out = celulas.slice(0, COLUNAS.length);
  while (out.length < COLUNAS.length) out.push('');
  return out;
}

// Parser TSV com suporte a células entre aspas contendo \t, \n ou aspas escapadas (""),
// igual ao que Excel produz ao colar um recorte com quebras de linha internas.
function parseTSV(texto: string): string[][] {
  const linhas: string[][] = [];
  let linha: string[] = [];
  let campo = '';
  let dentroAspas = false;
  for (let i = 0; i < texto.length; i++) {
    const ch = texto[i];
    if (dentroAspas) {
      if (ch === '"') {
        if (texto[i + 1] === '"') { campo += '"'; i++; }
        else dentroAspas = false;
      } else campo += ch;
      continue;
    }
    if (ch === '"' && campo === '') { dentroAspas = true; continue; }
    if (ch === '\t') { linha.push(campo); campo = ''; continue; }
    if (ch === '\n') { linha.push(campo); campo = ''; linhas.push(linha); linha = []; continue; }
    campo += ch;
  }
  linha.push(campo);
  linhas.push(linha);
  return linhas;
}

/** Serializa de volta para TSV, entre-aspando células que precisem (tab, quebra de linha, aspas). */
export function paraTSV(linhas: LinhaEAP[]): string {
  return linhas
    .map((l) => l.celulas.map(escaparCelula).join('\t'))
    .join('\r\n');
}

function escaparCelula(v: string): string {
  if (/[\t\n"]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

// --- datas ---------------------------------------------------------------

const EXCEL_EPOCH_MS = Date.UTC(1899, 11, 30); // dia 0 do serial do Excel

/** Aceita dd/mm/aaaa, aaaa-mm-dd e serial numérico do Excel. Retorna epoch ms UTC ou null se vazio/inválido. */
export function parseData(valor: string): number | null {
  const v = valor.trim();
  if (!v) return null;
  const br = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (br) {
    const [, d, m, a] = br;
    return Date.UTC(Number(a), Number(m) - 1, Number(d));
  }
  const iso = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) {
    const [, a, m, d] = iso;
    return Date.UTC(Number(a), Number(m) - 1, Number(d));
  }
  const serial = v.match(/^\d+(\.\d+)?$/);
  if (serial) {
    return EXCEL_EPOCH_MS + Number(v) * 86400000;
  }
  return null;
}

// --- helpers de linha ------------------------------------------------------

const RE_NUMERO_PURO = /^-?\d+([.,]\d+)?%?$/;

function codigo(l: LinhaEAP): string { return l.celulas[3].trim(); }
function nome(l: LinhaEAP): string { return l.celulas[4].trim(); }
function areaTecnica(l: LinhaEAP): string { return l.celulas[14].trim(); }

function inicioLinha(l: LinhaEAP): number | null {
  return parseData(l.celulas[11]) ?? parseData(l.celulas[6]);
}
function fimLinha(l: LinhaEAP): number | null {
  return parseData(l.celulas[12]) ?? parseData(l.celulas[7]);
}

const RE_OS_BRUTO = /(^|[^A-Za-z0-9À-ÿ])_?OS(?=[A-Za-z0-9À-ÿ_\-.\s]|$)/i;
const RE_OS_CONFIRMA = /\bOS[\s\-_.]?\d/i;

/** Detecta se o nome da tarefa indica uma OS, filtrando falsos positivos ("para os cargos", "com os equipamentos"). */
export function nomeIndicaOS(nomeTarefa: string): boolean {
  if (!RE_OS_BRUTO.test(nomeTarefa)) return false;
  return RE_OS_CONFIRMA.test(nomeTarefa);
}

const RE_LOD = /\bLOD\b[^0-9]*([0-9]{2,3})/i;
const LOD_VALIDOS = new Set([100, 200, 300, 350, 400]);

/** Prefixo de OS de um código de item: sobe até o nível 2 (ex.: "2.25.3.4" -> "2.25"). */
function prefixoOS(cod: string): string {
  const partes = cod.split('.');
  return partes.slice(0, 2).join('.');
}

// --- validação -------------------------------------------------------------

export function validar(linhas: LinhaEAP[]): ResumoValidacao {
  const diagnosticos: Diagnostico[] = [];
  const codigos = new Set(linhas.map(codigo).filter(Boolean));
  const vistos = new Map<string, number>();
  let osDetectadas = 0;

  linhas.forEach((l, i) => {
    const cod = codigo(l);
    const i_ = l.celulas[8];
    const j_ = l.celulas[9];

    // V1: deslize I/J
    if (RE_NUMERO_PURO.test(i_.trim()) && i_.trim() !== '') {
      if (j_.trim() === '') {
        diagnosticos.push({
          linha: i, codigo: 'I_J', nivel: 'erro',
          mensagem: 'Predecessoras (I) tem número puro e %ideal REPROG (J) está vazio: provável deslize de coluna do MS Project.',
          corrigivel: true,
        });
      } else {
        diagnosticos.push({
          linha: i, codigo: 'I_J', nivel: 'aviso',
          mensagem: 'Predecessoras (I) é numérico e J também está preenchido: ambíguo, confira manualmente.',
          corrigivel: false,
        });
      }
    }

    // V2: datas invertidas
    const ini = inicioLinha(l);
    const fim = fimLinha(l);
    if (ini !== null && fim !== null && ini > fim) {
      diagnosticos.push({
        linha: i, codigo: 'DATA_INVERTIDA', nivel: 'erro',
        mensagem: 'Data de início é depois da data de fim.',
        corrigivel: false,
      });
    }

    // V3: código duplicado
    if (cod) {
      const anterior = vistos.get(cod);
      if (anterior !== undefined) {
        diagnosticos.push({
          linha: i, codigo: 'CODIGO_DUPLICADO', nivel: 'erro',
          mensagem: `Código "${cod}" já apareceu na linha ${anterior + 1}.`,
          corrigivel: false,
        });
      } else {
        vistos.set(cod, i);
      }
    }

    // V4: órfão
    if (cod && cod.includes('.')) {
      const pai = cod.slice(0, cod.lastIndexOf('.'));
      if (!codigos.has(pai)) {
        diagnosticos.push({
          linha: i, codigo: 'ORFAO', nivel: 'aviso',
          mensagem: `Pai "${pai}" do código "${cod}" não está neste bloco (colagem parcial?).`,
          corrigivel: false,
        });
      }
    }

    // V5: classificação de OS pelo nome
    const nomeTarefa = nome(l);
    if (nomeIndicaOS(nomeTarefa)) {
      osDetectadas++;
      const nPontos = (cod.match(/\./g) || []).length;
      if (nPontos !== 1) {
        diagnosticos.push({
          linha: i, codigo: 'OS_NIVEL_ERRADO', nivel: 'aviso',
          mensagem: `"${nomeTarefa}" é uma OS mas o código "${cod}" não está no nível 1 (${nPontos} pontos): o site atual perde essa OS ao classificar só pela contagem de pontos.`,
          corrigivel: false,
        });
      }

      // V6: LOD órfão de disciplina
      const lod = nomeTarefa.match(RE_LOD);
      if (lod && LOD_VALIDOS.has(Number(lod[1])) && !/[A-Za-zÀ-ÿ]/.test(areaTecnica(l))) {
        diagnosticos.push({
          linha: i, codigo: 'LOD_ORFAO', nivel: 'aviso',
          mensagem: `"${nomeTarefa}" tem LOD ${lod[1]} mas a coluna Área Técnica está sem sigla: o site vai descartar esta linha e toda a subárvore dela.`,
          corrigivel: false,
        });
      }
    }
  });

  const erros = diagnosticos.filter((d) => d.nivel === 'erro').length;
  const avisos = diagnosticos.filter((d) => d.nivel === 'aviso').length;
  return { diagnosticos, totalLinhas: linhas.length, erros, avisos, osDetectadas };
}

// --- correção automática -----------------------------------------------------

/** Aplica só o determinístico: hoje, V1 (I->J quando J vazio e I numérico puro). */
export function corrigirAutomatico(linhas: LinhaEAP[]): { linhas: LinhaEAP[]; aplicadas: number } {
  let aplicadas = 0;
  const corrigidas = linhas.map((l) => {
    const i_ = l.celulas[8];
    const j_ = l.celulas[9];
    if (RE_NUMERO_PURO.test(i_.trim()) && i_.trim() !== '' && j_.trim() === '') {
      aplicadas++;
      const celulas = l.celulas.slice();
      celulas[9] = i_;
      celulas[8] = '';
      return { celulas };
    }
    return l;
  });
  return { linhas: corrigidas, aplicadas };
}

// --- agrupamento por OS -----------------------------------------------------

/** Agrupa linhas pelo prefixo de OS do código (2 primeiros níveis). Linhas sem código ficam em "". */
export function agruparPorOS(linhas: LinhaEAP[]): Map<string, LinhaEAP[]> {
  const grupos = new Map<string, LinhaEAP[]>();
  for (const l of linhas) {
    const cod = codigo(l);
    const chave = cod ? prefixoOS(cod) : '';
    const arr = grupos.get(chave);
    if (arr) arr.push(l);
    else grupos.set(chave, [l]);
  }
  return grupos;
}
