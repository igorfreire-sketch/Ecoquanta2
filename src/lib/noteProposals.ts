import type {
  AnnotationBanco,
  AnnotationChecklist,
  AnnotationSheet,
  AnnotationTextBlock,
} from '../components/CoordenacaoEngenharia/Anotacoes';

export interface NoteProposalCellChange {
  bancoId: string;
  row: number;
  col: number;
}

export interface NoteProposal {
  proposerName: string;
  proposerEmail: string;
  createdAt: string;
  baseUpdatedAt: string;
  candidateJson: string;
  changedFields: string[];
  changedTextBlockIds: string[];
  changedChecklistBlockIds: string[];
  changedBancoBlockIds: string[];
  changedBancoCells: NoteProposalCellChange[];
}

export interface NoteActor {
  nome?: string;
  email?: string;
}

export interface NoteSaveIntent {
  proposalDecision?: 'accept' | 'reject';
}

type Candidate = Record<string, unknown>;

const normalizeEmail = (value?: string) => String(value || '').trim().toLowerCase();

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, stableValue(item)]),
  );
}

const stableStringify = (value: unknown) => JSON.stringify(stableValue(value));

function effectiveBancos(sheet: AnnotationSheet): AnnotationBanco[] {
  if (Array.isArray(sheet.bancos) && sheet.bancos.length > 0) return sheet.bancos;
  if (sheet.colCount && Array.isArray(sheet.rows)) {
    return [{ id: 'legacy', colCount: sheet.colCount, rows: sheet.rows }];
  }
  return [];
}

function effectiveTextos(sheet: AnnotationSheet): AnnotationTextBlock[] {
  if (Array.isArray(sheet.textos) && sheet.textos.length > 0) return sheet.textos;
  return sheet.texto ? [{ id: 'legacy', texto: sheet.texto }] : [];
}

function candidateFromSheet(sheet: AnnotationSheet): Candidate {
  // Whitelist deliberada: anexos/assets desconhecidos continuam apenas na nota aceita e nunca
  // sao duplicados dentro da proposta. Bancos ficam seguros porque o candidato inteiro vira JSON.
  return {
    disciplina: sheet.disciplina || '',
    titulo: sheet.titulo || '',
    osCodigo: sheet.osCodigo ?? null,
    osCodigos: Array.isArray(sheet.osCodigos) ? sheet.osCodigos : [],
    disciplinas: Array.isArray(sheet.disciplinas) ? sheet.disciplinas : [],
    bancos: effectiveBancos(sheet),
    textos: effectiveTextos(sheet),
    checklists: Array.isArray(sheet.checklists) ? sheet.checklists : [],
    googleEventUrl: sheet.googleEventUrl ?? null,
    geminiNotesUrl: sheet.geminiNotesUrl ?? null,
    publica: sheet.publica !== false,
    linkedNoteIds: Array.isArray(sheet.linkedNoteIds) ? sheet.linkedNoteIds : [],
    marcadosUsuarios: Array.isArray(sheet.marcadosUsuarios) ? sheet.marcadosUsuarios : [],
    status: sheet.status || 'criado',
    edificacao: sheet.edificacao ?? null,
    projectId: sheet.projectId ?? null,
  };
}

function blocksChanged<T extends { id: string }>(before: T[], after: T[]): string[] {
  const beforeById = new Map(before.map((item) => [item.id, item]));
  const afterById = new Map(after.map((item) => [item.id, item]));
  return Array.from(new Set([...beforeById.keys(), ...afterById.keys()]))
    .filter((id) => stableStringify(beforeById.get(id)) !== stableStringify(afterById.get(id)));
}

function bancoCellState(banco: AnnotationBanco | undefined, row: number, col: number) {
  if (!banco || row >= banco.rows.length || col >= banco.colCount) return null;
  const key = `${row}:${col}`;
  return {
    value: banco.rows[row]?.[col] ?? '',
    style: banco.styles?.[key] ?? null,
    checklist: Boolean(banco.checklistCols?.includes(col) || banco.checklistCells?.includes(key)),
    checked: banco.checklistChecked?.[key] ?? false,
    items: banco.cellChecklists?.[key] ?? [],
  };
}

