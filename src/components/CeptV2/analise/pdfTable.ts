// Paginação local para manter F4 instalável sem alterar o manifesto de outro worker.
import type { jsPDF } from 'jspdf';

type Color = number[];
interface Style {
  fontSize?: number; cellPadding?: number; textColor?: Color; fillColor?: Color;
  fontStyle?: 'normal' | 'bold'; halign?: 'left' | 'center' | 'right';
  cellWidth?: number | 'auto';
  valign?: 'middle' | 'top';
}
export type RowInput = Array<string | number>;
interface CellHook {
  section: 'head' | 'body'; column: { index: number }; row: { index: number };
  cell: { raw: string | number; text: string[]; styles: Style; x: number; y: number; height: number; padding: (side: string) => number };
}
interface Options {
  startY: number; margin?: { left: number; right: number; bottom: number };
  styles?: Style; headStyles?: Style; alternateRowStyles?: Style;
  columnStyles?: Record<number, Style>; tableWidth?: number; theme?: string;
  head: RowInput[]; body: RowInput[];
  didParseCell?: (hook: CellHook) => void; didDrawCell?: (hook: CellHook) => void;
}
export const pdfText = (text: string) => text.replace(/→/g, ' -> ').replace(/←/g, ' <- ').replace(/[✓●▲]/g, '').replace(/≥/g, '>=').replace(/—/g, '-');

/** Same widths are scaled for portrait/smaller paper; repeat headers and split tall rows. */
export default function drawTable(d: jsPDF, opts: Options) {
  const margin = opts.margin || { left: 12, right: 12, bottom: 14 };
  const width = Math.min(opts.tableWidth || Infinity, d.internal.pageSize.getWidth() - margin.left - margin.right);
  const cols = opts.head[0]?.length || 0;
  if (!cols) return;
  const fixed = Array.from({ length: cols }, (_, i) => opts.columnStyles?.[i]?.cellWidth);
  const fixedTotal = fixed.reduce<number>((s, w) => s + (typeof w === 'number' ? w : 0), 0);
  const flexible = fixed.filter((w) => typeof w !== 'number').length;
  const desired = fixed.map((w) => typeof w === 'number' ? w : Math.max(12, (width - fixedTotal) / Math.max(1, flexible)));
  const scale = width / desired.reduce((a, b) => a + b, 0);
  const widths = desired.map((w) => w * scale);
  const bottom = d.internal.pageSize.getHeight() - margin.bottom;
  let y = opts.startY;
  const prepare = (row: RowInput, index: number, section: 'head' | 'body') => row.map((raw, ci): CellHook => {
    const styles: Style = { fontSize: 7, cellPadding: 1.2, textColor: [45, 45, 45], ...opts.styles,
      ...(section === 'head' ? opts.headStyles : index % 2 ? opts.alternateRowStyles : {}), ...opts.columnStyles?.[ci] };
    const h: CellHook = { section, column: { index: ci }, row: { index }, cell: { raw, text: [String(raw ?? '')], styles, x: 0, y: 0, height: 0, padding: () => styles.cellPadding ?? 1.2 } };
    opts.didParseCell?.(h);
    d.setFont('helvetica', styles.fontStyle || 'normal'); d.setFontSize(styles.fontSize || 7);
    h.cell.text = h.cell.text.flatMap((t) => d.splitTextToSize(pdfText(t), Math.max(1, widths[ci] - 2 * h.cell.padding('left'))) as string[]);
    return h;
  });
  const lineHeight = (cells: CellHook[]) => Math.max(...cells.map((h) => (h.cell.styles.fontSize || 7) * 0.3528 * 1.2));
  const draw = (cells: CellHook[], offset: number, count: number) => {
    const lh = lineHeight(cells); const pad = Math.max(...cells.map((h) => h.cell.padding('left')));
    const height = count * lh + 2 * pad;
    let x = margin.left;
    cells.forEach((h, ci) => {
      const s = h.cell.styles; const w = widths[ci];
      h.cell.x = x; h.cell.y = y; h.cell.height = height;
      d.setFillColor(...(s.fillColor || [255, 255, 255]) as [number, number, number]);
      d.setDrawColor(229, 231, 235); d.setLineWidth(0.1); d.rect(x, y, w, height, 'FD');
      d.setFont('helvetica', s.fontStyle || 'normal'); d.setFontSize(s.fontSize || 7);
      d.setTextColor(...(s.textColor || [45, 45, 45]) as [number, number, number]);
      const align = s.halign || 'left';
      const tx = align === 'center' ? x + w / 2 : align === 'right' ? x + w - pad : x + pad;
      h.cell.text.slice(offset, offset + count).forEach((t, li) => d.text(t, tx, y + pad + lh * (li + 0.8), { align }));
      opts.didDrawCell?.(h); x += w;
    });
    y += height;
  };
  const heads = opts.head.map((row, i) => prepare(row, i, 'head'));
  const headHeight = heads.reduce((s, cells) => s + Math.max(...cells.map((c) => c.cell.text.length)) * lineHeight(cells) + 2.4, 0);
  const header = () => heads.forEach((cells) => draw(cells, 0, Math.max(...cells.map((c) => c.cell.text.length))));
  const newPage = () => { d.addPage(); y = 14; d.setFillColor(240, 93, 40); d.rect(0, 0, 3, d.internal.pageSize.getHeight(), 'F'); header(); };
  if (y + headHeight + 8 > bottom) newPage(); else header();
  opts.body.forEach((row, index) => {
    const cells = prepare(row, index, 'body'); const lh = lineHeight(cells);
    const lines = Math.max(1, ...cells.map((c) => c.cell.text.length));
    if (y + lines * lh + 2.4 > bottom && lines * lh + 2.4 <= bottom - 14 - headHeight) newPage();
    let offset = 0;
    while (offset < lines) {
      const capacity = Math.floor((bottom - y - 2.4) / lh);
      if (capacity < 1) { newPage(); continue; }
      const count = Math.min(lines - offset, capacity);
      draw(cells, offset, count); offset += count;
      if (offset < lines) newPage();
    }
  });
  (d as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable = { finalY: y };
}
