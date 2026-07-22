// Check da geometria do banco. Rodar: npx tsx src/lib/bancoGrid.check.ts
import assert from 'node:assert/strict';
import {
  alturaParaLinhas, BANCO_ROW_HEIGHT, cellKey, isCovered, mergeAt, mergeIntersects,
  quebrarTexto, remapMerges, remapStyles, spliceSizes,
  type BancoMerge, type CellStyle,
} from './bancoGrid';

const negrito: CellStyle = { bold: true };
const azul: CellStyle = { bg: '#DBEAFE' };

// --- remapStyles: inserir linha empurra pra baixo tudo a partir do indice ---
{
  const styles = { [cellKey(0, 0)]: negrito, [cellKey(2, 1)]: azul };
  const depois = remapStyles(styles, (r, c) => ({ r: r >= 2 ? r + 1 : r, c }));
  assert.deepEqual(depois, { '0:0': negrito, '3:1': azul }, 'inserir linha em 2 deve mover 2:1 -> 3:1');
}

// --- remapStyles: remover linha apaga a dela e puxa as de baixo ---
{
  const styles = { [cellKey(0, 0)]: negrito, [cellKey(1, 0)]: azul, [cellKey(2, 0)]: negrito };
  const depois = remapStyles(styles, (r, c) => (r === 1 ? null : { r: r > 1 ? r - 1 : r, c }));
  assert.deepEqual(depois, { '0:0': negrito, '1:0': negrito }, 'remover linha 1 apaga o estilo dela e sobe 2:0 -> 1:0');
}

// --- remapStyles: colunas seguem a mesma regra ---
{
  const styles = { [cellKey(0, 3)]: azul };
  assert.deepEqual(remapStyles(styles, (r, c) => ({ r, c: c >= 1 ? c + 1 : c })), { '0:4': azul });
  assert.deepEqual(remapStyles(styles, (r, c) => (c === 3 ? null : { r, c: c > 3 ? c - 1 : c })), {});
}

// --- remapMerges: mesclagem atingida some, a de baixo desloca, a de cima fica ---
{
  const merges: BancoMerge[] = [
    { r: 0, c: 0, rowSpan: 1, colSpan: 2 }, // antes do corte: intacta
    { r: 2, c: 0, rowSpan: 2, colSpan: 1 }, // linha 3 cai dentro dela: descartada
    { r: 5, c: 0, rowSpan: 1, colSpan: 2 }, // depois: desloca
  ];
  const depois = remapMerges(merges, 'row', 3, 1);
  assert.deepEqual(depois, [
    { r: 0, c: 0, rowSpan: 1, colSpan: 2 },
    { r: 6, c: 0, rowSpan: 1, colSpan: 2 },
  ], 'insercao dentro de uma mesclagem descarta so ela');
}

// --- isCovered / mergeAt ---
{
  const merges: BancoMerge[] = [{ r: 1, c: 1, rowSpan: 2, colSpan: 2 }];
  assert.equal(isCovered(merges, 1, 1), false, 'a ancora renderiza');
  assert.equal(isCovered(merges, 1, 2), true, 'vizinha na horizontal e engolida');
  assert.equal(isCovered(merges, 2, 2), true, 'canto oposto e engolido');
  assert.equal(isCovered(merges, 3, 1), false, 'fora do span nao e engolida');
  assert.equal(isCovered(merges, 0, 0), false);
  assert.ok(mergeAt(merges, 1, 1));
  assert.equal(mergeAt(merges, 1, 2), undefined, 'so a ancora responde por mergeAt');
}

// --- mergeIntersects: borda encostada nao conta como cruzamento ---
{
  const item: BancoMerge = { r: 1, c: 1, rowSpan: 2, colSpan: 2 };
  assert.equal(mergeIntersects(item, 0, 0, 0, 0), false, 'acima e a esquerda nao cruza');
  assert.equal(mergeIntersects(item, 3, 4, 1, 1), false, 'logo abaixo do span nao cruza');
  assert.equal(mergeIntersects(item, 2, 2, 2, 2), true, 'dentro cruza');
  assert.equal(mergeIntersects(item, 0, 5, 0, 5), true, 'envolvendo cruza');
}

// --- spliceSizes: preenche o default antes de mexer, mantendo o tamanho certo ---
{
  assert.deepEqual(spliceSizes(undefined, 1, 1, 10, 3), [10, 10, 10, 10], 'insercao cresce em 1');
  assert.deepEqual(spliceSizes([5, 6, 7], 0, -1, 10, 3), [6, 7], 'remocao encolhe em 1');
  assert.deepEqual(spliceSizes([5], 1, 1, 10, 3), [5, 10, 10, 10], 'faltando no array vira default');
}

// --- quebrarTexto: medidor falso de 10px por caractere, entao a conta e visivel ---
{
  const medir = (t: string) => t.length * 10;

  assert.deepEqual(quebrarTexto('abc', 100, medir), ['abc'], 'cabe numa linha');
  assert.deepEqual(
    quebrarTexto('aaa bbb ccc', 70, medir),
    ['aaa bbb', 'ccc'],
    'quebra por palavra quando a proxima nao cabe',
  );
  assert.deepEqual(
    quebrarTexto('linha1\nlinha2', 1000, medir),
    ['linha1', 'linha2'],
    'Enter digitado vira quebra mesmo sobrando largura',
  );
  assert.deepEqual(
    quebrarTexto('aaaaaaaa', 30, medir),
    ['aaa', 'aaa', 'aa'],
    'palavra unica maior que a celula quebra por caractere',
  );
  assert.deepEqual(quebrarTexto('', 100, medir), [''], 'texto vazio ainda ocupa uma linha');
  assert.equal(quebrarTexto('a b c d e', 30, medir).length, 3, 'conta de linhas alimenta a altura');
}

// --- alturaParaLinhas: nunca menor que a altura padrao da linha ---
{
  assert.equal(alturaParaLinhas(1, 13), BANCO_ROW_HEIGHT, 'uma linha pequena mantem a altura padrao');
  assert.ok(alturaParaLinhas(4, 13) > BANCO_ROW_HEIGHT, 'varias linhas crescem');
  assert.ok(alturaParaLinhas(3, 24) > alturaParaLinhas(3, 13), 'fonte maior pede mais altura');
}

console.log('bancoGrid: OK');
