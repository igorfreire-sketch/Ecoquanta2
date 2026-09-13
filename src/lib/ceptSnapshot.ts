// Snapshot dos dados REAIS do CEPT, tirado do Apps Script e convertido por
// scripts/migracao/cept-from-appsscript.ts. Consumido apenas pelo modo `?ceptDemo=1`,
// como ponte enquanto a carga no Firestore nao acontece.
//
// !! DADO REAL DA QUANTA: este arquivo, depois de preenchido, NAO deve ir pro git.
// Confira `git status` antes de commitar. Ele nasce vazio de proposito.
//
// Vazio = o dashboard usa os dados ficticios de ceptDemoData.ts.
// Para preencher: siga o passo a passo no topo de scripts/migracao/cept-from-appsscript.ts

import type { CeptComponent, CeptResponsavel, CeptValidacao } from './ceptModel';

export const snapshotGeradoEm = '';
export const snapshotComponentes: CeptComponent[] = [];
export const snapshotValidacoes: CeptValidacao[] = [];
export const snapshotResponsaveis: Record<string, CeptResponsavel> = {};
