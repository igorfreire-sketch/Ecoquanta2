const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyl1TyOHEuhWV-twFybZ3wQ1k7IOb4Ob-lvjNtODiK9rxgZB4TA4iVtFbRjXorhaK5G/exec';

export interface EmergencyCase {
  id: string;
  activityId: string;
  contratoCodigo: string;
  contratoNome: string;
  osCodigo: string;
  osNome: string;
  itemCodigo: string;
  itemNome: string;
  status: string;
  createdAt: string;
  createdByEmail: string;
  createdByName: string;
  createdBySector: string;
  initialObservation: string;
  notifiedSectors: string[];
  lastUpdatedAt: string;
}

export interface EmergencyMessage {
  id: string;
  emergencyId: string;
  createdAt: string;
  authorEmail: string;
  authorName: string;
  authorSector: string;
  message: string;
  type: string;
}

export interface EmergencyPayload {
  emergencies: EmergencyCase[];
  messagesByEmergency: Record<string, EmergencyMessage[]>;
  readMarkers: Record<string, Record<string, string>>;
}

interface EmergencyResponse {
  success?: boolean;
  error?: string;
  message?: string;
  emergencies?: EmergencyCase[];
  messagesByEmergency?: Record<string, EmergencyMessage[]>;
  readMarkers?: Record<string, Record<string, string>>;
}

function normalizeSector(value?: string) {
  return String(value || '').trim();
}

async function parseResponse(response: Response) {
  const text = await response.text();
  try {
    return JSON.parse(text) as EmergencyResponse;
  } catch (error) {
    throw new Error(text || 'Resposta invalida do Apps Script.');
  }
}

function assertSuccess(response: EmergencyResponse, fallbackMessage: string) {
  if (!response?.success) {
    throw new Error(response?.error || response?.message || fallbackMessage);
  }
}

export async function fetchEmergencyData(): Promise<EmergencyPayload> {
  const response = await fetch(`${APPS_SCRIPT_URL}?action=getEmergenciaData`, { cache: 'no-store' });
  const data = await parseResponse(response);
  assertSuccess(data, 'Falha ao carregar emergencias.');
  return {
    emergencies: Array.isArray(data.emergencies) ? data.emergencies : [],
    messagesByEmergency: data.messagesByEmergency && typeof data.messagesByEmergency === 'object' ? data.messagesByEmergency : {},
    readMarkers: data.readMarkers && typeof data.readMarkers === 'object' ? data.readMarkers : {},
  };
}

export async function createEmergency(payload: {
  userEmail: string;
  userName: string;
  userSector: string;
  activityId: string;
  contratoCodigo: string;
  contratoNome: string;
  osCodigo: string;
  osNome: string;
  itemCodigo: string;
  itemNome: string;
  observation: string;
  notifiedSectors: string[];
}) {
  const response = await fetch(APPS_SCRIPT_URL, {
    method: 'POST',
    body: JSON.stringify({
      action: 'createEmergencia',
      ...payload,
    }),
  });
  const data = await parseResponse(response);
  assertSuccess(data, 'Falha ao criar emergencia.');
  return data;
}

export async function addEmergencyMessage(payload: {
  emergencyId: string;
  userEmail: string;
  userName: string;
  userSector: string;
  message: string;
}) {
  const response = await fetch(APPS_SCRIPT_URL, {
    method: 'POST',
    body: JSON.stringify({
      action: 'addEmergenciaMensagem',
      ...payload,
    }),
  });
  const data = await parseResponse(response);
  assertSuccess(data, 'Falha ao enviar mensagem.');
  return data;
}

export async function markEmergencyRead(payload: {
  emergencyId: string;
  sector: string;
  userEmail: string;
}) {
  const response = await fetch(APPS_SCRIPT_URL, {
    method: 'POST',
    body: JSON.stringify({
      action: 'markEmergenciaRead',
      ...payload,
    }),
  });
  const data = await parseResponse(response);
  assertSuccess(data, 'Falha ao registrar leitura da emergencia.');
  return data;
}

function toTimestamp(value?: string) {
  const raw = String(value || '').trim();
  if (!raw) return 0;
  const parsed = new Date(raw).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
}

export function isEmergencyUnreadForSector(
  emergency: EmergencyCase,
  readMarkers: EmergencyPayload['readMarkers'],
  sector?: string
) {
  const normalizedSector = normalizeSector(sector);
  if (!normalizedSector) return false;
  if (!Array.isArray(emergency.notifiedSectors) || !emergency.notifiedSectors.includes(normalizedSector)) {
    return false;
  }

  const readAt = readMarkers?.[emergency.id]?.[normalizedSector] || '';
  return toTimestamp(emergency.lastUpdatedAt || emergency.createdAt) > toTimestamp(readAt);
}

export function getEmergencyUnreadCount(data: EmergencyPayload, sector?: string) {
  return data.emergencies.filter((item) => isEmergencyUnreadForSector(item, data.readMarkers, sector)).length;
}
