import React from 'react';
import {
  Search,
  RotateCcw,
  ExternalLink
} from 'lucide-react';

import ComposicaoDeProfissionaisPorOS from './Graficosdashboard/ComposicaodeProfissionaisPorOS';
import MatrizDePriorizacao from './Graficosdashboard/MatrizDePriorizacao';
import SituacaoPorDisciplina from './Graficosdashboard/ImpactoXesforco';
import NovoGrafico from './Graficosdashboard/hotmap';

type FiltrosEngenharia = {
  contrato: string;
  os: string;
  disciplina: string;
};

type DashboardEngenhariaProps = {
  filtrosAtivos?: FiltrosEngenharia;
  preloadedData?: {
    registro?: any;
    cronograma?: any;
    admin?: any;
  };
};

type ConsultaAtividade = {
  id: string;
  profissional: string;
  profissionalEmail: string;
  descricao: string;
  contrato: string;
  os: string;
  osNome: string;
  disciplina: string;
  prazoAtual: number;
  dificuldade: number;
  importancia: number;
  responsavel: string;
  percentualConcluido: number;
  termino: string;
  prazo: string;
  aval4: string;
  obs4: string;
  aval6: string;
  obs6: string;
};

const EMPTY_STATUS = 'A programar';

function normalizeText(value?: string) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
}

function disciplinaKey(value?: string) {
  return `disc_${normalizeText(value).replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'sem_disciplina'}`;
}

function isAllValue(value?: string) {
  const v = normalizeText(value);
  return !v || v === 'todos' || v === 'todas' || v === 'todas as os' || v === 'todos os contratos' || v === 'todas as disciplinas';
}

function isDateLikeLabel(value?: string) {
  const text = String(value || '').trim();
  return Boolean(
    text.match(/^\d{4}-\d{2}-\d{2}T/) ||
    text.match(/^\d{1,2}\/\d{1,2}\/\d{2,4}/) ||
    text.match(/GMT|Hor.rio|Bras.lia/i)
  );
}

function getOsDisplayName(osCodigo: string, osNome: string) {
  const cleanName = String(osNome || '').trim();
  const cleanCode = String(osCodigo || '').trim();

  if (cleanName && !isDateLikeLabel(cleanName)) return cleanName;
  if (cleanCode && !isDateLikeLabel(cleanCode)) return cleanCode;
  return 'Sem OS';
}

function formatDateBR(value?: string) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
  return raw;
}

