// Definicao das 3 grades (ordem/rotulos = planilhas originais; ESPEC §3, F0 §5.4-5.6).
import { ceptComponentId, ceptEdificacaoId, type CeptEditableCollection } from '../../../lib/cept/data';
import {
  CEPT_OS061, classifyDeliverable, diasUteis, isDisciplineAllowedInProject, normalizeDisciplineCode, parseDateInfo,
  type CeptComponenteDoc, type CeptLodKey, type CeptStatus,
} from '../../../lib/cept/rules';
import { MODOS, parseBool, parseDate, parseDays, parseFinal, parseModo, parseNota, parseStatus, parseText, type Parsed } from './parse';
import type { Cell, CellWrite, Column } from './SheetGrid';

type WithId<T> = T & { id: string; version?: number };
export type ComponenteDoc = WithId<CeptComponenteDoc>;
export type PlanejamentoDoc = WithId<{
  osCode: string; projectCode: string; sourceRow: number; edificacao?: string; disciplinaTexto?: string;
  nota?: number | null; modo?: string | null; fechado?: boolean; terceirizado?: string;
  lod?: Partial<Record<CeptLodKey, number | null>>; finalNota?: string; lodExcluiDoTotal?: string[] | null;
  extra?: { p?: string; comentarios?: unknown[] };
}>;
export type EdificacaoDoc = WithId<{ osCode: string; projectCode: string; nome?: string; bimCompatibilidade?: string }>;
export type MedicaoDoc = WithId<{
  osCode: string; projectCode: string; sourceRow: number; edificacao?: string; disciplinaTexto?: string;
  terceirizado?: string; responsavelInterno?: string; etapas?: Record<string, { tec?: boolean; con?: boolean }>;
}>;

export const PROJECTS = Object.keys(CEPT_OS061.projectNames).sort();

const write = (collection: CeptEditableCollection, id: string, doc: object | undefined, identity: Record<string, unknown>) =>
  <T>(parsed: Parsed<T>, toPatch: (v: T) => Record<string, unknown>): CellWrite | { error: string } => {
    if (parsed.error !== undefined) return { error: parsed.error };
    const d = (doc ?? {}) as Record<string, unknown> & { version?: number };
    return { collection, id, version: Number(d.version || 0), doc: d, patch: { ...identity, ...toPatch(parsed.value as T) } };
  };

// ---------------- Grade 1: Entregaveis (planilha V2) ----------------
export interface EntregavelRow {
  sourceRow: number; disciplineCode: string; sourceLabel: string; sourceType: string;
  byProject: Record<string, ComponenteDoc | undefined>;
  firstOfDiscipline: boolean;
}

export function buildEntregavelRows(docs: ComponenteDoc[]): EntregavelRow[] {
  const map = new Map<number, EntregavelRow>();
  docs.forEach((d) => {
    let row = map.get(d.sourceRow);
    if (!row) {
      row = { sourceRow: d.sourceRow, disciplineCode: normalizeDisciplineCode(d.disciplineCode), sourceLabel: d.sourceLabel, sourceType: d.sourceType, byProject: {}, firstOfDiscipline: false };
      map.set(d.sourceRow, row);
    }
    row.byProject[d.projectCode] = d;
  });
  const rows = [...map.values()].sort((a, b) => a.sourceRow - b.sourceRow);
  rows.forEach((r, i) => { r.firstOfDiscipline = i === 0 || rows[i - 1].disciplineCode !== r.disciplineCode; });
  return rows;
}

const STATUS_TEXT: Record<CeptStatus, string> = { delivered: 'TRUE', pending: 'FALSE', na: '-', unknown: '?' };

