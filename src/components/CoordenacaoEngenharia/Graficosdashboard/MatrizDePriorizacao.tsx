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

interface FiltrosLocais {
  contrato: string;
  os: string;
  importancia: string;
  dificuldade: string;
}

interface MatrizDePriorizacaoProps {
  tableFiltrada: Atividade[];
  maxPrazo: number;
  filtros: FiltrosLocais;
  contractOptions: Array<{ codigo: string; nome: string }>;
  osOptions: Array<{ codigo: string; nome: string }>;
  onFiltroChange: (key: keyof FiltrosLocais, value: string) => void;
}

interface AtividadeComPeso extends Atividade {
  peso: number;
}

interface CellStats {
  key: string;
  imp: number;
  dif: number;
  atividades: AtividadeComPeso[];
  quantidade: number;
  pesoMaximo: number;
}

const EIXO_Y = [3, 2, 1];
const EIXO_X = [1, 2, 3];

function enriquecerAtividades(atividades: Atividade[]): AtividadeComPeso[] {
  return (atividades || []).map((atividade) => ({
    ...atividade,
    peso: Math.max(1, Number(atividade.importancia || 1)) * Math.max(1, Number(atividade.dificuldade || 1)),
  }));
}

function montarMatriz(atividades: AtividadeComPeso[]) {
  const matriz = new Map<string, CellStats>();
  for (const imp of EIXO_Y) {
    for (const dif of EIXO_X) {
      const atividadesDaCelula = atividades.filter((item) => Number(item.importancia) === imp && Number(item.dificuldade) === dif);
      matriz.set(`${imp}-${dif}`, {
        key: `${imp}-${dif}`,
        imp,
        dif,
        atividades: atividadesDaCelula,
        quantidade: atividadesDaCelula.length,
        pesoMaximo: atividadesDaCelula.length > 0 ? Math.max(...atividadesDaCelula.map((item) => item.peso)) : 0,
      });
    }
  }
  return matriz;
}

function getCriticidade(imp: number, dif: number) {
  if (imp === 3 && dif === 3) return 'critica';
  if (imp === 3 && dif === 2) return 'alta';
  if (imp === 2 && dif === 3) return 'alta';
  if (imp === 3) return 'prioritaria';
  if (imp === 2 && dif === 2) return 'atencao';
  return 'rotina';
}

function getCorCelula(peso: number, quantidade: number, imp: number, dif: number) {
  if (quantidade === 0) return 'bg-gray-50 border border-dashed border-gray-200';
  const criticidade = getCriticidade(imp, dif);
  if (criticidade === 'critica') return 'bg-[#B91C1C]';
  if (criticidade === 'alta') return 'bg-[#EF4444]';
  if (criticidade === 'prioritaria') return 'bg-[#F59E0B]';
  if (criticidade === 'atencao') return 'bg-[#FACC15]';
  return peso >= 3 ? 'bg-[#60A5FA]' : 'bg-[#10B981]';
}

const ChipResumo = ({ label, valor, color }: { label: string; valor: any; color: string }) => (
  <div className="px-3 py-1.5 rounded-full bg-[#F8F9FA] border border-[#E5E7EB] flex items-center gap-2 shrink-0">
    <span className="text-[10px] font-bold text-[#2D2D2D] uppercase">{label}:</span>
    <span className={`text-[10px] font-black ${color}`}>{valor}</span>
  </div>
);

