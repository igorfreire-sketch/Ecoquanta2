import React, {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Check, ChevronDown, Search } from 'lucide-react';

export interface SearchableSelectProps {
  value: string;
  onChange: (event: { target: { value: string } }) => void;
  children: React.ReactNode;
  className?: string;
  disabled?: boolean;
  id?: string;
  name?: string;
  title?: string;
  style?: React.CSSProperties;
  searchPlaceholder?: string;
  'aria-label'?: string;
}

interface ParsedOption {
  value: string;
  label: string;
  disabled: boolean;
}

function normalizeText(value: string) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

// Extrai o texto de qualquer conteudo de <option> (string, numero ou aninhado).
function extractText(node: React.ReactNode): string {
  if (node === null || node === undefined || node === false || node === true) return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(extractText).join('');
  if (React.isValidElement(node)) return extractText((node.props as any)?.children);
  return '';
}

// Coleta as <option> a partir dos filhos (suporta Fragments e arrays).
function collectOptions(children: React.ReactNode, acc: ParsedOption[]) {
  React.Children.forEach(children, (child) => {
    if (!React.isValidElement(child)) return;
    if (child.type === React.Fragment) {
      collectOptions((child.props as any)?.children, acc);
      return;
    }
    if (child.type === 'option') {
      const props = child.props as any;
      const label = extractText(props?.children);
      const value = props?.value !== undefined ? String(props.value) : label;
      acc.push({ value, label, disabled: Boolean(props?.disabled) });
    }
  });
}

export default function SearchableSelect({
  value,
  onChange,
  children,
  className,
  disabled,
  id,
  name,
  title,
  style,
  searchPlaceholder = 'Pesquisar...',
  'aria-label': ariaLabel,
}: SearchableSelectProps) {
  const options = useMemo(() => {
    const acc: ParsedOption[] = [];
    collectOptions(children, acc);
    return acc;
  }, [children]);

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState(0);
  const [openUpward, setOpenUpward] = useState(false);

  const wrapperRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const reactId = useId();
  const listboxId = `${id || name || 'ss'}-${reactId}-listbox`;

  const selected = options.find((option) => option.value === String(value ?? ''));
  const selectedLabel = selected ? selected.label : '';

  const filtered = useMemo(() => {
    const normalizedQuery = normalizeText(query);
    if (!normalizedQuery) return options;
    return options.filter((option) => normalizeText(option.label).includes(normalizedQuery));
  }, [options, query]);

  const close = useCallback(() => {
    setOpen(false);
    setQuery('');
  }, []);

  const commit = useCallback(
    (option: ParsedOption) => {
      if (option.disabled) return;
      if (option.value !== String(value ?? '')) {
        onChange({ target: { value: option.value } });
      }
      close();
    },
    [close, onChange, value],
  );

  // Fecha ao clicar fora.
  useEffect(() => {
    if (!open) return;
    const handlePointer = (event: MouseEvent | TouchEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        close();
      }
    };
    document.addEventListener('mousedown', handlePointer);
    document.addEventListener('touchstart', handlePointer);
    return () => {
      document.removeEventListener('mousedown', handlePointer);
      document.removeEventListener('touchstart', handlePointer);
    };
  }, [open, close]);

  // Ao abrir: foca a busca, posiciona o destaque no item selecionado e decide a direcao.
  useLayoutEffect(() => {
    if (!open) return;
    const selectedIndex = filtered.findIndex((option) => option.value === String(value ?? ''));
    setHighlight(selectedIndex >= 0 ? selectedIndex : 0);
    if (wrapperRef.current) {
      const rect = wrapperRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      setOpenUpward(spaceBelow < 280 && rect.top > spaceBelow);
    }
    const raf = requestAnimationFrame(() => searchRef.current?.focus());
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Mantem o item destacado visivel.
  useEffect(() => {
    if (!open || !listRef.current) return;
    const node = listRef.current.querySelector<HTMLElement>(`[data-index="${highlight}"]`);
    node?.scrollIntoView({ block: 'nearest' });
  }, [highlight, open]);

  const handleTriggerKeyDown = (event: React.KeyboardEvent) => {
    if (disabled) return;
    if (!open && (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault();
      setOpen(true);
    }
  };

  const handleSearchKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setHighlight((prev) => Math.min(prev + 1, filtered.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHighlight((prev) => Math.max(prev - 1, 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const option = filtered[highlight];
      if (option) commit(option);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      close();
    }
  };

  return (
    <div ref={wrapperRef} className="relative" style={style}>
      <button
        type="button"
        id={id}
        title={title}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => !disabled && setOpen((prev) => !prev)}
        onKeyDown={handleTriggerKeyDown}
        className={className}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, textAlign: 'left' }}
      >
        <span
          style={{
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            color: selectedLabel ? undefined : '#9CA3AF',
          }}
        >
          {selectedLabel || searchPlaceholder}
        </span>
        <ChevronDown size={16} style={{ flexShrink: 0, opacity: 0.6 }} aria-hidden />
      </button>

      {open && (
        <div
          className="absolute z-50 left-0 right-0 rounded-xl border border-[#E5E7EB] bg-white shadow-lg"
          style={openUpward ? { bottom: 'calc(100% + 4px)' } : { top: 'calc(100% + 4px)' }}
        >
          <div className="flex items-center gap-2 border-b border-[#F1F5F9] px-3 py-2">
            <Search size={14} style={{ flexShrink: 0, opacity: 0.5 }} aria-hidden />
            <input
              ref={searchRef}
              type="text"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setHighlight(0);
              }}
              onKeyDown={handleSearchKeyDown}
              placeholder={searchPlaceholder}
              className="w-full bg-transparent text-[13px] text-[#2D2D2D] outline-none placeholder:text-[#9CA3AF]"
            />
          </div>
          <ul
            ref={listRef}
            id={listboxId}
            role="listbox"
            className="max-h-60 overflow-auto py-1"
          >
            {filtered.length === 0 ? (
              <li className="px-3 py-2 text-[13px] text-[#9CA3AF]">Nenhuma opção encontrada</li>
            ) : (
              filtered.map((option, index) => {
                const isSelected = option.value === String(value ?? '');
                const isActive = index === highlight;
                return (
                  <li
                    key={`${option.value}-${index}`}
                    data-index={index}
                    role="option"
                    aria-selected={isSelected}
                    onMouseEnter={() => setHighlight(index)}
                    onMouseDown={(event) => {
                      event.preventDefault();
                      commit(option);
                    }}
                    className={`flex cursor-pointer items-center justify-between gap-2 px-3 py-2 text-[13px] ${
                      option.disabled
                        ? 'cursor-not-allowed text-[#CBD5E1]'
                        : isActive
                          ? 'bg-[#FFF3EC] text-[#2D2D2D]'
                          : 'text-[#2D2D2D]'
                    }`}
                  >
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {option.label || ' '}
                    </span>
                    {isSelected && <Check size={14} style={{ flexShrink: 0, color: '#F05D28' }} aria-hidden />}
                  </li>
                );
              })
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
