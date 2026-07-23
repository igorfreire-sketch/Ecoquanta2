import React, { useEffect, useState } from 'react';
import { CheckCircle2, Clock3, Loader2, Save } from 'lucide-react';
import type { AuthUser } from '../LoginScreen';
import { getDemoRecords, getRecords, updateRecord, type Nc2Item, type Nc2Record } from './ncStore';

function itemUnitLabel(item: Nc2Item) {
  const total = item.quantidadeT || item.quantidadeC || 0;
  if (item.unit === 'folha') return total === 1 ? 'folha' : 'folhas';
  return total === 1 ? 'arquivo' : 'arquivos';
}

export default function Revisoes({ currentUser }: { currentUser: AuthUser }) {
  const [records, setRecords] = useState<Nc2Record[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const next = await getRecords();
        if (active) {
          setRecords(next);
          setErrorMessage('');
        }
      } catch (error) {
        console.error('Erro ao carregar revisoes:', error);
        if (active) {
          setRecords(getDemoRecords());
          setErrorMessage('Firebase recusou acesso as revisoes reais. Mostrando 5 registros de demonstracao.');
        }
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const persistRecord = async (record: Nc2Record) => {
    setSavingIds((prev) => new Set(prev).add(record.id));
    try {
      const updated = await updateRecord(record, { nome: currentUser.nome, email: currentUser.email });
      setRecords((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
      setErrorMessage('');
    } catch (error) {
      console.error('Erro ao salvar revisao:', error);
      setErrorMessage('Nao foi possivel salvar as alteracoes no Firebase.');
    } finally {
      setSavingIds((prev) => {
        const next = new Set(prev);
        next.delete(record.id);
        return next;
      });
    }
  };

  const updateRecordLocal = (recordId: string, updater: (record: Nc2Record) => Nc2Record) => {
    setRecords((prev) => {
      const current = prev.find((item) => item.id === recordId);
      if (!current) return prev;
      const nextRecord = updater(current);
      void persistRecord(nextRecord);
      return prev.map((item) => (item.id === recordId ? nextRecord : item));
    });
  };

  if (loading) {
    return (
      <div className="flex min-h-[320px] items-center justify-center">
        <div className="flex items-center gap-3 rounded-xl bg-white px-5 py-4 text-[13px] font-bold text-[#757575] shadow-[0_10px_30px_-22px_rgba(15,23,42,0.45)]">
          <Loader2 size={16} className="animate-spin text-[#F05D28]" />
          Carregando revisoes...
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 w-full max-w-[980px] mx-auto animate-in fade-in duration-500 pb-10">
      <div>
        <p className="text-[10px] font-extrabold uppercase tracking-[1.2px] text-[#94A3B8]">CONFORMIDADE</p>
        <h2 className="text-[18px] font-black text-[#2D2D2D]">Revisões</h2>
        <p className="mt-1 text-[15px] font-medium text-[#757575]">
          Todas as atividades registradas no preenchimento aparecem aqui e podem ser editadas por qualquer usuario com acesso.
        </p>
      </div>

      {errorMessage && (
        <div className="rounded-xl border border-[#FECACA] bg-[#FEF2F2] px-4 py-3 text-[13px] font-medium text-[#EF4444]">
          {errorMessage}
        </div>
      )}

      {records.length === 0 && (
        <div className="rounded-2xl bg-white p-12 flex flex-col items-center gap-3 text-center shadow-[0_10px_30px_-22px_rgba(15,23,42,0.45)]">
          <p className="text-[15px] font-bold text-[#2D2D2D]">{errorMessage ? 'Falha ao carregar revisoes' : 'Nenhuma revisao registrada'}</p>
          <p className="text-[13px] text-[#94A3B8]">
            {errorMessage ? 'Confira a conexao com o Firebase e tente novamente.' : 'Quando houver atividades enviadas em Preenchimento, elas aparecerao aqui.'}
          </p>
        </div>
      )}

      {records.map((rec) => {
        const saving = savingIds.has(rec.id);
        return (
          <div key={rec.id} className="rounded-2xl bg-white shadow-[0_10px_30px_-22px_rgba(15,23,42,0.45)] overflow-hidden">
            <div className="flex flex-wrap items-center gap-3 px-6 py-4">
              <span className="bg-[#F05D28] text-white text-[11px] font-bold px-3 py-1 rounded-md shrink-0">
                {rec.osCodigo || rec.os}
              </span>
              <span className="text-[14px] font-bold text-[#2D2D2D]">{rec.objetoOs}</span>
              <span className="text-[13px] font-medium text-[#757575]">{rec.disciplina}</span>
              <span className="text-[12px] text-[#94A3B8]">{rec.avaliador}</span>
              <div className="ml-auto flex items-center gap-3">
                <span className={`inline-flex items-center gap-1.5 text-[11px] font-bold px-3 py-1 rounded-full ${rec.concluido ? 'bg-[#ECFDF5] text-[#10B981]' : 'bg-[#FFF3EC] text-[#F05D28]'}`}>
                  {rec.concluido ? <CheckCircle2 size={12} /> : <Clock3 size={12} />}
                  {rec.concluido ? 'Concluida' : 'Pendente'}
                </span>
                <span className="text-[11px] text-[#94A3B8] whitespace-nowrap">{rec.dataHora}</span>
              </div>
            </div>

            <div className="px-6 pb-6 space-y-5">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-bold text-[#757575] uppercase tracking-widest">Objeto da OS</label>
                  <input
                    value={rec.objetoOs}
                    onChange={(event) => {
                      const value = event.target.value;
                      setRecords((prev) => prev.map((item) => (item.id === rec.id ? { ...item, objetoOs: value } : item)));
                    }}
                    onBlur={() => {
                      const fresh = records.find((item) => item.id === rec.id);
                      if (fresh) void persistRecord(fresh);
                    }}
                    className="mt-1 w-full h-11 rounded-xl border border-[#E5E7EB] px-3 text-[13px] font-medium outline-none focus:border-[#F05D28]"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-[#757575] uppercase tracking-widest">Disciplina</label>
                  <input
                    value={rec.disciplina}
                    onChange={(event) => {
                      const value = event.target.value;
                      setRecords((prev) => prev.map((item) => (item.id === rec.id ? { ...item, disciplina: value } : item)));
                    }}
                    onBlur={() => {
                      const fresh = records.find((item) => item.id === rec.id);
                      if (fresh) void persistRecord(fresh);
                    }}
                    className="mt-1 w-full h-11 rounded-xl border border-[#E5E7EB] px-3 text-[13px] font-medium outline-none focus:border-[#F05D28]"
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] font-bold text-[#757575] uppercase tracking-widest">Observacoes</label>
                <textarea
                  value={rec.observacoes || ''}
                  onChange={(event) => {
                    const value = event.target.value;
                    setRecords((prev) => prev.map((item) => (item.id === rec.id ? { ...item, observacoes: value } : item)));
                  }}
                  onBlur={() => {
                    const fresh = records.find((item) => item.id === rec.id);
                    if (fresh) void persistRecord(fresh);
                  }}
                  className="mt-1 w-full min-h-[120px] resize-y rounded-xl border border-[#E5E7EB] p-3 text-[13px] font-medium outline-none focus:border-[#F05D28]"
                />
              </div>

              <div>
                <p className="text-[10px] font-bold text-[#94A3B8] uppercase tracking-widest mb-4">Itens avaliados</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {(rec.itens || []).map((item) => (
                    <div key={item.itemKey} className="rounded-xl bg-[#F8F9FA] p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-[13px] font-bold text-[#2D2D2D]">{item.itemLabel}</p>
                          <p className="text-[11px] text-[#94A3B8] mt-1">
                            C: {item.quantidadeC} / T: {item.quantidadeT} {itemUnitLabel(item)}
                          </p>
                        </div>
                        {item.quantidadeT > 0 && (
                          <button
                            type="button"
                            onClick={() => {
                              updateRecordLocal(rec.id, (record) => {
                                const nextItens = record.itens.map((entry) => (
                                  entry.itemKey === item.itemKey ? { ...entry, revisado: !entry.revisado } : entry
                                ));
                                const nextItensT = nextItens.filter((entry) => entry.quantidadeT > 0);
                                const concluido = nextItensT.length === 0 || nextItensT.every((entry) => entry.revisado);
                                return { ...record, itens: nextItens, itensT: nextItensT, concluido };
                              });
                            }}
                            className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-black uppercase tracking-wide ${item.revisado ? 'bg-[#10B981] text-white' : 'bg-white border border-[#D1D5DB] text-[#757575]'}`}
                          >
                            {item.revisado ? <CheckCircle2 size={13} /> : <Clock3 size={13} />}
                            {item.revisado ? 'Revisado' : 'Marcar revisado'}
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void persistRecord(rec)}
                  className="h-11 px-5 rounded-xl bg-[#F05D28] text-white text-[13px] font-bold hover:bg-[#D94E1F] disabled:opacity-60 inline-flex items-center gap-2"
                >
                  {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                  {saving ? 'Salvando...' : 'Salvar alteracoes'}
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
