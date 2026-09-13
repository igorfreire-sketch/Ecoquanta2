// Dados FICTICIOS do CEPT, so para apresentacao. Nao tocam o Firebase: o dashboard
// entra neste modo por `?ceptDemo=1` na URL e nem chega a consultar o Firestore.
//
// Existe porque `ceptComponentes` ainda esta vazia em producao (o loader de carga real e
// scripts/migracao/cept-load.ts, que depende dos CSVs de origem) e as rules do CEPT ainda
// nao foram publicadas. Apagar quando a carga real entrar.
//
// Os numeros sao plausiveis, nao reais. A geracao e deterministica (PRNG com semente fixa),
// entao a tela e IDENTICA a cada reload -- numero nao pode dancar no meio da apresentacao.

import { buildRecordKey, buildSignature } from './ceptModel';
import type { CeptComponent, CeptResponsavel, CeptValidacao } from './ceptModel';
import { projectCodes, projectNames } from './ceptCatalog';
import { snapshotComponentes, snapshotGeradoEm, snapshotResponsaveis, snapshotValidacoes } from './ceptSnapshot';

// ponytail: PRNG de 1 linha (mulberry32) em vez de Math.random -- semente fixa = tela estavel.
function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Disciplinas por projeto: a Implantacao concentra infra; as edificacoes repetem o miolo. */
const DISCIPLINAS_EDIFICACAO = ['ARQ', 'SCO', 'HIDA', 'ESG', 'DREN', 'ELET', 'TELE', 'SPDA', 'AVAC', 'PCI', 'IMPE'];
const DISCIPLINAS_IMPLANTACAO = [...DISCIPLINAS_EDIFICACAO, 'URB', 'TERR', 'TOPO', 'TSD', 'VPAV', 'EREN', 'SUB'];

/** Cada familia e uma ou duas linhas contratuais, como na planilha de origem. */
const FAMILIAS: Array<{ family: string; familyLabel: string; sourceLabel: string; sourceType: string; format: string; editable: boolean }> = [
  { family: 'RVT', familyLabel: 'Modelo BIM', sourceLabel: 'Modelo Revit', sourceType: 'RVT', format: 'RVT', editable: true },
  { family: 'PDF', familyLabel: 'Prancha', sourceLabel: 'Prancha', sourceType: 'PDF', format: 'PDF', editable: false },
  { family: 'IFC', familyLabel: 'Modelo OpenBIM', sourceLabel: 'Modelo IFC', sourceType: 'IFC', format: 'IFC', editable: false },
  { family: 'MC', familyLabel: 'Memorial de Cálculo', sourceLabel: 'Memorial de Cálculo', sourceType: 'MC (PDF)', format: 'PDF', editable: false },
  { family: 'MC', familyLabel: 'Memorial de Cálculo', sourceLabel: 'Memorial de Cálculo', sourceType: 'MC (DOCX)', format: 'DOCX', editable: true },
  { family: 'MD', familyLabel: 'Memorial Descritivo', sourceLabel: 'Memorial Descritivo', sourceType: 'MD (PDF)', format: 'PDF', editable: false },
  { family: 'MD', familyLabel: 'Memorial Descritivo', sourceLabel: 'Memorial Descritivo', sourceType: 'MD (DOCX)', format: 'DOCX', editable: true },
  { family: 'ET/RT', familyLabel: 'Espec. / Relatório Técnico', sourceLabel: 'Especificação Técnica', sourceType: 'ET / RT (PDF)', format: 'PDF', editable: false },
  { family: 'ET/RT', familyLabel: 'Espec. / Relatório Técnico', sourceLabel: 'Especificação Técnica', sourceType: 'ET / RT (DOCX)', format: 'DOCX', editable: true },
  { family: 'MA', familyLabel: 'Memorial de Análise', sourceLabel: 'Memorial de Análise', sourceType: 'MA (PDF)', format: 'PDF', editable: false },
];

/** Disciplinas que so recebem modelo + prancha (nao tem memorial de calculo proprio). */
const SEM_MEMORIAL = new Set(['TOPO', 'TSD', 'IMPE']);

