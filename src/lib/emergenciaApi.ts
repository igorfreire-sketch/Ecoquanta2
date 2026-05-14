import { fetchFirebaseCollection, isFirebaseConfigured, setFirebaseDocument } from './firebaseDb';

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

function normalizeSector(value?: string) {
  return String(value || '').trim();
}

function generateId(prefix: string) {
  try {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return `${prefix}-${crypto.randomUUID()}`;
  } catch (error) {}
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function fetchEmergencyData(): Promise<EmergencyPayload> {
  if (!isFirebaseConfigured()) throw new Error('Firebase nao configurado para emergencias.');
  const [emergencies, messages, markers] = await Promise.all([
    fetchFirebaseCollection<EmergencyCase>('emergencies'),
    fetchFirebaseCollection<EmergencyMessage>('emergencyMessages'),
    fetchFirebaseCollection<{ id: string; emergencyId: string; sector: string; readAt: string }>('emergencyReadMarkers'),
  ]);
  const messagesByEmergency = messages.reduce<Record<string, EmergencyMessage[]>>((acc, message) => {
    const key = String(message.emergencyId || '').trim();
    if (!key) return acc;
    if (!acc[key]) acc[key] = [];
    acc[key].push(message);
    return acc;
  }, {});
  Object.keys(messagesByEmergency).forEach((key) => {
    messagesByEmergency[key].sort((a, b) => toTimestamp(a.createdAt) - toTimestamp(b.createdAt));
  });
  const readMarkers = markers.reduce<Record<string, Record<string, string>>>((acc, marker) => {
    const emergencyId = String(marker.emergencyId || '').trim();
    const sector = String(marker.sector || '').trim();
    if (!emergencyId || !sector) return acc;
    if (!acc[emergencyId]) acc[emergencyId] = {};
    acc[emergencyId][sector] = marker.readAt || '';
    return acc;
  }, {});
  return {
    emergencies,
    messagesByEmergency,
    readMarkers,
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
  if (!isFirebaseConfigured()) throw new Error('Firebase nao configurado para emergencias.');
  const now = new Date().toISOString();
  const emergency: EmergencyCase = {
    id: generateId('EMG'),
    activityId: payload.activityId,
    contratoCodigo: payload.contratoCodigo,
    contratoNome: payload.contratoNome,
    osCodigo: payload.osCodigo,
    osNome: payload.osNome,
    itemCodigo: payload.itemCodigo,
    itemNome: payload.itemNome,
    status: 'aberta',
    createdAt: now,
    createdByEmail: payload.userEmail,
    createdByName: payload.userName,
    createdBySector: payload.userSector,
    initialObservation: payload.observation,
    notifiedSectors: payload.notifiedSectors,
    lastUpdatedAt: now,
  };
  await setFirebaseDocument('emergencies', emergency.id, emergency);
  return { success: true, emergency };
}

export async function addEmergencyMessage(payload: {
  emergencyId: string;
  userEmail: string;
  userName: string;
  userSector: string;
  message: string;
}) {
  if (!isFirebaseConfigured()) throw new Error('Firebase nao configurado para emergencias.');
  const now = new Date().toISOString();
  const message: EmergencyMessage = {
    id: generateId('EMGMSG'),
    emergencyId: payload.emergencyId,
    createdAt: now,
    authorEmail: payload.userEmail,
    authorName: payload.userName,
    authorSector: payload.userSector,
    message: payload.message,
    type: 'message',
  };
  await Promise.all([
    setFirebaseDocument('emergencyMessages', message.id, message),
    setFirebaseDocument('emergencies', payload.emergencyId, { id: payload.emergencyId, lastUpdatedAt: now }),
  ]);
  return { success: true, message };
}

export async function markEmergencyRead(payload: {
  emergencyId: string;
  sector: string;
  userEmail: string;
}) {
  if (!isFirebaseConfigured()) throw new Error('Firebase nao configurado para emergencias.');
  const sector = normalizeSector(payload.sector);
  const id = `${payload.emergencyId}__${sector}`;
  await setFirebaseDocument('emergencyReadMarkers', id, {
    id,
    emergencyId: payload.emergencyId,
    sector,
    userEmail: payload.userEmail,
    readAt: new Date().toISOString(),
  });
  return { success: true };
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
