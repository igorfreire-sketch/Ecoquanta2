import React, { useMemo, useState } from 'react';
import { Mail, Send, X } from 'lucide-react';
import {
  buildProfessionalDisciplineMaps,
  extractParticipantAssignments,
  getRegistroActivities,
  isAllContract,
  normalizeText,
} from './utils/registroAtividades';

interface Professional {
  name: string;
  total: string;
  contratos: Record<string, string>;
}

interface AlocacaoData {
  id: string;
  disciplina: string;
  tituloCard: string;
  profissionais: Professional[];
}

interface DisciplineCardProps {
  title: string;
  professionals: Professional[];
  contratos: string[];
}

interface AlocacoesProps {
  preloadedData?: {
    registro?: any;
    admin?: any;
  };
  activeContractCode?: string;
  dadosTabela?: Array<{
    activityId: string;
    profissional: string;
    profissionalEmail: string;
    disciplina: string;
    contratoCodigo: string;
    participacaoProfissional: number;
  }>;
}

type Assignment = {
  key: string;
  nome: string;
  email: string;
  disciplina: string;
  contrato: string;
  atividadeId: string;
  peso: number;
};

function formatPercent(value: number) {
  return `${Math.round(value * 10) / 10}`.replace('.', ',') + '%';
}

function getVisibleActivities(preloadedData?: AlocacoesProps['preloadedData'], activeContractCode?: string) {
  const activities = getRegistroActivities(preloadedData?.registro);
  if (isAllContract(activeContractCode)) return activities;

  const target = normalizeText(activeContractCode);
  return activities.filter((activity: any) => (
    normalizeText(activity?.contratoCodigo) === target
    || normalizeText(activity?.contratoNome) === target
  ));
}

