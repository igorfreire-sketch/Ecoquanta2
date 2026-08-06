import { useState } from 'react';
import { createPortal } from 'react-dom';

export interface CampoDialogField {
  id: string;
  label: string;
  placeholder?: string;
  valorInicial?: string;
}

interface CampoDialogProps {
  title: string;
  fields: CampoDialogField[];
  onConfirm: (values: Record<string, string>) => void;
  onCancel: () => void;
}

// Dialogo generico de 1+ campos de texto, pra substituir `window.prompt` (nao dava pra padronizar
// visual/Enter-Escape num prompt nativo). Portal pro <body> obrigatorio: um ancestral com
// framer-motion envolve a pagina e quebra `position:fixed` se o dialogo ficar aninhado nela -
// mesma armadilha ja resolvida no menu de cor/coluna (SolucoesDigitais.tsx).
export default function CampoDialog({ title, fields, onConfirm, onCancel }: CampoDialogProps) {
  const [valores, setValores] = useState<Record<string, string>>(
    () => Object.fromEntries(fields.map((f) => [f.id, f.valorInicial || ''])),
  );

  const confirmar = () => onConfirm(valores);

  return createPortal(
    <div
      className="fixed inset-0 z-[220] flex items-center justify-center bg-slate-950/40 p-4"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <h3 className="mb-3 text-[15px] font-black text-[#2D2D2D]">{title}</h3>
        <div className="flex flex-col gap-3">
          {fields.map((field, index) => (
            <label key={field.id} className="flex flex-col gap-1 text-[12px] font-bold text-[#64748B]">
              {field.label}
              <input
                autoFocus={index === 0}
                value={valores[field.id] ?? ''}
                onChange={(event) => setValores((prev) => ({ ...prev, [field.id]: event.target.value }))}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') confirmar();
                  if (event.key === 'Escape') onCancel();
                }}
                placeholder={field.placeholder}
                className="h-10 rounded-lg border border-[#E5E7EB] bg-white px-3 text-[13px] font-medium text-[#2D2D2D] outline-none focus:border-[#F05D28]"
              />
            </label>
          ))}
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="h-9 rounded-lg border border-[#E5E7EB] bg-white px-3 text-[12px] font-bold text-[#64748B] hover:bg-[#F9FAFB]"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={confirmar}
            className="h-9 rounded-lg bg-[#F05D28] px-4 text-[12px] font-bold text-white hover:bg-[#D94E1F]"
          >
            Confirmar
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
