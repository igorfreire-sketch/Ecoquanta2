import React from 'react';
import {
  Search,
  RotateCcw,
  ExternalLink,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

import Alocacoes from './Alocacoes';
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

type FiltrosConsulta = {
  contrato: string;
  os: string;
  disciplina: string;
  profissional: string;
  avaliacao: string;
};

type DashboardEngenhariaProps = {
  filtrosAtivos?: FiltrosEngenharia;
  preloadedData?: {
    registro?: any;
    cronograma?: any;
    admin?: any;
  };
  mode?: 'profissionais' | 'planejamento';
  activeContractCode?: string;
};

function ExpandableSection({
  title,
  children,
  defaultOpen = false,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = React.useState(defaultOpen);

  return (
    <section className="rounded-2xl border border-[#E5E7EB] bg-white shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition hover:bg-[#F8F9FA]"
      >
        <span className="text-[14px] font-black uppercase tracking-wide text-[#2D2D2D]">{title}</span>
        {open ? <ChevronUp size={18} className="text-[#F05D28]" /> : <ChevronDown size={18} className="text-[#757575]" />}
      </button>

      {open && (
        <div className="border-t border-[#E5E7EB] p-4 sm:p-5">
          {children}
        </div>
      )}
    </section>
  );
}

type ConsultaAtividade = {
  id: string;
  profissional: string;
  profissionalEmail: string;
  descricao: string;
  contrato: string;
  contratoCodigo: string;
  contratoNome?: string;
  os: string;
  osCodigo: string;
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

function normalizeDisciplineSetting(value: any) {
  if (typeof value === 'string') {
    const nome = value.trim();
    return nome ? { nome, showInCharts: true } : null;
  }

  if (!value || typeof value !== 'object') return null;
  const nome = String(value?.nome || value?.name || '').trim();
  if (!nome) return null;

  return {
    nome,
    showInCharts: value?.showInCharts !== false,
  };
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

function cleanHierarchyCode(value: any) {
  const text = String(value || '').trim();
  if (!text || isDateLikeLabel(text)) return '';
  return text;
}

function buildItemOsMap(registro: any) {
  const map: Record<string, string> = {};
  const itemOptions = Array.isArray(registro?.itemOptions) ? registro.itemOptions : [];

  itemOptions.forEach((item: any) => {
    const itemCode = cleanHierarchyCode(item?.codigo || item?.code || item?.id);
    const osCode = cleanHierarchyCode(item?.osCodigo || item?.osCode);
    if (itemCode && osCode) map[itemCode] = osCode;
  });

  return map;
}

function buildOsContractMap(registro: any) {
  const map: Record<string, string> = {};
  const osOptions = Array.isArray(registro?.osOptions) ? registro.osOptions : [];

  osOptions.forEach((item: any) => {
    const osCode = cleanHierarchyCode(item?.codigo || item?.code || item?.id);
    const contractCode = cleanHierarchyCode(item?.contratoCodigo || item?.contractCode);
    if (osCode && contractCode) map[osCode] = contractCode;
  });

  return map;
}

function getContractFromOsCode(osCode: string) {
  const parts = cleanHierarchyCode(osCode).split('.');
  return parts.length > 1 ? parts[0] : '';
}

function looksLikeWeakCode(value: string) {
  const text = cleanHierarchyCode(value);
  return !text || /^\d+$/.test(text);
}

function getBestHierarchyLabel(code: string, name?: string, fallback = '') {
  const cleanCode = cleanHierarchyCode(code);
  const cleanName = cleanHierarchyCode(name);
  if (cleanName && looksLikeWeakCode(cleanCode)) return cleanName;
  return cleanCode || cleanName || fallback;
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

function buildContractCodeByNameMap(registro: any) {
  const map: Record<string, string> = {};
  const contracts = Array.isArray(registro?.contracts) ? registro.contracts : [];
  contracts.forEach((item: any) => {
    const codigo = String(item?.codigo || item?.code || item?.id || '').trim();
    const nome = normalizeText(String(item?.nome || item?.name || codigo).trim());
    if (codigo && nome && !map[nome]) map[nome] = codigo;
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

function buildOsCodeByNameMap(registro: any) {
  const map: Record<string, string> = {};
  const osOptions = Array.isArray(registro?.osOptions) ? registro.osOptions : [];
  osOptions.forEach((item: any) => {
    const codigo = String(item?.codigo || item?.code || item?.id || '').trim();
    const nome = normalizeText(String(item?.nome || item?.name || codigo).trim());
    if (codigo && nome && !map[nome]) map[nome] = codigo;
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
  const contractCodeByName = buildContractCodeByNameMap(registro);
  const osNameByCode = buildOsNameMap(registro);
  const osCodeByName = buildOsCodeByNameMap(registro);
  const osByItemCode = buildItemOsMap(registro);
  const contractByOsCode = buildOsContractMap(registro);
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
    const rawItemNome = String(activity?.itemNome || activity?.descricao || '').trim();
    const rawOsNome = String(activity?.osNome || activity?.os || '').trim();
    const rawContratoNome = String(activity?.contratoNome || activity?.contrato || '').trim();
    const itemCodigo = cleanHierarchyCode(activity?.itemCodigo);
    const resolvedOsCodigoFromName = osCodeByName[normalizeText(rawOsNome)] || '';
    const osCodigo = osByItemCode[itemCodigo] || cleanHierarchyCode(activity?.osCodigo) || resolvedOsCodigoFromName || '';
    const contratoCodigo = cleanHierarchyCode(activity?.contratoCodigo)
      || contractByOsCode[osCodigo]
      || contractCodeByName[normalizeText(rawContratoNome)]
      || getContractFromOsCode(osCodigo);
    const osNome = osNameByCode[osCodigo] || rawOsNome || osCodigo || 'Sem OS';
    const contratoNome = contractNameByCode[contratoCodigo] || rawContratoNome || contratoCodigo || 'Sem contrato';
    const cronogramaItem = cronogramaByCode[itemCodigo] || {};
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
        descricao: rawItemNome,
        contrato: getBestHierarchyLabel(contratoCodigo, contratoNome, 'Sem contrato'),
        contratoCodigo,
        contratoNome,
        os: getOsDisplayName(osCodigo, osNome),
        osCodigo,
        osNome,
        disciplina,
        prazoAtual,
        dificuldade: difficultyToNumber(activity?.dificuldade),
        importancia: importanceValue,
        responsavel: nome,
        percentualConcluido: avanco,
        termino: prazo,
        prazo,
        avaliacao: String(activity?.avaliacaoAtual || '').trim() || EMPTY_STATUS,
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
    const osCodigo = item.osCodigo || item.os || 'Sem OS';
    const osNome = item.osNome || item.os || osCodigo;
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
    const matchContrato = isAllValue(filtros.contrato)
      || normalizeText(item.contratoCodigo) === normalizeText(filtros.contrato)
      || normalizeText(item.contrato) === normalizeText(filtros.contrato);
    const matchOS = isAllValue(filtros.os)
      || normalizeText(item.osCodigo) === normalizeText(filtros.os)
      || normalizeText(item.os) === normalizeText(filtros.os);
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
    if (contrato && !map.has(contrato)) {
      map.set(contrato, { codigo: contrato, nome });
    }
  });

  if (map.size === 0) {
    tableData.forEach((row) => {
      const contrato = String(row.contratoCodigo || row.contrato || '').trim();
      const nome = String(row.contratoNome || row.contrato || contrato).trim();
      if (contrato && !map.has(contrato)) {
        map.set(contrato, { codigo: contrato, nome });
      }
    });
  }

  return Array.from(map.values());
}

function getOsOptions(registro: any, tableData: ConsultaAtividade[], contrato: string) {
  const target = normalizeText(contrato);
  const map = new Map<string, string>();

  const fromRegistro = Array.isArray(registro?.osOptions) ? registro.osOptions : [];
  fromRegistro
    .filter((item: any) => {
      const contratoOs = String(item?.contratoCodigo || item?.contractCode || '').trim();
      return isAllValue(contrato) || normalizeText(contratoOs) === target;
    })
    .forEach((item: any) => {
      const os = String(item?.codigo || item?.code || item?.id || '').trim();
      const nome = String(item?.nome || item?.name || os).trim();
      if (os && !map.has(os)) map.set(os, nome);
    });

  if (map.size === 0) {
    tableData
      .filter((row) => isAllValue(contrato) || normalizeText(row.contratoCodigo) === target)
      .forEach((row) => {
        const os = String(row.osCodigo || row.os || '').trim();
        const nome = String(row.osNome || row.os || os).trim();
        if (os && !map.has(os)) map.set(os, nome);
      });
  }

  return Array.from(map.entries()).map(([codigo, nome]) => ({ codigo, nome }));
}

function getProfessionalOptions(registro: any, tableData: ConsultaAtividade[], disciplina: string) {
  const map = new Map<string, { nome: string; email: string }>();

  const professionalsByDisciplina = registro?.professionalsByDisciplina && typeof registro.professionalsByDisciplina === 'object'
    ? registro.professionalsByDisciplina
    : {};

  Object.entries(professionalsByDisciplina).forEach(([disciplinaAtual, profissionais]) => {
    const sameDisciplina = isAllValue(disciplina) || normalizeText(disciplinaAtual) === normalizeText(disciplina);
    if (!sameDisciplina || !Array.isArray(profissionais)) return;

    profissionais.forEach((item: any) => {
      const nome = String(item?.nome || item?.name || '').trim();
      const email = String(item?.email || '').trim();
      const key = normalizeText(email || nome);
      if (!key || map.has(key)) return;
      map.set(key, { nome, email });
    });
  });

  tableData.forEach((item) => {
    const sameDisciplina = isAllValue(disciplina) || normalizeText(item.disciplina) === normalizeText(disciplina);
    if (!sameDisciplina) return;
    const nome = String(item.profissional || '').trim();
    const email = String(item.profissionalEmail || '').trim();
    const key = normalizeText(email || nome);
    if (!key || map.has(key)) return;
    map.set(key, { nome, email });
  });

  return Array.from(map.values()).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

function getEvaluationOptions(tableData: ConsultaAtividade[]) {
  const preferredOrder = [
    'Dentro do esperado',
    'Melhor que o esperado',
    'Pior que o esperado',
    'Problema/Bloqueio',
    'A programar',
  ];
  const unique = Array.from(new Set(tableData.map((item) => String(item.avaliacao || '').trim()).filter(Boolean)));
  return unique.sort((a, b) => {
    const ai = preferredOrder.findIndex((item) => normalizeText(item) === normalizeText(a));
    const bi = preferredOrder.findIndex((item) => normalizeText(item) === normalizeText(b));
    if (ai === -1 && bi === -1) return a.localeCompare(b, 'pt-BR');
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });
}

export default function DashboardEngenharia({ filtrosAtivos, preloadedData, mode = 'profissionais', activeContractCode }: DashboardEngenhariaProps) {
  const filtroContratoGlobal = filtrosAtivos?.contrato || 'Todos';
  const filtroOSGlobal = filtrosAtivos?.os || 'Todos';
  const filtroDisciplina = filtrosAtivos?.disciplina || 'Todos';

  const tableData = React.useMemo(
    () => buildConsultaData(preloadedData?.registro, preloadedData?.cronograma, preloadedData?.admin),
    [preloadedData?.registro, preloadedData?.cronograma, preloadedData?.admin]
  );

  const disciplinasCadastradas = React.useMemo(() => {
    const adminDisciplinasBrutas = Array.isArray(preloadedData?.admin?.disciplinas) ? preloadedData.admin.disciplinas : [];
    const adminDisciplineSettings = adminDisciplinasBrutas
      .map((item: any) => normalizeDisciplineSetting(item))
      .filter(Boolean) as Array<{ nome: string; showInCharts: boolean }>;
    const fromAdmin = adminDisciplineSettings.map((item) => item.nome);
    const fromRegistro = Array.isArray(preloadedData?.registro?.usersSummary)
      ? preloadedData.registro.usersSummary.map((user: any) => String(user?.disciplina || '').trim()).filter(Boolean)
      : [];
    const fromActivities = tableData.map((item) => String(item.disciplina || '').trim()).filter(Boolean);
    return Array.from(new Set([...fromAdmin, ...fromRegistro, ...fromActivities]));
  }, [preloadedData?.admin?.disciplinas, preloadedData?.registro?.usersSummary, tableData]);

  const disciplinasGraficos = React.useMemo(() => {
    const adminDisciplinasBrutas = Array.isArray(preloadedData?.admin?.disciplinas) ? preloadedData.admin.disciplinas : [];
    const adminDisciplineSettings = adminDisciplinasBrutas
      .map((item: any) => normalizeDisciplineSetting(item))
      .filter(Boolean) as Array<{ nome: string; showInCharts: boolean }>;

    if (adminDisciplineSettings.length === 0) return disciplinasCadastradas;

    const visibles = adminDisciplineSettings
      .filter((item) => item.showInCharts !== false)
      .map((item) => item.nome)
      .filter(Boolean);

    return visibles.length > 0 ? visibles : disciplinasCadastradas;
  }, [disciplinasCadastradas, preloadedData?.admin?.disciplinas]);

  const disciplinasGraficosSet = React.useMemo(() => {
    return new Set(disciplinasGraficos.map((item) => normalizeText(item)).filter(Boolean));
  }, [disciplinasGraficos]);

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
  const [filtrosConsulta, setFiltrosConsulta] = React.useState<FiltrosConsulta>({
    contrato: filtroContratoGlobal,
    os: filtroOSGlobal,
    disciplina: filtroDisciplina,
    profissional: 'Todos',
    avaliacao: 'Todas',
  });
  const [consultaSearch, setConsultaSearch] = React.useState('');

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
    setFiltrosConsulta((prev) => ({
      ...prev,
      contrato: filtroContratoGlobal,
      os: filtroOSGlobal,
      disciplina: filtroDisciplina,
    }));
  }, [filtroContratoGlobal, filtroOSGlobal, filtroDisciplina]);

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
  const contractOptionsConsulta = React.useMemo(
    () => getContractOptions(preloadedData?.registro, tableData),
    [preloadedData?.registro, tableData]
  );
  const osOptionsConsulta = React.useMemo(
    () => getOsOptions(preloadedData?.registro, tableData, filtrosConsulta.contrato),
    [preloadedData?.registro, tableData, filtrosConsulta.contrato]
  );
  const disciplineOptionsConsulta = React.useMemo(
    () => disciplinasCadastradas.filter(Boolean).sort((a, b) => a.localeCompare(b, 'pt-BR')),
    [disciplinasCadastradas]
  );
  const professionalOptionsConsulta = React.useMemo(
    () => getProfessionalOptions(preloadedData?.registro, tableData, filtrosConsulta.disciplina),
    [preloadedData?.registro, tableData, filtrosConsulta.disciplina]
  );
  const evaluationOptionsConsulta = React.useMemo(
    () => getEvaluationOptions(tableData),
    [tableData]
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

  React.useEffect(() => {
    if (isAllValue(filtrosConsulta.os)) return;
    const exists = osOptionsConsulta.some((item) => normalizeText(item.codigo) === normalizeText(filtrosConsulta.os));
    if (!exists) {
      setFiltrosConsulta((prev) => ({ ...prev, os: 'Todos' }));
    }
  }, [osOptionsConsulta, filtrosConsulta.os]);

  React.useEffect(() => {
    if (normalizeText(filtrosConsulta.profissional) === 'todos') return;
    const exists = professionalOptionsConsulta.some((item) => normalizeText(item.nome) === normalizeText(filtrosConsulta.profissional));
    if (!exists) {
      setFiltrosConsulta((prev) => ({ ...prev, profissional: 'Todos' }));
    }
  }, [professionalOptionsConsulta, filtrosConsulta.profissional]);

  const tableComposicaoFiltrada = React.useMemo(() => {
    return filterByContractOsAndDiscipline(tableData, filtrosComposicao, filtroDisciplina);
  }, [tableData, filtrosComposicao, filtroDisciplina]);

  const tableComposicaoGraficos = React.useMemo(() => {
    return tableComposicaoFiltrada.filter((item) => disciplinasGraficosSet.has(normalizeText(item.disciplina)));
  }, [disciplinasGraficosSet, tableComposicaoFiltrada]);

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

  const tableAnaliseGraficos = React.useMemo(() => {
    return tableAnaliseFiltrada.filter((item) => disciplinasGraficosSet.has(normalizeText(item.disciplina)));
  }, [disciplinasGraficosSet, tableAnaliseFiltrada]);

  const tableConsultaFiltrada = React.useMemo(() => {
    const base = filterByContractOsAndDiscipline(
      tableData,
      { contrato: filtrosConsulta.contrato, os: filtrosConsulta.os },
      filtrosConsulta.disciplina
    );
    return base.filter((item) => {
      const matchProfissional = normalizeText(filtrosConsulta.profissional) === 'todos'
        || normalizeText(item.profissional) === normalizeText(filtrosConsulta.profissional);
      const matchAvaliacao = normalizeText(filtrosConsulta.avaliacao) === 'todas'
        || normalizeText(item.avaliacao) === normalizeText(filtrosConsulta.avaliacao);
      const search = normalizeText(consultaSearch);
      const matchSearch = !search || [
        item.profissional,
        item.disciplina,
        item.contrato,
        item.contratoNome,
        item.os,
        item.osNome,
        item.descricao,
        item.avaliacao,
      ].some((value) => normalizeText(String(value || '')).includes(search));
      return matchProfissional && matchAvaliacao && matchSearch;
    });
  }, [tableData, filtrosConsulta, consultaSearch]);

  const tableConsultaGraficos = React.useMemo(() => {
    return tableConsultaFiltrada.filter((item) => disciplinasGraficosSet.has(normalizeText(item.disciplina)));
  }, [disciplinasGraficosSet, tableConsultaFiltrada]);

  const dadosComposicaoFiltrados = React.useMemo(() => {
    return buildComposicaoData(tableComposicaoGraficos, disciplinasGraficos).map((item) => {
      const total = disciplinasGraficos.reduce((acc, disciplina) => acc + Number(item[disciplinaKey(disciplina)] || 0), 0);
      return { ...item, total };
    });
  }, [disciplinasGraficos, tableComposicaoGraficos]);

  const dadosImpactoEsforco = React.useMemo(() => {
    return tableAnaliseGraficos.map(item => ({
      id: item.id,
      os: item.os,
      osCodigo: item.osCodigo,
      osNome: item.osNome,
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
  }, [tableAnaliseGraficos]);

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

  const resetConsultaFiltros = () => {
    setFiltrosConsulta({
      contrato: filtroContratoGlobal,
      os: filtroOSGlobal,
      disciplina: filtroDisciplina,
      profissional: 'Todos',
      avaliacao: 'Todas',
    });
    setConsultaSearch('');
  };

  return (
    <div className="w-full space-y-6 sm:space-y-8 font-['Montserrat'] relative">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 sm:gap-8">
        {mode === 'profissionais' && (
          <>
            <div className="lg:col-span-12">
              <ExpandableSection title="Composicao de Profissionais por OS">
                <ComposicaoDeProfissionaisPorOS
                  dados={dadosComposicaoFiltrados}
                  disciplinas={disciplinasGraficos}
                  filtros={{ contrato: filtrosComposicao.contrato, os: filtrosComposicao.os }}
                  contractOptions={contractOptionsComposicao}
                  osOptions={osOptionsComposicao}
                  onFiltroChange={updateFiltroComposicao}
                />
              </ExpandableSection>
            </div>

            <div className="lg:col-span-12">
              <ExpandableSection title="Alocacao de Disciplina por OS">
                <NovoGrafico dados={tableConsultaGraficos} />
              </ExpandableSection>
            </div>

            <div className="lg:col-span-12">
              <ExpandableSection title="Profissionais">
                <Alocacoes preloadedData={preloadedData} activeContractCode={activeContractCode} />
              </ExpandableSection>
            </div>
          </>
        )}

        {mode === 'planejamento' && (
          <>
            <div className="lg:col-span-6">
              <ExpandableSection title="Matriz de Priorizacao">
                <MatrizDePriorizacao
                  tableFiltrada={tableMatrizFiltrada}
                  maxPrazo={maxPrazo}
                  filtros={filtrosMatriz}
                  contractOptions={contractOptionsMatriz}
                  osOptions={osOptionsMatriz}
                  onFiltroChange={updateFiltroMatriz}
                />
              </ExpandableSection>
            </div>

            <div className="lg:col-span-6">
              <ExpandableSection title="Analise de Atuacao Executiva">
                <SituacaoPorDisciplina
                  dadosBrutos={dadosImpactoEsforco}
                  filtros={filtrosAnalise}
                  contractOptions={contractOptionsAnalise}
                  osOptions={osOptionsAnalise}
                  onFiltroChange={updateFiltroAnalise}
                />
              </ExpandableSection>
            </div>
          </>
        )}
      </div>

      {mode === 'profissionais' && (
      <ExpandableSection title="Consulta de Atividades">
      <div className="bg-white border border-[#E5E7EB] rounded-[12px] p-6 sm:p-8">
        <div className="flex items-center gap-3 border-b border-[#E5E7EB] pb-4 mb-6">
          <span className="material-symbols-outlined text-[#F05D28] text-xl">list_alt</span>
          <h2 className="text-[14px] font-bold text-[#2D2D2D] uppercase tracking-widest">Consulta de Atividades</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
          <div className="space-y-1.5 md:col-span-1">
            <label className="text-[10px] font-bold text-[#757575] uppercase tracking-widest">Contrato</label>
            <select
              className="w-full h-11 px-4 bg-white border border-[#E5E7EB] rounded-xl text-xs font-bold text-[#2D2D2D] focus:border-[#F05D28] focus:ring-1 focus:ring-[#F05D28] transition-colors outline-none cursor-pointer"
              value={filtrosConsulta.contrato}
              onChange={(e) => setFiltrosConsulta((prev) => ({ ...prev, contrato: e.target.value, os: 'Todos' }))}
            >
              <option value="Todos">Todos</option>
              {contractOptionsConsulta.map((item) => (
                <option key={item.codigo} value={item.codigo}>{item.codigo} - {item.nome}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5 md:col-span-1">
            <label className="text-[10px] font-bold text-[#757575] uppercase tracking-widest">OS</label>
            <select
              className="w-full h-11 px-4 bg-white border border-[#E5E7EB] rounded-xl text-xs font-bold text-[#2D2D2D] focus:border-[#F05D28] focus:ring-1 focus:ring-[#F05D28] transition-colors outline-none cursor-pointer"
              value={filtrosConsulta.os}
              onChange={(e) => setFiltrosConsulta((prev) => ({ ...prev, os: e.target.value }))}
            >
              <option value="Todos">Todas as OS</option>
              {osOptionsConsulta.map((item) => (
                <option key={item.codigo} value={item.codigo}>{item.nome}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5 md:col-span-1">
            <label className="text-[10px] font-bold text-[#757575] uppercase tracking-widest">Disciplina</label>
            <select
              className="w-full h-11 px-4 bg-white border border-[#E5E7EB] rounded-xl text-xs font-bold text-[#2D2D2D] focus:border-[#F05D28] focus:ring-1 focus:ring-[#F05D28] transition-colors outline-none cursor-pointer"
              value={filtrosConsulta.disciplina}
              onChange={(e) => setFiltrosConsulta((prev) => ({ ...prev, disciplina: e.target.value, profissional: 'Todos' }))}
            >
              <option value="Todos">Todas</option>
              {disciplineOptionsConsulta.map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5 md:col-span-1">
            <label className="text-[10px] font-bold text-[#757575] uppercase tracking-widest">Profissional</label>
            <select
              className="w-full h-11 px-4 bg-white border border-[#E5E7EB] rounded-xl text-xs font-bold text-[#2D2D2D] focus:border-[#F05D28] focus:ring-1 focus:ring-[#F05D28] transition-colors outline-none cursor-pointer"
              value={filtrosConsulta.profissional}
              onChange={(e) => setFiltrosConsulta((prev) => ({ ...prev, profissional: e.target.value }))}
            >
              <option value="Todos">Todos</option>
              {professionalOptionsConsulta.map((item) => (
                <option key={item.email || item.nome} value={item.nome}>{item.nome}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5 md:col-span-1">
            <label className="text-[10px] font-bold text-[#757575] uppercase tracking-widest">Avaliação</label>
            <select
              className="w-full h-11 px-4 bg-white border border-[#E5E7EB] rounded-xl text-xs font-bold text-[#2D2D2D] focus:border-[#F05D28] focus:ring-1 focus:ring-[#F05D28] transition-colors outline-none cursor-pointer"
              value={filtrosConsulta.avaliacao}
              onChange={(e) => setFiltrosConsulta((prev) => ({ ...prev, avaliacao: e.target.value }))}
            >
              <option value="Todas">Todas</option>
              {evaluationOptionsConsulta.map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex flex-col md:flex-row gap-4 mb-8">
          <div className="flex-1 relative">
              <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#757575]" />
              <input
                type="text"
                placeholder="Pesquisar atividades..."
                value={consultaSearch}
                onChange={(e) => setConsultaSearch(e.target.value)}
                className="w-full h-11 pl-12 pr-4 bg-white border border-[#E5E7EB] rounded-xl text-sm font-medium text-[#2D2D2D] focus:border-[#F05D28] focus:ring-1 focus:ring-[#F05D28] outline-none transition-colors"
              />
            </div>
          <button
            type="button"
            onClick={resetConsultaFiltros}
            className="h-11 px-6 border border-[#E5E7EB] text-[#757575] hover:bg-[#F4F5F7] hover:text-[#2D2D2D] rounded-xl font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-colors"
          >
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
                        <span className="text-[10px] text-[#757575] uppercase tracking-wider">{item.contratoNome || item.contrato}</span>
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
      </ExpandableSection>
      )}

      {mode === 'profissionais' && (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ExpandableSection title="Matriz de Priorizacao">
          <MatrizDePriorizacao
            tableFiltrada={tableMatrizFiltrada}
            maxPrazo={maxPrazo}
            filtros={filtrosMatriz}
            contractOptions={contractOptionsMatriz}
            osOptions={osOptionsMatriz}
            onFiltroChange={updateFiltroMatriz}
          />
        </ExpandableSection>

        <ExpandableSection title="Analise de Atuacao Executiva">
          <SituacaoPorDisciplina
            dadosBrutos={dadosImpactoEsforco}
            filtros={filtrosAnalise}
            contractOptions={contractOptionsAnalise}
            osOptions={osOptionsAnalise}
            onFiltroChange={updateFiltroAnalise}
          />
        </ExpandableSection>
      </div>
      )}
    </div>
  );
}
