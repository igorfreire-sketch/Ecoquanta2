import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Send } from 'lucide-react';
import type { AuthUser } from '../LoginScreen';
import { generateId, saveRecordsBatch, type Nc2Record } from './ncStore';

type ItemKey = 'carimbo' | 'desenho' | 'relatorio' | 'faltaArquivo';

interface ItemState {
  checked: boolean;
  c: string;
  t: string;
}

const ITEM_LABELS: Record<ItemKey, string> = {
  carimbo: 'Carimbo',
  desenho: 'Desenho',
  relatorio: 'Relatorio',
  faltaArquivo: 'Falta de Arquivo',
};

const ITEM_UNIT: Record<ItemKey, 'folha' | 'arquivo'> = {
  carimbo: 'folha',
  desenho: 'folha',
  relatorio: 'arquivo',
  faltaArquivo: 'arquivo',
};

const ITEM_KEYS: ItemKey[] = ['carimbo', 'desenho', 'relatorio', 'faltaArquivo'];

const EMPTY_ITENS: Record<ItemKey, ItemState> = {
  carimbo: { checked: false, c: '', t: '' },
  desenho: { checked: false, c: '', t: '' },
  relatorio: { checked: false, c: '', t: '' },
  faltaArquivo: { checked: false, c: '', t: '' },
};

const selectStyle: React.CSSProperties = {
  backgroundImage:
    'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' fill=\'none\' viewBox=\'0 0 24 24\' stroke=\'%23757575\'%3E%3Cpath stroke-linecap=\'round\' stroke-linejoin=\'round\' stroke-width=\'2\' d=\'M19 9l-7 7-7-7\'%3E%3C/path%3E%3C/svg%3E")',
  backgroundPosition: 'right 12px center',
  backgroundRepeat: 'no-repeat',
  backgroundSize: '16px',
};

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
  contractCodigo?: string;
  contrato?: string;
  contratoCodigo?: string;
  contractId?: string;
};

type RegistroItem = {
  id?: string;
  code?: string;
  codigo?: string;
  name?: string;
  nome?: string;
  osCodigo?: string;
  osCode?: string;
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
  String(os.contractCode || os.contractCodigo || os.contratoCodigo || os.contrato || os.contractId || '').trim();

const getItemCode = (item: RegistroItem) =>
  String(item.code || item.codigo || item.id || '').trim();

const getItemName = (item: RegistroItem) =>
  String(item.name || item.nome || getItemCode(item)).trim();

const getItemOsCode = (item: RegistroItem) =>
  String(item.osCodigo || item.osCode || '').trim();

function normalizeText(value?: string) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
}

interface PreenchimentoProps {
  currentUser: AuthUser;
  preloadedData?: {
    registro?: {
      contracts?: RegistroContract[];
      osOptions?: RegistroOs[];
      itemOptions?: RegistroItem[];
    };
  };
  lockedContractCode?: string;
  disciplinas?: string[];
}