function diffDaysFromToday(value?: string) {
  const raw = String(value || '').trim();
  if (!raw) return 0;

  let date: Date | null = null;
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const br = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})/);

  if (iso) date = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
  else if (br) date = new Date(Number(br[3]), Number(br[2]) - 1, Number(br[1]));

  if (!date || Number.isNaN(date.getTime())) return 0;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  date.setHours(0, 0, 0, 0);

  return Math.ceil((date.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function difficultyToNumber(value?: string) {
  const v = normalizeText(value);
  if (v.includes('dificil')) return 5;
  if (v.includes('moderada')) return 3;
  return 1;
}

function getActivityList(registro: any) {
  if (Array.isArray(registro?.activitiesList)) return registro.activitiesList;
  return [];
}

function buildProfessionalDisciplineMap(registro: any) {
  const map: Record<string, string> = {};

  const usersSummary = Array.isArray(registro?.usersSummary) ? registro.usersSummary : [];
  usersSummary.forEach((user: any) => {
    const email = normalizeText(user?.email);
    if (email) map[email] = String(user?.disciplina || '').trim();
  });

  const professionalsByDisciplina = registro?.professionalsByDisciplina || {};
  Object.keys(professionalsByDisciplina).forEach((disciplina) => {
    const profissionais = Array.isArray(professionalsByDisciplina[disciplina]) ? professionalsByDisciplina[disciplina] : [];
    profissionais.forEach((prof: any) => {
      const email = normalizeText(prof?.email);
      if (email && !map[email]) map[email] = String(prof?.disciplina || disciplina || '').trim();
    });
  });

  return map;
}

function buildCronogramaMap(cronograma: any) {
  const rows = Array.isArray(cronograma) ? cronograma : [];
  const map: Record<string, any> = {};

  rows.forEach((row: any) => {
    const code = String(row?.code || '').trim();
    if (code) map[code] = row;
  });

  return map;
}

function buildConsultaData(registro: any, cronograma: any): ConsultaAtividade[] {
  const activities = getActivityList(registro);
  const disciplinaByEmail = buildProfessionalDisciplineMap(registro);
  const cronogramaByCode = buildCronogramaMap(cronograma);

  return activities.flatMap((activity: any) => {
    const emails = String(activity?.profissionaisEmails || '').split(' | ').map((item) => item.trim()).filter(Boolean);
    const nomes = String(activity?.profissionais || '').split(' | ').map((item) => item.trim()).filter(Boolean);
    const cronogramaItem = cronogramaByCode[String(activity?.itemCodigo || '').trim()] || {};
    const plannedStart = formatDateBR(cronogramaItem.plannedStart);
    const plannedEnd = formatDateBR(cronogramaItem.plannedEnd);
    const prazo = plannedStart && plannedEnd ? `${plannedStart} a ${plannedEnd}` : plannedEnd || plannedStart || 'Sem prazo';
    const prazoAtual = diffDaysFromToday(cronogramaItem.plannedEnd);
    const avanco = Number(activity?.avancoAtual || 0);

    return nomes.map((nome, index) => {
      const email = emails[index] || '';
      const disciplina = disciplinaByEmail[normalizeText(email)] || String(activity?.criadoPorDisciplina || '').trim() || 'Sem disciplina';
      const baseId = String(activity?.activityId || activity?.id || activity?.itemCodigo || index);

      return {
        id: `${baseId}-${email || nome}-${index}`,
        profissional: nome,
        profissionalEmail: email,
        descricao: String(activity?.itemNome || activity?.descricao || ''),
        contrato: String(activity?.contratoCodigo || ''),
        os: String(activity?.osCodigo || ''),
        osNome: String(activity?.osNome || activity?.osCodigo || ''),
        disciplina,
        prazoAtual,
        dificuldade: difficultyToNumber(activity?.dificuldade),
        importancia: 3,
        responsavel: nome,
        percentualConcluido: avanco,
        termino: prazo,
        prazo,
        aval4: EMPTY_STATUS,
        obs4: '',
        aval6: EMPTY_STATUS,
        obs6: ''
      };
    });
  });
}

function buildComposicaoData(tableData: ConsultaAtividade[], disciplinas: string[]) {
  const grouped: Record<string, any> = {};
  const disciplinasBase = disciplinas.length ? disciplinas : Array.from(new Set(tableData.map((item) => item.disciplina).filter(Boolean)));

  tableData.forEach((item) => {
    const osCodigo = item.os || 'Sem OS';
    const osNome = item.osNome || osCodigo;
    const osLabel = getOsDisplayName(osCodigo, osNome);
    if (!grouped[osCodigo]) {
      const base: Record<string, any> = {
        os: osCodigo,
        nomeCompleto: osLabel,
        contrato: item.contrato
      };
      disciplinasBase.forEach((disciplina) => {
        base[disciplinaKey(disciplina)] = 0;
      });
      grouped[osCodigo] = base;
    }

    const key = disciplinaKey(item.disciplina);
    grouped[osCodigo][key] = Number(grouped[osCodigo][key] || 0) + 1;
  });

  return Object.values(grouped);
}

export default function DashboardEngenharia({ filtrosAtivos, preloadedData }: DashboardEngenhariaProps) {
  const filtroContrato = filtrosAtivos?.contrato || 'Todos';
  const filtroOS = filtrosAtivos?.os || 'Todos';
  const filtroDisciplina = filtrosAtivos?.disciplina || 'Todos';

  const tableData = React.useMemo(
    () => buildConsultaData(preloadedData?.registro, preloadedData?.cronograma),
    [preloadedData?.registro, preloadedData?.cronograma]
  );

  const disciplinasCadastradas = React.useMemo(() => {
    const fromAdmin = Array.isArray(preloadedData?.admin?.disciplinas) ? preloadedData.admin.disciplinas : [];
    const fromRegistro = Array.isArray(preloadedData?.registro?.usersSummary)
      ? preloadedData.registro.usersSummary.map((user: any) => String(user?.disciplina || '').trim()).filter(Boolean)
      : [];
    return Array.from(new Set([...fromAdmin, ...fromRegistro]));
  }, [preloadedData?.admin?.disciplinas, preloadedData?.registro?.usersSummary]);

  const tableFiltrada = React.useMemo(() => {
    return tableData.filter(item => {
      const matchContrato = isAllValue(filtroContrato) || normalizeText(item.contrato) === normalizeText(filtroContrato);
      const matchOS = isAllValue(filtroOS) || normalizeText(item.os) === normalizeText(filtroOS);
      const matchDisciplina = isAllValue(filtroDisciplina) || normalizeText(item.disciplina) === normalizeText(filtroDisciplina);
      return matchContrato && matchOS && matchDisciplina;
    });
  }, [tableData, filtroContrato, filtroOS, filtroDisciplina]);

  const dadosComposicaoFiltrados = React.useMemo(() => {
    return buildComposicaoData(tableFiltrada, disciplinasCadastradas).map((item) => {
      const total = disciplinasCadastradas.reduce((acc, disciplina) => acc + Number(item[disciplinaKey(disciplina)] || 0), 0);
      return { ...item, total };
    });
  }, [tableFiltrada, disciplinasCadastradas]);

  const dadosImpactoEsforco = React.useMemo(() => {
    return tableFiltrada.map(item => ({
      id: item.id,
      os: item.os,
      descricao: item.descricao,
      contrato: item.contrato,
      disciplina: item.disciplina,
      prazoAtual: item.prazoAtual,
      dificuldade: item.dificuldade,
      importancia: item.importancia,
      responsavel: item.responsavel,
      percentualConcluido: item.percentualConcluido,
      avaliacao: 'Dentro do esperado' as any,
      alocacao: 100
    }));
  }, [tableFiltrada]);

  const maxPrazo = React.useMemo(() => Math.max(...tableData.map(t => Math.abs(t.prazoAtual)), 1), [tableData]);

  return (
    <div className="w-full space-y-6 sm:space-y-8 font-['Montserrat'] relative">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 sm:gap-8">
        <div className="lg:col-span-12">
          <ComposicaoDeProfissionaisPorOS dados={dadosComposicaoFiltrados} disciplinas={disciplinasCadastradas} />
        </div>

        <div className="lg:col-span-6">
          <MatrizDePriorizacao tableFiltrada={tableFiltrada} maxPrazo={maxPrazo} />
        </div>

        <div className="lg:col-span-6">
          <SituacaoPorDisciplina dadosBrutos={dadosImpactoEsforco} />
        </div>

        <div className="lg:col-span-12 mt-4">
          <NovoGrafico dados={tableFiltrada} />
        </div>
      </div>

      <div className="bg-white border border-[#E5E7EB] rounded-[12px] p-6 sm:p-8">
        <div className="flex items-center gap-3 border-b border-[#E5E7EB] pb-4 mb-6">
          <span className="material-symbols-outlined text-[#F05D28] text-xl">list_alt</span>
          <h2 className="text-[14px] font-bold text-[#2D2D2D] uppercase tracking-widest">Consulta de Atividades</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
          <div className="space-y-1.5 md:col-span-1">
            <label className="text-[10px] font-bold text-[#757575] uppercase tracking-widest">Contrato</label>
            <select className="w-full h-11 px-4 bg-[#F8F9FA] border border-[#E5E7EB] rounded-xl text-xs font-bold text-[#2D2D2D] outline-none disabled:opacity-70" value={filtroContrato} disabled>
              <option value="Todos">Todos</option>
              <option value={filtroContrato}>{filtroContrato}</option>
            </select>
          </div>
          <div className="space-y-1.5 md:col-span-1">
            <label className="text-[10px] font-bold text-[#757575] uppercase tracking-widest">Ordem Serv.</label>
            <select className="w-full h-11 px-4 bg-[#F8F9FA] border border-[#E5E7EB] rounded-xl text-xs font-bold text-[#2D2D2D] outline-none disabled:opacity-70" value={filtroOS} disabled>
              <option value="Todos">Todas as OS</option>
              <option value={filtroOS}>{filtroOS}</option>
            </select>
          </div>
          <div className="space-y-1.5 md:col-span-1">
            <label className="text-[10px] font-bold text-[#757575] uppercase tracking-widest">Disciplina</label>
            <select className="w-full h-11 px-4 bg-[#F8F9FA] border border-[#E5E7EB] rounded-xl text-xs font-bold text-[#2D2D2D] outline-none disabled:opacity-70" value={filtroDisciplina} disabled>
              <option value="Todos">Todas</option>
              <option value={filtroDisciplina}>{filtroDisciplina}</option>
            </select>
          </div>
          <div className="space-y-1.5 md:col-span-1">
            <label className="text-[10px] font-bold text-[#757575] uppercase tracking-widest">Profissional</label>
            <select className="w-full h-11 px-4 bg-white border border-[#E5E7EB] rounded-xl text-xs font-bold text-[#2D2D2D] focus:border-[#F05D28] focus:ring-1 focus:ring-[#F05D28] transition-colors outline-none cursor-pointer">
              <option>Todos</option>
            </select>
          </div>
          <div className="space-y-1.5 md:col-span-1">
            <label className="text-[10px] font-bold text-[#757575] uppercase tracking-widest">Avaliação</label>
            <select className="w-full h-11 px-4 bg-white border border-[#E5E7EB] rounded-xl text-xs font-bold text-[#2D2D2D] focus:border-[#F05D28] focus:ring-1 focus:ring-[#F05D28] transition-colors outline-none cursor-pointer">
              <option>Todas</option>
            </select>
          </div>
        </div>

        <div className="flex flex-col md:flex-row gap-4 mb-8">
          <div className="flex-1 relative">
            <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#757575]" />
            <input
              type="text"
              placeholder="Pesquisar atividades..."
              className="w-full h-11 pl-12 pr-4 bg-white border border-[#E5E7EB] rounded-xl text-sm font-medium text-[#2D2D2D] focus:border-[#F05D28] focus:ring-1 focus:ring-[#F05D28] outline-none transition-colors"
            />
          </div>
          <button className="h-11 px-6 border border-[#E5E7EB] text-[#757575] hover:bg-[#F4F5F7] hover:text-[#2D2D2D] rounded-xl font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-colors">
            <RotateCcw size={16} />
            Limpar Filtro
          </button>
        </div>

        <div className="overflow-x-auto rounded-xl border border-[#E5E7EB]">
          <table className="w-full text-left border-collapse min-w-[1000px]">
            <thead>
              <tr className="bg-[#F8F9FA] border-b border-[#E5E7EB]">
                <th className="py-4 px-5 text-[10px] font-bold text-[#757575] uppercase tracking-widest">Ação</th>
                <th className="py-4 px-5 text-[10px] font-bold text-[#757575] uppercase tracking-widest">Profissional</th>
                <th className="py-4 px-5 text-[10px] font-bold text-[#757575] uppercase tracking-widest">Contrato / OS</th>
                <th className="py-4 px-5 text-[10px] font-bold text-[#757575] uppercase tracking-widest">Tarefa</th>
                <th className="py-4 px-5 text-[10px] font-bold text-[#757575] uppercase tracking-widest">Prazo</th>
                <th className="py-4 px-5 text-[10px] font-bold text-[#757575] uppercase tracking-widest">Status 4º</th>
                <th className="py-4 px-5 text-[10px] font-bold text-[#757575] uppercase tracking-widest">Status 6º</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E5E7EB]">
              {tableFiltrada.length > 0 ? (
                tableFiltrada.map((item) => (
                  <tr key={item.id} className="hover:bg-[#F4F5F7] transition-colors">
                    <td className="py-4 px-5">
                      <button className="text-[#F05D28] hover:text-[#2D2D2D] flex items-center justify-center p-2 rounded-lg hover:bg-[#E5E7EB] transition-colors">
                        <ExternalLink size={16} />
                      </button>
                    </td>
                    <td className="py-4 px-5">
                      <div className="flex flex-col">
                        <span className="text-[13px] text-[#2D2D2D] font-bold">{item.profissional}</span>
                        <span className="text-[10px] text-[#757575] uppercase tracking-wider">{item.disciplina}</span>
                      </div>
                    </td>
                    <td className="py-4 px-5">
                      <div className="flex flex-col">
                        <span className="text-[13px] text-[#2D2D2D] font-bold">{item.os}</span>
                        <span className="text-[10px] text-[#757575] uppercase tracking-wider">{item.contrato}</span>
                      </div>
                    </td>
                    <td className="py-4 px-5 text-[13px] text-[#2D2D2D] font-medium">{item.descricao}</td>
                    <td className="py-4 px-5 text-[13px] text-[#757575] font-medium">{item.prazo}</td>
                    <td className="py-4 px-5">
                      <span className="px-2.5 py-1 rounded-md text-[9px] font-bold uppercase tracking-widest border bg-[#F8F9FA] text-[#757575] border-[#E5E7EB]">
                        {item.aval4}
                      </span>
                    </td>
                    <td className="py-4 px-5">
                      <span className="px-2.5 py-1 rounded-md text-[9px] font-bold uppercase tracking-widest border bg-[#F8F9FA] text-[#757575] border-[#E5E7EB]">
                        {item.aval6}
                      </span>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-[13px] font-medium text-[#757575]">
                    Nenhuma atividade encontrada para os filtros selecionados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
