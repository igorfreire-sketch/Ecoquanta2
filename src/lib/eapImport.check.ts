// Check da importação de EAP. Rodar: npx tsx src/lib/eapImport.check.ts
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import {
  agruparPorOS, corrigirAutomatico, nomeIndicaOS, parseColado, parseXlsx, paraTSV, validar,
  type LinhaEAP,
} from './eapImport';

function linha(over: Partial<Record<number, string>> = {}): LinhaEAP {
  const celulas = new Array(19).fill('');
  Object.entries(over).forEach(([k, v]) => { celulas[Number(k)] = v ?? ''; });
  return { celulas };
}

// --- V1: deslize I/J detectado e corrigido ---
{
  const linhas = [linha({ 3: '1.1', 4: 'Tarefa A', 8: '3' })]; // I numérico puro, J vazio
  const r = validar(linhas);
  assert.equal(r.erros, 1);
  const d = r.diagnosticos[0];
  assert.equal(d.codigo, 'I_J');
  assert.equal(d.nivel, 'erro');
  assert.equal(d.corrigivel, true);

  const { linhas: corrigidas, aplicadas } = corrigirAutomatico(linhas);
  assert.equal(aplicadas, 1);
  assert.equal(corrigidas[0].celulas[8], '', 'I deve esvaziar');
  assert.equal(corrigidas[0].celulas[9], '3', 'J recebe o valor antigo de I');
}

// --- V1: deslize ambíguo (I numérico E J preenchido) NÃO é corrigido ---
{
  const linhas = [linha({ 3: '1.2', 4: 'Tarefa B', 8: '5', 9: '0.4' })];
  const r = validar(linhas);
  assert.equal(r.diagnosticos[0].nivel, 'aviso');
  assert.equal(r.diagnosticos[0].corrigivel, false);
  const { linhas: corrigidas, aplicadas } = corrigirAutomatico(linhas);
  assert.equal(aplicadas, 0);
  assert.equal(corrigidas[0].celulas[8], '5', 'I não deve mudar quando ambíguo');
}

// --- V1: predecessora com texto real (não numérica) não dispara nada ---
{
  const linhas = [linha({ 3: '1.3', 4: 'Tarefa C', 8: '1323II+24 dias', 9: '0.5' })];
  const r = validar(linhas);
  assert.equal(r.diagnosticos.filter((d) => d.codigo === 'I_J').length, 0);
}

// --- V2: data invertida detectada ---
{
  const linhas = [linha({ 3: '1.4', 4: 'Tarefa D', 11: '10/05/2024', 12: '01/05/2024' })];
  const r = validar(linhas);
  assert.ok(r.diagnosticos.some((d) => d.codigo === 'DATA_INVERTIDA' && d.nivel === 'erro'));
}

// --- V3: código duplicado detectado ---
{
  const linhas = [
    linha({ 3: '1.5', 4: 'Tarefa E' }),
    linha({ 3: '1.5', 4: 'Tarefa E de novo' }),
  ];
  const r = validar(linhas);
  assert.ok(r.diagnosticos.some((d) => d.codigo === 'CODIGO_DUPLICADO'));
  assert.equal(r.erros >= 1, true);
}

// --- V4: órfão (pai ausente) ---
{
  const linhas = [linha({ 3: '1.3.1', 4: 'Item órfão' })];
  const r = validar(linhas);
  assert.ok(r.diagnosticos.some((d) => d.codigo === 'ORFAO' && d.nivel === 'aviso'));
}

// --- V5: falso positivo "para os cargos" NÃO vira OS ---
{
  assert.equal(nomeIndicaOS('Estudo para os cargos de Psicólogo'), false);
  assert.equal(nomeIndicaOS('calçadas com os respectivos equipamentos'), false);
}

// --- V5: OS real fora do nível 1 é detectada e marcada ---
{
  assert.equal(nomeIndicaOS('OS 046 - CEPT'), true);
  const linhas = [linha({ 3: '2.25.3.4.1.2.1.5', 4: 'OS 046 - CEPT' })];
  const r = validar(linhas);
  assert.equal(r.osDetectadas, 1);
  assert.ok(r.diagnosticos.some((d) => d.codigo === 'OS_NIVEL_ERRADO'), 'OS fora do nivel 1 precisa de aviso');
}

// --- V6: LOD órfão de disciplina ---
{
  const linhas = [linha({ 3: '1.6', 4: 'OS 061 - CEPT LOD 400', 14: '' })];
  const r = validar(linhas);
  assert.ok(r.diagnosticos.some((d) => d.codigo === 'LOD_ORFAO'));
}
{
  // com sigla preenchida na coluna O, não dispara
  const linhas = [linha({ 3: '1.7', 4: 'OS 046 - CEPT (LOD 200)', 14: 'HIDS' })];
  const r = validar(linhas);
  assert.ok(!r.diagnosticos.some((d) => d.codigo === 'LOD_ORFAO'));
}

