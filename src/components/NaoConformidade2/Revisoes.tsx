import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, ChevronDown, Loader2, MessageCircle, Pencil, RotateCcw, Trash2 } from 'lucide-react';
import { sameContractCode } from '../../lib/contractCode';
import SearchableSelect from '../SearchableSelect';
import type { AuthUser } from '../LoginScreen';
import {
  archiveRecord,
  canEditNc2Record,
  confirmItemCorrection,
  correctionStatus,
  isNc2Leader,
  isNc2ConformidadeUser,
  hasUnreadNc2Chat,
  markNc2ChatSeen,
  getRecords,
  getRecordItems,
  getRecordStatus,
  reopenItemCorrection,
  safeAmount,
  updateRecord,
  type Nc2Item,
  type Nc2Record,
} from './ncStore';

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

interface RevisoesProps {
  currentUser: AuthUser;
  lockedContractCode?: string;
  preloadedData?: {
    registro?: {
      contracts?: RegistroContract[];
      osOptions?: RegistroOs[];
      activities?: unknown[];
      activitiesList?: unknown[];
      activeActivities?: unknown[];
      completedActivities?: unknown[];
    };
  };
  selectedContract?: string;
  selectedOs?: string;
  // Ausente = mantem sem acao de edicao (compatibilidade); presente = reabre o registro no Preenchimento.
  onEditInPreenchimento?: (record: Nc2Record) => void;
}

type ItemType = 'Carimbo' | 'Desenho' | 'Relatório' | 'Arquivo';
type OsOption = { code: string; name: string; contractCode: string };

const ITEM_TYPES: ItemType[] = ['Carimbo', 'Desenho', 'Relatório', 'Arquivo'];
const FILTER_CLASS =
  'min-w-[180px] flex-1 rounded-[20px] border border-[#E5E7EB] bg-white px-4 py-2 shadow-[0_8px_20px_-18px_rgba(15,23,42,0.45)]';
const SELECT_CLASS =
  'mt-0.5 h-6 w-full bg-transparent text-[13px] font-black text-[#2D2D2D] outline-none disabled:cursor-not-allowed disabled:text-[#94A3B8]';

const getContractCode = (contract: RegistroContract) =>
  String(contract.code || contract.codigo || contract.id || '').trim();

const getContractName = (contract: RegistroContract) =>
  String(contract.name || contract.nome || getContractCode(contract)).trim();

const getOsCode = (os: RegistroOs) => String(os.code || os.codigo || os.id || '').trim();

const getOsName = (os: RegistroOs) => String(os.name || os.nome || getOsCode(os)).trim();

const getOsContractCode = (os: RegistroOs) =>
  String(
    os.contractCode ||
      os.contractCodigo ||
      os.contratoCodigo ||
      os.contrato ||
      os.contractId ||
      '',
  ).trim();

function normalizeText(value?: unknown) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function filterValue(value?: string) {
  return ['todos', 'todas'].includes(normalizeText(value)) ? '' : String(value || '').trim();
}

function displayNameWithCode(name: string, code: string) {
  return name && normalizeText(name) !== normalizeText(code) ? `${name} (${code})` : name || code;
}

function isFilledItem(item: Nc2Item) {
  return safeAmount(item.quantidadeC) + safeAmount(item.quantidadeT) > 0;
}

function getItemType(item: Nc2Item): ItemType | 'Outros' {
  const value = normalizeText(`${item.itemKey || ''} ${item.itemLabel || ''}`).replace(/\s+/g, '');
  if (value.includes('carimbo')) return 'Carimbo';
  if (value.includes('desenho')) return 'Desenho';
  if (value.includes('relatorio')) return 'Relatório';
  if (value.includes('faltaarquivo') || value.includes('arquivo')) return 'Arquivo';
  return 'Outros';
}

function itemUnitLabel(item: Nc2Item, amount: number) {
  if (item.unit === 'projeto') return amount === 1 ? 'projeto' : 'projetos';
  if (item.unit === 'folha') return amount === 1 ? 'folha' : 'folhas';
  return amount === 1 ? 'arquivo' : 'arquivos';
}

function formatIsoDate(value?: string) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

function formatRecordDate(record: Nc2Record) {
  return formatIsoDate(record.createdAt) || record.dataHora || 'Data não informada';
}

function kanbanStatusVisual(status?: Nc2Record['kanbanStatus']) {
  if (status === 'iniciado') return { label: 'Iniciado', className: 'bg-[#DBEAFE] text-[#1D4ED8]' };
  if (status === 'concluido') return { label: 'Concluído', className: 'bg-[#D1FAE5] text-[#047857]' };
  return { label: 'Criado', className: 'bg-[#FEE2E2] text-[#B91C1C]' };
}

