import React from 'react';
import {
  CalendarClock,
  ChevronRight
} from 'lucide-react';
import DashboardEngenharia from './CoordenacaoEngenharia/DashboardEngenharia';
import Alocacoes from './CoordenacaoEngenharia/Alocacoes';
import CurvaS from './CoordenacaoEngenharia/CurvaS';
import Matrix from './CoordenacaoEngenharia/botaoMatrix';

interface CoordenacaoEngenhariaProps {
  filtrosAtivos?: {
    contrato: string;
    os: string;
    disciplina: string;
  };
  preloadedData?: {
    registro?: any;
    cronograma?: any;
    admin?: any;
    eap?: any;
  };
  subTab: 'dashboard' | 'alocacoes' | 'curva-s' | 'matrix';
  onSubTabChange: (tab: 'dashboard' | 'alocacoes' | 'curva-s' | 'matrix') => void;
}

function formatLatestEapDate(value?: string) {
  const raw = String(value || '').trim();
  if (!raw) return 'Nao publicada';
  if (/^(atual|eap|reajustado)$/i.test(raw)) return 'Nao publicada';

  const parsedDate = new Date(raw);
  if (raw.includes('T') && !Number.isNaN(parsedDate.getTime())) {
    return parsedDate.toLocaleDateString('pt-BR');
  }

  const br = raw.match(/^(\d{2})[\/\-.](\d{2})[\/\-.](\d{4})$/);
  if (br) return `${br[1]}/${br[2]}/${br[3]}`;

  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;

  return raw;
}

function extractResolvedEapData(eap?: any) {
  if (!eap || typeof eap !== 'object') return null;
  if (eap.data && typeof eap.data === 'object') return eap.data;
  return eap;
}

function getLatestEapDisplayDate(eap?: any) {
  const resolvedEap = extractResolvedEapData(eap);
  const lastSnapshotSheet = Array.isArray(resolvedEap?.dates) && resolvedEap.dates.length > 0
    ? resolvedEap.dates[resolvedEap.dates.length - 1]
    : '';
  const candidates = [
    lastSnapshotSheet,
    resolvedEap?.latestEapSheet,
    resolvedEap?.latestEapDate,
    resolvedEap?.latestEapPublishedAt,
    resolvedEap?.publishedAt,
    eap?.latestEapSheet,
    eap?.latestEapDate,
    eap?.latestEapPublishedAt,
    eap?.publishedAt,
  ];

  for (const candidate of candidates) {
    const formatted = formatLatestEapDate(candidate);
    if (formatted !== 'Nao publicada') return formatted;
  }

  return 'Nao publicada';
}

export default function CoordenacaoEngenharia({ filtrosAtivos, preloadedData, subTab }: CoordenacaoEngenhariaProps) {
  const tabs = [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'alocacoes', label: 'Alocacoes' },
    { id: 'curva-s', label: 'Curva S' },
    { id: 'matrix', label: 'Matriz' },
  ];
  const latestEapDate = getLatestEapDisplayDate(preloadedData?.eap);

  return (
    <div className="w-full flex flex-col font-['Montserrat']">
      <div className="flex flex-col gap-3 mb-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-2 text-[11px] font-bold text-[#757575] uppercase tracking-widest">
          <span>Coordenacao de Engenharia</span>
          <ChevronRight size={12} />
          <span className="text-[#F05D28]">{tabs.find(t => t.id === subTab)?.label}</span>
        </div>

        <div className="inline-flex w-fit items-center gap-2 rounded-lg border border-[#E5E7EB] bg-white px-3 py-2 text-[11px] font-bold uppercase tracking-widest text-[#757575]">
          <CalendarClock size={14} className="text-[#F05D28]" />
          <span>EAP atualizada em</span>
          <span className="text-[#2D2D2D]">{latestEapDate}</span>
        </div>
      </div>

      <div className="pb-10">
        {subTab === 'dashboard' && <DashboardEngenharia filtrosAtivos={filtrosAtivos} preloadedData={preloadedData} />}
        {subTab === 'alocacoes' && <Alocacoes preloadedData={preloadedData} />}
        {subTab === 'curva-s' && <CurvaS preloadedData={preloadedData?.eap || null} />}
        {subTab === 'matrix' && <Matrix />}
      </div>
    </div>
  );
}
