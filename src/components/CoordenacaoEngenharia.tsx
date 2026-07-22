import React from 'react';
import {
  CalendarClock,
  ChevronRight,
} from 'lucide-react';
import Atividades from './Atividades';
import DashboardEngenharia from './CoordenacaoEngenharia/DashboardEngenharia';
import CurvaS from './CoordenacaoEngenharia/CurvaS';
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
  disciplinas?: string[];
  subTab: 'profissionais' | 'dashboard' | 'alocacoes' | 'curva-s' | 'planejamento' | 'alertas' | 'disciplinas';
  onSubTabChange: (tab: 'profissionais' | 'dashboard' | 'alocacoes' | 'curva-s' | 'planejamento' | 'alertas' | 'disciplinas') => void;
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

export default function CoordenacaoEngenharia({ currentUser, filtrosAtivos, preloadedData, disciplinas, subTab, lockedContractCode }: CoordenacaoEngenhariaProps) {
  const effectiveSubTab = subTab === 'alertas' ? 'dashboard' : subTab;
  const tabs = [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'profissionais', label: 'Profissionais' },
    { id: 'planejamento', label: 'Atividades' },
    { id: 'curva-s', label: 'Curva S' },
    { id: 'disciplinas', label: 'Disciplinas' },
  ];
  const latestEapDate = getLatestEapDisplayDate(preloadedData?.eap);
  const activeContractCode = String(lockedContractCode || filtrosAtivos?.contrato || '').trim();

  return (
    <div className="w-full flex flex-col font-['Montserrat']">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-[#757575]">
          <span>Coordenacao de Engenharia</span>
          <ChevronRight size={12} />
          <span className="text-[#F05D28]">{tabs.find(t => t.id === effectiveSubTab)?.label}</span>
        </div>
        <div className="inline-flex items-center gap-2 rounded-lg border border-[#E5E7EB] bg-white px-3 py-1.5 text-[11px] font-bold uppercase tracking-widest text-[#757575]">
          <CalendarClock size={13} className="text-[#F05D28]" />
          <span>EAP atualizada em</span>
          <span className="text-[#2D2D2D]">{latestEapDate}</span>
        </div>
      </div>

      <div>
        {effectiveSubTab === 'dashboard' && <DashboardEngenharia filtrosAtivos={filtrosAtivos} preloadedData={preloadedData} mode="dashboard" activeContractCode={activeContractCode} />}
        {effectiveSubTab === 'profissionais' && <DashboardEngenharia filtrosAtivos={filtrosAtivos} preloadedData={preloadedData} mode="profissionais" activeContractCode={activeContractCode} />}
        {effectiveSubTab === 'planejamento' && (
          <div>
            <Atividades
              currentUser={currentUser}
              preloadedData={preloadedData}
              showAllDisciplines
              disciplineFilterEnabled
            />
          </div>
        )}
        {effectiveSubTab === 'curva-s' && <CurvaS preloadedData={preloadedData?.eap || null} lockedContractCode={lockedContractCode} activeContractCode={activeContractCode} />}
      </div>
    </div>
  );
}
