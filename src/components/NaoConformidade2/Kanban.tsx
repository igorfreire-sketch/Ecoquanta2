import React, { useEffect, useState } from "react";
import NotesKanban, { type KanbanProps } from "./NotesKanban";
import { countBy, filterAccIssues, isAccDone, resumoRows, type AccResumo } from "../../lib/accData";
import { loadQualityResumo } from "../../lib/qualityStore";

export default function Kanban(props: KanbanProps) {
  const [data, setData] = useState<AccResumo>();
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    loadQualityResumo()
      .then((value) => {
        if (active) setData(value);
      })
      .catch((error) => {
        if (active) setError(String(error.message || error));
      });
    return () => {
      active = false;
    };
  }, []);
  const registro = (
    props.preloadedData as {
      registro?: {
        osOptions?: Array<{
          code?: string;
          codigo?: string;
          id?: string;
          contractCode?: string;
          contratoCodigo?: string;
        }>;
      };
    }
  )?.registro;
  const rows = data
    ? resumoRows(data).map((row) => {
        const os = registro?.osOptions?.find(
          (option) =>
            String(option.code || option.codigo || option.id) === row.os,
        );
        return {
          ...row,
          contratoCodigo:
            row.contratoCodigo || os?.contractCode || os?.contratoCodigo || "",
        };
      })
    : [];
  const filtered = filterAccIssues(
    rows,
    { contrato: props.lockedContractCode },
    new Set<string>(),
  );
  const openCounts = new Map(
    countBy(
      filtered.filter((row) => !isAccDone(row.status)),
      "os",
    ).map((card) => [card.name, card.value]),
  );
  const cards = countBy(filtered, "os")
    .filter((card) => card.value > 0)
    .map((card) => ({ ...card, value: openCounts.get(card.name) || 0 }));
  return (
    <div className="space-y-5">
      <section className="mx-auto max-w-[1180px] rounded-2xl bg-white/80 p-5">
        <h2 className="mb-4 font-bold text-slate-800">Qualidade por OS</h2><p className="mb-3 text-xs text-slate-500">Resumo ACC da ultima importacao</p>
        {error && (
          <p role="alert" className="text-red-700">
            Nao foi possivel carregar Qualidade: {error}
          </p>
        )}
        {!data && !error && <p role="status">Carregando Qualidade...</p>}
        {data && !cards.length && (
          <p className="text-sm text-slate-500">
            Nenhuma OS com dados de qualidade.
          </p>
        )}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map((card) => (
            <button
              key={card.name}
              onClick={() => props.onOpenOs?.(card.name)}
              className="rounded-xl border border-slate-200 border-l-4 border-l-[#F05D28] bg-white p-4 text-left shadow-sm"
            >
              <p className="text-xs font-bold text-slate-500">Qualidade</p>
              <p className="mt-1 font-bold text-slate-800">OS {card.name}</p>
              <p className="mt-2 text-sm text-slate-600">
                {card.value} issues abertas
              </p>
            </button>
          ))}
        </div>
      </section>
      <NotesKanban {...props} />
    </div>
  );
}
