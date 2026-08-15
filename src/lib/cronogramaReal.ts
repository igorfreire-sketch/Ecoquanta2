// Edicao do cronograma REAL do sistema (o array de linhas com `code` hierarquico que
// Cronograma.tsx/CurvaS/Atividades ja leem), nao do Project da colecao `cronogramas`.
//
// Duas coisas importantes que ditam tudo aqui:
//
// 1. A identidade da linha real E o `code` ("2.4.7"). Predecessoras, `eap.edificioPorItem`,
//    planningTodos e o casamento de atividades apontam pra ele. Por isso NADA aqui renumera
//    uma linha existente: linha nova sempre recebe um code acima do maior irmao ja existente
//    (mesma regra de `seq` do padrão.md, aplicada ao code).
// 2. O documento vivo e `appData/eap` quando ele traz o array (App.applyUnifiedEapData
//    sobrescreve `globalData.cronograma` com `eap.cronograma`); `appData/cronograma` so vale
//    quando a EAP nao tem o array. `caminhoCronograma` reproduz exatamente essa precedencia
//    pra gravacao cair no MESMO lugar de onde a tela leu.

export interface CronogramaRealRow {
  code?: string;
  name?: string;
  progress?: number;
  duration?: number;
  plannedStart?: string;
  plannedEnd?: string;
  predecessor?: string;
  idealProgress?: number;
  realStart?: string;
  realEnd?: string;
  baselineIdealProgress?: number;
  sourceLine?: number;
  // linhas vindas da planilha podem trazer campos que nenhuma tela conhece — preservar sempre
  [extra: string]: unknown;
}

// A planilha publica linha como OBJETO ou como ARRAY posicional — normalizeCronogramaRow
// (Cronograma.tsx) le as duas formas, entao a gravacao tem que respeitar as duas tambem:
// patch em linha array vira patch por indice, nunca troca a forma da linha.
export const INDICE_CAMPO_ARRAY: Record<string, number> = {
  code: 0,
  name: 1,
  progress: 2,
  duration: 5,
  plannedStart: 6,
  plannedEnd: 7,
  predecessor: 8,
  idealProgress: 9,
  realStart: 11,
  realEnd: 12,
  baselineIdealProgress: 13,
};

export type LinhaBruta = CronogramaRealRow | unknown[];

export function lerCampo(row: LinhaBruta, campo: string): unknown {
  if (Array.isArray(row)) {
    const indice = INDICE_CAMPO_ARRAY[campo];
    return indice === undefined ? undefined : row[indice];
  }
  return (row as CronogramaRealRow)?.[campo];
}

export function aplicarCampos(row: LinhaBruta, patch: Partial<CronogramaRealRow>): LinhaBruta {
  if (!Array.isArray(row)) return { ...(row as CronogramaRealRow), ...patch };
  const copia = [...row];
  Object.entries(patch).forEach(([campo, valor]) => {
    const indice = INDICE_CAMPO_ARRAY[campo];
    if (indice !== undefined) copia[indice] = valor;
  });
  return copia;
}

// Linha nova nasce na MESMA forma das linhas vizinhas (array posicional ou objeto).
export function criarLinha(modelo: LinhaBruta | undefined, valores: Partial<CronogramaRealRow>): LinhaBruta {
  if (Array.isArray(modelo)) return aplicarCampos(new Array(modelo.length).fill(''), valores);
  return { ...valores };
}

export function codigo(row: LinhaBruta): string {
  return String(lerCampo(row, 'code') ?? '').trim();
}

export function codigoPai(code: string): string {
  const partes = String(code || '').split('.');
  if (partes.length <= 1) return '';
  partes.pop();
  return partes.join('.');
}

export function ehDescendente(code: string, ancestral: string): boolean {
  if (!ancestral) return false;
  return code === ancestral || code.startsWith(`${ancestral}.`);
}

export function nivelDoCodigo(code: string): number {
  return (String(code || '').match(/\./g) || []).length;
}

// Ordem hierarquica estavel: compara segmento a segmento, numerico quando os dois lados sao
// numeros (senao "2.10" viria antes de "2.9").
export function compararCodigos(a: string, b: string): number {
  const pa = String(a || '').split('.');
  const pb = String(b || '').split('.');
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    const sa = pa[i];
    const sb = pb[i];
    if (sa === undefined) return -1;
    if (sb === undefined) return 1;
    const na = Number(sa);
    const nb = Number(sb);
    if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return na - nb;
    if (!Number.isFinite(na) || !Number.isFinite(nb)) {
      const diff = sa.localeCompare(sb, 'pt-BR', { numeric: true });
      if (diff !== 0) return diff;
    }
  }
  return 0;
}

export function linhasDaOs<T extends LinhaBruta>(rows: T[], osCode: string): T[] {
  if (!osCode) return [];
  return rows.filter((row) => {
    const code = codigo(row);
    return code !== osCode && ehDescendente(code, osCode);
  });
}

// Code da proxima linha filha de `parentCode`: maior ultimo segmento numerico ja usado + 1.
// Nunca reaproveita code de linha apagada e nunca mexe nos irmaos (padrão.md).
export function proximoCodigoFilho(rows: LinhaBruta[], parentCode: string): string {
  const maior = rows.reduce((max, row) => {
    const code = codigo(row);
    if (!code || codigoPai(code) !== parentCode) return max;
    const ultimo = Number(code.split('.').pop());
    return Number.isFinite(ultimo) ? Math.max(max, ultimo) : max;
  }, 0);
  return `${parentCode}.${maior + 1}`;
}

