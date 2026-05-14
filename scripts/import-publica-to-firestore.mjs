import 'dotenv/config';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const ROOT_DIR = process.cwd();
const PUBLICA_DIR = path.join(ROOT_DIR, 'Publica');
const BATCH_LIMIT = 450;
const APPDATA_CHUNK_SIZE = 750_000;

function requiredEnv(name) {
  const value = String(process.env[name] || '').trim();
  if (!value) throw new Error(`${name} nao configurada.`);
  return value;
}

function decodeBase64Url(input) {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
  const padding = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4));
  return Buffer.from(normalized + padding, 'base64');
}

function sha256Buffer(text) {
  return createHash('sha256').update(text).digest();
}

function sha256Hex(text) {
  return createHash('sha256').update(text).digest('hex');
}

function decryptEnvelope(envelope, cryptoKey) {
  if (!envelope || envelope.algorithm !== 'xor-sha256-stream' || typeof envelope.payload !== 'string') {
    return envelope;
  }

  const cipherBytes = decodeBase64Url(envelope.payload);
  const plainBytes = Buffer.alloc(cipherBytes.length);

  let counter = 0;
  let offset = 0;
  let block = Buffer.alloc(0);

  for (let i = 0; i < cipherBytes.length; i += 1) {
    if (offset >= block.length) {
      block = sha256Buffer(`${cryptoKey}|${envelope.nonce}|${counter}`);
      counter += 1;
      offset = 0;
    }
    plainBytes[i] = cipherBytes[i] ^ block[offset];
    offset += 1;
  }

  const plainText = plainBytes.toString('utf8');
  if (envelope.checksum && sha256Hex(plainText) !== envelope.checksum) {
    throw new Error('Checksum invalido ao descriptografar JSON publico.');
  }

  return JSON.parse(plainText);
}

async function readPublicJson(fileName, cryptoKey) {
  const raw = await readFile(path.join(PUBLICA_DIR, fileName), 'utf8');
  return decryptEnvelope(JSON.parse(raw), cryptoKey);
}

function loadServiceAccount() {
  const inlineJson = String(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '').trim();
  if (inlineJson) return JSON.parse(inlineJson);

  const serviceAccountPath = String(process.env.FIREBASE_SERVICE_ACCOUNT_PATH || '').trim();
  if (!serviceAccountPath) {
    throw new Error('Configure FIREBASE_SERVICE_ACCOUNT_JSON ou FIREBASE_SERVICE_ACCOUNT_PATH.');
  }

  return JSON.parse(readFileSync(path.resolve(serviceAccountPath), 'utf8'));
}

function normalizeActivityId(activity, index) {
  return String(activity?.activityId || activity?.id || `activity-${index + 1}`).trim();
}

async function commitInChunks(db, docs) {
  for (let i = 0; i < docs.length; i += BATCH_LIMIT) {
    const batch = db.batch();
    docs.slice(i, i + BATCH_LIMIT).forEach(({ ref, data }) => batch.set(ref, data, { merge: true }));
    await batch.commit();
  }
}

function splitStringIntoChunks(text, chunkSize) {
  const chunks = [];
  for (let i = 0; i < text.length; i += chunkSize) chunks.push(text.slice(i, i + chunkSize));
  return chunks.length ? chunks : [''];
}

async function setAppData(db, name, data) {
  const jsonText = JSON.stringify(data || {});
  const chunks = splitStringIntoChunks(jsonText, APPDATA_CHUNK_SIZE);
  await db.collection('appData').doc(name).set({
    chunked: true,
    chunkCount: chunks.length,
    byteLength: jsonText.length,
    source: 'Publica',
    importedAt: FieldValue.serverTimestamp(),
  }, { merge: true });

  const chunkDocs = chunks.map((value, index) => ({
    ref: db.collection('appData').doc(name).collection('chunks').doc(String(index).padStart(5, '0')),
    data: {
      index,
      value,
      importedAt: FieldValue.serverTimestamp(),
    },
  }));
  await commitInChunks(db, chunkDocs);
}

async function main() {
  const cryptoKey = requiredEnv('VITE_JSON_CRYPTO_KEY');
  const serviceAccount = loadServiceAccount();

  if (!getApps().length) initializeApp({ credential: cert(serviceAccount) });
  const db = getFirestore();

  const [registroPayload, adminPayload, cronogramaPayload, controlePayload, contratoPayload, ncPayload, eapPayload] = await Promise.all([
    readPublicJson('app-registro.json', cryptoKey),
    readPublicJson('app-administracao.json', cryptoKey),
    readPublicJson('app-cronograma.json', cryptoKey),
    readPublicJson('app-controle.json', cryptoKey),
    readPublicJson('app-contrato.json', cryptoKey),
    readPublicJson('app-nc.json', cryptoKey),
    readPublicJson('eap-unificada.json', cryptoKey),
  ]);

  const appDataDocs = [
    ['registro', registroPayload?.data?.registro || registroPayload?.registro || {}],
    ['admin', adminPayload?.data?.admin || adminPayload?.admin || {}],
    ['cronograma', cronogramaPayload?.data?.cronograma || cronogramaPayload?.cronograma || {}],
    ['controle', controlePayload?.data || controlePayload || {}],
    ['contrato', contratoPayload?.data || contratoPayload || {}],
    ['nc', ncPayload?.data || ncPayload || {}],
    ['eap', eapPayload?.data || eapPayload || {}],
  ];

  for (const [name, data] of appDataDocs) {
    await setAppData(db, name, data);
  }

  const registroData = appDataDocs.find(([name]) => name === 'registro')?.[1] || {};
  const activities = Array.isArray(registroData.activitiesList) ? registroData.activitiesList : [];
  const activityDocs = activities.map((activity, index) => {
    const activityId = normalizeActivityId(activity, index);
    return {
      ref: db.collection('registroAtividades').doc(activityId),
      data: {
        ...activity,
        activityId,
        importedAt: FieldValue.serverTimestamp(),
        source: 'Publica',
      },
    };
  });
  await commitInChunks(db, activityDocs);

  console.log(`Firestore atualizado: ${appDataDocs.length} snapshots e ${activityDocs.length} atividade(s).`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
