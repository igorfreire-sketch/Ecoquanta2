import { getApps } from 'firebase/app';
import { getAuth, type User } from 'firebase/auth';
import { serverTimestamp } from 'firebase/firestore';
import {
  fetchFirebaseCollection,
  isFirebaseConfigured,
  setFirebaseDocument,
  subscribeFirebaseCollection,
} from './firebaseDb';
import type {
  CreateFeedbackReportInput,
  FeedbackReport,
  FeedbackReportPayload,
  FeedbackReportStatus,
} from '../types/feedbackReport';

export const FEEDBACK_REPORTS_COLLECTION = 'feedbackReports';

const MAX_ROUTE_LENGTH = 500;
const MAX_TARGET_TOKEN_LENGTH = 200;
const MAX_TITLE_LENGTH = 200;
const MAX_BODY_LENGTH = 5_000;

/**
 * Deliberately conservative email key. It only applies the normalization the
 * existing app already uses (trim + lowercase); provider-specific rewrites
 * such as removing dots or plus-addresses could merge distinct accounts.
 */
export function canonicalizeEmail(value: unknown): string {
  return String(value || '').trim().toLowerCase();
}

export interface DuplicateEmailGroup<T = unknown> {
  canonicalEmail: string;
  users: T[];
}

/**
 * Read-only duplicate detector for admin diagnostics. It does not alter the
 * existing auth snapshot or choose which account should survive.
 */
export function findDuplicateCanonicalEmails<T extends { email?: unknown; id?: unknown }>(users: readonly T[]): DuplicateEmailGroup<T>[] {
  const groups = new Map<string, T[]>();
  users.forEach((user) => {
    const key = canonicalizeEmail(user.email) || canonicalizeEmail(user.id);
    if (!key) return;
    const group = groups.get(key) || [];
    group.push(user);
    groups.set(key, group);
  });
  return Array.from(groups.entries())
    .filter(([, group]) => group.length > 1)
    .map(([canonicalEmail, group]) => ({ canonicalEmail, users: group }));
}

function trimOptional(value: unknown, maxLength: number): string | undefined {
  const text = String(value ?? '').trim();
  return text ? text.slice(0, maxLength) : undefined;
}

function normalizeRatio(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  return Math.max(0, Math.min(1, value));
}

/**
 * Builds the safe payload boundary. Unknown fields are intentionally ignored;
 * the selector token is opaque and never generated from serialized DOM.
 */
export function normalizeFeedbackReportPayload(input: CreateFeedbackReportInput): FeedbackReportPayload {
  const kind = input?.kind;
  if (kind !== 'bug' && kind !== 'request' && kind !== 'idea') throw new Error('Tipo de demanda inválido.');

  const route = String(input?.route || '').trim().slice(0, MAX_ROUTE_LENGTH);
  if (!route) throw new Error('Informe a tela/rota da demanda.');

  const payload: FeedbackReportPayload = { kind, route };
  const targetToken = trimOptional(input?.targetToken, MAX_TARGET_TOKEN_LENGTH);
  const title = trimOptional(input?.title, MAX_TITLE_LENGTH);
  const body = trimOptional(input?.body, MAX_BODY_LENGTH);
  const xRatio = normalizeRatio(input?.xRatio);
  const yRatio = normalizeRatio(input?.yRatio);

  if (targetToken) payload.targetToken = targetToken;
  if (title) payload.title = title;
  if (body) payload.body = body;
  if (xRatio !== undefined) payload.xRatio = xRatio;
  if (yRatio !== undefined) payload.yRatio = yRatio;
  return payload;
}

function getCurrentFirebaseUser(): User {
  const app = getApps()[0];
  if (!app) throw new Error('Sessão Firebase indisponível. Entre novamente antes de enviar a demanda.');
  const user = getAuth(app).currentUser;
  if (!user || !user.uid) throw new Error('Sessão Firebase indisponível. Entre novamente antes de enviar a demanda.');
  // The rules bind authorEmail to the verified Auth token. Anonymous Auth has
  // no email and is therefore rejected rather than accepting a caller value.
  if (!user.email) throw new Error('A demanda exige uma conta autenticada com e-mail.');
  return user;
}

export interface CreatedFeedbackReport {
  id: string;
  report: FeedbackReport;
}

export async function createFeedbackReport(input: CreateFeedbackReportInput): Promise<CreatedFeedbackReport> {
  if (!isFirebaseConfigured()) throw new Error('Firebase indisponível para enviar a demanda.');
  const user = getCurrentFirebaseUser();
  const payload = normalizeFeedbackReportPayload(input);
  const id = typeof crypto?.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const authorEmail = canonicalizeEmail(user.email);

  await setFirebaseDocument(FEEDBACK_REPORTS_COLLECTION, id, {
    ...payload,
    status: 'new' satisfies FeedbackReportStatus,
    authorUid: user.uid,
    authorEmail,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  return {
    id,
    report: {
      ...payload,
      id,
      status: 'new',
      authorUid: user.uid,
      authorEmail,
      // Resolved by Firestore after the write. Null avoids pretending these
      // local placeholders are authoritative timestamps.
      createdAt: null,
      updatedAt: null,
    },
  };
}

export interface FeedbackReportListOptions {
  /** Set only for an admin screen; Firestore rules still enforce admin access. */
  includeAll?: boolean;
}

export async function listFeedbackReports(options: FeedbackReportListOptions = {}): Promise<FeedbackReport[]> {
  if (!isFirebaseConfigured()) return [];
  const user = getCurrentFirebaseUser();
  const rows = options.includeAll
    ? await fetchFirebaseCollection<FeedbackReport>(FEEDBACK_REPORTS_COLLECTION)
    : await fetchFirebaseCollection<FeedbackReport>(FEEDBACK_REPORTS_COLLECTION, { field: 'authorUid', value: user.uid });
  return rows.map((row) => ({ ...row, id: String(row.id || '') }));
}

export type FeedbackReportsChange = (reports: FeedbackReport[]) => void;

/**
 * Admin views use Firestore snapshots. Ordinary users use a scoped polling
 * fallback because the shared Firebase helper cannot express a filtered
 * onSnapshot query; every poll still uses authorUid == current uid.
 */
export function subscribeFeedbackReports(
  onChange: FeedbackReportsChange,
  options: FeedbackReportListOptions = {},
  onError?: (error: Error) => void,
): () => void {
  let stopped = false;
  const refresh = async () => {
    try {
      const reports = await listFeedbackReports(options);
      if (!stopped) onChange(reports);
    } catch (error) {
      if (!stopped) onError?.(error as Error);
    }
  };

  void refresh();
  if (options.includeAll) {
    const unsubscribe = subscribeFirebaseCollection(
      FEEDBACK_REPORTS_COLLECTION,
      () => void refresh(),
      (error) => onError?.(error),
    );
    return () => {
      stopped = true;
      unsubscribe();
    };
  }

  const timer = window.setInterval(() => void refresh(), 30_000);
  return () => {
    stopped = true;
    window.clearInterval(timer);
  };
}

// Short aliases keep the module convenient for small UI adapters.
export const create = createFeedbackReport;
export const list = listFeedbackReports;
export const subscribe = subscribeFeedbackReports;
