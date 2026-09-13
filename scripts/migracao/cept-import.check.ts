import assert from 'node:assert/strict';
import { buildComponentsFromSource, buildResponsaveis, runImport, parseCsv } from './cept-import';
// recordKey e definido no modulo puro e reusado pelo import -- checar a fonte unica.
import { buildRecordKey, sanitizeKeySegment } from '../../src/lib/ceptModel';

// ---- discipline-code carry-forward + ELE -> ELET alias ----
{
  const csv = [
    'Disciplina,Rotulo,Tipo,001 - Implantação,DATA ENTREGA',
    'ELE,Prancha ELE-01,RVT,TRUE,01/03/2026',
    ',Prancha ELE-02,PDF (PDF),FALSE,',
  ].join('\n');
  const { componentes, warnings } = buildComponentsFromSource(csv);
  assert.equal(componentes.length, 2);
  assert.equal(componentes[0].disciplineCode, 'ELET', 'ELE deveria virar ELET');
  assert.equal(componentes[1].disciplineCode, 'ELET', 'linha sem col A herda a disciplina anterior');
  assert.equal(componentes[0].status, 'delivered');
  assert.equal(componentes[0].dateIso, '2026-03-01');
  assert.equal(componentes[1].status, 'pending');
  assert.equal(warnings.length, 0);
}

// ---- TOPO/TSD dropped outside project 001 ----
{
  const csv = [
    'Disciplina,Rotulo,Tipo,001 - Implantação,DATA ENTREGA,002 - Expressões,DATA ENTREGA',
    'TOPO,Levantamento,MC (PDF),TRUE,01/01/2026,TRUE,01/01/2026',
  ].join('\n');
  const { componentes, warnings } = buildComponentsFromSource(csv);
  assert.equal(componentes.length, 1, 'so o projeto 001 deveria sobreviver pra TOPO');
  assert.equal(componentes[0].projectCode, '001');
  assert.ok(warnings.some((w) => w.includes('restrita')), 'deveria avisar sobre a restricao TOPO/TSD');
}

// ---- duplicate recordKey produces a warning ----
{
  const csv = [
    'Disciplina,Rotulo,Tipo,001 - Implantação,DATA ENTREGA',
    'ARQ,Prancha A,RVT,TRUE,01/01/2026',
    ',Prancha A,RVT,FALSE,',
  ].join('\n');
  const { componentes, warnings } = buildComponentsFromSource(csv);
  assert.equal(componentes.length, 2);
  assert.equal(componentes[0].recordKey, componentes[1].recordKey);
  assert.ok(warnings.some((w) => w.includes('recordKey duplicado')), 'deveria avisar duplicata');
}

// ---- classify: RVT / PDF+PRANCHA / IFC / MC / MD / ET-RT / MA / fallback ----
{
  const csv = [
    'Disciplina,Rotulo,Tipo,001 - Implantação,DATA ENTREGA',
    'ARQ,Prancha X,RVT,TRUE,',
    'ARQ,Prancha Y,PDF,TRUE,',
    'ARQ,Modelo,IFC,TRUE,',
    'ARQ,Memorial,MC (PDF),TRUE,',
    'ARQ,Memorial,MD (DOCX),TRUE,',
    'ARQ,Relatorio,ET / RT (PDF),TRUE,',
    'ARQ,Anexo,MA (XLSX),TRUE,',
    'ARQ,Outro,CUSTOM (DWG),TRUE,',
  ].join('\n');
  const { componentes } = buildComponentsFromSource(csv);
  assert.equal(componentes[0].family, 'RVT');
  assert.equal(componentes[0].editable, true);
  assert.equal(componentes[1].family, 'PDF');
  assert.equal(componentes[1].editable, false);
  assert.equal(componentes[2].family, 'IFC');
  assert.equal(componentes[2].editable, false);
  assert.equal(componentes[3].family, 'MC');
  assert.equal(componentes[4].family, 'MD');
  assert.equal(componentes[5].family, 'ET/RT');
  assert.equal(componentes[6].family, 'MA');
  assert.equal(componentes[7].family, 'CUSTOM');
  assert.equal(componentes[7].format, 'DWG');
  assert.equal(componentes[7].editable, true);
}