function changedBancoCells(before: AnnotationBanco[], after: AnnotationBanco[]): NoteProposalCellChange[] {
  const beforeById = new Map(before.map((item) => [item.id, item]));
  const afterById = new Map(after.map((item) => [item.id, item]));
  const changed: NoteProposalCellChange[] = [];

  Array.from(new Set([...beforeById.keys(), ...afterById.keys()])).forEach((bancoId) => {
    const oldBanco = beforeById.get(bancoId);
    const newBanco = afterById.get(bancoId);
    const rowCount = Math.max(oldBanco?.rows.length || 0, newBanco?.rows.length || 0);
    const colCount = Math.max(oldBanco?.colCount || 0, newBanco?.colCount || 0);
    for (let row = 0; row < rowCount; row += 1) {
      for (let col = 0; col < colCount; col += 1) {
        if (stableStringify(bancoCellState(oldBanco, row, col)) !== stableStringify(bancoCellState(newBanco, row, col))) {
          changed.push({ bancoId, row, col });
        }
      }
    }
  });

  return changed;
}

function bancoMetadata(banco: AnnotationBanco | undefined) {
  if (!banco) return null;
  return {
    id: banco.id,
    nome: banco.nome ?? null,
    colCount: banco.colCount,
    rowCount: banco.rows.length,
    colWidths: banco.colWidths ?? [],
    rowHeights: banco.rowHeights ?? [],
    merges: banco.merges ?? [],
  };
}

function changedBancoBlocks(before: AnnotationBanco[], after: AnnotationBanco[]): string[] {
  const beforeById = new Map(before.map((item) => [item.id, item]));
  const afterById = new Map(after.map((item) => [item.id, item]));
  return Array.from(new Set([...beforeById.keys(), ...afterById.keys()]))
    .filter((id) => stableStringify(bancoMetadata(beforeById.get(id))) !== stableStringify(bancoMetadata(afterById.get(id))));
}

export function diffNoteProposal(before: AnnotationSheet, after: AnnotationSheet) {
  const beforeCandidate = candidateFromSheet(before);
  const afterCandidate = candidateFromSheet(after);
  const changedFields = Object.keys(afterCandidate)
    .filter((key) => stableStringify(beforeCandidate[key]) !== stableStringify(afterCandidate[key]));
  const beforeBancos = beforeCandidate.bancos as AnnotationBanco[];
  const afterBancos = afterCandidate.bancos as AnnotationBanco[];

  return {
    candidateJson: JSON.stringify(afterCandidate),
    changedFields,
    changedTextBlockIds: blocksChanged(
      beforeCandidate.textos as AnnotationTextBlock[],
      afterCandidate.textos as AnnotationTextBlock[],
    ),
    changedChecklistBlockIds: blocksChanged(
      beforeCandidate.checklists as AnnotationChecklist[],
      afterCandidate.checklists as AnnotationChecklist[],
    ),
    changedBancoBlockIds: changedBancoBlocks(beforeBancos, afterBancos),
    changedBancoCells: changedBancoCells(beforeBancos, afterBancos),
  };
}

function proposalCandidate(proposal: NoteProposal): Candidate {
  let candidate: unknown;
  try {
    candidate = JSON.parse(proposal.candidateJson);
  } catch {
    throw new Error('A proposta desta nota esta corrompida e nao pode ser aplicada.');
  }
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    throw new Error('A proposta desta nota tem um formato invalido.');
  }
  return candidate as Candidate;
}

function applyCandidate(sheet: AnnotationSheet, candidate: Candidate): AnnotationSheet {
  const next = { ...sheet } as AnnotationSheet & Record<string, unknown>;
  Object.entries(candidate).forEach(([key, value]) => {
    if (value === null) delete next[key];
    else next[key] = value;
  });
  return next;
}

