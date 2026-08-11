import jsPDF from 'jspdf';
import { safeFileName, downloadBlob } from './noteExport';
import { normalizePdfExportOptions, type PdfExportOptions } from './pdfExport';
import { ordemArvore, calcularCodigos, ordemColunasCronograma, type CronogramaDoc, type CronoRow } from '../components/SolucoesDigitais';

function cabecalho(doc: CronogramaDoc): string[] {
  const nomesFixos: Record<string, string> = {
    id: 'ID', nome: 'Atividade', predecessora: 'Predecessora', inicio: 'Início',
    duracao: 'Duração (dias)', fim: 'Fim', responsavel: 'Responsável',
    percentual: '% Concluído', nota: 'Nota', atividade: 'Atividade agenda',
  };
  return ordemColunasCronograma(doc).map((key) => nomesFixos[key] || doc.colunasCustom.find((col) => col.id === key)?.nome || key);
}

// ponytail: Nota/Atividade agenda saem como o id bruto vinculado (sem resolver titulo/nome) —
// resolver isso exigiria passar as listas de notes/activities pro export, que hoje opera so em
// cima do CronogramaDoc. Trocar por titulo/nome se algum dia isso incomodar na planilha exportada.
function linhaValores(doc: CronogramaDoc, row: CronoRow, codigos: Map<string, string>): string[] {
  const valoresFixos: Record<string, string> = {
    id: codigos.get(row.id) || '',
    nome: row.nome || '',
    predecessora: row.predecessoraId ? (codigos.get(row.predecessoraId) || '') : '',
    inicio: row.dataInicio || '',
    duracao: row.duracaoDias != null ? String(row.duracaoDias) : '',
    fim: row.dataFim || '',
    responsavel: row.responsavelEmail || '',
    percentual: row.percentualConcluido != null ? String(row.percentualConcluido) : '',
    nota: row.noteId || '',
    atividade: row.atividadeId || '',
  };
  return ordemColunasCronograma(doc).map((key) => valoresFixos[key] ?? row.custom?.[key] ?? '');
}

function linhasOrdenadas(doc: CronogramaDoc): string[][] {
  const codigos = calcularCodigos(doc.rows);
  return ordemArvore(doc.rows).map((row) => linhaValores(doc, row, codigos));
}

// Excel abre .csv nativamente — mesma logica de exportNoteToCsv (noteExport.ts), sem lib de .xlsx.
export function exportCronogramaToCsv(doc: CronogramaDoc) {
  const linhas = [cabecalho(doc), ...linhasOrdenadas(doc)];
  const csv = linhas
    .map((linha) => linha.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(','))
    .join('\r\n');
  downloadBlob(`${safeFileName(doc.titulo)}.csv`, new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
}

// Um cronograma tem 10+ colunas (9 fixas + customizadas) — sempre paisagem, diferente do
// heuristico de exportNoteToPdf (que so vira paisagem acima de 6 colunas de banco). Tabela
// simples (titulo + grade), sem replicar o estilo rico de celula das notas.
export function exportCronogramaToPdf(doc: CronogramaDoc, options?: PdfExportOptions) {
  const { orientation, format } = normalizePdfExportOptions(options, 'landscape');
  const pdf = new jsPDF({ orientation, unit: 'mm', format });
  const marginX = 10;
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageBottom = pdf.internal.pageSize.getHeight() - 20;
  const lineHeight = 5;
  let y = 14;

  pdf.setFontSize(14);
  pdf.setFont('helvetica', 'bold');
  pdf.text(doc.titulo || 'Cronograma', marginX, y);
  y += 8;

  const colunas = cabecalho(doc);
  const colWidth = (pageWidth - marginX * 2) / colunas.length;

  const ensureSpace = (needed: number) => {
    if (y + needed > pageBottom) { pdf.addPage(format, orientation); y = 14; }
  };

  const desenharLinha = (valores: string[], negrito: boolean) => {
    ensureSpace(lineHeight + 1);
    pdf.setFontSize(7.5);
    pdf.setFont('helvetica', negrito ? 'bold' : 'normal');
    valores.forEach((valor, i) => {
      const x = marginX + i * colWidth;
      if (negrito) { pdf.setFillColor(243, 244, 246); pdf.rect(x, y - lineHeight + 1.5, colWidth, lineHeight, 'F'); }
      pdf.rect(x, y - lineHeight + 1.5, colWidth, lineHeight);
      pdf.text(String(valor ?? ''), x + 1, y, { maxWidth: colWidth - 2 });
    });
    y += lineHeight;
  };

  desenharLinha(colunas, true);
  linhasOrdenadas(doc).forEach((linha) => desenharLinha(linha, false));

  pdf.save(`${safeFileName(doc.titulo)}.pdf`);
}

// .md com os cronogramas visiveis (mesmo espirito de exportNotesToMarkdown, sem agrupamento —
// CronogramaDoc nao tem contrato/OS/disciplina pra agrupar por).
export function exportCronogramasToMarkdown(cronogramas: CronogramaDoc[], currentUserEmail: string) {
  const escapeCell = (value: string) => String(value ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, '<br>');

  const secoes = cronogramas.map((doc) => {
    const cab = cabecalho(doc);
    const linhas = linhasOrdenadas(doc);
    const tabela = linhas.length > 0
      ? [
        `| ${cab.map(escapeCell).join(' | ')} |`,
        `| ${cab.map(() => '---').join(' | ')} |`,
        ...linhas.map((linha) => `| ${linha.map(escapeCell).join(' | ')} |`),
      ].join('\n')
      : '_Cronograma sem atividades._';

    return [
      `## ${doc.titulo || 'Sem título'}`,
      [
        `- Autor: ${doc.autorNome || 'desconhecido'}${doc.autorEmail ? ` (${doc.autorEmail})` : ''}`,
        `- Visibilidade: ${doc.publica === false ? 'Particular (só o autor vê)' : 'Público (todos veem)'}`,
      ].join('\n'),
      tabela,
    ].join('\n\n');
  });

  const markdown = [
    '# Cronogramas — export para IA',
    `Exportado por ${currentUserEmail} em ${new Date().toLocaleString('pt-BR')}. Total: ${cronogramas.length} cronograma(s).`,
    'Este documento reune os cronogramas visiveis a quem exportou (privados dele + publicos de todos), cada um com sua tabela de atividades na ordem hierarquica exibida na tela.',
    secoes.join('\n\n---\n\n'),
  ].join('\n\n');

  downloadBlob(`cronogramas_${safeFileName(currentUserEmail.split('@')[0])}.md`, new Blob([markdown], { type: 'text/markdown;charset=utf-8' }));
}
