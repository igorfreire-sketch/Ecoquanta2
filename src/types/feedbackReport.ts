import type { Timestamp } from 'firebase/firestore';

export type FeedbackReportKind = 'bug' | 'request' | 'idea';
export type FeedbackReportStatus = 'new' | 'triage' | 'planned' | 'doing' | 'done' | 'archived';

/**
 * Timestamp returned by Firestore. The wider union keeps the type usable by
 * the UI while a document is being created or when old exports are loaded.
 */
export type FeedbackReportTimestamp = Timestamp | Date | string | null;

/**
 * The only client-provided fields accepted by the feedback contract.
 * `targetToken` is an opaque, application-generated selector token; it must
 * never contain DOM, HTML, screenshots, field values, cookies or secrets.
 */
export interface FeedbackReportPayload {
  kind: FeedbackReportKind;
  route: string;
  targetToken?: string;
  xRatio?: number;
  yRatio?: number;
  body?: string;
  title?: string;
}

export interface CreateFeedbackReportInput extends FeedbackReportPayload {}

export interface FeedbackReport extends FeedbackReportPayload {
  id: string;
  status: FeedbackReportStatus;
  authorUid: string;
  authorEmail: string;
  createdAt: FeedbackReportTimestamp;
  updatedAt: FeedbackReportTimestamp;
  /** Atualização curta registrada pelo worker local do Codex. */
  solutionNote?: string;
}
