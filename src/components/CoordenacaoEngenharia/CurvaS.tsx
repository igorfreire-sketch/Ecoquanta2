import SearchableSelect from '../SearchableSelect';
import React, { useEffect, useMemo, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  ComposedChart, Line, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LabelList
} from 'recharts';
import { 
  TrendingUp, RefreshCw, Download, CheckSquare, Square, Edit3, Save, Calendar as CalendarIcon, X, ChevronDown
} from 'lucide-react';
import html2canvas from 'html2canvas';

import { fetchEapDataFromFirebase, isFirebaseConfigured, upsertFirebaseAppData } from '../../lib/firebaseDb';

// NOVOS TIPOS COMPRIMIDOS
interface CompressedPayload {
  atual: any[][]; // [code, name, progress, duration, pStart, pEnd, idealProg, lDate, mDate]
  dates: string[];
  timeline: Record<string, any[][]>; // osCode: [ [startIdx, endIdx, real, ideal] ]
  reajustado?: any[][];
  registro?: {
    contracts?: Array<{ codigo: string; nome: string }>;
    osOptions?: Array<{ codigo: string; nome: string; contratoCodigo: string }>;
  };
}

interface CurvasProps {
  preloadedData?: CompressedPayload | null;
  onForceRefresh?: () => void;
  isSyncing?: boolean;
  lockedContractCode?: string;
  activeContractCode?: string;
}

function normalizeCurvaMatrixRow(row: any): any[] | null {
  if (Array.isArray(row)) {
    return normalizeKey(row?.[0]) ? row : null;
  }

  const code = normalizeKey(row?.code || row?.codigo || row?.itemCodigo || row?.itemCode);
  if (!code) return null;

  return [
    code,
    normalizeKey(row?.name || row?.nome || row?.itemNome || code),
    row?.progress ?? row?.progresso ?? 0,
    row?.duration ?? row?.duracao ?? 0,
    row?.plannedStart ?? row?.inicioPlanejado ?? row?.start ?? '',
    row?.plannedEnd ?? row?.terminoPlanejado ?? row?.end ?? '',
    row?.idealProgress ?? row?.percentualIdeal ?? row?.baselineIdealProgress ?? 0,
    row?.realStart ?? row?.inicioReal ?? row?.plannedStart ?? row?.inicioPlanejado ?? '',
    row?.realEnd ?? row?.fimReal ?? row?.plannedEnd ?? row?.terminoPlanejado ?? '',
  ];
}

function buildCurvaPayloadFromCronograma(data: any): CompressedPayload | null {
  const cronograma = Array.isArray(data?.cronograma) ? data.cronograma : [];
  const osOptions = Array.isArray(data?.registro?.osOptions) ? data.registro.osOptions : [];
  if (cronograma.length === 0 || osOptions.length === 0) return null;

  const rowsByCode = new Map<string, any[]>();
  cronograma.forEach((row: any) => {
    const normalized = normalizeCurvaMatrixRow(row);
    if (normalized) rowsByCode.set(normalizeKey(normalized[0]), normalized);
  });

  const atual = osOptions
    .map((os: any) => rowsByCode.get(normalizeKey(os?.codigo)))
    .filter((row: any): row is any[] => Array.isArray(row));

  if (atual.length === 0) return null;

  const allowedCodes = new Set(atual.map((row) => normalizeKey(row[0])));
  const timeline = Object.fromEntries(
    Object.entries(data?.timeline && typeof data.timeline === 'object' ? data.timeline : {})
      .filter(([code]) => allowedCodes.has(normalizeKey(code))),
  ) as Record<string, any[][]>;

  return {
    atual,
    dates: Array.isArray(data?.dates) ? data.dates : [],
    timeline,
  };
}

function resolveCurvaPayload(payload: any): CompressedPayload | null {
  const data = payload?.data && typeof payload.data === 'object' ? payload.data : payload;
  if (!data || typeof data !== 'object') return null;
  const dedicated = data.curvaS && typeof data.curvaS === 'object' ? data.curvaS : null;
  const source = Array.isArray(dedicated?.atual) && dedicated.atual.length > 0
    ? dedicated
    : buildCurvaPayloadFromCronograma(data) || data;
  if (!Array.isArray(source.atual) || source.atual.length === 0) return null;

  return {
    ...source,
    reajustado: Array.isArray(data.reajustado) ? data.reajustado : source.reajustado,
    registro: data.registro && typeof data.registro === 'object' ? data.registro : source.registro,
    dates: Array.isArray(source.dates) ? source.dates : [],
    timeline: source.timeline && typeof source.timeline === 'object' ? source.timeline : {},
  } as CompressedPayload;
}

