const DEFAULT_PUBLIC_JSON_BASE_URL = '/Publica';

interface EncryptedJsonEnvelope {
  version: number;
  algorithm: string;
  nonce: string;
  checksum?: string;
  publishedAt?: string;
  payload: string;
}

function getCryptoKey() {
  const key = String(import.meta.env.VITE_JSON_CRYPTO_KEY || '').trim();
  if (!key) {
    throw new Error('VITE_JSON_CRYPTO_KEY nao configurada.');
  }
  return key;
}

function getPublicJsonBaseUrl() {
  return String(import.meta.env.VITE_PUBLIC_JSON_BASE_URL || DEFAULT_PUBLIC_JSON_BASE_URL).replace(/\/+$/, '');
}

function getPublicJsonUrl(fileName: string) {
  return `${getPublicJsonBaseUrl()}/${fileName}`;
}

function decodeBase64Url(input: string) {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
  const padding = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4));
  const binary = window.atob(normalized + padding);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function sha256Bytes(text: string) {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return new Uint8Array(digest);
}

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function buildKeyStreamBlock(cryptoKey: string, nonce: string, counter: number) {
  return sha256Bytes(`${cryptoKey}|${nonce}|${counter}`);
}

async function decryptEnvelope<T>(envelope: EncryptedJsonEnvelope): Promise<T> {
  if (!envelope || envelope.algorithm !== 'xor-sha256-stream') {
    throw new Error('Formato de JSON criptografado nao suportado.');
  }

  const cryptoKey = getCryptoKey();
  const cipherBytes = decodeBase64Url(envelope.payload);
  const plainBytes = new Uint8Array(cipherBytes.length);

  let counter = 0;
  let offset = 0;
  let block = new Uint8Array(0);

  for (let i = 0; i < cipherBytes.length; i++) {
    if (offset >= block.length) {
      block = await buildKeyStreamBlock(cryptoKey, envelope.nonce, counter++);
      offset = 0;
    }
    plainBytes[i] = cipherBytes[i] ^ block[offset++];
  }

  const plainText = new TextDecoder().decode(plainBytes);

  if (envelope.checksum) {
    const checksum = bytesToHex(await sha256Bytes(plainText));
    if (checksum !== envelope.checksum) {
      throw new Error('Falha ao validar checksum do JSON publico.');
    }
  }

  return JSON.parse(plainText) as T;
}

export async function fetchPublicJson<T>(fileName: string): Promise<T> {
  const response = await fetch(getPublicJsonUrl(fileName), { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`Falha ao carregar ${fileName}: ${response.status}`);
  }

  const envelope = await response.json() as EncryptedJsonEnvelope;
  return decryptEnvelope<T>(envelope);
}

export async function fetchRegistroPublicData<T>() {
  return fetchPublicJson<T>('registro-atividades.json');
}

export async function fetchEapPublicData<T>() {
  return fetchPublicJson<T>('eap-unificada.json');
}
