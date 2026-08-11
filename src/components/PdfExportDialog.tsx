import { useId, useState } from 'react';
import { createPortal } from 'react-dom';
import { PDF_PAPER_FORMAT_LABELS, PDF_PAPER_FORMATS, type PdfExportOrientation, type PdfPaperFormat } from '../lib/pdfExport';

interface PdfExportDialogProps {
  title: string;
  defaultOrientationLabel: string;
  onCancel: () => void;
  onConfirm: (options: { orientation?: PdfExportOrientation; format: PdfPaperFormat }) => void;
}

export default function PdfExportDialog({ title, defaultOrientationLabel, onCancel, onConfirm }: PdfExportDialogProps) {
  const titleId = useId();
  const [orientation, setOrientation] = useState<'' | PdfExportOrientation>('');
  const [format, setFormat] = useState<PdfPaperFormat>('a4');

  return createPortal(
    <div className="fixed inset-0 z-[260] flex items-center justify-center bg-black/30 p-4">
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onSubmit={(event) => {
          event.preventDefault();
          onConfirm({ orientation: orientation || undefined, format });
        }}
        className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl"
      >
        <h3 id={titleId} className="text-[15px] font-bold text-[#2D2D2D]">{title}</h3>
        <label className="mt-4 block text-[12px] font-bold text-[#64748B]">
          Orientação
          <select
            value={orientation}
            onChange={(event) => setOrientation(event.currentTarget.value as '' | PdfExportOrientation)}
            className="mt-1 h-10 w-full rounded-lg border border-[#E5E7EB] bg-white px-3 text-[13px] text-[#2D2D2D] outline-none focus:border-[#F05D28]"
          >
            <option value="">{defaultOrientationLabel}</option>
            <option value="portrait">Retrato</option>
            <option value="landscape">Paisagem</option>
          </select>
        </label>
        <label className="mt-3 block text-[12px] font-bold text-[#64748B]">
          Papel
          <select
            value={format}
            onChange={(event) => setFormat(event.currentTarget.value as PdfPaperFormat)}
            className="mt-1 h-10 w-full rounded-lg border border-[#E5E7EB] bg-white px-3 text-[13px] text-[#2D2D2D] outline-none focus:border-[#F05D28]"
          >
            {PDF_PAPER_FORMATS.map((item) => (
              <option key={item} value={item}>{PDF_PAPER_FORMAT_LABELS[item]}</option>
            ))}
          </select>
        </label>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="h-9 rounded-lg px-3 text-[12px] font-bold text-[#64748B] hover:bg-[#F3F4F6]">
            Cancelar
          </button>
          <button type="submit" className="h-9 rounded-lg bg-[#F05D28] px-4 text-[12px] font-bold text-white hover:bg-[#D94E1F]">
            Exportar
          </button>
        </div>
      </form>
    </div>,
    document.body,
  );
}
