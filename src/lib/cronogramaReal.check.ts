import assert from 'node:assert/strict';
import {
  aplicarEdicoes,
  caminhoCronogramaEap,
  caminhoEdificioPorItem,
  compararCodigos,
  codigo,
  edificacaoEfetiva,
  lerCampo,
  escreverEm,
  linhasDaOs,
  novaLinha,
  proximoCodigoFilho,
  type CronogramaRealRow,
} from './cronogramaReal';

const rows: CronogramaRealRow[] = [
  { code: '2', name: 'Contrato' },
  { code: '2.4', name: 'OS Alfa' },
  { code: '2.4.1', name: 'Servico A', progress: 10 },
  { code: '2.4.2', name: 'Servico B', progress: 0 },
  { code: '2.4.10', name: 'Servico J' },
  { code: '2.5', name: 'OS Beta' },
  { code: '2.5.1', name: 'Outra OS', progress: 50 },
];

// Escopo por OS: so descendentes, nunca a linha da OS nem outra OS.
assert.deepEqual(linhasDaOs(rows, '2.4').map(codigo), ['2.4.1', '2.4.2', '2.4.10']);
assert.deepEqual(linhasDaOs(rows, ''), []);

// padrão.md: linha nova entra ACIMA do maior irmao; nunca renumera irmao existente.
assert.equal(proximoCodigoFilho(rows, '2.4'), '2.4.11');
assert.equal(proximoCodigoFilho(rows, '2.9'), '2.9.1');
const nova = novaLinha(rows, '2.4');
assert.equal(codigo(nova), '2.4.11');
assert.deepEqual(rows.map((r) => r.code), ['2', '2.4', '2.4.1', '2.4.2', '2.4.10', '2.5', '2.5.1']);

// Ordenacao numerica por segmento (2.4.10 depois de 2.4.2).
assert.ok(compararCodigos('2.4.2', '2.4.10') < 0);
assert.ok(compararCodigos('2.4', '2.4.1') < 0);

// Patch por code + linha nova: nenhuma linha some, nenhum code muda, outras OSs intactas.
const salvo = aplicarEdicoes(rows, {
  patches: { '2.4.1': { progress: 80, predecessor: '2.4.2' } },
  novas: [{ code: '2.4.11', name: 'Servico K', progress: 0 }],
  ordem: [],
});
assert.equal(salvo.length, rows.length + 1);
assert.equal(lerCampo(salvo.find((r) => codigo(r) === '2.4.1')!, 'progress'), 80);
assert.equal(lerCampo(salvo.find((r) => codigo(r) === '2.4.1')!, 'name'), 'Servico A');
assert.equal(lerCampo(salvo.find((r) => codigo(r) === '2.5.1')!, 'progress'), 50);
assert.equal(lerCampo(salvo.find((r) => codigo(r) === '2.4.11')!, 'name'), 'Servico K');

// Linha nova com code que ja existe nao duplica nem sobrescreve a antiga.
const semDuplicata = aplicarEdicoes(rows, { patches: {}, novas: [{ code: '2.4.1', name: 'Clone' }], ordem: [] });
assert.equal(semDuplicata.length, rows.length);
assert.equal(lerCampo(semDuplicata.find((r) => codigo(r) === '2.4.1')!, 'name'), 'Servico A');

// Arrastar reordena o ARRAY entre as posicoes dos codes movidos; os codes seguem os mesmos
// (renumerar quebraria predecessoras/edificioPorItem/planningTodos).
const reordenado = aplicarEdicoes(rows, { patches: {}, novas: [], ordem: ['2.4.10', '2.4.1', '2.4.2'] });
assert.deepEqual(reordenado.map(codigo), ['2', '2.4', '2.4.10', '2.4.1', '2.4.2', '2.5', '2.5.1']);
assert.equal(lerCampo(reordenado.find((r) => codigo(r) === '2.4.1')!, 'name'), 'Servico A');

