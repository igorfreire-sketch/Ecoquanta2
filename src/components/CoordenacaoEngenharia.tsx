import React from 'react';
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


export default function CoordenacaoEngenharia({ currentUser, filtrosAtivos, preloadedData, disciplinas, subTab, lockedContractCode }: CoordenacaoEngenhariaProps) {
  const effectiveSubTab = subTab === 'alertas' ? 'dashboard' : subTab;
  const tabs = [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'profissionais', label: 'Profissionais' },
    { id: 'planejamento', label: 'Atividades' },
    { id: 'curva-s', label: 'Curva S' },
    { id: 'disciplinas', label: 'Disciplinas' },
  ];
  const activeContractCode = String(lockedContractCode || filtrosAtivos?.contrato || '').trim();

  return (
    <div className="w-full flex flex-col font-['Montserrat']">
      {/* Caminho e a data da EAP vivem no breadcrumb global do App (mesma linha). */}
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
