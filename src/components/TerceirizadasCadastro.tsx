import SearchableSelect from './SearchableSelect';
import React from 'react';
import { ChevronRight, Plus, Trash2, Users } from 'lucide-react';
import type { TerceirizadaRecord } from './Administracao';

function getInitials(nome: string) {
  return nome
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((parte) => parte[0]?.toUpperCase() || '')
    .join('');
}

export default function TerceirizadasCadastro({
  terceirizadas,
  disciplinas,
  pendingIds,
  onSave,
  onDelete,
}: {
  terceirizadas: TerceirizadaRecord[];
  disciplinas: string[];
  pendingIds: string[];
  onSave: (payload: Omit<TerceirizadaRecord, 'id'> & { id?: string }) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [nome, setNome] = React.useState('');
  const [disciplina, setDisciplina] = React.useState('');
  const [loading, setLoading] = React.useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = nome.trim();
    const cleanDisciplina = disciplina.trim();
    if (!cleanName || !cleanDisciplina) return;

    setLoading(true);
    try {
      await onSave({ nome: cleanName, disciplina: cleanDisciplina });
      setNome('');
      setDisciplina('');
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="bg-white border border-[#E5E7EB] rounded-2xl shadow-sm overflow-hidden">
      <div className="px-8 py-6 border-b border-[#E5E7EB]">
        <div className="flex items-center gap-3">
          <Users size={18} className="text-[#F05D28]" />
          <h2 className="text-[18px] font-bold text-[#2D2D2D]">Terceirizadas por Disciplina</h2>
        </div>
        <p className="text-[13px] text-[#757575] mt-1">
          Empresas cadastradas aparecem junto dos profissionais no registro de atividades, respeitando o filtro de disciplina.
        </p>
      </div>

      <div className="p-6 space-y-5">
        <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-[minmax(220px,1fr)_minmax(180px,260px)_auto] gap-4 items-end">
          <div>
            <label className="bentham-label">Nome da terceirizada</label>
            <input
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              className="bentham-input"
              placeholder="Ex.: Empresa parceira"
            />
          </div>

          <div>
            <label className="bentham-label">Disciplina</label>
            <SearchableSelect
              value={disciplina}
              onChange={(e) => setDisciplina(e.target.value)}
              className="bentham-select"
            >
              <option value="">Selecionar</option>
              {disciplinas.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </SearchableSelect>
          </div>

          <button
            type="submit"
            disabled={loading || !nome.trim() || !disciplina.trim()}
            className="h-11 px-5 rounded-xl bg-[#F05D28] text-white text-[13px] font-bold hover:bg-[#D94E1F] transition-colors inline-flex items-center justify-center gap-2 disabled:opacity-70"
          >
            <Plus size={16} />
            Registrar
          </button>
        </form>

        <div className="space-y-4">
          {terceirizadas.length === 0 && (
            <p className="text-[13px] text-[#757575]">Nenhuma terceirizada cadastrada.</p>
          )}

          {terceirizadas.map((item) => (
            <details key={item.id} className="group border border-[#E5E7EB] rounded-2xl bg-[#F9FAFB] overflow-hidden">
              <summary className="min-h-[64px] px-5 py-3 flex items-center gap-3 cursor-pointer list-none hover:bg-white transition-colors [&::-webkit-details-marker]:hidden">
                <div className="w-10 h-10 rounded-full bg-[#F05D28]/10 flex items-center justify-center text-[#F05D28] font-bold text-sm shrink-0">
                  {getInitials(item.nome)}
                </div>

                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-bold text-[#2D2D2D] truncate">{item.nome}</p>
                  <p className="text-[12px] text-[#757575] truncate">{item.disciplina}</p>
                </div>

                <span className="inline-flex items-center px-2.5 py-1 rounded-full border border-[#E5E7EB] bg-white text-[#757575] text-[11px] font-bold shrink-0">
                  TERCEIRIZADA
                </span>

                {pendingIds.includes(item.id) && (
                  <span className="inline-flex items-center px-2.5 py-1 rounded-full border border-[#FED7AA] bg-[#FFF7ED] text-[#C2410C] text-[11px] font-bold shrink-0">
                    Alteracoes pendentes
                  </span>
                )}

                <ChevronRight size={20} className="shrink-0 text-[#757575] transition-transform group-open:rotate-90" />
              </summary>

              <div className="border-t border-[#E5E7EB] p-5">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
                  <div className="flex flex-col gap-1.5">
                    <label className="bentham-label">Disciplina</label>
                    <div className="h-11 px-3 rounded-xl border border-[#E5E7EB] bg-white flex items-center text-[13px] font-medium text-[#2D2D2D]">
                      {item.disciplina}
                    </div>
                  </div>

                  <div className="flex flex-col gap-2">
                    <label className="bentham-label">Ações</label>
                    <button
                      type="button"
                      onClick={() => void onDelete(item.id)}
                      className="h-11 px-4 rounded-xl bg-[#FEF2F2] text-[#B91C1C] border border-[#FECACA] text-[13px] font-bold hover:bg-[#FEE2E2] transition-colors inline-flex items-center justify-center gap-2 w-fit"
                    >
                      <Trash2 size={16} />
                      Excluir
                    </button>
                  </div>
                </div>
              </div>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
