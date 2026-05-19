import React, { useState, useEffect } from 'react';
import { getRecords, updateRecord, archiveRecord, onRecordsChange, NcRecord } from './ncStore';

export default function Revisoes() {
  const [records, setRecords] = useState<NcRecord[]>([]);
  // Track items being archived (fade-out)
  const [archiving, setArchiving] = useState<Set<string>>(new Set());

  const load = () => {
    setRecords(getRecords().filter(r => !r.concluido || archiving.has(r.id)));
  };

  useEffect(() => {
    setRecords(getRecords());
    const unsub = onRecordsChange(() => setRecords(getRecords()));
    return unsub;
  }, []);

  // Active (not yet all checked) records only shown here
  const pending = records.filter(r => !r.concluido);
  const justConcluded = records.filter(r => r.concluido && archiving.has(r.id));
  const displayed = [...pending, ...justConcluded];

  const toggleItem = (recordId: string, itemKey: string) => {
    const rec = records.find(r => r.id === recordId);
    if (!rec) return;

    const newItens = rec.itensT.map(it =>
      it.itemKey === itemKey ? { ...it, revisado: !it.revisado } : it
    );
    const allDone = newItens.every(it => it.revisado);
    const updated = { ...rec, itensT: newItens, concluido: allDone };

    updateRecord(recordId, updated);

    if (allDone) {
      // Mark as archiving → show green state briefly, then remove
      setArchiving(prev => new Set(prev).add(recordId));
      setTimeout(() => {
        archiveRecord(recordId);
        setArchiving(prev => {
          const next = new Set(prev);
          next.delete(recordId);
          return next;
        });
      }, 2000);
    }
  };

  return (
    <div className="flex flex-col gap-6 w-full max-w-[900px] mx-auto animate-in fade-in duration-500 pb-10">
      {/* Cabeçalho */}
      <div className="mb-2">
        <h2 className="text-[24px] font-bold text-[#2D2D2D] mb-1">Revisão de Ocorrências (Histórico)</h2>
        <p className="text-[15px] font-medium text-[#757575]">
          Acompanhe todos os preenchimentos e valide a correção de não conformidades apontadas para T.
        </p>
      </div>

      {displayed.length === 0 && (
        <div className="bg-white border border-[#E5E7EB] rounded-2xl p-12 flex flex-col items-center gap-3 text-center shadow-sm">
          <div className="w-14 h-14 rounded-full bg-[#F3F4F6] flex items-center justify-center mb-2">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 11l3 3L22 4" />
              <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
            </svg>
          </div>
          <p className="text-[15px] font-bold text-[#2D2D2D]">Nenhuma revisão pendente</p>
          <p className="text-[13px] text-[#9CA3AF]">
            Quando houver itens com não conformidades para Terceirizados (T), eles aparecerão aqui.
          </p>
        </div>
      )}

      {displayed.map(rec => {
        const isConcluido = rec.concluido && archiving.has(rec.id);
        const pendentesCount = rec.itensT.filter(it => !it.revisado).length;

        return (
          <div
            key={rec.id}
            className={`bg-white border rounded-2xl shadow-sm overflow-hidden transition-all duration-500 ${
              isConcluido ? 'border-[#10B981]/40 opacity-75 scale-[0.99]' : 'border-[#E5E7EB]'
            }`}
          >
            {/* Header do card */}
            <div className="flex flex-wrap items-center gap-3 px-6 py-4 border-b border-[#F3F4F6]">
              {/* Badge OS */}
              <span className="bg-[#F05D28] text-white text-[11px] font-bold px-3 py-1 rounded-md shrink-0">
                {rec.os}
              </span>

              {/* Título */}
              <span className="text-[14px] font-bold text-[#2D2D2D]">{rec.objetoOs}</span>
              <span className="text-[#D1D5DB] hidden sm:block">|</span>
              <span className="text-[13px] font-medium text-[#6B7280]">{rec.disciplina}</span>

              {/* Status badge */}
              <div className="ml-auto flex items-center gap-3">
                {isConcluido ? (
                  <span className="flex items-center gap-1.5 bg-[#ECFDF5] text-[#10B981] border border-[#A7F3D0] text-[11px] font-bold px-3 py-1 rounded-full">
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                      <path d="M2 6l3 3 5-5" stroke="#10B981" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    Revisão T Concluída
                  </span>
                ) : (
                  <span className="bg-[#FFF7ED] text-[#F05D28] border border-[#FDBA74] text-[11px] font-bold px-3 py-1 rounded-full">
                    {pendentesCount} item(ns) pendente(s)
                  </span>
                )}
                <span className="text-[11px] text-[#9CA3AF] whitespace-nowrap">{rec.dataHora}</span>
              </div>
            </div>

            {/* Corpo: pontos para terceiros */}
            <div className="px-6 py-5">
              <p className="text-[10px] font-bold text-[#9CA3AF] uppercase tracking-widest mb-4">
                Pontos apontados para terceiros
              </p>
              <div className="flex flex-wrap gap-3">
                {rec.itensT.map(item => (
                  <button
                    key={item.itemKey}
                    onClick={() => !isConcluido && toggleItem(rec.id, item.itemKey)}
                    disabled={isConcluido}
                    className={`flex items-center justify-between gap-4 px-4 py-3 rounded-xl border text-left transition-all min-w-[200px] ${
                      item.revisado
                        ? 'bg-[#ECFDF5] border-[#A7F3D0] cursor-default'
                        : 'bg-[#F9FAFB] border-[#E5E7EB] hover:border-[#F05D28] hover:shadow-sm cursor-pointer'
                    }`}
                  >
                    <div>
                      <p className={`text-[13px] font-bold ${item.revisado ? 'text-[#065F46]' : 'text-[#2D2D2D]'}`}>
                        {item.itemLabel}
                      </p>
                      <p className={`text-[11px] mt-0.5 ${item.revisado ? 'text-[#10B981]' : 'text-[#9CA3AF]'}`}>
                        Apontado na OS ({item.quantidadeT} {item.quantidadeT !== 1
                          ? (item.unit === 'folha' ? 'folhas' : 'arquivos')
                          : item.unit})
                      </p>
                    </div>

                    {/* Checkbox visual */}
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 border-2 transition-all ${
                      item.revisado
                        ? 'bg-[#10B981] border-[#10B981]'
                        : 'bg-white border-[#D1D5DB]'
                    }`}>
                      {item.revisado && (
                        <svg width="14" height="12" viewBox="0 0 14 12" fill="none">
                          <path d="M1.5 6.5L5 10L12.5 1.5" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
