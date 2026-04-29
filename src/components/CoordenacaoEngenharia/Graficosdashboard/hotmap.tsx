import React, { useMemo } from 'react';

// --- INTERFACES E MOCK DATA ---
interface Atividade {
  os: string;
  disciplina: string;
  alocacao: number;
}

const mockAtividades: Atividade[] = [
  { os: 'Jan', disciplina: 'Translator', alocacao: 120 },
  { os: 'Jan', disciplina: 'Data Architect', alocacao: 50 },
  { os: 'Mar', disciplina: 'I/O Psychologist', alocacao: 90 },
  { os: 'Mar', disciplina: 'Data Scientist', alocacao: 20 },
  { os: 'May', disciplina: 'Translator', alocacao: 150 },
  { os: 'May', disciplina: 'Data Analyst', alocacao: 30 },
  { os: 'Jul', disciplina: 'Data Architect', alocacao: 45 },
  { os: 'Sep', disciplina: 'I/O Psychologist', alocacao: 100 },
  { os: 'Sep', disciplina: 'Data Scientist', alocacao: 15 },
  { os: 'Nov', disciplina: 'Data Analyst', alocacao: 80 },
];

const DISCIPLINAS = [
  'D&I Specialist',
  'Data Analyst',
  'Data Architect',
  'Data Scientist',
  'I/O Psychologist',
  'People Analytics Intern',
  'People Analytics Manager',
  'Translator'
];

// Eixo X simulado igual à sua referência (meses/períodos ao invés de OSs numéricas, mas mantendo a lógica)
const MESES_REFERENCIA = ['Jan', 'Mar', 'May', 'Jul', 'Sep', 'Nov'];

// --- MOTOR DE CORES DO HEATMAP ---
// Cores ajustadas para formar um bloco sólido. O 0 (vazio) ganha uma cor cinza/azulada base.
const getHeatmapColor = (valor: number) => {
  if (valor === 0) return 'bg-[#94A3B8]'; // Cinza Slate (Base sólida para 0)
  if (valor <= 30) return 'bg-[#7DA5D3]'; // Azul Claro
  if (valor <= 60) return 'bg-[#5B8CBF]'; // Azul Médio
  if (valor <= 90) return 'bg-[#F2A65A]'; // Laranja Claro
  if (valor <= 110) return 'bg-[#EA842A]'; // Laranja Forte
  return 'bg-[#C2541B]'; // Vermelho Escuro / Laranja Queimado (Sobrecarga)
};

export default function HeatmapAlocacao() {

  // --- LÓGICA DE AGREGAÇÃO ---
  const { matriz, ossUnicas } = useMemo(() => {
    // Usando a ordem exata da referência para o eixo X
    const ossArray = MESES_REFERENCIA;

    const m: Record<string, Record<string, number>> = {};

    DISCIPLINAS.forEach(disc => {
      m[disc] = {};
      ossArray.forEach(os => {
        m[disc][os] = 0;
      });
    });

    mockAtividades.forEach(ativ => {
      if (m[ativ.disciplina] && m[ativ.disciplina][ativ.os] !== undefined) {
        m[ativ.disciplina][ativ.os] += ativ.alocacao;
      }
    });

    return { matriz: m, ossUnicas: ossArray };
  }, []);

  return (
    <div className="bg-white border border-[#E5E7EB] rounded-[12px] p-6 sm:p-8 flex flex-col w-full font-['Montserrat']">

      {/* CABEÇALHO E LEGENDA */}
      <div className="flex flex-col md:flex-row md:items-end justify-between mb-8 gap-4">
        <div>
          <h3 className="text-base font-bold text-[#2D2D2D] tracking-tight">Utilization by Role</h3>
        </div>

        {/* LEGENDA DE CORES */}
        <div className="flex items-center gap-2 text-[11px] font-semibold text-[#757575]">
          <span>0%</span>
          <div className="flex h-3 w-32 overflow-hidden">
            <div className="flex-1 bg-[#94A3B8]"></div>
            <div className="flex-1 bg-[#7DA5D3]"></div>
            <div className="flex-1 bg-[#5B8CBF]"></div>
            <div className="flex-1 bg-[#F2A65A]"></div>
            <div className="flex-1 bg-[#EA842A]"></div>
            <div className="flex-1 bg-[#C2541B]"></div>
          </div>
          <span>352%</span>
        </div>
      </div>

      {/* =================== ÁREA DA MATRIZ (BLOCO CONTÍNUO) =================== */}
      <div className="w-full overflow-x-auto no-scrollbar">
        <div className="flex min-w-[800px]">

          {/* EIXO Y: LATERAL ESQUERDA (Disciplinas) */}
          <div className="flex flex-col pr-4 shrink-0 justify-between">
            {DISCIPLINAS.map(disciplina => (
              <div
                key={disciplina}
                className="h-12 flex items-center justify-end text-[11px] text-[#757575] font-medium text-right w-36"
              >
                {disciplina}
              </div>
            ))}
          </div>

          {/* ÁREA DO GRÁFICO E EIXO X */}
          <div className="flex flex-col flex-1">

            {/* CORPO DO HEATMAP (Blocos de cor colados) */}
            <div className="flex flex-col w-full">
              {DISCIPLINAS.map((disciplina, index) => (
                <div
                  key={disciplina}
                  className={`flex w-full h-12 ${index !== DISCIPLINAS.length - 1 ? 'border-b border-white/30' : ''}`}
                >
                  {ossUnicas.map(os => {
                    const valor = matriz[disciplina][os];
                    const colorClass = getHeatmapColor(valor);

                    return (
                      <div
                        key={`${disciplina}-${os}`}
                        className={`flex-1 transition-opacity hover:opacity-80 cursor-pointer ${colorClass}`}
                        title={`${disciplina} em ${os}: ${valor}% Alocado`}
                      >
                        {/* Omitindo os números dentro dos blocos para ficar idêntico à referência. 
                            Caso queira o número, basta adicionar {valor > 0 ? `${valor}%` : ''} aqui. */}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>

            {/* EIXO X: RODAPÉ (OSs / Meses) */}
            <div className="flex w-full mt-2">
              {ossUnicas.map(os => (
                <div key={os} className="flex-1 text-left text-[11px] text-[#757575] font-medium pl-1">
                  {os}
                </div>
              ))}
            </div>

          </div>
        </div>
      </div>

    </div>
  );
}