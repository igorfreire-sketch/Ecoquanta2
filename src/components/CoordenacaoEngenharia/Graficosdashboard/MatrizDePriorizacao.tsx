import React, { useMemo, useState } from 'react';
import { X } from 'lucide-react';

interface Atividade {
  id: string | number;
  os: string;
  descricao: string;
  contrato: string;
  disciplina: string;
  prazoAtual: number;
  dificuldade: number;
  importancia: number;
  responsavel: string;
  percentualConcluido: number;
}

interface MatrizDePriorizacaoProps {
  tableFiltrada: Atividade[];
  maxPrazo: number;
}

interface AtividadeComPrioridade extends Atividade {
  prioridade: number;
}

interface CellStats {
  key: string;
  imp: number;
  dif: number;
  atividades: AtividadeComPrioridade[];
  quantidade: number;
  prioridadeMaxima: number;
}

const EIXO_Y = [5, 4, 3, 2, 1];
const EIXO_X = [1, 2, 3, 4, 5];

function calcularPrioridade(atividade: Atividade, maxPrazo: number): number {
  if (!maxPrazo || maxPrazo <= 0) return 0;
  const score = (1 - atividade.prazoAtual / maxPrazo) * 0.4 + ((atividade.dificuldade - 1) / 4) * 0.1 + ((atividade.importancia - 1) / 4) * 0.5;
  return Math.max(0, Math.min(1, score));
}

function enriquecerAtividades(atividades: Atividade[], maxPrazo: number): AtividadeComPrioridade[] {
  return (atividades || []).map(a => ({ ...a, prioridade: calcularPrioridade(a, maxPrazo) }));
}

function montarMatriz(atividades: AtividadeComPrioridade[]): Map<string, CellStats> {
  const matriz = new Map<string, CellStats>();
  for (const imp of EIXO_Y) {
    for (const dif of EIXO_X) {
      const atividadesDaCelula = atividades.filter(a => Number(a.importancia) === imp && Number(a.dificuldade) === dif);
      matriz.set(`${imp}-${dif}`, {
        key: `${imp}-${dif}`,
        imp, dif,
        atividades: atividadesDaCelula,
        quantidade: atividadesDaCelula.length,
        prioridadeMaxima: atividadesDaCelula.length > 0 ? Math.max(...atividadesDaCelula.map(a => a.prioridade)) : 0
      });
    }
  }
  return matriz;
}

const getCorCelula = (prioridade: number, qtd: number) => {
  if (qtd === 0) return 'bg-gray-50 border border-dashed border-gray-200';
  if (prioridade <= 0.25) return 'bg-[#10B981]';
  if (prioridade <= 0.45) return 'bg-[#FACC15]';
  if (prioridade <= 0.65) return 'bg-[#F59E0B]';
  return 'bg-[#EF4444]';
};

const ChipResumo = ({ label, valor, color }: { label: string; valor: any; color: string }) => (
  <div className="px-3 py-1.5 rounded-full bg-[#F8F9FA] border border-[#E5E7EB] flex items-center gap-2 shrink-0">
    <span className="text-[10px] font-bold text-[#2D2D2D] uppercase">{label}:</span>
    <span className={`text-[10px] font-black ${color}`}>{valor}</span>
  </div>
);

