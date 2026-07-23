import jsPDF from 'jspdf';
import { getDisciplineDisplayName } from '../components/Atividades';
import { getSheetBancos, getSheetDisciplinas, getSheetTextos, type AnnotationBanco, type AnnotationSheet } from '../components/CoordenacaoEngenharia/Anotacoes';
import { cellKey, quebrarTexto } from './bancoGrid';

function safeFileName(titulo: string) {
  return (titulo || 'anotacao')
    .normalize('NFD')
    .replace(new RegExp('[\\u0300-\\u036f]', 'g'), '')
    .replace(/[^a-zA-Z0-9-_]+/g, '_')
    .slice(0, 60) || 'anotacao';
}

function downloadBlob(filename: string, blob: Blob) {
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

export function exportNoteToPdf(sheet: AnnotationSheet, linkedTitles: string[] = []) {
  const doc = new jsPDF();
  const marginX = 14;
  const pageWidth = 210;
  const pageBottom = 280;
  let y = 16;

  const ensureSpace = (needed: number) => {
    if (y + needed > pageBottom) {
      doc.addPage();
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
      doc.setFont('helvetica', isHeader ? 'bold' : 'normal');
      doc.setFontSize(9);
      // Quebra o texto de cada celula na largura da coluna antes de desenhar, pra saber
      // quantas linhas ela ocupa - e a linha da tabela cresce pra maior celula, ninguem vaza.
      const linhasPorCelula = row.map((cell) => quebrarTexto(String(cell ?? ''), colWidth - padX * 2, (t) => doc.getTextWidth(t)));
      const maxLinhas = Math.max(1, ...linhasPorCelula.map((linhas) => linhas.length));
      const rowHeight = Math.max(8, maxLinhas * lineHeight + padY * 2);
      ensureSpace(rowHeight);
      if (isHeader) {
        doc.setFillColor(243, 244, 246);
        doc.rect(marginX, y, colWidth * banco.colCount, rowHeight, 'F');
      }
      row.forEach((cell, c) => {
        const x = marginX + c * colWidth;
        doc.rect(x, y, colWidth, rowHeight);
        const align = banco.styles?.[cellKey(r, c)]?.align || 'left';
        const textX = align === 'center' ? x + colWidth / 2 : align === 'right' ? x + colWidth - padX : x + padX;
        linhasPorCelula[c].forEach((linha, li) => {
          doc.text(linha, textX, y + padY + lineHeight * (li + 0.75), { align, maxWidth: colWidth - padX * 2 });
        });
      });
      y += rowHeight;
    });
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
export function exportNotesToMarkdown(sheets: AnnotationSheet[], currentUserEmail: string) {
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

  const toc = sheets
    .map((sheet, index) => `${index + 1}. [${sheet.titulo || 'Sem título'}](#nota-${sheet.id})`)
    .join('\n');

  const sections = sheets.map((sheet) => {
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

    return [
      `<a id="nota-${sheet.id}"></a>`,
      `## ${sheet.titulo || 'Sem título'}`,
      metaLines,
      bancosMarkdown,
      textosMarkdown,
      checklistsMarkdown,
      linkedTitles.length > 0 ? `**Notas que esta referencia:** ${linkedTitles.join(', ')}` : '',
      backlinkTitles.length > 0 ? `**Notas que referenciam esta:** ${backlinkTitles.join(', ')}` : '',
    ].filter(Boolean).join('\n\n');
  });

  const markdown = [
    '# Notas de Engenharia — export para IA',
    `Exportado por ${currentUserEmail} em ${new Date().toLocaleString('pt-BR')}. Total: ${sheets.length} nota(s).`,
    'Este documento reune todas as notas privadas de quem exportou e todas as notas públicas do sistema. Cada nota tem seus metadados, seus bancos de dados (tabelas) e o texto livre, nessa ordem.',
    '## Índice',
    toc,
    sections.join('\n\n---\n\n'),
  ].join('\n\n');

  downloadBlob(`notas_${safeFileName(currentUserEmail.split('@')[0])}.md`, new Blob([markdown], { type: 'text/markdown;charset=utf-8' }));
}