function round2(value: number) { return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100; }
function toNumberSafe(val: any): number {
  if (val === null || val === undefined || val === '') return 0;
  if (typeof val === 'number') return val;
  const num = Number(String(val).trim().replace(/\./g, '').replace(',', '.'));
  return Number.isNaN(num) ? 0 : num;
}
function extractPct(val: any): number {
  const num = toNumberSafe(val);
  return num <= 1 && num > 0 ? round2(num * 100) : round2(num);
}
function parseFlexibleDate(val: any): Date | null {
  if (!val) return null;
  if (typeof val === 'number') return new Date(val);
  if (val instanceof Date) return val;
  const str = String(val).trim();
  const ptMatch = str.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})/);
  if (ptMatch) { const d = new Date(Number(ptMatch[3]), Number(ptMatch[2]) - 1, Number(ptMatch[1])); d.setHours(0, 0, 0, 0); return d; }
  const isoMatch = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (isoMatch) { const d = new Date(Number(isoMatch[1]), Number(isoMatch[2]) - 1, Number(isoMatch[3])); d.setHours(0, 0, 0, 0); return d; }
  return null;
}
function formatDateBR(dateObj: Date | null): string {
  if (!dateObj || Number.isNaN(dateObj.getTime())) return '-';
  return `${String(dateObj.getDate()).padStart(2, '0')}/${String(dateObj.getMonth() + 1).padStart(2, '0')}/${dateObj.getFullYear()}`;
}
function formatDateShortBR(dateObj: Date | null): string {
  if (!dateObj || Number.isNaN(dateObj.getTime())) return '-';
  const d = String(dateObj.getDate()).padStart(2, '0');
  const m = String(dateObj.getMonth() + 1).padStart(2, '0');
  const y = String(dateObj.getFullYear()).slice(-2);
  return `${d}/${m}/${y}`;
}
function formatTickDate(value: any): string {
  return formatDateShortBR(parseFlexibleDate(value));
}
function formatLabel(dateObj: Date | null, viewMode: string): string {
  if (!dateObj || Number.isNaN(dateObj.getTime())) return '-';
  const d = String(dateObj.getDate()).padStart(2, '0');
  const m = String(dateObj.getMonth() + 1).padStart(2, '0');
  const y = String(dateObj.getFullYear());
  return `${d}/${m}/${y}`;
}

function normalizeKey(value: any) {
  return String(value || '').trim();
}

function normalizeSearchText(value: any) {
  const text = normalizeKey(value).toLowerCase();
  return text.normalize ? text.normalize('NFD').replace(/[\u0300-\u036f]/g, '') : text;
}

function isAllContract(value: any) {
  const normalized = normalizeKey(value).toLowerCase();
  return !normalized || normalized === 'todos' || normalized === 'todos os contratos';
}

function isOrderServiceName(value: any) {
  const text = normalizeKey(value);
  if (!text) return false;
  return /^OS(?=$|[\s_\-.0-9A-Za-zÀ-ÿ])/i.test(text);
}

function isLikelyHeaderRow(row: any[]) {
  return normalizeKey(row?.[0]).toLowerCase() === 'os';
}

function getAllOsRows(rawData: CompressedPayload | null) {
  if (!rawData || !Array.isArray(rawData.atual)) return [];
  return rawData.atual.filter((row) => normalizeKey(row?.[0]));
}

function buildSeriesFromTimeline(rawData: CompressedPayload, osCode: string) {
  const series: any[] = [];
  const runs = rawData.timeline?.[osCode] || [];

  runs.forEach(run => {
    const [startIdx, endIdx, realVal, idealVal] = run;
    for (let i = startIdx; i <= endIdx; i++) {
      const dateStr = rawData.dates?.[i];
      const dateObj = parseFlexibleDate(dateStr);
      if (dateObj) {
        series.push({
          dataBase: dateStr,
          dateObj,
          realAcumulado: extractPct(realVal),
          idealAcumulado: extractPct(idealVal)
        });
      }
    }
  });

  return series;
}

function buildSeriesFromReajustado(rawData: CompressedPayload, osCode: string) {
  const rows = Array.isArray(rawData.reajustado) ? rawData.reajustado : [];
  const series: any[] = [];

  rows.forEach((row) => {
    if (!Array.isArray(row) || isLikelyHeaderRow(row)) return;
    if (normalizeKey(row[0]) !== osCode) return;

    const dateObj = parseFlexibleDate(row[1]);
    if (!dateObj) return;

    series.push({
      dataBase: row[1],
      dateObj,
      idealAcumulado: extractPct(row[2]),
      realAcumulado: extractPct(row[3])
    });
  });

  return series.sort((a, b) => a.dateObj.getTime() - b.dateObj.getTime());
}

function buildFallbackSeries(row: any[]) {
  const pS = parseFlexibleDate(row[4]);
  const pE = parseFlexibleDate(row[5]);
  const real = extractPct(row[2]);
  const ideal = extractPct(row[6]);

  const points = [
    { dateObj: pS, realAcumulado: 0, idealAcumulado: 0 },
    { dateObj: pE, realAcumulado: real, idealAcumulado: ideal }
  ];

  return points
    .filter((point) => point.dateObj)
    .map((point) => ({
      ...point,
      dataBase: formatDateBR(point.dateObj)
    }));
}

