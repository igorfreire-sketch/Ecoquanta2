import {
  canEditNc2Record,
  canViewNc2Record,
  confirmItemCorrection,
  correctionStatus,
  isNc2Leader,
  reopenItemCorrection,
  type Nc2Item,
  type Nc2Record,
} from './ncStore';
import { sameContractCode } from '../../lib/contractCode';

export interface DashboardMetricSlice {
  name: string;
  value: number;
}

export interface DisciplineMetric {
  name: string;
  Interno: number;
  Terceirizado: number;
}

function normalizeText(value?: unknown) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function safeAmount(value: unknown) {
  if (typeof value !== 'number' && typeof value !== 'string') return 0;
  if (typeof value === 'string' && !value.trim()) return 0;
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, number) : 0;
}

function getItemType(item: Nc2Item) {
  const value = normalizeText(`${item.itemKey || ''} ${item.itemLabel || ''}`).replace(/\s+/g, '');
  if (value.includes('carimbo')) return 'Carimbo';
  if (value.includes('desenho')) return 'Desenho';
  if (value.includes('relatorio')) return 'Relatório';
  if (value.includes('faltaarquivo') || value.includes('arquivo')) return 'Arquivo';
  return 'Outros';
}

function addSlice(map: Map<string, DashboardMetricSlice>, name: string, value: number) {
  if (value <= 0) return;
  const label = name.trim() || 'Não informada';
  const key = normalizeText(label);
  const current = map.get(key);
  if (current) current.value += value;
  else map.set(key, { name: label, value });
}

function sortedSlices(map: Map<string, DashboardMetricSlice>) {
  return Array.from(map.values()).sort(
    (a, b) => b.value - a.value || a.name.localeCompare(b.name, 'pt-BR'),
  );
}

export function filterDashboardRecords(
  records: Nc2Record[],
  selectedContract: string,
  selectedOs: string,
  selectedMonth = '',
) {
  return (Array.isArray(records) ? records : []).filter(
    (record) =>
      (!normalizeText(selectedContract) ||
        sameContractCode(record?.contratoCodigo, selectedContract)) &&
      (!normalizeText(selectedOs) || sameContractCode(record?.osCodigo, selectedOs)) &&
      (!selectedMonth.trim() || String(record?.createdAt || '').startsWith(selectedMonth.trim())),
  );
}

