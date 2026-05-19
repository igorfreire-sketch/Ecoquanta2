import React, { useEffect, useMemo, useState } from 'react';
import { ClipboardList, Pencil, Plus, Trash2 } from 'lucide-react';
import { deleteFirebaseDocument, isFirebaseConfigured, setFirebaseDocument } from '../lib/firebaseDb';

type PlanejamentoTecnicoProps = {
  preloadedData?: {
    registro?: any;
    admin?: any;
    planningTodos?: PlannedItem[];
  };
};

type PlannedItem = {
  id: string;
  contratoCodigo: string;
  contratoNome: string;
  osCodigo: string;
  osNome: string;
  atividadeCodigo: string;
  atividadeNome: string;
  disciplina: string;
  titulo: string;
  descricao: string;
  createdAt: string;
};

function createLocalId() {
  try {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  } catch {}
  return `planejamento-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export default function PlanejamentoTecnico({ preloadedData }: PlanejamentoTecnicoProps) {
  const contracts = Array.isArray(preloadedData?.registro?.contracts) ? preloadedData!.registro!.contracts : [];
  const osOptions = Array.isArray(preloadedData?.registro?.osOptions) ? preloadedData!.registro!.osOptions : [];
  const itemOptions = Array.isArray(preloadedData?.registro?.itemOptions) ? preloadedData!.registro!.itemOptions : [];
  const disciplinas = Array.isArray(preloadedData?.admin?.disciplinas) ? preloadedData!.admin!.disciplinas : [];
  const initialItems = useMemo(
    () => (Array.isArray(preloadedData?.planningTodos) ? preloadedData.planningTodos : []),
    [preloadedData?.planningTodos]
  );
  const initialItemIds = useMemo(() => new Set(initialItems.map((item) => item.id)), [initialItems]);
  const [items, setItems] = useState<PlannedItem[]>(initialItems);
  const [formData, setFormData] = useState({
    contratoCodigo: '',
    osCodigo: '',
    atividadeCodigo: '',
    disciplina: '',
    descricao: '',
  });
  const [editingId, setEditingId] = useState('');
  const [pendingUpserts, setPendingUpserts] = useState<Record<string, PlannedItem>>({});
  const [pendingDeletes, setPendingDeletes] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    setItems(initialItems);
    setPendingUpserts({});
    setPendingDeletes([]);
  }, [initialItems]);

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
  const filteredItems = useMemo(
    () => itemOptions.filter((item: any) => String(item?.osCodigo || item?.osCode || '') === formData.osCodigo),
    [formData.osCodigo, itemOptions]
  );
  const selectedItem = useMemo(
    () => filteredItems.find((item: any) => String(item?.codigo || item?.code || item?.id || '') === formData.atividadeCodigo),
    [filteredItems, formData.atividadeCodigo]
  );

  const resetForm = () => {
    setEditingId('');
    setFormData({
      contratoCodigo: '',
      osCodigo: '',
      atividadeCodigo: '',
      disciplina: '',
      descricao: '',
    });
  };

  const saveItem = () => {
    if (!formData.contratoCodigo || !formData.osCodigo || !formData.atividadeCodigo || !formData.disciplina || !formData.descricao.trim()) {
      setErrorMessage('Preencha contrato, OS, atividade, disciplina e descricao antes de adicionar.');
      return;
    }

    setErrorMessage('');
    const currentItem = items.find((item) => item.id === editingId);
    const nextItem: PlannedItem = {
      id: editingId || createLocalId(),
      contratoCodigo: formData.contratoCodigo,
      contratoNome: String(selectedContract?.nome || selectedContract?.codigo || ''),
      osCodigo: formData.osCodigo,
      osNome: String(selectedOs?.nome || selectedOs?.codigo || ''),
      atividadeCodigo: formData.atividadeCodigo,
      atividadeNome: String(selectedItem?.nome || selectedItem?.name || selectedItem?.codigo || ''),
      disciplina: formData.disciplina,
      titulo: String(selectedItem?.nome || selectedItem?.name || 'Atividade planejada'),
      descricao: formData.descricao.trim(),
      createdAt: currentItem?.createdAt || new Date().toISOString(),
    };

    setItems((prev) => {
      const hasItem = prev.some((item) => item.id === nextItem.id);
      if (hasItem) return prev.map((item) => (item.id === nextItem.id ? nextItem : item));
      return [nextItem, ...prev];
    });
    setPendingUpserts((prev) => ({ ...prev, [nextItem.id]: nextItem }));
    setPendingDeletes((prev) => prev.filter((id) => id !== nextItem.id));
    resetForm();
  };

  const removeItem = (id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
    setPendingUpserts((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setPendingDeletes((prev) => {
      if (!initialItemIds.has(id) || prev.includes(id)) return prev;
      return [...prev, id];
    });
    if (editingId === id) resetForm();
    setErrorMessage('');
  };

  const editItem = (item: PlannedItem) => {
    setEditingId(item.id);
    setFormData({
      contratoCodigo: item.contratoCodigo,
      osCodigo: item.osCodigo,
      atividadeCodigo: item.atividadeCodigo || '',
      disciplina: item.disciplina,
      descricao: item.descricao,
    });
    setErrorMessage('');
  };

  const pendingChangesCount = Object.keys(pendingUpserts).length + pendingDeletes.length;

  const submitPendingChanges = async () => {
    if (pendingChangesCount === 0) return;
    if (!isFirebaseConfigured()) {
      setErrorMessage('Firebase nao configurado para salvar o planejamento tecnico.');
      return;
    }

    setIsSaving(true);
    setErrorMessage('');
    try {
      const upserts = Object.values(pendingUpserts) as PlannedItem[];
      await Promise.all([
        ...pendingDeletes.map((id) => deleteFirebaseDocument('planningTodos', id)),
        ...upserts.map((item) => setFirebaseDocument('planningTodos', item.id, item)),
      ]);
      setPendingUpserts({});
      setPendingDeletes([]);
    } catch (error) {
      console.error('Erro ao enviar itens do planejamento tecnico:', error);
      setErrorMessage('Nao foi possivel salvar no Firebase. Tente novamente.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6 font-['Montserrat']">
      <section className="rounded-[24px] border border-[#D1FAE5] bg-white p-6 shadow-sm">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-[#ECFDF5] px-3 py-1 text-[11px] font-black uppercase tracking-[1px] text-[#047857]">
              <ClipboardList size={14} />
              Planejamento Tecnico
            </div>
            <h2 className="mt-3 text-[22px] font-black text-[#111827]">Itens planejados por atividade</h2>
            <p className="mt-1 text-[13px] text-[#64748B]">
              Selecione contrato, OS, atividade e disciplina para orientar o que cada equipe deve executar no Registro de Atividades.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div>
            <label className="text-[10px] font-black uppercase tracking-[1px] text-[#64748B]">Contrato</label>
            <select
              className="mt-1 h-11 w-full rounded-xl border border-[#E5E7EB] bg-[#F8FAFC] px-3 text-[13px] outline-none focus:border-[#10B981]"
              value={formData.contratoCodigo}
              onChange={(event) => setFormData((prev) => ({ ...prev, contratoCodigo: event.target.value, osCodigo: '', atividadeCodigo: '' }))}
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
              onChange={(event) => setFormData((prev) => ({ ...prev, osCodigo: event.target.value, atividadeCodigo: '' }))}
            >
              <option value="">{formData.contratoCodigo ? 'Selecione...' : 'Aguardando contrato...'}</option>
              {filteredOs.map((item: any) => (
                <option key={item.codigo} value={item.codigo}>{item.nome || item.codigo}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-[10px] font-black uppercase tracking-[1px] text-[#64748B]">Atividade</label>
            <select
              className="mt-1 h-11 w-full rounded-xl border border-[#E5E7EB] bg-[#F8FAFC] px-3 text-[13px] outline-none focus:border-[#10B981]"
              value={formData.atividadeCodigo}
              onChange={(event) => setFormData((prev) => ({ ...prev, atividadeCodigo: event.target.value }))}
            >
              <option value="">{formData.osCodigo ? 'Selecione...' : 'Aguardando OS...'}</option>
              {filteredItems.map((item: any) => {
                const code = String(item?.codigo || item?.code || item?.id || '');
                const nome = String(item?.nome || item?.name || code);
                return <option key={code} value={code}>{code} - {nome}</option>;
              })}
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
            disabled={isSaving || !formData.contratoCodigo || !formData.osCodigo || !formData.atividadeCodigo || !formData.disciplina || !formData.descricao.trim()}
            className="inline-flex h-12 items-center justify-center gap-2 self-end rounded-xl bg-[#10B981] px-5 text-[13px] font-black text-white transition hover:bg-[#059669] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Plus size={16} />
            {editingId ? 'Atualizar localmente' : 'Adicionar'}
          </button>
        </div>

        {errorMessage && (
          <div className="mt-4 rounded-xl border border-[#FECACA] bg-[#FEF2F2] px-4 py-3 text-[13px] font-medium text-[#B91C1C]">
            {errorMessage}
          </div>
        )}
      </section>

      <section className="rounded-[24px] border border-[#E5E7EB] bg-white p-5 shadow-sm">
        <h3 className="text-[15px] font-black text-[#111827]">Itens cadastrados nao iniciados</h3>
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
                  <div className="text-[12px] font-semibold text-[#64748B]">{item.disciplina}</div>
                  <div className="mt-1 text-[15px] font-black text-[#111827]">{item.osNome || item.osCodigo}</div>
                  <div className="mt-1 text-[14px] font-semibold text-[#047857]">{item.atividadeNome || item.titulo}</div>
                  <div className="mt-1 text-[12px] font-semibold text-[#64748B]">{item.contratoCodigo}</div>
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

      {pendingChangesCount > 0 && (
        <div className="fixed bottom-6 right-6 z-[90] flex items-center gap-3 rounded-2xl border border-[#FED7AA] bg-white px-4 py-3 shadow-[0_18px_50px_rgba(240,93,40,0.18)]">
          <div>
            <div className="text-[11px] font-black uppercase tracking-[1px] text-[#C2410C]">Planejamento tecnico</div>
            <div className="text-[13px] font-semibold text-[#9A3412]">{pendingChangesCount} alteracao(oes) aguardando envio</div>
          </div>
          <button
            type="button"
            onClick={() => void submitPendingChanges()}
            disabled={isSaving}
            className="h-14 px-6 bg-[#F05D28] text-white rounded-2xl font-bold flex items-center justify-center gap-2 hover:opacity-90 active:scale-[0.98] transition-all shadow-xl shadow-[#F05D28]/25 disabled:opacity-70"
          >
            {isSaving ? 'Enviando...' : `Enviar informacoes (${pendingChangesCount})`}
          </button>
        </div>
      )}
    </div>
  );
}
