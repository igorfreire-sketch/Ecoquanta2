import { getAuth } from 'firebase/auth';
import { getApp } from 'firebase/app';
import { collection, deleteField, doc, getDoc, getFirestore, runTransaction, serverTimestamp, setDoc, Timestamp, updateDoc } from 'firebase/firestore';
import { ensureGoogleFirebaseAuth } from './firebaseDb';

export interface EapPreview {
  previewId: string;
  os: string;
  version: number;
  sha256: string;
  rows: string[][];
}

export interface ConvertedProject { rows: string[][]; rootName: string }

const DEFAULT_EAP_SERVICE_URL = 'https://ecoquanta-eap.onrender.com';

function serviceUrl(): string {
  const url = String(import.meta.env.VITE_EAP_API_URL || DEFAULT_EAP_SERVICE_URL).trim().replace(/\/$/, '');
  if (!url || (!/^https:\/\//i.test(url) && !/^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/i.test(url))) throw new Error('A importação de .mpp ainda não está ativada neste site: falta configurar o serviço de conversão. O arquivo não foi enviado.');
  return url;
}

export function isEapServiceConfigured(): boolean {
  const url = String(import.meta.env.VITE_EAP_API_URL || DEFAULT_EAP_SERVICE_URL).trim();
  return /^https:\/\//i.test(url) || /^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/i.test(url);
}

async function post(path: string, email: string, body: BodyInit): Promise<any> {
  const url = serviceUrl();
  await ensureGoogleFirebaseAuth(email);
  const user = getAuth(getApp()).currentUser;
  if (!user || user.email?.toLowerCase() !== email.trim().toLowerCase()) {
    throw new Error('Entre com a mesma conta Google usada no Ecoquanta.');
  }
  const headers: Record<string, string> = { Authorization: `Bearer ${await user.getIdToken()}` };
  if (typeof body === 'string') headers['Content-Type'] = 'application/json';
  const response = await fetch(`${url}${path}`, { method: 'POST', headers, body });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || `Falha ao atualizar EAP (${response.status}).`);
  return result;
}

export async function convertProject(file: File, email: string): Promise<ConvertedProject> {
  if (!file.name.toLowerCase().endsWith('.mpp')) throw new Error('Selecione um arquivo .mpp do Microsoft Project.');
  if (file.size > 30 * 1024 * 1024) throw new Error('O arquivo .mpp excede o limite de 30 MB.');
  const body = new FormData();
  body.append('file', file, file.name);
  const result = await post('/convert', email, body);
  if (!Array.isArray(result.rows) || result.rows.length < 2 ||
      result.rows.some((row: unknown) => !Array.isArray(row) || row.length !== 19 || row.some((cell) => typeof cell !== 'string'))) {
    throw new Error('O Project não retornou uma EAP válida.');
  }
  return { rows: result.rows, rootName: String(result.rootName || '') };
}

export async function previewProject(os: string, osName: string, isNew: boolean, rows: string[][], email: string): Promise<EapPreview> {
  await ensureGoogleFirebaseAuth(email);
  const user = getAuth(getApp()).currentUser;
  if (!user || user.email?.toLowerCase() !== email.trim().toLowerCase()) throw new Error('Entre com a mesma conta Google usada no Ecoquanta.');
  const db = getFirestore(getApp());
  const previewRef = doc(collection(db, 'eapPreviews'));
  const current = await getDoc(doc(db, 'eapOs', os));
  if (isNew && current.exists()) throw new Error('Esta OS já foi criada. Selecione-a na lista para atualizar.');
  const version = current.exists() ? Number(current.data().version || 0) : 0;
  await setDoc(previewRef, { uid: user.uid, email: email.trim().toLowerCase(), os, osName, isNew,
    status: 'uploading', nextIndex: 0, rowCount: 0, expiresAt: Timestamp.fromMillis(Date.now() + 60 * 60 * 1000) });
  const encoder = new TextEncoder();
  let chunk: string[][] = [];
  let chunkBytes = 2;
  let index = 0;
  let sentRows = 0;
  async function sendChunk() {
    if (!chunk.length) return;
    await setDoc(doc(previewRef, 'chunks', String(index).padStart(8, '0')), { rowsJson: JSON.stringify(chunk) });
    sentRows += chunk.length;
    index++;
    await updateDoc(previewRef, { nextIndex: index, rowCount: sentRows });
    chunk = [];
    chunkBytes = 2;
  }
  for (const row of rows) {
    const rowBytes = encoder.encode(JSON.stringify(row)).length + 1;
    if (chunk.length && chunkBytes + rowBytes > 200_000) await sendChunk();
    chunk.push(row);
    chunkBytes += rowBytes;
  }
  await sendChunk();
  const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(JSON.stringify(rows))))).map((value) => value.toString(16).padStart(2, '0')).join('');
  await updateDoc(previewRef, { status: 'ready', baseVersion: version, sha256: digest, nextIndex: index, rowCount: rows.length });
  return { previewId: previewRef.id, os, version, sha256: digest, rows };
}

export async function publishProject(preview: EapPreview, email: string): Promise<{ ok: boolean; os: string; version: number }> {
  const user = getAuth(getApp()).currentUser;
  if (!user || user.email?.toLowerCase() !== email.trim().toLowerCase()) throw new Error('Entre com a mesma conta Google usada no Ecoquanta.');
  const db = getFirestore(getApp());
  const previewRef = doc(db, 'eapPreviews', preview.previewId);
  const osRef = doc(db, 'eapOs', preview.os);
  const auditRef = doc(collection(db, 'eapAudit'));
  const version = await runTransaction(db, async (transaction) => {
    const [previewDoc, osDoc] = await Promise.all([transaction.get(previewRef), transaction.get(osRef)]);
    const data = previewDoc.data();
    if (!previewDoc.exists() || data?.uid !== user.uid || data?.status !== 'ready' || data?.os !== preview.os) throw new Error('Prévia inválida ou expirada. Importe novamente.');
    const currentVersion = osDoc.exists() ? Number(osDoc.data().version || 0) : 0;
    if (currentVersion !== Number(data.baseVersion || 0) || (data.isNew && osDoc.exists())) throw new Error('Esta OS mudou desde a prévia. Importe novamente.');
    transaction.set(osRef, { os: preview.os, osName: data.osName, previewId: preview.previewId,
      chunkCount: data.nextIndex, rowCount: data.rowCount, sha256: data.sha256,
      version: currentVersion + 1, updatedAt: serverTimestamp() });
    transaction.update(previewRef, { status: 'published', expiresAt: deleteField() });
    transaction.set(auditRef, { os: preview.os, osName: data.osName, version: currentVersion + 1,
      previewId: preview.previewId, chunkCount: data.nextIndex, sha256: data.sha256,
      byUid: user.uid, byEmail: email.trim().toLowerCase(), at: serverTimestamp() });
    return currentVersion + 1;
  });
  return { ok: true, os: preview.os, version };
}
