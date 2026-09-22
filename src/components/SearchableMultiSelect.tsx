import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CheckSquare, ChevronDown, Square } from 'lucide-react';

export interface SearchableMultiSelectProps {
  value: string[];
  onChange: (next: string[]) => void;
  options: string[];
  getOptionLabel?: (option: string) => string;
  placeholder?: string;
  className?: string;
  emptyMessage?: string;
  disabled?: boolean;
}

export function getMultiSelectPlacement(
  rect: { left: number; top: number; bottom: number; width: number },
  viewport: { width: number; height: number },
) {
  const gutter = 12;
  const panelWidth = Math.max(rect.width, 260);
  const left = Math.min(Math.max(gutter, rect.left), Math.max(gutter, viewport.width - panelWidth - gutter));
  const spaceBelow = viewport.height - rect.bottom;
  const openUpward = spaceBelow < 320 && rect.top > spaceBelow;
  return {
    left,
    width: Math.min(panelWidth, viewport.width - gutter * 2),
    openUpward,
    top: rect.bottom + 6,
    bottom: viewport.height - rect.top + 6,
  };
}

function normalizeText(value: string) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

// Multi-select com filtro por digitacao (mesma logica da Ordem de Servico da Curva S):
// clique no campo, comece a digitar e a lista filtra; "TODAS VISIVEIS" marca tudo que
// estiver aparecendo no filtro atual.
export default function SearchableMultiSelect({
  value,
  onChange,
  options,
  getOptionLabel,
  placeholder = 'Selecionar...',
  className,
  emptyMessage = 'Nenhuma opção encontrada.',
  disabled,
}: SearchableMultiSelectProps) {
  const selected = Array.isArray(value) ? value : [];
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const wrapperRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [placement, setPlacement] = useState({ left: 0, width: 260, top: 0, bottom: 0, openUpward: false });

  const labelOf = useCallback(
    (option: string) => (getOptionLabel ? getOptionLabel(option) : option),
    [getOptionLabel],
  );

  const filtered = useMemo(() => {
    const query = normalizeText(search);
    if (!query) return options;
    return options.filter((option) => normalizeText(labelOf(option)).includes(query));
  }, [options, search, labelOf]);

  const allFilteredSelected = filtered.length > 0 && filtered.every((option) => selected.includes(option));

  const close = useCallback(() => {
    setOpen(false);
    setSearch('');
  }, []);

  useEffect(() => {
    if (!open) return;
    const handlePointer = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node;
      if (!wrapperRef.current?.contains(target) && !panelRef.current?.contains(target)) close();
    };
    document.addEventListener('mousedown', handlePointer);
    document.addEventListener('touchstart', handlePointer);
    return () => {
      document.removeEventListener('mousedown', handlePointer);
      document.removeEventListener('touchstart', handlePointer);
    };
  }, [open, close]);

  useLayoutEffect(() => {
    if (!open) return;
    const measure = () => {
      const rect = wrapperRef.current?.getBoundingClientRect();
      if (!rect) return;
      setPlacement(getMultiSelectPlacement(rect, { width: window.innerWidth, height: window.innerHeight }));
    };
    measure();
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [open]);

  const toggleOption = (option: string) => {
    onChange(selected.includes(option) ? selected.filter((item) => item !== option) : [...selected, option]);
  };

  const toggleFiltered = () => {
    if (allFilteredSelected) {
      const filteredSet = new Set(filtered);
      onChange(selected.filter((item) => !filteredSet.has(item)));
    } else {
      const merged = new Set(selected);
      filtered.forEach((option) => merged.add(option));
      onChange(Array.from(merged));
    }
  };

  const summary = selected.length === 0
    ? placeholder
    : selected.length === options.length && options.length > 0
      ? 'Todas selecionadas'
      : `${selected.length} selecionada(s)`;

  return (
    <div ref={wrapperRef} className="relative">
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={search}
          disabled={disabled}
          onFocus={() => setOpen(true)}
          onChange={(event) => { setSearch(event.target.value); setOpen(true); }}
          placeholder={summary}
          className={className}
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
          style={{ paddingRight: 36 }}
        />
        <button
          type="button"
          tabIndex={-1}
          disabled={disabled}
          onClick={() => { if (!disabled) { setOpen((prev) => !prev); inputRef.current?.focus(); } }}
          className="absolute inset-y-0 right-0 flex items-center px-3 text-[#757575]"
          aria-label={open ? 'Fechar lista' : 'Abrir lista'}
        >
          <ChevronDown size={16} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {open && createPortal(
        <div
          ref={panelRef}
          className="fixed z-[600] max-h-[300px] overflow-y-auto rounded-xl border border-[#E5E7EB] bg-white p-2 shadow-[0_22px_50px_-18px_rgba(15,23,42,.38)]"
          style={{
            left: placement.left,
            width: placement.width,
            ...(placement.openUpward ? { bottom: placement.bottom } : { top: placement.top }),
          }}
        >
          {options.length === 0 ? (
            <p className="px-3 py-2 text-center text-[12px] text-[#9CA3AF]">{emptyMessage}</p>
          ) : filtered.length === 0 ? (
            <p className="px-3 py-2 text-center text-[12px] text-[#9CA3AF]">{emptyMessage}</p>
          ) : (
            <>
              <button
                type="button"
                onClick={toggleFiltered}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-[12px] font-bold text-[#F05D28] hover:bg-[#FFF3EC]"
              >
                {allFilteredSelected ? <CheckSquare size={16} /> : <Square size={16} />}
                {search ? 'TODAS VISÍVEIS' : 'TODAS'}
              </button>
              {filtered.map((option) => {
                const checked = selected.includes(option);
                return (
                  <button
                    type="button"
                    key={option}
                    onClick={() => toggleOption(option)}
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[12px] text-[#2D2D2D] hover:bg-[#F9FAFB]"
                  >
                    {checked
                      ? <CheckSquare size={16} className="shrink-0 text-[#F05D28]" />
                      : <Square size={16} className="shrink-0 text-[#CBD5E1]" />}
                    <span className="min-w-0 flex-1 truncate">{labelOf(option)}</span>
                  </button>
                );
              })}
            </>
          )}
        </div>,
        document.body,
      )}
    </div>
  );
}
