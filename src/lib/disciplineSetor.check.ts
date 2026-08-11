// Check do agrupamento por setor. Rodar: npx tsx src/lib/disciplineSetor.check.ts
import assert from 'node:assert/strict';
import {
  DEFAULT_DISCIPLINES, disciplineMatchesSector, getDisciplineSector,
  getSectorOptions, isDisciplineHidden,
} from './disciplineCatalog';

const todas = DEFAULT_DISCIPLINES.map((item) => item.label);

// --- Disciplinas agrupadas respondem pelo setor ---
assert.equal(getDisciplineSector('Urbanismo'), 'Arquitetura');
assert.equal(getDisciplineSector('Layout'), 'Arquitetura');
assert.equal(getDisciplineSector('Estrutura Metálica'), 'Estrutural');
assert.equal(getDisciplineSector('Impermeabilização'), 'Hidrossanitário', 'IMPE foi pra Hidrossanitário');
assert.equal(getDisciplineSector('Telecom'), 'Elétrico');
assert.equal(getDisciplineSector('Viário'), 'Terraplanagem/Pavimentação');

// --- Aceita codigo, nome e "COD - Nome" ---
assert.equal(getDisciplineSector('URB'), 'Arquitetura');
assert.equal(getDisciplineSector('ARQ - Arquitetura'), 'Arquitetura');

// --- Sem grupo definido, a disciplina e o proprio setor ---
assert.equal(getDisciplineSector('Compatibilização'), 'Compatibilização', 'avulsa usa nome limpo, sem o prefixo do codigo');
assert.equal(getDisciplineSector('Jurídico'), 'Jurídico');

// --- Marcadas como "Excluir" somem do filtro ---
['Econômico-Financeiro', 'Geofísica', 'Clash', 'Gerenciamento'].forEach((item) => {
  assert.equal(isDisciplineHidden(item), true, `${item} deveria estar oculta`);
});
assert.equal(isDisciplineHidden('Arquitetura'), false);

// --- Lista do filtro: sem duplicata, sem as ocultas ---
{
  const setores = getSectorOptions(todas);
  assert.equal(new Set(setores).size, setores.length, 'setor nao pode repetir na lista');
  assert.ok(setores.includes('Arquitetura'));
  assert.ok(!setores.includes('URB - Urbanismo'), 'disciplina agrupada nao aparece solta');
  assert.ok(!setores.some((item) => item.includes('Geofísica')), 'oculta nao entra na lista');
  assert.ok(!setores.some((item) => item.includes(' - ')), 'nenhuma opcao carrega o prefixo do codigo');
  assert.equal(setores.length, 19, 'lista oficial tem 19 setores');
  // Cadastro livre no admin nao pode virar opcao de filtro.
  assert.deepEqual(getSectorOptions(['Disciplina Inventada', 'Urbanismo']), ['Arquitetura']);
  // Os 6 de Arquitetura viram 1 entrada; a lista tem que ser bem menor que 56.
  assert.ok(setores.length < todas.length, 'agrupar precisa encurtar a lista');
}

// --- Casamento usado pelos filtros ---
assert.equal(disciplineMatchesSector('Paisagismo', 'Arquitetura'), true);
assert.equal(disciplineMatchesSector('Esgoto', 'Arquitetura'), false);
assert.equal(disciplineMatchesSector('Fundações', 'Estrutural'), true);
assert.equal(disciplineMatchesSector('qualquer coisa', ''), true, 'sem filtro, passa tudo');

console.log('disciplineSetor: OK');
