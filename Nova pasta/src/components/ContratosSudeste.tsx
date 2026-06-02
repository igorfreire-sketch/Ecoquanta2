import React, { useMemo, useState } from 'react';
import { ChevronRight, ChevronDown, CheckCircle2 } from 'lucide-react';

interface EapRow {
  code: string;
  name: string;
  progress?: number;
  plannedStart?: string;
  plannedEnd?: string;
  realStart?: string;
  realEnd?: string;
}

interface ContratosSudesteProps {
  preloadedData?: {
    cronograma?: EapRow[];
    registro?: {
      activitiesList?: any[];
    };
  };
}

interface TreeRow {
  id: string;
  topico: string;
  tarefa: string;
  inicio: string;
  termino: string;
  terminoProg: string;
  prev: number;
  exe: number;
  isExecuting: boolean;
  children?: TreeRow[];
}

function normalizeText(value?: string) {
  return String(value || '').trim();
}

function formatDateBR(value?: string) {
  const raw = normalizeText(value);
  if (!raw) return '-';
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
  return raw;
}

function toPercent(value: any) {
  const n = Number(value || 0);
  if (Number.isNaN(n)) return 0;
  return Math.round((n <= 1 && n > 0 ? n * 100 : n) * 100) / 100;
}

function dotCount(code: string) {
  return (code.match(/\./g) || []).length;
}

function findParentCode(code: string, candidates: string[]) {
  return candidates
    .filter((candidate) => code === candidate || code.startsWith(`${candidate}.`))
    .sort((a, b) => b.length - a.length)[0] || '';
}

function buildActivityIndex(activities: any[]) {
  const map: Record<string, { avanco: number; active: boolean }> = {};

  activities.forEach((activity) => {
    const itemCodigo = normalizeText(activity?.itemCodigo);
    if (!itemCodigo) return;

    const status = normalizeText(activity?.status).toLowerCase();
    const active = status !== 'concluida';
    const avanco = toPercent(activity?.avancoAtual);

    if (!map[itemCodigo]) map[itemCodigo] = { avanco: 0, active: false };
    map[itemCodigo].avanco = Math.max(map[itemCodigo].avanco, avanco);
    map[itemCodigo].active = map[itemCodigo].active || active;
  });

  return map;
}

function aggregateProgress(children: TreeRow[], fallback: number) {
  if (!children.length) return fallback;
  const total = children.reduce((acc, child) => acc + Number(child.exe || 0), 0);
  return Math.round((total / children.length) * 100) / 100;
}

function buildTree(preloadedData?: ContratosSudesteProps['preloadedData']): TreeRow[] {
  const eapRows = Array.isArray(preloadedData?.cronograma) ? preloadedData!.cronograma! : [];
  const activities = Array.isArray(preloadedData?.registro?.activitiesList) ? preloadedData!.registro!.activitiesList! : [];
  const activityIndex = buildActivityIndex(activities);

  const rowsByCode = new Map<string, EapRow>();
  eapRows.forEach((row) => {
    const code = normalizeText(row?.code);
    const name = normalizeText(row?.name);
    if (code && name) rowsByCode.set(code, row);
  });

  const codes = Array.from(rowsByCode.keys());
  const contractCodes = codes.filter((code) => dotCount(code) === 0);
  const osCodes = codes.filter((code) => dotCount(code) === 1);

  return contractCodes.map((contractCode) => {
    const contractRow = rowsByCode.get(contractCode)!;
    const osChildren = osCodes
      .filter((osCode) => osCode.startsWith(`${contractCode}.`))
      .map((osCode) => {
        const osRow = rowsByCode.get(osCode)!;
        const itemChildren = codes
          .filter((code) => dotCount(code) > 1 && findParentCode(code, [osCode]) === osCode)
          .map((itemCode) => {
            const itemRow = rowsByCode.get(itemCode)!;
            const activity = activityIndex[itemCode];
            const exe = activity?.active ? activity.avanco : toPercent(itemRow.progress);

            return {
              id: itemCode,
              topico: itemCode,
              tarefa: itemRow.name,
              inicio: formatDateBR(itemRow.plannedStart),
              termino: formatDateBR(itemRow.plannedEnd),
              terminoProg: formatDateBR(itemRow.realEnd),
              prev: toPercent(itemRow.progress),
              exe,
              isExecuting: Boolean(activity?.active)
            };
          });

        const osExe = aggregateProgress(itemChildren, toPercent(osRow.progress));

        return {
          id: osCode,
          topico: osCode,
          tarefa: osRow.name,
          inicio: formatDateBR(osRow.plannedStart),
          termino: formatDateBR(osRow.plannedEnd),
          terminoProg: formatDateBR(osRow.realEnd),
          prev: toPercent(osRow.progress),
          exe: osExe,
          isExecuting: itemChildren.some((item) => item.isExecuting),
          children: itemChildren
        };
      });

    return {
      id: contractCode,
      topico: contractCode,
      tarefa: contractRow.name,
      inicio: formatDateBR(contractRow.plannedStart),
      termino: formatDateBR(contractRow.plannedEnd),
      terminoProg: formatDateBR(contractRow.realEnd),
      prev: toPercent(contractRow.progress),
      exe: aggregateProgress(osChildren, toPercent(contractRow.progress)),
      isExecuting: osChildren.some((os) => os.isExecuting),
      children: osChildren
    };
  });
}