const DisciplineCard: React.FC<DisciplineCardProps> = ({ title, professionals, contratos }) => {
  const renderValue = (value: string) => {
    if (value === '100,0%') return <span className="text-[#F05D28] font-medium">{value}</span>;
    if (value === '0,0%') return <span className="text-[#757575]">{value}</span>;
    return <span className="text-[#2D2D2D]">{value}</span>;
  };

  return (
    <div className="bg-white border border-[#E5E7EB] rounded-xl overflow-hidden shadow-sm">
      <div className="p-5 border-b border-[#E5E7EB] flex items-center justify-between">
        <h3 className="text-[16px] font-bold text-[#2D2D2D]">{title}</h3>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-[#EF4444]" />
            <span className="text-[11px] text-[#757575]">Ocupado</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-[#10B981]" />
            <span className="text-[11px] text-[#757575]">Em dia</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-[#F59E0B]" />
            <span className="text-[11px] text-[#757575]">Atrasos</span>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-[#F9FAFB]">
              <th className="py-3 px-5 text-[11px] font-bold text-[#757575] uppercase tracking-wider">Profissional</th>
              <th className="py-3 px-4 text-[11px] font-bold text-[#757575] uppercase tracking-wider text-center">Total</th>
              {contratos.map((contrato) => (
                <th key={contrato} className="py-3 px-4 text-[11px] font-bold text-[#757575] uppercase tracking-wider text-center">{contrato}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {professionals.length > 0 ? (
              professionals.map((prof, index) => (
                <tr key={`${prof.name}-${index}`} className="border-b border-[#E5E7EB] last:border-0">
                  <td className="py-3.5 px-5 text-[13px] text-[#2D2D2D] font-medium">{prof.name}</td>
                  <td className="py-3.5 px-4 text-[13px] text-center">{renderValue(prof.total)}</td>
                  {contratos.map((contrato) => (
                    <td key={contrato} className="py-3.5 px-4 text-[13px] text-center">{renderValue(prof.contratos[contrato] || '0,0%')}</td>
                  ))}
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={Math.max(2 + contratos.length, 2)} className="py-8 px-5 text-center text-[13px] text-[#757575] font-medium">
                  Nenhum profissional cadastrado nesta disciplina.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

function buildAssignments(preloadedData?: AlocacoesProps['preloadedData'], activeContractCode?: string, dadosTabela?: AlocacoesProps['dadosTabela']): Assignment[] {
  if (Array.isArray(dadosTabela) && dadosTabela.length > 0) {
    return dadosTabela.map((item, index) => ({
      key: `${item.activityId}-${item.profissionalEmail || item.profissional}-${index}`,
      nome: item.profissional,
      email: item.profissionalEmail,
      disciplina: item.disciplina,
      contrato: item.contratoCodigo,
      atividadeId: item.activityId,
      peso: item.participacaoProfissional || 0,
    }));
  }

  const maps = buildProfessionalDisciplineMaps(preloadedData?.registro, preloadedData?.admin);
  const activities = getVisibleActivities(preloadedData, activeContractCode);

  return activities.flatMap((activity: any, index: number) => {
    if (String(activity?.status || '').trim().toLowerCase() === 'concluida') return [];
    const contrato = String(activity?.contratoCodigo || '').trim();
    const participants = extractParticipantAssignments(activity, maps);
    const peso = participants.length > 0 ? 100 / participants.length : 100;
    return participants.map((participant, participantIndex) => ({
      key: `${String(activity?.activityId || activity?.id || activity?.itemCodigo || index)}-${participant.email || participant.nome}-${participantIndex}`,
      nome: participant.nome,
      email: participant.email,
      disciplina: participant.disciplina,
      contrato,
      atividadeId: String(activity?.activityId || activity?.id || activity?.itemCodigo || index),
      peso,
    }));
  });
}

function getDisciplinas(preloadedData?: AlocacoesProps['preloadedData'], assignments: Assignment[] = []) {
  const fromAdmin = Array.isArray(preloadedData?.admin?.disciplinas) ? preloadedData.admin.disciplinas : [];
  const fromRegistro = Array.isArray(preloadedData?.registro?.usersSummary)
    ? preloadedData.registro.usersSummary.map((user: any) => String(user?.disciplina || '').trim()).filter(Boolean)
    : [];
  const fromAssignments = assignments.map((item) => String(item.disciplina || '').trim()).filter(Boolean);
  return Array.from(new Set([...fromAdmin, ...fromRegistro, ...fromAssignments].map(String).map((item) => item.trim()).filter(Boolean)));
}

function getProfessionalsByDisciplina(preloadedData?: AlocacoesProps['preloadedData'], assignments: Assignment[] = []) {
  const out: Record<string, Array<{ nome: string; email: string; disciplina: string }>> = {};
  const seen = new Set<string>();
  const professionalsByDisciplina = preloadedData?.registro?.professionalsByDisciplina || {};

  Object.keys(professionalsByDisciplina).forEach((disciplina) => {
    const list = Array.isArray(professionalsByDisciplina[disciplina]) ? professionalsByDisciplina[disciplina] : [];
    list.forEach((prof: any) => {
      const nome = String(prof?.nome || '').trim();
      const email = String(prof?.email || '').trim();
      const disciplinaAtual = String(prof?.disciplina || disciplina || '').trim();
      const key = `${normalizeText(nome)}|${normalizeText(email)}`;
      if (!nome || seen.has(key)) return;
      seen.add(key);

      const bucket = normalizeText(disciplinaAtual);
      if (!out[bucket]) out[bucket] = [];
      out[bucket].push({ nome, email, disciplina: disciplinaAtual });
    });
  });

  assignments.forEach((assignment) => {
    const key = `${normalizeText(assignment.nome)}|${normalizeText(assignment.email)}`;
    if (seen.has(key)) return;
    seen.add(key);

    const bucket = normalizeText(assignment.disciplina);
    if (!out[bucket]) out[bucket] = [];
    out[bucket].push({
      nome: assignment.nome,
      email: assignment.email,
      disciplina: assignment.disciplina,
    });
  });

  return out;
}

function getContratosAtivos(assignments: Assignment[]) {
  return Array.from(new Set(assignments.map((item) => item.contrato).filter(Boolean)));
}

function buildAlocacoes(preloadedData?: AlocacoesProps['preloadedData'], contratos: string[] = [], activeContractCode?: string): AlocacaoData[] {
  const assignments = buildAssignments(preloadedData, activeContractCode);
  const disciplinas = getDisciplinas(preloadedData, assignments);
  const professionalsByDisciplina = getProfessionalsByDisciplina(preloadedData, assignments);
  const effortByPerson: Record<string, number> = {};
  const effortByContractAndPerson: Record<string, Record<string, number>> = {};
  const totalByDisciplina: Record<string, number> = {};

  assignments.forEach((assignment) => {
    const personKey = normalizeText(assignment.email) || normalizeText(assignment.nome);
    if (!personKey) return;
    const disciplinaKey = normalizeText(assignment.disciplina);
    effortByPerson[`${disciplinaKey}|${personKey}`] = (effortByPerson[`${disciplinaKey}|${personKey}`] || 0) + assignment.peso;
    if (!effortByContractAndPerson[`${disciplinaKey}|${personKey}`]) effortByContractAndPerson[`${disciplinaKey}|${personKey}`] = {};
    effortByContractAndPerson[`${disciplinaKey}|${personKey}`][assignment.contrato] = (effortByContractAndPerson[`${disciplinaKey}|${personKey}`][assignment.contrato] || 0) + assignment.peso;
    totalByDisciplina[disciplinaKey] = (totalByDisciplina[disciplinaKey] || 0) + assignment.peso;
  });

  return disciplinas.map((disciplina) => {
    const profissionais = professionalsByDisciplina[normalizeText(disciplina)] || [];
    const disciplinaKey = normalizeText(disciplina);
    const totalDisciplina = Math.max(totalByDisciplina[disciplinaKey] || 0, 1);

    return {
      id: disciplina,
      disciplina,
      tituloCard: disciplina,
      profissionais: profissionais.map((prof) => {
        const personKey = normalizeText(prof.email) || normalizeText(prof.nome);
        const registryKey = `${disciplinaKey}|${personKey}`;
        const count = effortByPerson[registryKey] || 0;
        const total = count > 0 ? Math.min(100, (count / totalDisciplina) * 100) : 0;
        const contractCounts = effortByContractAndPerson[registryKey] || {};
        const contratosPercentuais = contratos.reduce((acc, contrato) => {
          acc[contrato] = totalDisciplina > 0 ? formatPercent(((contractCounts[contrato] || 0) / totalDisciplina) * 100) : '0,0%';
          return acc;
        }, {} as Record<string, string>);

        return {
          name: prof.nome,
          total: formatPercent(total),
          contratos: contratosPercentuais,
        };
      }),
    };
  });
}

const Alocacoes: React.FC<AlocacoesProps> = ({ preloadedData, activeContractCode, dadosTabela }) => {
  const [filtroAtivo, setFiltroAtivo] = useState<string | null>(null);
  const assignments = useMemo(() => buildAssignments(preloadedData, activeContractCode, dadosTabela), [preloadedData, activeContractCode, dadosTabela]);
  const contratos = useMemo(() => getContratosAtivos(assignments), [assignments]);
  const dadosAlocacoes = useMemo(() => buildAlocacoes(preloadedData, contratos, activeContractCode), [preloadedData, contratos, activeContractCode]);
  const disciplinasLista = dadosAlocacoes.map((item) => item.disciplina);

  const cardsFiltrados = filtroAtivo
    ? dadosAlocacoes.filter((d) => d.disciplina === filtroAtivo)
    : dadosAlocacoes;

  return (
    <div className="min-h-full bg-[#F8F9FA] font-['Montserrat']">
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-6 mb-8">
        <div className="flex flex-wrap items-center gap-2">
          {disciplinasLista.map((disciplina) => (
            <button
              key={disciplina}
              onClick={() => setFiltroAtivo(disciplina)}
              className={`px-4 py-2 rounded-full text-[12px] font-medium transition-all border ${
                filtroAtivo === disciplina
                  ? 'bg-[#F05D28]/10 border-[#F05D28] text-[#F05D28]'
                  : 'bg-white border-[#E5E7EB] text-[#757575] hover:bg-gray-50'
              }`}
            >
              {disciplina}
            </button>
          ))}

          {filtroAtivo !== null && (
            <button
              onClick={() => setFiltroAtivo(null)}
              className="flex items-center gap-1 px-4 py-2 text-[12px] font-medium text-[#EF4444] hover:bg-red-50 rounded-full transition-all"
            >
              <X size={14} />
              Limpar Filtro
            </button>
          )}
        </div>

        <div className="flex items-center">
          <div className="relative flex-1 sm:w-64">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
              <Mail size={16} className="text-[#757575]" />
            </div>
            <input
              type="email"
              placeholder="Destinatarios..."
              disabled
              className="w-full h-11 pl-10 pr-4 bg-[#F8F9FA] border border-[#E5E7EB] rounded-l-xl text-[14px] focus:outline-none transition-all disabled:opacity-70"
            />
          </div>
          <button disabled className="h-11 px-6 bg-[#F05D28] text-white text-[14px] font-bold rounded-r-xl flex items-center gap-2 transition-all disabled:opacity-60 disabled:cursor-not-allowed">
            <Send size={16} />
            Enviar Relatorio
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {cardsFiltrados.map((item) => (
          <DisciplineCard
            key={item.id}
            title={item.tituloCard}
            professionals={item.profissionais}
            contratos={contratos}
          />
        ))}
      </div>
    </div>
  );
};

export default Alocacoes;