export function buildDashboardMetrics(
  records: Nc2Record[],
  selectedDiscipline: string,
  selectedType: string,
  selectedOrigin = '',
) {
  const disciplineMap = new Map<string, DisciplineMetric>();
  const ncByDisciplineMap = new Map<string, DashboardMetricSlice>();
  const ncByTypeMap = new Map<string, DashboardMetricSlice>();
  const ncByCompanyMap = new Map<string, DashboardMetricSlice>();
  const ncByResolutionMap = new Map<string, DashboardMetricSlice>();
  const selectedDisciplineKey = normalizeText(selectedDiscipline);
  const selectedTypeKey = normalizeText(selectedType);
  let perfectFiles = 0;
  let internalAnalyzed = 0;
  let outsourcedAnalyzed = 0;
  let totalNonConformities = 0;

  (Array.isArray(records) ? records : []).forEach((record) => {
    if (!record || typeof record !== 'object') return;
    const origin = String(record.terceirizadaNome || '').trim() ? 'Terceirizado' : 'Interno';
    if (selectedOrigin && normalizeText(selectedOrigin) !== normalizeText(origin)) return;
    const itensFonte = Array.isArray(record.itens) && record.itens.length > 0
      ? record.itens
      : Array.isArray(record.itensT)
        ? record.itensT
        : [];
    const itens = itensFonte.filter((item): item is Nc2Item => Boolean(item && typeof item === 'object'));
    const disciplineName = String(record.disciplina || 'Sem disciplina').trim() || 'Sem disciplina';
    let recordNonConformities = 0;
    // Revisões exibe um registro como um item/card; as quatro linhas internas não são quatro itens.
    let recordAnalyzed = itens.length > 0 ? 1 : 0;

    itens.forEach((item) => {
      const nonConformities = safeAmount(item.quantidadeT);
      const itemType = getItemType(item);
      if (nonConformities === 0 || item.correcaoOrigem === 'conformidade') perfectFiles += 1;
      // O painel central conta itens preenchidos; C/T continuam sendo quantidades nos
      // gráficos de distribuição. Um item com C=1 e T=2 continua sendo 1 item analisado.
      if (nonConformities > 0) recordNonConformities += 1;
      addSlice(ncByTypeMap, itemType, nonConformities > 0 ? 1 : 0);
      if (nonConformities > 0) {
        const resolution = item.correcaoOrigem === 'conformidade'
          ? 'Conformidade'
          : 'Terceiro';
        addSlice(ncByResolutionMap, resolution, 1);
      }
    });

    totalNonConformities += recordNonConformities;
    addSlice(ncByDisciplineMap, disciplineName, recordNonConformities);
    if (origin === 'Terceirizado') {
      outsourcedAnalyzed += recordAnalyzed;
      addSlice(
        ncByCompanyMap,
        String(record.terceirizadaNome || '').trim() || 'Não informada',
        recordNonConformities,
      );
    } else {
      internalAnalyzed += recordAnalyzed;
    }

    if (selectedDisciplineKey && normalizeText(disciplineName) !== selectedDisciplineKey) return;
    const disciplineKey = normalizeText(disciplineName);
    const current = disciplineMap.get(disciplineKey) || {
      name: disciplineName,
      Interno: 0,
      Terceirizado: 0,
    };
    current[origin] += selectedTypeKey
      ? itens.filter((item) => normalizeText(getItemType(item)) === selectedTypeKey).length
      : recordAnalyzed;
    disciplineMap.set(disciplineKey, current);
  });

  return {
    disciplinesData: Array.from(disciplineMap.values())
      .filter((item) => item.Interno > 0 || item.Terceirizado > 0)
      .sort(
        (a, b) =>
          b.Interno + b.Terceirizado - (a.Interno + a.Terceirizado) ||
          a.name.localeCompare(b.name, 'pt-BR'),
      ),
    totalAnalyzedData: [
      { name: 'Internos analisados', value: internalAnalyzed, gradient: 'totalInternalGradient' },
      { name: 'Terceirizados analisados', value: outsourcedAnalyzed, gradient: 'totalOutsourcedGradient' },
    ].filter((item) => item.value > 0),
    ncByDiscipline: sortedSlices(ncByDisciplineMap),
    ncByType: sortedSlices(ncByTypeMap),
    ncByCompany: sortedSlices(ncByCompanyMap),
    ncByResolution: sortedSlices(ncByResolutionMap),
    internalAnalyzed,
    outsourcedAnalyzed,
    perfectFiles,
    totalNonConformities,
    totalAnalyzed: internalAnalyzed + outsourcedAnalyzed,
  };
}

