import React, { useMemo } from 'react';

interface Atividade {
  os: string;
  osCodigo?: string;
  osNome?: string;
  disciplina: string;
}

interface HeatmapAlocacaoProps {
  dados?: Atividade[];
}

function getHeatmapColor(valor: number, maxValor: number) {
  if (valor <= 0 || maxValor <= 0) return 'bg-[#E2E8F0]';
  const ratio = valor / maxValor;
  if (ratio <= 0.25) return 'bg-[#BFDBFE]';
  if (ratio <= 0.5) return 'bg-[#60A5FA]';
  if (ratio <= 0.75) return 'bg-[#F59E0B]';
  return 'bg-[#F05D28]';
}

export default function HeatmapAlocacao({ dados = [] }: HeatmapAlocacaoProps) {
  const { matriz, disciplinas, osLabels, maxValor } = useMemo(() => {
    const disciplinasSet = new Set<string>();
    const osMap = new Map<string, string>();
    const matrix: Record<string, Record<string, number>> = {};

    dados.forEach((atividade) => {
      const disciplina = String(atividade?.disciplina || '').trim() || 'Sem disciplina';
      const osCodigo = String(atividade?.osCodigo || atividade?.os || '').trim() || 'Sem OS';
      const osNome = String(atividade?.osNome || atividade?.os || '').trim() || osCodigo;

      disciplinasSet.add(disciplina);
      if (!osMap.has(osCodigo)) osMap.set(osCodigo, osNome);
      if (!matrix[disciplina]) matrix[disciplina] = {};
      matrix[disciplina][osCodigo] = (matrix[disciplina][osCodigo] || 0) + 1;
    });

    const disciplinasArray = Array.from(disciplinasSet);
    const osEntries = Array.from(osMap.entries()).map(([codigo, nome]) => ({ codigo, nome }));

    disciplinasArray.forEach((disciplina) => {
      if (!matrix[disciplina]) matrix[disciplina] = {};
      osEntries.forEach((os) => {
        if (matrix[disciplina][os.codigo] === undefined) matrix[disciplina][os.codigo] = 0;
      });
    });

    const max = Math.max(
      0,
      ...disciplinasArray.flatMap((disciplina) => osEntries.map((os) => matrix[disciplina][os.codigo] || 0))
    );

    return {
      matriz: matrix,
      disciplinas: disciplinasArray,
      osLabels: osEntries,
      maxValor: max,
    };
  }, [dados]);

  if (!disciplinas.length || !osLabels.length) {
    return (
      <div className="bg-white border border-[#E5E7EB] rounded-[12px] p-6 sm:p-8 flex flex-col w-full font-['Montserrat']">
        <h3 className="text-base font-bold text-[#2D2D2D] tracking-tight mb-4">Alocacao de Disciplina por OS</h3>
        <div className="rounded-xl border border-dashed border-[#CBD5E1] bg-[#F8FAFC] py-12 px-6 text-center text-[13px] font-medium text-[#64748B]">
          Nenhuma atividade encontrada para montar o mapa de alocacao.
        </div>
      </div>
    );
  }

  const minWidth = Math.max(780, osLabels.length * 140);

  return (
    <div className="bg-white border border-[#E5E7EB] rounded-[12px] p-6 sm:p-8 flex flex-col w-full font-['Montserrat']">
      <div className="flex flex-col md:flex-row md:items-end justify-between mb-8 gap-4">
        <div>
          <h3 className="text-base font-bold text-[#2D2D2D] tracking-tight">Alocacao de Disciplina por OS</h3>
        </div>

        <div className="flex items-center gap-2 text-[11px] font-semibold text-[#757575]">
          <span>0</span>
          <div className="flex h-3 w-32 overflow-hidden rounded-sm">
            <div className="flex-1 bg-[#E2E8F0]" />
            <div className="flex-1 bg-[#BFDBFE]" />
            <div className="flex-1 bg-[#60A5FA]" />
            <div className="flex-1 bg-[#F59E0B]" />
            <div className="flex-1 bg-[#F05D28]" />
          </div>
          <span>{maxValor}</span>
        </div>
      </div>

      <div className="w-full overflow-x-auto no-scrollbar">
        <div className="flex" style={{ minWidth: `${minWidth}px` }}>
          <div className="flex flex-col pr-4 shrink-0 justify-between">
            {disciplinas.map((disciplina) => (
              <div
                key={disciplina}
                className="h-14 flex items-center justify-end text-[11px] text-[#757575] font-medium text-right w-40"
              >
                {disciplina}
              </div>
            ))}
          </div>

          <div className="flex flex-col flex-1">
            <div className="flex flex-col w-full">
              {disciplinas.map((disciplina, index) => (
                <div
                  key={disciplina}
                  className={`flex w-full h-14 ${index !== disciplinas.length - 1 ? 'border-b border-white/30' : ''}`}
                >
                  {osLabels.map((os) => {
                    const valor = matriz[disciplina][os.codigo] || 0;
                    return (
                      <div
                        key={`${disciplina}-${os.codigo}`}
                        className={`flex-1 flex items-center justify-center text-[12px] font-bold text-[#1F2937] transition-opacity hover:opacity-85 cursor-default ${getHeatmapColor(valor, maxValor)}`}
                        title={`${disciplina} em ${os.nome}: ${valor} profissional(is)`}
                      >
                        {valor > 0 ? valor : ''}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>

            <div className="flex w-full mt-3">
              {osLabels.map((os) => (
                <div key={os.codigo} className="flex-1 text-center text-[11px] text-[#757575] font-medium px-2">
                  {os.nome}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
