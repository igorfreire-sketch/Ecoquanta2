import { useState } from 'react';
import { PDF_PAPER_FORMATS, PDF_PAPER_FORMAT_LABELS, type PdfExportOptions, type PdfPaperFormat } from '../../../lib/pdfExport';
import { btnGhost, btnPrimary, focusRing, Modal } from './Ui';

// Native top-layer dialog remains usable above the detail/history/validation dialogs.
export default function PdfOptions({ title, onCancel, onConfirm }: {
  title: string; onCancel: () => void; onConfirm: (opts: PdfExportOptions) => void;
}) {
  const [orientation, setOrientation] = useState<'landscape' | 'portrait'>('landscape');
  const [format, setFormat] = useState<PdfPaperFormat>('a4');
  return <Modal title={title} onClose={onCancel} size="max-w-sm" footer={
    <div className="flex justify-end gap-2 border-t border-[#E5E7EB] px-6 py-3">
      <button type="button" className={btnGhost} onClick={onCancel}>Cancelar</button>
      <button type="button" className={btnPrimary} onClick={() => onConfirm({ orientation, format })}>Exportar</button>
    </div>}>
    <label className="block text-[12px] font-bold">Orientação
      <select className={`mt-1 h-10 w-full rounded-lg border border-[#E5E7EB] px-3 ${focusRing}`} value={orientation} onChange={(e) => setOrientation(e.target.value as typeof orientation)}>
        <option value="landscape">Paisagem (padrão)</option><option value="portrait">Retrato</option>
      </select>
    </label>
    <label className="mt-3 block text-[12px] font-bold">Papel
      <select className={`mt-1 h-10 w-full rounded-lg border border-[#E5E7EB] px-3 ${focusRing}`} value={format} onChange={(e) => setFormat(e.target.value as PdfPaperFormat)}>
        {PDF_PAPER_FORMATS.map((f) => <option key={f} value={f}>{PDF_PAPER_FORMAT_LABELS[f]}</option>)}
      </select>
    </label>
  </Modal>;
}
