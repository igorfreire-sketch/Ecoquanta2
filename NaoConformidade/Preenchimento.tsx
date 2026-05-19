import React, { useState, useEffect } from 'react';
import { saveRecord, generateId, NcRecord } from './ncStore';

type ItemKey = 'carimbo' | 'desenho' | 'relatorio' | 'faltaArquivo';

interface ItemState {
  checked: boolean;
  c: string;
  t: string;
}

const ITEM_LABELS: Record<ItemKey, string> = {
  carimbo: 'Carimbo',
  desenho: 'Desenho',
  relatorio: 'Relatório',
  faltaArquivo: 'Falta de Arquivo',
};

// 'folha' = Carimbo e Desenho | 'arquivo' = Relatório e Falta de Arquivo
const ITEM_UNIT: Record<ItemKey, 'folha' | 'arquivo'> = {
  carimbo:      'folha',
  desenho:      'folha',
  relatorio:    'arquivo',
  faltaArquivo: 'arquivo',
};

const ITEM_KEYS: ItemKey[] = ['carimbo', 'desenho', 'relatorio', 'faltaArquivo'];

const selectStyle: React.CSSProperties = {
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%23757575'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`,
  backgroundPosition: 'right 12px center',
  backgroundRepeat: 'no-repeat',
  backgroundSize: '16px',
};

