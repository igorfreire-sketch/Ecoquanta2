import React, { useEffect, useMemo, useState } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { ChevronDown, Save } from 'lucide-react';
import TerceirizadasCadastro from './TerceirizadasCadastro';
import type { TerceirizadaRecord } from './Administracao';

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

type NaoConformidadesProps = {
  preloadedData?: {
    registro?: {
      contracts?: RegistroContract[];
      osOptions?: RegistroOs[];
    };
  };
  lockedContractCode?: string;
  disciplinas?: string[];
  terceirizadas?: TerceirizadaRecord[];
  pendingTerceirizadaIds?: string[];
  onSaveTerceirizada?: (payload: Omit<TerceirizadaRecord, 'id'> & { id?: string }) => Promise<void>;
  onDeleteTerceirizada?: (id: string) => Promise<void>;
  onSavePendingInfo?: () => Promise<void>;
  activeView?: 'dashboard' | 'terceirizadas';
};

const disciplinesData = [
  { name: 'Estrutura', Interno: 12, Terceirizado: 25 },
  { name: 'Impermeab.', Interno: 8, Terceirizado: 15 },
  { name: 'Hidrossanit.', Interno: 15, Terceirizado: 30 },
  { name: 'PCI', Interno: 5, Terceirizado: 10 },
  { name: 'Eletrica', Interno: 10, Terceirizado: 22 },
  { name: 'Arquitetura', Interno: 20, Terceirizado: 45 },
];

const groupsData = [
  { name: 'Relatorio', Interno: 30, Terceirizado: 50 },
  { name: 'Carimbo', Interno: 15, Terceirizado: 25 },
  { name: 'Desenho', Interno: 45, Terceirizado: 80 },
  { name: 'Falta Arq.', Interno: 10, Terceirizado: 15 },
];

const totalAnalyzedData = [
  { name: 'Revisado Interno', value: 350, color: '#64748B' },
  { name: 'Revisado Externo', value: 450, color: '#F05D28' },
  { name: 'Sem NC', value: 647, color: '#10B981' },
];

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