export function entregavelColumns(rows: EntregavelRow[], osCode: string): Column<EntregavelRow>[] {
  const writer = (row: EntregavelRow, p: string) => {
    const d = row.byProject[p];
    return write('componentes', d?.id ?? ceptComponentId(osCode, p, row.disciplineCode, row.sourceType), d, {
      osCode, projectCode: p, disciplineCode: row.disciplineCode, sourceLabel: row.sourceLabel, sourceType: row.sourceType, sourceRow: row.sourceRow,
      ...(d ? {} : { status: 'pending', dateRaw: '' }),
    });
  };
  const blocked = (row: EntregavelRow, p: string) => (isDisciplineAllowedInProject(row.disciplineCode, p) ? '' : `${row.disciplineCode} só existe no projeto 001`);
  const isNa = (i: number, p: string) => i >= 0 && rows[i]?.byProject[p]?.status === 'na';

  const cols: Column<EntregavelRow>[] = [
    { key: 'disc', label: 'Disciplina', width: 88, sticky: true, cell: (row) => ({ kind: 'ro', text: row.disciplineCode, display: row.firstOfDiscipline ? row.disciplineCode : '', hideTop: !row.firstOfDiscipline }) },
    {
      key: 'item', label: 'Entregável', width: 232, sticky: true,
      cell: (row) => {
        const c = classifyDeliverable(row.sourceLabel, row.sourceType);
        return { kind: 'ro', text: `${row.sourceLabel} ${row.sourceType}`.trim(), display: `${row.sourceLabel} · ${row.sourceType}`, hint: `${c.familyLabel} · ${c.format} · ${c.variantLabel}` };
      },
    },
  ];
  PROJECTS.forEach((p) => {
    const group = `${p} ${CEPT_OS061.projectNames[p]}`;
    cols.push({
      key: `${p}-s`, label: 'Status', group, width: 56,
      cell: (row, i) => {
        const d = row.byProject[p];
        const why = blocked(row, p);
        if (why) return { kind: 'status', text: '', disabled: why };
        const status = d?.status ?? 'pending';
        const sameDisc = i > 0 && rows[i - 1].disciplineCode === row.disciplineCode;
        return {
          kind: 'status', text: STATUS_TEXT[status], tone: status, naCont: status === 'na' && sameDisc && isNa(i - 1, p),
          hint: status === 'unknown' ? 'Não determinado (veio vazio da planilha); qualquer edição resolve' : undefined,
          commit: (t) => writer(row, p)(parseStatus(t), (v) => ({ status: v })),
        };
      },
    });
    cols.push({
      key: `${p}-d`, label: 'Data', group, width: 104,
      cell: (row, i) => {
        const d = row.byProject[p];
        const why = blocked(row, p);
        if (why) return { kind: 'date', text: '', disabled: why };
        const raw = d?.dateRaw ?? '';
        if (d?.status === 'na') {
          const sameDisc = i > 0 && rows[i - 1].disciplineCode === row.disciplineCode;
          return { kind: 'date', text: raw, display: raw, tone: 'na', naCont: sameDisc && isNa(i - 1, p), commit: (t) => writer(row, p)(parseDate(t), (v) => ({ dateRaw: v })) };
        }
        const info = parseDateInfo(raw);
        const noYear = !!raw && !info.iso && !!info.short && info.full === raw && /^\d{1,2}\/\d{1,2}$/.test(raw);
        return {
          kind: 'date', text: raw, display: noYear ? `${raw} sem ano` : raw,
          dot: d?.status === 'pending' && !!raw,
          hint: d?.status === 'pending' && raw ? 'Data preenchida sem check: conta como pendente' : noYear ? 'Sem ano: não entra nas regras de alerta' : undefined,
          commit: (t) => writer(row, p)(parseDate(t), (v) => ({ dateRaw: v })),
        };
      },
    });
  });
  return cols;
}

// ---------------- Grade 2: Responsabilidades e LOD (Planilha1) ----------------
const firstOfProject = <T extends { projectCode: string }>(rows: T[], i: number) => i === 0 || rows[i - 1].projectCode !== rows[i].projectCode;
const commentText = (c: unknown) => {
  if (typeof c === 'string') return c;
  const o = (c ?? {}) as Record<string, unknown>;
  return [o.cell ?? o.celula, o.autor ?? o.author, o.texto ?? o.text].filter(Boolean).join(': ');
};

