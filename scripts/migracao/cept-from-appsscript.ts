// Converte o payload REAL do Apps Script (getAppData) para o formato do dashboard React.
// Ponte temporaria: serve enquanto a carga no Firestore (cept-load.ts) nao acontece.
//
// COMO PEGAR O PAYLOAD (o /exec devolve a PAGINA, nao os dados -- nao adianta baixar a URL):
//   1. Abra o dashboard do Apps Script logado na conta @quantaconsultoria.com e espere carregar.
//   2. F12 -> aba Console -> no seletor de contexto (o dropdown que costuma mostrar "top"),
//      escolha o frame `userCodeAppPanel`. O codigo do dashboard roda dentro desse iframe;
//      no contexto "top" o `google.script.run` nao existe.
//   3. Cole e rode:
//
//        google.script.run.withSuccessHandler(d => {
//          const a = document.createElement('a');
//          a.href = URL.createObjectURL(new Blob([JSON.stringify(d)], {type:'application/json'}));
//          a.download = 'cept-appsscript.json';
//          a.click();
//        }).withFailureHandler(e => console.error(e)).getAppData();
//
//   4. Salve o arquivo e rode:
//        npx tsx scripts/migracao/cept-from-appsscript.ts <caminho>/cept-appsscript.json
//
// Saida: src/lib/ceptSnapshot.ts (dado REAL -- nao commitar).

import fs from 'node:fs';
import path from 'node:path';
import { buildRecordKey, buildSignature } from '../../src/lib/ceptModel';
import type { CeptComponent, CeptResponsavel, CeptStatus, CeptValidacao } from '../../src/lib/ceptModel';

const SAIDA = path.resolve(import.meta.dirname, '..', '..', 'src', 'lib', 'ceptSnapshot.ts');

// Formato do payload do Apps Script (.gs getAppData). So o que a gente consome.
interface GsComponent {
  family?: string; familyLabel?: string; sourceLabel?: string; sourceType?: string;
  format?: string; editable?: boolean | null; status?: string; dateIso?: string; date?: string;
  validationStatus?: string; validationUser?: string; validationDate?: string;
}
interface GsDiscipline {
  responsible?: string; responsibleKind?: string; responsibilitySource?: string;
  items?: Record<string, { components?: GsComponent[] }>;
}
interface GsProject { code?: string; disciplines?: Record<string, GsDiscipline> }
interface GsPayload { meta?: { lastUpdated?: string }; projects?: GsProject[] }

const STATUS_VALIDOS: CeptStatus[] = ['delivered', 'pending', 'na', 'unknown'];

/**
 * O Apps Script formata data como `dd/MM/yyyy HH:mm` (formatDateTime_). `Date.parse` nessa
 * string devolve NaN sempre que o dia passa de 12 (le como mes), e ai `toMillis` vira 0 e a
 * regra "ultima decisao vence" de resolveValidationStatus para de ordenar. Converter na
 * entrada e mais barato que ensinar o modelo puro a falar formato brasileiro.
 */
export function dataBrParaIso(texto: string): string {
  const m = String(texto || '').trim().match(/^(\d{2})\/(\d{2})\/(\d{4})(?:[ T](\d{2}):(\d{2}))?$/);
  if (!m) return texto || '';
  const [, dia, mes, ano, hora = '00', min = '00'] = m;
  return `${ano}-${mes}-${dia}T${hora}:${min}:00`;
}

function normalizarStatus(raw: string | undefined): CeptStatus {
  const s = String(raw || '').trim() as CeptStatus;
  // Status desconhecido vira 'unknown' e fica FORA do percentual, nunca vira entregue por engano.
  return STATUS_VALIDOS.includes(s) ? s : 'unknown';
}

function tipoResponsavel(kind: string | undefined): CeptResponsavel['tipo'] {
  if (kind === 'internal' || kind === 'external') return kind;
  return 'unidentified';
}

