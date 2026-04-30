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

const CONTRACT_PRIORITY_STORAGE_KEY = 'quanta_contract_priorities';

type FiltrosEngenharia = {
  contrato: string;
  os: string;
  disciplina: string;
};

type FiltrosLocais = {
  contrato: string;
  os: string;
  importancia: string;
  dificuldade: string;
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
  avaliacao: string;
};

type ContractOption = {
  codigo: string;
  nome: string;
};

type BasicFilters = {
  contrato: string;
  os: string;
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

function buildContractNameMap(registro: any) {
  const map: Record<string, string> = {};
  const contracts = Array.isArray(registro?.contracts) ? registro.contracts : [];
  contracts.forEach((item: any) => {
    const codigo = String(item?.codigo || item?.code || item?.id || '').trim();
    const nome = String(item?.nome || item?.name || codigo).trim();
    if (codigo) map[codigo] = nome;
  });
  return map;
}

function buildOsNameMap(registro: any) {
  const map: Record<string, string> = {};
  const osOptions = Array.isArray(registro?.osOptions) ? registro.osOptions : [];
  osOptions.forEach((item: any) => {
    const codigo = String(item?.codigo || item?.code || item?.id || '').trim();
    const nome = String(item?.nome || item?.name || codigo).trim();
    if (codigo) map[codigo] = nome;
  });
  return map;
}

function difficultyToNumber(value?: string) {
  const v = normalizeText(value);
  if (v.includes('dificil')) return 3;
  if (v.includes('moderada')) return 2;
  return 1;
}

function readStoredPriorityValues() {
  try {
    const raw = localStorage.getItem(CONTRACT_PRIORITY_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed?.values && typeof parsed.values === 'object'
      ? parsed.values as Record<string, string>
      : {};
  } catch (error) {
    return {};
  }
}

function getActivityList(registro: any) {
  const activitiesList = Array.isArray(registro?.activitiesList) ? registro.activitiesList : [];
  const activeActivities = Array.isArray(registro?.activeActivities) ? registro.activeActivities : [];
  const completedActivities = Array.isArray(registro?.completedActivities) ? registro.completedActivities : [];

  const source = activitiesList.length > 0
    ? activitiesList
    : [...activeActivities, ...completedActivities];

  const seen = new Set<string>();
  return source.filter((activity: any, index: number) => {
    const key = String(activity?.activityId || activity?.id || activity?.itemCodigo || index).trim();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function buildProfessionalDisciplineMaps(registro: any, admin?: any) {
  const byEmail: Record<string, string> = {};
  const byName: Record<string, string> = {};

  const adminUsers = Array.isArray(admin?.users)
    ? admin.users
    : admin?.usersByEmail && typeof admin.usersByEmail === 'object'
      ? Object.values(admin.usersByEmail)
      : [];
  adminUsers.forEach((user: any) => {
    const email = normalizeText(user?.email);
    const name = normalizeText(user?.nome || user?.name);
    const disciplina = String(user?.disciplina || user?.discipline || '').trim();
    if (email && disciplina && !byEmail[email]) byEmail[email] = disciplina;
    if (name && disciplina && !byName[name]) byName[name] = disciplina;
  });

  const usersSummary = Array.isArray(registro?.usersSummary) ? registro.usersSummary : [];
  usersSummary.forEach((user: any) => {
    const email = normalizeText(user?.email);
    const name = normalizeText(user?.nome || user?.name);
    const disciplina = String(user?.disciplina || '').trim();
    if (email && disciplina && !byEmail[email]) byEmail[email] = disciplina;
    if (name && disciplina && !byName[name]) byName[name] = disciplina;
  });

  const professionalsByDisciplina = registro?.professionalsByDisciplina || {};
  Object.keys(professionalsByDisciplina).forEach((disciplina) => {
    const profissionais = Array.isArray(professionalsByDisciplina[disciplina]) ? professionalsByDisciplina[disciplina] : [];
    profissionais.forEach((prof: any) => {
      const email = normalizeText(prof?.email);
      const name = normalizeText(prof?.nome || prof?.name);
      const disciplinaAtual = String(prof?.disciplina || disciplina || '').trim();
      if (email && !byEmail[email]) byEmail[email] = disciplinaAtual;
      if (name && !byName[name]) byName[name] = disciplinaAtual;
    });
  });

  return { byEmail, byName };
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

function buildConsultaData(registro: any, cronograma: any, admin?: any): ConsultaAtividade[] {
  const activities = getActivityList(registro);
  const { byEmail: disciplinaByEmail, byName: disciplinaByName } = buildProfessionalDisciplineMaps(registro, admin);
  const cronogramaByCode = buildCronogramaMap(cronograma);
  const contractNameByCode = buildContractNameMap(registro);
  const osNameByCode = buildOsNameMap(registro);
  const priorityValues = readStoredPriorityValues();

  return activities.flatMap((activity: any) => {
    const emails = Array.isArray(activity?.profissionaisEmails)
      ? activity.profissionaisEmails.map((item: any) => String(item || '').trim()).filter(Boolean)
      : String(activity?.profissionaisEmails || '').split(' | ').map((item) => item.trim()).filter(Boolean);
    const nomes = Array.isArray(activity?.profissionais)
      ? activity.profissionais.map((item: any) => String(item || '').trim()).filter(Boolean)
      : String(activity?.profissionais || '').split(' | ').map((item) => item.trim()).filter(Boolean);
    const fallbackNome = String(activity?.criadoPorNome || activity?.createdByName || activity?.responsavel || 'Responsavel nao informado').trim();
    const fallbackEmail = String(activity?.criadoPorEmail || activity?.createdByEmail || '').trim();
    const participantes = nomes.length > 0 ? nomes : [fallbackNome];
    const participantEmails = emails.length > 0 ? emails : [fallbackEmail];
    const cronogramaItem = cronogramaByCode[String(activity?.itemCodigo || '').trim()] || {};
    const plannedStart = formatDateBR(cronogramaItem.plannedStart);
    const plannedEnd = formatDateBR(cronogramaItem.plannedEnd);
    const prazo = plannedStart && plannedEnd ? `${plannedStart} a ${plannedEnd}` : plannedEnd || plannedStart || 'Sem prazo';
    const prazoAtual = diffDaysFromToday(cronogramaItem.plannedEnd);
    const avanco = Number(activity?.avancoAtual || 0);

    return participantes.map((nome, index) => {
      const email = participantEmails[index] || participantEmails[0] || '';
      const disciplina = disciplinaByEmail[normalizeText(email)]
        || disciplinaByName[normalizeText(nome)]
        || disciplinaByEmail[normalizeText(fallbackEmail)]
        || disciplinaByName[normalizeText(fallbackNome)]
        || String(activity?.criadoPorDisciplina || '').trim()
        || 'Sem disciplina';
      const baseId = String(activity?.activityId || activity?.id || activity?.itemCodigo || index);
      const importanceValue = Math.max(1, Math.min(3, Number(priorityValues[baseId] || activity?.importancia || 1)));

      return {
        id: `${baseId}-${email || nome}-${index}`,
        profissional: nome,
        profissionalEmail: email,
        descricao: String(activity?.itemNome || activity?.descricao || ''),
        contrato: String(activity?.contratoCodigo || ''),
        os: String(activity?.osCodigo || ''),
        osNome: osNameByCode[String(activity?.osCodigo || '').trim()] || String(activity?.osCodigo || ''),
        disciplina,
        prazoAtual,
        dificuldade: difficultyToNumber(activity?.dificuldade),
        importancia: importanceValue,
        responsavel: nome,
        percentualConcluido: avanco,
        termino: prazo,
        prazo,
        avaliacao: String(activity?.avaliacaoAtual || '').trim() || EMPTY_STATUS,
        contratoNome: contractNameByCode[String(activity?.contratoCodigo || '').trim()] || String(activity?.contratoCodigo || ''),
      };
    });
  });
}

function getAvaliacaoBadgeClass(value: string) {
  const normalized = normalizeText(value);
  if (normalized.includes('problema') || normalized.includes('bloqueio')) {
    return 'bg-[#FEF2F2] text-[#B91C1C] border-[#FECACA]';
  }
  if (normalized.includes('pior')) {
    return 'bg-[#FFF7ED] text-[#C2410C] border-[#FED7AA]';
  }
  if (normalized.includes('melhor')) {
    return 'bg-[#ECFDF5] text-[#047857] border-[#A7F3D0]';
  }
  if (normalized.includes('dentro')) {
    return 'bg-[#EFF6FF] text-[#1D4ED8] border-[#BFDBFE]';
  }
  return 'bg-[#F8F9FA] text-[#757575] border-[#E5E7EB]';
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

function filterByContractOsAndDiscipline(
  tableData: ConsultaAtividade[],
  filtros: BasicFilters,
  filtroDisciplina: string
) {
  return tableData.filter((item) => {
    const matchContrato = isAllValue(filtros.contrato) || normalizeText(item.contrato) === normalizeText(filtros.contrato);
    const matchOS = isAllValue(filtros.os) || normalizeText(item.os) === normalizeText(filtros.os);
    const matchDisciplina = isAllValue(filtroDisciplina) || normalizeText(item.disciplina) === normalizeText(filtroDisciplina);
    return matchContrato && matchOS && matchDisciplina;
  });
}

function getContractOptions(registro: any, tableData: ConsultaAtividade[]): ContractOption[] {
  const fromRegistro = Array.isArray(registro?.contracts) ? registro.contracts : [];
  const map = new Map<string, ContractOption>();

  fromRegistro.forEach((item: any) => {
    const contrato = String(item?.codigo || item?.code || item?.id || '').trim();
    const nome = String(item?.nome || item?.name || contrato).trim();
    if (contrato && tableData.some((row) => normalizeText(row.contrato) === normalizeText(contrato)) && !map.has(contrato)) {
      map.set(contrato, { codigo: contrato, nome });
    }
  });

  return Array.from(map.values());
}

function getOsOptions(registro: any, tableData: ConsultaAtividade[], contrato: string) {
  const target = normalizeText(contrato);
  const map = new Map<string, string>();

  const fromRegistro = Array.isArray(registro?.osOptions) ? registro.osOptions : [];
  fromRegistro
    .filter((item: any) => {
      const contratoOs = String(item?.contratoCodigo || item?.contractCode || '').trim();
      const codigo = String(item?.codigo || item?.code || item?.id || '').trim();
      const hasActivity = tableData.some((row) => normalizeText(row.os) === normalizeText(codigo));
      return hasActivity && (isAllValue(contrato) || normalizeText(contratoOs) === target);
    })
    .forEach((item: any) => {
      const os = String(item?.codigo || item?.code || item?.id || '').trim();
      const nome = String(item?.nome || item?.name || os).trim();
      if (os && !map.has(os)) map.set(os, nome);
    });

  return Array.from(map.entries()).map(([codigo, nome]) => ({ codigo, nome }));
}

export default function DashboardEngenharia({ filtrosAtivos, preloadedData }: DashboardEngenhariaProps) {
  const filtroContratoGlobal = filtrosAtivos?.contrato || 'Todos';
  const filtroOSGlobal = filtrosAtivos?.os || 'Todos';
  const filtroDisciplina = filtrosAtivos?.disciplina || 'Todos';

  const tableData = React.useMemo(
    () => buildConsultaData(preloadedData?.registro, preloadedData?.cronograma, preloadedData?.admin),
    [preloadedData?.registro, preloadedData?.cronograma, preloadedData?.admin]
  );

  const disciplinasCadastradas = React.useMemo(() => {
    const fromAdmin = Array.isArray(preloadedData?.admin?.disciplinas) ? preloadedData.admin.disciplinas : [];
    const fromRegistro = Array.isArray(preloadedData?.registro?.usersSummary)
      ? preloadedData.registro.usersSummary.map((user: any) => String(user?.disciplina || '').trim()).filter(Boolean)
      : [];
    const fromActivities = tableData.map((item) => String(item.disciplina || '').trim()).filter(Boolean);
    return Array.from(new Set([...fromAdmin, ...fromRegistro, ...fromActivities]));
  }, [preloadedData?.admin?.disciplinas, preloadedData?.registro?.usersSummary, tableData]);

  const [filtrosComposicao, setFiltrosComposicao] = React.useState<FiltrosLocais>({
    contrato: filtroContratoGlobal,
    os: filtroOSGlobal,
    importancia: 'Todos',
    dificuldade: 'Todos',
  });
  const [filtrosMatriz, setFiltrosMatriz] = React.useState<FiltrosLocais>({
    contrato: filtroContratoGlobal,
    os: filtroOSGlobal,
    importancia: 'Todos',
    dificuldade: 'Todos',
  });
  const [filtrosAnalise, setFiltrosAnalise] = React.useState<FiltrosLocais>({
    contrato: filtroContratoGlobal,
    os: filtroOSGlobal,
    importancia: 'Todos',
    dificuldade: 'Todos',
  });

  React.useEffect(() => {
    setFiltrosComposicao((prev) => ({
      ...prev,
      contrato: filtroContratoGlobal,
      os: filtroOSGlobal,
    }));
    setFiltrosMatriz((prev) => ({
      ...prev,
      contrato: filtroContratoGlobal,
      os: filtroOSGlobal,
    }));
    setFiltrosAnalise((prev) => ({
      ...prev,
      contrato: filtroContratoGlobal,
      os: filtroOSGlobal,
    }));
  }, [filtroContratoGlobal, filtroOSGlobal]);

  const contractOptionsComposicao = React.useMemo(
    () => getContractOptions(preloadedData?.registro, tableData),
    [preloadedData?.registro, tableData]
  );
  const osOptionsComposicao = React.useMemo(
    () => getOsOptions(preloadedData?.registro, tableData, filtrosComposicao.contrato),
    [preloadedData?.registro, tableData, filtrosComposicao.contrato]
  );
  const contractOptionsMatriz = React.useMemo(
    () => getContractOptions(preloadedData?.registro, tableData),
    [preloadedData?.registro, tableData]
  );
  const osOptionsMatriz = React.useMemo(
    () => getOsOptions(preloadedData?.registro, tableData, filtrosMatriz.contrato),
    [preloadedData?.registro, tableData, filtrosMatriz.contrato]
  );
  const contractOptionsAnalise = React.useMemo(
    () => getContractOptions(preloadedData?.registro, tableData),
    [preloadedData?.registro, tableData]
  );
  const osOptionsAnalise = React.useMemo(
    () => getOsOptions(preloadedData?.registro, tableData, filtrosAnalise.contrato),
    [preloadedData?.registro, tableData, filtrosAnalise.contrato]
  );

  React.useEffect(() => {
    if (isAllValue(filtrosComposicao.os)) return;
    const exists = osOptionsComposicao.some((item) => normalizeText(item.codigo) === normalizeText(filtrosComposicao.os));
    if (!exists) setFiltrosComposicao((prev) => ({ ...prev, os: 'Todos' }));
  }, [osOptionsComposicao, filtrosComposicao.os]);

  React.useEffect(() => {
    if (isAllValue(filtrosMatriz.os)) return;
    const exists = osOptionsMatriz.some((item) => normalizeText(item.codigo) === normalizeText(filtrosMatriz.os));
    if (!exists) setFiltrosMatriz((prev) => ({ ...prev, os: 'Todos' }));
  }, [osOptionsMatriz, filtrosMatriz.os]);

  React.useEffect(() => {
    if (isAllValue(filtrosAnalise.os)) return;
    const exists = osOptionsAnalise.some((item) => normalizeText(item.codigo) === normalizeText(filtrosAnalise.os));
    if (!exists) setFiltrosAnalise((prev) => ({ ...prev, os: 'Todos' }));
  }, [osOptionsAnalise, filtrosAnalise.os]);

  const tableComposicaoFiltrada = React.useMemo(() => {
    return filterByContractOsAndDiscipline(tableData, filtrosComposicao, filtroDisciplina);
  }, [tableData, filtrosComposicao, filtroDisciplina]);

  const tableMatrizBase = React.useMemo(() => {
    return filterByContractOsAndDiscipline(tableData, filtrosMatriz, filtroDisciplina);
  }, [tableData, filtrosMatriz, filtroDisciplina]);

  const tableMatrizFiltrada = React.useMemo(() => {
    return tableMatrizBase.filter((item) => {
      const matchImportancia = isAllValue(filtrosMatriz.importancia) || String(item.importancia) === String(filtrosMatriz.importancia);
      const matchDificuldade = isAllValue(filtrosMatriz.dificuldade) || String(item.dificuldade) === String(filtrosMatriz.dificuldade);
      return matchImportancia && matchDificuldade;
    });
  }, [tableMatrizBase, filtrosMatriz.importancia, filtrosMatriz.dificuldade]);

  const tableAnaliseBase = React.useMemo(() => {
    return filterByContractOsAndDiscipline(tableData, filtrosAnalise, filtroDisciplina);
  }, [tableData, filtrosAnalise, filtroDisciplina]);

  const tableAnaliseFiltrada = React.useMemo(() => {
    return tableAnaliseBase.filter((item) => {
      const matchImportancia = isAllValue(filtrosAnalise.importancia) || String(item.importancia) === String(filtrosAnalise.importancia);
      const matchDificuldade = isAllValue(filtrosAnalise.dificuldade) || String(item.dificuldade) === String(filtrosAnalise.dificuldade);
      return matchImportancia && matchDificuldade;
    });
  }, [tableAnaliseBase, filtrosAnalise.importancia, filtrosAnalise.dificuldade]);

  const tableConsultaFiltrada = React.useMemo(() => {
    return filterByContractOsAndDiscipline(
      tableData,
      { contrato: filtroContratoGlobal, os: filtroOSGlobal },
      filtroDisciplina
    );
  }, [tableData, filtroContratoGlobal, filtroOSGlobal, filtroDisciplina]);

  const dadosComposicaoFiltrados = React.useMemo(() => {
    return buildComposicaoData(tableComposicaoFiltrada, disciplinasCadastradas).map((item) => {
      const total = disciplinasCadastradas.reduce((acc, disciplina) => acc + Number(item[disciplinaKey(disciplina)] || 0), 0);
      return { ...item, total };
    });
  }, [tableComposicaoFiltrada, disciplinasCadastradas]);

  const dadosImpactoEsforco = React.useMemo(() => {
    return tableAnaliseFiltrada.map(item => ({
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
      avaliacao: item.avaliacao as any,
      alocacao: 100
    }));
  }, [tableAnaliseFiltrada]);

  const maxPrazo = React.useMemo(() => Math.max(...tableData.map(t => Math.abs(t.prazoAtual)), 1), [tableData]);

  const updateFiltroComposicao = (key: keyof FiltrosLocais, value: string) => {
    setFiltrosComposicao((prev) => ({
      ...prev,
      [key]: value,
      ...(key === 'contrato' ? { os: 'Todos' } : {}),
    }));
  };

  const updateFiltroMatriz = (key: keyof FiltrosLocais, value: string) => {
    setFiltrosMatriz((prev) => ({
      ...prev,
      [key]: value,
      ...(key === 'contrato' ? { os: 'Todos' } : {}),
    }));
  };

  const updateFiltroAnalise = (key: keyof FiltrosLocais, value: string) => {
    setFiltrosAnalise((prev) => ({
      ...prev,
      [key]: value,
      ...(key === 'contrato' ? { os: 'Todos' } : {}),
    }));
  };

  return (
    <div className="w-full space-y-6 sm:space-y-8 font-['Montserrat'] relative">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 sm:gap-8">
        <div className="lg:col-span-12">
          <ComposicaoDeProfissionaisPorOS
            dados={dadosComposicaoFiltrados}
            disciplinas={disciplinasCadastradas}
            filtros={{ contrato: filtrosComposicao.contrato, os: filtrosComposicao.os }}
            contractOptions={contractOptionsComposicao}
            osOptions={osOptionsComposicao}
            onFiltroChange={updateFiltroComposicao}
          />
        </div>

        <div className="lg:col-span-6">
          <MatrizDePriorizacao
            tableFiltrada={tableMatrizFiltrada}
            maxPrazo={maxPrazo}
            filtros={filtrosMatriz}
            contractOptions={contractOptionsMatriz}
            osOptions={osOptionsMatriz}
            onFiltroChange={updateFiltroMatriz}
          />
        </div>

        <div className="lg:col-span-6">
          <SituacaoPorDisciplina
            dadosBrutos={dadosImpactoEsforco}
            filtros={filtrosAnalise}
            contractOptions={contractOptionsAnalise}
            osOptions={osOptionsAnalise}
            onFiltroChange={updateFiltroAnalise}
          />
        </div>

        <div className="lg:col-span-12 mt-4">
          <NovoGrafico dados={tableConsultaFiltrada} />
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
            <select className="w-full h-11 px-4 bg-[#F8F9FA] border border-[#E5E7EB] rounded-xl text-xs font-bold text-[#2D2D2D] outline-none disabled:opacity-70" value={filtroContratoGlobal} disabled>
              <option value="Todos">Todos</option>
              <option value={filtroContratoGlobal}>{filtroContratoGlobal}</option>
            </select>
          </div>
          <div className="space-y-1.5 md:col-span-1">
            <label className="text-[10px] font-bold text-[#757575] uppercase tracking-widest">Ordem Serv.</label>
            <select className="w-full h-11 px-4 bg-[#F8F9FA] border border-[#E5E7EB] rounded-xl text-xs font-bold text-[#2D2D2D] outline-none disabled:opacity-70" value={filtroOSGlobal} disabled>
              <option value="Todos">Todas as OS</option>
              <option value={filtroOSGlobal}>{filtroOSGlobal}</option>
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
                <th className="py-4 px-5 text-[10px] font-bold text-[#757575] uppercase tracking-widest">Avaliação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E5E7EB]">
              {tableConsultaFiltrada.length > 0 ? (
                tableConsultaFiltrada.map((item) => (
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
                      <span className={`px-2.5 py-1 rounded-md text-[9px] font-bold uppercase tracking-widest border ${getAvaliacaoBadgeClass(item.avaliacao)}`}>
                        {item.avaliacao}
                      </span>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-[13px] font-medium text-[#757575]">
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
