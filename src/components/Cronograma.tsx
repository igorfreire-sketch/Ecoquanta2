import React, { useEffect, useMemo, useState } from 'react';
import { CalendarDays, ChevronDown, ChevronRight, Filter } from 'lucide-react';

interface CronogramaRow {
  code?: string;
  name?: string;
  progress?: number;
  duration?: number;
  plannedStart?: string;
  plannedEnd?: string;
  predecessor?: string;
  idealProgress?: number;
  realStart?: string;
  realEnd?: string;
  baselineIdealProgress?: number;
}

interface CronogramaProps {
  lockedContractCode?: string;
  preloadedData?: {
    cronograma?: CronogramaRow[];
    registro?: {
      contracts?: Array<{ codigo: string; nome: string }>;
      osOptions?: Array<{ codigo: string; nome: string; contratoCodigo: string }>;
    };
  };
}

interface TreeNode {
  code: string;
  name: string;
  row: CronogramaRow;
  children: TreeNode[];
}

function normalizeText(value: any) {
  return String(value || '').trim();
}

function dotCount(code: string) {
  return (code.match(/\./g) || []).length;
}

function parseDate(value?: string) {
  const raw = normalizeText(value);
  if (!raw) return null;

  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));

  const br = raw.match(/^(\d{2})[\/\-.](\d{2})[\/\-.](\d{4})/);
  if (br) return new Date(Number(br[3]), Number(br[2]) - 1, Number(br[1]));

  return null;
}