export function novaLinha(rows: LinhaBruta[], parentCode: string): LinhaBruta {
  const irma = rows.find((row) => codigoPai(codigo(row)) === parentCode) || rows[0];
  return criarLinha(irma, {
    code: proximoCodigoFilho(rows, parentCode),
    name: '',
    progress: 0,
    duration: 0,
    plannedStart: '',
    plannedEnd: '',
    predecessor: '',
  });
}

export interface EdicoesCronograma {
  // patches por code de linha ja existente (ou recem-criada nesta sessao)
  patches: Record<string, Partial<CronogramaRealRow>>;
  // linhas criadas manualmente nesta sessao (ainda nao gravadas)
  novas: LinhaBruta[];
  // nova ordem (lista de codes) das linhas arrastadas — reordena o ARRAY, nunca os codes
  ordem: string[];
}

export function edicoesVazias(): EdicoesCronograma {
  return { patches: {}, novas: [], ordem: [] };
}

export function temEdicoes(edicoes: EdicoesCronograma): boolean {
  return Object.keys(edicoes.patches).length > 0 || edicoes.novas.length > 0 || edicoes.ordem.length > 0;
}

// Aplica as edicoes sobre o array RECEM-LIDO do Firebase (nao sobre o snapshot da tela): duas
// pessoas editando OSs diferentes nao se sobrescrevem, porque so os codes tocados mudam.
export function aplicarEdicoes(atuais: LinhaBruta[], edicoes: EdicoesCronograma): LinhaBruta[] {
  const existentes = new Set(atuais.map((row) => codigo(row)));
  const resultado: LinhaBruta[] = atuais.map((row) => {
    const patch = edicoes.patches[codigo(row)];
    return patch ? aplicarCampos(row, patch) : row;
  });

  edicoes.novas.forEach((nova) => {
    const code = codigo(nova);
    if (!code || existentes.has(code)) return;
    existentes.add(code);
    // A tela monta a linha nova a partir das linhas ja normalizadas (objeto); se o documento
    // real guarda linha como array posicional, a nova entra na mesma forma das vizinhas.
    const conformada = Array.isArray(atuais[0]) && !Array.isArray(nova)
      ? criarLinha(atuais[0], nova as CronogramaRealRow)
      : nova;
    resultado.push(aplicarCampos(conformada, edicoes.patches[code] || {}));
  });

  if (edicoes.ordem.length > 1) {
    // Reordena so as posicoes ocupadas pelos codes arrastados; todo o resto do array
    // (as outras OSs, milhares de linhas) fica exatamente onde estava.
    const alvo = new Set(edicoes.ordem);
    const porCodigo = new Map(resultado.map((row) => [codigo(row), row]));
    const sequencia = edicoes.ordem.map((code) => porCodigo.get(code)).filter(Boolean) as LinhaBruta[];
    let cursor = 0;
    return resultado.map((row) => (alvo.has(codigo(row)) && sequencia[cursor] ? sequencia[cursor++] : row));
  }

  return resultado;
}

// ---- onde mora o cronograma vivo -------------------------------------------------

function arrayEm(raiz: any, caminho: string[]): unknown {
  return caminho.reduce((atual, chave) => (atual && typeof atual === 'object' ? atual[chave] : undefined), raiz);
}

// Mesma precedencia de App.applyUnifiedEapData/pickFirstNonEmptyArray.
const CAMINHOS_EAP: string[][] = [['cronograma'], ['data', 'cronograma'], ['atual'], ['data', 'atual']];

export function caminhoCronogramaEap(eap: any): string[] | null {
  if (!eap || typeof eap !== 'object') return null;
  return CAMINHOS_EAP.find((caminho) => {
    const valor = arrayEm(eap, caminho);
    return Array.isArray(valor) && valor.length > 0;
  }) || null;
}

// Onde gravar `edificioPorItem`: no nivel onde ele ja existe (Atividades le eap.edificioPorItem
// antes de eap.data.edificioPorItem); sem nenhum, ao lado do array de cronograma.
export function caminhoEdificioPorItem(eap: any, caminhoCrono: string[]): string[] {
  if (eap && typeof eap === 'object') {
    if (eap.edificioPorItem && typeof eap.edificioPorItem === 'object') return ['edificioPorItem'];
    if (eap.data?.edificioPorItem && typeof eap.data.edificioPorItem === 'object') return ['data', 'edificioPorItem'];
  }
  return [...caminhoCrono.slice(0, -1), 'edificioPorItem'];
}

// Copia rasa ao longo do caminho (nao muta o objeto recebido).
export function escreverEm<T>(raiz: T, caminho: string[], valor: unknown): T {
  if (caminho.length === 0) return valor as T;
  const [chave, ...resto] = caminho;
  const base: any = raiz && typeof raiz === 'object' ? raiz : {};
  return { ...base, [chave]: escreverEm(base[chave], resto, valor) } as T;
}

export function lerEm<T = unknown>(raiz: any, caminho: string[]): T | undefined {
  return arrayEm(raiz, caminho) as T | undefined;
}

// Edificacao efetiva de um code: valor proprio ou herdado do ancestral mais especifico
// (mesma regra de findLongestHierarchyMatch em Atividades.tsx).
export function edificacaoEfetiva(code: string, edificioPorItem: Record<string, string>): string {
  let melhorCodigo = '';
  let melhorNome = '';
  Object.entries(edificioPorItem || {}).forEach(([codigoItem, nome]) => {
    const alvo = String(codigoItem || '').trim();
    const valor = String(nome ?? '').trim();
    if (!alvo || !valor || !ehDescendente(code, alvo)) return;
    if (alvo.length > melhorCodigo.length) {
      melhorCodigo = alvo;
      melhorNome = valor;
    }
  });
  return melhorNome;
}
