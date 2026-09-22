// Check do builder de exportacao Markdown. Rodar: npx tsx src/lib/aiExport.check.ts
import assert from 'node:assert/strict';
import { buildAiMarkdown } from './aiExport';
import type { AnnotationSheet } from '../components/CoordenacaoEngenharia/Anotacoes';
import type { FeedbackReport } from '../types/feedbackReport';

function report(overrides: Partial<FeedbackReport>): FeedbackReport {
  return {
    id: 'r1', kind: 'bug', route: '/x', status: 'new',
    authorUid: 'u1', authorEmail: 'a@b.c', createdAt: null, updatedAt: null,
    ...overrides,
  };
}

// ---- input vazio: documento valido, sem crash ----
{
  const out = buildAiMarkdown([], []);
  assert.ok(out.includes('# EcoQuanta'));
  assert.ok(out.includes('0 notas'));
  assert.ok(out.includes('0 demandas'));
  assert.ok(out.includes('_nenhuma_'));
  assert.ok(out.includes('## Instrucao de triagem'));
  assert.ok(out.includes('ate 3 passos curtos'));
  assert.ok(!out.includes('undefined'), 'nunca emitir undefined');
  assert.ok(!out.includes('[object Object]'));
}

// ---- bucketing de coluna: todos os 6 status caem na coluna certa ----
{
  const reports: FeedbackReport[] = [
    report({ id: 'a', status: 'new', title: 'A' }),
    report({ id: 'b', status: 'triage', title: 'B' }),
    report({ id: 'c', status: 'planned', title: 'C' }),
    report({ id: 'd', status: 'doing', title: 'D' }),
    report({ id: 'e', status: 'done', title: 'E' }),
    report({ id: 'f', status: 'archived', title: 'F' }),
  ];
  const out = buildAiMarkdown([], reports);
  const secaoRecebidos = out.split('### Recebidos')[1].split('### Em análise')[0];
  assert.ok(secaoRecebidos.includes('A') && !secaoRecebidos.includes('B'));
  const secaoAnalise = out.split('### Em análise')[1].split('### Em andamento')[0];
  assert.ok(secaoAnalise.includes('B') && secaoAnalise.includes('C'));
  const secaoAndamento = out.split('### Em andamento')[1].split('### Concluídos')[0];
  assert.ok(secaoAndamento.includes('D') && !secaoAndamento.includes('E'));
  const secaoConcluidos = out.split('### Concluídos')[1].split('## Notas')[0];
  assert.ok(secaoConcluidos.includes('E') && secaoConcluidos.includes('F'));
}

// Pedido não pode virar ideia no pacote que a IA usará para propor o plano.
assert.ok(buildAiMarkdown([], [report({ kind: 'request', title: 'Trocar campo' })]).includes('pedido de alteração'));

// ---- nota vazia (sem bancos/textos/checklists) nao quebra ----
{
  const nota: AnnotationSheet = { id: 'n1', disciplina: 'ARQ', titulo: 'Nota vazia', updatedAt: '2026-01-01' };
  const out = buildAiMarkdown([nota], []);
  assert.ok(out.includes('### Nota vazia'));
  assert.ok(!out.includes('undefined'));
}

// ---- celula com pipe nao quebra a tabela ----
{
  const nota: AnnotationSheet = {
    id: 'n2', disciplina: 'ARQ', titulo: 'Com pipe', updatedAt: '2026-01-01',
    bancos: [{ id: 'b1', colCount: 2, rows: [['col a', 'col b'], ['x|y', 'normal']] }],
  };
  const out = buildAiMarkdown([nota], []);
  assert.ok(out.includes('x\\|y'), 'pipe dentro da celula deve ser escapado');
  // linha da tabela ainda tem exatamente 2 colunas: 3 barras nao-escapadas delimitando | a | b |
  const linhaDado = out.split('\n').find((l) => l.includes('x\\|y'))!;
  const barrasReais = linhaDado.split('').filter((ch, i) => ch === '|' && linhaDado[i - 1] !== '\\').length;
  assert.equal(barrasReais, 3, 'pipe escapado nao pode contar como delimitador de coluna');
}

// ---- banco com linhas irregulares (curtas e longas) nao crasha e respeita colCount ----
{
  const nota: AnnotationSheet = {
    id: 'n3', disciplina: 'ARQ', titulo: 'Irregular', updatedAt: '2026-01-01',
    bancos: [{
      id: 'b2', colCount: 3,
      rows: [
        ['h1', 'h2', 'h3'],
        ['curta'], // menos colunas que colCount
        ['a', 'b', 'c', 'd', 'e'], // mais colunas que colCount
      ],
    }],
  };
  const out = buildAiMarkdown([nota], []);
  assert.ok(!out.includes('undefined'));
  const linhas = out.split('\n').filter((l) => l.trim().startsWith('|') && !l.includes('---'));
  for (const l of linhas) {
    const cols = l.split('|').length - 2; // remove bordas vazias antes/depois
    assert.equal(cols, 3, `linha "${l}" deveria ter 3 colunas`);
  }
}

console.log('aiExport: OK (vazio, bucketing 6 status, nota vazia, pipe escapado, banco irregular)');
