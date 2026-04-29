import React, { useState } from 'react';
import {
  LayoutDashboard,
  Users,
  TrendingUp,
  LayoutGrid,
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

export default function CoordenacaoEngenharia({ filtrosAtivos, preloadedData, subTab }: CoordenacaoEngenhariaProps) {
  const tabs = [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'alocacoes', label: 'Alocações' },
    { id: 'curva-s', label: 'Curva S' },
    { id: 'matrix', label: 'Matriz' },
  ];

  return (
    <div className="w-full flex flex-col font-['Montserrat']">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-[11px] font-bold text-[#757575] uppercase tracking-widest mb-6">
        <span>Coordenação de Engenharia</span>
        <ChevronRight size={12} />
        <span className="text-[#F05D28]">{tabs.find(t => t.id === subTab)?.label}</span>
      </div>

      {/* Tab Content */}
      <div className="pb-10">
        {subTab === 'dashboard' && <DashboardEngenharia filtrosAtivos={filtrosAtivos} preloadedData={preloadedData} />}
        {subTab === 'alocacoes' && <Alocacoes preloadedData={preloadedData} />}
        {subTab === 'curva-s' && <CurvaS preloadedData={preloadedData?.eap || null} />}
        {subTab === 'matrix' && <Matrix />}
      </div>
    </div>
  );
}

