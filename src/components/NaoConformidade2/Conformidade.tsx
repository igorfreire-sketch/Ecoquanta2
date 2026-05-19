import React, { useEffect, useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ChevronRight, Save } from 'lucide-react';
import Preenchimento from './Preenchimento';
import Revisoes from './Revisoes';
import TerceirizadasCadastro from '../TerceirizadasCadastro';
import Cronograma from '../Cronograma';
import { getDemoRecords, getRecords, type Nc2Record } from './ncStore';
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
  contrato?: string;
  contractId?: string;
};

const getContractCode = (contract: RegistroContract) =>
  String(contract.code || contract.codigo || contract.id || '').trim();

const getContractName = (contract: RegistroContract) =>
  String(contract.name || contract.nome || getContractCode(contract)).trim();

const getOsCode = (os: RegistroOs) =>
  String(os.code || os.codigo || os.id || '').trim();

const getOsName = (os: RegistroOs) =>
  String(os.name || os.nome || getOsCode(os)).trim();

const getOsContractCode = (os: RegistroOs) =>
  String(os.contractCode || os.contrato || os.contractId || '').trim();

const ITEM_GROUP_LABELS: Record<string, string> = {
  relatorio: 'Relatorio',
  carimbo: 'Carimbo',
  desenho: 'Desenho',
  faltaarquivo: 'Falta de Arquivos',
};

function normalizeText(value?: string) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function getRecordOrigin(record: Nc2Record) {
  return normalizeText(record.origemAtividade) === 'terceirizado' ? 'Terceirizado' : 'Interno';
}

function getItemGroupLabel(item: { itemKey?: string; itemLabel?: string }) {
  const key = normalizeText(item.itemKey);
  if (ITEM_GROUP_LABELS[key]) return ITEM_GROUP_LABELS[key];

  const label = normalizeText(item.itemLabel);
  if (ITEM_GROUP_LABELS[label]) return ITEM_GROUP_LABELS[label];

  if (label.includes('falta')) return 'Falta de Arquivos';
  if (label.includes('relatorio')) return 'Relatorio';
  if (label.includes('carimbo')) return 'Carimbo';
  if (label.includes('desenho')) return 'Desenho';
  return String(item.itemLabel || item.itemKey || 'Outros').trim() || 'Outros';
}

function buildDashboardMetrics(records: Nc2Record[], disciplinasBase: string[]) {
  const disciplineMap = new Map<string, { name: string; Interno: number; Terceirizado: number }>();
  const groupMap = new Map<string, { name: string; Interno: number; Terceirizado: number }>();

  disciplinasBase.forEach((disciplina) => {
    const name = String(disciplina || '').trim();
    if (!name) return;
    disciplineMap.set(normalizeText(name), { name, Interno: 0, Terceirizado: 0 });
  });

  ['Relatorio', 'Carimbo', 'Desenho', 'Falta de Arquivos'].forEach((name) => {
    groupMap.set(normalizeText(name), { name, Interno: 0, Terceirizado: 0 });
  });

  let perfectFiles = 0;
  let internalNcFiles = 0;
  let thirdPartyNcFiles = 0;

  records.forEach((record) => {
    const origin = getRecordOrigin(record);
    const disciplinaName = String(record.disciplina || 'Sem disciplina').trim() || 'Sem disciplina';
    const disciplinaKey = normalizeText(disciplinaName);
    if (!disciplineMap.has(disciplinaKey)) {
      disciplineMap.set(disciplinaKey, { name: disciplinaName, Interno: 0, Terceirizado: 0 });
    }

    const itens = Array.isArray(record.itens) ? record.itens : [];
    const totalNc = itens.reduce((sum, item) => sum + Number(item.quantidadeT || 0), 0);
    const totalPerfect = itens.reduce((sum, item) => sum + Number(item.quantidadeC || 0), 0);

    disciplineMap.get(disciplinaKey)![origin] += totalNc;
    perfectFiles += totalPerfect;
    if (origin === 'Terceirizado') thirdPartyNcFiles += totalNc;
    else internalNcFiles += totalNc;

    itens.forEach((item) => {
      const groupName = getItemGroupLabel(item);
      const groupKey = normalizeText(groupName);
      if (!groupMap.has(groupKey)) {
        groupMap.set(groupKey, { name: groupName, Interno: 0, Terceirizado: 0 });
      }
      groupMap.get(groupKey)![origin] += Number(item.quantidadeT || 0);
    });
  });

  const disciplinesData = Array.from(disciplineMap.values())
    .filter((item) => item.Interno > 0 || item.Terceirizado > 0)
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));

  const groupsData = ['Relatorio', 'Carimbo', 'Desenho', 'Falta de Arquivos']
    .map((name) => groupMap.get(normalizeText(name)) || { name, Interno: 0, Terceirizado: 0 });

  const totalAnalyzedData = [
    { name: 'Interno', value: internalNcFiles, color: '#64748B' },
    { name: 'Terceirizado', value: thirdPartyNcFiles, color: '#F05D28' },
    { name: 'Arquivos perfeitos', value: perfectFiles, color: '#10B981' },
  ].filter((item) => item.value > 0);

  return {
    disciplinesData,
    groupsData,
    totalAnalyzedData,
    totalFiles: internalNcFiles + thirdPartyNcFiles + perfectFiles,
  };
}

