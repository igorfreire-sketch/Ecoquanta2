import SearchableSelect from '../SearchableSelect';
import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Send } from 'lucide-react';
import type { AuthUser } from '../LoginScreen';
import { disciplineMatchesSector, getSectorOptions, getUserDisciplineList } from '../../lib/disciplineCatalog';
import { canEditNc2Record, generateId, getRecordItems, saveRecordsBatch, updateRecord, type Nc2Item, type Nc2Record } from './ncStore';
import type { TerceirizadaRecord } from '../Administracao';
import { getDisciplines as getTerceirizadaDisciplines } from '../TerceirizadasCadastro';

type ItemKey = 'carimbo' | 'desenho' | 'relatorio' | 'faltaArquivo';

interface ItemState {
  c: string;
  t: string;
  resolucao: '' | 'conformidade' | 'terceiro';
  observacao: string;
  historico: Array<{ autor: string; mensagem: string; dataHora: string }>;
}

const ITEM_LABELS: Record<ItemKey, string> = {
  carimbo: 'Carimbo',
  desenho: 'Desenho',
  relatorio: 'Relatorio',
  faltaArquivo: 'Falta de Arquivo',
};

const ITEM_UNIT: Record<ItemKey, Nc2Item['unit']> = {
  carimbo: 'projeto',
  desenho: 'projeto',
  relatorio: 'arquivo',
  faltaArquivo: 'arquivo',
};

const ITEM_KEYS: ItemKey[] = ['carimbo', 'desenho', 'relatorio', 'faltaArquivo'];

const EMPTY_ITENS: Record<ItemKey, ItemState> = {
  carimbo: { c: '', t: '', resolucao: '', observacao: '', historico: [] },
  desenho: { c: '', t: '', resolucao: '', observacao: '', historico: [] },
  relatorio: { c: '', t: '', resolucao: '', observacao: '', historico: [] },
  faltaArquivo: { c: '', t: '', resolucao: '', observacao: '', historico: [] },
};

const selectStyle: React.CSSProperties = {
  backgroundImage:
    'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' fill=\'none\' viewBox=\'0 0 24 24\' stroke=\'%23757575\'%3E%3Cpath stroke-linecap=\'round\' stroke-linejoin=\'round\' stroke-width=\'2\' d=\'M19 9l-7 7-7-7\'%3E%3C/path%3E%3C/svg%3E")',
  backgroundPosition: 'right 12px center',
  backgroundRepeat: 'no-repeat',
  backgroundSize: '16px',
};

type RegistroContract = {
  id?: string;
  code?: string;
  codigo?: string;
  name?: string;
  nome?: string;
};

type RegistroOs = {
  id?: string;
  code?: string;
  codigo?: string;
  name?: string;
  nome?: string;
  contractCode?: string;
  contractCodigo?: string;
  contrato?: string;
  contratoCodigo?: string;
  contractId?: string;
};

const getContractCode = (contract: RegistroContract) =>
  String(contract.code || contract.codigo || contract.id || '').trim();

const getContractName = (contract: RegistroContract) =>
  String(contract.name || contract.nome || getContractCode(contract)).trim();

const getOsCode = (os: RegistroOs) =>
  String(os.code || os.codigo || os.id || '').trim();

const getOsName = (os: RegistroOs) =>
  String(os.name || os.nome || getOsCode(os)).trim();

const getOsContractCode = (os: RegistroOs) =>
  String(os.contractCode || os.contractCodigo || os.contratoCodigo || os.contrato || os.contractId || '').trim();

function normalizeText(value?: string) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
}

function observationMessages(record: Nc2Record) {
  if (record.observacoesHistorico?.length) return record.observacoesHistorico;
  return record.observacoes?.trim()
    ? [{ autor: record.avaliador || 'Sistema', mensagem: record.observacoes.trim(), dataHora: record.dataHora || '' }]
    : [];
}

interface PreenchimentoProps {
  currentUser: AuthUser;
  preloadedData?: {
    registro?: {
      contracts?: RegistroContract[];
      osOptions?: RegistroOs[];
      activitiesList?: any[];
      activeActivities?: any[];
      completedActivities?: any[];
    };
    eap?: unknown;
  };
  lockedContractCode?: string;
  disciplinas?: string[];
  terceirizadas?: TerceirizadaRecord[];
  // Presente = reabrir esse registro pra edicao (vindo do Kanban/Revisoes); ausente = criacao normal.
  editRecord?: Nc2Record | null;
  readOnly?: boolean;
  onFinishEdit?: () => void;
}

// Reconstroi o formulario a partir de um Nc2Record existente (inverso de buildRecord),
// pra reabrir o mesmo ID em vez de criar um registro novo.
function itensFromRecord(record: Nc2Record): Record<ItemKey, ItemState> {
  const byKey = new Map(getRecordItems(record).map((item) => [item.itemKey, item]));
  const next = { ...EMPTY_ITENS };
  ITEM_KEYS.forEach((key) => {
    const item = byKey.get(key);
    if (!item) return;
    next[key] = {
      c: item.quantidadeC ? String(item.quantidadeC) : '',
      t: item.quantidadeT ? String(item.quantidadeT) : '',
      resolucao: item.correcaoOrigem === 'outro_setor' ? 'terceiro' : item.correcaoOrigem === 'conformidade' ? 'conformidade' : '',
      observacao: item.observacao || '',
      historico: item.observacoesHistorico || [],
    };
  });
  return next;
}

