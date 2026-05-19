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
  LabelList,
  PieChart,
  Pie,
  Cell
} from 'recharts';
import { ChevronRight, BarChart2, PieChart as PieIcon, Layers } from 'lucide-react';
import Preenchimento from './Preenchimento';
import Revisoes from './Revisoes';

// Mock data for Dashboard
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
  { name: 'Revisado Interno', value: 350, color: '#3A86D8' },
  { name: 'Revisado Externo', value: 450, color: '#E86A33' },
  { name: 'Sem NC', value: 647, color: '#4CAF50' },
];

// ── Custom Tooltip ──────────────────────────────────────────────
const CustomBarTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div style={{
        background: '#fff',
        border: '1px solid #E5E7EB',
        borderRadius: 14,
        padding: '12px 16px',
        boxShadow: '0 8px 24px rgba(0,0,0,0.10)',
        minWidth: 140,
      }}>
        <p style={{ fontWeight: 700, fontSize: 13, color: '#2D2D2D', marginBottom: 8 }}>{label}</p>
        {payload.map((item: any, i: number) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: item.fill, display: 'inline-block' }} />
            <span style={{ fontSize: 12, color: '#757575' }}>{item.name}:</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: item.fill }}>{item.value}</span>
          </div>
        ))}
      </div>
    );
  }
  return null;
};

const CustomPieTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    const d = payload[0];
    return (
      <div style={{
        background: '#fff',
        border: '1px solid #E5E7EB',
        borderRadius: 14,
        padding: '10px 14px',
        boxShadow: '0 8px 24px rgba(0,0,0,0.10)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: d.payload.color, display: 'inline-block' }} />
          <span style={{ fontSize: 12, color: '#757575' }}>{d.name}</span>
        </div>
        <p style={{ fontSize: 16, fontWeight: 700, color: '#2D2D2D', marginTop: 4 }}>{d.value.toLocaleString('pt-BR')}</p>
        <p style={{ fontSize: 11, color: '#9CA3AF' }}>
          {((d.value / 1447) * 100).toFixed(1)}% do total
        </p>
      </div>
    );
  }
  return null;
};

// ── Custom Label inside Pie ─────────────────────────────────────
const renderPieLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }: any) => {
  const RADIAN = Math.PI / 180;
  const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);

  if (!percent) return null;

  return (
    <text x={x} y={y} fill="#fff" textAnchor="middle" dominantBaseline="central"
      style={{ fontSize: 11, fontWeight: 700 }}>
      {`${(percent * 100).toFixed(0)}%`}
    </text>
  );
};

// ── Custom Label for XAxis Groups ───────────────────────────────
const renderCustomGroupTick = (props: any) => {
  const { x, y, payload } = props;
  const data = groupsData.find((d: any) => d.name === payload.value);
  if (!data) return null;
  const total = data.Interno + data.Terceirizado;

  return (
    <g transform={`translate(${x},${y})`}>
      <text x={0} y={0} dy={12} textAnchor="middle" fill="#9CA3AF" style={{ fontSize: 11, fontWeight: 600 }}>
        {payload.value}
      </text>
      <text x={0} y={0} dy={26} textAnchor="middle" fill="#2D2D2D" style={{ fontSize: 10, fontWeight: 700 }}>
        Total: {total}
      </text>
    </g>
  );
};

// ── Custom Label for Bar Totals ─────────────────────────────────
const renderCustomBarTotal = (props: any) => {
  const { x, y, width, index } = props;
  const data = disciplinesData[index];
  if (!data) return null;
  const total = data.Interno + data.Terceirizado;

  return (
    <text
      x={x + width / 2}
      y={y - 6}
      fill="#2D2D2D"
      textAnchor="middle"
      style={{ fontSize: 12, fontWeight: 800 }}
    >
      {total}
    </text>
  );
};

