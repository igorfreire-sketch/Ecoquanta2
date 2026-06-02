import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  MessageSquareText,
  Search,
  Send,
  Siren,
  X,
} from 'lucide-react';
import type { AuthUser } from './LoginScreen';
import {
  addEmergencyMessage,
  createEmergency,
  fetchEmergencyData,
  getEmergencyUnreadCount,
  isEmergencyUnreadForSector,
  markEmergencyRead,
  type EmergencyPayload,
} from '../lib/emergenciaApi';

type ActiveActivity = {
  id: string;
  contratoCodigo: string;
  contratoNome: string;
  osCodigo: string;
  osNome: string;
  itemCodigo: string;
  itemNome: string;
  descricao: string;
  setor: string;
  disciplina: string;
  status: string;
};

interface EmergenciaCenterProps {
  currentUser: AuthUser;
  preloadedData?: {
    registro?: any;
    cronograma?: any;
    admin?: any;
  };
  activeContractCode?: string;
  lockedContractCode?: string;
  onDataChange?: () => void;
}

function normalizeText(value?: string) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function formatDateTime(value?: string) {
  const parsed = new Date(String(value || '').trim());
  if (Number.isNaN(parsed.getTime())) return 'Agora';
  return parsed.toLocaleString('pt-BR');
}

function isHierarchyCode(value?: string) {
  return /^\d+(?:\.\d+)+$/.test(String(value || '').trim());
}

function getOsDisplayName(item: Pick<ActiveActivity, 'osCodigo' | 'osNome'> | Pick<EmergencyPayload['emergencies'][number], 'osCodigo' | 'osNome'>) {
  const osNome = String(item.osNome || '').trim();
  const osCodigo = String(item.osCodigo || '').trim();
  if (osNome && !isHierarchyCode(osNome)) return osNome;
  if (osCodigo && !isHierarchyCode(osCodigo)) return osCodigo;
  return osNome || 'Sem OS';
}

function getActivityDisplayName(item: Pick<ActiveActivity, 'itemCodigo' | 'itemNome' | 'descricao'> | Pick<EmergencyPayload['emergencies'][number], 'itemCodigo' | 'itemNome'>) {
  const itemNome = String(item.itemNome || '').trim();
  if (itemNome && !isHierarchyCode(itemNome)) return itemNome;
  const descricao = 'descricao' in item ? String(item.descricao || '').trim() : '';
  if (descricao && !isHierarchyCode(descricao)) return descricao;
  return 'Atividade sem nome';
}