export function isNoteOwner(sheet: Pick<AnnotationSheet, 'autorEmail'>, email?: string) {
  const owner = normalizeEmail(sheet.autorEmail);
  return Boolean(owner) && owner === normalizeEmail(email);
}

export function previewNoteProposal(sheet: AnnotationSheet): AnnotationSheet {
  return sheet.pendingProposal ? applyCandidate(sheet, proposalCandidate(sheet.pendingProposal)) : sheet;
}

export function applyNoteSave(
  existing: AnnotationSheet | undefined,
  draft: AnnotationSheet,
  actor: NoteActor,
  now: string,
): AnnotationSheet {
  const actorEmail = normalizeEmail(actor.email);
  if (!actorEmail) throw new Error('Usuario sem e-mail nao pode salvar notas.');

  if (!existing) {
    const created = {
      ...draft,
      autorNome: actor.nome || draft.autorNome || actorEmail,
      autorEmail: actorEmail,
      criadoEm: draft.criadoEm || now,
      updatedAt: now,
    };
    delete created.pendingProposal;
    return created;
  }

  if (isNoteOwner(existing, actorEmail)) {
    const acceptedProposal = existing.pendingProposal
      ? applyCandidate(existing, proposalCandidate(existing.pendingProposal))
      : existing;
    const updated = {
      ...acceptedProposal,
      ...draft,
      id: existing.id,
      autorNome: existing.autorNome,
      autorEmail: existing.autorEmail,
      criadoEm: existing.criadoEm,
      updatedAt: now,
    };
    delete updated.pendingProposal;
    return updated;
  }

  const linked = (existing.marcadosUsuarios || []).some((email) => normalizeEmail(email) === actorEmail);
  if (!linked) throw new Error('Apenas o autor ou um usuario vinculado pode alterar esta nota.');
  if (existing.pendingProposal) throw new Error('Esta nota ja possui uma proposta aguardando revisao do autor.');

  const changes = diffNoteProposal(existing, draft);
  if (changes.changedFields.length === 0) throw new Error('Nenhuma alteracao foi encontrada para enviar.');
  return {
    ...existing,
    pendingProposal: {
      proposerName: actor.nome || actorEmail,
      proposerEmail: actorEmail,
      createdAt: now,
      baseUpdatedAt: existing.updatedAt || '',
      ...changes,
    },
  };
}

function assertOwnerReview(sheet: AnnotationSheet, ownerEmail?: string): NoteProposal {
  if (!isNoteOwner(sheet, ownerEmail)) throw new Error('Apenas o autor da nota pode revisar esta proposta.');
  if (!sheet.pendingProposal) throw new Error('Esta nota nao possui proposta pendente.');
  return sheet.pendingProposal;
}

export function acceptNoteProposal(sheet: AnnotationSheet, ownerEmail: string, now: string): AnnotationSheet {
  const proposal = assertOwnerReview(sheet, ownerEmail);
  if ((sheet.updatedAt || '') !== proposal.baseUpdatedAt) {
    throw new Error('Conflito: a nota foi alterada pelo autor depois desta proposta. Rejeite a proposta e solicite uma nova.');
  }
  const accepted = applyCandidate(sheet, proposalCandidate(proposal));
  accepted.id = sheet.id;
  accepted.autorNome = sheet.autorNome;
  accepted.autorEmail = sheet.autorEmail;
  accepted.criadoEm = sheet.criadoEm;
  accepted.updatedAt = now;
  delete accepted.pendingProposal;
  return accepted;
}

export function rejectNoteProposal(sheet: AnnotationSheet, ownerEmail: string): AnnotationSheet {
  assertOwnerReview(sheet, ownerEmail);
  const rejected = { ...sheet };
  delete rejected.pendingProposal;
  return rejected;
}

export function proposalChangesCell(proposal: NoteProposal | undefined, bancoId: string, row: number, col: number) {
  return Boolean(proposal?.changedBancoCells.some((cell) => cell.bancoId === bancoId && cell.row === row && cell.col === col));
}
