import React, { useState } from 'react';
import { Plus, ChevronDown, Calendar as CalendarIcon, Filter } from 'lucide-react';

const tabs = [
  'GERAL',
  'ESTRUTURA',
  'HIDROSSANITÁRIO',
  'ELÉTRICA',
  'PCI',
  'ORÇAMENTO',
  'TERRAPLANAGEM',
];

const timelineMonths = [
  { name: 'SET. 2025', weeks: ['01 - 07', '08 - 14', '15 - 21', '22 - 30'] },
  { name: 'OUT. 2025', weeks: ['01 - 07', '08 - 14', '15 - 21', '22 - 31'] },
  { name: 'NOV. 2025', weeks: ['01 - 07', '08 - 14', '15 - 21', '22 - 30'] },
];

export default function Cronograma() {
  const [activeTab, setActiveTab] = useState('GERAL');

  return (
    <div className="w-full animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col">
        <h1 className="text-[20px] font-bold text-[#2D2D2D]">Cronograma de Engenharia</h1>
        
        {/* Controls Grid */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-6 mb-8 items-end">
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-medium text-[#757575] uppercase tracking-[1px]">Início do Período</label>
            <div className="relative">
              <input 
                type="date" 
                className="w-full h-11 px-4 bg-white border border-[#E5E7EB] rounded-xl text-[14px] font-medium text-[#2D2D2D] focus:border-[#F05D28] focus:ring-2 focus:ring-[#F05D28]/20 outline-none transition-all"
                defaultValue="2025-09-01"
              />
            </div>
          </div>
          
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-medium text-[#757575] uppercase tracking-[1px]">Fim do Período</label>
            <div className="relative">
              <input 
                type="date" 
                className="w-full h-11 px-4 bg-white border border-[#E5E7EB] rounded-xl text-[14px] font-medium text-[#2D2D2D] focus:border-[#F05D28] focus:ring-2 focus:ring-[#F05D28]/20 outline-none transition-all"
                defaultValue="2026-01-30"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-medium text-[#757575] uppercase tracking-[1px]">Filtrar por OS</label>
            <div className="relative">
              <select className="w-full h-11 px-4 bg-white border border-[#E5E7EB] rounded-xl text-[14px] font-medium text-[#2D2D2D] appearance-none focus:border-[#F05D28] focus:ring-2 focus:ring-[#F05D28]/20 outline-none transition-all cursor-pointer">
                <option>Todas</option>
                <option>OS 040</option>
                <option>OS 041</option>
              </select>
              <ChevronDown size={18} className="absolute right-4 top-1/2 -translate-y-1/2 text-[#757575] pointer-events-none" />
            </div>
          </div>

          <button className="h-11 bg-[#F05D28] text-white text-[13px] font-bold rounded-xl px-6 flex items-center justify-center gap-2 hover:bg-[#D94E1F] transition-colors shadow-sm">
            <Plus size={18} />
            NOVA ORDEM DE SERVIÇO
          </button>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="flex gap-8 border-b border-[#E5E7EB] mb-8 overflow-x-auto no-scrollbar">
        {tabs.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`pb-3 text-[13px] font-bold transition-all whitespace-nowrap ${
              activeTab === tab 
                ? 'text-[#F05D28] border-b-2 border-[#F05D28]' 
                : 'text-[#757575] font-medium hover:text-[#2D2D2D]'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Gantt Chart Card */}
      <div className="bg-white border border-[#E5E7EB] rounded-xl shadow-sm overflow-hidden min-h-[500px] flex flex-col">
        {/* Timeline Header */}
        <div className="overflow-x-auto">
          <div className="min-w-[1200px]">
            {/* Months Row */}
            <div className="flex border-b border-[#E5E7EB]">
              {timelineMonths.map((month) => (
                <div key={month.name} className="flex-1 border-r border-[#E5E7EB] last:border-r-0 py-4 text-center">
                  <span className="text-[12px] font-bold text-[#2D2D2D] uppercase tracking-wider">{month.name}</span>
                </div>
              ))}
            </div>
            
            {/* Weeks Row */}
            <div className="flex border-b border-[#E5E7EB] bg-[#F9FAFB]/50">
              {timelineMonths.map((month) => (
                <div key={month.name} className="flex-1 flex border-r border-[#E5E7EB] last:border-r-0">
                  {month.weeks.map((week) => (
                    <div key={week} className="flex-1 text-center py-2 border-r border-[#E5E7EB]/50 last:border-r-0">
                      <span className="text-[10px] font-medium text-[#757575]">{week}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>

            {/* Gantt Body Area */}
            <div className="relative p-6 space-y-6 min-h-[400px]">
              {/* Background Grid Lines (Visual only) */}
              <div className="absolute inset-0 flex pointer-events-none">
                {Array.from({ length: 12 }).map((_, i) => (
                  <div key={i} className="flex-1 border-r border-[#F9FAFB]" />
                ))}
              </div>

              {/* Task Bars */}
              <div className="relative z-10 space-y-4">
                {/* Bar 1 */}
                <div className="flex items-center">
                  <div 
                    className="h-10 bg-[#6eb89f] text-white rounded-full flex items-center px-5 shadow-sm transition-transform hover:scale-[1.01] cursor-pointer"
                    style={{ width: '75%', marginLeft: '5%' }}
                  >
                    <span className="text-[12px] font-medium truncate">
                      OS040 - Ministério Público • Vinicius • 03/09/2025 → 30/01/2026
                    </span>
                  </div>
                </div>

                {/* Bar 2 */}
                <div className="flex items-center">
                  <div 
                    className="h-10 bg-[#7997c9] text-white rounded-full flex items-center px-5 shadow-sm transition-transform hover:scale-[1.01] cursor-pointer"
                    style={{ width: '40%', marginLeft: '15%' }}
                  >
                    <span className="text-[12px] font-medium truncate">
                      Projeto Arquitetônico • 17/09/2025
                    </span>
                  </div>
                </div>

                {/* Bar 3 */}
                <div className="flex items-center">
                  <div 
                    className="h-10 bg-[#64748B] text-white rounded-full flex items-center px-5 shadow-sm transition-transform hover:scale-[1.01] cursor-pointer"
                    style={{ width: '25%', marginLeft: '45%' }}
                  >
                    <span className="text-[12px] font-medium truncate">
                      Sondagem • CODEMAR
                    </span>
                  </div>
                </div>

                {/* Bar 4 (Extra for visual completeness) */}
                <div className="flex items-center">
                  <div 
                    className="h-10 bg-[#7997c9] text-white rounded-full flex items-center px-5 shadow-sm transition-transform hover:scale-[1.01] cursor-pointer"
                    style={{ width: '30%', marginLeft: '60%' }}
                  >
                    <span className="text-[12px] font-medium truncate">
                      Revisão Estrutural • Eng. Carlos
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
