import React, { useMemo, useState } from 'react';
import { ClipboardList, Pencil, Plus, Trash2 } from 'lucide-react';

const PLANNING_TODOS_STORAGE_KEY = 'quanta_planejamento_tecnico_itens';

type PlanejamentoTecnicoProps = {
  preloadedData?: {
    registro?: any;
    admin?: any;
  };
};

type PlannedItem = {
  id: string;
  contratoCodigo: string;
  contratoNome: string;
  osCodigo: string;
  osNome: string;
  disciplina: string;
  titulo: string;
  descricao: string;
  createdAt: string;
};

function readPlannedItems(): PlannedItem[] {
  try {
    const raw = localStorage.getItem(PLANNING_TODOS_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writePlannedItems(items: PlannedItem[]) {
  localStorage.setItem(PLANNING_TODOS_STORAGE_KEY, JSON.stringify(items));
}

function createLocalId() {
  try {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  } catch {}
  return `planejamento-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export default function PlanejamentoTecnico({ preloadedData }: PlanejamentoTecnicoProps) {
  const contracts = Array.isArray(preloadedData?.registro?.contracts) ? preloadedData!.registro!.contracts : [];
  const osOptions = Array.isArray(preloadedData?.registro?.osOptions) ? preloadedData!.registro!.osOptions : [];
  const disciplinas = Array.isArray(preloadedData?.admin?.disciplinas) ? preloadedData!.admin!.disciplinas : [];

  const [items, setItems] = useState<PlannedItem[]>(() => readPlannedItems());
  const [formData, setFormData] = useState({
    contratoCodigo: '',
    osCodigo: '',
    disciplina: '',
    descricao: '',
  });
  const [editingId, setEditingId] = useState('');

  const selectedContract = useMemo(
    () => contracts.find((item: any) => String(item?.codigo || '') === formData.contratoCodigo),
    [contracts, formData.contratoCodigo]
  );
  const filteredOs = useMemo(
    () => osOptions.filter((item: any) => String(item?.contratoCodigo || '') === formData.contratoCodigo),
    [formData.contratoCodigo, osOptions]
  );
  const selectedOs = useMemo(
    () => filteredOs.find((item: any) => String(item?.codigo || '') === formData.osCodigo),
    [filteredOs, formData.osCodigo]
  );

  const saveItems = (nextItems: PlannedItem[]) => {
    setItems(nextItems);
    writePlannedItems(nextItems);
  };

  const saveItem = () => {
    if (!formData.contratoCodigo || !formData.osCodigo || !formData.disciplina || !formData.descricao.trim()) return;
    const nextItem: PlannedItem = {
      id: editingId || createLocalId(),
      contratoCodigo: formData.contratoCodigo,
      contratoNome: String(selectedContract?.nome || selectedContract?.codigo || ''),
      osCodigo: formData.osCodigo,
      osNome: String(selectedOs?.nome || selectedOs?.codigo || ''),
      disciplina: formData.disciplina,
      titulo: `Detalhes da disciplina - ${formData.disciplina}`,
      descricao: formData.descricao.trim(),
      createdAt: items.find((item) => item.id === editingId)?.createdAt || new Date().toISOString(),
    };
    const nextItems = editingId
      ? items.map((item) => (item.id === editingId ? nextItem : item))
      : [nextItem, ...items];
    saveItems(nextItems);
    setEditingId('');
    setFormData((prev) => ({ ...prev, descricao: '' }));
  };

  const removeItem = (id: string) => {
    saveItems(items.filter((item) => item.id !== id));
  };

  const editItem = (item: PlannedItem) => {
    setEditingId(item.id);
    setFormData({
      contratoCodigo: item.contratoCodigo,
      osCodigo: item.osCodigo,
      disciplina: item.disciplina,
      descricao: item.descricao,
    });
  };

  return (
    <div className="space-y-6 font-['Montserrat']">
      <section className="rounded-[24px] border border-[#D1FAE5] bg-white p-6 shadow-sm">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-[#ECFDF5] px-3 py-1 text-[11px] font-black uppercase tracking-[1px] text-[#047857]">
              <ClipboardList size={14} />
              Planejamento Técnico
            </div>
            <h2 className="mt-3 text-[22px] font-black text-[#111827]">Itens planejados por disciplina</h2>
            <p className="mt-1 text-[13px] text-[#64748B]">
              Selecione contrato, OS e disciplina para orientar o que cada equipe deve executar no Registro de Atividades.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div>
            <label className="text-[10px] font-black uppercase tracking-[1px] text-[#64748B]">Contrato</label>
            <select
              className="mt-1 h-11 w-full rounded-xl border border-[#E5E7EB] bg-[#F8FAFC] px-3 text-[13px] outline-none focus:border-[#10B981]"
              value={formData.contratoCodigo}
              onChange={(event) => setFormData((prev) => ({ ...prev, contratoCodigo: event.target.value, osCodigo: '' }))}
            >
              <option value="">Selecione...</option>
              {contracts.map((item: any) => (
                <option key={item.codigo} value={item.codigo}>{item.codigo} - {item.nome}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-[10px] font-black uppercase tracking-[1px] text-[#64748B]">OS</label>
            <select
              className="mt-1 h-11 w-full rounded-xl border border-[#E5E7EB] bg-[#F8FAFC] px-3 text-[13px] outline-none focus:border-[#10B981]"
              value={formData.osCodigo}
              onChange={(event) => setFormData((prev) => ({ ...prev, osCodigo: event.target.value }))}
            >
              <option value="">{formData.contratoCodigo ? 'Selecione...' : 'Aguardando contrato...'}</option>
              {filteredOs.map((item: any) => (
                <option key={item.codigo} value={item.codigo}>{item.nome || item.codigo}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-[10px] font-black uppercase tracking-[1px] text-[#64748B]">Disciplina</label>
            <select
              className="mt-1 h-11 w-full rounded-xl border border-[#E5E7EB] bg-[#F8FAFC] px-3 text-[13px] outline-none focus:border-[#10B981]"
              value={formData.disciplina}
              onChange={(event) => setFormData((prev) => ({ ...prev, disciplina: event.target.value }))}
            >
              <option value="">Selecione...</option>
              {disciplinas.map((disciplina: string) => (
                <option key={disciplina} value={disciplina}>{disciplina}</option>
              ))}
            </select>
          </div>

        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[1fr_auto]">
          <textarea
            className="min-h-[96px] rounded-xl border border-[#E5E7EB] bg-[#F8FAFC] px-3 py-3 text-[13px] outline-none focus:border-[#10B981]"
            value={formData.descricao}
            onChange={(event) => setFormData((prev) => ({ ...prev, descricao: event.target.value }))}
            placeholder="Detalhes da disciplina: descreva tudo que essa disciplina deve fazer..."
          />
          <button
            type="button"
            onClick={saveItem}
            disabled={!formData.contratoCodigo || !formData.osCodigo || !formData.disciplina || !formData.descricao.trim()}
            className="inline-flex h-12 items-center justify-center gap-2 self-end rounded-xl bg-[#10B981] px-5 text-[13px] font-black text-white transition hover:bg-[#059669] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Plus size={16} />
            {editingId ? 'Salvar edição' : 'Adicionar'}
          </button>
        </div>
      </section>

      <section className="rounded-[24px] border border-[#E5E7EB] bg-white p-5 shadow-sm">
        <h3 className="text-[15px] font-black text-[#111827]">Itens cadastrados não iniciados</h3>
        <div className="mt-4 space-y-3">
          {items.length === 0 && (
            <div className="rounded-2xl border border-dashed border-[#CBD5E1] bg-[#F8FAFC] p-6 text-[13px] text-[#64748B]">
              Nenhum item planejado cadastrado ainda.
            </div>
          )}
          {items.map((item) => (
            <div key={item.id} className="rounded-2xl border border-[#E5E7EB] bg-[#F8FAFC] p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-[13px] font-black text-[#047857]">{item.disciplina}</div>
                  <div className="mt-1 text-[15px] font-black text-[#111827]">{item.titulo}</div>
                  <div className="mt-1 text-[12px] font-semibold text-[#64748B]">{item.contratoCodigo} - {item.osNome || item.osCodigo}</div>
                  {item.descricao && <p className="mt-2 text-[13px] leading-relaxed text-[#475569]">{item.descricao}</p>}
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => editItem(item)}
                    className="rounded-xl border border-[#BFDBFE] bg-white p-2 text-[#2563EB] transition hover:bg-[#EFF6FF]"
                    aria-label="Editar item planejado"
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    type="button"
                    onClick={() => removeItem(item.id)}
                    className="rounded-xl border border-[#FECACA] bg-white p-2 text-[#DC2626] transition hover:bg-[#FEF2F2]"
                    aria-label="Excluir item planejado"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
