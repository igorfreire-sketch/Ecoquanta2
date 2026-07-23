import React, { useMemo } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  LabelList,
  ResponsiveContainer
} from 'recharts';

type Filtros = {
  contrato?: string;
  os?: string;
  disciplina?: string;
};

type DadoOS = {
  os: string;
  osCodigo?: string;
  nomeCompleto?: string;
  contrato?: string;
  contratoCodigo?: string;
  contratoNome?: string;
  [key: string]: any;
};

type DisciplinaMeta = {
  key: string;
  label: string;
  color: string;
};

interface ComposicaoDeProfissionaisPorOSProps {
  dados: DadoOS[];
  disciplinas?: string[];
  filtros?: Filtros;
}

const COLORS = ['#F05D28', '#1E40AF', '#10B981', '#F59E0B', '#8B5CF6', '#3B82F6', '#71717A', '#EF4444', '#14B8A6', '#A855F7'];

function normalizeText(value?: string) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
}

function disciplinaKey(value?: string) {
  return `disc_${normalizeText(value).replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'sem_disciplina'}`;
}

function isAllValue(value?: string) {
  const v = normalizeText(value);
  return (!v || v === 'todos' || v === 'todas as os' || v === 'todos os contratos' || v === 'todas as disciplinas');
}

function getOsLabel(item: DadoOS) {
  return String(item.nomeCompleto || item.os || '').trim();
}

function matchesContract(item: DadoOS, filtro?: string) {
  if (!filtro || isAllValue(filtro)) return true;
  const target = normalizeText(filtro);
  return [item.contratoCodigo, item.contrato, item.contratoNome].some((value) => normalizeText(String(value || '')) === target);
}

function matchesOs(item: DadoOS, filtro?: string) {
  if (!filtro || isAllValue(filtro)) return true;
  const target = normalizeText(filtro);
  return [item.osCodigo, item.os, getOsLabel(item)].some((value) => normalizeText(String(value || '')) === target);
}

function buildDisciplinaMetas(disciplinas: string[] | undefined, dados: DadoOS[]): DisciplinaMeta[] {
  const labels = (disciplinas || []).map((item) => String(item || '').trim()).filter(Boolean);

  if (!labels.length) {
    const keys = new Set<string>();
    dados.forEach((item) => {
      Object.keys(item).forEach((key) => {
        if (key.startsWith('disc_') && Number(item[key] || 0) > 0) keys.add(key);
      });
    });
    return Array.from(keys).map((key, index) => ({
      key,
      label: key.replace(/^disc_/, '').replace(/_/g, ' '),
      color: COLORS[index % COLORS.length]
    }));
  }

  return labels.map((label, index) => ({
    key: disciplinaKey(label),
    label,
    color: COLORS[index % COLORS.length]
  }));
}

