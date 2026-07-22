// Geometria da tabela do banco de notas: estilos por celula, mesclagem e dimensoes.
// Fica separado do componente porque e a parte que erra em silencio - um off-by-one aqui
// gruda a formatacao na celula errada depois de inserir uma linha. Ver bancoGrid.check.ts.

// Formatacao de uma celula inteira (nao por caractere).
export interface CellStyle {
  bold?: boolean;
  italic?: boolean;
  strike?: boolean;
  bg?: string;
  color?: string;
  fontFamily?: string;
  fontSize?: number;
}

// Celula mesclada: a ancora (r,c) ocupa rowSpan x colSpan; as cobertas nao sao renderizadas.
export interface BancoMerge {
  r: number;
  c: number;
  rowSpan: number;
  colSpan: number;
}

export const BANCO_COL_WIDTH = 140;
export const BANCO_ROW_HEIGHT = 36;
// ~3 cm a 96 dpi (1 pol = 2,54 cm = 96 px). Largura maxima do "Dim" antes de quebrar a linha.
export const LARGURA_QUEBRA_PX = 113;
// Espaco horizontal do px-2 da celula (8px de cada lado) e a folga vertical do texto.
export const PADDING_CELULA_X = 16;
export const PADDING_CELULA_Y = 12;

// Quebra o texto em linhas que caibam em larguraMax, por palavra. Recebe a funcao de medir
// de fora (canvas no navegador) pra continuar puro e testavel.
export function quebrarTexto(texto: string, larguraMax: number, medir: (t: string) => number): string[] {
  // Palavra unica maior que a largura: quebra por caractere, como o textarea faz.
  const quebrarPalavraLonga = (palavra: string) => {
    if (medir(palavra) <= larguraMax) return [palavra];
    const partes: string[] = [];
    let atual = '';
    for (const ch of palavra) {
      if (atual && medir(atual + ch) > larguraMax) { partes.push(atual); atual = ch; } else atual += ch;
    }
    if (atual) partes.push(atual);
    return partes;
  };

  const linhas: string[] = [];
  // Quebra que a pessoa digitou (Enter) e respeitada.
  String(texto ?? '').split('\n').forEach((paragrafo) => {
    const palavras = paragrafo.split(/\s+/).filter(Boolean).flatMap(quebrarPalavraLonga);
    if (palavras.length === 0) { linhas.push(''); return; }
    let atual = '';
    palavras.forEach((palavra) => {
      const tentativa = atual ? `${atual} ${palavra}` : palavra;
      if (atual && medir(tentativa) > larguraMax) { linhas.push(atual); atual = palavra; } else atual = tentativa;
    });
    if (atual) linhas.push(atual);
  });
  return linhas.length > 0 ? linhas : [''];
}

export function alturaParaLinhas(linhas: number, fontSize: number) {
  return Math.max(BANCO_ROW_HEIGHT, Math.ceil(linhas * fontSize * 1.4) + PADDING_CELULA_Y);
}

// Fonte no formato do canvas/CSS, respeitando a formatacao da celula.
export function fonteCss(style?: CellStyle) {
  const tamanho = style?.fontSize ?? 13;
  const familia = style?.fontFamily || 'Montserrat, sans-serif';
  return `${style?.italic ? 'italic ' : ''}${style?.bold ? '700 ' : ''}${tamanho}px ${familia}`;
}

export const cellKey = (r: number, c: number) => `${r}:${c}`;

export function mergeAt(merges: BancoMerge[] | undefined, r: number, c: number) {
  return (merges || []).find((item) => item.r === r && item.c === c);
}

// Celula engolida pela mesclagem de outra: nao deve ser renderizada.
export function isCovered(merges: BancoMerge[] | undefined, r: number, c: number) {
  return (merges || []).some((item) => (
    !(item.r === r && item.c === c)
    && r >= item.r && r < item.r + item.rowSpan
    && c >= item.c && c < item.c + item.colSpan
  ));
}

// Uma mesclagem cruza o retangulo dado?
export function mergeIntersects(item: BancoMerge, rMin: number, rMax: number, cMin: number, cMax: number) {
  return !(
    item.r + item.rowSpan <= rMin
    || item.r > rMax
    || item.c + item.colSpan <= cMin
    || item.c > cMax
  );
}

// Inserir/remover linha ou coluna move as celulas de lugar: sem remapear, a formatacao
// ficaria colada no indice antigo e apareceria na celula errada.
export function remapStyles(
  styles: Record<string, CellStyle> | undefined,
  move: (r: number, c: number) => { r: number; c: number } | null,
) {
  if (!styles) return undefined;
  const next: Record<string, CellStyle> = {};
  Object.entries(styles).forEach(([key, value]) => {
    const [r, c] = key.split(':').map(Number);
    const pos = move(r, c);
    if (pos) next[cellKey(pos.r, pos.c)] = value;
  });
  return next;
}

// ponytail: mesclagem atingida pela insercao/remocao e descartada em vez de redimensionada.
// Redimensionar exigiria decidir o que fazer com o conteudo das celulas engolidas.
export function remapMerges(
  merges: BancoMerge[] | undefined,
  eixo: 'row' | 'col',
  at: number,
  delta: 1 | -1,
) {
  if (!merges) return undefined;
  return merges.reduce<BancoMerge[]>((acc, item) => {
    const inicio = eixo === 'row' ? item.r : item.c;
    const span = eixo === 'row' ? item.rowSpan : item.colSpan;
    if (at >= inicio && at < inicio + span) return acc;
    if (inicio < at) { acc.push(item); return acc; }
    acc.push(eixo === 'row' ? { ...item, r: item.r + delta } : { ...item, c: item.c + delta });
    return acc;
  }, []);
}

export function spliceSizes(sizes: number[] | undefined, at: number, delta: 1 | -1, padrao: number, total: number) {
  const base = Array.from({ length: total }, (_, i) => sizes?.[i] ?? padrao);
  if (delta === 1) base.splice(at, 0, padrao);
  else base.splice(at, 1);
  return base;
}

export function cellCss(style?: CellStyle) {
  if (!style) return {};
  return {
    fontWeight: style.bold ? 700 : undefined,
    fontStyle: style.italic ? 'italic' : undefined,
    textDecoration: style.strike ? 'line-through' : undefined,
    color: style.color || undefined,
    fontFamily: style.fontFamily || undefined,
    fontSize: style.fontSize ? `${style.fontSize}px` : undefined,
  };
}
