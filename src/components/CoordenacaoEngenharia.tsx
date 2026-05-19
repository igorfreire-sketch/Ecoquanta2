import React from 'react';
import {
  CalendarClock,
  ChevronRight,
} from 'lucide-react';
import DashboardEngenharia from './CoordenacaoEngenharia/DashboardEngenharia';
import Alertas from './CoordenacaoEngenharia/Alertas';
import CurvaS from './CoordenacaoEngenharia/CurvaS';
import Cronograma from './Cronograma';
import type { AuthUser } from './LoginScreen';

interface CoordenacaoEngenhariaProps {
  currentUser: AuthUser;
  filtrosAtivos?: {
    contrato: string;
    os: string;
    disciplina: string;
  };
  lockedContractCode?: string;
  preloadedData?: {
    registro?: any;
    cronograma?: any;
    admin?: any;
    eap?: any;
  };
  subTab: 'profissionais' | 'dashboard' | 'alocacoes' | 'curva-s' | 'planejamento' | 'alertas' | 'cronograma';
  onSubTabChange: (tab: 'profissionais' | 'dashboard' | 'alocacoes' | 'curva-s' | 'planejamento' | 'alertas' | 'cronograma') => void;
}

function formatLatestEapDate(value?: string) {
  const raw = String(value || '').trim();
  if (!raw) return 'Nao publicada';

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
    resolvedEap?.latestEapDate,
    resolvedEap?.latestEapSheet,
    lastSnapshotSheet,
    resolvedEap?.latestEapPublishedAt,
    resolvedEap?.publishedAt,
    eap?.latestEapDate,
    eap?.latestEapSheet,
    eap?.latestEapPublishedAt,
    eap?.publishedAt,
  ];

  for (const candidate of candidates) {
    const formatted = formatLatestEapDate(candidate);
    if (formatted !== 'Nao publicada') return formatted;
  }

  return 'Nao publicada';
}

export default function CoordenacaoEngenharia({ currentUser, filtrosAtivos, preloadedData, subTab, lockedContractCode }: CoordenacaoEngenhariaProps) {
  const tabs = [
    { id: 'profissionais', label: 'Profissionais' },
    { id: 'curva-s', label: 'Curva S' },
    { id: 'alertas', label: 'Alertas' },
    { id: 'cronograma', label: 'Cronograma' },
  ];
  const latestEapDate = getLatestEapDisplayDate(preloadedData?.eap);
  const activeContractCode = String(lockedContractCode || filtrosAtivos?.contrato || '').trim();

  return (
    <div className="w-full flex flex-col font-['Montserrat']">
      <div className="mb-6 flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="flex min-w-0 flex-col gap-3">
          <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-[#757575]">
            <span>Coordenacao de Engenharia</span>
            <ChevronRight size={12} />
            <span className="text-[#F05D28]">{tabs.find(t => t.id === subTab)?.label}</span>
          </div>
        </div>

        <div className="inline-flex w-fit items-center gap-2 rounded-lg border border-[#E5E7EB] bg-white px-3 py-2 text-[11px] font-bold uppercase tracking-widest text-[#757575]">
          <CalendarClock size={14} className="text-[#F05D28]" />
          <span>EAP atualizada em</span>
          <span className="text-[#2D2D2D]">{latestEapDate}</span>
        </div>
      </div>

      <div className="pb-10">
        {subTab === 'profissionais' && <DashboardEngenharia filtrosAtivos={filtrosAtivos} preloadedData={preloadedData} mode="profissionais" activeContractCode={activeContractCode} />}
        {subTab === 'curva-s' && <CurvaS preloadedData={preloadedData?.eap || null} lockedContractCode={lockedContractCode} activeContractCode={activeContractCode} />}
        {subTab === 'alertas' && <Alertas currentUser={currentUser} preloadedData={preloadedData} activeContractCode={activeContractCode} />}
        {subTab === 'cronograma' && <Cronograma preloadedData={preloadedData} lockedContractCode={lockedContractCode} />}
      </div>
    </div>
  );
}
