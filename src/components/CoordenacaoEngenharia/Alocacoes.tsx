import React, { useMemo, useState } from 'react';
import { ChevronDown, Mail, Send } from 'lucide-react';
import {
  buildProfessionalDisciplineMaps,
  extractParticipantAssignments,
  getRegistroActivities,
  isAllContract,
  normalizeText,
} from './utils/registroAtividades';
import { resolveDisciplineEntry } from '../../lib/disciplineCatalog';

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

function normalizeDisciplineLabel(value?: string) {
  return resolveDisciplineEntry(String(value || '').trim()) || String(value || '').trim();
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
      disciplina: normalizeDisciplineLabel(item.disciplina),
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
      disciplina: normalizeDisciplineLabel(participant.disciplina),
      contrato,
      atividadeId: String(activity?.activityId || activity?.id || activity?.itemCodigo || index),
      peso,
    }));
  });
}

function getDisciplinas(preloadedData?: AlocacoesProps['preloadedData'], assignments: Assignment[] = []) {
  const adminSettings = Array.isArray(preloadedData?.admin?.disciplineSettings)
    ? preloadedData.admin.disciplineSettings
    : Array.isArray(preloadedData?.admin?.disciplinas)
      ? preloadedData.admin.disciplinas
      : [];

  const visibleFromAdmin: Array<{ nome: string; showInCharts: boolean }> = adminSettings
    .map((item: any) => ({
      nome: normalizeDisciplineLabel(String(item?.nome || item?.name || item || '').trim()),
      showInCharts: item?.showInCharts !== false,
    }))
    .filter((item): item is { nome: string; showInCharts: boolean } => Boolean(item.showInCharts && item.nome));

  if (adminSettings.length > 0) {
    return Array.from(new Set(visibleFromAdmin.map((item) => item.nome).filter(Boolean)));
  }

  const fromAssignments: string[] = assignments.map((item) => normalizeDisciplineLabel(item.disciplina)).filter(Boolean);
  return Array.from(new Set(fromAssignments.map(String).map((item) => item.trim()).filter(Boolean)));
}

function getProfessionalsByDisciplina(preloadedData?: AlocacoesProps['preloadedData'], assignments: Assignment[] = []) {
  const out: Record<string, Array<{ nome: string; email: string; disciplina: string }>> = {};
  const seen = new Set<string>();
  const professionalsByDisciplina: Record<string, Array<{ nome?: string; email?: string; disciplina?: string }>> = preloadedData?.registro?.professionalsByDisciplina || {};

  Object.keys(professionalsByDisciplina).forEach((disciplina) => {
    const list = Array.isArray(professionalsByDisciplina[disciplina]) ? professionalsByDisciplina[disciplina] : [];
    list.forEach((prof: any) => {
      const nome = String(prof?.nome || '').trim();
      const email = String(prof?.email || '').trim();
      const disciplinaAtual = normalizeDisciplineLabel(String(prof?.disciplina || disciplina || '').trim());
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

  return disciplinas.map((disciplina: string) => {
    const profissionais = professionalsByDisciplina[normalizeText(disciplina)] || [];
    const disciplinaKey = normalizeText(disciplina);
    const totalDisciplina = Math.max(totalByDisciplina[disciplinaKey] || 0, 1);

    return {
      id: disciplina,
      disciplina: String(disciplina),
      tituloCard: normalizeDisciplineLabel(disciplina),
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
  const [filtroAtivo, setFiltroAtivo] = useState<string[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const assignments = useMemo(() => buildAssignments(preloadedData, activeContractCode, dadosTabela), [preloadedData, activeContractCode, dadosTabela]);
  const contratos = useMemo(() => getContratosAtivos(assignments), [assignments]);
  const dadosAlocacoes = useMemo(() => buildAlocacoes(preloadedData, contratos, activeContractCode), [preloadedData, contratos, activeContractCode]);
  const disciplinasLista = useMemo(() => getDisciplinas(preloadedData, assignments), [assignments, preloadedData]);

  const visibleLabels = useMemo(() => {
    return disciplinasLista;
  }, [disciplinasLista]);

  const cardsFiltrados = filtroAtivo.length > 0
    ? dadosAlocacoes.filter((d) => filtroAtivo.includes(d.disciplina))
    : dadosAlocacoes;

  const selectedPreview = filtroAtivo.length === 0
    ? 'Selecione...'
    : filtroAtivo.slice(0, 2).join(' | ');

  return (
    <div className="min-h-full bg-[#F8F9FA] font-['Montserrat']">
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-6 mb-8">
        <div className="relative w-full max-w-[420px]">
          <button
            type="button"
            onClick={() => setMenuOpen((prev) => !prev)}
            className="flex h-11 w-full items-center justify-between gap-3 rounded-xl border border-[#E5E7EB] bg-white px-4 text-left text-[13px] font-medium text-[#2D2D2D] shadow-sm transition-colors hover:border-[#F05D28]"
          >
            <span className={`min-w-0 flex-1 truncate ${filtroAtivo.length === 0 ? 'text-[#9CA3AF]' : ''}`}>
              {selectedPreview}
            </span>
            <ChevronDown size={16} className="shrink-0 text-[#757575]" />
          </button>

          {menuOpen && (
            <div className="absolute left-0 top-[calc(100%+8px)] z-30 w-full rounded-2xl border border-[#E5E7EB] bg-white p-2 shadow-xl shadow-black/5">
              <div className="max-h-[280px] overflow-y-auto">
                {visibleLabels.length === 0 ? (
                  <div className="px-3 py-2 text-[12px] text-[#757575]">
                    Nenhuma disciplina disponivel.
                  </div>
                ) : (
                  visibleLabels.map((disciplina) => {
                    const checked = filtroAtivo.includes(disciplina);
                    return (
                      <label
                        key={disciplina}
                        className="flex items-start justify-between gap-3 rounded-xl px-3 py-2.5 hover:bg-[#F9FAFB] cursor-pointer transition-colors"
                      >
                        <span className="text-[12px] font-medium text-[#2D2D2D] leading-tight">{disciplina}</span>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => {
                            setFiltroAtivo((prev) => (
                              prev.includes(disciplina)
                                ? prev.filter((item) => item !== disciplina)
                                : [...prev, disciplina]
                            ));
                          }}
                          className="w-4 h-4 accent-[#F05D28] cursor-pointer shrink-0 mt-0.5"
                        />
                      </label>
                    );
                  })
                )}
              </div>

              <div className="flex items-center justify-between gap-3 border-t border-[#E5E7EB] px-3 pt-2 mt-2">
                <button
                  type="button"
                  onClick={() => setFiltroAtivo([])}
                  className="text-[11px] font-bold uppercase tracking-wider text-[#EF4444] hover:text-[#B91C1C]"
                >
                  Limpar filtro
                </button>
                <button
                  type="button"
                  onClick={() => setMenuOpen(false)}
                  className="text-[11px] font-bold uppercase tracking-wider text-[#757575] hover:text-[#2D2D2D]"
                >
                  Fechar
                </button>
              </div>
            </div>
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