export default function Preenchimento({
  currentUser,
  preloadedData,
  lockedContractCode,
  disciplinas = [],
}: PreenchimentoProps) {
  const [formData, setFormData] = useState({
    avaliador: currentUser.nome || '',
    contrato: lockedContractCode || currentUser.contrato || '',
    os: '',
    disciplina: currentUser.disciplina || '',
    objetoOs: '',
    objetoOsCodigo: '',
    observacoes: '',
  });
  const [itens, setItens] = useState<Record<ItemKey, ItemState>>(EMPTY_ITENS);
  const [currentDateTime, setCurrentDateTime] = useState({ data: '', hora: '' });
  const [draftRecords, setDraftRecords] = useState<Nc2Record[]>([]);
  const [saved, setSaved] = useState(false);
  const [sending, setSending] = useState(false);

  const contracts = preloadedData?.registro?.contracts || [];
  const osOptions = preloadedData?.registro?.osOptions || [];
  const itemOptions = preloadedData?.registro?.itemOptions || [];

  useEffect(() => {
    setFormData((prev) => ({
      ...prev,
      avaliador: currentUser.nome || '',
      contrato: lockedContractCode || prev.contrato || currentUser.contrato || '',
      disciplina: prev.disciplina || currentUser.disciplina || '',
    }));
  }, [currentUser.contrato, currentUser.disciplina, currentUser.nome, lockedContractCode]);

  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      setCurrentDateTime({
        data: now.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }),
        hora: now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
      });
    };
    updateClock();
  }, []);

  const filteredOsOptions = useMemo(() => (
    osOptions.filter((os) => !formData.contrato || normalizeText(getOsContractCode(os)) === normalizeText(formData.contrato))
  ), [formData.contrato, osOptions]);

  const filteredItemOptions = useMemo(() => (
    itemOptions.filter((item) => !formData.os || normalizeText(getItemOsCode(item)) === normalizeText(formData.os))
  ), [formData.os, itemOptions]);

  const checkedItems = ITEM_KEYS.filter((key) => itens[key].checked);
  const totalC = checkedItems.reduce((sum, key) => sum + (parseInt(itens[key].c, 10) || 0), 0);
  const totalT = checkedItems.reduce((sum, key) => sum + (parseInt(itens[key].t, 10) || 0), 0);

  const resultado = checkedItems.length === 0
    ? null
    : {
        detalhes: checkedItems.map((key) => {
          const c = parseInt(itens[key].c, 10) || 0;
          const t = parseInt(itens[key].t, 10) || 0;
          return { label: `${ITEM_LABELS[key]}: C=${c} / T=${t}` };
        }),
        totalC,
        totalT,
      };

  const inputBase = 'w-14 h-9 text-center text-[13px] font-bold rounded-lg border outline-none transition-colors';

  const toggleItem = (key: ItemKey) => {
    setItens((prev) => ({
      ...prev,
      [key]: { ...prev[key], checked: !prev[key].checked, c: '', t: '' },
    }));
  };

  const setItemQty = (key: ItemKey, field: 'c' | 't', value: string) => {
    const num = value.replace(/\D/g, '').slice(0, 3);
    setItens((prev) => ({ ...prev, [key]: { ...prev[key], [field]: num } }));
  };

  const handleLimpar = () => {
    setFormData({
      avaliador: currentUser.nome || '',
      contrato: lockedContractCode || currentUser.contrato || '',
      os: '',
      disciplina: currentUser.disciplina || '',
      objetoOs: '',
      objetoOsCodigo: '',
      observacoes: '',
    });
    setItens(EMPTY_ITENS);
  };

  const buildRecord = (): Nc2Record | null => {
    if (!formData.avaliador || !formData.contrato || !formData.os || !formData.disciplina || !formData.objetoOs) {
      return null;
    }

    const selectedContract = contracts.find((item) => normalizeText(getContractCode(item)) === normalizeText(formData.contrato));
    const selectedOs = filteredOsOptions.find((item) => normalizeText(getOsCode(item)) === normalizeText(formData.os));
    const itensRegistrados = ITEM_KEYS
      .filter((key) => itens[key].checked)
      .map((key) => ({
        itemKey: key,
        itemLabel: ITEM_LABELS[key],
        quantidadeC: parseInt(itens[key].c, 10) || 0,
        quantidadeT: parseInt(itens[key].t, 10) || 0,
        unit: ITEM_UNIT[key],
        revisado: false,
      }));

    const now = new Date();
    const dataHora = `${now.toLocaleDateString('pt-BR')} as ${now.toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
    })} por ${formData.avaliador}`;

    return {
      id: generateId(),
      contratoCodigo: formData.contrato,
      contratoNome: selectedContract ? getContractName(selectedContract) : formData.contrato,
      os: selectedOs ? `${getOsCode(selectedOs)} - ${getOsName(selectedOs)}` : formData.os,
      osCodigo: formData.os,
      objetoOs: formData.objetoOs,
      objetoOsCodigo: formData.objetoOsCodigo || formData.objetoOs,
      disciplina: formData.disciplina,
      avaliador: formData.avaliador,
      avaliadorEmail: currentUser.email || '',
      observacoes: formData.observacoes,
      dataHora,
      itens: itensRegistrados,
      itensT: itensRegistrados.filter((item) => item.quantidadeT > 0),
      concluido: itensRegistrados.filter((item) => item.quantidadeT > 0).length === 0,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      updatedByNome: currentUser.nome || '',
      updatedByEmail: currentUser.email || '',
    };
  };

  const handleRegistrarProxima = () => {
    const record = buildRecord();
    if (!record) return;
    setDraftRecords((prev) => [record, ...prev]);
    handleLimpar();
  };

  const handleEnviarAtividades = async () => {
    let queue = draftRecords;
    const currentRecord = buildRecord();
    if (currentRecord) {
      queue = [currentRecord, ...queue];
    }
    if (queue.length === 0) return;

    setSending(true);
    try {
      await saveRecordsBatch(queue, { nome: currentUser.nome, email: currentUser.email });
      setDraftRecords([]);
      handleLimpar();
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } finally {
      setSending(false);
    }
  };

  const canRegisterCurrent = Boolean(
    formData.avaliador && formData.contrato && formData.os && formData.disciplina && formData.objetoOs
  );

  return (
    <div className="flex flex-col gap-6 w-full max-w-[980px] mx-auto animate-in fade-in duration-500 pb-10">
      <div className="mb-2">
        <h2 className="text-[24px] font-bold text-[#2D2D2D] mb-1">Registro de Conformidade</h2>
        <p className="text-[15px] font-medium text-[#757575]">Preenchimento da analise documental</p>
      </div>

      <div className="bg-white border border-[#E5E7EB] rounded-xl shadow-sm">
        <div className="px-6 py-5 border-b border-[#E5E7EB]">
          <h3 className="text-[16px] font-bold text-[#2D2D2D]">Dados Gerais da Analise</h3>
        </div>
        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <div className="space-y-2">
              <label className="text-[11px] font-bold text-[#757575] uppercase tracking-wider">Avaliador *</label>
              <input
                value={formData.avaliador}
                disabled
                className="w-full h-11 px-3 bg-[#F3F4F6] border border-[#E5E7EB] rounded-lg text-[13px] text-[#2D2D2D] outline-none"
              />
            </div>

            <div className="space-y-2">
              <label className="text-[11px] font-bold text-[#757575] uppercase tracking-wider">Contrato *</label>
              <select
                value={formData.contrato}
                onChange={(e) => setFormData({ ...formData, contrato: e.target.value, os: '', objetoOs: '', objetoOsCodigo: '' })}
                disabled={Boolean(lockedContractCode)}
                className="w-full h-11 px-3 bg-[#F9FAFB] border border-[#E5E7EB] rounded-lg text-[13px] text-[#2D2D2D] outline-none focus:border-[#F05D28] transition-colors appearance-none cursor-pointer"
                style={selectStyle}
              >
                <option value="">Selecione...</option>
                {contracts.map((contract) => {
                  const code = getContractCode(contract);
                  return (
                    <option key={code} value={code}>
                      {code} - {getContractName(contract)}
                    </option>
                  );
                })}
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-[11px] font-bold text-[#757575] uppercase tracking-wider">OS *</label>
              <select
                value={formData.os}
                onChange={(e) => setFormData({ ...formData, os: e.target.value, objetoOs: '', objetoOsCodigo: '' })}
                className={`w-full h-11 px-3 bg-[#F9FAFB] border ${formData.os ? 'border-[#F05D28] ring-1 ring-[#F05D28]/20' : 'border-[#E5E7EB]'} rounded-lg text-[13px] text-[#2D2D2D] outline-none focus:border-[#F05D28] transition-colors appearance-none cursor-pointer`}
                style={selectStyle}
              >
                <option value="">Selecione...</option>
                {filteredOsOptions.map((os) => {
                  const code = getOsCode(os);
                  return (
                    <option key={code} value={code}>
                      {code} - {getOsName(os)}
                    </option>
                  );
                })}
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-[11px] font-bold text-[#757575] uppercase tracking-wider">Disciplina *</label>
              <select
                value={formData.disciplina}
                onChange={(e) => setFormData({ ...formData, disciplina: e.target.value })}
                className="w-full h-11 px-3 bg-[#F9FAFB] border border-[#E5E7EB] rounded-lg text-[13px] text-[#2D2D2D] outline-none focus:border-[#F05D28] transition-colors appearance-none cursor-pointer"
                style={selectStyle}
              >
                <option value="">Selecione...</option>
                {disciplinas.map((disciplina) => (
                  <option key={disciplina} value={disciplina}>
                    {disciplina}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2 md:col-span-2">
              <label className="text-[11px] font-bold text-[#757575] uppercase tracking-wider">Objeto da OS *</label>
              <select
                value={formData.objetoOsCodigo}
                onChange={(e) => {
                  const selected = filteredItemOptions.find((item) => normalizeText(getItemCode(item)) === normalizeText(e.target.value));
                  setFormData({
                    ...formData,
                    objetoOsCodigo: e.target.value,
                    objetoOs: selected ? getItemName(selected) : '',
                  });
                }}
                className={`w-full h-11 px-3 bg-[#F9FAFB] border ${formData.objetoOs ? 'border-[#F05D28] ring-1 ring-[#F05D28]/20' : 'border-[#E5E7EB]'} rounded-lg text-[13px] text-[#2D2D2D] outline-none focus:border-[#F05D28] transition-colors appearance-none cursor-pointer`}
                style={selectStyle}
              >
                <option value="">Selecione a atividade item 4...</option>
                {filteredItemOptions.map((item) => {
                  const code = getItemCode(item);
                  return (
                    <option key={code} value={code}>
                      {code} - {getItemName(item)}
                    </option>
                  );
                })}
              </select>
            </div>
          </div>

          <div className="pt-4 border-t border-[#E5E7EB] flex items-center gap-6">
            <span className="text-[12px] font-bold text-[#757575]">
              Data: <span className="font-medium ml-1">{currentDateTime.data}</span>
            </span>
            <span className="text-[12px] font-bold text-[#757575]">
              Hora: <span className="font-medium ml-1">{currentDateTime.hora}</span>
            </span>
          </div>
        </div>
      </div>

      <div className="bg-white border border-[#E5E7EB] rounded-xl shadow-sm p-6">
        <div className="mb-6 border-b border-[#E5E7EB] pb-4">
          <h3 className="text-[16px] font-bold text-[#2D2D2D] mb-1">Itens verificados no documento</h3>
          <p className="text-[13px] text-[#757575]">Marque carimbo, desenho, relatorio, falta de arquivo e os quantitativos encontrados.</p>
        </div>

        <div className="w-full">
          <div className="inline-grid grid-cols-[160px_32px_56px_56px] gap-x-3 items-center px-2 mb-1">
            <span />
            <span />
            <span className="text-[12px] font-bold text-[#2D2D2D] text-center">C</span>
            <span className="text-[12px] font-bold text-[#2D2D2D] text-center">T</span>
          </div>

          <div className="flex flex-col divide-y divide-[#F3F4F6]">
            {ITEM_KEYS.map((key) => {
              const item = itens[key];
              return (
                <div key={key} className="inline-grid grid-cols-[160px_32px_56px_56px] gap-x-3 items-center px-2 py-2.5">
                  <div>
                    <span className={`text-[13px] font-medium transition-colors ${item.checked ? 'text-[#2D2D2D]' : 'text-[#9CA3AF]'}`}>
                      {ITEM_LABELS[key]}
                    </span>
                    <span className={`ml-2 text-[10px] font-bold uppercase tracking-wide ${item.checked ? 'text-[#F05D28]' : 'text-[#D1D5DB]'}`}>
                      {ITEM_UNIT[key]}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => toggleItem(key)}
                    className={`w-7 h-7 rounded-md border flex items-center justify-center transition-all ${item.checked ? 'bg-[#F05D28] border-[#F05D28]' : 'bg-white border-[#D1D5DB]'}`}
                  >
                    {item.checked && (
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                        <path d="M3 7.2L5.8 10L11 4.8" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </button>

                  <input
                    value={item.c}
                    onChange={(e) => setItemQty(key, 'c', e.target.value)}
                    disabled={!item.checked}
                    className={`${inputBase} ${item.checked ? 'border-[#E5E7EB] bg-white text-[#2D2D2D] focus:border-[#F05D28]' : 'border-[#F3F4F6] bg-[#F9FAFB] text-[#D1D5DB]'}`}
                  />

                  <input
                    value={item.t}
                    onChange={(e) => setItemQty(key, 't', e.target.value)}
                    disabled={!item.checked}
                    className={`${inputBase} ${item.checked ? 'border-[#E5E7EB] bg-white text-[#2D2D2D] focus:border-[#F05D28]' : 'border-[#F3F4F6] bg-[#F9FAFB] text-[#D1D5DB]'}`}
                  />
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="bg-white border border-[#E5E7EB] rounded-xl shadow-sm p-6">
        <div className="flex flex-col gap-4">
          <div>
            <h3 className="text-[16px] font-bold text-[#2D2D2D] mb-1">Resultado da analise</h3>
            <p className="text-[13px] text-[#757575]">Resumo automatico com base nos itens marcados.</p>
          </div>

          {resultado ? (
            <div className="space-y-3">
              <div className="flex flex-col gap-2">
                {resultado.detalhes.map((detalhe) => (
                  <div key={detalhe.label} className="px-4 py-3 rounded-xl bg-[#F9FAFB] border border-[#E5E7EB] text-[13px] font-medium text-[#2D2D2D]">
                    {detalhe.label}
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="rounded-xl border border-[#E5E7EB] bg-[#F8FAFC] p-4">
                  <span className="text-[12px] font-bold text-[#64748B] uppercase tracking-wide">Sem nao conformidade</span>
                  <p className="text-[24px] font-bold text-[#2D2D2D] mt-2">{resultado.totalC}</p>
                </div>
                <div className="rounded-xl border border-[#FED7AA] bg-[#FFF7ED] p-4">
                  <span className="text-[12px] font-bold text-[#F05D28] uppercase tracking-wide">Com nao conformidade</span>
                  <p className="text-[24px] font-bold text-[#F05D28] mt-2">{resultado.totalT}</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-[#D1D5DB] bg-[#FCFCFD] p-6 text-[14px] text-[#9CA3AF] text-center">
              Selecione os itens avaliados para gerar o resumo.
            </div>
          )}
        </div>
      </div>

      <div className="bg-white border border-[#E5E7EB] rounded-xl shadow-sm p-6">
        <label className="block text-[11px] font-bold text-[#757575] uppercase tracking-wider mb-3">Observacoes</label>
        <textarea
          value={formData.observacoes}
          onChange={(e) => setFormData({ ...formData, observacoes: e.target.value })}
          rows={5}
          placeholder="Adicione observacoes, explique a nao conformidade ou registre orientacoes de correcao..."
          className="w-full rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] px-4 py-3 text-[14px] text-[#2D2D2D] outline-none focus:border-[#F05D28] transition-colors resize-y"
        />
      </div>

      <div className="flex flex-col sm:flex-row gap-3 justify-end">
        <button
          type="button"
          onClick={handleLimpar}
          className="h-12 px-6 rounded-xl border border-[#E5E7EB] bg-white text-[#757575] text-[14px] font-bold hover:bg-[#F9FAFB] transition-colors"
        >
          Limpar
        </button>
        <button
          type="button"
          onClick={handleRegistrarProxima}
          disabled={!canRegisterCurrent}
          className="h-12 px-6 rounded-xl border border-[#F05D28] bg-white text-[#F05D28] text-[14px] font-bold hover:bg-[#FFF7ED] transition-colors inline-flex items-center justify-center gap-2 disabled:opacity-50"
        >
          <Plus size={16} />
          Registrar proxima atividade +
        </button>
      </div>

      {(draftRecords.length > 0 || canRegisterCurrent) && (
        <div className="sticky bottom-6 z-20 flex justify-end">
          <button
            type="button"
            onClick={() => void handleEnviarAtividades()}
            disabled={sending || (!canRegisterCurrent && draftRecords.length === 0)}
            className="h-14 px-6 rounded-2xl bg-[#FACC15] text-[#5B4300] text-[14px] font-black shadow-xl shadow-[#FACC15]/30 inline-flex items-center justify-center gap-2 hover:bg-[#EAB308] disabled:opacity-60"
          >
            <Send size={18} />
            {sending ? 'Enviando atividade...' : 'Enviar atividade'}
          </button>
        </div>
      )}

      {draftRecords.length > 0 && (
        <div className="bg-white border border-[#E5E7EB] rounded-xl shadow-sm p-6">
          <div className="flex items-center justify-between gap-4 mb-4">
            <div>
              <h3 className="text-[16px] font-bold text-[#2D2D2D]">Atividades registradas nessa janela</h3>
              <p className="text-[13px] text-[#757575]">Essas atividades serao enviadas para Revisoes.</p>
            </div>
            <span className="rounded-full bg-[#FFF7ED] px-3 py-1 text-[11px] font-bold text-[#C2410C]">
              {draftRecords.length} pendente(s)
            </span>
          </div>

          <div className="space-y-3">
            {draftRecords.map((record) => (
              <div key={record.id} className="rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] p-4">
                <div className="text-[13px] font-bold text-[#2D2D2D]">{record.os}</div>
                <div className="mt-1 text-[12px] font-medium text-[#64748B]">{record.objetoOs} - {record.disciplina}</div>
                <div className="mt-2 text-[12px] text-[#4B5563]">{record.observacoes || 'Sem observacoes'}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {saved && (
        <div className="fixed right-8 bottom-8 z-30 px-5 py-4 rounded-2xl bg-[#ECFDF5] border border-[#A7F3D0] text-[#047857] text-[14px] font-bold shadow-lg">
          Atividades enviadas com sucesso.
        </div>
      )}
    </div>
  );
}
