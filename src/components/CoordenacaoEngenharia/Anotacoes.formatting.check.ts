import assert from 'node:assert/strict';
import { joinSerializedCellParts } from '../../lib/noteCellDom';

assert.equal(
  joinSerializedCellParts([
    { text: 'Linha um com ', block: false },
    { text: '**ação**', block: false },
    { text: '**Linha dois com coração**', block: true },
    { text: '**Linha três com informação**', block: true },
  ]),
  'Linha um com **ação**\n**Linha dois com coração**\n**Linha três com informação**',
);
assert.equal(
  joinSerializedCellParts([{ text: 'Linha única', block: true }]),
  'Linha única',
);

console.log('Anotacoes formatting check: OK');