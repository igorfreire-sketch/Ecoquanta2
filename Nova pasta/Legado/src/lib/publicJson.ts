const DEFAULT_PUBLIC_JSON_BASE_URL = '';
const DEFAULT_RAW_PUBLIC_JSON_BASE_URL = 'https://raw.githubusercontent.com/igorfreire-sketch/Ecoquanta2/main/Publica';
const EAP_APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbx4hAEe5i_ulWGSl9qfiokoCGzMza3QzUDIlM4cuZV_8eRw-Ml3XltdAbD0K0EFWm9x4Q/exec';

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

function getRawPublicJsonBaseUrl() {
  return String(import.meta.env.VITE_RAW_PUBLIC_JSON_BASE_URL || DEFAULT_RAW_PUBLIC_JSON_BASE_URL).replace(/\/+$/, '');
}

function joinJsonUrl(baseUrl: string, fileName: string) {
  const cleanFile = fileName.replace(/^\/+/, '');
  if (!baseUrl) return `/${cleanFile}`;
  return `${baseUrl.replace(/\/+$/, '')}/${cleanFile}`;
}

function getPublicJsonUrls(fileName: string) {
  const baseUrl = getPublicJsonBaseUrl();
  const viteBaseUrl = String(import.meta.env.BASE_URL || '/').replace(/\/+$/, '');
  const candidates = [
    baseUrl ? joinJsonUrl(baseUrl, fileName) : '',
    joinJsonUrl(viteBaseUrl, fileName),
    joinJsonUrl(viteBaseUrl, `Publica/${fileName}`),
    joinJsonUrl('', fileName),
    joinJsonUrl('/Publica', fileName),
    joinJsonUrl(getRawPublicJsonBaseUrl(), fileName),
  ].filter(Boolean);

  return Array.from(new Set(candidates));
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

function isEncryptedEnvelope(value: unknown): value is EncryptedJsonEnvelope {
  if (!value || typeof value !== 'object') return false;
  const envelope = value as Partial<EncryptedJsonEnvelope>;
  return envelope.algorithm === 'xor-sha256-stream' && typeof envelope.payload === 'string';
}

const publicJsonPromiseCache = new Map<string, Promise<any>>();

export async function fetchPublicJson<T>(fileName: string): Promise<T> {
  const cachedPromise = publicJsonPromiseCache.get(fileName);
  if (cachedPromise) return cachedPromise as Promise<T>;

  const requestPromise = (async () => {
  const errors: string[] = [];

  for (const url of getPublicJsonUrls(fileName)) {
    try {
      const response = await fetch(url, { cache: 'no-store' });
      if (!response.ok) {
        errors.push(`${url}: ${response.status}`);
        continue;
      }

      const payload = await response.json();
      if (isEncryptedEnvelope(payload)) {
        return await decryptEnvelope<T>(payload);
      }
      return payload as T;
    } catch (error) {
      errors.push(`${url}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  throw new Error(`Falha ao carregar ${fileName}. Tentativas: ${errors.join(' | ')}`);
  })();

  publicJsonPromiseCache.set(fileName, requestPromise);
  try {
    return await requestPromise as T;
  } finally {
    publicJsonPromiseCache.delete(fileName);
  }
}

export async function fetchRegistroPublicData<T>() {
  return fetchPublicJson<T>('registro-atividades.json');
}

export async function fetchRegistroModulePublicData<T>() {
  return fetchPublicJson<T>('app-registro.json');
}

export async function fetchAdminModulePublicData<T>() {
  return fetchPublicJson<T>('app-administracao.json');
}

export async function fetchCronogramaModulePublicData<T>() {
  return fetchPublicJson<T>('app-cronograma.json');
}

export async function fetchControleModulePublicData<T>() {
  return fetchPublicJson<T>('app-controle.json');
}

export async function fetchContratoModulePublicData<T>() {
  return fetchPublicJson<T>('app-contrato.json');
}

export async function fetchNaoConformidadesModulePublicData<T>() {
  return fetchPublicJson<T>('app-nc.json');
}

export async function fetchEapPublicData<T>() {
  return fetchPublicJson<T>('eap-unificada.json');
}

export async function fetchEapAppsScriptData<T>() {
  const response = await fetch(EAP_APPS_SCRIPT_URL, { cache: 'no-store' });
  const payload = await response.json();

  if (!payload?.success || !payload?.data) {
    throw new Error(payload?.error || 'Falha ao carregar EAP pelo Apps Script.');
  }

  return payload.data as T;
}