export default function Preenchimento({
  currentUser,
  preloadedData,
  lockedContractCode,
  disciplinas = [],
  terceirizadas = [],
  editRecord = null,
  readOnly = false,
  onFinishEdit,
}: PreenchimentoProps) {
  const currentDisciplines = useMemo(() => getUserDisciplineList(currentUser), [currentUser]);
  const [formData, setFormData] = useState({
    avaliador: currentUser.nome || '',
    contrato: lockedContractCode || currentUser.contrato || '',
    os: '',
    edificacao: '',
    disciplina: currentDisciplines[0] || currentUser.disciplina || '',
    terceirizadaNome: '',
    observacoes: '',
  });
  const [itens, setItens] = useState<Record<ItemKey, ItemState>>(EMPTY_ITENS);
  const [currentDateTime, setCurrentDateTime] = useState({ data: '', hora: '' });
  const [draftRecords, setDraftRecords] = useState<Nc2Record[]>([]);
  const [saved, setSaved] = useState(false);
  const [sending, setSending] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [observationHistory, setObservationHistory] = useState<Array<{ autor: string; mensagem: string; dataHora: string }>>([]);
  const [editingObservation, setEditingObservation] = useState<number | null>(null);
  const [editingObservationText, setEditingObservationText] = useState('');
  const [canonicalActivities, setCanonicalActivities] = useState<{
    data: PreenchimentoProps['preloadedData'];
    user: AuthUser;
    activities: any[];
  } | null>(null);

  useEffect(() => {
    if (!editRecord) return;
    setFormData({
      avaliador: editRecord.avaliador || currentUser.nome || '',
      contrato: editRecord.contratoCodigo || '',
      os: editRecord.osCodigo || '',
      // mesmo .trim() que edificacoesDaOs aplica, senao o valor gravado nao casa com a lista.
      edificacao: (editRecord.edificacao || '').trim(),
      disciplina: editRecord.disciplina || '',
      terceirizadaNome: editRecord.terceirizadaNome || '',
      observacoes: readOnly ? '' : editRecord.observacoes || '',
    });
    setItens(itensFromRecord(editRecord));
    setObservationHistory(observationMessages(editRecord));
    setErrorMessage('');
    // ponytail: so re-preenche quando o ID muda (abrir outro card), nao a cada render.
  }, [editRecord?.id, readOnly]);

  const contracts = preloadedData?.registro?.contracts || [];
  const osOptions = preloadedData?.registro?.osOptions || [];
  const fallbackActivities = useMemo(() => (
    Array.isArray(preloadedData?.registro?.activitiesList) && preloadedData.registro.activitiesList.length > 0
      ? preloadedData.registro.activitiesList
      : [
          ...(Array.isArray(preloadedData?.registro?.activeActivities) ? preloadedData.registro.activeActivities : []),
          ...(Array.isArray(preloadedData?.registro?.completedActivities) ? preloadedData.registro.completedActivities : []),
        ]
  ), [preloadedData]);
  const sourceActivities = canonicalActivities?.data === preloadedData && canonicalActivities.user === currentUser
    ? canonicalActivities.activities
    : fallbackActivities;

  useEffect(() => {
    let cancelled = false;

    if (!preloadedData?.eap) {
      setCanonicalActivities(null);
      return () => { cancelled = true; };
    }

    void import('../Atividades')
      .then(({ buildActivitiesFromEap }) => {
        if (cancelled) return;
        setCanonicalActivities({
          data: preloadedData,
          user: currentUser,
          activities: buildActivitiesFromEap(preloadedData, currentUser),
        });
      })
      .catch((error) => {
        if (cancelled) return;
        console.error('Falha ao resolver atividades da EAP para Conformidade:', error);
        setCanonicalActivities(null);
      });

    return () => { cancelled = true; };
  }, [currentUser, preloadedData]);

  useEffect(() => {
    setFormData((prev) => ({
      ...prev,
      avaliador: currentUser.nome || '',
      contrato: lockedContractCode || prev.contrato || currentUser.contrato || '',
      disciplina: prev.disciplina || currentDisciplines[0] || currentUser.disciplina || '',
    }));
  }, [currentDisciplines, currentUser.contrato, currentUser.disciplina, currentUser.nome, lockedContractCode]);

  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      setCurrentDateTime({
        data: now.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }),
        hora: now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
      });
    };
    updateClock();
  }, []);

  // Opcoes de disciplina viram GRUPOS; se o valor gravado for legado (nao esta nos grupos), mantem visivel no topo.
  const disciplinaGroupOptions = useMemo(() => {
    const groups = getSectorOptions(disciplinas);
    return formData.disciplina && !groups.includes(formData.disciplina)
      ? [formData.disciplina, ...groups]
      : groups;
  }, [disciplinas, formData.disciplina]);

  // Terceirizadas cujo cadastro atende o setor de disciplina selecionado (padrão.md: uma
  // terceirizada pode atender vários setores, entao ela aparece em cada um dos seus setores).
  // Valor gravado legado/removido do cadastro entra como opcao sintetica pra nao ficar em branco.
  const terceirizadaOptions = useMemo(() => {
    const nomes = new Set<string>();
    terceirizadas.forEach((item) => {
      const nome = String(item.nome || '').trim();
      if (!nome) return;
      const disciplinasDaTerceirizada = getTerceirizadaDisciplines(item);
      if (disciplinasDaTerceirizada.some((disciplina) => disciplineMatchesSector(disciplina, formData.disciplina))) {
        nomes.add(nome);
      }
    });
    if (formData.terceirizadaNome.trim()) nomes.add(formData.terceirizadaNome.trim());
    return Array.from(nomes).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [terceirizadas, formData.disciplina, formData.terceirizadaNome]);

  const filteredOsOptions = useMemo(() => (
    osOptions.filter((os) => !formData.contrato || normalizeText(getOsContractCode(os)) === normalizeText(formData.contrato))
  ), [formData.contrato, osOptions]);

  const edificacoesDaOs = useMemo(() => {
    if (!formData.contrato || !formData.os) return [];
    const nomes = new Set<string>();
    sourceActivities.forEach((activity: any) => {
      const contractCode = String(activity?.contratoCodigo || activity?.contractCode || '').trim();
      if (
        normalizeText(contractCode) === normalizeText(formData.contrato) &&
        normalizeText(String(activity?.osCodigo || '')) === normalizeText(formData.os) &&
        String(activity?.edificio || '').trim()
      ) {
        nomes.add(String(activity.edificio).trim());
      }
    });
    return Array.from(nomes).sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true }));
  }, [formData.contrato, formData.os, sourceActivities]);

  // ponytail: so ajusta a edificacao; nao limpa itens — toda troca de escopo feita pelo usuario
  // ja passa por updateScope (que limpa), enquanto este efeito tambem roda quando as atividades
  // terminam de carregar, o que apagava os itens recem-carregados de um registro em edicao.
  useEffect(() => {
    // Lista vazia = atividades ainda carregando ou OS sem edificacao: nao ha contra o que validar.
    if (edificacoesDaOs.length === 0) return;
    if (edificacoesDaOs.length === 1 && formData.edificacao !== edificacoesDaOs[0]) {
      setFormData((prev) => ({ ...prev, edificacao: edificacoesDaOs[0] }));
      return;
    }
    if (!formData.edificacao || edificacoesDaOs.includes(formData.edificacao)) return;
    setFormData((prev) => ({ ...prev, edificacao: '' }));
  }, [edificacoesDaOs, formData.edificacao]);

  const generalDataReady = Boolean(
    formData.avaliador.trim() &&
    formData.contrato.trim() &&
    formData.os.trim() &&
    formData.disciplina.trim() &&
    (edificacoesDaOs.length === 0 || edificacoesDaOs.includes(formData.edificacao))
  );

  const matchingActivities = useMemo(() => {
    if (!formData.contrato || !formData.os || !formData.disciplina) return [];
    return sourceActivities.filter((activity: any) => {
      const contractCode = String(activity?.contratoCodigo || activity?.contractCode || '').trim();
      const discipline = Array.isArray(activity?.disciplinas)
        ? activity.disciplinas.join(' | ')
        : String(activity?.criadoPorDisciplina || activity?.disciplina || '').trim();
      return (
        normalizeText(contractCode) === normalizeText(formData.contrato) &&
        normalizeText(String(activity?.osCodigo || '')) === normalizeText(formData.os) &&
        normalizeText(String(activity?.edificio || '')) === normalizeText(formData.edificacao) &&
        disciplineMatchesSector(discipline, formData.disciplina)
      );
    });
  }, [formData.contrato, formData.disciplina, formData.edificacao, formData.os, sourceActivities]);

  const origemAutomatica = useMemo<'interno' | 'terceirizado'>(() => {
    if (matchingActivities.length === 0) return currentUser.onlyThirdParty ? 'terceirizado' : 'interno';
    // ponytail: mixed/unknown staffing stays internal; persist activity origin if that ceiling changes.
    const allOutsourced = matchingActivities.every((activity: any) => {
      const emails = (Array.isArray(activity?.profissionaisEmails)
        ? activity.profissionaisEmails
        : String(activity?.profissionaisEmails || '').split(' | '))
        .map((item: any) => String(item || '').trim())
        .filter(Boolean);
      return emails.length > 0 && emails.every((email: string) => email.toLowerCase().startsWith('terceirizada:'));
    });
    return allOutsourced ? 'terceirizado' : 'interno';
  }, [currentUser.onlyThirdParty, matchingActivities]);

  const selectedItems = ITEM_KEYS.filter((key) => (
    (parseInt(itens[key].c, 10) || 0) + (parseInt(itens[key].t, 10) || 0) > 0
  ));
  const unresolvedItems = selectedItems.filter((key) => !itens[key].resolucao);
  const totalC = selectedItems.reduce((sum, key) => sum + (parseInt(itens[key].c, 10) || 0), 0);
  const totalT = selectedItems.reduce((sum, key) => sum + (parseInt(itens[key].t, 10) || 0), 0);

  const inputBase = 'w-14 h-9 text-center text-[13px] font-bold rounded-lg border outline-none transition-colors';

  const updateScope = (updates: Partial<typeof formData>) => {
    setFormData((prev) => ({ ...prev, ...updates }));
    setItens(EMPTY_ITENS);
  };

  const setItemQty = (key: ItemKey, field: 'c' | 't', value: string) => {
    if (!generalDataReady) return;
    const num = value.replace(/\D/g, '').slice(0, 3);
    setItens((prev) => ({
      ...prev,
      [key]: {
        ...prev[key],
        [field]: num,
        ...(Number(num) === 0 && !((field === 'c' ? prev[key].t : prev[key].c) || '').trim()
          ? { resolucao: '' as const }
          : {}),
      },
    }));
  };

  const setItemResolution = (key: ItemKey, resolucao: ItemState['resolucao']) => {
    if (!generalDataReady) return;
    setItens((prev) => ({ ...prev, [key]: { ...prev[key], resolucao } }));
  };

  const setItemObservacao = (key: ItemKey, observacao: string) => {
    if (!generalDataReady) return;
    setItens((prev) => ({ ...prev, [key]: { ...prev[key], observacao } }));
  };

  const handleLimpar = () => {
    setFormData({
      avaliador: currentUser.nome || '',
      contrato: lockedContractCode || currentUser.contrato || '',
      os: '',
      edificacao: '',
      disciplina: currentDisciplines[0] || currentUser.disciplina || '',
      terceirizadaNome: '',
      observacoes: '',
    });
    setItens(EMPTY_ITENS);
  };

  const buildRecord = (): Nc2Record | null => {
    if (
      !generalDataReady || unresolvedItems.length > 0
    ) {
      return null;
    }

    const selectedContract = contracts.find((item) => normalizeText(getContractCode(item)) === normalizeText(formData.contrato));
    const selectedOs = filteredOsOptions.find((item) => normalizeText(getOsCode(item)) === normalizeText(formData.os));
    const objetoOs = formData.edificacao || (selectedOs ? getOsName(selectedOs) : formData.os);
    const objetoOsCodigo = formData.edificacao || formData.os;
    const terceirizadaNome = formData.terceirizadaNome.trim();
    const itensRegistrados = ITEM_KEYS.map((key): Nc2Item => {
        const quantidadeC = parseInt(itens[key].c, 10) || 0;
        const quantidadeT = parseInt(itens[key].t, 10) || 0;
        // Editando um item que ja estava corrigido (pela Conformidade no Preenchimento ou
        // confirmado em Revisoes) sem mudar a via de resolucao: mantem statusCorrecao e o
        // registro original de quem/quando corrigiu, em vez de reverter/reescrever neste save.
        const originalItem = editRecord ? getRecordItems(editRecord).find((item) => item.itemKey === key) : undefined;
        const sameResolution =
          originalItem?.correcaoOrigem ===
          (itens[key].resolucao === 'terceiro' ? 'outro_setor' : 'conformidade');
        const keepsOriginalFix =
          Boolean(itens[key].resolucao) && originalItem?.statusCorrecao === 'corrigido' && sameResolution;
        return {
          itemKey: key,
          itemLabel: ITEM_LABELS[key],
          quantidadeC,
          quantidadeT,
          unit: ITEM_UNIT[key],
          revisado: quantidadeT === 0 || itens[key].resolucao === 'conformidade',
          ...(itens[key].observacao.trim() ? { observacao: itens[key].observacao.trim() } : {}),
          ...(itens[key].historico.length > 0 ? { observacoesHistorico: itens[key].historico } : {}),
          ...(itens[key].resolucao
            ? {
                correcaoOrigem: itens[key].resolucao === 'terceiro' ? 'outro_setor' as const : 'conformidade' as const,
                ...(quantidadeT > 0
                  ? {
                      statusCorrecao:
                        keepsOriginalFix || itens[key].resolucao === 'conformidade'
                          ? ('corrigido' as const)
                          : ('pendente' as const),
                      ...(keepsOriginalFix
                        ? {
                            corrigidoEm: originalItem!.corrigidoEm || new Date().toISOString(),
                            corrigidoPor: originalItem!.corrigidoPor || currentUser.nome || currentUser.email || '',
                          }
                        : itens[key].resolucao === 'conformidade'
                          ? {
                              corrigidoEm: new Date().toISOString(),
                              corrigidoPor: currentUser.nome || currentUser.email || '',
                            }
                          : {}),
                      // Nota de reabertura e historico da Conformidade: nao some num save do Preenchimento.
                      ...(originalItem?.reaberturaObservacao
                        ? { reaberturaObservacao: originalItem.reaberturaObservacao }
                        : {}),
                    }
                  : {}),
              }
            : {}),
        };
      });

    const now = new Date();
    const dataHora = editRecord?.dataHora || `${now.toLocaleDateString('pt-BR')} as ${now.toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
    })} por ${formData.avaliador}`;

    return {
      id: editRecord?.id || generateId(),
      contratoCodigo: formData.contrato,
      contratoNome: selectedContract ? getContractName(selectedContract) : formData.contrato,
      os: selectedOs ? getOsName(selectedOs) : formData.os,
      osCodigo: formData.os,
      objetoOs,
      objetoOsCodigo,
      edificacao: formData.edificacao,
      disciplina: formData.disciplina,
      origemAtividade: origemAutomatica,
      ...(terceirizadaNome ? { terceirizadaNome } : {}),
      avaliador: formData.avaliador,
      avaliadorEmail: editRecord?.avaliadorEmail || currentUser.email || '',
      observacoes: formData.observacoes,
      dataHora,
      itens: itensRegistrados,
      itensT: itensRegistrados.filter((item) => item.quantidadeT > 0),
      concluido: itensRegistrados.filter((item) => item.quantidadeT > 0).every(
        (item) => item.statusCorrecao === 'corrigido',
      ),
      createdAt: editRecord?.createdAt || now.toISOString(),
      updatedAt: now.toISOString(),
      updatedByNome: currentUser.nome || '',
      updatedByEmail: currentUser.email || '',
    };
  };

  const handleEnviarAtividades = async () => {
    let queue = draftRecords;
    const currentRecord = buildRecord();
    if (currentRecord) {
      queue = [currentRecord, ...queue];
    }
    if (queue.length === 0) return;

    setSending(true);
    setErrorMessage('');
    try {
      await saveRecordsBatch(queue, { nome: currentUser.nome, email: currentUser.email });
      setDraftRecords([]);
      handleLimpar();
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (error) {
      console.error('Erro ao enviar atividades de conformidade:', error);
      setErrorMessage('Nao foi possivel enviar para o Firebase. Verifique a conexao e tente novamente.');
    } finally {
      setSending(false);
    }
  };

  const handleSalvarEdicao = async () => {
    // Mesmo gate do botao Editar em Revisoes, agora no ponto do save: quem chega aqui por outro
    // caminho (estado React nao e fronteira de seguranca) tambem e barrado.
    if (editRecord && !canEditNc2Record(currentUser, editRecord)) {
      setErrorMessage('Apenas Lider, Coordenador ou o autor do registro pode salvar esta edicao.');
      return;
    }
    const record = buildRecord();
    if (!record) {
      setErrorMessage(unresolvedItems.length > 0
        ? 'Escolha Conformidade ou Terceiro para cada item preenchido.'
        : 'Preencha os campos obrigatorios e informe C ou T maior que zero em pelo menos um item.');
      return;
    }
    setSending(true);
    setErrorMessage('');
    try {
      await updateRecord(record, { nome: currentUser.nome, email: currentUser.email });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
      onFinishEdit?.();
    } catch (error) {
      console.error('Erro ao salvar edicao de conformidade:', error);
      setErrorMessage('Nao foi possivel salvar no Firebase. Verifique a conexao e tente novamente.');
    } finally {
      setSending(false);
    }
  };

  const handleEnviarObservacao = async () => {
    if (!editRecord || !readOnly) return;
    const mensagem = formData.observacoes.trim();
    if (!mensagem) return;
    setSending(true);
    try {
      await updateRecord(
        {
          ...editRecord,
          observacoesHistorico: [
            ...observationHistory,
            { autor: currentUser.nome || currentUser.email || 'Usuário', mensagem, dataHora: new Date().toISOString() },
          ],
        },
        currentUser,
      );
      setObservationHistory((prev) => [
        ...prev,
        { autor: currentUser.nome || currentUser.email || 'Usuário', mensagem, dataHora: new Date().toISOString() },
      ]);
      setFormData((prev) => ({ ...prev, observacoes: '' }));
      setSaved(true);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Não foi possível enviar a observação.');
    } finally {
      setSending(false);
    }
  };

  const isOwnObservation = (autor: string) => {
    const current = normalizeText(currentUser.nome || currentUser.email);
    return current !== '' && normalizeText(autor) === current;
  };

  const handleEditarObservacao = async (index: number) => {
    if (!editRecord || !readOnly || !editingObservationText.trim()) return;
    const history = observationHistory.map((item, itemIndex) => itemIndex === index
      ? { ...item, mensagem: editingObservationText.trim() }
      : item);
    setSending(true);
    try {
      await updateRecord({ ...editRecord, observacoesHistorico: history }, currentUser);
      setObservationHistory(history);
      setEditingObservation(null);
      setEditingObservationText('');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Não foi possível editar a observação.');
    } finally {
      setSending(false);
    }
  };

  const handleExcluirObservacao = async (index: number) => {
    if (!editRecord || !readOnly || !isOwnObservation(observationHistory[index]?.autor || '')) return;
    const history = observationHistory.filter((_, itemIndex) => itemIndex !== index);
    setSending(true);
    try {
      await updateRecord({ ...editRecord, observacoesHistorico: history }, currentUser);
      setObservationHistory(history);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Não foi possível excluir a observação.');
    } finally {
      setSending(false);
    }
  };

  const canRegisterCurrent = generalDataReady && unresolvedItems.length === 0;
  const isEditing = Boolean(editRecord);

  return (
    <div className="flex flex-col gap-6 w-full max-w-[980px] mx-auto animate-in fade-in duration-500 pb-10">
      <div className="rounded-xl bg-white p-6 shadow-[0_10px_30px_-22px_rgba(15,23,42,0.45)]">
        <div className="mb-6">
          <h3 className="text-[16px] font-bold text-[#2D2D2D]">Dados Gerais da Analise</h3>
        </div>
        <div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <div className="space-y-2">
              <label className="text-[11px] font-bold text-[#757575] uppercase tracking-wider">Avaliador *</label>
              <input
                value={formData.avaliador}
                disabled
                className="w-full h-11 px-3 bg-[#F3F4F6] border border-[#E5E7EB] rounded-lg text-[13px] text-[#2D2D2D] outline-none"
              />
            </div>

            <div className="space-y-2">
              <label className="text-[11px] font-bold text-[#757575] uppercase tracking-wider">Contrato *</label>
              <SearchableSelect
                value={formData.contrato}
                onChange={(e) => updateScope({ contrato: e.target.value, os: '', edificacao: '' })}
                disabled={readOnly || Boolean(lockedContractCode)}
                className="w-full h-11 px-3 bg-[#F9FAFB] border border-[#E5E7EB] rounded-lg text-[13px] text-[#2D2D2D] outline-none focus:border-[#F05D28] transition-colors appearance-none cursor-pointer"
                style={selectStyle}
              >
                <option value="">Selecione...</option>
                {contracts.map((contract) => {
                  const code = getContractCode(contract);
                  return (
                    <option key={code} value={code}>
                      {code} - {getContractName(contract)}
                    </option>
                  );
                })}
              </SearchableSelect>
            </div>

            <div className="space-y-2">
              <label className="text-[11px] font-bold text-[#757575] uppercase tracking-wider">OS *</label>
              <SearchableSelect
                value={formData.os}
                onChange={(e) => updateScope({ os: e.target.value, edificacao: '' })}
                disabled={readOnly}
                className={`w-full h-11 px-3 bg-[#F9FAFB] border ${formData.os ? 'border-[#F05D28] ring-1 ring-[#F05D28]/20' : 'border-[#E5E7EB]'} rounded-lg text-[13px] text-[#2D2D2D] outline-none focus:border-[#F05D28] transition-colors appearance-none cursor-pointer`}
                style={selectStyle}
              >
                <option value="">Selecione...</option>
                {filteredOsOptions.map((os) => {
                  const code = getOsCode(os);
                  return (
                    <option key={code} value={code}>
                      {getOsName(os)} ({code})
                    </option>
                  );
                })}
              </SearchableSelect>
            </div>

            <div className="space-y-2">
              <label className="text-[11px] font-bold text-[#757575] uppercase tracking-wider">
                Edificação {edificacoesDaOs.length > 0 ? '*' : ''}
              </label>
              <SearchableSelect
                value={formData.edificacao}
                onChange={(e) => updateScope({ edificacao: e.target.value })}
                disabled={readOnly || edificacoesDaOs.length === 0}
                searchPlaceholder="Pesquisar edificação..."
                className={`w-full h-11 px-3 border ${formData.edificacao ? 'border-[#F05D28] ring-1 ring-[#F05D28]/20' : 'border-[#E5E7EB]'} rounded-lg text-[13px] outline-none focus:border-[#F05D28] transition-colors appearance-none ${edificacoesDaOs.length === 0 ? 'cursor-not-allowed bg-[#F3F4F6] text-[#9CA3AF]' : 'cursor-pointer bg-[#F9FAFB] text-[#2D2D2D]'}`}
                style={selectStyle}
              >
                <option value="">{edificacoesDaOs.length === 0 ? 'Sem edificação nesta OS' : 'Selecione...'}</option>
                {edificacoesDaOs.map((edificacao) => (
                  <option key={edificacao} value={edificacao}>{edificacao}</option>
                ))}
              </SearchableSelect>
            </div>

            <div className="space-y-2">
              <label className="text-[11px] font-bold text-[#757575] uppercase tracking-wider">Disciplina *</label>
              <SearchableSelect
                value={formData.disciplina}
                onChange={(e) => updateScope({ disciplina: e.target.value })}
                disabled={readOnly}
                className="w-full h-11 px-3 bg-[#F9FAFB] border border-[#E5E7EB] rounded-lg text-[13px] text-[#2D2D2D] outline-none focus:border-[#F05D28] transition-colors appearance-none cursor-pointer"
                style={selectStyle}
              >
                <option value="">Selecione...</option>
                {disciplinaGroupOptions.map((disciplina) => (
                  <option key={disciplina} value={disciplina}>
                    {disciplina}
                  </option>
                ))}
              </SearchableSelect>
            </div>

            <div className="space-y-2">
              <label className="text-[11px] font-bold text-[#757575] uppercase tracking-wider">
                Nome da terceirizada (opcional)
              </label>
              <SearchableSelect
                value={formData.terceirizadaNome}
                onChange={(e) => setFormData({ ...formData, terceirizadaNome: e.target.value })}
                disabled={readOnly}
                searchPlaceholder="Pesquisar terceirizada..."
                className="w-full h-11 px-3 bg-[#F9FAFB] border border-[#E5E7EB] rounded-lg text-[13px] text-[#2D2D2D] outline-none focus:border-[#F05D28] transition-colors appearance-none cursor-pointer"
                style={selectStyle}
              >
                <option value="">Selecione...</option>
                {terceirizadaOptions.map((nome) => (
                  <option key={nome} value={nome}>{nome}</option>
                ))}
              </SearchableSelect>
            </div>
          </div>

          <div className="mt-2 flex items-center gap-6">
            <span className="text-[12px] font-bold text-[#757575]">
              Data: <span className="font-medium ml-1">{currentDateTime.data}</span>
            </span>
            <span className="text-[12px] font-bold text-[#757575]">
              Hora: <span className="font-medium ml-1">{currentDateTime.hora}</span>
            </span>
          </div>
        </div>
      </div>

      <div
        aria-disabled={!generalDataReady}
        className={`rounded-xl shadow-[0_10px_30px_-22px_rgba(15,23,42,0.45)] p-6 ${generalDataReady ? 'bg-white' : 'bg-[#F8F9FA]'}`}
      >
        <div className="mb-6">
          <h3 className="text-[16px] font-bold text-[#2D2D2D] mb-1">Itens verificados no documento</h3>
          {!generalDataReady && (
            <p className="mt-2 text-[12px] font-semibold text-[#64748B]">
              Preencha os Dados Gerais da Analise para liberar os itens.
            </p>
          )}
        </div>

        <div className={`w-full transition-opacity ${generalDataReady ? '' : 'opacity-50'}`}>
          <div className="grid w-full grid-cols-[minmax(180px,220px)_56px_56px_minmax(240px,1fr)] gap-x-3 items-center px-2 mb-1">
            <span />
            <span className="text-[12px] font-bold text-[#2D2D2D] text-center">C</span>
            <span className="text-[12px] font-bold text-[#2D2D2D] text-center">T</span>
          </div>

          <div className="flex flex-col gap-1">
            {ITEM_KEYS.map((key) => {
              const item = itens[key];
              const isSelected = (parseInt(item.c, 10) || 0) + (parseInt(item.t, 10) || 0) > 0;
              return (
                <div key={key} className="grid w-full grid-cols-[minmax(180px,220px)_56px_56px_minmax(240px,1fr)] gap-x-3 items-center px-2 py-2.5">
                  <div>
                    <span className={`text-[13px] font-medium transition-colors ${isSelected ? 'text-[#2D2D2D]' : 'text-[#757575]'}`}>
                      {ITEM_LABELS[key]}
                    </span>
                    <span className={`ml-2 text-[10px] font-bold uppercase tracking-wide ${isSelected ? 'text-[#F05D28]' : 'text-[#9CA3AF]'}`}>
                      {ITEM_UNIT[key]}
                    </span>
                  </div>

                  <input
                    value={item.c}
                    onChange={(e) => setItemQty(key, 'c', e.target.value)}
                    disabled={readOnly || !generalDataReady}
                    inputMode="numeric"
                    aria-label={`${ITEM_LABELS[key]} C`}
                    placeholder="0"
                    className={`${inputBase} ${generalDataReady ? 'border-[#E5E7EB] bg-white text-[#2D2D2D] focus:border-[#F05D28]' : 'cursor-not-allowed border-[#E5E7EB] bg-[#F3F4F6] text-[#9CA3AF]'}`}
                  />

                  <input
                    value={item.t}
                    onChange={(e) => setItemQty(key, 't', e.target.value)}
                    disabled={readOnly || !generalDataReady}
                    inputMode="numeric"
                    aria-label={`${ITEM_LABELS[key]} T`}
                    placeholder="0"
                    className={`${inputBase} ${generalDataReady ? 'border-[#E5E7EB] bg-white text-[#2D2D2D] focus:border-[#F05D28]' : 'cursor-not-allowed border-[#E5E7EB] bg-[#F3F4F6] text-[#9CA3AF]'}`}
                  />

                  {isSelected && (
                    <div className="col-start-4 row-start-1 col-span-1 row-span-2 flex flex-wrap items-center gap-3 rounded-lg bg-[#F8FAFC] px-3 py-2">
                      <span className="text-[10px] font-extrabold uppercase tracking-[0.8px] text-[#64748B]">
                        Resolvido por
                      </span>
                      {([
                        ['conformidade', 'Já foi resolvido pela Conformidade'],
                        ['terceiro', 'Terceiro'],
                      ] as const).map(([value, label]) => (
                        <label key={value} className="inline-flex cursor-pointer items-center gap-1.5 text-[11px] font-bold text-[#475569]">
                          <input
                            type="radio"
                            name={`resolucao-${key}`}
                            value={value}
                            checked={item.resolucao === value}
                            onChange={() => setItemResolution(key, value)}
                            disabled={readOnly || !generalDataReady}
                            className="h-3.5 w-3.5 accent-[#F05D28]"
                          />
                          {label}
                        </label>
                      ))}
                      {!item.resolucao && (
                        <span className="text-[10px] font-semibold text-[#B45309]">selecione uma opção</span>
                      )}
                      {item.historico.map((mensagem, index) => (
                        <p key={`${mensagem.dataHora}-${index}`} className="w-full basis-full rounded-md bg-white px-2 py-1 text-[11px] text-[#475569]">
                          <strong>{mensagem.autor}:</strong> {mensagem.mensagem}
                        </p>
                      ))}
                      <textarea
                        value={item.observacao}
                        onChange={(e) => setItemObservacao(key, e.target.value)}
                        disabled={readOnly || !generalDataReady}
                        placeholder="Observação do item (opcional)"
                        rows={1}
                        aria-label={`${ITEM_LABELS[key]} observação`}
                        className="w-full basis-full h-9 px-3 py-1.5 bg-white border border-[#E5E7EB] rounded-lg text-[13px] text-[#2D2D2D] outline-none focus:border-[#F05D28] transition-colors resize-none"
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="rounded-xl bg-white shadow-[0_10px_30px_-22px_rgba(15,23,42,0.45)] p-6">
        <label className="block text-[11px] font-bold text-[#757575] uppercase tracking-wider mb-3">
          {readOnly ? 'Observações / conversa' : 'Observacoes'}
        </label>
        {readOnly && editRecord && (
          <div className="mb-3 space-y-2">
            {observationHistory.map((item, index) => (
              <div key={`${item.dataHora}-${index}`} className="rounded-lg bg-[#F8FAFC] px-3 py-2 text-[12px] text-[#475569]">
                {editingObservation === index ? (
                  <div className="flex items-center gap-2">
                    <input
                      value={editingObservationText}
                      onChange={(event) => setEditingObservationText(event.target.value)}
                      className="min-w-0 flex-1 rounded-md border border-[#E5E7EB] bg-white px-2 py-1 outline-none focus:border-[#F05D28]"
                    />
                    <button type="button" onClick={() => void handleEditarObservacao(index)} className="text-[11px] font-bold text-[#F05D28]">Salvar</button>
                    <button type="button" onClick={() => setEditingObservation(null)} className="text-[11px] font-bold text-[#94A3B8]">Cancelar</button>
                  </div>
                ) : (
                  <div className="flex items-start justify-between gap-3">
                    <span><strong>{item.autor}:</strong> {item.mensagem}</span>
                    {isOwnObservation(item.autor) && (
                      <span className="flex shrink-0 gap-2">
                        <button type="button" onClick={() => { setEditingObservation(index); setEditingObservationText(item.mensagem); }} className="text-[10px] font-bold text-[#64748B] hover:text-[#F05D28]">Editar</button>
                        <button type="button" onClick={() => void handleExcluirObservacao(index)} className="text-[10px] font-bold text-[#94A3B8] hover:text-[#B91C1C]">Excluir</button>
                      </span>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
        <div className="flex items-end gap-2">
          <textarea
            value={formData.observacoes}
            onChange={(e) => setFormData({ ...formData, observacoes: e.target.value })}
            disabled={false}
            rows={5}
            placeholder="Adicione observacoes, explique a nao conformidade ou registre orientacoes de correcao..."
            className="min-w-0 flex-1 rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] px-4 py-3 text-[14px] text-[#2D2D2D] outline-none focus:border-[#F05D28] transition-colors resize-y"
          />
          {readOnly && (
            <button
              type="button"
              onClick={() => void handleEnviarObservacao()}
              disabled={sending || !formData.observacoes.trim()}
              aria-label="Enviar observação"
              className="mb-1 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#F05D28]/10 text-[#F05D28] transition-colors hover:bg-[#F05D28]/20 disabled:opacity-40"
            >
              <Send size={14} />
            </button>
          )}
        </div>
      </div>

      {isEditing && !readOnly ? (
        <div className="flex flex-col sm:flex-row gap-3 justify-end">
          <button
            type="button"
            onClick={() => onFinishEdit?.()}
            disabled={sending}
            className="h-12 px-6 rounded-xl border border-[#E5E7EB] bg-white text-[#757575] text-[14px] font-bold hover:bg-[#F9FAFB] transition-colors disabled:opacity-50"
          >
            Cancelar edição
          </button>
          <button
            type="button"
            onClick={() => void handleSalvarEdicao()}
            disabled={sending || !canRegisterCurrent}
            className="h-12 px-6 rounded-2xl bg-[#FACC15] text-[#5B4300] text-[14px] font-black shadow-xl shadow-[#FACC15]/30 inline-flex items-center justify-center gap-2 hover:bg-[#EAB308] disabled:opacity-60"
          >
            <Send size={16} />
            {sending ? 'Salvando...' : 'Salvar alterações'}
          </button>
        </div>
      ) : !readOnly ? (
        <div className="flex flex-col sm:flex-row gap-3 justify-end">
          <button
            type="button"
            onClick={handleLimpar}
            className="h-12 px-6 rounded-xl border border-[#E5E7EB] bg-white text-[#757575] text-[14px] font-bold hover:bg-[#F9FAFB] transition-colors"
          >
            Limpar
          </button>
        </div>
      ) : null}

      {errorMessage && (
        <div className="rounded-xl border border-[#FECACA] bg-[#FEF2F2] px-4 py-3 text-[13px] font-medium text-[#B91C1C]">
          {errorMessage}
        </div>
      )}

      {!isEditing && (draftRecords.length > 0 || canRegisterCurrent) && (
        <div className="sticky bottom-6 z-20 flex justify-end">
          <button
            type="button"
            onClick={() => void handleEnviarAtividades()}
            disabled={sending || (!canRegisterCurrent && draftRecords.length === 0)}
            className="h-14 px-6 rounded-2xl bg-[#F05D28] text-white text-[14px] font-black shadow-xl shadow-black/20 inline-flex items-center justify-center gap-2 hover:bg-[#D94E1F] disabled:opacity-60"
          >
            <Send size={18} />
            {sending ? 'Enviando atividade...' : 'Enviar atividade'}
          </button>
        </div>
      )}

      {!isEditing && draftRecords.length > 0 && (
        <div className="rounded-xl bg-white shadow-[0_10px_30px_-22px_rgba(15,23,42,0.45)] p-6">
          <div className="flex items-center justify-between gap-4 mb-4">
            <div>
              <h3 className="text-[16px] font-bold text-[#2D2D2D]">Analises registradas nessa janela</h3>
              <p className="text-[13px] text-[#757575]">Essas analises serao enviadas para Revisoes.</p>
            </div>
            <span className="rounded-full bg-[#FFF3EC] px-3 py-1 text-[11px] font-bold text-[#F05D28]">
              {draftRecords.length} pendente(s)
            </span>
          </div>

          <div className="space-y-3">
            {draftRecords.map((record) => (
              <div key={record.id} className="rounded-xl bg-[#F8F9FA] p-4">
                <div className="text-[13px] font-bold text-[#2D2D2D]">{record.os}</div>
                <div className="mt-1 text-[12px] font-medium text-[#757575]">{record.objetoOs} - {record.disciplina}</div>
                <div className="mt-2 text-[12px] text-[#757575]">{record.observacoes || 'Sem observacoes'}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {saved && (
        <div className="fixed right-8 bottom-8 z-30 px-5 py-4 rounded-2xl bg-[#ECFDF5] border border-[#A7F3D0] text-[#047857] text-[14px] font-bold shadow-lg">
          Atividades enviadas com sucesso.
        </div>
      )}
    </div>
  );
}
