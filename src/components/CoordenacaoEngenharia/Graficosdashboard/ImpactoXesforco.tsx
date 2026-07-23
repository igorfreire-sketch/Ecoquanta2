import React, { useMemo, useState } from 'react';
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  ZAxis,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  ReferenceArea,
  ReferenceLine,
  Cell
} from 'recharts';
import { X, TrendingUp, Users } from 'lucide-react';
import { processarAtividades, RegistroOriginal, AtividadeConsolidada } from './utils/enginePriorizacao';

interface Props {
  dadosBrutos: RegistroOriginal[];
  filtros: {
    contrato: string;
    os: string;
    importancia: string;
    dificuldade: string;
  };
  contractOptions: Array<{ codigo: string; nome: string }>;
  osOptions: Array<{ codigo: string; nome: string }>;
  onFiltroChange: (key: 'contrato' | 'os' | 'importancia' | 'dificuldade', value: string) => void;
}

const CORES_AVALIACAO: Record<string, string> = {
  'Problema/Bloqueio': '#EF4444',
  'Pior que o esperado': '#F59E0B',
  'Dentro do esperado': '#3B82F6',
  'Melhor que o esperado': '#10B981'
};

const ChartReferenceArea = ReferenceArea as unknown as React.ComponentType<any>;

const ChipResumo = ({ label, valor, color }: { label: string; valor: any; color: string }) => (
  <div className="px-3 py-1.5 rounded-full bg-[#F8F9FA] border border-[#E5E7EB] flex items-center gap-2 shrink-0">
    <span className="text-[10px] font-bold text-[#2D2D2D] uppercase">{label}:</span>
    <span className={`text-[10px] font-black ${color}`}>{valor}</span>
  </div>
);

const CustomTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    const data: AtividadeConsolidada = payload[0].payload;
    return (
      <div className="bg-white p-3 rounded-lg shadow-xl animate-in fade-in zoom-in duration-200">
        <p className="text-[11px] font-black text-gray-800 uppercase leading-tight mb-1">{data.descricao}</p>
        <div className="flex gap-2 items-center mb-2">
          <span className="text-[9px] font-bold text-gray-500 uppercase">{data.os}</span>
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: CORES_AVALIACAO[data.piorAvaliacao] }} />
        </div>
        <div className="text-[10px] space-y-1 border-t pt-2">
          <p className="flex justify-between gap-4 italic text-gray-500">Clique para ver detalhes</p>
        </div>
      </div>
    );
  }
  return null;
};

