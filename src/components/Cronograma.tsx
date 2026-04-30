import React, { useMemo, useState } from 'react';
import { CalendarDays, ChevronDown, Filter } from 'lucide-react';

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
  return normalized > 0 && normalized <= 1 ? Math.round(normalized * 100) : Math.round(normalized);
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function diffDays(start: Date, end: Date) {
  return Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000));
}

function findParentCode(code: string, candidates: string[]) {
  let best = '';
  candidates.forEach((candidate) => {
    if ((code === candidate || code.startsWith(`${candidate}.`)) && candidate.length > best.length) {
      best = candidate;
    }
  });
  return best;
}

function buildContractOptions(rows: CronogramaRow[], preloadedData?: CronogramaProps['preloadedData']) {
  const fromRegistro = Array.isArray(preloadedData?.registro?.contracts) ? preloadedData!.registro!.contracts! : [];
  if (fromRegistro.length) return fromRegistro.map((item) => ({ code: item.codigo, name: item.nome }));

  return rows
    .filter((row) => dotCount(normalizeText(row.code)) === 0)
    .map((row) => ({ code: normalizeText(row.code), name: normalizeText(row.name || row.code) }))
    .filter((item) => item.code);
}

function buildOsOptions(rows: CronogramaRow[], contractCodes: string[], preloadedData?: CronogramaProps['preloadedData']) {
  const fromRegistro = Array.isArray(preloadedData?.registro?.osOptions) ? preloadedData!.registro!.osOptions! : [];
  if (fromRegistro.length) {
    return fromRegistro.map((item) => ({ code: item.codigo, name: item.nome, contractCode: item.contratoCodigo }));
  }

  return rows
    .map((row) => {
      const code = normalizeText(row.code);
      const name = normalizeText(row.name || row.code);
      const contractCode = findParentCode(code, contractCodes);
      return { code, name, contractCode };
    })
    .filter((item) => item.code && item.contractCode && /(^|[^A-Za-z0-9])_?OS/i.test(item.name));
}

