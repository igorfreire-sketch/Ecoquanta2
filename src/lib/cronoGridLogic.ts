import type { CronoRow } from './cronoRow';
import type { CronogramaDoc, ColunaCustom } from '../components/CronogramaGrid';
import { COLUNAS_FIXAS } from './cronoColumns';
export function ordemColunasCronograma(doc: CronogramaDoc): string[] {
  const todas = [...COLUNAS_FIXAS.map((col) => col.key), ...doc.colunasCustom.map((col) => col.id)];
  const restantes = new Set(todas);
  return [...(doc.colOrder || []).filter((key) => restantes.delete(key)), ...todas.filter((key) => restantes.has(key))];
}

// Ordem em arvore: agrupa por parentId preservando a ordem de insercao dentro de cada pai.
// ignorarColapso=true devolve a arvore inteira (usado p/ achar "linha anterior" na indentacao).
export function ordemArvore(rows: CronoRow[], ignorarColapso = false): CronoRow[] {
  const porPai = new Map<string, CronoRow[]>();
  rows.forEach((r) => {
    const chave = r.parentId || '';
    if (!porPai.has(chave)) porPai.set(chave, []);
    porPai.get(chave)!.push(r);
  });
  const resultado: CronoRow[] = [];
  function visitar(paiId: string) {
    for (const r of porPai.get(paiId) || []) {
      resultado.push(r);
      if (ignorarColapso || !r.colapsada) visitar(r.id);
    }
  }
  visitar('');
  return resultado;
}

// Irmao imediatamente anterior a `row` no MESMO nivel/pai atual (nao o irmao anterior mais fundo
// da arvore inteira) — e quem vira o novo pai ao indentar, pra 1.1/1.2/1.3 ficarem irmaos em vez
// de aninhar cada indentacao um nivel mais fundo que a anterior. Sem limite de profundidade: so ha
// um guard anti-ciclo de 30 saltos (nivelDe/subtreeUltimoId), nao um teto de niveis.
export function irmaoAnterior(rows: CronoRow[], row: CronoRow): CronoRow | null {
  const irmaos = ordemArvore(rows, true).filter((r) => (r.parentId || '') === (row.parentId || ''));
  const idx = irmaos.findIndex((r) => r.id === row.id);
  return idx > 0 ? irmaos[idx - 1] : null;
}

// Ultimo id (em ordem de arvore) dentro da subarvore cuja raiz e raizId — usado pra saber onde
// reinserir uma linha no array apos reparenta-la, sem ela "sumir" longe da posicao esperada.
export function subtreeUltimoId(flat: CronoRow[], raizId: string): string {
  const idx = flat.findIndex((r) => r.id === raizId);
  if (idx === -1) return raizId;
  const mapa = new Map(flat.map((r) => [r.id, r]));
  function eDescendente(r: CronoRow): boolean {
    let atual: CronoRow | undefined = r;
    let guard = 0;
    while (atual?.parentId && guard++ < 30) {
      if (atual.parentId === raizId) return true;
      atual = mapa.get(atual.parentId);
    }
    return false;
  }
  let fim = idx;
  for (let i = idx + 1; i < flat.length; i++) {
    if (eDescendente(flat[i])) fim = i; else break;
  }
  return flat[fim].id;
}

export function reposicionarApos(rowsArr: CronoRow[], id: string, ancoraId: string): CronoRow[] {
  const item = rowsArr.find((r) => r.id === id);
  if (!item) return rowsArr;
  const semItem = rowsArr.filter((r) => r.id !== id);
  const idxAncora = semItem.findIndex((r) => r.id === ancoraId);
  const pos = idxAncora === -1 ? semItem.length : idxAncora + 1;
  return [...semItem.slice(0, pos), item, ...semItem.slice(pos)];
}

