import React, { useEffect, useState } from 'react';
import NotesKanban, { type KanbanProps } from './NotesKanban';
import { countBy, filterAccIssues, isAccDone } from '../../lib/accData';
import { loadQuality, type QualityData } from '../../lib/qualityStore';

export default function Kanban(props: KanbanProps) {
  const [data, setData] = useState<QualityData>();
  const [error, setError] = useState('');
  useEffect(() => { let active = true; loadQuality().then(value => { if (active) setData(value); }).catch(error => { if (active) setError(String(error.message || error)); }); return () => { active = false; }; }, []);
  const registro = (props.preloadedData as { registro?: { osOptions?: Array<{ code?: string; codigo?: string; id?: string; contractCode?: string; contratoCodigo?: string }> } })?.registro;
  const rows = data ? [...data.rows, ...data.manual, ...data.legacy].map(row => {
    const os = registro?.osOptions?.find(option => String(option.code || option.codigo || option.id) === row.os);
    return { ...row, contratoCodigo: row.contratoCodigo || os?.contractCode || os?.contratoCodigo || '' };
  }) : [];
  const cards = countBy(filterAccIssues(rows, { contrato: props.lockedContractCode }, new Set<string>()).filter(row => !isAccDone(row.status)), 'os').filter(card => card.value > 0);
  return <div className="space-y-5">
    <section className="mx-auto max-w-[1180px] rounded-2xl bg-white/80 p-5"><h2 className="mb-4 font-bold text-slate-800">Qualidade por OS</h2>
      {error && <p role="alert" className="text-red-700">Nao foi possivel carregar Qualidade: {error}</p>}
      {!data && !error && <p role="status">Carregando Qualidade...</p>}
      {data && !cards.length && <p className="text-sm text-slate-500">Nenhuma issue aberta.</p>}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{cards.map(card => <button key={card.name} onClick={() => props.onOpenOs?.(card.name)} className="rounded-xl border border-slate-200 border-l-4 border-l-[#F05D28] bg-white p-4 text-left shadow-sm"><p className="text-xs font-bold text-slate-500">Qualidade</p><p className="mt-1 font-bold text-slate-800">OS {card.name}</p><p className="mt-2 text-sm text-slate-600">{card.value} issues abertas</p></button>)}</div>
    </section>
    <NotesKanban {...props} />
  </div>;
}