export default function Preenchimento() {
  const [formData, setFormData] = useState({
    avaliador: '',
    contrato: '',
    os: '',
    disciplina: '',
    objetoOs: '',
    observacoes: '',
  });

  const [itens, setItens] = useState<Record<ItemKey, ItemState>>({
    carimbo:      { checked: false, c: '', t: '' },
    desenho:      { checked: false, c: '', t: '' },
    relatorio:    { checked: false, c: '', t: '' },
    faltaArquivo: { checked: false, c: '', t: '' },
  });

  const [currentDateTime, setCurrentDateTime] = useState({ data: '', hora: '' });

  useEffect(() => {
    const now = new Date();
    setCurrentDateTime({
      data: now.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }),
      hora: now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
    });
  }, []);

  const toggleItem = (key: ItemKey) => {
    setItens(prev => ({
      ...prev,
      [key]: { ...prev[key], checked: !prev[key].checked, c: '', t: '' },
    }));
  };

  const setItemQty = (key: ItemKey, field: 'c' | 't', value: string) => {
    const num = value.replace(/\D/g, '').slice(0, 3);
    setItens(prev => ({ ...prev, [key]: { ...prev[key], [field]: num } }));
  };

  const checkedItems = ITEM_KEYS.filter(k => itens[k].checked);
  const totalC = checkedItems.reduce((s, k) => s + (parseInt(itens[k].c) || 0), 0);
  const totalT = checkedItems.reduce((s, k) => s + (parseInt(itens[k].t) || 0), 0);

  const getResultado = () => {
    if (checkedItems.length === 0) return null;
    const detalhes = checkedItems.map(k => {
      const c = parseInt(itens[k].c) || 0;
      const t = parseInt(itens[k].t) || 0;
      const unit = ITEM_UNIT[k];
      const plural = (n: number) => n !== 1 ? (unit === 'folha' ? 'folhas' : 'arquivos') : unit;
      return { label: `${ITEM_LABELS[k]}: C=${c} ${plural(c)} / T=${t} ${plural(t)}`, unit };
    });
    return { detalhes, totalC, totalT };
  };

  const resultado = getResultado();

  const EMPTY_ITENS: Record<ItemKey, ItemState> = {
    carimbo:      { checked: false, c: '', t: '' },
    desenho:      { checked: false, c: '', t: '' },
    relatorio:    { checked: false, c: '', t: '' },
    faltaArquivo: { checked: false, c: '', t: '' },
  };

  const handleLimpar = () => {
    setFormData({ avaliador: '', contrato: '', os: '', disciplina: '', objetoOs: '', observacoes: '' });
    setItens(EMPTY_ITENS);
  };

  const [saved, setSaved] = React.useState(false);

  const handleSalvar = () => {
    // Build NC record only for items with T > 0
    const itensT = ITEM_KEYS
      .filter(k => itens[k].checked && parseInt(itens[k].t) > 0)
      .map(k => ({
        itemKey: k,
        itemLabel: ITEM_LABELS[k],
        quantidadeT: parseInt(itens[k].t) || 0,
        unit: ITEM_UNIT[k],
        revisado: false,
      }));

    if (itensT.length > 0) {
      const now = new Date();
      const dataHora = `${now.toLocaleDateString('pt-BR')} às ${now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} por ${formData.avaliador || 'Avaliador'}`;
      const record: NcRecord = {
        id: generateId(),
        os: formData.os || 'OS —',
        objetoOs: formData.objetoOs || 'Sem projeto',
        disciplina: formData.disciplina || '—',
        avaliador: formData.avaliador || '',
        dataHora,
        itensT,
        concluido: false,
      };
      saveRecord(record);
    }

    setSaved(true);
    handleLimpar();
    setTimeout(() => setSaved(false), 2500);
  };

  const inputBase =
    'w-14 h-9 text-center text-[13px] font-bold rounded-lg border outline-none transition-colors';

  return (
    <div className="flex flex-col gap-6 w-full max-w-[900px] mx-auto animate-in fade-in duration-500 pb-10">

      {/* Cabeçalho */}
      <div className="mb-2">
        <h2 className="text-[24px] font-bold text-[#2D2D2D] mb-1">Registro de Não Conformidade</h2>
        <p className="text-[15px] font-medium text-[#757575]">Preenchimento da análise documental</p>
      </div>

      {/* Card 1: Dados Gerais */}
      <div className="bg-white border border-[#E5E7EB] rounded-xl shadow-sm">
        <div className="px-6 py-5 border-b border-[#E5E7EB]">
          <h3 className="text-[16px] font-bold text-[#2D2D2D]">Dados Gerais da Análise</h3>
        </div>
        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">

            {/* Avaliador */}
            <div className="space-y-2">
              <label className="text-[11px] font-bold text-[#757575] uppercase tracking-wider">Avaliador *</label>
              <select value={formData.avaliador} onChange={e => setFormData({ ...formData, avaliador: e.target.value })}
                className="w-full h-11 px-3 bg-[#F9FAFB] border border-[#E5E7EB] rounded-lg text-[13px] text-[#2D2D2D] outline-none focus:border-[#F05D28] transition-colors appearance-none cursor-pointer"
                style={selectStyle}>
                <option value="">Selecione...</option>
                <option value="Joao">João Silva</option>
                <option value="Maria">Maria Souza</option>
              </select>
            </div>

            {/* Contrato */}
            <div className="space-y-2">
              <label className="text-[11px] font-bold text-[#757575] uppercase tracking-wider">Contrato *</label>
              <select value={formData.contrato} onChange={e => setFormData({ ...formData, contrato: e.target.value })}
                className="w-full h-11 px-3 bg-[#F9FAFB] border border-[#E5E7EB] rounded-lg text-[13px] text-[#2D2D2D] outline-none focus:border-[#F05D28] transition-colors appearance-none cursor-pointer"
                style={selectStyle}>
                <option value="">Selecione...</option>
                <option value="MKE">MKE</option>
                <option value="MRK">MRK</option>
              </select>
            </div>

            {/* OS */}
            <div className="space-y-2">
              <label className="text-[11px] font-bold text-[#757575] uppercase tracking-wider">OS *</label>
              <select value={formData.os} onChange={e => setFormData({ ...formData, os: e.target.value })}
                className={`w-full h-11 px-3 bg-[#F9FAFB] border ${formData.os ? 'border-[#F05D28] ring-1 ring-[#F05D28]/20' : 'border-[#E5E7EB]'} rounded-lg text-[13px] text-[#2D2D2D] outline-none focus:border-[#F05D28] transition-colors appearance-none cursor-pointer`}
                style={selectStyle}>
                <option value="">Selecione...</option>
                <option value="OS 011">OS 011</option>
                <option value="OS 012">OS 012</option>
                <option value="OS 013">OS 013</option>
              </select>
            </div>

            {/* Disciplina */}
            <div className="space-y-2">
              <label className="text-[11px] font-bold text-[#757575] uppercase tracking-wider">Disciplina *</label>
              <select value={formData.disciplina} onChange={e => setFormData({ ...formData, disciplina: e.target.value })}
                className="w-full h-11 px-3 bg-[#F9FAFB] border border-[#E5E7EB] rounded-lg text-[13px] text-[#2D2D2D] outline-none focus:border-[#F05D28] transition-colors appearance-none cursor-pointer"
                style={selectStyle}>
                <option value="">Selecione...</option>
                <option value="Arquitetura">Arquitetura</option>
                <option value="Fundações">Fundações</option>
                <option value="Pavimentação">Pavimentação</option>
              </select>
            </div>

            {/* Objeto da OS */}
            <div className="space-y-2 md:col-span-2">
              <label className="text-[11px] font-bold text-[#757575] uppercase tracking-wider">Objeto da OS *</label>
              <select value={formData.objetoOs} onChange={e => setFormData({ ...formData, objetoOs: e.target.value })}
                className={`w-full h-11 px-3 bg-[#F9FAFB] border ${formData.objetoOs ? 'border-[#F05D28] ring-1 ring-[#F05D28]/20' : 'border-[#E5E7EB]'} rounded-lg text-[13px] text-[#2D2D2D] outline-none focus:border-[#F05D28] transition-colors appearance-none cursor-pointer`}
                style={selectStyle}>
                <option value="">Selecione o projeto...</option>
                <option value="Projeto A - Arquitetura">Projeto A - Arquitetura</option>
                <option value="Projeto B - Fundações">Projeto B - Fundações</option>
                <option value="Projeto C - Pavimentação">Projeto C - Pavimentação</option>
              </select>
            </div>

          </div>

          <div className="pt-4 border-t border-[#E5E7EB] flex items-center gap-6">
            <span className="text-[12px] font-bold text-[#757575]">Data: <span className="font-medium ml-1">{currentDateTime.data}</span></span>
            <span className="text-[12px] font-bold text-[#757575]">Hora: <span className="font-medium ml-1">{currentDateTime.hora}</span></span>
          </div>
        </div>
      </div>

      {/* Card 2: Itens verificados */}
      <div className="bg-white border border-[#E5E7EB] rounded-xl shadow-sm p-6">
        <div className="mb-6 border-b border-[#E5E7EB] pb-4">
          <h3 className="text-[16px] font-bold text-[#2D2D2D] mb-1">Itens verificados no documento</h3>
          <p className="text-[13px] text-[#757575]">Marque todas as não conformidades encontradas no arquivo avaliado.</p>
        </div>

        {/* Tabela */}
        <div className="w-full">
          {/* Cabeçalho */}
          <div className="inline-grid grid-cols-[160px_32px_56px_56px] gap-x-3 items-center px-2 mb-1">
            <span />
            <span />
            <span className="text-[12px] font-bold text-[#2D2D2D] text-center">C</span>
            <span className="text-[12px] font-bold text-[#2D2D2D] text-center">T</span>
          </div>

          {/* Linhas */}
          <div className="flex flex-col divide-y divide-[#F3F4F6]">
            {ITEM_KEYS.map(key => {
              const item = itens[key];
              return (
                <div key={key} className="inline-grid grid-cols-[160px_32px_56px_56px] gap-x-3 items-center px-2 py-2.5">
                  {/* Nome + unidade hint */}
                  <div>
                    <span className={`text-[13px] font-medium transition-colors ${item.checked ? 'text-[#2D2D2D]' : 'text-[#9CA3AF]'}`}>
                      {ITEM_LABELS[key]}
                    </span>
                    <span className={`ml-2 text-[10px] font-bold uppercase tracking-wide ${
                      ITEM_UNIT[key] === 'arquivo' ? 'text-[#6366F1]' : 'text-[#F05D28]'
                    } opacity-70`}>
                      {ITEM_UNIT[key] === 'arquivo' ? 'arq.' : 'flh.'}
                    </span>
                  </div>

                  {/* Checkbox customizado */}
                  <button
                    type="button"
                    onClick={() => toggleItem(key)}
                    className={`w-5 h-5 rounded flex items-center justify-center border-2 transition-all flex-shrink-0 ${
                      item.checked
                        ? 'bg-[#F05D28] border-[#F05D28] shadow-sm'
                        : 'bg-white border-[#D1D5DB] hover:border-[#F05D28]'
                    }`}
                  >
                    {item.checked && (
                      <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                        <path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </button>

                  {/* Input C */}
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={3}
                    placeholder="—"
                    value={item.c}
                    disabled={!item.checked}
                    onChange={e => setItemQty(key, 'c', e.target.value)}
                    className={`${inputBase} w-14 ${
                      item.checked
                        ? 'bg-white border-[#E5E7EB] text-[#2D2D2D] focus:border-[#F05D28] focus:ring-2 focus:ring-[#F05D28]/20'
                        : 'bg-[#F3F4F6] border-[#F3F4F6] text-[#C4C9D4] cursor-not-allowed'
                    }`}
                  />

                  {/* Input T */}
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={3}
                    placeholder="—"
                    value={item.t}
                    disabled={!item.checked}
                    onChange={e => setItemQty(key, 't', e.target.value)}
                    className={`${inputBase} w-14 ${
                      item.checked
                        ? 'bg-white border-[#E5E7EB] text-[#2D2D2D] focus:border-[#F05D28] focus:ring-2 focus:ring-[#F05D28]/20'
                        : 'bg-[#F3F4F6] border-[#F3F4F6] text-[#C4C9D4] cursor-not-allowed'
                    }`}
                  />
                </div>
              );
            })}
          </div>
        </div>

        {/* Resultado */}
        <div className="mt-6 bg-[#F8F9FA] rounded-xl p-5 border border-[#E5E7EB]">
          <span className="block text-[11px] font-bold text-[#757575] uppercase tracking-wider mb-2">
            Resultado da Análise:
          </span>

          {!resultado ? (
            <span className="text-[15px] font-bold text-[#2D2D2D]">Sem não conformidade</span>
          ) : (
            <div className="flex flex-col gap-2">
              <span className="text-[15px] font-bold text-[#F05D28]">Com não conformidade</span>
              <div className="flex flex-wrap gap-3 mt-1">
                {resultado.detalhes.map((d, i) => (
                  <span key={i} className="text-[12px] font-medium text-[#2D2D2D] bg-white border border-[#E5E7EB] px-3 py-1.5 rounded-lg">
                    {d.label}
                  </span>
                ))}
              </div>
              <div className="flex items-center gap-6 mt-2 pt-3 border-t border-[#E5E7EB]">
                <span className="text-[13px] font-bold text-[#2D2D2D]">
                  Total C: <span className="text-[#F05D28] ml-1">{resultado.totalC}</span>
                </span>
                <span className="w-px h-4 bg-[#E5E7EB]" />
                <span className="text-[13px] font-bold text-[#2D2D2D]">
                  Total T: <span className="text-[#F05D28] ml-1">{resultado.totalT}</span>
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Card 3: Observações */}
      <div className="bg-white border border-[#E5E7EB] rounded-xl shadow-sm p-6">
        <h3 className="text-[16px] font-bold text-[#2D2D2D] mb-4">Observações / Comentários do avaliador</h3>
        <textarea
          value={formData.observacoes}
          onChange={e => setFormData({ ...formData, observacoes: e.target.value })}
          className="w-full h-32 p-4 bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl text-[13px] text-[#2D2D2D] outline-none focus:border-[#F05D28] focus:ring-1 focus:ring-[#F05D28]/20 transition-all resize-none"
          placeholder="Adicione observações, explique a não conformidade ou registre orientações de correção..."
        />
      </div>

      {/* Barra de Ações */}
      <div className="flex items-center justify-between bg-white border border-[#E5E7EB] rounded-xl shadow-sm px-6 py-4">
        <button
          type="button"
          onClick={handleLimpar}
          className="h-10 px-6 rounded-lg border-2 border-[#E5E7EB] text-[13px] font-bold text-[#6B7280] hover:border-[#F05D28] hover:text-[#F05D28] transition-all"
        >
          Limpar
        </button>

        <div className="flex items-center gap-3">
          {saved && (
            <span className="text-[13px] font-medium text-[#10B981] flex items-center gap-1.5 animate-in fade-in duration-200">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M2 7L5.5 10.5L12 3.5" stroke="#10B981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Salvo com sucesso!
            </span>
          )}
          <button
            type="button"
            onClick={handleSalvar}
            className="h-10 px-8 rounded-lg bg-[#F05D28] text-[13px] font-bold text-white hover:bg-[#D94D1A] active:scale-95 transition-all shadow-sm"
          >
            Salvar e próximo
          </button>
        </div>
      </div>

    </div>
  );
}