// --- round-trip parseColado -> paraTSV preserva as células ---
{
  const bruto = 'N° item\tNome da Tarefa\n1\tTarefa "com aspas" e\tTAB\n1.1\t"linha\ncom quebra"\t';
  // monta um bloco com 19 colunas de verdade a partir de uma linha simples
  const cols = new Array(19).fill('x');
  cols[3] = '1'; cols[4] = 'Nome, com vírgula e "aspas"\ne quebra';
  const tsvEntrada = 'N° item\tNome da Tarefa\n' + cols.map((c) => (/[\t\n"]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join('\t');
  const linhas = parseColado(tsvEntrada);
  assert.equal(linhas.length, 1, 'cabecalho descartado');
  assert.equal(linhas[0].celulas[3], '1');
  assert.equal(linhas[0].celulas[4], 'Nome, com vírgula e "aspas"\ne quebra');

  const tsvSaida = paraTSV(linhas);
  const relidas = parseColado(tsvSaida);
  assert.deepEqual(relidas[0].celulas, linhas[0].celulas, 'round-trip deve preservar as celulas');
}

// --- agruparPorOS agrupa pelo prefixo de 2 niveis ---
{
  const linhas = [
    linha({ 3: '2.25', 4: 'OS 1' }),
    linha({ 3: '2.25.3', 4: 'item' }),
    linha({ 3: '2.25.3.4', 4: 'item filho' }),
    linha({ 3: '3.1', 4: 'outra OS' }),
  ];
  const grupos = agruparPorOS(linhas);
  assert.equal(grupos.get('2.25')?.length, 3);
  assert.equal(grupos.get('3.1')?.length, 1);
}

// --- regressao: cada diagnostico aponta pro indice de linha certo (bug de render no ImportarEAP) ---
{
  const linhas = [
    linha({ 3: '1.1', 4: 'OS001-Apoio a Gestão', 8: '100.0' }), // 0: I_J + orfao (pai "1")
    linha({ 3: '1.3.1', 4: 'IM01-OS034 CRECHE AEROPORTO', 8: '100.0' }), // 1: I_J + orfao + OS_NIVEL_ERRADO
    linha({ 3: '2.20', 4: 'OS 046 - CEPT (LOD 200)', 8: '100.0' }), // 2: I_J + orfao + LOD_ORFAO
    linha({ 3: '2.25.3.4.1.2.1.5', 8: '6958CI+2 dias', 9: '100.0', 11: '15/08/2026', 12: '10/07/2026' }), // 3: DATA_INVERTIDA + orfao, SEM I_J
    linha({ 3: '1.1.18.4', 4: 'Estudo para os cargos de Psicólogo', 8: '113CI', 9: '100.0' }), // 4: SEM I_J, SEM OS, so orfao
    linha({ 3: '1.3.1', 4: 'Linha duplicada por erro de colagem', 8: '100.0' }), // 5: CODIGO_DUPLICADO (+ I_J + orfao)
  ];
  const r = validar(linhas);
  const por = (n: number) => r.diagnosticos.filter((d) => d.linha === n);

  assert.ok(por(0).some((d) => d.codigo === 'I_J'), 'linha 0 precisa de I_J');
  assert.ok(por(1).some((d) => d.codigo === 'I_J'), 'linha 1 precisa de I_J');
  assert.ok(por(2).some((d) => d.codigo === 'I_J'), 'linha 2 precisa de I_J');
  assert.ok(!por(3).some((d) => d.codigo === 'I_J'), 'linha 3 nao pode ter I_J (predecessora nao numerica)');
  assert.ok(!por(4).some((d) => d.codigo === 'I_J'), 'linha 4 nao pode ter I_J (predecessora nao numerica)');

  assert.equal(r.diagnosticos.filter((d) => d.codigo === 'DATA_INVERTIDA').length, 1);
  assert.ok(por(3).some((d) => d.codigo === 'DATA_INVERTIDA'), 'DATA_INVERTIDA so na linha 3');

  assert.ok(por(5).some((d) => d.codigo === 'CODIGO_DUPLICADO'), 'linha 5 duplica o codigo 1.3.1 da linha 1');

  assert.equal(r.diagnosticos.filter((d) => d.codigo === 'OS_NIVEL_ERRADO').length, 1);
  assert.ok(por(1).some((d) => d.codigo === 'OS_NIVEL_ERRADO'), 'OS_NIVEL_ERRADO so na linha 1');

  assert.equal(r.diagnosticos.filter((d) => d.codigo === 'LOD_ORFAO').length, 1);
  assert.ok(por(2).some((d) => d.codigo === 'LOD_ORFAO'), 'LOD_ORFAO so na linha 2');
}

// --- header com "N° item" some, sem header nada eh descartado ---
{
  const semHeader = parseColado('1\tTarefa\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t');
  assert.equal(semHeader.length, 1);
}

{
  const zip = new JSZip();
  zip.file('xl/sharedStrings.xml', '<sst><si><t>1.1</t></si><si><t>Tarefa XLSX</t></si></sst>');
  zip.file('xl/worksheets/sheet1.xml', '<worksheet><sheetData><row r="1"><c r="A1"/><c r="D1" t="s"><v>0</v></c><c r="E1" t="s"><v>1</v></c></row></sheetData></worksheet>');
  const parsed = await parseXlsx(await zip.generateAsync({ type: 'arraybuffer' }));
  assert.equal(parsed[0].celulas[3], '1.1');
  assert.equal(parsed[0].celulas[4], 'Tarefa XLSX');
  assert.equal(parsed[0].celulas[0], '');
}

console.log('eapImport: OK');