export default function MatrizDePriorizacao({ tableFiltrada, maxPrazo }: MatrizDePriorizacaoProps) {
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const atividades = useMemo(() => enriquecerAtividades(tableFiltrada, maxPrazo), [tableFiltrada, maxPrazo]);
  const matriz = useMemo(() => montarMatriz(atividades), [atividades]);

  const resumo = useMemo(() => ({
    criticas: atividades.filter(a => a.prioridade >= 0.66).length,
    maior: Math.round(Math.max(...atividades.map(a => a.prioridade), 0) * 100),
    sensivel: Object.entries(atividades.reduce((acc, a) => {
      acc[a.disciplina] = (acc[a.disciplina] || 0) + a.prioridade;
      return acc;
    }, {} as any)).sort((a: any, b: any) => b[1] - a[1])[0]?.[0] || '-'
  }), [atividades]);

  return (
    <div className="bg-white border border-[#E5E7EB] rounded-[12px] p-6 flex flex-col h-full overflow-hidden font-sans">
      <div className="mb-4 shrink-0">
        <h3 className="text-[16px] font-black text-[#2D2D2D] uppercase tracking-tight leading-none">Matriz de Priorização</h3>
        <p className="text-[11px] text-[#757575] font-medium mt-1">Radar de criticidade por dificuldade e importância</p>

        <div className="flex flex-wrap gap-2 mt-4">
          <ChipResumo label="Atividades críticas" valor={resumo.criticas} color="text-[#EF4444]" />
          <ChipResumo label="Maior prioridade" valor={`${resumo.maior}%`} color="text-[#F05D28]" />
          <ChipResumo label="Disciplina mais sensível" valor={resumo.sensivel} color="text-[#1E40AF]" />
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-4 text-[9px] font-bold text-[#757575] uppercase border-t pt-3">
          <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 bg-[#10B981] rounded-sm" /> Baixa</div>
          <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 bg-[#FACC15] rounded-sm" /> Atenção</div>
          <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 bg-[#F59E0B] rounded-sm" /> Alta</div>
          <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 bg-[#EF4444] rounded-sm" /> Crítica</div>
          <div className="text-gray-400 ml-auto">Centro=Número deAtividades</div>
        </div>
      </div>

      <div className="relative flex-1 flex flex-col items-center justify-center py-4 bg-gray-50/30 rounded-xl border border-gray-50">
        <div className="flex items-stretch">
          {/* EIXO Y */}
          <div className="flex items-center pr-3">
            <div className="text-[10px] font-black text-[#2D2D2D] uppercase tracking-[2px] -rotate-90 whitespace-nowrap">
              Importância
            </div>
            <div className="flex flex-col justify-between py-1 h-full text-[11px] font-black text-[#757575] ml-1">
              {EIXO_Y.map(v => <div key={v} className="h-14 flex items-center justify-center">{v}</div>)}
            </div>
          </div>

          {/* GRID: Sem porcentagem para maior clareza */}
          <div className="grid grid-cols-5 gap-2 p-1.5">
            {EIXO_Y.map(imp => EIXO_X.map(dif => {
              const cell = matriz.get(`${imp}-${dif}`);
              const isAtiva = (cell?.quantidade || 0) > 0;
              return (
                <button
                  key={`${imp}-${dif}`}
                  onClick={() => isAtiva && setSelectedKey(selectedKey === cell?.key ? null : cell!.key)}
                  className={`relative w-12 h-12 sm:w-14 sm:h-14 rounded-lg flex items-center justify-center transition-all outline-none ${getCorCelula(cell?.prioridadeMaxima || 0, cell?.quantidade || 0)} ${isAtiva ? 'hover:scale-105 shadow-md active:scale-95' : 'cursor-default'} ${selectedKey === cell?.key ? 'ring-2 ring-black ring-offset-2' : ''}`}
                >
                  {isAtiva && (
                    <span className="text-white text-lg font-black drop-shadow-md">{cell!.quantidade}</span>
                  )}
                </button>
              );
            }))}
          </div>
        </div>

        {/* EIXO X */}
        <div className="mt-2 ml-12 w-full max-w-[280px] sm:max-w-[320px]">
          <div className="grid grid-cols-5 text-[11px] font-black text-[#757575] text-center mb-1">
            {EIXO_X.map(v => <div key={v}>{v}</div>)}
          </div>
          <div className="text-[10px] font-black text-[#2D2D2D] uppercase tracking-[2px] text-center">
            Grau de Dificuldade
          </div>
        </div>

        {/* DETALHES (OVERLAY) */}
        {selectedKey && (
          <div className="absolute inset-0 bg-white/98 z-30 p-4 overflow-y-auto animate-in fade-in zoom-in duration-200 border rounded-xl shadow-2xl">
            <div className="flex justify-between items-center mb-4 border-b pb-2">
              <h4 className="text-[12px] font-black uppercase text-brand">Atividades na Célula ({matriz.get(selectedKey)?.quantidade})</h4>
              <button onClick={() => setSelectedKey(null)} className="p-1 hover:bg-gray-100 rounded-full transition-colors"><X size={20} /></button>
            </div>
            <div className="space-y-3">
              {matriz.get(selectedKey)?.atividades.map(at => (
                <div key={at.id} className="bg-gray-50 p-3 rounded-lg border-l-4 border-brand shadow-sm">
                  <p className="text-[11px] font-black text-[#2D2D2D] leading-snug">{at.descricao}</p>
                  <p className="text-[9px] font-bold text-gray-500 uppercase mt-1.5">{at.disciplina} • {at.percentualConcluido}% concluído</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}