import { setFirebaseDocumentVersioned } from '../firebaseDb';
import type { CeptComponent } from '../ceptModel';

export const CEPT_COMPONENTS_COLLECTION = 'ceptComponentes';

/** Salva um componente já normalizado; criação usa versão esperada zero. */
export async function saveCeptDeliveryComponent(component: CeptComponent, expectedVersion = 0): Promise<number> {
  return setFirebaseDocumentVersioned(CEPT_COMPONENTS_COLLECTION, component.recordKey, component, expectedVersion);
}