export function nivelDe(row: CronoRow, mapa: Map<string, CronoRow>): number {
  let nivel = 0;
  let atual = row;
  let guard = 0;
  while (atual.parentId && guard++ < 30) {
    const pai = mapa.get(atual.parentId);
    if (!pai) break;
    nivel += 1;
    atual = pai;
  }
  return nivel;
}

// Codigo hierarquico estavel: cada segmento usa seq, que nunca muda ao inserir/reordenar irmaos.
// Reparentear pode mudar o prefixo porque a linha passa a pertencer a outra hierarquia.
export function calcularCodigos(rows: CronoRow[]): Map<string, string> {
  const porPai = new Map<string, CronoRow[]>();
  rows.forEach((r) => {
    const chave = r.parentId || '';
    if (!porPai.has(chave)) porPai.set(chave, []);
    porPai.get(chave)!.push(r);
  });
  const codigos = new Map<string, string>();
  function visitar(paiId: string, prefixo: string) {
    (porPai.get(paiId) || []).forEach((r) => {
      const segmento = String(r.seq);
      const codigo = prefixo ? `${prefixo}.${segmento}` : segmento;
      codigos.set(r.id, codigo);
      visitar(r.id, codigo);
    });
  }
  visitar('', '');
  return codigos;
}


  export function moverDireita(rows: CronoRow[], id: string): CronoRow[] {
    const row = rows.find((r) => r.id === id);
    if (!row) return rows;
    const anterior = irmaoAnterior(rows, row);
    if (!anterior) return rows; // primeiro do seu nivel, nao ha quem virar pai
    const ancoraId = subtreeUltimoId(ordemArvore(rows, true), anterior.id);
    const patched = rows.map((r) => (r.id === id ? { ...r, parentId: anterior.id } : r));
    return ancoraId === id ? patched : reposicionarApos(patched, id, ancoraId);
  }

  export function moverEsquerda(rows: CronoRow[], id: string): CronoRow[] {
    const row = rows.find((r) => r.id === id);
    if (!row || !row.parentId) return rows;
    const pai = rows.find((r) => r.id === row.parentId);
    const ancoraId = subtreeUltimoId(ordemArvore(rows, true), row.parentId);
    const patched = rows.map((r) => (r.id === id ? { ...r, parentId: pai?.parentId || '' } : r));
    return ancoraId === id ? patched : reposicionarApos(patched, id, ancoraId);
  }

export function editarPredecessora(rows: CronoRow[], id: string, predecessoraId: string): CronoRow[] {
    const row = rows.find((r) => r.id === id);
    if (!row) return rows;
    // ponytail: validacao de ciclo de 1 nivel apenas (A->B e B->A); ciclos maiores nao sao detectados
    if (predecessoraId) {
      const predecessora = rows.find((r) => r.id === predecessoraId);
      if (predecessoraId === id) return rows;
      if (predecessora && predecessora.predecessoraId === id) return rows;
    }
    const predecessora = rows.find((r) => r.id === predecessoraId);
    const sugerirInicio = predecessora?.dataFim && !row.dataInicio ? predecessora.dataFim : row.dataInicio;
    return rows.map((r) => r.id === id ? { ...r, predecessoraId, dataInicio: sugerirInicio } : r);
  }


export function salvarColuna(doc: CronogramaDoc, coluna: ColunaCustom): CronogramaDoc {
  return { ...doc, colunasCustom: doc.colunasCustom.some((c) => c.id === coluna.id)
    ? doc.colunasCustom.map((c) => c.id === coluna.id ? coluna : c) : [...doc.colunasCustom, coluna] };
}
export function excluirColuna(doc: CronogramaDoc, id: string): CronogramaDoc {
  return { ...doc, colunasCustom: doc.colunasCustom.filter((c) => c.id !== id),
    ...(doc.colOrder ? { colOrder: doc.colOrder.filter((key) => key !== id) } : {}),
    rows: doc.rows.map((r) => { const custom = { ...r.custom }; delete custom[id]; return { ...r, custom }; }) };
}
