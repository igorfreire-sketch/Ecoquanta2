// One-time load: JSON gerado por cept-import.ts -> Firestore.
// Esta e a etapa que o cabecalho de cept-import.ts chama de "a separate (later) step".
// Schema: docs/decisoes/0001-cept-acompanhamento-entregas-firestore.md §1 e §4.
//
// Credencial: variavel de ambiente GOOGLE_APPLICATION_CREDENTIALS apontando para o
// JSON da service account. A chave NUNCA entra neste arquivo nem no repo.
//
// Uso:
//   npx tsx scripts/migracao/cept-load.ts              -> dry-run (nao escreve nada)
//   npx tsx scripts/migracao/cept-load.ts --apply      -> grava de verdade
//
// ponytail: dry-run e o default e --apply e explicito porque o alvo e o banco de
// PRODUCAO; o custo de um flag a mais e menor que o de uma carga acidental.

import { readFileSync } from 'node:fs';
import path from 'node:path';

const OUT_DIR = path.resolve(import.meta.dirname, 'output');
const COMPONENTES_JSON = path.join(OUT_DIR, 'cept-componentes.json');
const RESPONSAVEIS_JSON = path.join(OUT_DIR, 'cept-responsaveis.json');

// Limite duro do Firestore para writes por batch.
const BATCH_LIMIT = 500;

export interface CeptComponenteDoc {
  recordKey: string;
  [campo: string]: unknown;
}

/** Firestore: ID nao pode conter '/', ser '.'/'..', casar __*__ nem passar de 1500 bytes. */
export function assertValidDocId(id: string): string {
  if (!id) throw new Error('recordKey vazio');
  if (id.includes('/')) throw new Error(`recordKey contem "/" (proibido em ID): ${id}`);
  if (id === '.' || id === '..') throw new Error(`recordKey invalido: ${id}`);
  if (/^__.*__$/.test(id)) throw new Error(`recordKey reservado pelo Firestore: ${id}`);
  if (Buffer.byteLength(id, 'utf8') > 1500) throw new Error(`recordKey acima de 1500 bytes: ${id}`);
  return id;
}

export function chunk<T>(itens: T[], tamanho: number): T[][] {
  const saida: T[][] = [];
  for (let i = 0; i < itens.length; i += tamanho) saida.push(itens.slice(i, i + tamanho));
  return saida;
}

/** recordKey duplicado sobrescreveria silenciosamente o anterior — falha antes de escrever. */
export function assertSemDuplicatas(componentes: CeptComponenteDoc[]): void {
  const vistos = new Set<string>();
  const duplicados: string[] = [];
  for (const item of componentes) {
    if (vistos.has(item.recordKey)) duplicados.push(item.recordKey);
    vistos.add(item.recordKey);
  }
  if (duplicados.length) {
    throw new Error(`recordKey duplicado no JSON de entrada: ${duplicados.join(', ')}`);
  }
}

function lerJson<T>(arquivo: string): T {
  try {
    return JSON.parse(readFileSync(arquivo, 'utf8')) as T;
  } catch (erro) {
    throw new Error(`Nao consegui ler ${arquivo}. Rode cept-import.ts antes. (${String(erro)})`);
  }
}

async function main() {
  const apply = process.argv.includes('--apply');

  const componentes = lerJson<CeptComponenteDoc[]>(COMPONENTES_JSON);
  const responsaveis = lerJson<Record<string, unknown>>(RESPONSAVEIS_JSON);

  componentes.forEach((item) => assertValidDocId(item.recordKey));
  assertSemDuplicatas(componentes);

  const lotes = chunk(componentes, BATCH_LIMIT);
  console.log(`ceptComponentes : ${componentes.length} documentos em ${lotes.length} batch(es)`);
  console.log(`ceptResponsaveis: ${Object.keys(responsaveis).length} disciplinas (1 documento)`);

  if (!apply) {
    console.log('\nDRY-RUN — nada foi escrito. Rode de novo com --apply para gravar.');
    console.log(`Amostra: ${componentes.slice(0, 3).map((c) => c.recordKey).join(', ')}`);
    return;
  }

  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    throw new Error('GOOGLE_APPLICATION_CREDENTIALS nao definida — sem credencial para escrever.');
  }

  // Import dinamico: firebase-admin so e necessario no caminho --apply, e nao e (nem deve ser)
  // dependencia do app. Instale de forma transiente: npm i --no-save firebase-admin
  // @ts-ignore firebase-admin e transiente e nao esta no package.json: sem o ignore o
  // `npm run lint` (tsc --noEmit) do repo inteiro quebraria numa clone limpa.
  const { cert, initializeApp } = await import('firebase-admin/app');
  // @ts-ignore idem
  const { getFirestore } = await import('firebase-admin/firestore');

  const credencial = lerJson<{ project_id: string }>(process.env.GOOGLE_APPLICATION_CREDENTIALS);
  initializeApp({ credential: cert(process.env.GOOGLE_APPLICATION_CREDENTIALS) });
  const db = getFirestore();
  console.log(`\nGravando em ${credencial.project_id}...`);

  let gravados = 0;
  for (const [indice, lote] of lotes.entries()) {
    const batch = db.batch();
    for (const item of lote) {
      // merge: recarga nao apaga campos escritos pelo app (ex. validacao manual posterior).
      batch.set(db.collection('ceptComponentes').doc(item.recordKey), item, { merge: true });
    }
    await batch.commit();
    gravados += lote.length;
    console.log(`  batch ${indice + 1}/${lotes.length}: ${gravados}/${componentes.length}`);
  }

  // appData e lido por getAppDataDoc (firebaseDb.ts:402), que prefere o campo `data`.
  // Gravar em outro formato faria o documento ser ignorado pelo leitor do app.
  await db.collection('appData').doc('ceptResponsaveis').set({ data: responsaveis });
  console.log('  appData/ceptResponsaveis: ok');

  console.log('\nCarga concluida.');
}

main().catch((erro) => {
  console.error(`\nFALHOU: ${erro instanceof Error ? erro.message : String(erro)}`);
  process.exit(1);
});
