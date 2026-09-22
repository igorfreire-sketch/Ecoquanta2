import assert from 'node:assert/strict';
import { DEMANDA_STATUS_COR, demandaCols, mapNotesToDemandas } from './DemandasDigitais';

// Banco comum (sem tipo 'demanda') nunca vira card, mesmo com linhas preenchidas.
const notaComBancoComum = { id: 'n1', titulo: 'Nota comum', bancos: [
  { id: 'b1', colCount: 3, rows: [['A', 'B', 'C'], ['x', 'y', 'z']] },
] };
assert.deepEqual(mapNotesToDemandas([notaComBancoComum]), []);

// Linha vazia (sem titulo E sem descricao) e pulada; header (r=0) nunca vira card.
const notaDemanda = { id: 'n2', titulo: 'Nota com demandas', bancos: [
  {
    id: 'b2', colCount: 3, tipo: 'demanda' as const,
    rows: [
      ['Título', 'Descrição', 'Status'],
      ['Corrigir login', 'Botão não responde', 'Em andamento'],
      ['', '', 'Recebidos'], // vazia: sem titulo nem descricao -> pulada
      ['Sem status', 'grava mesmo assim', ''], // status vazio/desconhecido -> cai pra Recebidos
    ],
  },
] };
const cards = mapNotesToDemandas([notaDemanda]);
assert.equal(cards.length, 2);
assert.deepEqual(cards[0], { id: 'n2:b2:1', titulo: 'Corrigir login', descricao: 'Botão não responde', status: 'Em andamento', noteId: 'n2', noteTitulo: 'Nota com demandas' });
assert.equal(cards[1].status, 'Recebidos'); // fallback do status desconhecido/vazio

// status -> cor: mapa exportado batendo 1:1 com as opcoes usadas acima.
assert.equal(DEMANDA_STATUS_COR['Em andamento'], '#DBEAFE');
assert.equal(DEMANDA_STATUS_COR['Recebidos'], '#F3F4F6');

// Coluna Status arrastada de indice 2 pra 0 (o que moveCol produz: mesma permutacao no header E em
// toda linha de dado) - o card ainda le o status certo, nao o que hoje esta na posicao 2.
const notaStatusMovida = { id: 'n3', titulo: 'Nota com coluna movida', bancos: [
  {
    id: 'b3', colCount: 3, tipo: 'demanda' as const,
    rows: [
      ['Status', 'Título', 'Descrição'],
      ['Concluídos', 'Corrigir login', 'Botão não responde'],
    ],
  },
] };
const cardsMovidos = mapNotesToDemandas([notaStatusMovida]);
assert.equal(cardsMovidos.length, 1);
assert.deepEqual(cardsMovidos[0], { id: 'n3:b3:1', titulo: 'Corrigir login', descricao: 'Botão não responde', status: 'Concluídos', noteId: 'n3', noteTitulo: 'Nota com coluna movida' });

// Título e Descrição trocados de lugar - campos ainda corretos.
const notaTituloDescricaoTrocados = { id: 'n4', titulo: 'Nota trocada', bancos: [
  {
    id: 'b4', colCount: 3, tipo: 'demanda' as const,
    rows: [
      ['Descrição', 'Título', 'Status'],
      ['Botão não responde', 'Corrigir login', 'Em análise'],
    ],
  },
] };
const cardsTrocados = mapNotesToDemandas([notaTituloDescricaoTrocados]);
assert.deepEqual(cardsTrocados[0], { id: 'n4:b4:1', titulo: 'Corrigir login', descricao: 'Botão não responde', status: 'Em análise', noteId: 'n4', noteTitulo: 'Nota trocada' });

// Coluna extra inserida pelo usuario ANTES da coluna de status - status ainda correto.
const notaColunaExtra = { id: 'n5', titulo: 'Nota com coluna extra', bancos: [
  {
    id: 'b5', colCount: 4, tipo: 'demanda' as const,
    rows: [
      ['Título', 'Descrição', 'Prioridade', 'Status'],
      ['Corrigir login', 'Botão não responde', 'Alta', 'Em andamento'],
    ],
  },
] };
const cardsColunaExtra = mapNotesToDemandas([notaColunaExtra]);
assert.equal(cardsColunaExtra[0].status, 'Em andamento');
assert.equal(cardsColunaExtra[0].titulo, 'Corrigir login');

// Headers com case/acento diferente ainda casam (normalizacao NFD + lowercase).
assert.deepEqual(demandaCols([['TÍTULO', 'descricao', 'STATUS']]), { titulo: 0, descricao: 1, status: 2 });

// Header sem nenhum desses nomes: cai pra posicao padrao (0/1/2) sem travar.
assert.deepEqual(demandaCols([['A', 'B', 'C']]), { titulo: 0, descricao: 1, status: 2 });
const notaHeaderDesconhecido = { id: 'n6', titulo: 'Nota com header desconhecido', bancos: [
  { id: 'b6', colCount: 3, tipo: 'demanda' as const, rows: [['A', 'B', 'C'], ['t', 'd', 'Recebidos']] },
] };
assert.equal(mapNotesToDemandas([notaHeaderDesconhecido])[0].status, 'Recebidos');

// Banco mais estreito que a posicao padrao: falta a coluna -> -1, sem crash, campo vazio.
assert.deepEqual(demandaCols([['A']]), { titulo: 0, descricao: -1, status: -1 });

console.log('DemandasDigitais mapNotesToDemandas: OK');
