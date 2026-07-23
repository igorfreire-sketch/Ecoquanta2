import React from 'react';

const raciData = [
  { tarefa: 'Levantamento de Campo', coordenacao: 'A', engenharia: 'R', suprimentos: 'I', obra: 'C' },
  { tarefa: 'Projeto Básico', coordenacao: 'A', engenharia: 'R', suprimentos: 'I', obra: 'I' },
  { tarefa: 'Projeto Executivo', coordenacao: 'A', engenharia: 'R', suprimentos: 'C', obra: 'C' },
  { tarefa: 'Especificação Técnica', coordenacao: 'I', engenharia: 'R', suprimentos: 'A', obra: 'I' },
  { tarefa: 'Aprovação de Materiais', coordenacao: 'C', engenharia: 'A', suprimentos: 'R', obra: 'C' },
  { tarefa: 'As Built', coordenacao: 'A', engenharia: 'C', suprimentos: 'I', obra: 'R' },
];

const Matrix: React.FC = () => {
  const getBadge = (role: string) => {
    const colors: Record<string, string> = {
      'R': 'bg-blue-100 text-blue-700 border-blue-200',
      'A': 'bg-orange-100 text-orange-700 border-orange-200',
      'C': 'bg-purple-100 text-purple-700 border-purple-200',
      'I': 'bg-gray-100 text-gray-700 border-gray-200',
    };
    
    const labels: Record<string, string> = {
      'R': 'Responsible',
      'A': 'Accountable',
      'C': 'Consulted',
      'I': 'Informed',
    };

    return (
      <div className={`w-8 h-8 rounded-lg border flex items-center justify-center font-bold text-xs ${colors[role]}`} title={labels[role]}>
        {role}
      </div>
    );
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="bg-white p-8 rounded-2xl shadow-[0_10px_30px_-22px_rgba(15,23,42,0.45)]">
        <div className="mb-8">
          <p className="text-[10px] font-extrabold uppercase tracking-[1.2px] text-[#94A3B8]">Engenharia</p>
          <h2 className="text-[18px] font-black text-[#2D2D2D] mt-0.5">Matriz RACI de Engenharia</h2>
          <p className="text-[13px] text-[#757575] mt-1">Definição de responsabilidades por processo</p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className="py-4 px-6 text-left text-[11px] font-bold text-[#757575] uppercase tracking-widest">Atividade / Processo</th>
                <th className="py-4 px-4 text-center text-[11px] font-bold text-[#757575] uppercase tracking-widest">Coordenação</th>
                <th className="py-4 px-4 text-center text-[11px] font-bold text-[#757575] uppercase tracking-widest">Engenharia</th>
                <th className="py-4 px-4 text-center text-[11px] font-bold text-[#757575] uppercase tracking-widest">Suprimentos</th>
                <th className="py-4 px-4 text-center text-[11px] font-bold text-[#757575] uppercase tracking-widest">Obra</th>
              </tr>
            </thead>
            <tbody>
              {raciData.map((row, idx) => (
                <tr key={idx} className="even:bg-[#F8F9FA] hover:bg-[#F4F5F7] transition-colors">
                  <td className="py-4 px-6 text-[14px] font-medium text-[#2D2D2D]">{row.tarefa}</td>
                  <td className="py-4 px-4"><div className="flex justify-center">{getBadge(row.coordenacao)}</div></td>
                  <td className="py-4 px-4"><div className="flex justify-center">{getBadge(row.engenharia)}</div></td>
                  <td className="py-4 px-4"><div className="flex justify-center">{getBadge(row.suprimentos)}</div></td>
                  <td className="py-4 px-4"><div className="flex justify-center">{getBadge(row.obra)}</div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-10 pt-2 flex flex-wrap gap-6">
          <div className="flex items-center gap-3">
            <div className="w-6 h-6 rounded bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-[10px]">R</div>
            <span className="text-xs text-[#757575]"><strong>Responsible:</strong> Quem executa a tarefa</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-6 h-6 rounded bg-orange-100 text-orange-700 flex items-center justify-center font-bold text-[10px]">A</div>
            <span className="text-xs text-[#757575]"><strong>Accountable:</strong> Quem aprova e responde pela tarefa</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-6 h-6 rounded bg-purple-100 text-purple-700 flex items-center justify-center font-bold text-[10px]">C</div>
            <span className="text-xs text-[#757575]"><strong>Consulted:</strong> Quem deve ser consultado</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-6 h-6 rounded bg-gray-100 text-gray-700 flex items-center justify-center font-bold text-[10px]">I</div>
            <span className="text-xs text-[#757575]"><strong>Informed:</strong> Quem deve ser informado</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Matrix;