function Dashboard({
  preloadedData,
  lockedContractCode,
  disciplinas = [],
}: {
  preloadedData?: {
    registro?: {
      contracts?: RegistroContract[];
      osOptions?: RegistroOs[];
    };
  };
  lockedContractCode?: string;
  disciplinas?: string[];
}) {
  const [activeMonth, setActiveMonth] = useState('SETEMBRO');
  const [selectedContract, setSelectedContract] = useState(lockedContractCode || '');
  const [selectedOs, setSelectedOs] = useState('');
  const [records, setRecords] = useState<Nc2Record[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');

  const contracts = useMemo(
    () => preloadedData?.registro?.contracts || [],
    [preloadedData?.registro?.contracts]
  );
  const osOptions = useMemo(
    () => preloadedData?.registro?.osOptions || [],
    [preloadedData?.registro?.osOptions]
  );

  useEffect(() => {
    if (lockedContractCode) {
      setSelectedContract(lockedContractCode);
      setSelectedOs('');
    }
  }, [lockedContractCode]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      try {
        const next = await getRecords();
        if (!cancelled) {
          setRecords(next);
          setErrorMessage('');
        }
      } catch (error) {
        if (!cancelled) {
          setRecords(getDemoRecords());
          setErrorMessage('Firebase recusou acesso aos dados reais. Mostrando 5 registros de demonstracao.');
        }
        console.error('Erro ao carregar registros de conformidade:', error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => { cancelled = true; };
  }, []);

  const filteredOsOptions = useMemo(() => {
    if (!selectedContract) return osOptions;
    return osOptions.filter((os) => getOsContractCode(os) === selectedContract);
  }, [osOptions, selectedContract]);

  const filteredRecords = useMemo(() => {
    return records.filter((record) => {
      const matchesContract = !selectedContract || record.contratoCodigo === selectedContract;
      const matchesOs = !selectedOs || selectedOs === 'Todas' || record.osCodigo === selectedOs;
      return matchesContract && matchesOs;
    });
  }, [records, selectedContract, selectedOs]);

  const { disciplinesData, groupsData, totalAnalyzedData, totalFiles } = useMemo(
    () => buildDashboardMetrics(filteredRecords, disciplinas),
    [filteredRecords, disciplinas],
  );

  return (
    <div className="flex flex-col md:flex-row gap-6 w-full animate-in fade-in duration-500">
      <aside className="w-full md:w-64 flex flex-col gap-6 shrink-0">
        <div className="bg-white border border-[#E5E7EB] rounded-xl py-2 shadow-sm">
          {['SETEMBRO', 'OUTUBRO'].map((month) => (
            <button
              key={month}
              onClick={() => setActiveMonth(month)}
              className={`w-full text-left px-6 py-3 text-[14px] transition-all ${
                activeMonth === month
                  ? 'border-l-4 border-[#F05D28] text-[#F05D28] font-bold bg-[#F05D28]/5'
                  : 'text-[#757575] font-medium hover:bg-[#F9FAFB]'
              }`}
            >
              {month}
            </button>
          ))}
        </div>

        <div className="bg-white border border-[#E5E7EB] rounded-xl p-5 shadow-sm">
          <label className="block text-[11px] font-bold text-[#757575] uppercase tracking-[1px] mb-3">FILTRAR POR CONTRATO</label>
          <div className="relative mb-4">
            <select
              value={selectedContract}
              onChange={(event) => {
                setSelectedContract(event.target.value);
                setSelectedOs('');
              }}
              disabled={Boolean(lockedContractCode)}
              className="w-full h-11 px-4 bg-white border border-[#E5E7EB] rounded-xl text-[14px] font-medium text-[#2D2D2D] appearance-none focus:border-[#F05D28] focus:ring-2 focus:ring-[#F05D28]/20 outline-none transition-all cursor-pointer disabled:bg-[#F8FAFC] disabled:text-[#94A3B8]"
            >
              <option value="">Todos</option>
              {contracts.map((contract) => {
                const code = getContractCode(contract);
                return (
                  <option key={code} value={code}>
                    {code} - {getContractName(contract)}
                  </option>
                );
              })}
            </select>
            <ChevronRight size={18} className="absolute right-4 top-1/2 -translate-y-1/2 text-[#757575] pointer-events-none rotate-90" />
          </div>

          <label className="block text-[11px] font-bold text-[#757575] uppercase tracking-[1px] mb-3">FILTRAR POR OS</label>
          <div className="relative">
            <select
              value={selectedOs}
              onChange={(event) => setSelectedOs(event.target.value)}
              className="w-full h-11 px-4 bg-white border border-[#E5E7EB] rounded-xl text-[14px] font-medium text-[#2D2D2D] appearance-none focus:border-[#F05D28] focus:ring-2 focus:ring-[#F05D28]/20 outline-none transition-all cursor-pointer"
            >
              <option>Todas</option>
              {filteredOsOptions.map((os) => {
                const code = getOsCode(os);
                return (
                  <option key={code} value={code}>
                    {code} - {getOsName(os)}
                  </option>
                );
              })}
            </select>
            <ChevronRight size={18} className="absolute right-4 top-1/2 -translate-y-1/2 text-[#757575] pointer-events-none rotate-90" />
          </div>
        </div>
      </aside>

      <div className="flex-1 flex flex-col gap-6">
        {errorMessage && (
          <div className="rounded-xl border border-[#FECACA] bg-[#FEF2F2] px-4 py-3 text-[13px] font-medium text-[#B91C1C]">
            {errorMessage}
          </div>
        )}

        <div className="bg-white border border-[#E5E7EB] rounded-xl p-6 shadow-sm">
          <h3 className="text-[16px] font-bold text-[#2D2D2D] text-center mb-8">Nao Conformidades por disciplinas</h3>
          <div className="h-[350px] w-full">
            {loading ? (
              <div className="h-full flex items-center justify-center text-[13px] text-[#757575]">Carregando registros...</div>
            ) : disciplinesData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-[13px] text-[#757575]">Nenhuma nao conformidade encontrada para esse filtro.</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={disciplinesData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#757575', fontSize: 11 }} dy={10} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: '#757575', fontSize: 11 }} />
                  <Tooltip cursor={{ fill: '#F8F9FA' }} contentStyle={{ borderRadius: '12px', border: '1px solid #E5E7EB' }} />
                  <Legend verticalAlign="top" align="center" iconType="circle" wrapperStyle={{ paddingBottom: '30px', fontSize: '12px' }} />
                  <Bar dataKey="Interno" fill="#64748B" radius={[4, 4, 0, 0]} barSize={40} />
                  <Bar dataKey="Terceirizado" fill="#F05D28" radius={[4, 4, 0, 0]} barSize={40} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white border border-[#E5E7EB] rounded-xl p-6 shadow-sm">
            <h3 className="text-[16px] font-bold text-[#2D2D2D] text-center mb-8">Grupos de Nao Conformidades</h3>
            <div className="h-[300px] w-full">
              {loading ? (
                <div className="h-full flex items-center justify-center text-[13px] text-[#757575]">Carregando registros...</div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={groupsData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#757575', fontSize: 11 }} dy={10} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fill: '#757575', fontSize: 11 }} />
                    <Tooltip cursor={{ fill: '#F8F9FA' }} contentStyle={{ borderRadius: '12px', border: '1px solid #E5E7EB' }} />
                    <Legend verticalAlign="top" align="center" iconType="circle" wrapperStyle={{ paddingBottom: '20px', fontSize: '11px' }} />
                    <Bar dataKey="Interno" fill="#64748B" radius={[4, 4, 0, 0]} barSize={25} />
                    <Bar dataKey="Terceirizado" fill="#F05D28" radius={[4, 4, 0, 0]} barSize={25} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          <div className="bg-white border border-[#E5E7EB] rounded-xl p-6 shadow-sm flex flex-col items-center">
            <h3 className="text-[16px] font-bold text-[#2D2D2D] text-center mb-4">Arquivos Totais Analisados</h3>
            <div className="flex flex-wrap justify-center gap-4 mb-4">
              {totalAnalyzedData.map((entry) => (
                <div key={entry.name} className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
                  <span className="text-[11px] font-medium text-[#757575]">{entry.name}</span>
                </div>
              ))}
            </div>
            <div className="h-[250px] w-full relative">
              {loading ? (
                <div className="h-full flex items-center justify-center text-[13px] text-[#757575]">Carregando registros...</div>
              ) : totalAnalyzedData.length === 0 ? (
                <div className="h-full flex items-center justify-center text-[13px] text-[#757575]">Nenhum arquivo analisado para esse filtro.</div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={totalAnalyzedData} cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value">
                      {totalAnalyzedData.map((entry) => (
                        <Cell key={entry.name} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ borderRadius: '12px', border: '1px solid #E5E7EB' }} />
                  </PieChart>
                </ResponsiveContainer>
              )}
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-[24px] font-bold text-[#2D2D2D]">{totalFiles}</span>
                <span className="text-[10px] font-medium text-[#757575] uppercase tracking-wider">Total</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

interface ConformidadeProps {
  activeTab: 'dashboard' | 'preenchimento' | 'revisoes' | 'terceirizadas' | 'cronograma';
  onTabChange: (tab: 'dashboard' | 'preenchimento' | 'revisoes' | 'terceirizadas' | 'cronograma') => void;
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
  onSavePendingInfo?: () => Promise<void>;
}

export default function Conformidade({
  activeTab,
  currentUser,
  activeContractCode,
  preloadedData,
  lockedContractCode,
  disciplinas = [],
  terceirizadas = [],
  pendingTerceirizadaIds = [],
  onSaveTerceirizada,
  onDeleteTerceirizada,
  onSavePendingInfo,
}: ConformidadeProps) {
  const hasPendingTerceirizadas = pendingTerceirizadaIds.length > 0;
  const [savingPending, setSavingPending] = useState(false);

  const handleSavePendingInfo = async () => {
    if (!onSavePendingInfo || savingPending || !hasPendingTerceirizadas) return;
    setSavingPending(true);
    try {
      await onSavePendingInfo();
    } finally {
      setSavingPending(false);
    }
  };

  return (
    <div className="w-full flex flex-col font-['Montserrat']">
      <div className="w-full">
        {activeTab === 'dashboard' && <Dashboard preloadedData={preloadedData} lockedContractCode={lockedContractCode} disciplinas={disciplinas} />}
        {activeTab === 'preenchimento' && <Preenchimento currentUser={currentUser} preloadedData={preloadedData} lockedContractCode={lockedContractCode} disciplinas={disciplinas} />}
        {activeTab === 'revisoes' && <Revisoes currentUser={currentUser} />}
        {activeTab === 'cronograma' && <Cronograma preloadedData={preloadedData as any} lockedContractCode={lockedContractCode} />}
        {activeTab === 'terceirizadas' && (
          <>
            <TerceirizadasCadastro
              terceirizadas={terceirizadas}
              disciplinas={disciplinas}
              pendingIds={pendingTerceirizadaIds}
              onSave={onSaveTerceirizada || (async () => {})}
              onDelete={onDeleteTerceirizada || (async () => {})}
            />

            {hasPendingTerceirizadas && (
              <div className="fixed right-8 bottom-8 z-30 flex">
                <button
                  type="button"
                  onClick={() => void handleSavePendingInfo()}
                  disabled={savingPending}
                  className="h-14 px-6 bg-[#F05D28] text-white rounded-2xl font-bold flex items-center justify-center gap-2 hover:opacity-90 active:scale-[0.98] transition-all shadow-xl shadow-[#F05D28]/25 disabled:opacity-70"
                >
                  <Save size={18} />
                  {savingPending ? 'Enviando...' : `Enviar informacoes (${pendingTerceirizadaIds.length})`}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