function InfoCard({ label, value, highlight, extraClass = "", textColorClass = "" }: { label: string; value: string; highlight?: boolean; extraClass?: string; textColorClass?: string }) {
  let finalTextColor = 'text-[#2D2D2D]';
  if (textColorClass) finalTextColor = textColorClass; else if (highlight) finalTextColor = 'text-[#F97316]';
  return (
    <div className={`flex flex-col items-center text-center justify-center min-w-[110px] rounded-2xl border border-[#F7C7B7] bg-white px-4 py-3 shadow-[0_10px_30px_-22px_rgba(15,23,42,0.45)] ${extraClass}`}>
      <p className="text-[10px] font-extrabold uppercase tracking-[0.7px] text-[#94A3B8]">{label}</p>
      <p className={`mt-1 text-[15px] font-black ${finalTextColor}`}>{value}</p>
    </div>
  );
}

function OsPanel({ data, globalConfig, onSaveReajuste }: { data: any, globalConfig: any, onSaveReajuste: (osCode: string, rows: any[][]) => Promise<void>, key?: any }) {
  const chartOnlyRef = useRef<HTMLDivElement>(null);
  const fullPanelRef = useRef<HTMLDivElement>(null);
  const [editMode, setEditMode] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [liveSeries, setLiveSeries] = useState(data.series);

  useEffect(() => { setLiveSeries(data.series); }, [data.series]);

  const chartDataFinal = useMemo(() => {
    let filtered = liveSeries.filter((s: any) => {
      const d = s.dateObj;
      if (!d) return false;
      if (globalConfig.startDate && d < new Date(globalConfig.startDate + 'T00:00:00')) return false;
      if (globalConfig.endDate && d > new Date(globalConfig.endDate + 'T23:59:59')) return false;
      return true;
    });

    let prevReal = 0; let prevIdeal = 0;
    return filtered.map((s: any) => {
      const ritmoReal = Math.max(0, s.realAcumulado - prevReal);
      const ritmoIdeal = Math.max(0, s.idealAcumulado - prevIdeal);
      prevReal = s.realAcumulado; prevIdeal = s.idealAcumulado;
      return { ...s, dateTs: s.dateObj.getTime(), displayName: formatLabel(s.dateObj, globalConfig.viewMode), ritmoReal: round2(ritmoReal), ritmoIdeal: round2(ritmoIdeal) };
    });
  }, [liveSeries, globalConfig]);

  const gap = round2(data.summary.realPct - data.summary.idealPct);

  const downloadJPG = async (ref: React.RefObject<HTMLDivElement>, suffix: string) => {
    if (!ref.current) return;
    try {
      const canvas = await html2canvas(ref.current, { backgroundColor: '#ffffff', scale: 2, useCORS: true, logging: false });
      const url = canvas.toDataURL('image/jpeg', 1.0);
      const link = document.createElement('a'); link.download = `Curvas_OS_${data.osCode}_${suffix}.jpg`; link.href = url;
      document.body.appendChild(link); link.click(); document.body.removeChild(link);
    } catch (err) { alert("Erro ao exportar imagem."); }
  };

  const handlePointEdit = (index: number, key: 'idealAcumulado' | 'realAcumulado', value: string) => {
    const newSeries = [...liveSeries]; newSeries[index][key] = extractPct(value); setLiveSeries(newSeries);
  };

  const saveReajuste = async () => {
    setIsSaving(true);
    try {
      const header = ["OS", "Data Base", "Ideal Acumulado (%)", "Real Acumulado (%)"];
      const rows = liveSeries.map((s: any) => [data.osCode, s.dataBase, s.idealAcumulado, s.realAcumulado]);
      await onSaveReajuste(data.osCode, [header, ...rows]);
      alert("Reajuste salvo no Firebase.");
      setEditMode(false);
    } catch (err) { alert("Erro ao salvar: " + String(err)); } finally { setIsSaving(false); }
  };

  return (
    <div ref={fullPanelRef} className="relative rounded-2xl bg-white p-6 shadow-[0_10px_30px_-22px_rgba(15,23,42,0.45)]">
      <div className="flex items-center justify-between gap-4 mb-6">
        <h3 className="text-xl font-bold text-gray-800 flex items-center gap-3 border-l-4 border-[#3B82F6] pl-4">
          <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded-md text-sm">OS {data.osCode}</span> {data.osName}
        </h3>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setEditMode(!editMode)} className={`h-9 px-4 rounded-xl flex items-center gap-2 text-[11px] font-bold transition-all border ${editMode ? 'bg-red-50 text-red-600 border-red-200' : 'bg-white text-gray-600 border-gray-200 hover:border-blue-500 hover:text-blue-500'}`}>
            {editMode ? <><X size={14}/> FECHAR EDIÇÃO</> : <><Edit3 size={14}/> REAJUSTAR</>}
          </button>
          <button onClick={() => downloadJPG(chartOnlyRef, 'Grafico')} className="h-9 bg-blue-50 text-[#3B82F6] px-4 rounded-xl flex items-center gap-2 text-[11px] font-bold hover:bg-blue-100 transition-colors"><Download size={14} /> BAIXAR GRÁFICO</button>
          <button onClick={() => downloadJPG(fullPanelRef, 'Completo')} className="h-9 bg-[#3B82F6] text-white px-4 rounded-xl flex items-center gap-2 text-[11px] font-bold hover:bg-blue-600 transition-colors"><Download size={14} /> BAIXAR PAINEL</button>
        </div>
      </div>
      <div className="flex flex-wrap gap-3 mb-6">
        <InfoCard label="% Ideal (Col. J)" value={`${data.summary.idealPct}%`} />
        <InfoCard label="% Real (Col. C)" value={`${data.summary.realPct}%`} highlight={true} />
        <InfoCard label="Gap Atual" value={`${gap > 0 ? '+' : ''}${gap}%`} textColorClass={gap < 0 ? 'text-red-500' : 'text-green-500'} extraClass={gap < 0 ? "!border-red-200" : "!border-green-200"} />
        <InfoCard label="Início Plan. (G)" value={data.summary.plannedStart} />
        <InfoCard label="Fim Plan. (H)" value={data.summary.plannedEnd} />
        <InfoCard label="Início Replan. (L)" value={data.summary.lDateString} />
        <InfoCard label="Fim Replan. (M)" value={data.summary.mDateString} />
        <InfoCard label="Início Real" value={data.summary.inicioReal} textColorClass={data.summary.inicioReal === 'Não Iniciado' ? 'text-[#F97316]' : 'text-[#3B82F6]'} />
        <InfoCard label="Fim Real" value={data.summary.fimReal} textColorClass={data.summary.fimReal === 'Não Finalizado' ? 'text-[#F97316]' : 'text-[#2D2D2D]'} />
      </div>
      <div className="flex flex-col xl:flex-row gap-6">
        <div ref={chartOnlyRef} className={`rounded-2xl bg-white border border-[#F3E7E0] shadow-[0_8px_28px_-18px_rgba(15,23,42,0.35)] p-4 flex-1 transition-all ${editMode ? 'xl:w-2/3' : 'w-full'}`}>
          <div className="h-[450px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartDataFinal} margin={{ top: 30, right: 20, left: -20, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F3F4F6"/>
                <XAxis
                  dataKey="dateTs"
                  type="number"
                  scale="time"
                  domain={['dataMin', 'dataMax']}
                  tickFormatter={formatTickDate}
                  tick={{ fontSize: 11, fill: '#6B7280' }}
                  axisLine={false}
                  tickLine={false}
                  angle={45}
                  textAnchor="end"
                  height={88}
                  tickMargin={30}
                  dy={12}
                  minTickGap={10}
                />
                <YAxis tick={{ fontSize: 12, fill: '#6B7280' }} tickFormatter={(v) => `${v}%`} axisLine={false} tickLine={false} />
                <Tooltip labelFormatter={(value) => formatDateBR(parseFlexibleDate(value))} cursor={{ fill: '#F9FAFB' }} contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                <Legend verticalAlign="top" wrapperStyle={{ paddingBottom: '20px', fontSize: '12px', fontWeight: 600 }} iconType="circle"/>
                <Bar dataKey="ritmoIdeal" name="RITMO PLANEJADO" fill="#D1D5DB" barSize={16} radius={[4, 4, 0, 0]} />
                <Bar dataKey="ritmoReal" name="RITMO REALIZADO" fill="#F97316" barSize={16} radius={[4, 4, 0, 0]} />
                <Line type="monotone" dataKey="idealAcumulado" name="IDEAL ACUMULADO" stroke="#9CA3AF" strokeWidth={3} dot={{ r: 4, fill: '#9CA3AF' }} activeDot={{ r: 6 }}>
                  <LabelList dataKey="idealAcumulado" position="top" formatter={(v: any) => `${v}%`} fill="#6B7280" fontSize={11} fontWeight={600} offset={10} />
                </Line>
                <Line type="monotone" dataKey="realAcumulado" name="REAL ACUMULADO" stroke="#3B82F6" strokeWidth={3} dot={{ r: 5, fill: '#3B82F6', strokeWidth: 2, stroke: '#fff' }} activeDot={{ r: 7 }}>
                  <LabelList dataKey="realAcumulado" position="bottom" formatter={(v: any) => `${v}%`} fill="#2563EB" fontSize={12} fontWeight="bold" offset={10} />
                </Line>
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
        {editMode && (
          <div className="xl:w-1/3 bg-[#F8FAFC] rounded-2xl p-5 flex flex-col h-[482px]">
            <h4 className="font-bold text-gray-800 mb-1 flex items-center gap-2"><Edit3 size={18} className="text-[#3B82F6]"/> Ajuste em Tempo Real</h4>
            <div className="flex-1 overflow-y-auto pr-2 space-y-3 custom-scrollbar">
              {liveSeries.map((pt: any, idx: number) => (
                <div key={idx} className="p-3">
                  <p className="text-[13px] font-bold text-gray-700 mb-2 flex items-center gap-2"><CalendarIcon size={14} className="text-gray-400"/> {pt.dataBase}</p>
                  <div className="flex gap-3">
                    <div className="flex-1">
                      <label className="text-[10px] font-bold text-gray-400 uppercase">Ideal (%)</label>
                      <input type="number" step="0.1" value={pt.idealAcumulado} onChange={(e) => handlePointEdit(idx, 'idealAcumulado', e.target.value)} className="w-full h-8 border rounded-lg px-2 text-[13px] outline-none focus:border-[#3B82F6]" />
                    </div>
                    <div className="flex-1">
                      <label className="text-[10px] font-bold text-[#F97316] uppercase">Real (%)</label>
                      <input type="number" step="0.1" value={pt.realAcumulado} onChange={(e) => handlePointEdit(idx, 'realAcumulado', e.target.value)} className="w-full h-8 border rounded-lg px-2 text-[13px] outline-none focus:border-[#F97316]" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <button onClick={saveReajuste} disabled={isSaving} className="mt-4 w-full bg-[#10B981] text-white font-bold h-11 rounded-xl flex items-center justify-center gap-2 hover:bg-[#059669]">
              {isSaving ? <RefreshCw size={18} className="animate-spin"/> : <Save size={18} />} SALVAR
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function Curvas({ preloadedData, onForceRefresh, isSyncing, lockedContractCode, activeContractCode }: CurvasProps) {
  const [loading, setLoading] = useState(false);
  const [localIsSyncing, setLocalIsSyncing] = useState(false);
  const [error, setError] = useState('');
  
  // Utiliza os dados desempacotados do preloadedData ou do state local se acessado diretamente
  const [rawData, setRawData] = useState<CompressedPayload | null>(null);

  const [selectedContract, setSelectedContract] = useState('TODOS');
  const [selectedOsList, setSelectedOsList] = useState<string[]>([]);
  const [osExpanded, setOsExpanded] = useState(false);
  const [osSearch, setOsSearch] = useState('');
  const [viewMode, setViewMode] = useState('mensal');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const osDropdownRef = useRef<HTMLDivElement>(null);
  // Painel da lista de OS vai por portal pro body (senao abre atras do rail); ref separado pra o
  // clique-fora nao fechar quando o clique e dentro do painel portado.
  const osPanelRef = useRef<HTMLDivElement>(null);

  // Cache local e so otimizacao (F5 instantaneo); a fonte real e o Firebase. O payload da EAP
  // pode passar do limite (~5MB) do localStorage — quando passa, ignora o cache em vez de crashar.
  const salvarCacheCurvas = (data: unknown) => {
    try {
      localStorage.setItem('curvasAppData', JSON.stringify(data));
    } catch {
      try { localStorage.removeItem('curvasAppData'); } catch {}
    }
  };

  // 1. CARREGAMENTO AUTÔNOMO (Caso entre direto na aba ou dê F5)
  const fetchCurvasData = async (forceRefresh = false) => {
    setError('');
    const localDataStr = localStorage.getItem('curvasAppData');
    let cachedData: CompressedPayload | null = null;
    if (localDataStr) {
      try {
        cachedData = resolveCurvaPayload(JSON.parse(localDataStr));
      } catch (error) {}
    }
    const hasValidPreloadedData = Boolean(resolveCurvaPayload(preloadedData));

    if (forceRefresh) {
      setLoading(true);
    } else {
      if (cachedData && !hasValidPreloadedData) {
        setRawData(cachedData);
        setLocalIsSyncing(true);
      } else if (!hasValidPreloadedData) {
        setLoading(true);
      }
    }

    try {
      let nextData: CompressedPayload | null = null;

      nextData = resolveCurvaPayload(await fetchEapDataFromFirebase());
      if (!nextData) throw new Error('Nenhum dado publicado encontrado para a Curva S.');

      if (nextData) {
        salvarCacheCurvas(nextData);
        setRawData(nextData);
        if (forceRefresh) {
          setSelectedContract('TODOS');
          setSelectedOsList([]);
        }
      } else {
        throw new Error('Nenhum dado publicado encontrado para a Curva S.');
      }
    } catch (err) { setError(err instanceof Error ? err.message : 'Falha ao carregar dados da Curva S.'); } 
    finally { setLoading(false); setLocalIsSyncing(false); }
  };

  useEffect(() => {
    // Se o App principal passou a prop preloadedData, usamos ela! 
    const resolvedPreloadedData = resolveCurvaPayload(preloadedData);
    if (resolvedPreloadedData) {
      setError('');
      setRawData(resolvedPreloadedData);
    } else {
      // Caso contrário (rodando sozinho), faz o fetch local
      void fetchCurvasData();
    }
  }, [preloadedData]);

  const activeSyncState = isSyncing || localIsSyncing;

  const saveReajusteToFirebase = async (osCode: string, rows: any[][]) => {
    if (!rawData) throw new Error('Dados da Curva S nao carregados.');
    if (!isFirebaseConfigured()) throw new Error('Salvar reajuste requer Firebase configurado.');
    const header = rows[0] || ["OS", "Data Base", "Ideal Acumulado (%)", "Real Acumulado (%)"];
    const body = rows.slice(1);
    const previousRows = Array.isArray(rawData.reajustado) ? rawData.reajustado : [];
    const preservedRows = previousRows.filter((row) => {
      const code = normalizeKey(row?.[0]);
      return code && code !== 'OS' && code !== normalizeKey(osCode);
    });
    const nextReajustado = [header, ...preservedRows, ...body];
    const nextData = {
      ...rawData,
      reajustado: nextReajustado,
    };
    await upsertFirebaseAppData('curvaSReajustado', {
      reajustado: nextReajustado,
      latestEapPublishedAt: new Date().toISOString(),
    });
    setRawData(nextData);
    salvarCacheCurvas(nextData);
  };

  // 2. DESCOMPACTAÇÃO RÁPIDA DA MATRIZ (Lógica do React RLE)
  const hierarchy = useMemo(() => {
    if (!rawData || !rawData.atual) return [];
    const registroContracts = Array.isArray(rawData.registro?.contracts) ? rawData.registro.contracts : [];
    const registroOsOptions = Array.isArray(rawData.registro?.osOptions) ? rawData.registro.osOptions : [];

    if (registroContracts.length > 0 && registroOsOptions.length > 0) {
      return registroContracts.map((contract) => ({
        code: normalizeKey(contract.codigo),
        name: normalizeKey(contract.nome || contract.codigo),
        osList: registroOsOptions
          .filter((os) => normalizeKey(os.contratoCodigo) === normalizeKey(contract.codigo))
          .filter((os) => isOrderServiceName(os.nome || os.codigo))
          .map((os) => ({ code: normalizeKey(os.codigo), name: normalizeKey(os.nome || os.codigo) }))
      })).filter((contract) => contract.osList.length > 0);
    }

    const contratosMap = new Map<string, { nome: string; osList: { code: string; name: string }[] }>();
    const rows = getAllOsRows(rawData);
    const hasHierarchicalCodes = rows.some((r) => (normalizeKey(r[0]).match(/\./g) || []).length > 0);

    if (!hasHierarchicalCodes) {
      contratosMap.set('EAP', {
        nome: 'EAP Unificada',
        osList: rows
          .filter((r) => isOrderServiceName(r[1] || r[0]))
          .map((r) => ({ code: normalizeKey(r[0]), name: normalizeKey(r[1] || r[0]) }))
      });
      return Array.from(contratosMap.entries()).map(([code, val]) => ({ code, name: val.nome, osList: val.osList }));
    }
    
    rows.forEach((r) => { 
      const code = normalizeKey(r[0]);
      const name = normalizeKey(r[1] || r[0]);
      if ((code.match(/\./g) || []).length === 0) contratosMap.set(code, { nome: name, osList: [] }); 
    });
    
    rows.forEach((r) => {
      const code = normalizeKey(r[0]);
      const name = normalizeKey(r[1] || r[0]);
      if ((code.match(/\./g) || []).length === 1 && isOrderServiceName(name)) {
        const root = code.split('.')[0];
        if (contratosMap.has(root)) contratosMap.get(root)!.osList.push({ code, name });
      }
    });
    return Array.from(contratosMap.entries()).map(([code, val]) => ({ code, name: val.nome, osList: val.osList }));
  }, [rawData]);

  const activeOsOptions = useMemo(() => {
    if (selectedContract === 'TODOS') return hierarchy.flatMap(c => c.osList);
    return hierarchy.find(c => c.code === selectedContract)?.osList || [];
  }, [selectedContract, hierarchy]);

  const filteredOsOptions = useMemo(() => {
    const search = normalizeSearchText(osSearch);
    if (!search) return activeOsOptions;
    return activeOsOptions.filter((os) => normalizeSearchText(`${os.code} ${os.name}`).includes(search));
  }, [activeOsOptions, osSearch]);

  const allFilteredOsSelected = filteredOsOptions.length > 0 && filteredOsOptions.every((os) => selectedOsList.includes(os.code));

  // A tela abre com todas as OS do contrato marcadas. Re-marca ao trocar de contrato
  // (a chave muda), mas nao desfaz o que o usuario escolher depois.
  const osInicializadasRef = useRef('');
  useEffect(() => {
    if (activeOsOptions.length === 0) return;
    const chave = `${selectedContract}:${activeOsOptions.length}`;
    if (osInicializadasRef.current === chave) return;
    osInicializadasRef.current = chave;
    setSelectedOsList(activeOsOptions.map((os) => os.code));
  }, [activeOsOptions, selectedContract]);

  const todasSelecionadas = activeOsOptions.length > 0 && selectedOsList.length === activeOsOptions.length;

  // Estando em "todas", clicar numa OS troca a selecao por ela (o "TODAS" sai sozinho)
  // em vez de tirar so uma da lista inteira.
  const selecionarOs = (code: string) => {
    setSelectedOsList((previous) => {
      if (todasSelecionadas) return [code];
      return previous.includes(code) ? previous.filter((item) => item !== code) : [...previous, code];
    });
  };

  const toggleFilteredOs = () => {
    const visibleCodes = filteredOsOptions.map((os) => os.code);
    if (allFilteredOsSelected) {
      setSelectedOsList((previous) => previous.filter((code) => !visibleCodes.includes(code)));
      return;
    }
    setSelectedOsList((previous) => Array.from(new Set([...previous, ...visibleCodes])));
  };

  const effectiveContractCode = isAllContract(activeContractCode) && !lockedContractCode
    ? ''
    : normalizeKey(lockedContractCode || activeContractCode || '');

  useEffect(() => {
    if (!effectiveContractCode) return;
    setSelectedContract(effectiveContractCode);
    setSelectedOsList([]);
    setOsExpanded(false);
    setOsSearch('');
  }, [effectiveContractCode]);

  useEffect(() => {
    if (!osExpanded) return;

    const handleOutsideClick = (event: MouseEvent) => {
      const alvo = event.target as Node;
      if (!osDropdownRef.current?.contains(alvo) && !osPanelRef.current?.contains(alvo)) {
        setOsExpanded(false);
        setOsSearch('');
      }
    };

    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [osExpanded]);

  const chartsData = useMemo(() => {
    if (!rawData || !rawData.atual || selectedOsList.length === 0) return [];
    const today = new Date(); today.setHours(0, 0, 0, 0);

    return selectedOsList.map(osCode => {
      // Busca a linha matriz da OS: [code, name, progress, duration, pStart, pEnd, idealProg, lDate, mDate]
      const row = rawData.atual.find(r => normalizeKey(r[0]) === osCode);
      if (!row) return null;

      const pS = parseFlexibleDate(row[4]); 
      const pE = parseFlexibleDate(row[5]); 
      const lD = parseFlexibleDate(row[7]); 
      const mD = parseFlexibleDate(row[8]);

      const inicioReal = (lD && lD <= today) ? formatDateBR(lD) : "Não Iniciado";
      const fimReal = (mD && mD <= today) ? formatDateBR(mD) : "Não Finalizado";

      // DESCOMPACTAÇÃO DA TIMELINE (Lógica RLE)
      let series: any[] = buildSeriesFromReajustado(rawData, osCode);
      const runs = series.length > 0 ? [] : (rawData.timeline[osCode] || []);
      
      runs.forEach(run => {
        const [startIdx, endIdx, realVal, idealVal] = run;
        for (let i = startIdx; i <= endIdx; i++) {
          const dateStr = rawData.dates[i];
          const dateObj = parseFlexibleDate(dateStr);
          if (dateObj) {
            series.push({
              dataBase: dateStr,
              dateObj: dateObj,
              realAcumulado: extractPct(realVal),
              idealAcumulado: extractPct(idealVal)
            });
          }
        }
      });
      if (series.length === 0) series = buildFallbackSeries(row);
      series.sort((a, b) => a.dateObj.getTime() - b.dateObj.getTime());

      return {
        osCode, osName: row[1],
        summary: { idealPct: extractPct(row[6]), realPct: extractPct(row[2]), plannedStart: formatDateBR(pS), plannedEnd: formatDateBR(pE), lDateString: formatDateBR(lD), mDateString: formatDateBR(mD), inicioReal, fimReal },
        series
      };
    }).filter(Boolean);
  }, [rawData, selectedOsList]);

  // Se o App.tsx não providenciou o preloadedData e está carregando nativamente...
  if (loading && !rawData) {
    return (
      <div className="w-full flex flex-col items-center justify-center py-24 space-y-4">
        <RefreshCw size={32} className="animate-spin text-[#3B82F6]" />
        <p className="text-gray-500 font-medium">Buscando dados comprimidos da Curva S...</p>
      </div>
    );
  }

  return (
    <div className="w-full space-y-6 animate-in fade-in duration-500 max-w-[1600px] mx-auto pb-20">
      {error && <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-xl text-sm font-medium">{error}</div>}

      <div className="rounded-2xl bg-white p-6 shadow-[0_10px_30px_-22px_rgba(15,23,42,0.45)]">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-bold text-gray-500 uppercase">Contrato</label>
            <SearchableSelect value={selectedContract} disabled={Boolean(normalizeKey(lockedContractCode || ''))} onChange={(e) => { setSelectedContract(e.target.value); setSelectedOsList([]); setOsExpanded(false); setOsSearch(''); }} className="w-full h-11 px-3 bg-gray-50 border rounded-xl text-[14px] disabled:opacity-70">
              {!effectiveContractCode && <option value="TODOS">Todos</option>}
              {hierarchy.map(c => <option key={c.code} value={c.code}>{c.code} - {c.name}</option>)}
            </SearchableSelect>
          </div>
          <div ref={osDropdownRef} className="flex flex-col gap-1.5 relative">
            <label className="text-[11px] font-bold text-gray-500 uppercase">Ordem de Serviço</label>
            <div className="relative">
              <input
                type="text"
                value={osSearch}
                onFocus={() => setOsExpanded(true)}
                onChange={(event) => { setOsSearch(event.target.value); setOsExpanded(true); }}
                placeholder={selectedOsList.length === 0
                  ? 'Selecione...'
                  : selectedOsList.length === activeOsOptions.length
                    ? 'Todas as OS selecionadas'
                    : `${selectedOsList.length} OS selecionada(s)`}
                className="w-full h-11 pl-3 pr-10 bg-gray-50 border rounded-xl text-[14px] text-gray-700 placeholder:text-gray-400"
                role="combobox"
                aria-controls="curva-s-os-options"
                aria-autocomplete="list"
                aria-expanded={osExpanded}
              />
              <button
                type="button"
                onClick={() => setOsExpanded((value) => !value)}
                className="absolute inset-y-0 right-0 px-3 flex items-center text-gray-500"
                aria-label={osExpanded ? 'Fechar lista de OS' : 'Abrir lista de OS'}
              >
                <ChevronDown size={16} className={`transition-transform ${osExpanded ? 'rotate-180' : ''}`} />
              </button>
            </div>
            {osExpanded && (() => {
              // Portal pro body: o <main> (relative z-10) prendia este dropdown, que abria atras
              // do rail (z-40). No body, ancorado ao campo, fica por cima de tudo.
              const r = osDropdownRef.current?.getBoundingClientRect();
              return createPortal(
              <div
                ref={osPanelRef}
                id="curva-s-os-options"
                className="fixed z-[300] mt-1 rounded-xl p-2 bg-white shadow-xl custom-scrollbar max-h-[360px] overflow-y-auto"
                style={r ? { left: r.left, top: r.bottom + 4, width: r.width } : undefined}
              >
                {activeOsOptions.length === 0 ? <p className="text-[12px] text-gray-400 p-2 text-center">Aguardando contrato...</p> : filteredOsOptions.length === 0 ? (
                  <p className="text-[12px] text-gray-400 p-2 text-center">Nenhuma OS encontrada.</p>
                ) : (
                  <>
                    <button type="button" onClick={toggleFilteredOs} className="flex items-center gap-2 text-[12px] font-bold text-[#3B82F6] p-2 hover:bg-blue-100 w-full rounded">
                      {allFilteredOsSelected ? <CheckSquare size={16}/> : <Square size={16}/>} {osSearch ? 'TODAS VISIVEIS' : 'TODAS'}
                    </button>
                    {filteredOsOptions.map(os => (
                      <button type="button" key={os.code} onClick={() => selecionarOs(os.code)} className="flex items-center gap-2 text-[12px] text-gray-700 p-2 hover:bg-gray-100 w-full rounded text-left">
                        {selectedOsList.includes(os.code) ? <CheckSquare size={16} className="text-[#3B82F6]"/> : <Square size={16} className="text-gray-400"/>} {os.name}
                      </button>
                    ))}
                  </>
                )}
              </div>,
              document.body,
              );
            })()}
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-bold text-gray-500 uppercase">Eixo X</label>
            <SearchableSelect value={viewMode} onChange={(e) => setViewMode(e.target.value)} className="w-full h-11 px-3 bg-gray-50 border rounded-xl text-[14px]">
              <option value="mensal">Mensal (MM/YY)</option><option value="semanal">Semanal (DD/MM)</option>
            </SearchableSelect>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-bold text-gray-500 uppercase flex items-center gap-1"><CalendarIcon size={12}/> Início</label>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-full h-11 px-3 bg-gray-50 border rounded-xl text-[14px]" />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-bold text-gray-500 uppercase flex items-center gap-1"><CalendarIcon size={12}/> Fim</label>
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-full h-11 px-3 bg-gray-50 border rounded-xl text-[14px]" />
          </div>
        </div>
      </div>

      {chartsData.length === 0 ? (
        <div className="rounded-2xl p-16 text-center bg-[#F8FAFC]">
          <p className="text-[16px] font-semibold text-gray-600">Nenhuma OS selecionada.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {chartsData.map((data: any) => (
            <OsPanel key={data.osCode} data={data} globalConfig={{ viewMode, startDate, endDate }} onSaveReajuste={saveReajusteToFirebase} />
          ))}
        </div>
      )}
      
      <style>{`.custom-scrollbar::-webkit-scrollbar { width: 6px; } .custom-scrollbar::-webkit-scrollbar-thumb { background-color: #CBD5E1; border-radius: 10px; }`}</style>
    </div>
  );
}