if (
  typeof process !== 'undefined' &&
  process.argv?.[1]?.replace(/\\/g, '/').endsWith('/Conformidade.metrics.check.ts')
) {
  const records = [
    {
      contratoCodigo: 'MRK 01',
      osCodigo: 'OS 3',
      origemAtividade: 'interno',
      disciplina: 'Hidráulica',
      createdAt: '2025-03-10T12:00:00.000Z',
      itens: [
        { itemKey: 'carimbo', quantidadeC: 2, quantidadeT: 3, correcaoOrigem: 'conformidade' },
        { itemKey: 'desenho', quantidadeC: '4', quantidadeT: -9 },
        { itemKey: 'relatorio', quantidadeC: Symbol('inválido'), quantidadeT: 'inválido' },
      ],
    },
    {
      contratoCodigo: 'mrk 01',
      osCodigo: 'os 3',
      origemAtividade: 'terceirizado',
      terceirizadaNome: '',
      disciplina: 'Elétrica',
      createdAt: '2025-04-01T09:00:00.000Z',
      itens: [
        { itemKey: 'carimbo', quantidadeC: 1, quantidadeT: 2, correcaoOrigem: 'outro_setor' },
        { itemKey: 'faltaArquivo', quantidadeC: Infinity, quantidadeT: '4' },
      ],
    },
    {
      contratoCodigo: 'OUTRO',
      osCodigo: 'OS 9',
      origemAtividade: 'terceirizado',
      terceirizadaNome: 'Empresa Alfa',
      disciplina: 'Elétrica',
      itens: [{ itemKey: 'desenho', quantidadeC: 10, quantidadeT: 20 }],
    },
  ] as unknown as Nc2Record[];

  const filtered = filterDashboardRecords(records, ' mrk 01 ', 'OS 3');
  const metrics = buildDashboardMetrics(filtered, 'Hidraulica', 'Carimbo');
  const actual = {
    filtered: filtered.length,
    resolutions: metrics.ncByResolution,
    totals: [
      metrics.internalAnalyzed,
      metrics.outsourcedAnalyzed,
      metrics.perfectFiles,
      metrics.totalNonConformities,
      metrics.totalAnalyzed,
    ],
    donutTotal: metrics.totalAnalyzedData.reduce((sum, item) => sum + item.value, 0),
    chart: metrics.disciplinesData,
    disciplines: metrics.ncByDiscipline,
    types: metrics.ncByType,
    companies: metrics.ncByCompany,
  };
  const expected = {
    filtered: 2,
    resolutions: [
      { name: 'Terceiro', value: 2 },
      { name: 'Conformidade', value: 1 },
    ],
      totals: [2, 0, 3, 3, 2],
      donutTotal: 2,
    chart: [{ name: 'Hidráulica', Interno: 1, Terceirizado: 0 }],
    disciplines: [
      { name: 'Elétrica', value: 2 },
      { name: 'Hidráulica', value: 1 },
    ],
    types: [
      { name: 'Carimbo', value: 2 },
      { name: 'Arquivo', value: 1 },
    ].sort((a, b) => b.value - a.value),
    companies: [],
  };
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Conformidade metrics regression: ${JSON.stringify(actual)}`);
  }

  const mayFiltered = filterDashboardRecords(records, ' mrk 01 ', 'OS 3', '2025-05');
  if (mayFiltered.length !== 0) {
    throw new Error(`Conformidade month filter regression: ${JSON.stringify(mayFiltered)}`);
  }
  const marchFiltered = filterDashboardRecords(records, ' mrk 01 ', '', '2025-03');
  if (marchFiltered.length !== 1) {
    throw new Error(`Conformidade month filter regression: ${JSON.stringify(marchFiltered)}`);
  }

  const legacy = buildDashboardMetrics(
    [{
      contratoCodigo: 'LEGACY',
      osCodigo: 'OS 1',
      origemAtividade: 'interno',
      disciplina: 'Hidraulica',
      itens: [],
      itensT: [{ itemKey: 'carimbo', quantidadeC: 2, quantidadeT: 1 }],
    }] as unknown as Nc2Record[],
    '',
    '',
  );
  if (legacy.totalAnalyzed !== 1 || legacy.totalNonConformities !== 1) {
    throw new Error(`Conformidade legacy metrics regression: ${JSON.stringify(legacy)}`);
  }
  // Gate de edicao de registro existente (Revisoes botao + save do Preenchimento leem a mesma funcao).
  const owned = { avaliadorEmail: 'Autor@Empresa.com' };
  const gate: [boolean, boolean][] = [
    [canEditNc2Record({ role: 'Coordenador', email: 'outro@empresa.com' }, owned), true],
    [canEditNc2Record({ role: 'Líder de Projetos', email: 'outro@empresa.com' }, owned), true],
    [canEditNc2Record({ role: 'Projetista', email: 'autor@empresa.com' }, owned), true],
    [canEditNc2Record({ role: 'Projetista', email: 'outro@empresa.com' }, owned), false],
    [canEditNc2Record({ role: 'Projetista', email: '' }, { avaliadorEmail: '' }), false],
  ];
  gate.forEach(([actual, expected], index) => {
    if (actual !== expected) throw new Error(`Nc2 edit gate regression no caso ${index}`);
  });
  // Cenario real relatado: Lider cria 1 registro com 1 item Terceiro pendente (C=1, T=2).
  // (a) o card TEM que existir no Kanban da Principal - ele so carrega registros se isNc2Leader
  // aceitar o cargo, que na Administracao e texto livre;
  // (b) o donut "Arquivos totais analisados" conta ARQUIVOS (C+T), nao itens em revisao:
  // 1 item em revisao com C=1/T=2 vale 3 no total. Nao ha dupla contagem (itens OU itensT).
  const cargosDeLideranca = ['Líder', 'Lider', 'LÍDER', 'Líder de Projetos', 'Liderança', 'Líder/Coordenador', 'Coordenador', 'Coordenação', 'Coordenador Geral'];
  cargosDeLideranca.forEach((role) => {
    if (!isNc2Leader({ role, email: 'lider@empresa.com' })) {
      throw new Error(`Nc2 leader gate regression: cargo "${role}" deveria ver o Kanban`);
    }
  });
  ['Projetista', 'Analista', '', 'Terceirizada'].forEach((role) => {
    if (isNc2Leader({ role, email: 'x@empresa.com' })) {
      throw new Error(`Nc2 leader gate regression: cargo "${role}" nao e lideranca`);
    }
  });

  const registroDoLider = [{
    contratoCodigo: 'MRK 01',
    osCodigo: 'OS 3',
    origemAtividade: 'interno',
    disciplina: 'Hidráulica',
    createdAt: '2026-08-14T10:00:00.000Z',
    itens: [{
      itemKey: 'carimbo',
      itemLabel: 'Carimbo',
      quantidadeC: 1,
      quantidadeT: 2,
      correcaoOrigem: 'outro_setor',
      statusCorrecao: 'pendente',
    }],
    itensT: [{
      itemKey: 'carimbo',
      itemLabel: 'Carimbo',
      quantidadeC: 1,
      quantidadeT: 2,
      correcaoOrigem: 'outro_setor',
      statusCorrecao: 'pendente',
    }],
  }] as unknown as Nc2Record[];
  if (
    !canViewNc2Record({ role: 'Projetista', disciplina: 'Hidraulica' }, registroDoLider[0]) ||
    canViewNc2Record({ role: 'Projetista', disciplina: 'Eletrica' }, registroDoLider[0])
  ) {
    throw new Error('Nc2 discipline visibility regression');
  }
  // Mesmo predicado do card no Kanban (outroSetorItems + correctionStatus).
  const cardsDoKanban = registroDoLider.filter((record) =>
    record.itens.some(
      (item) => item.correcaoOrigem === 'outro_setor'
        && Number(item.quantidadeT) > 0
        && correctionStatus(item) === 'pendente',
    ));
  const metricasDoLider = buildDashboardMetrics(registroDoLider, '', '');
  if (
    cardsDoKanban.length !== 1 ||
    metricasDoLider.totalAnalyzed !== 1 ||
    metricasDoLider.perfectFiles !== 0 ||
    metricasDoLider.totalNonConformities !== 1 ||
    metricasDoLider.totalAnalyzed !== 1
  ) {
    throw new Error(`Nc2 cenario do lider regression: ${JSON.stringify(metricasDoLider)}`);
  }

  // Transicoes de correcao do item (Revisoes hoje, Kanban depois):
  // pendente -> corrigido (OK da Conformidade) -> pendente com observacao (reabertura).
  const pendingRecord = {
    id: 'NC2-TESTE',
    itens: [
      { itemKey: 'carimbo', quantidadeC: 1, quantidadeT: 2, correcaoOrigem: 'outro_setor', statusCorrecao: 'pendente' },
      { itemKey: 'desenho', quantidadeC: 3, quantidadeT: 0 },
    ],
    itensT: [
      { itemKey: 'carimbo', quantidadeC: 1, quantidadeT: 2, correcaoOrigem: 'outro_setor', statusCorrecao: 'pendente' },
    ],
    concluido: false,
    kanbanStatus: 'iniciado',
    kanbanMovidoPor: 'Igor Freire',
  } as unknown as Nc2Record;

  const confirmed = confirmItemCorrection(pendingRecord, 'carimbo', 'Ana Lider');
  // Arrastar pra "Concluido" no Kanban chama confirmItemCorrection: a coluna/autor do drag nao podem
  // ser apagados nesse caminho (o registro continua o mesmo documento).
  if (confirmed.kanbanStatus !== 'iniciado' || confirmed.kanbanMovidoPor !== 'Igor Freire') {
    throw new Error(`Nc2 kanban fields regression: ${JSON.stringify(confirmed)}`);
  }
  const confirmedItem = confirmed.itens[0];
  if (
    correctionStatus(confirmedItem) !== 'corrigido' ||
    confirmedItem.corrigidoPor !== 'Ana Lider' ||
    !confirmedItem.corrigidoEm ||
    correctionStatus(confirmed.itensT[0]) !== 'corrigido' ||
    confirmed.concluido !== true ||
    confirmed.id !== pendingRecord.id ||
    correctionStatus(pendingRecord.itens[0]) !== 'pendente'
  ) {
    throw new Error(`Nc2 confirm correction regression: ${JSON.stringify(confirmed)}`);
  }

  const reopened = reopenItemCorrection(confirmed, 'carimbo', '  faltou a folha 3  ');
  const reopenedItem = reopened.itens[0];
  if (
    correctionStatus(reopenedItem) !== 'pendente' ||
    reopenedItem.reaberturaObservacao !== 'faltou a folha 3' ||
    reopenedItem.corrigidoPor !== 'Ana Lider' ||
    correctionStatus(reopened.itensT[0]) !== 'pendente' ||
    reopened.concluido !== false ||
    reopened.itens[1].statusCorrecao !== undefined
  ) {
    throw new Error(`Nc2 reopen correction regression: ${JSON.stringify(reopened)}`);
  }

  console.log('Conformidade metrics regression check passed.');
}