export function planejamentoColumns(rows: PlanejamentoDoc[], edificacoes: Record<string, EdificacaoDoc>, osCode: string): Column<PlanejamentoDoc>[] {
  const w = (row: PlanejamentoDoc) => write('planejamento', row.id, row, { osCode, projectCode: row.projectCode, sourceRow: row.sourceRow });
  const edif = (row: PlanejamentoDoc) => {
    const e = edificacoes[row.projectCode];
    return write('edificacoes', e?.id ?? ceptEdificacaoId(osCode, row.projectCode), e, { osCode, projectCode: row.projectCode, ...(e ? {} : { nome: row.edificacao ?? '', bimCompatibilidade: '' }) });
  };
  const merged = (row: PlanejamentoDoc, i: number, text: string, commit: Cell['commit']): Cell =>
    firstOfProject(rows, i) ? { kind: 'text', text, commit } : { kind: 'ro', text, display: '', hideTop: true, hint: 'Mesclado com a linha acima' };

  const lodCol = (k: CeptLodKey, label: string): Column<PlanejamentoDoc> => ({
    key: `lod${k}`, label, width: 72,
    cell: (row) => {
      const v = row.lod?.[k];
      return { kind: 'int', text: v == null ? '' : String(v), commit: (t) => w(row)(parseDays(t), (n) => ({ lod: { [k]: n } })) };
    },
  });

  return [
    { key: 'A', label: 'ID', width: 56, sticky: true, cell: (row, i) => ({ kind: 'ro', text: row.projectCode, display: firstOfProject(rows, i) ? row.projectCode : '', hideTop: !firstOfProject(rows, i) }) },
    {
      key: 'B', label: 'Edificação', width: 160, sticky: true,
      cell: (row, i) => merged(row, i, edificacoes[row.projectCode]?.nome ?? row.edificacao ?? '', (t) => edif(row)(parseText(t, 200), (v) => ({ nome: v }))),
    },
    {
      key: 'C', label: 'Disciplina', width: 200, sticky: true,
      cell: (row) => {
        const notes = (row.extra?.comentarios ?? []).map(commentText).filter(Boolean).join(' | ');
        return { kind: 'text', text: row.disciplinaTexto ?? '', note: notes || undefined, commit: (t) => w(row)(parseText(t, 200), (v) => ({ disciplinaTexto: v })) };
      },
    },
    { key: 'D', label: 'Nota de desempenho', width: 88, cell: (row) => ({ kind: 'select', options: ['1', '2', '3', '4', '5', '6'], text: row.nota == null ? '' : String(row.nota), commit: (t) => w(row)(parseNota(t), (v) => ({ nota: v })) }) },
    { key: 'E', label: 'Interno/Terceiro', width: 128, cell: (row) => ({ kind: 'select', options: MODOS, text: row.modo ?? '', commit: (t) => w(row)(parseModo(t), (v) => ({ modo: v })) }) },
    { key: 'F', label: 'Fechado', width: 72, cell: (row) => ({ kind: 'check', text: row.fechado ? 'TRUE' : 'FALSE', commit: (t) => w(row)(parseBool(t), (v) => ({ fechado: v })) }) },
    { key: 'G', label: 'TERCEIRIZADO', width: 160, cell: (row) => ({ kind: 'text', text: row.terceirizado ?? '', commit: (t) => w(row)(parseText(t, 200), (v) => ({ terceirizado: v })) }) },
    {
      key: 'H', label: 'Compatibilização (BIM)', width: 160,
      cell: (row, i) => merged(row, i, edificacoes[row.projectCode]?.bimCompatibilidade ?? '', (t) => edif(row)(parseText(t, 300), (v) => ({ bimCompatibilidade: v }))),
    },
    {
      key: 'I', label: 'Dias úteis', width: 88,
      cell: (row) => {
        const total = diasUteis(row.lod ?? {}, row.lodExcluiDoTotal ?? null);
        const excl = (row.lodExcluiDoTotal ?? []).length > 0;
        return { kind: 'ro', text: total == null ? '' : String(total), display: total == null ? '' : excl ? `${total} (sem 100/200)` : String(total), hint: excl ? 'Soma exclui LOD 100 e 200 (como na planilha)' : 'Soma de LOD 100 a Finalização Arq.' };
      },
    },
    lodCol('100', 'LOD 100'), lodCol('200', 'LOD 200'), lodCol('300', 'LOD 300'), lodCol('350', 'LOD 350'), lodCol('400', 'LOD 400'),
    {
      key: 'O', label: 'Finalização Arq.', width: 128,
      cell: (row) => {
        const n = row.lod?.final;
        const text = n != null ? String(n) : row.finalNota ?? '';
        return {
          kind: 'text', text, italic: n == null && !!row.finalNota, hint: n == null && row.finalNota ? 'Texto: fica fora da soma de dias úteis' : undefined,
          commit: (t) => w(row)(parseFinal(t), (v) => ({ lod: { final: v.final }, finalNota: v.finalNota })),
        };
      },
    },
    { key: 'P', label: 'P', width: 88, cell: (row) => ({ kind: 'text', text: row.extra?.p ?? '', commit: (t) => w(row)(parseText(t, 200), (v) => ({ extra: { p: v } })) }) },
  ];
}

// ---------------- Grade 3: Medicoes ----------------
// Cabecalho F2..Q2 = texto fixo da planilha (peso / acumulado), nao calculado (B14).
export const ETAPAS = [
  { n: '1', label: 'Etapa 1 · 10% · 10% acum.' },
  { n: '2', label: 'Etapa 2 · 20% · 30% acum.' },
  { n: '3', label: 'Etapa 3 · 20% · 50% acum.' },
  { n: '4', label: 'Etapa 4 · 20% · 70% acum.' },
  { n: '5', label: 'Etapa 5 · 20% · 90% acum.' },
  { n: '6', label: 'Etapa 6 · 10% · 100% acum.' },
];