export function converter(payload: GsPayload): {
  componentes: CeptComponent[];
  validacoes: CeptValidacao[];
  responsaveis: Record<string, CeptResponsavel>;
  avisos: string[];
} {
  const componentes: CeptComponent[] = [];
  const responsaveis: Record<string, CeptResponsavel> = {};
  const validacoes: CeptValidacao[] = [];
  const avisos: string[] = [];
  const chavesVistas = new Set<string>();

  for (const project of payload.projects || []) {
    const projectCode = String(project.code || '').trim();
    if (!projectCode) { avisos.push('projeto sem code no payload — ignorado'); continue; }

    for (const [disciplineCode, disc] of Object.entries(project.disciplines || {})) {
      if (disc.responsible) {
        responsaveis[`${projectCode}|${disciplineCode}`] = {
          responsavel: disc.responsible,
          tipo: tipoResponsavel(disc.responsibleKind),
          origem: disc.responsibilitySource || 'apps_script',
        };
      }

      for (const item of Object.values(disc.items || {})) {
        for (const comp of item.components || []) {
          const sourceType = String(comp.sourceType || '').trim();
          const family = String(comp.family || '').trim();
          if (!sourceType || !family) {
            avisos.push(`${projectCode}|${disciplineCode}: componente sem family/sourceType — ignorado`);
            continue;
          }

          // Mesma funcao que o app e o importador usam: chave unica e sem '/'.
          const recordKey = buildRecordKey(projectCode, disciplineCode, family, sourceType);
          if (chavesVistas.has(recordKey)) {
            avisos.push(`recordKey duplicado no payload: ${recordKey} — mantidas todas as ocorrências`);
          }
          chavesVistas.add(recordKey);

          componentes.push({
            recordKey,
            projectCode,
            disciplineCode,
            family,
            familyLabel: comp.familyLabel || family,
            sourceLabel: comp.sourceLabel || '',
            sourceType,
            format: comp.format || '',
            editable: comp.editable === true ? true : comp.editable === false ? false : null,
            status: normalizarStatus(comp.status),
            dateIso: comp.dateIso || '',
            updatedAt: new Date().toISOString(),
            updatedByEmail: 'apps-script-snapshot@ecoquanta',
            updatedByNome: 'Snapshot do Apps Script',
          });

          // O payload traz o status da validacao por componente, mas nao o historico.
          // Reconstruimos uma decisao RESOLVED para o alerta aparecer verde, como no original.
          if (comp.validationStatus === 'resolved') {
            validacoes.push({
              recordKey,
              projectCode,
              signature: '', // preenchida abaixo, quando o conjunto todo existir
              action: 'RESOLVED',
              usuarioEmail: comp.validationUser || 'desconhecido@quantaconsultoria.com',
              usuarioNome: comp.validationUser || 'Validação importada',
              criadoEm: dataBrParaIso(comp.validationDate || '') || new Date().toISOString(),
              observacao: 'Decisão trazida do Apps Script (histórico completo permanece lá).',
            });
          }
        }
      }
    }
  }

  // A assinatura depende do estado da familia INTEIRA, entao so pode ser calculada
  // depois que todos os componentes existem (ADR §3).
  for (const v of validacoes) {
    const c = componentes.find((x) => x.recordKey === v.recordKey);
    if (c) v.signature = buildSignature(c, componentes);
  }

  return { componentes, validacoes, responsaveis, avisos };
}

function gerarArquivo(dados: ReturnType<typeof converter>, origem: string): string {
  const j = (v: unknown) => JSON.stringify(v, null, 2);
  return `// GERADO por scripts/migracao/cept-from-appsscript.ts — não editar à mão.
// Origem: ${origem}
// !! DADO REAL DA QUANTA: não commitar. Confira \`git status\` antes.

import type { CeptComponent, CeptResponsavel, CeptValidacao } from './ceptModel';

export const snapshotGeradoEm = ${j(new Date().toISOString())};
export const snapshotComponentes: CeptComponent[] = ${j(dados.componentes)};
export const snapshotValidacoes: CeptValidacao[] = ${j(dados.validacoes)};
export const snapshotResponsaveis: Record<string, CeptResponsavel> = ${j(dados.responsaveis)};
`;
}

function main() {
  const entrada = process.argv[2];
  if (!entrada) throw new Error('Informe o JSON baixado: npx tsx scripts/migracao/cept-from-appsscript.ts <arquivo.json>');
  if (!fs.existsSync(entrada)) throw new Error(`Arquivo não encontrado: ${entrada}`);

  const payload = JSON.parse(fs.readFileSync(entrada, 'utf8')) as GsPayload;
  if (!Array.isArray(payload.projects) || !payload.projects.length) {
    throw new Error('O JSON não tem `projects`. Confira se você rodou o snippet no frame userCodeAppPanel e capturou o retorno de getAppData().');
  }

  const dados = converter(payload);
  fs.writeFileSync(SAIDA, gerarArquivo(dados, path.basename(entrada)), 'utf8');

  const entregues = dados.componentes.filter((c) => c.status === 'delivered').length;
  const pendentes = dados.componentes.filter((c) => c.status === 'pending').length;
  console.log(`componentes : ${dados.componentes.length} (${entregues} entregues, ${pendentes} pendentes)`);
  console.log(`responsaveis: ${Object.keys(dados.responsaveis).length}`);
  console.log(`validacoes  : ${dados.validacoes.length}`);
  console.log(`fonte em    : ${payload.meta?.lastUpdated || '(sem meta.lastUpdated)'}`);
  console.log(`escrito em  : ${SAIDA}`);
  if (dados.avisos.length) {
    console.log(`\n${dados.avisos.length} aviso(s):`);
    dados.avisos.slice(0, 20).forEach((a) => console.log('  - ' + a));
  }
  console.log('\nAbra http://localhost:2500/?ceptDemo=1 — o dashboard usa o snapshot automaticamente.');
}

if (process.argv[1] && process.argv[1].includes('cept-from-appsscript')) {
  try {
    main();
  } catch (erro) {
    console.error(`\nFALHOU: ${erro instanceof Error ? erro.message : String(erro)}`);
    process.exit(1);
  }
}
