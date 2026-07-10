import JSZip from 'jszip';
import { fetchFirebaseAppData, fetchFirebaseCollection } from './firebaseDb';

const APP_DATA_DOCS = ['registro', 'admin', 'cronograma', 'eap', 'auth', 'notes', 'menu', 'curvaSReajustado'];

const COLLECTIONS = [
  'registroAtividades',
  'registroAtividadesHistorico',
  'nc2Records',
  'planningTodos',
  'contractPriorities',
  'contractInterferences',
  'resolvedAlerts',
  'osSettings',
  'emergencies',
  'emergencyMessages',
  'emergencyReadMarkers',
];

export interface SystemBackupResult {
  filename: string;
  errors: string[];
}

export async function downloadSystemBackup(): Promise<SystemBackupResult> {
  const zip = new JSZip();
  const errors: string[] = [];

  await Promise.all(APP_DATA_DOCS.map(async (name) => {
    try {
      const data = await fetchFirebaseAppData<any>(name);
      zip.file(`appData/${name}.json`, JSON.stringify(data ?? null, null, 2));
    } catch (error) {
      errors.push(`appData/${name}: ${(error as Error).message}`);
    }
  }));

  await Promise.all(COLLECTIONS.map(async (name) => {
    try {
      const docs = await fetchFirebaseCollection<any>(name);
      zip.file(`collections/${name}.json`, JSON.stringify(docs, null, 2));
    } catch (error) {
      errors.push(`${name}: ${(error as Error).message}`);
    }
  }));

  if (errors.length > 0) zip.file('_erros.txt', errors.join('\n'));

  const blob = await zip.generateAsync({ type: 'blob' });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const filename = `ecoquanta-backup-${stamp}.zip`;

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);

  return { filename, errors };
}