export default function MatrizDePriorizacao({ tableFiltrada, filtros, contractOptions, osOptions, onFiltroChange }: MatrizDePriorizacaoProps) {
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const atividades = useMemo(() => enriquecerAtividades(tableFiltrada), [tableFiltrada]);
  const matriz = useMemo(() => montarMatriz(atividades), [atividades]);

  const resumo = useMemo(() => ({
    criticas: atividades.filter((item) => Number(item.importancia) === 3 && Number(item.dificuldade) >= 2).length,
    maior: Math.max(...atividades.map((item) => item.peso), 0),
    sensivel: (Object.entries(atividades.reduce((acc, item) => {
      acc[item.disciplina] = (acc[item.disciplina] || 0) + item.peso;
      return acc;
    }, {} as Record<string, number>)) as Array<[string, number]>).sort((a, b) => b[1] - a[1])[0]?.[0] || '-',
  }), [atividades]);

  return (
    <div className="flex flex-col min-h-[520px] h-full overflow-hidden font-sans">
      <div className="mb-4 shrink-0">
        <div className="flex flex-col gap-3">
          <div>
            <h3 className="text-[16px] font-black text-[#2D2D2D] uppercase tracking-tight leading-none">Matriz de Priorizacao</h3>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 mt-4">
          <ChipResumo label="Atividades criticas" valor={resumo.criticas} color="text-[#EF4444]" />
          <ChipResumo label="Maior peso" valor={resumo.maior} color="text-[#F05D28]" />
          <ChipResumo label="Disciplina sensivel" valor={resumo.sensivel} color="text-[#1E40AF]" />
        </div>
      </div>

      <div className="relative flex-1 flex flex-col items-center justify-center px-3 py-4 bg-gray-50/30 rounded-xl border border-gray-50 min-h-[420px]">
        <div className="flex items-stretch">
          <div className="flex items-center pr-3">
            <div className="text-[10px] font-black text-[#2D2D2D] uppercase tracking-[2px] -rotate-90 whitespace-nowrap">
              Importancia
            </div>
            <div className="flex flex-col justify-between py-1 h-full text-[11px] font-black text-[#757575] ml-1">
              {EIXO_Y.map((value) => <div key={value} className="h-24 flex items-center justify-center">{value}</div>)}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 p-2">
            {EIXO_Y.map((imp) => EIXO_X.map((dif) => {
              const cell = matriz.get(`${imp}-${dif}`);
              const isAtiva = (cell?.quantidade || 0) > 0;
              return (
                <button
                  key={`${imp}-${dif}`}
                  onClick={() => isAtiva && setSelectedKey(selectedKey === cell?.key ? null : cell!.key)}
                  className={`relative w-20 h-20 sm:w-24 sm:h-24 rounded-xl flex items-center justify-center transition-all outline-none ${getCorCelula(cell?.pesoMaximo || 0, cell?.quantidade || 0, imp, dif)} ${isAtiva ? 'hover:scale-105 shadow-md active:scale-95' : 'cursor-default'} ${selectedKey === cell?.key ? 'ring-2 ring-black ring-offset-2' : ''}`}
                >
                  {isAtiva && <span className="text-white text-[22px] font-black drop-shadow-md">{cell!.quantidade}</span>}
                </button>
              );
            }))}
          </div>
        </div>

        <div className="mt-3 ml-12 w-full max-w-[320px]">
          <div className="grid grid-cols-3 text-[12px] font-black text-[#757575] text-center mb-1">
            {EIXO_X.map((value) => <div key={value}>{value}</div>)}
          </div>
          <div className="text-[10px] font-black text-[#2D2D2D] uppercase tracking-[2px] text-center">
            Dificuldade
          </div>
        </div>

        {selectedKey && (
          <div className="absolute inset-0 bg-white/98 z-30 p-4 overflow-y-auto animate-in fade-in zoom-in duration-200 border rounded-xl shadow-2xl">
            <div className="flex justify-between items-center mb-4 border-b pb-2">
              <h4 className="text-[12px] font-black uppercase text-brand">Atividades na Celula ({matriz.get(selectedKey)?.quantidade})</h4>
              <button onClick={() => setSelectedKey(null)} className="p-1 hover:bg-gray-100 rounded-full transition-colors"><X size={20} /></button>
            </div>
            <div className="space-y-3">
              {matriz.get(selectedKey)?.atividades.map((atividade) => (
                <div key={atividade.id} className="bg-gray-50 p-3 rounded-lg border-l-4 border-brand shadow-sm">
                  <p className="text-[11px] font-black text-[#2D2D2D] leading-snug">{atividade.descricao}</p>
                  <p className="text-[9px] font-bold text-gray-500 uppercase mt-1.5">{atividade.disciplina} - importancia {atividade.importancia} - dificuldade {atividade.dificuldade} - peso {atividade.peso}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
