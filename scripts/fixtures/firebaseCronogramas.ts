// This adapter is used only by the local fixture build of the real Cronogramas screen.
// Every read/write stays in localStorage; the production Firebase module is unchanged.
import type { CronogramaDoc } from '../../src/components/CronogramaGrid';
import { nextCronogramaTimestamp } from '../../src/lib/cronoRevision';
export { canDeleteNote } from '../../src/lib/firebaseDb';
export function isFirebaseConfigured() { return true; }
export async function fetchFirebaseCollection<T>(collection: string): Promise<T[]> {
  const project = JSON.parse(localStorage.getItem('r4-project') || 'null');
  return collection === 'cronogramas' && project ? [project] : [];
}
export async function saveCronogramaChecked(project: CronogramaDoc, allowCreate = false) {
  const current = JSON.parse(localStorage.getItem('r4-project') || 'null');
  const exists = current?.id === project.id;
  const saved = { ...project, updatedAt: nextCronogramaTimestamp(project.updatedAt, exists ? current.updatedAt : undefined, allowCreate, exists) };
  localStorage.setItem('r4-project', JSON.stringify(saved));
  return saved;
}
export async function setFirebaseDocument(_collection: string, _id: string, project: object) {
  localStorage.setItem('r4-project', JSON.stringify(project));
}
export async function deleteFirebaseDocument() { localStorage.removeItem('r4-project'); }
