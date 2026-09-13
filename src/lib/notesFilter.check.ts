// Checks das funcoes puras de notesFilter.ts. Sem framework, mesmo padrao do repo.
// Rodar: npx tsx src/lib/notesFilter.check.ts

import assert from 'node:assert/strict';
import {
  FILTRO_NOTAS_VAZIO,
  aplicarCascata,
  limparFiltroNotas,
  temFiltroAtivo,
  type NotesFilterState,
} from './notesFilter';

// ---- temFiltroAtivo: so recorte conta, modo de exibicao nao ----
assert.equal(temFiltroAtivo(FILTRO_NOTAS_VAZIO), false);
assert.equal(temFiltroAtivo({ ...FILTRO_NOTAS_VAZIO, os: '068' }), true);
assert.equal(temFiltroAtivo({ ...FILTRO_NOTAS_VAZIO, vinculo: 'vinculado' }), true);
assert.equal(temFiltroAtivo({ ...FILTRO_NOTAS_VAZIO, texto: 'laje' }), true);
// ordenacao e "buscar dentro" NAO acendem o "Limpar filtros": nao recortam nada.
assert.equal(temFiltroAtivo({ ...FILTRO_NOTAS_VAZIO, ordenacao: 'alfabetica' }), false);
assert.equal(temFiltroAtivo({ ...FILTRO_NOTAS_VAZIO, buscarConteudo: true }), false);

// ---- cascata: contrato limpa OS *e* edificacao ----
{
  const cheio: NotesFilterState = {
    ...FILTRO_NOTAS_VAZIO, contrato: '2', os: '068', edificacao: 'Ed 01', disciplina: 'ARQ',
  };
  const trocouContrato = aplicarCascata(cheio, 'contrato', '3');
  assert.equal(trocouContrato.os, '', 'trocar contrato tem que limpar a OS');
  assert.equal(
    trocouContrato.edificacao, '',
    'trocar contrato tem que limpar a edificacao: senao sobra um valor de OUTRO contrato filtrando tudo pra fora',
  );
  assert.equal(trocouContrato.disciplina, 'ARQ', 'disciplina nao depende de contrato, deve sobreviver');
}

// ---- cascata: OS limpa edificacao, mas nao mexe em contrato ----
{
  const base: NotesFilterState = { ...FILTRO_NOTAS_VAZIO, contrato: '2', os: '068', edificacao: 'Ed 01' };
  const trocouOs = aplicarCascata(base, 'os', '071');
  assert.equal(trocouOs.edificacao, '');
  assert.equal(trocouOs.contrato, '2');
  assert.equal(trocouOs.os, '071');
}

// ---- cascata: campo sem dependente nao derruba nada ----
{
  const base: NotesFilterState = { ...FILTRO_NOTAS_VAZIO, contrato: '2', os: '068', edificacao: 'Ed 01' };
  const trocouTexto = aplicarCascata(base, 'texto', 'viga');
  assert.equal(trocouTexto.os, '068');
  assert.equal(trocouTexto.edificacao, 'Ed 01');
  assert.equal(trocouTexto.texto, 'viga');
}

// ---- cascata aceita booleano (o toggle "Buscar dentro da nota") ----
assert.equal(aplicarCascata(FILTRO_NOTAS_VAZIO, 'buscarConteudo', true).buscarConteudo, true);

// ---- limpar: zera o recorte e PRESERVA como o usuario escolheu ver ----
{
  const usado: NotesFilterState = {
    ...FILTRO_NOTAS_VAZIO,
    autor: 'a@b.c', contrato: '2', os: '068', edificacao: 'Ed 01',
    disciplina: 'ARQ', vinculo: 'vinculado', texto: 'laje',
    buscarConteudo: true, ordenacao: 'alfabetica',
  };
  const limpo = limparFiltroNotas(usado);
  assert.equal(temFiltroAtivo(limpo), false, 'nada de recorte deve sobrar');
  assert.equal(limpo.ordenacao, 'alfabetica', 'a ordem escolhida nao pode sumir ao limpar filtro');
  assert.equal(limpo.buscarConteudo, true, 'o modo de busca tambem e preferencia, nao recorte');
}

// ---- o padrao historico da lista continua sendo data-asc ----
assert.equal(FILTRO_NOTAS_VAZIO.ordenacao, 'data-asc');

console.log('notesFilter: OK (temFiltroAtivo, cascata contrato/OS, limpar preserva exibicao)');