function formatDateBR(value?: string) {
  const date = parseDate(value);
  if (!date || Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('pt-BR');
}

function toPercent(value: any) {
  const raw = typeof value === 'number'
    ? value
    : Number(String(value || 0).replace(/\./g, '').replace(',', '.'));
  const normalized = Number.isNaN(raw) ? 0 : raw;
  const percent = normalized > 0 && normalized <= 1 ? normalized * 100 : normalized;
  return Math.max(0, Math.min(100, Math.round(percent)));
}

function compareHierarchy(a: string, b: string) {
  const aParts = a.split('.').map((item) => Number(item.replace(/\D/g, '')) || 0);
  const bParts = b.split('.').map((item) => Number(item.replace(/\D/g, '')) || 0);
  const maxLength = Math.max(aParts.length, bParts.length);

  for (let index = 0; index < maxLength; index += 1) {
    const diff = (aParts[index] || 0) - (bParts[index] || 0);
    if (diff !== 0) return diff;
  }

  return a.localeCompare(b, 'pt-BR');
}

function getParentCode(code: string) {
  const parts = code.split('.');
  if (parts.length <= 1) return '';
  parts.pop();
  return parts.join('.');
}

function buildContractOptions(rows: CronogramaRow[], preloadedData?: CronogramaProps['preloadedData']) {
  const fromRegistro = Array.isArray(preloadedData?.registro?.contracts) ? preloadedData.registro.contracts : [];
  if (fromRegistro.length) return fromRegistro.map((item) => ({ code: item.codigo, name: item.nome }));

  return rows
    .filter((row) => dotCount(normalizeText(row.code)) === 0)
    .map((row) => ({ code: normalizeText(row.code), name: normalizeText(row.name || row.code) }))
    .filter((item) => item.code);
}

function buildOsOptions(rows: CronogramaRow[], preloadedData?: CronogramaProps['preloadedData']) {
  const fromRegistro = Array.isArray(preloadedData?.registro?.osOptions) ? preloadedData.registro.osOptions : [];
  if (fromRegistro.length) {
    return fromRegistro.map((item) => ({ code: item.codigo, name: item.nome, contractCode: item.contratoCodigo }));
  }

  return rows
    .filter((row) => dotCount(normalizeText(row.code)) === 1)
    .map((row) => {
      const code = normalizeText(row.code);
      return {
        code,
        name: normalizeText(row.name || row.code),
        contractCode: getParentCode(code),
      };
    })
    .filter((item) => item.code && item.contractCode);
}

function buildTree(rows: CronogramaRow[], contractFilter: string, osFilter: string) {
  const rowMap = new Map<string, CronogramaRow>();
  rows.forEach((row) => {
    const code = normalizeText(row.code);
    const name = normalizeText(row.name);
    if (code && name) rowMap.set(code, row);
  });

  const selectedCodes = Array.from(rowMap.keys()).filter((code) => {
    if (osFilter !== 'Todas') return code === osFilter || code.startsWith(`${osFilter}.`);
    if (contractFilter !== 'Todos') return code === contractFilter || code.startsWith(`${contractFilter}.`);
    return true;
  });

  const selectedSet = new Set(selectedCodes);
  const childrenMap = new Map<string, string[]>();

  selectedCodes.forEach((code) => {
    const parentCode = getParentCode(code);
    if (!selectedSet.has(parentCode)) return;
    const bucket = childrenMap.get(parentCode) || [];
    bucket.push(code);
    childrenMap.set(parentCode, bucket);
  });

  childrenMap.forEach((children, parentCode) => {
    children.sort(compareHierarchy);
    childrenMap.set(parentCode, children);
  });

  const buildNode = (code: string): TreeNode => {
    const row = rowMap.get(code)!;
    const childCodes = childrenMap.get(code) || [];
    return {
      code,
      name: normalizeText(row.name || row.code),
      row,
      children: childCodes.map(buildNode),
    };
  };

  const rootCodes = selectedCodes
    .filter((code) => !selectedSet.has(getParentCode(code)))
    .sort(compareHierarchy);

  return rootCodes.map(buildNode);
}

function flattenCodes(nodes: TreeNode[]): string[] {
  return nodes.flatMap((node) => [node.code, ...flattenCodes(node.children)]);
}

function ProgressBar({ progress }: { progress: number }) {
  return (
    <div className="flex items-center gap-3">
      <div className="h-2.5 flex-1 min-w-[160px] rounded-full bg-[#EEF2F7] overflow-hidden">
        <div className="h-full rounded-full bg-[#F05D28] transition-all duration-300" style={{ width: `${progress}%` }} />
      </div>
      <span className="w-12 text-right text-[12px] font-bold text-[#2D2D2D]">{progress}%</span>
    </div>
  );
}

interface TreeRowProps {
  node: TreeNode;
  level: number;
  expandedRows: Set<string>;
  onToggle: (code: string) => void;
}

function TreeRow({
  node,
  level,
  expandedRows,
  onToggle,
}: TreeRowProps) {
  const hasChildren = node.children.length > 0;
  const expanded = expandedRows.has(node.code);
  const progress = toPercent(node.row.progress);
  const predecessor = normalizeText(node.row.predecessor);

  return (
    <>
      <div className="border-b border-[#F3F4F6] last:border-b-0">
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.3fr)_minmax(260px,0.7fr)] gap-4 px-5 py-4">
          <div className="min-w-0">
            <button
              type="button"
              onClick={() => hasChildren && onToggle(node.code)}
              className={`flex w-full items-start gap-3 text-left ${hasChildren ? 'cursor-pointer' : 'cursor-default'}`}
              style={{ paddingLeft: `${level * 18}px` }}
            >
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center text-[#757575]">
                {hasChildren ? (expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />) : <span className="h-2 w-2 rounded-full bg-[#D1D5DB]" />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-bold text-[#2D2D2D]">
                  {node.code} - {node.name}
                </p>
                <p className="mt-1 text-[11px] text-[#757575]">
                  {formatDateBR(node.row.plannedStart)} a {formatDateBR(node.row.plannedEnd)}
                </p>
                {predecessor && (
                  <p className="mt-1 text-[10px] text-[#94A3B8]">
                    Predecessora: {predecessor}
                  </p>
                )}
              </div>
            </button>
          </div>

          <div className="flex flex-col justify-center gap-2">
            <ProgressBar progress={progress} />
          </div>
        </div>
      </div>

      {hasChildren && expanded && node.children.map((child) => (
        <React.Fragment key={child.code}>
          <TreeRow
            node={child}
            level={level + 1}
            expandedRows={expandedRows}
            onToggle={onToggle}
          />
        </React.Fragment>
      ))}
    </>
  );
}

export default function Cronograma({ preloadedData, lockedContractCode }: CronogramaProps) {
  const rows = useMemo(
    () => Array.isArray(preloadedData?.cronograma)
      ? preloadedData.cronograma.filter((row) => normalizeText(row.code) && normalizeText(row.name))
      : [],
    [preloadedData?.cronograma],
  );

  const contracts = useMemo(() => buildContractOptions(rows, preloadedData), [rows, preloadedData]);
  const osOptions = useMemo(() => buildOsOptions(rows, preloadedData), [rows, preloadedData]);

  const [contractFilter, setContractFilter] = useState('Todos');
  const [osFilter, setOsFilter] = useState('Todas');

  useEffect(() => {
    const locked = normalizeText(lockedContractCode);
    if (!locked) return;
    setContractFilter(locked);
    setOsFilter('Todas');
  }, [lockedContractCode]);

  const tree = useMemo(
    () => buildTree(rows, contractFilter, osFilter),
    [rows, contractFilter, osFilter],
  );

  const visibleCodes = useMemo(() => flattenCodes(tree), [tree]);
  const expandedDefaults = useMemo(() => new Set(tree.map((node) => node.code)), [tree]);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  useEffect(() => {
    setExpandedRows(expandedDefaults);
  }, [expandedDefaults]);

  const toggleRow = (code: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  };

  const dateSummary = useMemo(() => {
    const dates = rows
      .flatMap((row) => [parseDate(row.plannedStart), parseDate(row.plannedEnd)])
      .filter((date): date is Date => Boolean(date && !Number.isNaN(date.getTime())));

    if (!dates.length) return '-';

    const start = new Date(Math.min(...dates.map((date) => date.getTime())));
    const end = new Date(Math.max(...dates.map((date) => date.getTime())));
    return `${start.toLocaleDateString('pt-BR')} ate ${end.toLocaleDateString('pt-BR')}`;
  }, [rows]);

  return (
    <div className="w-full animate-in fade-in duration-500 space-y-6">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <CalendarDays size={22} className="text-[#F05D28]" />
          <h1 className="text-[20px] font-bold text-[#2D2D2D]">Cronograma de Engenharia</h1>
        </div>
        <p className="text-[13px] text-[#757575]">
          Visual em cascata com expansao por nivel. O cronograma agora mostra somente a hierarquia e as barras de progresso.
        </p>
      </div>

      <section className="bg-white border border-[#E5E7EB] rounded-2xl shadow-sm p-5">
        <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-4 items-end">
          <div>
            <label className="text-[11px] font-medium text-[#757575] uppercase tracking-[1px]">Contrato</label>
            <div className="relative mt-1.5">
              <select
                value={contractFilter}
                disabled={Boolean(normalizeText(lockedContractCode))}
                onChange={(event) => {
                  setContractFilter(event.target.value);
                  setOsFilter('Todas');
                }}
                className="w-full h-11 px-4 bg-white border border-[#E5E7EB] rounded-xl text-[14px] font-medium text-[#2D2D2D] appearance-none focus:border-[#F05D28] focus:ring-2 focus:ring-[#F05D28]/20 outline-none"
              >
                {!normalizeText(lockedContractCode) && <option value="Todos">Todos</option>}
                {contracts.map((contract) => (
                  <option key={contract.code} value={contract.code}>
                    {contract.code} - {contract.name}
                  </option>
                ))}
              </select>
              <ChevronDown size={18} className="absolute right-4 top-1/2 -translate-y-1/2 text-[#757575] pointer-events-none" />
            </div>
          </div>

          <div>
            <label className="text-[11px] font-medium text-[#757575] uppercase tracking-[1px]">OS</label>
            <div className="relative mt-1.5">
              <select
                value={osFilter}
                onChange={(event) => setOsFilter(event.target.value)}
                className="w-full h-11 px-4 bg-white border border-[#E5E7EB] rounded-xl text-[14px] font-medium text-[#2D2D2D] appearance-none focus:border-[#F05D28] focus:ring-2 focus:ring-[#F05D28]/20 outline-none"
              >
                <option value="Todas">Todas</option>
                {osOptions
                  .filter((os) => contractFilter === 'Todos' || os.contractCode === contractFilter)
                  .map((os) => (
                    <option key={os.code} value={os.code}>
                      {os.code} - {os.name}
                    </option>
                  ))}
              </select>
              <ChevronDown size={18} className="absolute right-4 top-1/2 -translate-y-1/2 text-[#757575] pointer-events-none" />
            </div>
          </div>

          <div className="h-11 px-4 rounded-xl bg-[#F9FAFB] border border-[#E5E7EB] flex items-center gap-2 text-[13px] font-bold text-[#2D2D2D]">
            <Filter size={16} className="text-[#F05D28]" />
            {visibleCodes.length} item(ns)
          </div>
        </div>
      </section>

      <section className="bg-white border border-[#E5E7EB] rounded-2xl shadow-sm overflow-hidden">
        <div className="flex items-center justify-between gap-4 border-b border-[#E5E7EB] bg-[#F9FAFB] px-5 py-3">
          <p className="text-[11px] font-bold uppercase tracking-[1px] text-[#757575]">Atividades em cascata</p>
          <p className="text-[11px] font-bold uppercase tracking-[1px] text-[#757575]">{dateSummary}</p>
        </div>

        <div className="max-h-[680px] overflow-auto">
          {tree.length === 0 ? (
            <div className="p-8 text-[13px] text-[#757575]">Nenhum cronograma publicado no Firebase ainda.</div>
          ) : (
            tree.map((node) => (
              <React.Fragment key={node.code}>
                <TreeRow
                  node={node}
                  level={0}
                  expandedRows={expandedRows}
                  onToggle={toggleRow}
                />
              </React.Fragment>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