function buildActivities(preloadedData?: EmergenciaCenterProps['preloadedData']) {
  const registro = preloadedData?.registro || {};
  const source = [
    ...(Array.isArray(registro.activitiesList) ? registro.activitiesList : []),
    ...(Array.isArray(registro.activeActivities) ? registro.activeActivities : []),
  ];

  const seen = new Set<string>();

  return source
    .filter((item: any) => normalizeText(item?.status) !== 'concluida')
    .map((item: any, index: number): ActiveActivity => ({
      id: String(item?.activityId || item?.id || `${item?.itemCodigo || 'atividade'}-${index}`).trim(),
      contratoCodigo: String(item?.contratoCodigo || '').trim(),
      contratoNome: String(item?.contratoNome || item?.contratoCodigo || '').trim(),
      osCodigo: String(item?.osCodigo || item?.os || '').trim(),
      osNome: String(item?.osNome || item?.osCodigo || '').trim(),
      itemCodigo: String(item?.itemCodigo || '').trim(),
      itemNome: String(item?.itemNome || item?.descricao || '').trim(),
      descricao: String(item?.descricao || '').trim(),
      setor: String(item?.setor || item?.criadoPorDisciplina || item?.disciplina || '').trim(),
      disciplina: String(item?.criadoPorDisciplina || item?.disciplina || item?.setor || '').trim(),
      status: String(item?.status || '').trim(),
    }))
    .filter((item) => {
      if (!item.id || seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });
}

function buildSectorOptions(preloadedData: EmergenciaCenterProps['preloadedData'], currentUser: AuthUser, activities: ActiveActivity[]) {
  const fromAdmin = Array.isArray(preloadedData?.admin?.disciplinas) ? preloadedData?.admin?.disciplinas : [];
  const fromActivities = activities.map((item) => item.setor);
  return Array.from(new Set([...fromAdmin, ...fromActivities, currentUser.disciplina].map((item) => String(item || '').trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b));
}

function getUnreadEmergencyIds(data: EmergencyPayload, sector: string) {
  return data.emergencies
    .filter((item) => isEmergencyUnreadForSector(item, data.readMarkers, sector))
    .map((item) => item.id);
}

const emptyEmergencyData: EmergencyPayload = {
  emergencies: [],
  messagesByEmergency: {},
  readMarkers: {},
};

export default function EmergenciaCenter({
  currentUser,
  preloadedData,
  activeContractCode,
  lockedContractCode,
  onDataChange,
}: EmergenciaCenterProps) {
  const [data, setData] = useState<EmergencyPayload>(emptyEmergencyData);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [selectedContract, setSelectedContract] = useState(String(lockedContractCode || activeContractCode || '').trim());
  const [selectedOs, setSelectedOs] = useState('');
  const [selectedDisciplina, setSelectedDisciplina] = useState('');
  const [selectedEmergencyId, setSelectedEmergencyId] = useState('');
  const [messageDraft, setMessageDraft] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedActivity, setSelectedActivity] = useState<ActiveActivity | null>(null);
  const [observationDraft, setObservationDraft] = useState('');
  const [selectedSectors, setSelectedSectors] = useState<string[]>([]);
  const [feedback, setFeedback] = useState('');

  const activities = useMemo(() => buildActivities(preloadedData), [preloadedData]);
  const sectorOptions = useMemo(
    () => buildSectorOptions(preloadedData, currentUser, activities),
    [activities, currentUser, preloadedData]
  );

  useEffect(() => {
    if (lockedContractCode) {
      setSelectedContract(String(lockedContractCode).trim());
    }
  }, [lockedContractCode]);

  useEffect(() => {
    setSelectedOs('');
  }, [selectedContract]);

  const loadData = async () => {
    setLoading(true);
    try {
      const next = await fetchEmergencyData();
      setData(next);
      setSelectedEmergencyId((prev) => prev || next.emergencies[0]?.id || '');
      setFeedback('');
      onDataChange?.();
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Falha ao carregar emergencias.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const filteredActivities = useMemo(() => {
    const normalizedSearch = normalizeText(searchText);
    return activities.filter((item) => {
      const matchesContract = !selectedContract || item.contratoCodigo === selectedContract;
      const matchesOs = !selectedOs || item.osCodigo === selectedOs;
      const matchesDisciplina = !selectedDisciplina || item.disciplina === selectedDisciplina;
      if (!matchesContract) return false;
      if (!matchesOs) return false;
      if (!matchesDisciplina) return false;
      if (!normalizedSearch) return true;
      return [item.contratoCodigo, item.contratoNome, item.osCodigo, item.osNome, item.itemCodigo, item.itemNome, item.descricao, item.disciplina]
        .some((value) => normalizeText(value).includes(normalizedSearch));
    });
  }, [activities, searchText, selectedContract, selectedOs, selectedDisciplina]);

  const osOptions = useMemo(() => {
    return Array.from(new Set(
      activities
        .filter((item) => !selectedContract || item.contratoCodigo === selectedContract)
        .map((item) => item.osCodigo)
        .filter(Boolean)
    ));
  }, [activities, selectedContract]);

  const disciplinaOptions = useMemo(() => {
    return Array.from<string>(new Set(activities.map((item) => String(item.disciplina || '')).filter(Boolean))).sort((a, b) => a.localeCompare(b));
  }, [activities]);

  const emergencies = useMemo(() => {
    const normalizedSearch = normalizeText(searchText);
    return [...data.emergencies]
      .filter((item) => !selectedContract || item.contratoCodigo === selectedContract)
      .filter((item) => {
        if (!normalizedSearch) return true;
        return [item.contratoCodigo, item.contratoNome, item.osCodigo, item.osNome, item.itemCodigo, item.itemNome, item.initialObservation]
          .some((value) => normalizeText(value).includes(normalizedSearch));
      })
      .sort((a, b) => new Date(b.lastUpdatedAt || b.createdAt).getTime() - new Date(a.lastUpdatedAt || a.createdAt).getTime());
  }, [data.emergencies, searchText, selectedContract]);

  const selectedEmergency = emergencies.find((item) => item.id === selectedEmergencyId) || emergencies[0] || null;
  const selectedMessages = selectedEmergency ? data.messagesByEmergency[selectedEmergency.id] || [] : [];
  const unreadCount = getEmergencyUnreadCount(data, currentUser.disciplina);
  const unreadIds = useMemo(() => new Set(getUnreadEmergencyIds(data, currentUser.disciplina)), [data, currentUser.disciplina]);

  useEffect(() => {
    if (!selectedEmergencyId && emergencies[0]?.id) {
      setSelectedEmergencyId(emergencies[0].id);
    }
  }, [emergencies, selectedEmergencyId]);

  useEffect(() => {
    if (!selectedEmergency) return;
    if (!isEmergencyUnreadForSector(selectedEmergency, data.readMarkers, currentUser.disciplina)) return;

    void markEmergencyRead({
      emergencyId: selectedEmergency.id,
      sector: currentUser.disciplina,
      userEmail: currentUser.email,
    }).then(() => loadData()).catch(() => {});
  }, [selectedEmergency?.id]);

  const openModal = (activity: ActiveActivity) => {
    setSelectedActivity(activity);
    setObservationDraft('');
    setSelectedSectors(currentUser.disciplina ? [currentUser.disciplina] : []);
    setModalOpen(true);
  };

  const handleCreateEmergency = async () => {
    if (!selectedActivity) return;
    if (observationDraft.trim().length < 10) {
      setFeedback('Descreva a emergencia com pelo menos 10 caracteres.');
      return;
    }
    if (selectedSectors.length === 0) {
      setFeedback('Selecione ao menos um setor para notificar.');
      return;
    }

    setSaving(true);
    try {
      await createEmergency({
        userEmail: currentUser.email,
        userName: currentUser.nome,
        userSector: currentUser.disciplina,
        activityId: selectedActivity.id,
        contratoCodigo: selectedActivity.contratoCodigo,
        contratoNome: selectedActivity.contratoNome,
        osCodigo: selectedActivity.osCodigo,
        osNome: selectedActivity.osNome,
        itemCodigo: selectedActivity.itemCodigo,
        itemNome: selectedActivity.itemNome,
        observation: observationDraft.trim(),
        notifiedSectors: selectedSectors,
      });
      setModalOpen(false);
      setFeedback('Atividade aberta com sucesso.');
      await loadData();
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Falha ao abrir atividade.');
    } finally {
      setSaving(false);
    }
  };

  const handleSendMessage = async () => {
    if (!selectedEmergency) return;
    if (messageDraft.trim().length < 3) return;

    setSaving(true);
    try {
      await addEmergencyMessage({
        emergencyId: selectedEmergency.id,
        userEmail: currentUser.email,
        userName: currentUser.nome,
        userSector: currentUser.disciplina,
        message: messageDraft.trim(),
      });
      setMessageDraft('');
      await loadData();
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Falha ao enviar mensagem.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 font-['Montserrat']">
      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,1.55fr)_340px]">
        <section className="rounded-[28px] border border-[#E5E7EB] bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-5">
            <div className="flex flex-col gap-2">
              <h3 className="text-[22px] font-black leading-tight text-[#111827]">Atividades em execucao</h3>
              <p className="text-[13px] text-[#6B7280]">Filtre contrato, OS e disciplina para localizar rapidamente o que precisa virar chamado.</p>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 2xl:grid-cols-[minmax(0,1.2fr)_minmax(180px,0.7fr)_minmax(180px,0.7fr)_minmax(210px,0.8fr)]">
              <div className="relative">
                <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#9CA3AF]" />
                <input
                  value={searchText}
                  onChange={(event) => setSearchText(event.target.value)}
                  placeholder="Pesquisar atividade, OS ou contrato..."
                  className="h-11 w-full rounded-2xl border border-[#E5E7EB] bg-[#F9FAFB] pl-10 pr-4 text-[13px] outline-none focus:border-[#F05D28]"
                />
              </div>
              <select
                value={selectedContract}
                onChange={(event) => setSelectedContract(event.target.value)}
                disabled={Boolean(lockedContractCode)}
                className="h-11 rounded-2xl border border-[#E5E7EB] bg-[#F9FAFB] px-4 text-[13px] outline-none focus:border-[#F05D28] disabled:bg-[#F3F4F6]"
              >
                <option value="">Todos os contratos</option>
                {Array.from(new Set(activities.map((item) => item.contratoCodigo))).filter(Boolean).map((contractCode) => {
                  const activity = activities.find((item) => item.contratoCodigo === contractCode);
                  return (
                    <option key={contractCode} value={contractCode}>
                      {contractCode} - {activity?.contratoNome || contractCode}
                    </option>
                  );
                })}
              </select>
              <select
                value={selectedOs}
                onChange={(event) => setSelectedOs(event.target.value)}
                className="h-11 rounded-2xl border border-[#E5E7EB] bg-[#F9FAFB] px-4 text-[13px] outline-none focus:border-[#F05D28]"
              >
                <option value="">Todas as OS</option>
                {osOptions.map((osCode) => {
                  const activity = activities.find((item) => item.osCodigo === osCode);
                  return (
                    <option key={osCode} value={osCode}>
                      {osCode} - {activity?.osNome || osCode}
                    </option>
                  );
                })}
              </select>
              <select
                value={selectedDisciplina}
                onChange={(event) => setSelectedDisciplina(event.target.value)}
                className="h-11 rounded-2xl border border-[#E5E7EB] bg-[#F9FAFB] px-4 text-[13px] outline-none focus:border-[#F05D28]"
              >
                <option value="">Todas as disciplinas</option>
                {disciplinaOptions.map((disciplina) => (
                  <option key={disciplina} value={disciplina}>
                    {disciplina}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="mt-6 overflow-hidden rounded-[24px] border border-[#E8EEF5]">
            <div className="hidden grid-cols-[minmax(180px,1fr)_130px_150px_minmax(260px,1.2fr)_120px] gap-4 bg-[#F8FAFC] px-5 py-4 text-[11px] font-black uppercase tracking-[1.3px] text-[#64748B] lg:grid">
              <span>Contrato / OS</span>
              <span>Codigo</span>
              <span>Disciplina</span>
              <span>Atividade</span>
              <span className="text-right">Acao</span>
            </div>

            <div className="bg-white">
              {loading && <div className="px-5 py-10 text-[13px] text-[#6B7280]">Carregando atividades...</div>}
              {!loading && filteredActivities.length === 0 && <div className="px-5 py-10 text-[13px] text-[#6B7280]">Nenhuma atividade em execucao encontrada.</div>}
              {filteredActivities.map((activity) => (
                <div key={activity.id} className="border-t border-[#F1F5F9] px-5 py-4 first:border-t-0">
                  <div className="hidden grid-cols-[minmax(180px,1fr)_130px_150px_minmax(260px,1.2fr)_120px] items-center gap-4 lg:grid">
                    <div>
                      <div className="font-bold text-[#0F172A]">{activity.contratoCodigo}</div>
                      <div className="mt-1 text-[12px] text-[#64748B]">{activity.osCodigo} - {activity.osNome}</div>
                    </div>
                    <div className="font-semibold text-[#334155]">{activity.itemCodigo || '-'}</div>
                    <div className="font-semibold text-[#334155]">{activity.disciplina || activity.setor || '-'}</div>
                    <div>
                      <div className="font-semibold text-[#0F172A]">{activity.itemNome || 'Atividade sem nome'}</div>
                      <div className="mt-1 text-[12px] text-[#64748B] line-clamp-2">{activity.descricao || 'Sem descricao complementar.'}</div>
                    </div>
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={() => openModal(activity)}
                        className="inline-flex h-10 items-center gap-2 rounded-2xl bg-[#DC2626] px-4 text-[12px] font-black text-white transition hover:bg-[#B91C1C]"
                      >
                        <AlertTriangle size={14} />
                        Abrir
                      </button>
                    </div>
                  </div>

                  <div className="space-y-3 lg:hidden">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="font-bold text-[#0F172A]">{activity.itemNome || 'Atividade sem nome'}</div>
                        <div className="mt-1 text-[12px] text-[#64748B]">{activity.contratoCodigo} • {activity.osCodigo}</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => openModal(activity)}
                        className="inline-flex h-9 shrink-0 items-center gap-2 rounded-2xl bg-[#DC2626] px-3 text-[12px] font-black text-white"
                      >
                        <AlertTriangle size={13} />
                        Abrir
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-[12px] text-[#475569]">
                      <div><span className="font-black text-[#111827]">Codigo:</span> {activity.itemCodigo || '-'}</div>
                      <div><span className="font-black text-[#111827]">Disciplina:</span> {activity.disciplina || activity.setor || '-'}</div>
                    </div>
                    <div className="text-[12px] leading-relaxed text-[#64748B]">{activity.descricao || 'Sem descricao complementar.'}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="rounded-[28px] border border-[#E5E7EB] bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-3">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-[22px] font-black leading-tight text-[#111827]">Chamados abertos</h3>
                <p className="mt-1 text-[13px] text-[#6B7280]">Conversa compartilhada entre todos os setores envolvidos.</p>
              </div>
              <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[12px] font-black ${unreadCount > 0 ? 'border-[#FECACA] bg-[#FFF1F2] text-[#DC2626]' : 'border-[#E5E7EB] bg-[#F8FAFC] text-[#6B7280]'}`}>
                <Siren size={13} className={unreadCount > 0 ? 'animate-pulse' : ''} />
                {unreadCount}
              </div>
            </div>

            <div className="max-h-[260px] space-y-3 overflow-y-auto pr-1">
              {emergencies.length === 0 && <div className="rounded-2xl border border-dashed border-[#D1D5DB] px-4 py-6 text-[13px] text-[#6B7280]">Nenhum chamado aberto.</div>}
              {emergencies.map((emergency) => {
                const unread = unreadIds.has(emergency.id);
                return (
                  <button
                    key={emergency.id}
                    type="button"
                    onClick={() => setSelectedEmergencyId(emergency.id)}
                    className={`w-full rounded-2xl border p-4 text-left transition ${selectedEmergency?.id === emergency.id ? 'border-[#F05D28] bg-[#FFF7ED]' : 'border-[#E5E7EB] bg-white hover:border-[#FDBA74]'}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-[13px] font-black text-[#111827]">{emergency.itemNome || emergency.itemCodigo}</span>
                          {unread && <span className="inline-flex h-2.5 w-2.5 animate-pulse rounded-full bg-[#DC2626]" />}
                        </div>
                        <p className="mt-1 text-[12px] text-[#64748B]">{emergency.contratoCodigo} - {emergency.osCodigo}</p>
                      </div>
                      <span className="rounded-full bg-[#FEF2F2] px-2 py-1 text-[10px] font-black uppercase tracking-[1px] text-[#B91C1C]">
                        {emergency.notifiedSectors.length} setor(es)
                      </span>
                    </div>
                    <p className="mt-3 line-clamp-2 text-[12px] text-[#475569]">{emergency.initialObservation}</p>
                  </button>
                );
              })}
            </div>

            <div className="rounded-3xl border border-[#EEF2F7] bg-[#F8FAFC] p-4">
              {!selectedEmergency && <div className="text-[13px] text-[#6B7280]">Selecione um chamado para visualizar o chat.</div>}

              {selectedEmergency && (
                <>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-[15px] font-black text-[#111827]">{selectedEmergency.itemNome || selectedEmergency.itemCodigo}</div>
                      <div className="mt-1 text-[12px] text-[#64748B]">{selectedEmergency.contratoCodigo} - {selectedEmergency.osCodigo}</div>
                    </div>
                    <span className="rounded-full bg-white px-3 py-1 text-[10px] font-black uppercase tracking-[1px] text-[#B91C1C] shadow-sm">
                      {selectedEmergency.notifiedSectors.join(', ')}
                    </span>
                  </div>

                  <div className="mt-4 max-h-[260px] space-y-3 overflow-y-auto pr-1">
                    {selectedMessages.map((message) => (
                      <div key={message.id} className="rounded-2xl bg-white p-3 shadow-sm">
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-[12px] font-black text-[#111827]">{message.authorName}</div>
                          <div className="text-[11px] text-[#64748B]">{formatDateTime(message.createdAt)}</div>
                        </div>
                        <div className="mt-1 text-[11px] font-bold uppercase tracking-[1px] text-[#F05D28]">{message.authorSector || 'Sem setor'}</div>
                        <p className="mt-2 text-[13px] leading-relaxed text-[#334155]">{message.message}</p>
                      </div>
                    ))}
                  </div>

                  <div className="mt-4 flex gap-3">
                    <textarea
                      value={messageDraft}
                      onChange={(event) => setMessageDraft(event.target.value)}
                      placeholder="Registrar nova observacao para todos os setores..."
                      className="min-h-[88px] flex-1 rounded-2xl border border-[#E5E7EB] bg-white px-4 py-3 text-[13px] outline-none focus:border-[#F05D28]"
                    />
                    <button
                      type="button"
                      onClick={() => void handleSendMessage()}
                      disabled={saving || messageDraft.trim().length < 3}
                      className="inline-flex h-[88px] w-14 items-center justify-center rounded-2xl bg-[#F05D28] text-white transition hover:opacity-90 disabled:opacity-50"
                    >
                      <Send size={18} />
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </section>
      </div>

      {feedback && (
        <div className="rounded-2xl border border-[#FDE68A] bg-[#FFFBEB] px-4 py-3 text-[13px] font-medium text-[#92400E]">
          {feedback}
        </div>
      )}

      {modalOpen && selectedActivity && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0F172A]/55 p-6">
          <div className="w-full max-w-2xl rounded-[28px] bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-[11px] font-black uppercase tracking-[1.4px] text-[#DC2626]">Abrir atividade</div>
                <h3 className="mt-2 text-[20px] font-black text-[#111827]">{selectedActivity.itemNome || selectedActivity.itemCodigo}</h3>
                <p className="mt-1 text-[13px] text-[#64748B]">{selectedActivity.contratoCodigo} - {selectedActivity.osCodigo}</p>
              </div>
              <button type="button" onClick={() => setModalOpen(false)} className="rounded-full p-2 text-[#6B7280] transition hover:bg-[#F3F4F6]">
                <X size={18} />
              </button>
            </div>

            <div className="mt-5">
              <label className="text-[12px] font-black uppercase tracking-[1px] text-[#475569]">Observacao</label>
              <textarea
                value={observationDraft}
                onChange={(event) => setObservationDraft(event.target.value)}
                placeholder="Descreva o ocorrido, impacto e urgencia para os setores envolvidos."
                className="mt-2 min-h-[120px] w-full rounded-2xl border border-[#E5E7EB] px-4 py-3 text-[13px] outline-none focus:border-[#F05D28]"
              />
            </div>

            <div className="mt-5">
              <label className="text-[12px] font-black uppercase tracking-[1px] text-[#475569]">Setores notificados</label>
              <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-3">
                {sectorOptions.map((sector) => {
                  const active = selectedSectors.includes(sector);
                  return (
                    <button
                      key={sector}
                      type="button"
                      onClick={() => setSelectedSectors((prev) => active ? prev.filter((item) => item !== sector) : [...prev, sector])}
                      className={`rounded-2xl border px-4 py-3 text-left text-[13px] font-bold transition ${active ? 'border-[#DC2626] bg-[#FEF2F2] text-[#B91C1C]' : 'border-[#E5E7EB] bg-white text-[#475569] hover:border-[#FCA5A5]'}`}
                    >
                      {sector}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button type="button" onClick={() => setModalOpen(false)} className="rounded-2xl border border-[#E5E7EB] px-5 py-3 text-[13px] font-bold text-[#475569]">
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void handleCreateEmergency()}
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-2xl bg-[#DC2626] px-5 py-3 text-[13px] font-black text-white transition hover:bg-[#B91C1C] disabled:opacity-60"
              >
                <MessageSquareText size={16} />
                {saving ? 'Enviando...' : 'Criar atividade'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
