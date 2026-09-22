// Exportacao em Markdown de notas + demandas digitais, pensada pra um LLM ler direto no navegador.
// Funcao pura: sem fetch, sem DOM. Quem busca os dados (notes doc, feedbackReports) fica fora daqui.
// Import so de tipos (nao de valor): Anotacoes.tsx importa Atividades.tsx, que usa
// import.meta.glob (so funciona sob o bundler do Vite). Um import de valor puxaria essa cadeia
// e quebraria a execucao do self-check via tsx/node puro. getSheetBancos/getSheetTextos sao
// one-liners de migracao de campo legado - reimplementados abaixo em vez de importados.
import type { AnnotationBanco, AnnotationSheet, AnnotationTextBlock } from '../components/CoordenacaoEngenharia/Anotacoes';
import type { FeedbackReport, FeedbackReportStatus } from '../types/feedbackReport';

// Ordem e rotulos identicos ao Kanban de DemandasDigitais.tsx:15-20.
const COLUNAS: Array<{ titulo: string; statuses: FeedbackReportStatus[] }> = [
  { titulo: 'Recebidos', statuses: ['new'] },
  { titulo: 'Em análise', statuses: ['triage', 'planned'] },
  { titulo: 'Em andamento', statuses: ['doing'] },
  { titulo: 'Concluídos', statuses: ['done', 'archived'] },
];

function escapeCell(valor: string): string {
  return valor.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

function fmtData(valor: unknown): string {
  if (!valor) return '';
  if (typeof valor === 'string') return valor;
  if (valor instanceof Date) return valor.toISOString();
  // Timestamp do Firestore: tem toDate().
  if (typeof valor === 'object' && valor !== null && 'toDate' in valor && typeof (valor as { toDate: unknown }).toDate === 'function') {
    return (valor as { toDate: () => Date }).toDate().toISOString();
  }
  return String(valor);
}

// Mesma regra de migracao legada de Anotacoes.tsx:getSheetBancos/getSheetTextos, reimplementada
// aqui pra nao puxar valor de um modulo com import.meta.glob (ver comentario no topo do arquivo).
function sheetBancos(sheet: AnnotationSheet): AnnotationBanco[] {
  if (sheet.bancos && sheet.bancos.length > 0) return sheet.bancos;
  if (sheet.colCount && sheet.colCount > 0 && sheet.rows) return [{ id: 'legacy', colCount: sheet.colCount, rows: sheet.rows }];
  return [];
}

function sheetTextos(sheet: AnnotationSheet): AnnotationTextBlock[] {
  if (sheet.textos && sheet.textos.length > 0) return sheet.textos;
  if (sheet.texto && sheet.texto.trim()) return [{ id: 'legacy', texto: sheet.texto }];
  return [];
}

function bancoParaMarkdown(banco: AnnotationBanco, indice: number): string {
  const linhas: string[] = [];
  if (banco.nome) linhas.push(`#### ${banco.nome}`);
  else linhas.push(`#### Banco ${indice + 1}`);

  const colCount = Math.max(0, banco.colCount || 0);
  if (colCount === 0 || banco.rows.length === 0) {
    linhas.push('_(tabela vazia)_');
    return linhas.join('\n');
  }

  // Normaliza cada linha pro tamanho de colCount (padding ou corte) - rows podem estar irregulares.
  const normalizar = (row: string[]): string[] => {
    const out: string[] = [];
    for (let c = 0; c < colCount; c += 1) out.push(escapeCell(row[c] ?? ''));
    return out;
  };

  const [cabecalho, ...resto] = banco.rows;
  linhas.push(`| ${normalizar(cabecalho ?? []).join(' | ')} |`);
  linhas.push(`| ${Array(colCount).fill('---').join(' | ')} |`);
  for (const row of resto) {
    linhas.push(`| ${normalizar(row).join(' | ')} |`);
  }
  return linhas.join('\n');
}

function notaParaMarkdown(nota: AnnotationSheet): string {
  const linhas: string[] = [];
  linhas.push(`### ${nota.titulo || '(sem título)'}`);

  const meta: string[] = [];
  if (nota.disciplina) meta.push(`disciplina: ${nota.disciplina}`);
  meta.push(`status: ${nota.status || 'criado'}`);
  if (nota.autorNome || nota.autorEmail) meta.push(`autor: ${nota.autorNome || nota.autorEmail}`);
  if (nota.updatedAt) meta.push(`atualizado em: ${fmtData(nota.updatedAt)}`);
  if (nota.osCodigo) meta.push(`OS: ${nota.osCodigo}`);
  linhas.push(`_${meta.join(' · ')}_`);
  linhas.push('');

  const textos = sheetTextos(nota);
  for (const texto of textos) {
    if (texto.nome) linhas.push(`**${texto.nome}**`);
    linhas.push(texto.texto || '_(vazio)_');
    linhas.push('');
  }

  const checklists = nota.checklists ?? [];
  for (const checklist of checklists) {
    if (checklist.nome) linhas.push(`**${checklist.nome}**`);
    if (checklist.itens.length === 0) {
      linhas.push('_(checklist vazio)_');
    } else {
      for (const item of checklist.itens) {
        linhas.push(`- [${item.feito ? 'x' : ' '}] ${item.texto || '_(vazio)_'}`);
      }
    }
    linhas.push('');
  }

  const bancos = sheetBancos(nota);
  bancos.forEach((banco, indice) => {
    linhas.push(bancoParaMarkdown(banco, indice));
    linhas.push('');
  });

  return linhas.join('\n').trimEnd();
}

function demandaParaMarkdown(demanda: FeedbackReport): string {
  const tipo = demanda.kind === 'bug' ? 'bug' : demanda.kind === 'request' ? 'pedido de alteração' : 'ideia';
  const titulo = demanda.title || '(sem título)';
  const partes = [`**${titulo}**`, `(${tipo}, status: ${demanda.status}, autor: ${demanda.authorEmail}, rota: ${demanda.route})`];
  const linhas = [`- ${partes.join(' ')}`];
  if (demanda.body && demanda.body.trim()) {
    linhas.push(`  ${demanda.body.trim().replace(/\n/g, '\n  ')}`);
  }
  return linhas.join('\n');
}

export function buildAiMarkdown(notes: AnnotationSheet[], reports: FeedbackReport[]): string {
  const linhas: string[] = [];
  linhas.push('## Instrucao de triagem');
  linhas.push('Para cada demanda aberta, responda em PT-BR com: problema (1 linha), plano (ate 3 passos curtos) e prompt de execucao.');
  linhas.push('Nao execute alteracoes, nao invente dados e marque dependencia externa como bloqueio para aprovacao humana.');
  linhas.push('');
  linhas.push('# EcoQuanta — exportação para IA');
  linhas.push(`Gerado em ${new Date().toISOString()} · ${notes.length} notas · ${reports.length} demandas`);
  linhas.push('');

  linhas.push('## Demandas Digitais');
  for (const coluna of COLUNAS) {
    linhas.push(`### ${coluna.titulo}`);
    const itens = reports.filter((r) => coluna.statuses.includes(r.status));
    if (itens.length === 0) {
      linhas.push('_nenhuma_');
    } else {
      for (const demanda of itens) linhas.push(demandaParaMarkdown(demanda));
    }
    linhas.push('');
  }

  linhas.push('## Notas');
  if (notes.length === 0) {
    linhas.push('_nenhuma_');
  } else {
    for (const nota of notes) {
      linhas.push(notaParaMarkdown(nota));
      linhas.push('');
    }
  }

  return linhas.join('\n').trimEnd() + '\n';
}
