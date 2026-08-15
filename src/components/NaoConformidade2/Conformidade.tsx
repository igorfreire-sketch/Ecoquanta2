import React, { useEffect, useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Download, RefreshCcw, Save } from 'lucide-react';
import SearchableSelect from '../SearchableSelect';
import Preenchimento from './Preenchimento';
import Revisoes from './Revisoes';
import TerceirizadasCadastro from '../TerceirizadasCadastro';
import Cronograma from '../Cronograma';
import { getRecords, isNc2ConformidadeUser, type Nc2Record } from './ncStore';
import {
  buildDashboardMetrics,
  filterDashboardRecords,
  type DashboardMetricSlice,
} from './Conformidade.metrics.check';
import { sameContractCode } from '../../lib/contractCode';
import type { TerceirizadaRecord } from '../Administracao';
import type { AuthUser } from '../LoginScreen';

type RegistroContract = {
  id?: string;
  code?: string;
  codigo?: string;
  name?: string;
  nome?: string;
};

type RegistroOs = {
  id?: string;
  code?: string;
  codigo?: string;
  name?: string;
  nome?: string;
  contractCode?: string;
  contratoCodigo?: string;
  contrato?: string;
  contractId?: string;
};

const ITEM_TYPES = ['Carimbo', 'Desenho', 'Relatório', 'Arquivo'] as const;
type ItemType = (typeof ITEM_TYPES)[number];

const getContractCode = (contract: RegistroContract) =>
  String(contract.code || contract.codigo || contract.id || '').trim();

const getContractName = (contract: RegistroContract) =>
  String(contract.name || contract.nome || getContractCode(contract)).trim();

const getOsCode = (os: RegistroOs) =>
  String(os.code || os.codigo || os.id || '').trim();

const getOsName = (os: RegistroOs) =>
  String(os.name || os.nome || getOsCode(os)).trim();

const getOsContractCode = (os: RegistroOs) =>
  String(os.contractCode || os.contratoCodigo || os.contrato || os.contractId || '').trim();

function normalizeText(value?: string) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

const getFilterValue = (value?: string) =>
  ['todos', 'todas'].includes(normalizeText(value)) ? '' : String(value || '').trim();

const MONTH_ABBR = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

// Jan/2025 até o mês atual, calculado a cada carregamento — nunca hardcodear o fim.
function getMonthOptions() {
  const now = new Date();
  const options: { value: string; label: string }[] = [];
  for (let year = 2025; year <= now.getFullYear(); year++) {
    const lastMonth = year === now.getFullYear() ? now.getMonth() : 11;
    for (let month = 0; month <= lastMonth; month++) {
      options.push({
        value: `${year}-${String(month + 1).padStart(2, '0')}`,
        label: `${MONTH_ABBR[month]}/${year}`,
      });
    }
  }
  return options;
}

const displayNameWithCode = (name: string, code: string) =>
  name && normalizeText(name) !== normalizeText(code) ? `${name} (${code})` : name || code;

const DISTRIBUTION_COLORS = [
  '#F05D28',
  '#334155',
  '#64748B',
  '#0F766E',
  '#D97706',
  '#0284C7',
  '#94A3B8',
];

function compactDistribution(data: DashboardMetricSlice[], remainderLabel: string) {
  if (data.length <= 7) return data;
  return [
    ...data.slice(0, 6),
    {
      name: `${remainderLabel} (${data.length - 6})`,
      value: data.slice(6).reduce((sum, item) => sum + item.value, 0),
    },
  ];
}