export default function ComposicaoDeProfissionaisPorOS({ dados, disciplinas, filtros }: ComposicaoDeProfissionaisPorOSProps) {
  const disciplinaMetas = useMemo(() => buildDisciplinaMetas(disciplinas, dados || []), [disciplinas, dados]);

  const disciplinaMeta = useMemo(() => {
    if (!filtros?.disciplina || isAllValue(filtros.disciplina)) return null;
    const filtro = normalizeText(filtros.disciplina);
    return disciplinaMetas.find((disc) => normalizeText(disc.label) === filtro) || null;
  }, [disciplinaMetas, filtros?.disciplina]);

  const dadosFiltrados = useMemo(() => {
    let resultado = [...(dados || [])];

    resultado = resultado.filter((item) => matchesContract(item, filtros?.contrato));
    resultado = resultado.filter((item) => matchesOs(item, filtros?.os));
    return resultado;
  }, [dados, filtros?.contrato, filtros?.os]);

  const dadosProcessados = useMemo(() => {
    return dadosFiltrados.map((item) => {
      const totalProfissionais = disciplinaMetas.reduce((acc, disciplina) => {
        return acc + (Number(item[disciplina.key]) || 0);
      }, 0);

      const percentuais: Record<string, string> = {};
      disciplinaMetas.forEach((disc) => {
        const valor = Number(item[disc.key]) || 0;
        percentuais[`${disc.key}_pct`] = (valor > 0 && totalProfissionais > 0)
          ? `${Math.round((valor / totalProfissionais) * 100)}%`
          : '';
      });

      return {
        ...item,
        totalProfissionais,
        ...percentuais
      };
    });
  }, [dadosFiltrados, disciplinaMetas]);

  const modoDisciplina = Boolean(disciplinaMeta);

  const totalDisciplinaRecorte = useMemo(() => {
    if (!disciplinaMeta) return 0;
    return dadosProcessados.reduce((acc, item) => acc + (Number(item[disciplinaMeta.key]) || 0), 0);
  }, [dadosProcessados, disciplinaMeta]);

  const chartData = useMemo(() => {
    if (!modoDisciplina || !disciplinaMeta) return dadosProcessados;

    return dadosProcessados.map((item) => {
      const valor = Number(item[disciplinaMeta.key]) || 0;
      const pctStr = (valor > 0 && totalDisciplinaRecorte > 0)
        ? `${Math.round((valor / totalDisciplinaRecorte) * 100)}%`
        : '';

      return {
        ...item,
        valorDisciplina: valor,
        valorDisciplina_pct: pctStr
      };
    });
  }, [dadosProcessados, modoDisciplina, disciplinaMeta, totalDisciplinaRecorte]);

  const minWidthChart = Math.max(760, chartData.length * (modoDisciplina ? 92 : Math.max(152, disciplinaMetas.length * 36)));
  const chartHeight = 320;

  if (!chartData.length || !disciplinaMetas.length) {
    return (
      <div className="flex flex-col min-h-[460px] h-full">
        <div className="flex flex-1 items-center justify-center rounded-xl bg-[#F8FAFC] p-6 text-center text-[13px] font-medium text-[#64748B]">
          Nenhuma composicao encontrada para os filtros selecionados.
        </div>
      </div>
    );
  }

  const FixedCustomLegend = () => (
    <div className="flex flex-wrap items-center justify-end gap-3 mt-4 sm:mt-0">
      {disciplinaMetas.map((disc) => (
        <div key={disc.key} className="flex items-center gap-1.5 text-[11px] font-semibold text-[#757575] uppercase tracking-wide">
          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: disc.color }} />
          {disc.label}
        </div>
      ))}
    </div>
  );

  return (
    <div className="flex flex-col min-h-[360px] h-full">
      <div className="mb-4 border-b-0">
        <div className="flex flex-col gap-3">
          {!modoDisciplina && <FixedCustomLegend />}
        </div>
      </div>

      <div className="flex-1 w-full overflow-x-auto overflow-y-hidden">
        <div style={{ minWidth: `${minWidthChart}px`, height: `${chartHeight}px`, minHeight: `${chartHeight}px` }}>
          <ResponsiveContainer width="100%" height={chartHeight}>
            <BarChart
              data={chartData}
              margin={{ top: 35, right: 24, left: 0, bottom: 20 }}
              barGap={3}
              barCategoryGap="12%"
            >
              <CartesianGrid vertical={false} stroke="#F1F5F9" />

              <XAxis
                dataKey="nomeCompleto"
                tick={{ fill: '#2D2D2D', fontSize: 11, fontWeight: 700 }}
                axisLine={false}
                tickLine={false}
                interval={0}
                minTickGap={24}
              />

              <YAxis
                tick={{ fill: '#757575', fontSize: 11, fontWeight: 500 }}
                axisLine={false}
                tickLine={false}
                domain={[0, 'auto']}
                allowDecimals={false}
              />

              {modoDisciplina && disciplinaMeta ? (
                <Bar
                  dataKey="valorDisciplina"
                  name={disciplinaMeta.label}
                  fill={disciplinaMeta.color}
                  radius={[4, 4, 0, 0]}
                  maxBarSize={55}
                >
                  <LabelList dataKey="valorDisciplina_pct" position="top" fill="#4B5563" fontSize={11} fontWeight="bold" />
                </Bar>
              ) : (
                disciplinaMetas.map((disciplina) => (
                  <Bar
                    key={disciplina.key}
                    dataKey={disciplina.key}
                    name={disciplina.label}
                    fill={disciplina.color}
                    stackId="composicao"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={55}
                  >
                    <LabelList dataKey={`${disciplina.key}_pct`} position="top" fill="#4B5563" fontSize={11} fontWeight="bold" />
                  </Bar>
                ))
              )}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