export default function Revisoes({
  currentUser,
  lockedContractCode,
  preloadedData,
  selectedContract,
  selectedOs,
  onEditInPreenchimento,
}: RevisoesProps) {
  const lockedScope = filterValue(lockedContractCode);
  // Lider/Coordenador: edita qualquer registro e pode excluir. Reusa a mesma checagem de cargo
  // ja usada aqui antes; nao inventa role logic nova.
  const isLeaderOrCoordinator = useMemo(() => isNc2Leader(currentUser), [currentUser]);
  const canRestartKanban = isLeaderOrCoordinator || isNc2ConformidadeUser(currentUser);
  // "E o autor?" reusa canDeleteNote (mesma comparacao de email normalizado ja usada em
  // Anotacoes/Cronogramas pra dono de nota), so que aqui contra avaliadorEmail do registro.
  const canOpenInPreenchimento = (record: Nc2Record) => canEditNc2Record(currentUser, record);

  const [records, setRecords] = useState<Nc2Record[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [contractFilter, setContractFilter] = useState(() =>
    filterValue(lockedContractCode || selectedContract),
  );
  const [osFilter, setOsFilter] = useState(() => filterValue(selectedOs));
  const [buildingFilter, setBuildingFilter] = useState('');
  const [disciplineFilter, setDisciplineFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState<ItemType | ''>('');
  const [mostrarConcluidos, setMostrarConcluidos] = useState(false);
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());
  const [deleteError, setDeleteError] = useState('');
  const [savingItemKeys, setSavingItemKeys] = useState<Set<string>>(new Set());
  const [itemError, setItemError] = useState('');
  const [reinicioPendente, setReinicioPendente] = useState<Nc2Record | null>(null);
  const [observacaoReinicio, setObservacaoReinicio] = useState('');
  const [chatDrafts, setChatDrafts] = useState<Record<string, string>>({});

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError('');

    void getRecords(lockedScope)
      .then((next) => {
        if (!active) return;
        setRecords(next);
      })
      .catch((error: unknown) => {
        console.error('Erro ao carregar revisões:', error);
        if (!active) return;
        setRecords([]);
        setLoadError(
          error instanceof Error && error.message
            ? `Não foi possível carregar as revisões: ${error.message}`
            : 'Não foi possível carregar as revisões do Firebase.',
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [lockedScope]);

  useEffect(() => {
    if (!lockedScope) return;
    setContractFilter(lockedScope);
  }, [lockedScope]);

  const accessScopedRecords = useMemo(
    () =>
      records.filter(
        (record) => !lockedScope || sameContractCode(record.contratoCodigo, lockedScope),
      ),
    [lockedScope, records],
  );

  const contractOptions = useMemo(() => {
    const options = new Map<string, { code: string; name: string }>();
    (preloadedData?.registro?.contracts || []).forEach((contract) => {
      const code = getContractCode(contract);
      if (code) options.set(normalizeText(code), { code, name: getContractName(contract) });
    });
    accessScopedRecords.forEach((record) => {
      const code = String(record.contratoCodigo || '').trim();
      if (!code) return;
      const current = options.get(normalizeText(code));
      options.set(normalizeText(code), {
        code,
        name: current?.name || String(record.contratoNome || code).trim(),
      });
    });
    if (contractFilter && !options.has(normalizeText(contractFilter))) {
      options.set(normalizeText(contractFilter), { code: contractFilter, name: contractFilter });
    }
    return Array.from(options.values())
      .filter((option) => !lockedScope || sameContractCode(option.code, lockedScope))
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', { numeric: true }));
  }, [accessScopedRecords, contractFilter, lockedScope, preloadedData]);

  const allOsOptions = useMemo(() => {
    const options = new Map<string, OsOption>();
    (preloadedData?.registro?.osOptions || []).forEach((os) => {
      const code = getOsCode(os);
      if (!code) return;
      options.set(normalizeText(code), {
        code,
        name: getOsName(os),
        contractCode: getOsContractCode(os),
      });
    });
    accessScopedRecords.forEach((record) => {
      const code = String(record.osCodigo || record.os || '').trim();
      if (!code) return;
      const current = options.get(normalizeText(code));
      const recordName = String(record.os || '').trim();
      options.set(normalizeText(code), {
        code,
        name:
          current?.name && normalizeText(current.name) !== normalizeText(code)
            ? current.name
            : recordName || current?.name || code,
        contractCode: String(record.contratoCodigo || current?.contractCode || '').trim(),
      });
    });
    return Array.from(options.values()).sort((a, b) =>
      a.name.localeCompare(b.name, 'pt-BR', { numeric: true }),
    );
  }, [accessScopedRecords, preloadedData]);

  const osOptions = useMemo(
    () =>
      allOsOptions.filter(
        (option) => !contractFilter || sameContractCode(option.contractCode, contractFilter),
      ),
    [allOsOptions, contractFilter],
  );

  const contractOsScopedRecords = useMemo(
    () =>
      accessScopedRecords.filter((record) => {
        const isConcluded = record.kanbanStatus === 'concluido' || record.concluido === true;
        const matchesContract =
          !contractFilter || sameContractCode(record.contratoCodigo, contractFilter);
        const matchesOs = !osFilter || sameContractCode(record.osCodigo || record.os, osFilter);
        return (mostrarConcluidos || !isConcluded) && matchesContract && matchesOs;
      }),
    [accessScopedRecords, contractFilter, mostrarConcluidos, osFilter],
  );

  const buildingOptions = useMemo(() => {
    if (!osFilter) return [];
    return Array.from(
      new Set<string>(
        contractOsScopedRecords
          .map((record) => String(record.edificacao || '').trim())
          .filter(Boolean),
      ),
    ).sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true }));
  }, [contractOsScopedRecords, osFilter]);

  const disciplineOptions = useMemo(
    () =>
      Array.from(
        new Set<string>(
          contractOsScopedRecords
            .map((record) => String(record.disciplina || '').trim())
            .filter(Boolean),
        ),
      ).sort((a, b) => a.localeCompare(b, 'pt-BR')),
    [contractOsScopedRecords],
  );

  const visibleRecords = useMemo(
    () =>
      contractOsScopedRecords
        .filter(
          (record) =>
            !buildingFilter || normalizeText(record.edificacao) === normalizeText(buildingFilter),
        )
        .filter(
          (record) =>
            !disciplineFilter ||
            normalizeText(record.disciplina) === normalizeText(disciplineFilter),
        )
        .filter(
          (record) =>
            !typeFilter ||
            getRecordItems(record).some(
              (item) => isFilledItem(item) && getItemType(item) === typeFilter,
            ),
        )
        .sort((a, b) =>
          String(b.createdAt || b.updatedAt || '').localeCompare(
            String(a.createdAt || a.updatedAt || ''),
          ),
        ),
    [buildingFilter, contractOsScopedRecords, disciplineFilter, typeFilter],
  );

  const osByCode = useMemo(
    () => new Map(allOsOptions.map((option) => [normalizeText(option.code), option])),
    [allOsOptions],
  );

  const recordOsLabel = (record: Nc2Record) => {
    const code = String(record.osCodigo || '').trim();
    const option = osByCode.get(normalizeText(code || record.os));
    const recordedName = String(record.os || '').trim();
    const name = option?.name || recordedName || code;
    return displayNameWithCode(name, code);
  };

  // Confirmar/reabrir correcao de um item: mesmo gate Lider/Coordenador do arquivar,
  // mesmo updateRecord do Preenchimento (mesmo id, nunca cria documento novo).
  // ponytail: window.prompt pra nota de reabertura — o arquivo ja usa window.confirm; nada de modal novo.
  const runItemAction = async (
    record: Nc2Record,
    itemKey: string,
    build: (record: Nc2Record) => Nc2Record | null,
  ) => {
    const busyKey = `${record.id}::${itemKey}`;
    if (!isLeaderOrCoordinator || savingItemKeys.has(busyKey)) return;
    const nextRecord = build(record);
    if (!nextRecord) return;

    setSavingItemKeys((previous) => new Set(previous).add(busyKey));
    setItemError('');
    try {
      const saved = await updateRecord(nextRecord, {
        nome: currentUser.nome,
        email: currentUser.email,
      });
      setRecords((previous) => previous.map((item) => (item.id === saved.id ? saved : item)));
    } catch (error: unknown) {
      console.error('Erro ao atualizar correção do item:', error);
      setItemError(
        error instanceof Error && error.message
          ? `Não foi possível salvar a correção: ${error.message}`
          : 'Não foi possível salvar a correção no Firebase.',
      );
    } finally {
      setSavingItemKeys((previous) => {
        const next = new Set(previous);
        next.delete(busyKey);
        return next;
      });
    }
  };

  const handleConfirmCorrection = (record: Nc2Record, item: Nc2Item) =>
    runItemAction(record, item.itemKey, (current) =>
      window.confirm(`Confirmar que "${item.itemLabel || item.itemKey}" foi corrigido pelo terceiro?`)
        ? confirmItemCorrection(current, item.itemKey, currentUser.nome || currentUser.email || '')
        : null,
    );

  const handleReopenCorrection = (record: Nc2Record, item: Nc2Item) =>
    runItemAction(record, item.itemKey, (current) => {
      const note = window.prompt(
        `Reabrir "${item.itemLabel || item.itemKey}". Descreva a observação que volta o item para pendente:`,
        item.reaberturaObservacao || '',
      );
      const trimmed = String(note ?? '').trim();
      return trimmed ? reopenItemCorrection(current, item.itemKey, trimmed) : null;
    });

  const handleRestartKanban = (record: Nc2Record) => {
    if (!canRestartKanban || record.kanbanStatus !== 'concluido') return;
    setObservacaoReinicio('');
    setReinicioPendente(record);
  };

  const confirmarReinicioKanban = async () => {
    if (!reinicioPendente || !observacaoReinicio.trim()) return;
    const record = reinicioPendente;
    const trimmed = observacaoReinicio.trim();
    const nextItems = getRecordItems(record)
      .filter((item) => safeAmount(item.quantidadeT) > 0 && correctionStatus(item) === 'corrigido')
      .reduce((current, item) => reopenItemCorrection(current, item.itemKey, trimmed), record);
    const now = new Date().toISOString();
    const nextRecord: Nc2Record = {
      ...nextItems,
      kanbanStatus: 'criado',
      kanbanMovidoPor: currentUser.nome,
      kanbanObservacao: trimmed,
      kanbanObservacaoPor: currentUser.nome,
      observacoesHistorico: [
        ...(record.observacoesHistorico || []),
        { autor: currentUser.nome || currentUser.email, mensagem: `Kanban reiniciado: ${trimmed}`, dataHora: now },
      ],
    };
    try {
      const saved = await updateRecord(nextRecord, { nome: currentUser.nome, email: currentUser.email });
      setRecords((previous) => previous.map((item) => (item.id === saved.id ? saved : item)));
      setReinicioPendente(null);
      setObservacaoReinicio('');
    } catch (error: unknown) {
      setItemError(error instanceof Error ? error.message : 'Não foi possível reiniciar o Kanban.');
    }
  };

  const enviarComentarioChat = async (record: Nc2Record) => {
    const mensagem = String(chatDrafts[record.id] || '').trim();
    if (!isNc2ConformidadeUser(currentUser) || !mensagem) return;
    const saved = await updateRecord({
      ...record,
      observacoesHistorico: [...(record.observacoesHistorico || []), { autor: currentUser.nome || currentUser.email, mensagem, dataHora: new Date().toISOString() }],
    }, { nome: currentUser.nome, email: currentUser.email });
    setRecords((previous) => previous.map((item) => (item.id === saved.id ? saved : item)));
    setChatDrafts((previous) => ({ ...previous, [record.id]: '' }));
  };

  // So Lider/Coordenador arquiva. Firestore nega delete (firestore.rules:84); arquivar e um update
  // (arquivado:true) que as regras permitem, dado preservado e so some das telas ativas.
  const handleDelete = async (record: Nc2Record) => {
    if (!isLeaderOrCoordinator || deletingIds.has(record.id)) return;
    const label = recordOsLabel(record);
    if (!window.confirm(`Arquivar esta revisão da OS ${label || record.id}? O registro sai das listas ativas, mas os dados são preservados.`)) return;

    setDeletingIds((previous) => new Set(previous).add(record.id));
    setDeleteError('');
    try {
      await archiveRecord(record.id);
      setRecords((previous) => previous.filter((item) => item.id !== record.id));
    } catch (error: unknown) {
      console.error('Erro ao arquivar revisão:', error);
      setDeleteError(
        error instanceof Error && error.message
          ? `Não foi possível arquivar: ${error.message}`
          : 'Não foi possível arquivar o registro no Firebase.',
      );
    } finally {
      setDeletingIds((previous) => {
        const next = new Set(previous);
        next.delete(record.id);
        return next;
      });
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[320px] items-center justify-center">
        <div className="flex items-center gap-3 rounded-2xl bg-white px-5 py-4 text-[13px] font-bold text-[#757575] shadow-[0_10px_30px_-22px_rgba(15,23,42,0.45)]">
          <Loader2 size={16} className="animate-spin text-[#F05D28]" />
          Carregando revisões reais...
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div
        role="alert"
        className="rounded-2xl border border-[#FECACA] bg-[#FEF2F2] px-5 py-4 text-[13px] font-medium text-[#B91C1C]"
      >
        <p className="font-bold">Falha ao carregar revisões</p>
        <p className="mt-1">{loadError}</p>
        <p className="mt-1 text-[#991B1B]">Nenhum dado de demonstração foi exibido.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-6 pb-10 animate-in fade-in duration-500">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <h2 className="text-[20px] font-black text-[#2D2D2D]">Revisões</h2>
          <p className="mt-1 text-[13px] font-medium text-[#757575]">
            Registros enviados pelo Preenchimento e preparados para o acompanhamento das correções.
          </p>
        </div>
        <span className="text-[11px] font-extrabold uppercase tracking-[1px] text-[#94A3B8]">
          {visibleRecords.length} {visibleRecords.length === 1 ? 'registro' : 'registros'}
        </span>
      </div>

      <section aria-label="Filtros das revisões" className="flex flex-wrap gap-2">
        <label className={FILTER_CLASS}>
          <span className="block text-[9px] font-bold uppercase tracking-[1px] text-[#94A3B8]">
            Contrato
          </span>
          <SearchableSelect
            value={contractFilter}
            onChange={(event) => {
              setContractFilter(event.target.value);
              setOsFilter('');
              setBuildingFilter('');
              setDisciplineFilter('');
            }}
            disabled={Boolean(lockedScope)}
            title={lockedScope ? 'Contrato definido pelo seu acesso' : undefined}
            searchPlaceholder="Pesquisar contrato..."
            aria-label="Filtrar revisões por contrato"
            className={SELECT_CLASS}
          >
            <option value="">Todos</option>
            {contractOptions.map((contract) => (
              <option key={contract.code} value={contract.code}>
                {displayNameWithCode(contract.name, contract.code)}
              </option>
            ))}
          </SearchableSelect>
        </label>

        <label className={FILTER_CLASS}>
          <span className="block text-[9px] font-bold uppercase tracking-[1px] text-[#94A3B8]">
            OS
          </span>
          <SearchableSelect
            value={osFilter}
            onChange={(event) => {
              setOsFilter(event.target.value);
              setBuildingFilter('');
              setDisciplineFilter('');
            }}
            disabled={osOptions.length === 0}
            searchPlaceholder="Pesquisar OS..."
            aria-label="Filtrar revisões por OS"
            className={SELECT_CLASS}
          >
            <option value="">Todos</option>
            {osOptions.map((os) => (
              <option key={os.code} value={os.code}>
                {displayNameWithCode(os.name, os.code)}
              </option>
            ))}
          </SearchableSelect>
        </label>

        <label className={FILTER_CLASS}>
          <span className="block text-[9px] font-bold uppercase tracking-[1px] text-[#94A3B8]">
            Edificação
          </span>
          <SearchableSelect
            value={buildingFilter}
            onChange={(event) => setBuildingFilter(event.target.value)}
            disabled={!osFilter || buildingOptions.length === 0}
            title={!osFilter ? 'Selecione uma OS para filtrar por edificação' : undefined}
            searchPlaceholder="Pesquisar edificação..."
            aria-label="Filtrar revisões por edificação"
            className={SELECT_CLASS}
          >
            <option value="">Todos</option>
            {buildingOptions.map((building) => (
              <option key={building} value={building}>
                {building}
              </option>
            ))}
          </SearchableSelect>
        </label>

        <label className={FILTER_CLASS}>
          <span className="block text-[9px] font-bold uppercase tracking-[1px] text-[#94A3B8]">
            Disciplina
          </span>
          <SearchableSelect
            value={disciplineFilter}
            onChange={(event) => setDisciplineFilter(event.target.value)}
            disabled={disciplineOptions.length === 0}
            searchPlaceholder="Pesquisar disciplina..."
            aria-label="Filtrar revisões por disciplina"
            className={SELECT_CLASS}
          >
            <option value="">Todos</option>
            {disciplineOptions.map((discipline) => (
              <option key={discipline} value={discipline}>
                {discipline}
              </option>
            ))}
          </SearchableSelect>
        </label>

        <label className={FILTER_CLASS}>
          <span className="block text-[9px] font-bold uppercase tracking-[1px] text-[#94A3B8]">
            Tipo
          </span>
          <SearchableSelect
            value={typeFilter}
            onChange={(event) => setTypeFilter(event.target.value as ItemType | '')}
            searchPlaceholder="Pesquisar tipo..."
            aria-label="Filtrar revisões por tipo"
            className={SELECT_CLASS}
          >
            <option value="">Todos</option>
            {ITEM_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </SearchableSelect>
        </label>

        <label className="inline-flex min-h-[48px] items-center gap-2 rounded-xl border border-[#E5E7EB] bg-white px-3 py-2 text-[11px] font-bold text-[#475569]">
          <input type="checkbox" checked={mostrarConcluidos} onChange={(event) => setMostrarConcluidos(event.target.checked)} className="h-4 w-4 accent-[#F05D28]" />
          Mostrar concluídos
        </label>
      </section>

      {accessScopedRecords.length === 0 ? (
        <div className="rounded-2xl bg-white p-10 text-center shadow-[0_10px_30px_-22px_rgba(15,23,42,0.45)]">
          <p className="text-[15px] font-bold text-[#2D2D2D]">Nenhuma revisão registrada</p>
          <p className="mt-1 text-[13px] text-[#94A3B8]">
            Os registros enviados em Preenchimento aparecerão aqui.
          </p>
        </div>
      ) : visibleRecords.length === 0 ? (
        <div className="rounded-2xl bg-white p-10 text-center shadow-[0_10px_30px_-22px_rgba(15,23,42,0.45)]">
          <p className="text-[15px] font-bold text-[#2D2D2D]">Nenhum registro com estes filtros</p>
          <p className="mt-1 text-[13px] text-[#94A3B8]">Altere os filtros para ampliar a busca.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {visibleRecords.map((record) => {
            const status = getRecordStatus(record);
            const deleting = deletingIds.has(record.id);
            const canEditThis = canOpenInPreenchimento(record);
            const items = getRecordItems(record)
              .map((item, index) => ({ item, index }))
              .filter(({ item }) => isFilledItem(item) && (!typeFilter || getItemType(item) === typeFilter));
            const osLabel = recordOsLabel(record);
            const origin =
              normalizeText(record.origemAtividade) === 'terceirizado'
                ? 'Terceirizado'
                : normalizeText(record.origemAtividade) === 'interno'
                  ? 'Interno'
                  : 'Origem não informada';

            return (
              <article
                key={record.id}
                data-kanban-status={status.key}
                className="relative overflow-hidden rounded-2xl bg-white shadow-[0_10px_30px_-22px_rgba(15,23,42,0.45)]"
              >
                {(canEditThis || isLeaderOrCoordinator || canRestartKanban) && (
                  <div className="absolute right-4 top-4 z-10 flex items-center gap-2">
                    {canRestartKanban && record.kanbanStatus === 'concluido' && (
                      <button
                        type="button"
                        onClick={() => void handleRestartKanban(record)}
                        aria-label={`Reiniciar Kanban da OS ${osLabel}`}
                        className="inline-flex h-9 items-center gap-2 rounded-xl border border-[#FECACA] bg-white px-3 text-[11px] font-bold text-[#B91C1C] transition-colors hover:bg-[#FEF2F2]"
                      >
                        <RotateCcw size={13} />
                        Reiniciar Kanban
                      </button>
                    )}
                    {canEditThis && onEditInPreenchimento && (
                      <button
                        type="button"
                        onClick={() => onEditInPreenchimento(record)}
                        aria-label={`Editar revisão da OS ${osLabel} no Preenchimento`}
                        className="inline-flex h-9 items-center gap-2 rounded-xl border border-[#E5E7EB] bg-white px-3 text-[11px] font-bold text-[#475569] transition-colors hover:border-[#F7C7B7] hover:text-[#F05D28] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F05D28]/40"
                      >
                        <Pencil size={13} />
                        Editar
                      </button>
                    )}
                    {isLeaderOrCoordinator && (
                      <button
                        type="button"
                        onClick={() => void handleDelete(record)}
                        disabled={deleting}
                        aria-label={`Arquivar revisão da OS ${osLabel}`}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[#E5E7EB] bg-white text-[#94A3B8] transition-colors hover:border-[#FECACA] hover:text-[#DC2626] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F05D28]/40 disabled:opacity-50"
                      >
                        {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                      </button>
                    )}
                  </div>
                )}

                <details className="group" onToggle={(event) => { if ((event.currentTarget as HTMLDetailsElement).open) markNc2ChatSeen(record, currentUser.email); }}>
                  <summary className={`cursor-pointer list-none px-5 py-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#F05D28]/40 sm:px-6 ${canEditThis || isLeaderOrCoordinator ? 'pr-28 sm:pr-32' : ''}`}>
                    <div className="flex items-start gap-3">
                      <ChevronDown
                        size={17}
                        aria-hidden="true"
                        className="mt-1 shrink-0 text-[#94A3B8] transition-transform group-open:rotate-180"
                      />
                      <div className="grid min-w-0 flex-1 gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
                        <div className="min-w-0">
                          <h3 className="truncate text-[14px] font-black text-[#2D2D2D]">
                            OS {osLabel || 'não informada'}
                          </h3>
                          <p className="mt-1 text-[12px] font-medium text-[#757575]">
                            {record.edificacao || 'Edificação não informada'} · {record.disciplina || 'Disciplina não informada'} · {origin}
                          </p>
                        </div>
                        <p className="mt-1 text-[10px] font-medium text-[#94A3B8] lg:col-span-2">
                          {record.avaliador || 'Avaliador não informado'} · {formatRecordDate(record)}
                        </p>
                        <span className={`inline-flex w-fit items-center rounded-full px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[0.7px] ${kanbanStatusVisual(record.kanbanStatus).className}`}>
                            Kanban: {kanbanStatusVisual(record.kanbanStatus).label}
                          </span>
                          {hasUnreadNc2Chat(record, currentUser.email) && <MessageCircle size={19} className="rounded-full bg-[#FFF3EC] p-1 text-[#D94E1F] ring-1 ring-[#F05D28]/25" aria-label="Mensagem não lida" />}
                      </div>
                    </div>
                  </summary>

                  <div className="space-y-5 px-5 pb-5 pt-1 sm:px-6 sm:pb-6">
                    <div>
                      <h4 className="mb-3 text-[10px] font-extrabold uppercase tracking-[1px] text-[#94A3B8]">
                        Itens preenchidos
                      </h4>
                      {items.length === 0 ? (
                        <p className="rounded-xl bg-[#F8FAFC] px-4 py-3 text-[12px] text-[#757575]">
                          Nenhum item preenchido neste registro.
                        </p>
                      ) : (
                        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                          {items.map(({ item, index }) => {
                            const amountC = safeAmount(item.quantidadeC);
                            const amountT = safeAmount(item.quantidadeT);
                            const fixed = correctionStatus(item) === 'corrigido';
                            const itemLabel = item.itemLabel || item.itemKey || 'Item';

                            return (
                              <section
                                key={`${item.itemKey || itemLabel}-${index}`}
                                data-correction-status={amountT > 0 ? correctionStatus(item) : 'sem_nc'}
                                className="rounded-2xl border border-[#EEF2F7] bg-[#F8FAFC] p-4"
                              >
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                  <div>
                                    <h5 className="text-[13px] font-bold text-[#2D2D2D]">{itemLabel}</h5>
                                    <div className="mt-2 flex flex-wrap gap-2 text-[11px] font-bold">
                                      <span className="rounded-lg bg-white px-2.5 py-1 text-[#475569] ring-1 ring-inset ring-[#E2E8F0]">
                                        C: {amountC.toLocaleString('pt-BR')} {itemUnitLabel(item, amountC)}
                                      </span>
                                      <span className="rounded-lg bg-[#FFF3EC] px-2.5 py-1 text-[#F05D28] ring-1 ring-inset ring-[#FED7C6]">
                                        T: {amountT.toLocaleString('pt-BR')} {itemUnitLabel(item, amountT)}
                                      </span>
                                    </div>
                                  </div>
                                  <span
                                    className={`rounded-full px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[0.6px] ${
                                      amountT === 0
                                        ? 'bg-[#E2E8F0] text-[#475569]'
                                        : fixed
                                          ? 'bg-[#DCFCE7] text-[#047857]'
                                          : 'bg-[#FFEDD5] text-[#C2410C]'
                                    }`}
                                  >
                                    {amountT === 0 ? 'Sem NC' : fixed ? 'Corrigido' : 'Correção pendente'}
                                  </span>
                                </div>

                                {amountT > 0 && fixed && (
                                  <p className="mt-3 text-[11px] font-medium text-[#64748B]">
                                    {item.correcaoOrigem === 'outro_setor'
                                      ? `Corrigido por outro setor${item.correcaoSetor ? `: ${item.correcaoSetor}` : ''}`
                                      : item.correcaoOrigem === 'conformidade'
                                        ? 'Corrigido pela Conformidade'
                                        : 'Origem da correção não informada'}
                                    {item.corrigidoPor ? ` · ${item.corrigidoPor}` : ''}
                                    {item.corrigidoEm ? ` · ${formatIsoDate(item.corrigidoEm)}` : ''}
                                  </p>
                                )}
                                {amountT > 0 && !fixed && item.correcaoOrigem && (
                                  <p className="mt-3 text-[11px] font-semibold text-[#C2410C]">
                                    Encaminhado para {item.correcaoOrigem === 'outro_setor' ? 'Terceiro' : 'Conformidade'}
                                  </p>
                                )}
                                {item.reaberturaObservacao && (
                                  <p className="mt-2 whitespace-pre-wrap rounded-xl bg-white px-3 py-2 text-[11px] font-medium text-[#64748B] ring-1 ring-inset ring-[#E2E8F0]">
                                    Reaberto: {item.reaberturaObservacao}
                                  </p>
                                )}

                                {isLeaderOrCoordinator && amountT > 0 && item.correcaoOrigem === 'outro_setor' && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      void (fixed
                                        ? handleReopenCorrection(record, item)
                                        : handleConfirmCorrection(record, item))
                                    }
                                    disabled={savingItemKeys.has(`${record.id}::${item.itemKey}`)}
                                    aria-label={`${fixed ? 'Reabrir' : 'Confirmar correção de'} ${itemLabel}`}
                                    className={`mt-3 inline-flex h-8 items-center gap-2 rounded-xl border bg-white px-3 text-[11px] font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F05D28]/40 disabled:opacity-50 ${
                                      fixed
                                        ? 'border-[#E5E7EB] text-[#475569] hover:border-[#FED7C6] hover:text-[#C2410C]'
                                        : 'border-[#BBF7D0] text-[#047857] hover:bg-[#ECFDF5]'
                                    }`}
                                  >
                                    {savingItemKeys.has(`${record.id}::${item.itemKey}`) ? (
                                      <Loader2 size={13} className="animate-spin" />
                                    ) : fixed ? (
                                      <RotateCcw size={13} />
                                    ) : (
                                      <CheckCircle2 size={13} />
                                    )}
                                    {fixed ? 'Reabrir com observação' : 'OK, correção confirmada'}
                                  </button>
                                )}
                              </section>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    <div>
                      <h4 className="mb-2 text-[10px] font-extrabold uppercase tracking-[1px] text-[#94A3B8]">
                        Observações
                      </h4>
                      <p className="whitespace-pre-wrap rounded-xl bg-[#F8FAFC] px-4 py-3 text-[12px] font-medium text-[#64748B]">
                        {record.observacoes || 'Sem observações.'}
                      </p>
                    </div>

                    <div>
                      <h4 className="mb-2 text-[10px] font-extrabold uppercase tracking-[1px] text-[#94A3B8]">Chat do card</h4>
                      <div className="space-y-2">
                        {(record.observacoesHistorico || []).map((item, index) => (
                          <p key={`${item.dataHora}-${index}`} className="rounded-xl bg-[#F8FAFC] px-4 py-3 text-[12px] font-medium text-[#475569]"><strong>{item.autor}:</strong> {item.mensagem}</p>
                        ))}
                        {(record.observacoesHistorico || []).length === 0 && <p className="rounded-xl bg-[#F8FAFC] px-4 py-3 text-[12px] text-[#94A3B8]">Nenhum comentário no chat.</p>}
                      </div>
                      {isNc2ConformidadeUser(currentUser) && (
                        <div className="mt-3 flex items-end gap-2">
                          <textarea
                            value={chatDrafts[record.id] || ''}
                            onChange={(event) => setChatDrafts((previous) => ({ ...previous, [record.id]: event.target.value }))}
                            rows={2}
                            placeholder="Escreva para a equipe..."
                            className="min-w-0 flex-1 resize-none rounded-lg border border-[#E5E7EB] bg-white px-3 py-2 text-[12px] outline-none focus:border-[#F05D28]"
                          />
                          <button type="button" onClick={() => void enviarComentarioChat(record)} disabled={!chatDrafts[record.id]?.trim()} className="rounded-lg bg-[#F05D28] px-3 py-2 text-[11px] font-bold text-white disabled:opacity-40">Enviar</button>
                        </div>
                      )}
                    </div>

                    {itemError && (
                      <p
                        role="alert"
                        className="rounded-xl border border-[#FECACA] bg-[#FEF2F2] px-4 py-3 text-[12px] font-bold text-[#B91C1C]"
                      >
                        {itemError}
                      </p>
                    )}

                    {deleteError && (
                      <p
                        role="alert"
                        className="rounded-xl border border-[#FECACA] bg-[#FEF2F2] px-4 py-3 text-[12px] font-bold text-[#B91C1C]"
                      >
                        {deleteError}
                      </p>
                    )}

                  </div>
                </details>
              </article>
            );
          })}
        </div>
      )}
      {reinicioPendente && (
        <div className="fixed inset-0 z-[230] flex items-center justify-center bg-slate-950/35 p-4" onClick={() => setReinicioPendente(null)}>
          <div className="w-full max-w-md rounded-3xl border border-white/70 bg-white p-6 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#FFF3EC] text-[#F05D28]"><RotateCcw size={18} /></div>
            <h2 className="mt-4 text-[17px] font-black text-[#2D2D2D]">Reiniciar Kanban?</h2>
            <p className="mt-2 text-[13px] leading-relaxed text-[#64748B]">Explique por que este Kanban será reiniciado. Essa observação ficará registrada para a equipe.</p>
            <textarea autoFocus value={observacaoReinicio} onChange={(event) => setObservacaoReinicio(event.target.value)} rows={4} placeholder="Digite o motivo do reinício..." className="mt-4 w-full resize-none rounded-xl border border-[#E5E7EB] bg-[#F8FAFC] p-3 text-[13px] outline-none focus:border-[#F05D28]" />
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setReinicioPendente(null)} className="rounded-xl border border-[#E5E7EB] px-4 py-2.5 text-[12px] font-bold text-[#64748B] hover:bg-[#F8FAFC]">Cancelar</button>
              <button type="button" onClick={() => void confirmarReinicioKanban()} disabled={!observacaoReinicio.trim()} className="rounded-xl bg-[#F05D28] px-4 py-2.5 text-[12px] font-bold text-white hover:bg-[#D94E1F] disabled:cursor-not-allowed disabled:opacity-40">Reiniciar Kanban</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