export default function NaoConformidades({
  preloadedData,
  lockedContractCode,
  disciplinas = [],
  terceirizadas = [],
  pendingTerceirizadaIds = [],
  onSaveTerceirizada,
  onDeleteTerceirizada,
  onSavePendingInfo,
  activeView = 'dashboard',
}: NaoConformidadesProps) {
  const [activeMonth, setActiveMonth] = useState('SETEMBRO');
  const [selectedContract, setSelectedContract] = useState(lockedContractCode || '');
  const [selectedOs, setSelectedOs] = useState('');
  const [savingPending, setSavingPending] = useState(false);

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

  const filteredOsOptions = useMemo(() => {
    if (!selectedContract) return osOptions;
    return osOptions.filter((os) => getOsContractCode(os) === selectedContract);
  }, [osOptions, selectedContract]);

  const hasPendingTerceirizadas = pendingTerceirizadaIds.length > 0;

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
    <div className="w-full animate-in fade-in duration-500 space-y-6">
      {activeView === 'terceirizadas' ? (
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
      ) : (
      <div className="flex flex-col md:flex-row gap-6 w-full">
        <aside className="w-full md:w-72 flex flex-col gap-6 shrink-0">
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

          <div className="bg-white border border-[#E5E7EB] rounded-xl p-5 shadow-sm space-y-4">
          <div>
            <label className="block text-[11px] font-bold text-[#757575] uppercase tracking-[1px] mb-3">
              Filtrar por contrato
            </label>
            <div className="relative">
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
              <ChevronDown size={18} className="absolute right-4 top-1/2 -translate-y-1/2 text-[#757575] pointer-events-none" />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-[#757575] uppercase tracking-[1px] mb-3">
              Filtrar por OS
            </label>
            <div className="relative">
              <select
                value={selectedOs}
                onChange={(event) => setSelectedOs(event.target.value)}
                className="w-full h-11 px-4 bg-white border border-[#E5E7EB] rounded-xl text-[14px] font-medium text-[#2D2D2D] appearance-none focus:border-[#F05D28] focus:ring-2 focus:ring-[#F05D28]/20 outline-none transition-all cursor-pointer"
              >
                <option value="">Todas</option>
                {filteredOsOptions.map((os) => {
                  const code = getOsCode(os);
                  return (
                    <option key={code} value={code}>
                      {code} - {getOsName(os)}
                    </option>
                  );
                })}
              </select>
              <ChevronDown size={18} className="absolute right-4 top-1/2 -translate-y-1/2 text-[#757575] pointer-events-none" />
            </div>
          </div>
        </div>
        </aside>

        <div className="flex-1 flex flex-col gap-6">
        <div className="bg-white border border-[#E5E7EB] rounded-xl p-6 shadow-sm">
          <h3 className="text-[16px] font-bold text-[#2D2D2D] text-center mb-8">
            Nao Conformidades por disciplinas
          </h3>
          <div className="h-[350px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={disciplinesData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                <XAxis
                  dataKey="name"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: '#757575', fontSize: 11, fontWeight: 500 }}
                  dy={10}
                />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#757575', fontSize: 11 }} />
                <Tooltip
                  cursor={{ fill: '#F8F9FA' }}
                  contentStyle={{
                    borderRadius: '12px',
                    border: '1px solid #E5E7EB',
                    boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                  }}
                />
                <Legend
                  verticalAlign="top"
                  align="center"
                  iconType="circle"
                  wrapperStyle={{ paddingBottom: '30px', fontSize: '12px', fontWeight: 500 }}
                />
                <Bar dataKey="Interno" stackId="a" fill="#64748B" barSize={40} />
                <Bar dataKey="Terceirizado" stackId="a" fill="#F05D28" radius={[4, 4, 0, 0]} barSize={40} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white border border-[#E5E7EB] rounded-xl p-6 shadow-sm">
            <h3 className="text-[16px] font-bold text-[#2D2D2D] text-center mb-8">
              Grupos de Nao Conformidades
            </h3>
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={groupsData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                  <XAxis
                    dataKey="name"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: '#757575', fontSize: 11, fontWeight: 500 }}
                    dy={10}
                  />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: '#757575', fontSize: 11 }} />
                  <Tooltip
                    cursor={{ fill: '#F8F9FA' }}
                    contentStyle={{ borderRadius: '12px', border: '1px solid #E5E7EB' }}
                  />
                  <Legend
                    verticalAlign="top"
                    align="center"
                    iconType="circle"
                    wrapperStyle={{ paddingBottom: '20px', fontSize: '11px' }}
                  />
                  <Bar dataKey="Interno" fill="#64748B" radius={[4, 4, 0, 0]} barSize={25} />
                  <Bar dataKey="Terceirizado" fill="#F05D28" radius={[4, 4, 0, 0]} barSize={25} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-white border border-[#E5E7EB] rounded-xl p-6 shadow-sm flex flex-col items-center">
            <h3 className="text-[16px] font-bold text-[#2D2D2D] text-center mb-4">
              Arquivos Totais Analisados
            </h3>

            <div className="flex flex-wrap justify-center gap-4 mb-4">
              {totalAnalyzedData.map((entry) => (
                <div key={entry.name} className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
                  <span className="text-[11px] font-medium text-[#757575]">{entry.name}</span>
                </div>
              ))}
            </div>

            <div className="h-[250px] w-full relative">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={totalAnalyzedData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {totalAnalyzedData.map((entry) => (
                      <Cell key={entry.name} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ borderRadius: '12px', border: '1px solid #E5E7EB' }} />
                </PieChart>
              </ResponsiveContainer>

              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-[24px] font-bold text-[#2D2D2D]">1.447</span>
                <span className="text-[10px] font-medium text-[#757575] uppercase tracking-wider">Total</span>
              </div>
            </div>
          </div>
        </div>
        </div>
      </div>
      )}
    </div>
  );
}