const TERCEIRIZADOS = ['Rio Ramp', 'YAN / MOB', 'Engeplan', 'Thermo Sul', 'Acqua Projetos', 'Lumina Engenharia'];

function iso(ano: number, mes: number, dia: number): string {
  return `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

/** Data entre 18/08/2026 (o corte) e 10/09/2026. */
function diaAposCorte(rand: () => number): string {
  const offset = Math.floor(rand() * 24);
  return offset < 14 ? iso(2026, 8, 18 + offset) : iso(2026, 9, offset - 13);
}

export interface CeptDemoDataset {
  componentes: CeptComponent[];
  validacoes: CeptValidacao[];
  responsaveis: Record<string, CeptResponsavel>;
}

/** true quando ha snapshot real do Apps Script; o banner muda de texto conforme isto. */
export const temSnapshotReal = snapshotComponentes.length > 0;
export const snapshotData = snapshotGeradoEm;

/**
 * Dado real do Apps Script quando existir; senao o ficticio gerado.
 * O ficticio continua valendo pra quem nao tem o snapshot na maquina -- e o snapshot
 * nao vai pro git, entao um clone limpo sempre cai no gerado.
 */
export function buildCeptDemoData(): CeptDemoDataset {
  if (temSnapshotReal) {
    return { componentes: snapshotComponentes, validacoes: snapshotValidacoes, responsaveis: snapshotResponsaveis };
  }
  return gerarDadosFicticios();
}

function gerarDadosFicticios(): CeptDemoDataset {
  const rand = rng(20260911);
  const componentes: CeptComponent[] = [];
  const responsaveis: Record<string, CeptResponsavel> = {};
  const validacoes: CeptValidacao[] = [];

  for (const projectCode of projectCodes) {
    const disciplinas = projectCode === '001' ? DISCIPLINAS_IMPLANTACAO : DISCIPLINAS_EDIFICACAO;

    // Projetos mais adiantados que outros: o dashboard fica interessante de olhar.
    const maturidade = 0.35 + rand() * 0.55;

    for (const disciplineCode of disciplinas) {
      const chaveResp = `${projectCode}|${disciplineCode}`;
      const sorteio = rand();
      responsaveis[chaveResp] =
        sorteio < 0.55
          ? { responsavel: 'Equipe interna', tipo: 'internal', origem: 'linha_direta' }
          : sorteio < 0.92
            ? { responsavel: TERCEIRIZADOS[Math.floor(rand() * TERCEIRIZADOS.length)], tipo: 'external', origem: 'linha_direta' }
            : { responsavel: 'Responsável não identificado', tipo: 'unidentified', origem: 'linha_direta' };

      for (const f of FAMILIAS) {
        if (SEM_MEMORIAL.has(disciplineCode) && f.family !== 'RVT' && f.family !== 'PDF') continue;
        // MA so existe em disciplinas de instalacao: evita matriz uniforme demais.
        if (f.family === 'MA' && !['ELET', 'AVAC', 'PCI', 'HIDA'].includes(disciplineCode)) continue;

        const sorte = rand();
        const status: CeptComponent['status'] =
          sorte < maturidade ? 'delivered' : sorte < maturidade + 0.34 ? 'pending' : sorte < maturidade + 0.4 ? 'unknown' : 'na';

        // Entregue tem data; pendente as vezes tem (envio recebido, ainda nao validado).
        // As datas do sorteio ficam DEPOIS do corte de 18/08 de proposito: senao a regra 1
        // pinta quase tudo de amarelo e os alertas plantados somem no meio do ruido.
        let dateIso = '';
        if (status === 'delivered') dateIso = diaAposCorte(rand);
        else if (status === 'pending' && rand() < 0.25) dateIso = diaAposCorte(rand);

        componentes.push({
          recordKey: buildRecordKey(projectCode, disciplineCode, f.family, f.sourceType),
          projectCode,
          disciplineCode,
          family: f.family,
          familyLabel: f.familyLabel,
          sourceLabel: `${f.sourceLabel} ${disciplineCode}`,
          sourceType: f.sourceType,
          format: f.format,
          editable: f.editable,
          status,
          dateIso,
          updatedAt: '2026-09-11T12:00:00.000Z',
          updatedByEmail: 'demo@ecoquanta',
          updatedByNome: 'Dados de demonstração',
        });
      }
    }
  }

  plantarAlertas(componentes);
  plantarValidacoes(componentes, validacoes);
  return { componentes, validacoes, responsaveis };
}

/**
 * Força as tres regras do ADR §2 a dispararem em casos concretos. Sem isto o sorteio
 * poderia nao produzir nenhum alerta e a tela mais importante da apresentacao ficaria vazia.
 */
function plantarAlertas(componentes: CeptComponent[]): void {
  const achar = (p: string, d: string, t: string) =>
    componentes.find((c) => c.projectCode === p && c.disciplineCode === d && c.sourceType === t);

  // Regra 1 (amarelo): entregue antes do corte de 18/08/2026.
  for (const [p, d] of [['003', 'ARQ'], ['006', 'ELET'], ['008', 'HIDA']] as const) {
    const c = achar(p, d, 'RVT');
    if (c) { c.status = 'delivered'; c.dateIso = iso(2026, 7, 22); }
  }

  // Regra 2 (VERMELHO): editavel postado DEPOIS do nao editavel -> o nao editavel envelheceu.
  // O par tem que ser da MESMA familia (MD aqui): a regra compara componentes dentro do
  // mesmo item, nao RVT contra PDF, que sao familias distintas e nunca se comparam.
  for (const [p, d] of [['001', 'ARQ'], ['005', 'SCO'], ['002', 'ELET'], ['007', 'AVAC']] as const) {
    const naoEditavel = achar(p, d, 'MD (PDF)');
    const editavel = achar(p, d, 'MD (DOCX)');
    if (!naoEditavel || !editavel) continue;
    naoEditavel.status = 'delivered';
    naoEditavel.dateIso = iso(2026, 8, 20);
    editavel.status = 'delivered';
    editavel.dateIso = iso(2026, 9, 4);
  }

  // Regra 3 (amarelo): nao editavel mais de 7 dias DEPOIS do editavel -> o editavel pode estar velho.
  for (const [p, d] of [['004', 'HIDA'], ['009', 'ARQ'], ['003', 'PCI']] as const) {
    const editavel = achar(p, d, 'MC (DOCX)');
    const naoEditavel = achar(p, d, 'MC (PDF)');
    if (!editavel || !naoEditavel) continue;
    editavel.status = 'delivered';
    editavel.dateIso = iso(2026, 8, 25);
    naoEditavel.status = 'delivered';
    naoEditavel.dateIso = iso(2026, 9, 8);
  }
}

/** Dois alertas ja validados (verde), pra mostrar o ciclo completo e o historico. */
function plantarValidacoes(componentes: CeptComponent[], validacoes: CeptValidacao[]): void {
  const alvos = [
    componentes.find((c) => c.projectCode === '001' && c.disciplineCode === 'ARQ' && c.sourceType === 'MD (PDF)'),
    componentes.find((c) => c.projectCode === '003' && c.disciplineCode === 'ARQ' && c.sourceType === 'RVT'),
  ].filter(Boolean) as CeptComponent[];

  alvos.forEach((c, i) => {
    validacoes.push({
      recordKey: c.recordKey,
      projectCode: c.projectCode,
      // A assinatura TEM que bater com a do estado atual da familia, senao resolveValidationStatus
      // devolve 'unreviewed' e o alerta volta a vermelho -- exatamente a trava do ADR §3.
      signature: buildSignature(c, componentes),
      action: 'RESOLVED',
      usuarioEmail: i === 0 ? 'tarcisio.marques@quantaconsultoria.com' : 'aline.bonsanto@quantaconsultoria.com',
      usuarioNome: i === 0 ? 'Tarcísio Marques' : 'Aline Bonsanto',
      criadoEm: new Date('2026-09-09T14:30:00Z'),
      severity: 'red',
      reasons: ['Conferido com o autor: o PDF publicado já corresponde ao modelo mais recente.'],
      observacao: 'Verificado na reunião de coordenação de 09/09.',
    });
  });
}