const ProgressBar = ({ percentage }: { percentage: number }) => {
  if (percentage >= 100) {
    return (
      <div className="flex items-center gap-2 px-3 py-1 bg-[#10B981]/10 border border-[#10B981]/20 rounded-full w-fit">
        <CheckCircle2 size={12} className="text-[#10B981]" />
        <span className="text-[11px] font-bold text-[#10B981] uppercase">Finalizado</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <div className="h-2.5 w-24 bg-[#E5E7EB] rounded-full overflow-hidden">
        <div className="h-full bg-[#F05D28] transition-all duration-500" style={{ width: `${Math.max(0, Math.min(100, percentage))}%` }} />
      </div>
      <span className="text-[12px] font-medium text-[#2D2D2D]">{percentage}%</span>
    </div>
  );
};

function RowMarker({ active }: { active: boolean }) {
  return <span className={`inline-block w-3 h-3 rounded-[3px] ${active ? 'bg-[#EF4444]' : 'bg-transparent border border-transparent'}`} />;
}

export default function ContratosSudeste({ preloadedData }: ContratosSudesteProps) {
  const rows = useMemo(() => buildTree(preloadedData), [preloadedData]);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  const toggleRow = (id: string) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(id)) newExpanded.delete(id);
    else newExpanded.add(id);
    setExpandedRows(newExpanded);
  };

  const renderRow = (row: TreeRow, level = 0) => {
    const hasChildren = Boolean(row.children?.length);

    return (
      <React.Fragment key={row.id}>
        <tr className={`${level === 0 ? 'bg-white' : level === 1 ? 'bg-[#F8F9FA]/70' : 'bg-white'} hover:bg-[#F8F9FA] transition-colors group`}>
          <td className="py-3.5 px-6">
            <button
              onClick={() => hasChildren && toggleRow(row.id)}
              className="flex items-center gap-2 text-[13px] font-bold text-[#2D2D2D] hover:text-[#F05D28] transition-colors"
              style={{ paddingLeft: `${level * 18}px` }}
            >
              {hasChildren ? (expandedRows.has(row.id) ? <ChevronDown size={16} /> : <ChevronRight size={16} />) : <span className="w-4" />}
              <RowMarker active={row.isExecuting} />
              {row.topico}
            </button>
          </td>
          <td className={`py-3.5 px-4 text-[13px] ${level === 0 ? 'font-bold text-[#2D2D2D]' : 'text-[#757575]'}`}>{row.tarefa}</td>
          <td className="py-3.5 px-4 text-[13px] text-[#2D2D2D] whitespace-nowrap">{row.inicio}</td>
          <td className="py-3.5 px-4 text-[13px] text-[#2D2D2D] whitespace-nowrap">{row.termino}</td>
          <td className="py-3.5 px-4 text-[13px] text-[#757575] italic whitespace-nowrap">{row.terminoProg || '-'}</td>
          <td className="py-3.5 px-4 text-[13px] text-[#2D2D2D] text-center font-medium">{row.prev}%</td>
          <td className="py-3.5 px-4 text-[13px] text-[#2D2D2D] text-center font-bold">{row.exe}%</td>
          <td className="py-3.5 px-6">
            <ProgressBar percentage={row.exe} />
          </td>
        </tr>

        {hasChildren && expandedRows.has(row.id) && row.children!.map((child) => renderRow(child, level + 1))}
      </React.Fragment>
    );
  };

  return (
    <div className="w-full animate-in fade-in duration-500">
      <div className="flex items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-[20px] font-medium text-[#2D2D2D]">Acompanhamento Geral de Contratos Sudeste</h1>
          <p className="text-[12px] text-[#757575] mt-1">Dados lidos da aba EAP; itens em execucao aparecem com marcador vermelho.</p>
        </div>
      </div>

      <div className="bg-white border border-[#E5E7EB] rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[1100px]">
            <thead>
              <tr className="bg-[#F9FAFB] border-b border-[#E5E7EB]">
                <th className="py-4 px-6 text-[11px] font-bold text-[#757575] uppercase tracking-[1px] w-[160px]">Topico</th>
                <th className="py-4 px-4 text-[11px] font-bold text-[#757575] uppercase tracking-[1px]">Tarefa</th>
                <th className="py-4 px-4 text-[11px] font-bold text-[#757575] uppercase tracking-[1px] whitespace-nowrap">Inicio</th>
                <th className="py-4 px-4 text-[11px] font-bold text-[#757575] uppercase tracking-[1px] whitespace-nowrap">Termino</th>
                <th className="py-4 px-4 text-[11px] font-bold text-[#757575] uppercase tracking-[1px] whitespace-nowrap">Termino Programado</th>
                <th className="py-4 px-4 text-[11px] font-bold text-[#757575] uppercase tracking-[1px] text-center">% Prev</th>
                <th className="py-4 px-4 text-[11px] font-bold text-[#757575] uppercase tracking-[1px] text-center">% Exe</th>
                <th className="py-4 px-6 text-[11px] font-bold text-[#757575] uppercase tracking-[1px]">Barra de %</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E5E7EB]">
              {rows.length > 0 ? rows.map((row) => renderRow(row)) : (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-[13px] font-medium text-[#757575]">
                    Nenhum dado da aba EAP encontrado no JSON publicado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