// ---- responsibility: fuzzy match + coringa TODAS + DREN/ESG inherit HIDA (002-009, 001 exempt) ----
{
  const respCsv = [
    'Projeto,,Disciplina,,Modo,,Terceiro',
    '001,,Hidrossanitária,,QUANTA,,',
    '002,,Hidrossanitária,,TERCEIRIZADO,,Acme Engenharia',
    '002,,TODAS,,QUANTA,,',
  ].join('\n');
  const knownPairs = [
    { projectCode: '001', disciplineCode: 'HIDA' },
    { projectCode: '001', disciplineCode: 'ESG' },
    { projectCode: '001', disciplineCode: 'DREN' }, // 001 exempt: should NOT inherit
    { projectCode: '002', disciplineCode: 'HIDA' },
    { projectCode: '002', disciplineCode: 'ESG' },
    { projectCode: '002', disciplineCode: 'DREN' }, // no direct row: should inherit HIDA
    { projectCode: '002', disciplineCode: 'ARQ' }, // no direct/coringa match other than TODAS
  ];
  const { responsaveis, warnings } = buildResponsaveis(respCsv, knownPairs);

  assert.equal(responsaveis['001|HIDA'].responsavel, 'QUANTA');
  assert.equal(responsaveis['001|HIDA'].origem, 'linha_direta');
  assert.equal(responsaveis['001|ESG'].origem, 'linha_direta', 'HIDROSSANIT deveria resolver HIDA e ESG juntos');
  assert.equal(responsaveis['001|DREN'], undefined, 'projeto 001 e isento da heranca DREN/ESG<-HIDA');

  assert.equal(responsaveis['002|HIDA'].responsavel, 'Acme Engenharia');
  assert.equal(responsaveis['002|HIDA'].tipo, 'external');
  assert.equal(responsaveis['002|ESG'].origem, 'linha_direta');
  assert.equal(responsaveis['002|DREN'].origem, 'herdado_hida');
  assert.equal(responsaveis['002|DREN'].responsavel, 'Acme Engenharia');
  assert.equal(responsaveis['002|ARQ'].origem, 'coringa_todas');

  // 001|DREN legitimately stays unresolved: 001 is exempt from HIDA inheritance and has no
  // TODAS coringa row — the warning is the correct, loud signal, not a bug.
  assert.equal(warnings.length, 1);
  assert.ok(warnings[0].includes('001|DREN'));
}

// ---- unmatched discipline name + unresolved pair produce warnings, don't throw ----
{
  const respCsv = [
    'Projeto,,Disciplina,,Modo,,Terceiro',
    '003,,Disciplina Inexistente XYZ,,QUANTA,,',
  ].join('\n');
  const { responsaveis, warnings } = buildResponsaveis(respCsv, [{ projectCode: '003', disciplineCode: 'ARQ' }]);
  assert.equal(Object.keys(responsaveis).length, 0);
  assert.ok(warnings.some((w) => w.includes('não casou')));
  assert.ok(warnings.some((w) => w.includes('não resolvido')));
}

// ---- unparseable date logs a warning and continues, doesn't throw ----
{
  const csv = [
    'Disciplina,Rotulo,Tipo,001 - Implantação,DATA ENTREGA',
    'ARQ,Prancha Z,RVT,TRUE,32/13/2026',
  ].join('\n');
  const { componentes, warnings } = buildComponentsFromSource(csv);
  assert.equal(componentes[0].dateIso, '');
  assert.ok(warnings.some((w) => w.includes('ilegível')));
}

// ---- quoted CSV field with embedded comma ----
{
  const rows = parseCsv('a,"b, com virgula",c\n1,2,3');
  assert.deepEqual(rows[0], ['a', 'b, com virgula', 'c']);
}

// ---- end-to-end orchestration ----
{
  const sourceCsv = [
    'Disciplina,Rotulo,Tipo,001 - Implantação,DATA ENTREGA',
    'ARQ,Prancha A,RVT,TRUE,01/01/2026',
  ].join('\n');
  const respCsv = [
    'Projeto,,Disciplina,,Modo,,Terceiro',
    '001,,Arquitetura,,QUANTA,,',
  ].join('\n');
  const result = runImport(sourceCsv, respCsv);
  assert.equal(result.componentes.length, 1);
  assert.equal(result.responsaveis['001|ARQ'].responsavel, 'QUANTA');
  assert.equal(result.warnings.length, 0);
}

// ---- recordKey seguro como ID do Firestore ----
{
  // '/' e proibido em ID de documento: family canonica 'ET/RT' e sourceType cru da planilha
  // trazem barra, e sem sanear a carga inteira falha (bug pego por cept-load.check).
  const chave = buildRecordKey('001', 'ELET', 'ET/RT', 'ET / RT (PDF)');
  assert.equal(chave, '001|ELET|ET-RT|ET-RT (PDF)');
  assert.ok(!chave.includes('/'));

  // espaco colapsado: variacao de digitacao na planilha nao pode virar documento novo
  assert.equal(
    buildRecordKey('001', 'ELET', 'ET/RT', 'ET  /RT   (PDF)'),
    buildRecordKey('001', 'ELET', 'ET/RT', 'ET / RT (PDF)'),
  );

  // chave sem barra passa intacta
  assert.equal(buildRecordKey('001', 'ARQ', 'RVT', 'RVT'), '001|ARQ|RVT|RVT');

  assert.throws(() => sanitizeKeySegment('   '), /vazio/);
}

console.log('cept-import: OK (carry-forward, ELE->ELET, TOPO/TSD drop, duplicata, classify, fuzzy responsabilidade, heranca HIDA, avisos, CSV quoted, recordKey sem barra)');
