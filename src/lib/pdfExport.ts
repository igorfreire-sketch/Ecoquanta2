export const PDF_PAPER_FORMATS = ['a4', 'a3', 'letter', 'legal', 'tabloid'] as const;
export type PdfPaperFormat = typeof PDF_PAPER_FORMATS[number];
export type PdfExportOrientation = 'portrait' | 'landscape';

export interface PdfExportOptions {
  orientation?: PdfExportOrientation;
  format?: PdfPaperFormat;
}

export const PDF_PAPER_FORMAT_LABELS: Record<PdfPaperFormat, string> = {
  a4: 'A4',
  a3: 'A3',
  letter: 'Letter',
  legal: 'Legal',
  tabloid: 'Tabloid',
};

function isPdfOrientation(value: unknown): value is PdfExportOrientation {
  return value === 'portrait' || value === 'landscape';
}

function isPdfPaperFormat(value: unknown): value is PdfPaperFormat {
  return PDF_PAPER_FORMATS.includes(value as PdfPaperFormat);
}

export function normalizePdfExportOptions(options: PdfExportOptions | undefined, defaultOrientation: PdfExportOrientation): Required<PdfExportOptions> {
  const orientation = options?.orientation ?? defaultOrientation;
  const format = options?.format ?? 'a4';
  if (!isPdfOrientation(orientation)) throw new RangeError('Orientacao de PDF invalida.');
  if (!isPdfPaperFormat(format)) throw new RangeError('Formato de papel de PDF invalido.');
  return { orientation, format };
}