// Linha publicada como ARRAY posicional: patch entra pelo indice certo, a forma nao muda e
// as colunas que a tela nao conhece (indices 3, 4, 10) continuam intactas.
const arrays: any[] = [
  ['2.4', 'OS Alfa', 0, 'x', 'y', 0, '', '', '', 0, 'meta', '', '', 0],
  ['2.4.1', 'Servico A', 10, 'x', 'y', 5, '2026-01-01', '2026-01-06', '', 0, 'meta', '', '', 0],
];
const arraysSalvos = aplicarEdicoes(arrays, {
  patches: { '2.4.1': { progress: 90, predecessor: '2.4.2' } },
  novas: [novaLinha(arrays, '2.4')],
  ordem: [],
});
assert.ok(Array.isArray(arraysSalvos[1]));
assert.equal((arraysSalvos[1] as any[])[2], 90);
assert.equal((arraysSalvos[1] as any[])[8], '2.4.2');
assert.equal((arraysSalvos[1] as any[])[3], 'x');
assert.equal((arraysSalvos[1] as any[])[10], 'meta');
assert.ok(Array.isArray(arraysSalvos[2]));
assert.equal((arraysSalvos[2] as any[])[0], '2.4.2');
assert.equal((arraysSalvos[2] as any[]).length, 14);

// Linha nova montada como OBJETO pela tela entra como ARRAY quando o documento e posicional.
const misturado = aplicarEdicoes(arrays, {
  patches: { '2.4.9': { name: 'Nova' } },
  novas: [{ code: '2.4.9', name: '', progress: 0 }],
  ordem: [],
});
assert.ok(Array.isArray(misturado[2]));
assert.equal((misturado[2] as any[])[0], '2.4.9');
assert.equal((misturado[2] as any[])[1], 'Nova');

// Precedencia do documento vivo: eap.cronograma > eap.data.cronograma > atual.
assert.deepEqual(caminhoCronogramaEap({ cronograma: [1], data: { cronograma: [2] } }), ['cronograma']);
assert.deepEqual(caminhoCronogramaEap({ cronograma: [], data: { cronograma: [2] } }), ['data', 'cronograma']);
assert.deepEqual(caminhoCronogramaEap({ data: { atual: [2] } }), ['data', 'atual']);
assert.equal(caminhoCronogramaEap({ cronograma: [] }), null);
assert.equal(caminhoCronogramaEap(null), null);

assert.deepEqual(caminhoEdificioPorItem({ edificioPorItem: {} }, ['data', 'cronograma']), ['edificioPorItem']);
assert.deepEqual(caminhoEdificioPorItem({ data: { edificioPorItem: {} } }, ['cronograma']), ['data', 'edificioPorItem']);
assert.deepEqual(caminhoEdificioPorItem({}, ['data', 'cronograma']), ['data', 'edificioPorItem']);

// escreverEm nao muta a raiz e preserva os campos irmaos do documento (13 mil linhas de EAP).
const eap = { cronograma: [{ code: '2.4.1' }], curvaS: { atual: [] }, edificioPorItem: { '2.4': 'Bloco A' } };
const eapNovo = escreverEm(eap, ['cronograma'], [{ code: '2.4.2' }]);
assert.deepEqual(eap.cronograma, [{ code: '2.4.1' }]);
assert.deepEqual(eapNovo.cronograma, [{ code: '2.4.2' }]);
assert.deepEqual(eapNovo.curvaS, eap.curvaS);
assert.deepEqual(eapNovo.edificioPorItem, eap.edificioPorItem);

// Edificacao herda do ancestral mais especifico (igual findLongestHierarchyMatch).
const edificios = { '2.4': 'Bloco A', '2.4.1': 'Bloco B' };
assert.equal(edificacaoEfetiva('2.4.1', edificios), 'Bloco B');
assert.equal(edificacaoEfetiva('2.4.2', edificios), 'Bloco A');
assert.equal(edificacaoEfetiva('2.5.1', edificios), '');

console.log('cronogramaReal: OK');