// ── Chart card wrapper ─────────────────────────────────────────
const ChartCard = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="bg-white border border-[#E5E7EB] rounded-[12px] p-6 sm:p-8 flex flex-col h-full shadow-sm">
    <div className="mb-6 border-b-0">
      <h3 className="text-base font-bold text-[#2D2D2D] uppercase tracking-tight mb-1">
        {title}
      </h3>
    </div>
    <div className="flex-1 w-full overflow-hidden">
      {children}
    </div>
  </div>
);

// ── Dashboard ──────────────────────────────────────────────────
function Dashboard() {
  const [activeYear, setActiveYear] = useState('2026');
  const [activeMonth, setActiveMonth] = useState('Setembro');

  return (
    <div className="flex flex-col gap-6 w-full animate-in fade-in duration-500">
      {/* Filters Bar - Top Left */}
      <div className="flex flex-wrap items-end gap-4 bg-white border border-[#E5E7EB] rounded-2xl p-4 shadow-sm w-fit">

        {/* Data (Ano) */}
        <div className="w-28">
          <label className="block text-[10px] font-bold text-[#9CA3AF] uppercase tracking-[1.5px] mb-2">
            ANO
          </label>
          <div className="relative">
            <select
              value={activeYear}
              onChange={(e) => setActiveYear(e.target.value)}
              className="w-full h-10 px-3 bg-white border border-[#E5E7EB] rounded-xl text-[13px] font-medium text-[#2D2D2D] appearance-none focus:border-[#F05D28] focus:ring-2 focus:ring-[#F05D28]/20 outline-none transition-all cursor-pointer"
            >
              <option>2026</option>
              <option>2025</option>
              <option>2024</option>
            </select>
            <ChevronRight size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#9CA3AF] pointer-events-none rotate-90" />
          </div>
        </div>

        {/* Data (Mês) */}
        <div className="w-32">
          <label className="block text-[10px] font-bold text-[#9CA3AF] uppercase tracking-[1.5px] mb-2">
            MÊS
          </label>
          <div className="relative">
            <select
              value={activeMonth}
              onChange={(e) => setActiveMonth(e.target.value)}
              className="w-full h-10 px-3 bg-white border border-[#E5E7EB] rounded-xl text-[13px] font-medium text-[#2D2D2D] appearance-none focus:border-[#F05D28] focus:ring-2 focus:ring-[#F05D28]/20 outline-none transition-all cursor-pointer"
            >
              <option>Janeiro</option>
              <option>Fevereiro</option>
              <option>Março</option>
              <option>Abril</option>
              <option>Maio</option>
              <option>Junho</option>
              <option>Julho</option>
              <option>Agosto</option>
              <option>Setembro</option>
              <option>Outubro</option>
              <option>Novembro</option>
              <option>Dezembro</option>
            </select>
            <ChevronRight size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#9CA3AF] pointer-events-none rotate-90" />
          </div>
        </div>

        {/* Contrato */}
        <div className="w-40">
          <label className="block text-[10px] font-bold text-[#9CA3AF] uppercase tracking-[1.5px] mb-2">
            CONTRATO
          </label>
          <div className="relative">
            <select className="w-full h-10 px-3 bg-white border border-[#E5E7EB] rounded-xl text-[13px] font-medium text-[#2D2D2D] appearance-none focus:border-[#F05D28] focus:ring-2 focus:ring-[#F05D28]/20 outline-none transition-all cursor-pointer">
              <option>Todos</option>
              <option>Contrato 001</option>
              <option>Contrato 002</option>
            </select>
            <ChevronRight size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#9CA3AF] pointer-events-none rotate-90" />
          </div>
        </div>

        {/* OS */}
        <div className="w-40">
          <label className="block text-[10px] font-bold text-[#9CA3AF] uppercase tracking-[1.5px] mb-2">
            OS
          </label>
          <div className="relative">
            <select className="w-full h-10 px-3 bg-white border border-[#E5E7EB] rounded-xl text-[13px] font-medium text-[#2D2D2D] appearance-none focus:border-[#F05D28] focus:ring-2 focus:ring-[#F05D28]/20 outline-none transition-all cursor-pointer">
              <option>Todas</option>
              <option>OS 001</option>
              <option>OS 002</option>
            </select>
            <ChevronRight size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#9CA3AF] pointer-events-none rotate-90" />
          </div>
        </div>

        {/* Disciplina */}
        <div className="w-40">
          <label className="block text-[10px] font-bold text-[#9CA3AF] uppercase tracking-[1.5px] mb-2">
            DISCIPLINA
          </label>
          <div className="relative">
            <select className="w-full h-10 px-3 bg-white border border-[#E5E7EB] rounded-xl text-[13px] font-medium text-[#2D2D2D] appearance-none focus:border-[#F05D28] focus:ring-2 focus:ring-[#F05D28]/20 outline-none transition-all cursor-pointer">
              <option>Todas</option>
              <option>Arquitetura</option>
              <option>Elétrica</option>
              <option>Estrutural</option>
              <option>Hidrossanitário</option>
              <option>Orçamento</option>
              <option>PCI e Gás</option>
              <option>Terraplanagem</option>
            </select>
            <ChevronRight size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#9CA3AF] pointer-events-none rotate-90" />
          </div>
        </div>

      </div>

      {/* Charts area */}
      <div className="w-full flex flex-col gap-5">

        {/* ── Disciplinas ───────────────────────────────────────── */}
        <ChartCard title="NÃO CONFORMIDADES POR DISCIPLINAS">
          <div style={{ height: 320 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={disciplinesData} barGap={4} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                <XAxis
                  dataKey="name"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: '#9CA3AF', fontSize: 11, fontWeight: 600 }}
                  dy={10}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: '#C4C9D4', fontSize: 10 }}
                  width={28}
                />
                <Tooltip content={<CustomBarTooltip />} cursor={{ fill: 'rgba(240,93,40,0.05)' }} />
                <Legend
                  verticalAlign="top"
                  align="right"
                  iconType="circle"
                  iconSize={8}
                  wrapperStyle={{ paddingBottom: 16, fontSize: 12, color: '#757575' }}
                />
                <Bar dataKey="Interno" stackId="a" fill="#3A86D8" barSize={44}>
                  <LabelList
                    dataKey="Interno"
                    position="inside"
                    style={{ fill: '#fff', fontSize: 11, fontWeight: 700 }}
                    formatter={(v: number) => (v >= 5 ? v : '')}
                  />
                </Bar>
                <Bar dataKey="Terceirizado" stackId="a" fill="#E86A33" radius={[5, 5, 0, 0]} barSize={44}>
                  <LabelList
                    dataKey="Terceirizado"
                    position="inside"
                    style={{ fill: '#fff', fontSize: 11, fontWeight: 700 }}
                    formatter={(v: number) => (v >= 5 ? v : '')}
                  />
                  <LabelList dataKey="Terceirizado" content={renderCustomBarTotal} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        {/* ── Bottom row ────────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

          {/* Grupos */}
          <ChartCard title="GRUPOS DE NÃO CONFORMIDADES">
            <div style={{ height: 270 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={groupsData} barGap={4} margin={{ top: 10, right: 10, left: -10, bottom: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                  <XAxis
                    dataKey="name"
                    axisLine={false}
                    tickLine={false}
                    tick={renderCustomGroupTick}
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: '#C4C9D4', fontSize: 10 }}
                    width={28}
                  />
                  <Tooltip content={<CustomBarTooltip />} cursor={{ fill: 'rgba(240,93,40,0.05)' }} />
                  <Legend
                    verticalAlign="top"
                    align="right"
                    iconType="circle"
                    iconSize={8}
                    wrapperStyle={{ paddingBottom: 12, fontSize: 11, color: '#757575' }}
                  />
                  <Bar dataKey="Interno" fill="#3A86D8" radius={[4, 4, 0, 0]} barSize={28}>
                    <LabelList
                      dataKey="Interno"
                      position="inside"
                      style={{ fill: '#fff', fontSize: 10, fontWeight: 700 }}
                      formatter={(v: number) => (v >= 10 ? v : '')}
                    />
                  </Bar>
                  <Bar dataKey="Terceirizado" fill="#E86A33" radius={[4, 4, 0, 0]} barSize={28}>
                    <LabelList
                      dataKey="Terceirizado"
                      position="inside"
                      style={{ fill: '#fff', fontSize: 10, fontWeight: 700 }}
                      formatter={(v: number) => (v >= 10 ? v : '')}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>

          {/* Pies */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 h-full">
            {/* Pie 1 */}
            <ChartCard title="NÃO CONFORMIDADE ANALISADAS EM PROJETOS">
              {/* Legend */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 20px', marginBottom: 8 }}>
                {totalAnalyzedData.map((entry, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: entry.color, display: 'inline-block', flexShrink: 0 }} />
                    <span style={{ fontSize: 11, color: '#757575', fontWeight: 500 }}>{entry.name}</span>
                    <span style={{ fontSize: 11, color: '#2D2D2D', fontWeight: 700 }}>{entry.value}</span>
                  </div>
                ))}
              </div>
              <div style={{ height: 220, position: 'relative' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={totalAnalyzedData}
                      cx="50%"
                      cy="50%"
                      innerRadius={65}
                      outerRadius={95}
                      paddingAngle={4}
                      dataKey="value"
                      labelLine={false}
                      label={renderPieLabel}
                      strokeWidth={0}
                    >
                      {totalAnalyzedData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip content={<CustomPieTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
                {/* Center label */}
                <div style={{
                  position: 'absolute', inset: 0,
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  pointerEvents: 'none',
                }}>
                  <span style={{ fontSize: 22, fontWeight: 800, color: '#2D2D2D', lineHeight: 1 }}>1.447</span>
                  <span style={{ fontSize: 10, fontWeight: 600, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '1px', marginTop: 3 }}>Total</span>
                </div>
              </div>
            </ChartCard>

            {/* Pie 2 */}
            <ChartCard title="NÃO CONFORMIDADE EM RELATÓRIOS">
              {/* Legend */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 20px', marginBottom: 8 }}>
                {totalAnalyzedData.map((entry, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: entry.color, display: 'inline-block', flexShrink: 0 }} />
                    <span style={{ fontSize: 11, color: '#757575', fontWeight: 500 }}>{entry.name}</span>
                    <span style={{ fontSize: 11, color: '#2D2D2D', fontWeight: 700 }}>{entry.value}</span>
                  </div>
                ))}
              </div>
              <div style={{ height: 220, position: 'relative' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={totalAnalyzedData}
                      cx="50%"
                      cy="50%"
                      innerRadius={65}
                      outerRadius={95}
                      paddingAngle={4}
                      dataKey="value"
                      labelLine={false}
                      label={renderPieLabel}
                      strokeWidth={0}
                    >
                      {totalAnalyzedData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip content={<CustomPieTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
                {/* Center label */}
                <div style={{
                  position: 'absolute', inset: 0,
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  pointerEvents: 'none',
                }}>
                  <span style={{ fontSize: 22, fontWeight: 800, color: '#2D2D2D', lineHeight: 1 }}>1.447</span>
                  <span style={{ fontSize: 10, fontWeight: 600, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '1px', marginTop: 3 }}>Total</span>
                </div>
              </div>
            </ChartCard>
          </div>
        </div>
      </div>
    </div>
  );
}

interface ConformidadeProps {
  activeTab: 'dashboard' | 'preenchimento' | 'revisoes';
  onTabChange: (tab: 'dashboard' | 'preenchimento' | 'revisoes') => void;
}

export default function Conformidade({ activeTab }: ConformidadeProps) {
  return (
    <div className="w-full flex flex-col font-['Montserrat']">
      <div className="w-full">
        {activeTab === 'dashboard' && <Dashboard />}
        {activeTab === 'preenchimento' && <Preenchimento />}
        {activeTab === 'revisoes' && <Revisoes />}
      </div>
    </div>
  );
}
