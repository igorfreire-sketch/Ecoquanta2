import jsPDF from 'jspdf';
import type { AnnotationSheet } from '../components/CoordenacaoEngenharia/Anotacoes';

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
  const csv = sheet.rows
    .map((row) => row.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(','))
    .join('\r\n');
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

  // Tabela com linhas de grade visiveis (celula por celula, sem depender de plugin).
  if (sheet.rows.length > 0 && sheet.colCount > 0) {
    const colWidth = (pageWidth - marginX * 2) / sheet.colCount;
    const rowHeight = 8;

    sheet.rows.forEach((row, r) => {
      ensureSpace(rowHeight);
      const isHeader = r === 0;
      if (isHeader) {
        doc.setFillColor(243, 244, 246);
        doc.rect(marginX, y, colWidth * sheet.colCount, rowHeight, 'F');
      }
      doc.setFont('helvetica', isHeader ? 'bold' : 'normal');
      doc.setFontSize(9);
      row.forEach((cell, c) => {
        const x = marginX + c * colWidth;
        doc.rect(x, y, colWidth, rowHeight);
        doc.text(String(cell ?? ''), x + 2, y + 5.5, { maxWidth: colWidth - 3 });
      });
      y += rowHeight;
    });
    y += 8;
  }

  // Texto livre (bloco "Notas" da anotacao).
  if (sheet.texto?.trim()) {
    ensureSpace(10);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('Notas', marginX, y);
    y += 6;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    const lines = doc.splitTextToSize(sheet.texto, pageWidth - marginX * 2);
    lines.forEach((line: string) => {
      ensureSpace(5.5);
      doc.text(line, marginX, y);
      y += 5.5;
    });
    y += 4;
  }

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