const MatrizImpactoEsforcoInterativa: React.FC<Props> = ({ dadosBrutos }) => {
  const [selectedAtividade, setSelectedAtividade] = useState<AtividadeConsolidada | null>(null);

  const { dados, medianaX, medianaY } = useMemo(() => {
    const processados = processarAtividades(dadosBrutos);

    const calcMediana = (vals: number[]) => {
      if (vals.length === 0) return 50;
      const sorted = [...vals].sort((a, b) => a - b);
      const half = Math.floor(sorted.length / 2);
      return sorted.length % 2 ? sorted[half] : (sorted[half - 1] + sorted[half]) / 2;
    };

    return {
      dados: processados,
      medianaX: calcMediana(processados.map(d => d.esforco)),
      medianaY: calcMediana(processados.map(d => d.impacto))
    };
  }, [dadosBrutos]);

  const resumo = useMemo(() => ({
    ganhosRapidos: dados.filter(d => d.impacto >= medianaY && d.esforco <= medianaX).length,
    estruturantes: dados.filter(d => d.impacto >= medianaY && d.esforco >= medianaX).length,
    atividades: dados.length
  }), [dados, medianaX, medianaY]);

  return (
    <div className="flex flex-col h-full overflow-hidden font-sans relative min-h-[520px]">
      <div className="mb-4 shrink-0">
        <div className="flex flex-wrap gap-2 mt-4">
          <ChipResumo label="Ganhos rapidos" valor={resumo.ganhosRapidos} color="text-[#10B981]" />
          <ChipResumo label="Estruturantes" valor={resumo.estruturantes} color="text-[#F05D28]" />
          <ChipResumo label="Atividades" valor={resumo.atividades} color="text-[#1E40AF]" />
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-4 text-[9px] font-bold text-[#757575] uppercase">
          {Object.entries(CORES_AVALIACAO).map(([label, cor]) => (
            <div key={label} className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm shadow-sm" style={{ backgroundColor: cor }} />
              {label}
            </div>
          ))}
          <div className="text-gray-400 ml-auto">Bolha=Alocacao total</div>
        </div>
      </div>

      <div className="relative flex-1 flex flex-col items-center justify-center py-4 bg-gray-50/30 rounded-xl">
        <div className="absolute top-3 left-6 right-6 flex justify-between pointer-events-none z-10">
          <div className="text-[9px] font-black text-emerald-700/60 uppercase tracking-tighter">Alto impacto + baixo esforco</div>
          <div className="text-[9px] font-black text-orange-700/60 uppercase tracking-tighter">Alto impacto + alto esforco</div>
        </div>

        <div className="w-full h-full min-h-[330px] p-3">
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 20, right: 30, bottom: 20, left: 10 }}>
              <XAxis type="number" dataKey="esforco" domain={[0, 100]} tick={false} axisLine={false} />
              <YAxis type="number" dataKey="impacto" domain={[0, 115]} tick={false} axisLine={false} />
              <ZAxis type="number" dataKey="alocacaoTotal" range={[150, 1000]} />

              <RechartsTooltip content={<CustomTooltip />} cursor={{ strokeDasharray: '3 3', stroke: '#94a3b8' }} />

              <ChartReferenceArea x1={0} x2={medianaX} y1={medianaY} y2={115} fill="#f0fdf4" fillOpacity={0.5} />
              <ChartReferenceArea x1={medianaX} x2={100} y1={medianaY} y2={115} fill="#fff7ed" fillOpacity={0.5} />
              <ChartReferenceArea x1={0} x2={medianaX} y1={0} y2={medianaY} fill="#f8fafc" fillOpacity={0.5} />
              <ChartReferenceArea x1={medianaX} x2={100} y1={0} y2={medianaY} fill="#fef2f2" fillOpacity={0.5} />

              <ReferenceLine x={medianaX} stroke="#cbd5e1" strokeDasharray="5 5" />
              <ReferenceLine y={medianaY} stroke="#cbd5e1" strokeDasharray="5 5" />

              <Scatter data={dados} onClick={(data) => setSelectedAtividade(data)}>
                {dados.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={CORES_AVALIACAO[entry.piorAvaliacao]}
                    fillOpacity={0.85}
                    stroke="#fff"
                    strokeWidth={2}
                    className="drop-shadow-lg hover:brightness-90 transition-all cursor-pointer"
                  />
                ))}
              </Scatter>
            </ScatterChart>
          </ResponsiveContainer>
        </div>

        <div className="absolute left-1 top-1/2 -translate-y-1/2 -rotate-90 flex items-center gap-2">
          <span className="text-[10px] font-black text-[#2D2D2D] uppercase tracking-[3px]">Impacto</span>
          <span className="text-[8px] font-bold text-[#757575] uppercase leading-none">Baixo - Alto</span>
        </div>
        <div className="absolute bottom-1 left-1/2 -translate-x-1/2 flex items-center gap-2">
          <span className="text-[10px] font-black text-[#2D2D2D] uppercase tracking-[3px]">Custo de Esforco</span>
          <span className="text-[8px] font-bold text-[#757575] uppercase leading-none">Baixo - Alto</span>
        </div>
      </div>

      {selectedAtividade && (
        <div className="absolute inset-0 bg-white/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="w-[360px] bg-white rounded-[20px] shadow-2xl p-6 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1 bg-brand" />
            <button onClick={() => setSelectedAtividade(null)} className="absolute top-4 right-4 text-gray-400 hover:text-red-500 p-1.5 rounded-full hover:bg-red-50 transition-colors">
              <X size={18} />
            </button>

            <div className="flex gap-4 items-center mb-6">
              <div className="w-14 h-14 rounded-[12px] bg-red-100 flex items-center justify-center shrink-0">
                <TrendingUp size={28} className="text-red-600" />
              </div>
              <div>
                <h4 className="text-[15px] font-black text-gray-800 uppercase leading-tight">{selectedAtividade.descricao}</h4>
                <p className="text-[11px] text-gray-500 font-bold uppercase tracking-tight">{selectedAtividade.os} - {selectedAtividade.disciplina}</p>
              </div>
            </div>

            <div className="space-y-4 mb-8">
              <div className="flex justify-between items-center text-[12px]">
                <span className="text-gray-500 font-bold uppercase tracking-tight">Pior avaliacao:</span>
                <span className="font-black uppercase text-red-600 tracking-tighter text-[13px]">{selectedAtividade.piorAvaliacao}</span>
              </div>
              <div className="flex justify-between items-center text-[12px]">
                <span className="text-gray-500 font-bold uppercase tracking-tight">Progresso medio:</span>
                <span className="font-black text-gray-800">{Math.round(selectedAtividade.progressoMedio)}%</span>
              </div>
              <div className="flex justify-between items-center text-[12px]">
                <span className="text-gray-500 font-bold uppercase tracking-tight">Alocacao total:</span>
                <span className="font-black text-gray-800">{Math.round(selectedAtividade.alocacaoTotal)}%</span>
              </div>
              <div className="flex items-center gap-2 pt-1 mt-2">
                <Users size={16} className="text-slate-400" />
                <span className="text-[11px] font-bold text-slate-500">Equipe de {selectedAtividade.profissionaisEnvolvidos} profissionais</span>
              </div>
            </div>

            <div className="flex justify-between gap-3 text-center">
              <div className="flex-1">
                <p className="text-[10px] text-slate-400 font-bold uppercase mb-1">Impacto</p>
                <p className="text-2xl font-black text-slate-800">{Math.round(selectedAtividade.impacto)}</p>
              </div>
              <div className="flex-1">
                <p className="text-[10px] text-slate-400 font-bold uppercase mb-1">Esforco</p>
                <p className="text-2xl font-black text-slate-800">{Math.round(selectedAtividade.esforco)}</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MatrizImpactoEsforcoInterativa;
