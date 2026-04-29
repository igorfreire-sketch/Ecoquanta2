import React, { useState } from 'react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell
} from 'recharts';
import { ChevronDown } from 'lucide-react';

const disciplinesData = [
  { name: 'Estrutura', Interno: 12, Terceirizado: 25 },
  { name: 'Impermeab.', Interno: 8, Terceirizado: 15 },
  { name: 'Hidrossanit.', Interno: 15, Terceirizado: 30 },
  { name: 'PCI', Interno: 5, Terceirizado: 10 },
  { name: 'Elétrica', Interno: 10, Terceirizado: 22 },
  { name: 'Arquitetura', Interno: 20, Terceirizado: 45 },
];

const groupsData = [
  { name: 'Relatório', Interno: 30, Terceirizado: 50 },
  { name: 'Carimbo', Interno: 15, Terceirizado: 25 },
  { name: 'Desenho', Interno: 45, Terceirizado: 80 },
  { name: 'Falta Arq.', Interno: 10, Terceirizado: 15 },
];

const totalAnalyzedData = [
  { name: 'Revisado Interno', value: 350, color: '#64748B' },
  { name: 'Revisado Externo', value: 450, color: '#F05D28' },
  { name: 'Sem NC', value: 647, color: '#10B981' },
];

export default function NaoConformidades() {
  const [activeMonth, setActiveMonth] = useState('SETEMBRO');

  return (
    <div className="flex flex-col md:flex-row gap-6 w-full animate-in fade-in duration-500">
      {/* Lado Esquerdo: Filtros */}
      <aside className="w-full md:w-64 flex flex-col gap-6 shrink-0">
        {/* Card 1: Meses */}
        <div className="bg-white border border-[#E5E7EB] rounded-xl py-2 shadow-sm">
          <button
            onClick={() => setActiveMonth('SETEMBRO')}
            className={`w-full text-left px-6 py-3 text-[14px] transition-all ${
              activeMonth === 'SETEMBRO'
                ? 'border-l-4 border-[#F05D28] text-[#F05D28] font-bold bg-[#F05D28]/5'
                : 'text-[#757575] font-medium hover:bg-[#F9FAFB]'
            }`}
          >
            SETEMBRO
          </button>
          <button
            onClick={() => setActiveMonth('OUTUBRO')}
            className={`w-full text-left px-6 py-3 text-[14px] transition-all ${
              activeMonth === 'OUTUBRO'
                ? 'border-l-4 border-[#F05D28] text-[#F05D28] font-bold bg-[#F05D28]/5'
                : 'text-[#757575] font-medium hover:bg-[#F9FAFB]'
            }`}
          >
            OUTUBRO
          </button>
        </div>

        {/* Card 2: Filtro por OS */}
        <div className="bg-white border border-[#E5E7EB] rounded-xl p-5 shadow-sm">
          <label className="block text-[11px] font-bold text-[#757575] uppercase tracking-[1px] mb-3">
            FILTRAR POR OS
          </label>
          <div className="relative">
            <select className="w-full h-11 px-4 bg-white border border-[#E5E7EB] rounded-xl text-[14px] font-medium text-[#2D2D2D] appearance-none focus:border-[#F05D28] focus:ring-2 focus:ring-[#F05D28]/20 outline-none transition-all cursor-pointer">
              <option>Todas</option>
              <option>OS 001</option>
              <option>OS 002</option>
            </select>
            <ChevronDown size={18} className="absolute right-4 top-1/2 -translate-y-1/2 text-[#757575] pointer-events-none" />
          </div>
        </div>
      </aside>

      {/* Lado Direito: Gráficos */}
      <div className="flex-1 flex flex-col gap-6">
        {/* Gráfico 1: Disciplinas */}
        <div className="bg-white border border-[#E5E7EB] rounded-xl p-6 shadow-sm">
          <h3 className="text-[16px] font-bold text-[#2D2D2D] text-center mb-8">
            Não Conformidades por disciplinas
          </h3>
          <div className="h-[350px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={disciplinesData}
                margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                <XAxis 
                  dataKey="name" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fill: '#757575', fontSize: 11, fontWeight: 500 }}
                  dy={10}
                />
                <YAxis 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fill: '#757575', fontSize: 11 }}
                />
                <Tooltip 
                  cursor={{ fill: '#F8F9FA' }}
                  contentStyle={{ borderRadius: '12px', border: '1px solid #E5E7EB', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                />
                <Legend 
                  verticalAlign="top" 
                  align="center" 
                  iconType="circle"
                  wrapperStyle={{ paddingBottom: '30px', fontSize: '12px', fontWeight: 500 }}
                />
                <Bar dataKey="Interno" stackId="a" fill="#64748B" radius={[0, 0, 0, 0]} barSize={40} />
                <Bar dataKey="Terceirizado" stackId="a" fill="#F05D28" radius={[4, 4, 0, 0]} barSize={40} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Linha Inferior */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Gráfico 2: Grupos */}
          <div className="bg-white border border-[#E5E7EB] rounded-xl p-6 shadow-sm">
            <h3 className="text-[16px] font-bold text-[#2D2D2D] text-center mb-8">
              Grupos de Não Conformidades
            </h3>
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={groupsData}
                  margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                  <XAxis 
                    dataKey="name" 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fill: '#757575', fontSize: 11, fontWeight: 500 }}
                    dy={10}
                  />
                  <YAxis 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fill: '#757575', fontSize: 11 }}
                  />
                  <Tooltip 
                    cursor={{ fill: '#F8F9FA' }}
                    contentStyle={{ borderRadius: '12px', border: '1px solid #E5E7EB' }}
                  />
                  <Legend 
                    verticalAlign="top" 
                    align="center" 
                    iconType="circle"
                    wrapperStyle={{ paddingBottom: '20px', fontSize: '11px' }}
                  />
                  <Bar dataKey="Interno" fill="#64748B" radius={[4, 4, 0, 0]} barSize={25} />
                  <Bar dataKey="Terceirizado" fill="#F05D28" radius={[4, 4, 0, 0]} barSize={25} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Gráfico 3: Donut */}
          <div className="bg-white border border-[#E5E7EB] rounded-xl p-6 shadow-sm flex flex-col items-center">
            <h3 className="text-[16px] font-bold text-[#2D2D2D] text-center mb-4">
              Arquivos Totais Analisados
            </h3>
            
            {/* Custom Legend for Pie Chart */}
            <div className="flex flex-wrap justify-center gap-4 mb-4">
              {totalAnalyzedData.map((entry, index) => (
                <div key={index} className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
                  <span className="text-[11px] font-medium text-[#757575]">{entry.name}</span>
                </div>
              ))}
            </div>

            <div className="h-[250px] w-full relative">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={totalAnalyzedData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {totalAnalyzedData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ borderRadius: '12px', border: '1px solid #E5E7EB' }}
                  />
                </PieChart>
              </ResponsiveContainer>
              
              {/* Center Label */}
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-[24px] font-bold text-[#2D2D2D]">1.447</span>
                <span className="text-[10px] font-medium text-[#757575] uppercase tracking-wider">Total</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