export default function Cronograma({ preloadedData, lockedContractCode }: CronogramaProps) {
  const rows = useMemo(
    () => Array.isArray(preloadedData?.cronograma) ? preloadedData!.cronograma!.filter((row) => normalizeText(row.code) && normalizeText(row.name)) : [],
    [preloadedData?.cronograma]
  );

  const contracts = useMemo(() => buildContractOptions(rows, preloadedData), [rows, preloadedData]);
  const osOptions = useMemo(() => buildOsOptions(rows, contracts.map((item) => item.code), preloadedData), [rows, contracts, preloadedData]);

  const [contractFilter, setContractFilter] = useState('Todos');
  const [osFilter, setOsFilter] = useState('Todas');

  React.useEffect(() => {
    const locked = normalizeText(lockedContractCode);
    if (!locked) return;
    setContractFilter(locked);
    setOsFilter('Todas');
  }, [lockedContractCode]);

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      const code = normalizeText(row.code);
      const matchContract = contractFilter === 'Todos' || code === contractFilter || code.startsWith(`${contractFilter}.`);
      const matchOs = osFilter === 'Todas' || code === osFilter || code.startsWith(`${osFilter}.`);
      return matchContract && matchOs;
    });
  }, [rows, contractFilter, osFilter]);

  const dateRange = useMemo(() => {
    const dates = filteredRows
      .flatMap((row) => [parseDate(row.plannedStart), parseDate(row.plannedEnd)])
      .filter((date): date is Date => Boolean(date && !Number.isNaN(date.getTime())));

    if (!dates.length) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      return { start: today, end: addDays(today, 30) };
    }

    const start = new Date(Math.min(...dates.map((date) => date.getTime())));
    const end = new Date(Math.max(...dates.map((date) => date.getTime())));
    return { start, end: addDays(end, 1) };
  }, [filteredRows]);

  const totalDays = diffDays(dateRange.start, dateRange.end);

  return (
    <div className="w-full animate-in fade-in duration-500 space-y-6">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <CalendarDays size={22} className="text-[#F05D28]" />
          <h1 className="text-[20px] font-bold text-[#2D2D2D]">Cronograma de Engenharia</h1>
        </div>
        <p className="text-[13px] text-[#757575]">
          Dados publicados pela EAP unificada. Coluna D define a hierarquia e colunas G/H definem o periodo planejado.
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
                onChange={(event) => { setContractFilter(event.target.value); setOsFilter('Todas'); }}
                className="w-full h-11 px-4 bg-white border border-[#E5E7EB] rounded-xl text-[14px] font-medium text-[#2D2D2D] appearance-none focus:border-[#F05D28] focus:ring-2 focus:ring-[#F05D28]/20 outline-none"
              >
                {!normalizeText(lockedContractCode) && <option value="Todos">Todos</option>}
                {contracts.map((contract) => (
                  <option key={contract.code} value={contract.code}>{contract.code} - {contract.name}</option>
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
                    <option key={os.code} value={os.code}>{os.code} - {os.name}</option>
                  ))}
              </select>
              <ChevronDown size={18} className="absolute right-4 top-1/2 -translate-y-1/2 text-[#757575] pointer-events-none" />
            </div>
          </div>

          <div className="h-11 px-4 rounded-xl bg-[#F9FAFB] border border-[#E5E7EB] flex items-center gap-2 text-[13px] font-bold text-[#2D2D2D]">
            <Filter size={16} className="text-[#F05D28]" />
            {filteredRows.length} item(ns)
          </div>
        </div>
      </section>

      <section className="bg-white border border-[#E5E7EB] rounded-2xl shadow-sm overflow-hidden">
        <div className="grid grid-cols-[minmax(260px,360px)_1fr] border-b border-[#E5E7EB] bg-[#F9FAFB] text-[11px] font-bold uppercase tracking-[1px] text-[#757575]">
          <div className="px-5 py-3 border-r border-[#E5E7EB]">Atividade</div>
          <div className="px-5 py-3">
            {formatDateBR(dateRange.start.toISOString().slice(0, 10))} ate {formatDateBR(dateRange.end.toISOString().slice(0, 10))}
          </div>
        </div>

        <div className="max-h-[640px] overflow-auto">
          {filteredRows.length === 0 && (
            <div className="p-8 text-[13px] text-[#757575]">Nenhum cronograma publicado no JSON ainda.</div>
          )}

          {filteredRows.map((row) => {
            const code = normalizeText(row.code);
            const plannedStart = parseDate(row.plannedStart);
            const plannedEnd = parseDate(row.plannedEnd);
            const level = Math.min(dotCount(code), 4);
            const progress = Math.max(0, Math.min(100, toPercent(row.progress)));
            const left = plannedStart ? Math.max(0, diffDays(dateRange.start, plannedStart) / totalDays * 100) : 0;
            const width = plannedStart && plannedEnd ? Math.max(2, diffDays(plannedStart, plannedEnd) / totalDays * 100) : 2;

            return (
              <div key={code} className="grid grid-cols-[minmax(260px,360px)_1fr] border-b border-[#F3F4F6] last:border-b-0 min-h-[58px]">
                <div className="px-5 py-3 border-r border-[#F3F4F6] min-w-0" style={{ paddingLeft: 20 + level * 18 }}>
                  <p className="text-[13px] font-bold text-[#2D2D2D] truncate">{code} - {normalizeText(row.name)}</p>
                  <p className="text-[11px] text-[#757575] mt-1">
                    {formatDateBR(row.plannedStart)} a {formatDateBR(row.plannedEnd)} · {progress}%
                  </p>
                </div>

                <div className="relative px-5 py-4 min-w-[640px]">
                  <div className="absolute inset-x-5 top-1/2 h-2 -translate-y-1/2 rounded-full bg-[#F3F4F6]" />
                  <div
                    className="absolute top-1/2 h-5 -translate-y-1/2 rounded-full bg-[#F05D28]/25 border border-[#F05D28]/30 overflow-hidden"
                    style={{ left: `calc(1.25rem + ${left}%)`, width: `${Math.min(width, 100 - left)}%` }}
                    title={`${code} - ${progress}%`}
                  >
                    <div className="h-full bg-[#F05D28]" style={{ width: `${progress}%` }} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
