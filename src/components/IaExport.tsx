import React from 'react';
import { Copy, Download, X } from 'lucide-react';
import { buildAiMarkdown } from '../lib/aiExport';
import type { AnnotationSheet } from './CoordenacaoEngenharia/Anotacoes';
import type { FeedbackReport } from '../types/feedbackReport';

interface IaExportProps {
  notes: AnnotationSheet[];
  reports: FeedbackReport[];
  onClose: () => void;
}

// Tela fullscreen com o Markdown cru (nao renderizado) pra uma IA local ler direto no navegador.
// Sem chamada de rede: os dados ja estao em memoria no App (notes, feedbackReports).
export default function IaExport({ notes, reports, onClose }: IaExportProps) {
  const markdown = React.useMemo(() => buildAiMarkdown(notes, reports), [notes, reports]);
  const [copiado, setCopiado] = React.useState(false);

  const copiar = async () => {
    await navigator.clipboard.writeText(markdown);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  };

  const baixar = () => {
    const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'ecoquanta-ia.md';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-[200] flex flex-col overflow-hidden bg-white font-['Montserrat']">
      <div className="flex items-center justify-between gap-3 border-b border-[#E5E7EB] px-6 py-4">
        <h1 className="text-[15px] font-black text-[#2D2D2D]">Link para IA</h1>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={copiar}
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#E5E7EB] bg-white px-4 text-[13px] font-bold text-[#2D2D2D] transition-colors hover:border-[#F7C7B7] hover:text-[#F05D28] cursor-pointer"
          >
            <Copy size={15} />
            {copiado ? 'Copiado!' : 'Copiar'}
          </button>
          <button
            type="button"
            onClick={baixar}
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#E5E7EB] bg-white px-4 text-[13px] font-bold text-[#2D2D2D] transition-colors hover:border-[#F7C7B7] hover:text-[#F05D28] cursor-pointer"
          >
            <Download size={15} />
            Baixar .md
          </button>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#F05D28] px-4 text-[13px] font-bold text-white transition-colors hover:bg-[#D94E1F] cursor-pointer"
          >
            <X size={15} />
            Fechar
          </button>
        </div>
      </div>
      <pre
        data-ia-export
        className="flex-1 overflow-auto whitespace-pre-wrap break-words px-6 py-4 font-mono text-[12px] leading-relaxed text-[#2D2D2D] selection:bg-[#F05D28]/20"
      >
        {markdown}
      </pre>
    </div>
  );
}
