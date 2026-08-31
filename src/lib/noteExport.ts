import jsPDF from 'jspdf';
import { getDisciplineDisplayName } from '../components/Atividades';
import { getSheetBancos, getSheetDisciplinas, getSheetOsCodigos, getSheetTextos, stripCellMarkup, type AnnotationBanco, type AnnotationSheet } from '../components/CoordenacaoEngenharia/Anotacoes';
import { cellKey, quebrarTexto } from './bancoGrid';
import { normalizePdfExportOptions, type PdfExportOptions } from './pdfExport';

export { PDF_PAPER_FORMAT_LABELS, PDF_PAPER_FORMATS, normalizePdfExportOptions, type PdfExportOptions, type PdfExportOrientation, type PdfPaperFormat } from './pdfExport';

// Cor de celula/texto vem como hex (#RGB ou #RRGGBB) dos presets. Converte pro [r,g,b] do jsPDF.
function hexToRgb(value?: string): [number, number, number] | null {
  const hex = String(value || '').trim().replace(/^#/, '');
  const full = hex.length === 3 ? hex.split('').map((c) => c + c).join('') : hex;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return null;
  return [parseInt(full.slice(0, 2), 16), parseInt(full.slice(2, 4), 16), parseInt(full.slice(4, 6), 16)];
}

export function safeFileName(titulo: string) {
  return (titulo || 'anotacao')
    .normalize('NFD')
    .replace(new RegExp('[\\u0300-\\u036f]', 'g'), '')
    .replace(/[^a-zA-Z0-9-_]+/g, '_')
    .slice(0, 60) || 'anotacao';
}

export function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// Excel abre .csv nativamente (File > Open ou duplo clique) — nao precisa de uma
// lib de .xlsx binario so pra exportar uma planilha simples de texto.
export function exportNoteToCsv(sheet: AnnotationSheet) {
  const csv = getSheetBancos(sheet)
    .map((banco) => banco.rows.map((row) => row.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n'))
    .join('\r\n\r\n');
  downloadBlob(`${safeFileName(sheet.titulo)}.csv`, new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
}

function formatDateBRLocal(value?: string) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('pt-BR');
}

export function exportNoteToPdf(sheet: AnnotationSheet, linkedTitles: string[] = [], options?: PdfExportOptions) {
  // Banco com muitas colunas nao cabe legivel em retrato (210mm) - vira paisagem (297mm) a
  // partir de um limiar empirico de colunas. Todas as paginas do doc saem na mesma orientacao
  // (jsPDF fixa isso na criacao); paginar dentro da mesma nota so cria paginas extras, nao troca.
  const maxColCount = Math.max(0, ...getSheetBancos(sheet).map((banco) => banco.colCount));
  const { orientation, format } = normalizePdfExportOptions(options, maxColCount > 6 ? 'landscape' : 'portrait');
  const doc = new jsPDF({ orientation, unit: 'mm', format });
  const marginX = 14;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageBottom = doc.internal.pageSize.getHeight() - 17;
  let y = 16;

  const ensureSpace = (needed: number) => {
    if (y + needed > pageBottom) {
      doc.addPage(format, orientation);
      y = 16;
    }
  };

  // Quadro do cabecalho: titulo + metadados (autor, data, visibilidade).
  const metaLine = [
    sheet.autorNome ? `Criado por ${sheet.autorNome}` : null,
    formatDateBRLocal(sheet.criadoEm) ? `em ${formatDateBRLocal(sheet.criadoEm)}` : null,
    sheet.publica === false ? 'Privada' : 'Pública',
  ].filter(Boolean).join('  ·  ');

  const headerHeight = 22;
  doc.setDrawColor(224, 224, 224);
  doc.setLineWidth(0.3);
  doc.rect(marginX, y, pageWidth - marginX * 2, headerHeight);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text(sheet.titulo || 'Anotação', marginX + 4, y + 9);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(120, 120, 120);
  doc.text(metaLine, marginX + 4, y + 16);
  doc.setTextColor(0, 0, 0);
  y += headerHeight + 8;

  // Cada banco vira uma tabela com grade visivel (celula por celula, sem depender de plugin).
  const renderBancoTable = (banco: AnnotationBanco, index: number, total: number) => {
    if (banco.rows.length === 0 || banco.colCount === 0) return;
    if (total > 1) {
      ensureSpace(8);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text(`Banco ${index + 1}`, marginX, y);
      y += 6;
    }

    const colWidth = (pageWidth - marginX * 2) / banco.colCount;
    const padX = 2;
    const padY = 1.8;
    // mm por linha de texto a 9pt (1pt = 0.3528mm), com folga de 1.15x — mesma ideia de
    // alturaParaLinhas (linhas x altura da fonte), mas em mm (o grid on-screen usa px).
    const lineHeight = 9 * 0.3528 * 1.15;

    banco.rows.forEach((row, r) => {
      const isHeader = r === 0;
      doc.setFontSize(9);
      // Quebra o texto de cada celula na largura da coluna antes de desenhar, pra saber
      // quantas linhas ela ocupa - e a linha da tabela cresce pra maior celula, ninguem vaza.
      // ponytail: PDF (jsPDF doc.text) nao tem runs por trecho - so estilo por celula inteira
      // (banco.styles, ja aplicado abaixo). Marcacao **bold**/*italic*/~~strike~~/[c:#hex] por
      // palavra vira texto puro aqui (sem os marcadores), em vez de imprimir os simbolos crus.
      const linhasPorCelula = row.map((cell) => quebrarTexto(stripCellMarkup(String(cell ?? '')), colWidth - padX * 2, (t) => doc.getTextWidth(t)));
      const maxLinhas = Math.max(1, ...linhasPorCelula.map((linhas) => linhas.length));
      const rowHeight = Math.max(8, maxLinhas * lineHeight + padY * 2);
      ensureSpace(rowHeight);
      row.forEach((cell, c) => {
        const x = marginX + c * colWidth;
        const style = banco.styles?.[cellKey(r, c)];
        // Fundo da celula: cor propria da nota; senao cinza do cabecalho; senao sem preenchimento.
        const bg = hexToRgb(style?.bg) || (isHeader ? [243, 244, 246] as [number, number, number] : null);
        if (bg) {
          doc.setFillColor(bg[0], bg[1], bg[2]);
          doc.rect(x, y, colWidth, rowHeight, 'F');
        }
        doc.rect(x, y, colWidth, rowHeight); // grade
        // Negrito/italico da celula (cabecalho continua negrito por padrao).
        const bold = isHeader || Boolean(style?.bold);
        const italic = Boolean(style?.italic);
        doc.setFont('helvetica', bold && italic ? 'bolditalic' : bold ? 'bold' : italic ? 'italic' : 'normal');
        // Cor do texto da nota; padrao preto.
        const fg = hexToRgb(style?.color) || [0, 0, 0];
        doc.setTextColor(fg[0], fg[1], fg[2]);
        const align = style?.align || 'left';
        const textX = align === 'center' ? x + colWidth / 2 : align === 'right' ? x + colWidth - padX : x + padX;
        linhasPorCelula[c].forEach((linha, li) => {
          doc.text(linha, textX, y + padY + lineHeight * (li + 0.75), { align, maxWidth: colWidth - padX * 2 });
        });
      });
      y += rowHeight;
    });
    // Reseta cor do texto pra nao vazar pros blocos seguintes.
    doc.setTextColor(0, 0, 0);
    y += 8;
  };

  const bancos = getSheetBancos(sheet);
  bancos.forEach((banco, index) => renderBancoTable(banco, index, bancos.length));

  // Blocos de texto livre ("Notas 1", "Notas 2", ...).
  const textos = getSheetTextos(sheet);
  textos.forEach((bloco, index) => {
    if (!bloco.texto.trim()) return;
    ensureSpace(10);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text(textos.length > 1 ? `Notas ${index + 1}` : 'Notas', marginX, y);
    y += 6;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    const lines = doc.splitTextToSize(bloco.texto, pageWidth - marginX * 2);
    lines.forEach((line: string) => {
      ensureSpace(5.5);
      doc.text(line, marginX, y);
      y += 5.5;
    });
    y += 4;
  });

  // Notas vinculadas.
  if (linkedTitles.length > 0) {
    ensureSpace(10);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('Notas vinculadas', marginX, y);
    y += 6;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    linkedTitles.forEach((title) => {
      ensureSpace(5.5);
      doc.text(`•  ${title}`, marginX, y);
      y += 5.5;
    });
  }

  doc.save(`${safeFileName(sheet.titulo)}.pdf`);
}

// Um unico .md com todas as notas visiveis ao usuario (privadas dele + publicas de todos),
// estruturado pra uma IA conseguir ler tudo sem ambiguidade: indice, metadados completos
// por nota (id, autor, disciplina(s), OS, visibilidade), cada banco como tabela separada,
// texto livre e referencias cruzadas entre notas por titulo.
export type NotesGroupBy = 'contrato' | 'os' | 'disciplina';

export interface ExportNotesOptions {
  groupBy?: NotesGroupBy;
  // OS -> codigo do contrato (so usado quando groupBy === 'contrato').
  osContrato?: Record<string, string>;
  // Rotulo de exibicao por codigo de OS/contrato; sem entrada usa o proprio codigo.
  osLabel?: Record<string, string>;
  contratoLabel?: Record<string, string>;
}

export function exportNotesToMarkdown(sheets: AnnotationSheet[], currentUserEmail: string, options?: ExportNotesOptions) {
  const titleById = new Map(sheets.map((sheet) => [sheet.id, sheet.titulo || 'Sem título']));
  const escapeCell = (value: string) => String(value ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, '<br>');

  const renderBancoTable = (banco: AnnotationBanco) => (
    banco.rows.length > 0
      ? [
        `| ${banco.rows[0].map(escapeCell).join(' | ')} |`,
        `| ${banco.rows[0].map(() => '---').join(' | ')} |`,
        ...banco.rows.slice(1).map((row) => `| ${row.map(escapeCell).join(' | ')} |`),
      ].join('\n')
      : '_Banco vazio._'
  );

  // Monta a secao de uma nota; headingLevel controla se o titulo da nota vira ## ou ###
  // (rebaixado quando agrupada dentro de um cabecalho de grupo). Ancora so e emitida na
  // primeira ocorrencia da nota (ela pode repetir em varios grupos, ex: varias disciplinas).
  const anchoredIds = new Set<string>();
  const renderSection = (sheet: AnnotationSheet, headingMark: string) => {
    const disciplinas = getSheetDisciplinas(sheet).map((item) => getDisciplineDisplayName(item));
    const bancos = getSheetBancos(sheet);
    const linkedTitles = (sheet.linkedNoteIds || []).map((id) => titleById.get(id)).filter(Boolean);
    const backlinkTitles = sheets
      .filter((other) => other.id !== sheet.id && (other.linkedNoteIds || []).includes(sheet.id))
      .map((other) => other.titulo || 'Sem título');

    const metaLines = [
      `- ID: \`${sheet.id}\``,
      `- Autor: ${sheet.autorNome || 'desconhecido'}${sheet.autorEmail ? ` (${sheet.autorEmail})` : ''}`,
      `- Criado em: ${formatDateBRLocal(sheet.criadoEm) || 'sem data'}`,
      `- Visibilidade: ${sheet.publica === false ? 'Privada (só o autor vê)' : 'Pública (todos veem)'}`,
      `- Disciplina(s): ${disciplinas.length > 0 ? disciplinas.join(', ') : 'nenhuma'}`,
      sheet.osCodigo ? `- Ordem de Serviço: ${sheet.osCodigo}` : null,
    ].filter(Boolean).join('\n');

    const bancosMarkdown = bancos.length > 0
      ? bancos.map((banco, index) => `#### Banco ${index + 1}\n\n${renderBancoTable(banco)}`).join('\n\n')
      : '_Nota sem banco de dados (tabela)._';

    // getSheetTextos cobre tanto os blocos novos quanto o campo texto antigo.
    const textosMarkdown = getSheetTextos(sheet)
      .filter((bloco) => bloco.texto.trim())
      .map((bloco, index) => `#### Texto livre ${index + 1}\n\n${bloco.texto.trim()}`)
      .join('\n\n');

    const checklistsMarkdown = (sheet.checklists || [])
      .filter((lista) => lista.itens.length > 0)
      .map((lista, index) => [
        `#### Checklist ${index + 1}`,
        lista.itens.map((item) => `- [${item.feito ? 'x' : ' '}] ${item.texto || '(sem descrição)'}`).join('\n'),
      ].join('\n\n'))
      .join('\n\n');

    const firstOccurrence = !anchoredIds.has(sheet.id);
    anchoredIds.add(sheet.id);

    return [
      firstOccurrence ? `<a id="nota-${sheet.id}"></a>` : '',
      `${headingMark} ${sheet.titulo || 'Sem título'}`,
      metaLines,
      bancosMarkdown,
      textosMarkdown,
      checklistsMarkdown,
      linkedTitles.length > 0 ? `**Notas que esta referencia:** ${linkedTitles.join(', ')}` : '',
      backlinkTitles.length > 0 ? `**Notas que referenciam esta:** ${backlinkTitles.join(', ')}` : '',
    ].filter(Boolean).join('\n\n');
  };

  const groupBy = options?.groupBy;

  if (!groupBy) {
    const toc = sheets
      .map((sheet, index) => `${index + 1}. [${sheet.titulo || 'Sem título'}](#nota-${sheet.id})`)
      .join('\n');
    const sections = sheets.map((sheet) => renderSection(sheet, '##'));

    const markdown = [
      '# Notas de Engenharia — export para IA',
      `Exportado por ${currentUserEmail} em ${new Date().toLocaleString('pt-BR')}. Total: ${sheets.length} nota(s).`,
      'Este documento reune todas as notas privadas de quem exportou e todas as notas públicas do sistema. Cada nota tem seus metadados, seus bancos de dados (tabelas) e o texto livre, nessa ordem.',
      '## Índice',
      toc,
      sections.join('\n\n---\n\n'),
    ].join('\n\n');

    downloadBlob(`notas_${safeFileName(currentUserEmail.split('@')[0])}.md`, new Blob([markdown], { type: 'text/markdown;charset=utf-8' }));
    return;
  }

  // Agrupamento: uma nota pode cair em varios grupos (varias OS / varias disciplinas).
  const osContrato = options?.osContrato || {};
  const osLabel = options?.osLabel || {};
  const contratoLabel = options?.contratoLabel || {};

  const groupsByLabel = new Map<string, AnnotationSheet[]>();
  const addToGroup = (label: string, sheet: AnnotationSheet) => {
    const list = groupsByLabel.get(label) || [];
    list.push(sheet);
    groupsByLabel.set(label, list);
  };

  sheets.forEach((sheet) => {
    if (groupBy === 'os') {
      const codigos = getSheetOsCodigos(sheet);
      if (codigos.length === 0) { addToGroup('Sem OS', sheet); return; }
      codigos.forEach((codigo) => addToGroup(osLabel[codigo] || codigo, sheet));
    } else if (groupBy === 'disciplina') {
      const disciplinas = getSheetDisciplinas(sheet);
      if (disciplinas.length === 0) { addToGroup('Sem disciplina', sheet); return; }
      disciplinas.forEach((item) => addToGroup(getDisciplineDisplayName(item), sheet));
    } else {
      const codigosContrato = new Set(getSheetOsCodigos(sheet).map((codigo) => osContrato[codigo]).filter(Boolean));
      if (codigosContrato.size === 0) { addToGroup('Sem contrato', sheet); return; }
      codigosContrato.forEach((codigo) => addToGroup(contratoLabel[codigo!] || codigo!, sheet));
    }
  });

  const groupLabels = Array.from(groupsByLabel.keys()).sort((a, b) => a.localeCompare(b, 'pt-BR'));

  const toc = groupLabels
    .map((label) => [
      `- **${label}**`,
      ...groupsByLabel.get(label)!.map((sheet) => `  - [${sheet.titulo || 'Sem título'}](#nota-${sheet.id})`),
    ].join('\n'))
    .join('\n');

  const sections = groupLabels.map((label) => [
    `## ${label}`,
    groupsByLabel.get(label)!.map((sheet) => renderSection(sheet, '###')).join('\n\n---\n\n'),
  ].join('\n\n'));

  const suffix = groupBy === 'contrato' ? '_por_contrato' : groupBy === 'os' ? '_por_os' : '_por_disciplina';
  const markdown = [
    '# Notas de Engenharia — export para IA',
    `Exportado por ${currentUserEmail} em ${new Date().toLocaleString('pt-BR')}. Total: ${sheets.length} nota(s), agrupadas por ${groupBy}.`,
    'Este documento reune todas as notas privadas de quem exportou e todas as notas públicas do sistema, agrupadas conforme indicado. Uma nota pode aparecer em mais de um grupo. Cada nota tem seus metadados, seus bancos de dados (tabelas) e o texto livre, nessa ordem.',
    '## Índice',
    toc,
    sections.join('\n\n---\n\n'),
  ].join('\n\n');

  downloadBlob(`notas_${safeFileName(currentUserEmail.split('@')[0])}${suffix}.md`, new Blob([markdown], { type: 'text/markdown;charset=utf-8' }));
}
