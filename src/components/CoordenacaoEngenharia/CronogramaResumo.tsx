import React from 'react';
import type { EngineeringActivity } from '../Atividades';

interface CronogramaResumoProps {
  activities: EngineeringActivity[];
  // Disciplina: mostra a OS de cada atividade (contexto util quando ja se sabe a disciplina).
  // OS: mostra a disciplina de cada atividade (contexto util quando ja se sabe a OS).
  contextLabel: 'os' | 'disciplina';
}

function formatDateBR(value?: string) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('pt-BR');
}

function progressColor(percent: number) {
  if (percent >= 100) return '#10B981';
  if (percent > 0) return '#F05D28';
  return '#CBD5E1';
}

export default function CronogramaResumo({ activities, contextLabel }: CronogramaResumoProps) {
  const sorted = React.useMemo(
    () => [...activities].sort((a, b) => (a.inicioPlanejado || '').localeCompare(b.inicioPlanejado || '')),
    [activities]
  );

  if (sorted.length === 0) {
    return <p className="text-[13px] text-[#757575]">Nenhuma atividade vinculada ainda.</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      {sorted.map((activity) => {
        const percent = Math.max(0, Math.min(100, Math.round(activity.percentualRealizado || 0)));
        const contexto = contextLabel === 'os' ? activity.osNome || activity.osCodigo : activity.disciplina;
        return (
          <div key={activity.id} className="rounded-xl border border-[#E5E7EB] bg-white p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-bold text-[#2D2D2D]">{activity.itemNome || activity.atividade || 'Atividade'}</p>
                {contexto && <p className="mt-0.5 text-[11px] font-medium text-[#94A3B8]">{contexto}</p>}
              </div>
              <span className="flex-shrink-0 text-[13px] font-black" style={{ color: progressColor(percent) }}>{percent}%</span>
            </div>

            <div className="mt-2.5 h-2 w-full overflow-hidden rounded-full bg-[#F3F4F6]">
              <div className="h-full rounded-full transition-all" style={{ width: `${percent}%`, backgroundColor: progressColor(percent) }} />
            </div>

            <div className="mt-2 flex items-center gap-4 text-[11px] font-medium text-[#64748B]">
              <span>Início: <strong className="text-[#2D2D2D]">{formatDateBR(activity.inicioPlanejado)}</strong></span>
              <span>Término: <strong className="text-[#2D2D2D]">{formatDateBR(activity.terminoPlanejado)}</strong></span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