function DistributionDonut({
  title,
  subtitle,
  data,
  remainderLabel,
  emptyMessage,
}: {
  title: string;
  subtitle: string;
  data: DashboardMetricSlice[];
  remainderLabel: string;
  emptyMessage: string;
}) {
  const chartData = compactDistribution(data, remainderLabel);
  const total = data.reduce((sum, item) => sum + item.value, 0);

  return (
    <section className="rounded-2xl bg-white p-6 shadow-[0_10px_30px_-22px_rgba(15,23,42,0.45)]">
      <p className="text-[10px] font-extrabold uppercase tracking-[1.2px] text-[#94A3B8]">
        DISTRIBUIÇÃO
      </p>
      <h2 className="mt-1 text-[18px] font-black text-[#2D2D2D]">{title}</h2>
      <p className="mt-1 text-[11px] font-medium text-[#757575]">{subtitle}</p>

      {chartData.length === 0 ? (
        <div className="mt-5 flex min-h-[260px] items-center justify-center rounded-2xl bg-[#F8FAFC] px-6 text-center text-[13px] font-bold text-[#64748B]">
          {emptyMessage}
        </div>
      ) : (
        <div className="mt-4 grid items-center gap-4 sm:grid-cols-[minmax(220px,0.85fr)_minmax(220px,1.15fr)]">
          <div
            className="relative h-[260px] min-w-0"
            role="img"
            aria-label={`${title}: ${total.toLocaleString('pt-BR')} não conformidades`}
          >
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={chartData}
                  cx="50%"
                  cy="50%"
                  innerRadius={66}
                  outerRadius={96}
                  paddingAngle={2}
                  cornerRadius={5}
                  dataKey="value"
                  nameKey="name"
                  stroke="#FFFFFF"
                  strokeWidth={3}
                >
                  {chartData.map((item, index) => (
                    <Cell
                      key={item.name}
                      fill={DISTRIBUTION_COLORS[index % DISTRIBUTION_COLORS.length]}
                    />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value) => [
                    Number(value).toLocaleString('pt-BR'),
                    'Não conformidades',
                  ]}
                  contentStyle={{
                    borderRadius: '12px',
                    border: '1px solid #E5E7EB',
                    boxShadow: '0 14px 30px -20px rgba(15,23,42,0.5)',
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <strong className="text-[28px] font-black leading-none text-[#1E293B]">
                {total.toLocaleString('pt-BR')}
              </strong>
              <span className="mt-2 text-[9px] font-extrabold uppercase tracking-[1px] text-[#94A3B8]">
                Não conformidades
              </span>
            </div>
          </div>

          <div className="space-y-2">
            {chartData.map((item, index) => (
              <div
                key={item.name}
                className="grid grid-cols-[10px_minmax(0,1fr)_auto] items-center gap-2 rounded-xl bg-[#F8FAFC] px-3 py-2"
              >
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: DISTRIBUTION_COLORS[index % DISTRIBUTION_COLORS.length] }}
                />
                <span className="truncate text-[11px] font-bold text-[#475569]" title={item.name}>
                  {item.name}
                </span>
                <span className="text-[12px] font-black text-[#1E293B]">
                  {item.value.toLocaleString('pt-BR')}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function Dashboard({
  selectedContract,
  selectedOs,
  selectedMonth,
  selectedContractLabel,
  selectedOsLabel,
  lockedContractCode,
  disciplinas = [],
}: {
  selectedContract: string;
  selectedOs: string;
  selectedMonth: string;
  selectedContractLabel: string;
  selectedOsLabel: string;
  lockedContractCode?: string;
  disciplinas?: string[];
}) {
  const [selectedDiscipline, setSelectedDiscipline] = useState('');
  const [selectedType, setSelectedType] = useState('');
  const [selectedOrigin, setSelectedOrigin] = useState('');
  const [records, setRecords] = useState<Nc2Record[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [exportingPdf, setExportingPdf] = useState(false);
  const [exportError, setExportError] = useState('');

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      try {
        const next = await getRecords(lockedContractCode);
        if (!cancelled) {
          setRecords(next);
          setErrorMessage('');
        }
      } catch (error) {
        if (!cancelled) {
          setRecords([]);
          setErrorMessage('Firebase recusou acesso aos dados reais. Nenhum registro demo será exibido.');
        }
        console.error('Erro ao carregar registros de conformidade:', error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [lockedContractCode]);

  const filteredRecords = useMemo(
    () => filterDashboardRecords(records, selectedContract, selectedOs, selectedMonth),
    [records, selectedContract, selectedOs, selectedMonth],
  );

  const disciplineOptions = useMemo(() => {
    const names = new Map<string, string>();
    [...disciplinas, ...filteredRecords.map((record) => record.disciplina || 'Sem disciplina')].forEach(
      (value) => {
        const name = String(value || '').trim();
        if (name) names.set(normalizeText(name), name);
      },
    );
    return Array.from(names.values()).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [disciplinas, filteredRecords]);

  const metrics = useMemo(
    () => buildDashboardMetrics(filteredRecords, selectedDiscipline, selectedType, selectedOrigin),
    [filteredRecords, selectedDiscipline, selectedType, selectedOrigin],
  );

  const {
    disciplinesData,
    totalAnalyzedData,
    ncByDiscipline,
    ncByType,
    ncByCompany,
    ncByResolution,
    internalAnalyzed,
    outsourcedAnalyzed,
    perfectFiles,
    totalNonConformities,
    totalAnalyzed,
  } = metrics;

  const exportPdf = async () => {
    setExportingPdf(true);
    setExportError('');
    try {
      const {
        buildConformidadePdf,
        getConformidadePdfFilename,
        loadQuantaLogoDataUrl,
      } = await import('./conformidadePdf');
      const generatedAt = new Date();
      const logoDataUrl = await loadQuantaLogoDataUrl();
      const pdf = buildConformidadePdf(
        {
          generatedAt,
          contractLabel: selectedContractLabel,
          osLabel: selectedOsLabel,
          recordCount: filteredRecords.length,
          internalAnalyzed,
          outsourcedAnalyzed,
          perfectFiles,
          totalAnalyzed,
          totalNonConformities,
          ncByDiscipline,
          ncByType,
          ncByCompany,
        },
        { logoDataUrl },
      );
      pdf.save(getConformidadePdfFilename(generatedAt, selectedContract, selectedOs));
    } catch (error) {
      console.error('Erro ao exportar relatório de conformidade:', error);
      setExportError('Não foi possível gerar o PDF. Tente novamente.');
    } finally {
      setExportingPdf(false);
    }
  };

  const totalSummary = [
    {
      label: 'Itens internos analisados',
      value: internalAnalyzed,
      color: '#64748B',
      background: 'linear-gradient(145deg, #FFFFFF, #F8FAFC)',
    },
    {
      label: 'Itens terceirizados analisados',
      value: outsourcedAnalyzed,
      color: '#F05D28',
      background: 'linear-gradient(145deg, #FFFFFF, #F8FAFC)',
    },
    {
      label: 'Arquivos perfeitos',
      value: perfectFiles,
      color: '#059669',
      background: 'linear-gradient(145deg, #FFFFFF, #F8FAFC)',
    },
    {
      label: 'Total analisado',
      value: totalAnalyzed,
      color: '#1E293B',
      background: 'linear-gradient(145deg, #FFFFFF, #F8FAFC)',
    },
  ];

  if (loading) {
    return (
      <div className="flex min-h-[320px] items-center justify-center rounded-2xl bg-white text-[13px] font-bold text-[#757575] shadow-[0_10px_30px_-22px_rgba(15,23,42,0.45)]">
        <RefreshCcw size={16} className="mr-3 animate-spin text-[#F05D28]" />
        Carregando registros...
      </div>
    );
  }

  if (errorMessage) {
    return (
      <div className="rounded-2xl border border-[#FECACA] bg-[#FEF2F2] px-5 py-4 text-[13px] font-medium text-[#B91C1C]">
        {errorMessage}
      </div>
    );
  }

  if (filteredRecords.length === 0) {
    return (
      <div className="rounded-2xl bg-white p-10 text-center text-[14px] font-medium text-[#757575] shadow-[0_10px_30px_-22px_rgba(15,23,42,0.45)]">
        Nenhum registro de conformidade encontrado para os filtros selecionados.
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col gap-6 animate-in fade-in duration-500">
      <section className="relative overflow-hidden rounded-2xl bg-white p-6 shadow-[0_10px_30px_-22px_rgba(15,23,42,0.45)] md:p-8">
        <div className="relative mb-4">
          <p className="text-[10px] font-extrabold uppercase tracking-[1.2px] text-[#94A3B8]">ANÁLISE</p>
          <div className="mt-1 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-[20px] font-black text-[#2D2D2D] md:text-[24px]">
                Itens totais analisados
              </h2>
              <p className="mt-1 text-[12px] font-medium text-[#757575]">
                Totais por origem, com os arquivos perfeitos destacados separadamente.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void exportPdf()}
                disabled={exportingPdf}
                aria-busy={exportingPdf}
                className="inline-flex h-9 items-center gap-2 rounded-xl bg-[#F05D28] px-4 text-[11px] font-extrabold uppercase tracking-[0.8px] text-white transition-colors hover:bg-[#D94E1F] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F05D28]/40 focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-70"
              >
                {exportingPdf ? (
                  <RefreshCcw size={14} className="animate-spin" aria-hidden="true" />
                ) : (
                  <Download size={14} aria-hidden="true" />
                )}
                {exportingPdf ? 'Gerando PDF' : 'Exportar PDF'}
              </button>
              <span className="rounded-full bg-[#F8FAFC] px-4 py-2 text-[11px] font-extrabold uppercase tracking-[1px] text-[#475569] ring-1 ring-inset ring-[#E2E8F0]">
                {filteredRecords.length} {filteredRecords.length === 1 ? 'registro' : 'registros'}
              </span>
            </div>
          </div>
        </div>

        {exportError && (
          <p
            role="alert"
            className="relative mb-4 rounded-xl bg-[#FEF2F2] px-4 py-3 text-[12px] font-bold text-[#B91C1C]"
          >
            {exportError}
          </p>
        )}

        <div className="relative grid items-center gap-6 lg:grid-cols-[minmax(300px,0.9fr)_minmax(360px,1.1fr)]">
          <div className="relative h-[330px] w-full">
            <div className="pointer-events-none absolute left-1/2 top-[54%] h-32 w-60 -translate-x-1/2 rounded-full bg-slate-900/10 blur-2xl" />
            {totalAnalyzedData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <defs>
                    <linearGradient id="totalInternalGradient" x1="0" y1="0" x2="1" y2="1">
                      <stop offset="0%" stopColor="#CBD5E1" />
                      <stop offset="52%" stopColor="#64748B" />
                      <stop offset="100%" stopColor="#334155" />
                    </linearGradient>
                    <linearGradient id="totalOutsourcedGradient" x1="0" y1="0" x2="1" y2="1">
                      <stop offset="0%" stopColor="#FDBA74" />
                      <stop offset="52%" stopColor="#F05D28" />
                      <stop offset="100%" stopColor="#C2410C" />
                    </linearGradient>
                  </defs>
                  <Pie
                    data={totalAnalyzedData}
                    cx="50%"
                    cy="48%"
                    innerRadius={82}
                    outerRadius={122}
                    paddingAngle={4}
                    cornerRadius={8}
                    dataKey="value"
                    nameKey="name"
                    stroke="rgba(255,255,255,0.82)"
                    strokeWidth={3}
                  >
                    {totalAnalyzedData.map((entry) => (
                      <Cell
                        key={entry.name}
                        fill={`url(#${entry.gradient})`}
                        style={{ filter: 'drop-shadow(0 10px 8px rgba(15,23,42,0.2))' }}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      borderRadius: '12px',
                      border: '1px solid #E5E7EB',
                      boxShadow: '0 12px 28px -18px rgba(15,23,42,0.45)',
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="absolute left-1/2 top-[48%] h-[244px] w-[244px] -translate-x-1/2 -translate-y-1/2 rounded-full border-[40px] border-[#E2E8F0] shadow-[0_18px_24px_-18px_rgba(15,23,42,0.45)]" />
            )}
            <div className="pointer-events-none absolute left-1/2 top-[48%] flex -translate-x-1/2 -translate-y-1/2 flex-col items-center">
              <span className="text-[42px] font-black leading-none text-[#1E293B]">
                {totalAnalyzed.toLocaleString('pt-BR')}
              </span>
              <span className="mt-2 text-[10px] font-extrabold uppercase tracking-[1.4px] text-[#94A3B8]">
                Total analisado
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {totalSummary.map((item) => (
              <div
                key={item.label}
                className="relative overflow-hidden rounded-2xl border border-white/80 p-5 shadow-[0_16px_30px_-24px_rgba(15,23,42,0.55)]"
                style={{ background: item.background }}
              >
                <div
                  className="absolute inset-y-0 left-0 w-1.5"
                  style={{ backgroundColor: item.color }}
                />
                <div className="flex items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 rounded-full shadow-sm"
                    style={{ backgroundColor: item.color }}
                  />
                  <span className="text-[10px] font-extrabold uppercase tracking-[1px] text-[#64748B]">
                    {item.label}
                  </span>
                </div>
                <strong className="mt-3 block text-[30px] font-black leading-none text-[#1E293B]">
                  {item.value.toLocaleString('pt-BR')}
                </strong>
              </div>
            ))}
          </div>
        </div>

        {totalAnalyzed === 0 && (
          <p className="relative mt-2 text-center text-[12px] font-medium text-[#757575]">
            Os registros existem, mas ainda não possuem quantidades C ou T contabilizadas.
          </p>
        )}
      </section>

      <section className="rounded-2xl bg-white p-6 shadow-[0_10px_30px_-22px_rgba(15,23,42,0.45)] md:p-8">
        <div className="mb-6 flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-[1.2px] text-[#94A3B8]">ANÁLISE</p>
            <h2 className="mt-1 text-[18px] font-black text-[#2D2D2D]">
              Itens analisados por disciplina
            </h2>
            <p className="mt-1 text-[11px] font-medium text-[#757575]">
              Interno e terceirizado. Os filtros abaixo afetam somente este gráfico.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <label className="min-w-[190px] rounded-[20px] border border-[#E5E7EB] bg-white px-4 py-1.5 shadow-sm">
              <span className="block text-[8px] font-extrabold uppercase tracking-[1px] text-[#94A3B8]">
                Disciplina
              </span>
              <SearchableSelect
                value={selectedDiscipline}
                onChange={(event) => setSelectedDiscipline(event.target.value)}
                searchPlaceholder="Pesquisar disciplina..."
                aria-label="Filtrar gráfico por disciplina"
                className="h-5 w-full bg-transparent text-[11px] font-bold text-[#2D2D2D] outline-none"
              >
                <option value="">Todos</option>
                {disciplineOptions.map((discipline) => (
                  <option key={discipline} value={discipline}>
                    {discipline}
                  </option>
                ))}
              </SearchableSelect>
            </label>

            <label className="min-w-[170px] rounded-[20px] border border-[#E5E7EB] bg-white px-4 py-1.5 shadow-sm">
              <span className="block text-[8px] font-extrabold uppercase tracking-[1px] text-[#94A3B8]">
                Origem
              </span>
              <SearchableSelect
                value={selectedOrigin}
                onChange={(event) => setSelectedOrigin(event.target.value)}
                searchPlaceholder="Pesquisar origem..."
                aria-label="Filtrar gráfico por origem"
                className="h-5 w-full bg-transparent text-[11px] font-bold text-[#2D2D2D] outline-none"
              >
                <option value="">Total</option>
                <option value="Interno">Interno</option>
                <option value="Terceirizado">Terceirizado</option>
              </SearchableSelect>
            </label>

            <label className="min-w-[170px] rounded-[20px] border border-[#E5E7EB] bg-white px-4 py-1.5 shadow-sm">
              <span className="block text-[8px] font-extrabold uppercase tracking-[1px] text-[#94A3B8]">
                Tipo
              </span>
              <SearchableSelect
                value={selectedType}
                onChange={(event) => setSelectedType(event.target.value)}
                searchPlaceholder="Pesquisar tipo..."
                aria-label="Filtrar gráfico por tipo"
                className="h-5 w-full bg-transparent text-[11px] font-bold text-[#2D2D2D] outline-none"
              >
                <option value="">Todos</option>
                {ITEM_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </SearchableSelect>
            </label>
          </div>
        </div>

        <div className="h-[400px] w-full">
          {disciplinesData.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center rounded-2xl bg-[#F8FAFC]/70 px-6 text-center">
              <p className="text-[14px] font-bold text-[#475569]">
                Nenhuma não conformidade para estes filtros.
              </p>
              <p className="mt-1 text-[12px] font-medium text-[#94A3B8]">
                Os totais e arquivos perfeitos permanecem contabilizados acima.
              </p>
            </div>
          ) : (
            <div className="h-full overflow-x-auto pb-1">
              <div
                className="h-full"
                style={{ minWidth: `${Math.max(680, disciplinesData.length * 108)}px` }}
                role="img"
                aria-label={`Itens analisados por disciplina: ${disciplinesData
                  .reduce((sum, item) => sum + item.Interno + item.Terceirizado, 0)
                  .toLocaleString('pt-BR')} ocorrências`}
              >
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={disciplinesData}
                    margin={{ top: 22, right: 24, left: 0, bottom: 42 }}
                    barGap={5}
                    barCategoryGap="28%"
                  >
                    <defs>
                      <linearGradient id="ncInternalGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#94A3B8" />
                        <stop offset="100%" stopColor="#334155" />
                      </linearGradient>
                      <linearGradient id="ncOutsourcedGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#FDBA74" />
                        <stop offset="100%" stopColor="#F05D28" />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="2 5" vertical={false} stroke="#E2E8F0" />
                    <XAxis
                      dataKey="name"
                      axisLine={{ stroke: '#CBD5E1' }}
                      tickLine={false}
                      tick={{ fill: '#64748B', fontSize: 10, fontWeight: 700 }}
                      tickFormatter={(value) =>
                        String(value).length > 18 ? `${String(value).slice(0, 17)}…` : String(value)
                      }
                      interval={0}
                      dy={12}
                    />
                    <YAxis
                      allowDecimals={false}
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: '#94A3B8', fontSize: 10, fontWeight: 600 }}
                      width={34}
                    />
                    <Tooltip
                      cursor={{ fill: '#F8FAFC' }}
                      formatter={(value, name) => [
                        Number(value).toLocaleString('pt-BR'),
                        String(name),
                      ]}
                      contentStyle={{
                        borderRadius: '12px',
                        border: '1px solid #E5E7EB',
                        boxShadow: '0 16px 34px -22px rgba(15,23,42,0.55)',
                      }}
                      labelStyle={{ color: '#2D2D2D', fontWeight: 800, marginBottom: 4 }}
                    />
                    <Bar
                      dataKey="Interno"
                      name="Interno"
                      fill="url(#ncInternalGradient)"
                      radius={[8, 8, 2, 2]}
                      maxBarSize={30}
                    />
                    <Bar
                      dataKey="Terceirizado"
                      name="Terceirizado"
                      fill="url(#ncOutsourcedGradient)"
                      radius={[8, 8, 2, 2]}
                      maxBarSize={30}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </div>

        <div className="mt-2 flex items-center justify-center gap-8">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-[#64748B]" />
            <span className="text-[10px] font-medium uppercase tracking-[1px] text-[#757575]">
              Interno
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-[#F05D28]" />
            <span className="text-[10px] font-medium uppercase tracking-[1px] text-[#757575]">
              Terceirizado
            </span>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <DistributionDonut
          title="Problemas por disciplina"
          subtitle="Quantidade de itens com T maior que zero; respeita os filtros de Contrato e OS."
          data={ncByDiscipline}
          remainderLabel="Outras disciplinas"
          emptyMessage="Nenhuma não conformidade por disciplina neste recorte."
        />
        <DistributionDonut
          title="Não conformidades por terceirizada"
          subtitle="Somente registros terceirizados; nomes legados vazios aparecem como Não informada."
          data={ncByCompany}
          remainderLabel="Outras terceirizadas"
          emptyMessage="Nenhuma terceirizada neste recorte."
        />
        <DistributionDonut
          title="Resolvido por"
          subtitle="Quantidade de itens com problema resolvidos por Conformidade ou Terceiro."
          data={ncByResolution}
          remainderLabel="Outras resolucoes"
          emptyMessage="Nenhuma não conformidade terceirizada neste recorte."
        />
      </div>
    </div>
  );
}

interface ConformidadeProps {
  activeTab: 'dashboard' | 'preenchimento' | 'revisoes' | 'terceirizadas' | 'cronograma';
  onTabChange: (tab: 'dashboard' | 'preenchimento' | 'revisoes' | 'terceirizadas' | 'cronograma') => void;
  // Card do Kanban (que vive na Principal) clicado: abre esse registro no Preenchimento.
  pendingEditRecord?: Nc2Record | null;
  onPendingEditConsumed?: () => void;
  currentUser: AuthUser;
  activeContractCode?: string;
  preloadedData?: {
    registro?: {
      contracts?: RegistroContract[];
      osOptions?: RegistroOs[];
      itemOptions?: any[];
    };
    admin?: any;
  };
  lockedContractCode?: string;
  disciplinas?: string[];
  terceirizadas?: TerceirizadaRecord[];
  pendingTerceirizadaIds?: string[];
  onSaveTerceirizada?: (payload: Omit<TerceirizadaRecord, 'id'> & { id?: string }) => Promise<void>;
  onDeleteTerceirizada?: (id: string) => Promise<void>;
  onSaveChanges?: () => Promise<void>;
  hasPendingChanges?: boolean;
  isSavingChanges?: boolean;
}

export default function Conformidade({
  activeTab,
  onTabChange,
  pendingEditRecord = null,
  onPendingEditConsumed,
  currentUser,
  activeContractCode,
  preloadedData,
  lockedContractCode,
  disciplinas = [],
  terceirizadas = [],
  pendingTerceirizadaIds = [],
  onSaveTerceirizada,
  onDeleteTerceirizada,
  onSaveChanges,
  hasPendingChanges = false,
  isSavingChanges = false,
}: ConformidadeProps) {
  const contracts = useMemo(
    () => preloadedData?.registro?.contracts || [],
    [preloadedData?.registro?.contracts],
  );
  const osOptions = useMemo(
    () => preloadedData?.registro?.osOptions || [],
    [preloadedData?.registro?.osOptions],
  );
  const [selectedContract, setSelectedContract] = useState(() =>
    getFilterValue(lockedContractCode || activeContractCode),
  );
  const [selectedOs, setSelectedOs] = useState('');
  const [selectedMonth, setSelectedMonth] = useState('');
  const monthOptions = useMemo(() => getMonthOptions(), []);
  // Registro clicado pra editar (Revisoes daqui, ou Kanban la da Principal): leva pro Preenchimento
  // (mesmo ID, sem duplicar) e volta pra aba de onde veio ao terminar. Vindo da Principal, volta pro Dashboard.
  const [editingRecord, setEditingRecord] = useState<Nc2Record | null>(null);
  const [editingOriginTab, setEditingOriginTab] = useState<'dashboard' | 'revisoes'>('dashboard');

  const openRecordInPreenchimento = (record: Nc2Record, originTab: 'dashboard' | 'revisoes' = 'dashboard') => {
    setEditingRecord(record);
    setEditingOriginTab(originTab);
    onTabChange('preenchimento');
  };

  const finishEditingRecord = () => {
    setEditingRecord(null);
    onTabChange(editingOriginTab);
  };

  // O App segura o registro clicado no Kanban ate esta tela montar; consumido, limpa pra nao repetir.
  useEffect(() => {
    if (!pendingEditRecord) return;
    setEditingRecord(pendingEditRecord);
    setEditingOriginTab('dashboard');
    onPendingEditConsumed?.();
  }, [pendingEditRecord]);

  useEffect(() => {
    setSelectedContract(getFilterValue(lockedContractCode || activeContractCode));
    setSelectedOs('');
  }, [activeContractCode, lockedContractCode]);

  const filteredOsOptions = useMemo(() => {
    if (!selectedContract) return osOptions;
    return osOptions.filter((os) =>
      sameContractCode(getOsContractCode(os), selectedContract),
    );
  }, [osOptions, selectedContract]);

  const selectedContractLabel = useMemo(() => {
    if (!selectedContract) return 'Todos os contratos';
    const contract = contracts.find((item) =>
      sameContractCode(getContractCode(item), selectedContract),
    );
    return contract
      ? displayNameWithCode(getContractName(contract), getContractCode(contract))
      : selectedContract;
  }, [contracts, selectedContract]);

  const selectedOsLabel = useMemo(() => {
    if (!selectedOs) return 'Todas as OS';
    const os = osOptions.find((item) => sameContractCode(getOsCode(item), selectedOs));
    return os ? displayNameWithCode(getOsName(os), getOsCode(os)) : selectedOs;
  }, [osOptions, selectedOs]);

  return (
    <div className="flex w-full flex-col pb-24 font-['Montserrat'] md:pb-28">
      {activeTab === 'dashboard' && (
        <div className="mb-4 flex min-h-[34px] w-full flex-col justify-between gap-1 rounded-xl bg-white/90 px-2 py-1 shadow-[0_10px_30px_-22px_rgba(15,23,42,0.45)] backdrop-blur sm:h-[34px] sm:flex-row sm:items-center sm:py-0">
          <div className="flex flex-1 flex-wrap items-center justify-end gap-1">
            <label className="w-full min-w-[150px] rounded-lg border border-[#E5E7EB] bg-[#F8FAFC] px-2 py-0.5 sm:w-[180px]">
            <span className="block text-[8px] font-extrabold uppercase leading-none tracking-[1px] text-[#94A3B8]">
              Contrato
            </span>
            <SearchableSelect
              value={selectedContract}
              onChange={(event) => {
                setSelectedContract(event.target.value);
                setSelectedOs('');
              }}
              disabled={Boolean(lockedContractCode)}
              title={lockedContractCode ? 'Contrato definido pelo seu acesso' : undefined}
              searchPlaceholder="Pesquisar contrato..."
              aria-label="Filtrar por contrato"
              className="h-5 w-full bg-transparent text-[11px] font-bold text-[#2D2D2D] outline-none disabled:cursor-not-allowed disabled:text-[#94A3B8]"
            >
              <option value="">Todos</option>
              {contracts.map((contract) => {
                const code = getContractCode(contract);
                if (!code) return null;
                return (
                  <option key={code} value={code}>
                    {displayNameWithCode(getContractName(contract), code)}
                  </option>
                );
              })}
            </SearchableSelect>
          </label>

            <label className="w-full min-w-[150px] rounded-lg border border-[#E5E7EB] bg-[#F8FAFC] px-2 py-0.5 sm:w-[150px]">
            <span className="block text-[8px] font-extrabold uppercase leading-none tracking-[1px] text-[#94A3B8]">
              Mês/Ano
            </span>
            <SearchableSelect
              value={selectedMonth}
              onChange={(event) => setSelectedMonth(event.target.value)}
              searchPlaceholder="Pesquisar mês..."
              aria-label="Filtrar por mês/ano"
              className="h-5 w-full bg-transparent text-[11px] font-bold text-[#2D2D2D] outline-none"
            >
              <option value="">Todos</option>
              {monthOptions.map((month) => (
                <option key={month.value} value={month.value}>
                  {month.label}
                </option>
              ))}
            </SearchableSelect>
          </label>

            <label className="w-full min-w-[150px] rounded-lg border border-[#E5E7EB] bg-[#F8FAFC] px-2 py-0.5 sm:w-[190px]">
            <span className="block text-[8px] font-extrabold uppercase leading-none tracking-[1px] text-[#94A3B8]">
              OS
            </span>
            <SearchableSelect
              value={selectedOs}
              onChange={(event) => setSelectedOs(event.target.value)}
              searchPlaceholder="Pesquisar OS..."
              aria-label="Filtrar por OS"
              className="h-5 w-full bg-transparent text-[11px] font-bold text-[#2D2D2D] outline-none"
            >
              <option value="">Todos</option>
              {filteredOsOptions.map((os) => {
                const code = getOsCode(os);
                if (!code) return null;
                return (
                  <option key={code} value={code}>
                    {displayNameWithCode(getOsName(os), code)}
                  </option>
                );
              })}
            </SearchableSelect>
            </label>
          </div>
        </div>
      )}

      <div className="w-full">
        {activeTab === 'dashboard' && (
          <Dashboard
            selectedContract={selectedContract}
            selectedOs={selectedOs}
            selectedMonth={selectedMonth}
            selectedContractLabel={selectedContractLabel}
            selectedOsLabel={selectedOsLabel}
            lockedContractCode={lockedContractCode}
            disciplinas={disciplinas}
          />
        )}
        {activeTab === 'preenchimento' && (
          <Preenchimento
            currentUser={currentUser}
            preloadedData={preloadedData}
            lockedContractCode={lockedContractCode}
            disciplinas={disciplinas}
            terceirizadas={terceirizadas}
            editRecord={editingRecord}
            readOnly={Boolean(editingRecord) && !isNc2ConformidadeUser(currentUser)}
            onFinishEdit={finishEditingRecord}
          />
        )}
        {activeTab === 'revisoes' && (
          <Revisoes
            currentUser={currentUser}
            lockedContractCode={lockedContractCode}
            preloadedData={preloadedData}
            selectedContract={selectedContract}
            selectedOs={selectedOs}
            onEditInPreenchimento={(record) => openRecordInPreenchimento(record, 'revisoes')}
          />
        )}
        {activeTab === 'cronograma' && (
          <Cronograma preloadedData={preloadedData as any} lockedContractCode={lockedContractCode} />
        )}
        {activeTab === 'terceirizadas' && (
          <TerceirizadasCadastro
            terceirizadas={terceirizadas}
            disciplinas={disciplinas}
            pendingIds={pendingTerceirizadaIds}
            onSave={onSaveTerceirizada || (async () => {})}
            onDelete={onDeleteTerceirizada || (async () => {})}
          />
        )}
      </div>
    </div>
  );
}