export function medicaoColumns(rows: MedicaoDoc[], osCode: string): Column<MedicaoDoc>[] {
  const w = (row: MedicaoDoc) => write('medicoes', row.id, row, { osCode, projectCode: row.projectCode, sourceRow: row.sourceRow });
  const cols: Column<MedicaoDoc>[] = [
    { key: 'A', label: 'ID', width: 56, sticky: true, cell: (row, i) => ({ kind: 'ro', text: row.projectCode, display: firstOfProject(rows, i) ? row.projectCode : '', hideTop: !firstOfProject(rows, i) }) },
    { key: 'B', label: 'Edificação', width: 140, sticky: true, cell: (row, i) => ({ kind: 'ro', text: row.edificacao ?? '', display: firstOfProject(rows, i) ? row.edificacao ?? '' : '', hideTop: !firstOfProject(rows, i) }) },
    { key: 'C', label: 'Disciplinas', width: 180, sticky: true, cell: (row) => ({ kind: 'ro', text: row.disciplinaTexto ?? '' }) },
    { key: 'D', label: 'TERCEIRIZADO', width: 160, cell: (row) => ({ kind: 'text', text: row.terceirizado ?? '', commit: (t) => w(row)(parseText(t, 200), (v) => ({ terceirizado: v })) }) },
    { key: 'E', label: 'Respon.', width: 160, cell: (row) => ({ kind: 'text', text: row.responsavelInterno ?? '', commit: (t) => w(row)(parseText(t, 200), (v) => ({ responsavelInterno: v })) }) },
  ];
  ETAPAS.forEach(({ n, label }) => (['tec', 'con'] as const).forEach((f) => cols.push({
    key: `${n}${f}`, label: f === 'tec' ? 'Tec.' : 'Con.', group: label, width: 56,
    cell: (row) => ({ kind: 'check', text: row.etapas?.[n]?.[f] ? 'TRUE' : 'FALSE', commit: (t) => w(row)(parseBool(t), (v) => ({ etapas: { [n]: { [f]: v } } })) }),
  })));
  return cols;
}

// Medicoes A69:A106, texto literal (A §3.5).
export const CRITERIOS_MEDICAO: string[] = [
  'Critérios para Medição de Serviços Prestados por Terceiros',
  'A medição será feita conforme o avanço real dos serviços (LOD).',
  'Cada etapa deverá ser comprovada por entregas verificáveis no ACC na pasta compartilhado.',
  'O pagamento dependerá da análise e aceite da contratante.',
  '',
  '1. Mobilização — 10%',
  'Corresponde ao início efetivo dos trabalhos.',
  'Inclui análise dos documentos recebidos, entendimento do escopo e organização inicial da equipe.',
  'Também inclui a preparação dos arquivos-base e o alinhamento dos procedimentos de trabalho.',
  '',
  '2. Estudo Técnico Inicial, Planejamento da Solução e Modelagem Inicial no ACC — 20%',
  'Corresponde à análise técnica inicial do serviço contratado.',
  'Inclui a avaliação das informações disponíveis, identificação de pendências e definição da estratégia de desenvolvimento.',
  'Também inclui a modelagem inicial no ACC dos sistemas adotados.',
  'Essa modelagem deverá representar a solução técnica preliminar prevista para o projeto.',
  'A entrega deve permitir que a contratante compreenda o caminho técnico proposto pelo terceiro antes do avanço da modelagem definitiva.',
  '',
  '3. Modelagem Técnica Desenvolvida — 20%',
  'Corresponde ao avanço da modelagem dos sistemas.',
  'Nesta etapa, os elementos devem apresentar dimensões, posições/coordenadas e informações técnicas compatíveis com o desenvolvimento do projeto.',
  'A entrega deve permitir análise técnica mais completa pela contratante.',
  'Deve possibilitar a identificação de interferências relevantes com outras disciplinas e iníciio da compatibilização.',
  '',
  '4. Modelagem Compatibilizada — 20%',
  'Corresponde à modelagem ajustada após análise de interferências.',
  'Inclui correções de posicionamento, ajustes entre disciplinas e adequação dos sistemas ao conjunto do projeto.',
  'A entrega deve apresentar as issues solucionadas.',
  'O modelo deve estar suficientemente consolidado para subsidiar a documentação técnica.',
  '',
  '5. Documentação Técnica e Modelo Final — 20%',
  'Corresponde à consolidação final do modelo e à elaboração da documentação técnica.',
  'Inclui pranchas, detalhes, memoriais, quantitativos, relatórios e demais documentos previstos no escopo.',
  'A entrega deve estar organizada, revisada e compatível com a emissão final do serviço contratado.',
  '',
  '6. Revisão Final — 10%',
  'Corresponde aos ajustes finais após análise da contratante.',
  'Inclui correções, complementações e organização dos arquivos finais.',
  'A etapa será medida após a entrega final revisada.',
];
