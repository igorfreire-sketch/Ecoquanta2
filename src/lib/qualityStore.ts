import { fetchFirebaseCollection, setFirebaseDocument } from "./firebaseDb";
import {
  ACC_EDITABLE_FIELDS,
  browserAccCache,
  loadAccOsWith,
  applyAccEdit,
  correctResumo,
  issueKey,
  loadAccOs,
  loadAccResumo,
  loadAccTerceirizadas,
  loadManualQuality,
  normalizeAccValue,
  resumoRows,
  type AccCount,
  type AccEdit,
  type AccIssue,
  type AccResumo,
} from "./accData";
import type { Nc2Record } from "../components/NaoConformidade2/ncStore";

export type QualityCompany = {
  id: string;
  nome: string;
  terceirizada: boolean;
  manual?: boolean;
};
export type QualityData = {
  resumo: AccResumo;
  manual: AccIssue[];
  legacy: AccIssue[];
  legacyRecords: Nc2Record[];
  edits: AccEdit[];
  companies: QualityCompany[];
  rows: AccCount[];
};
let dataPromise: Promise<QualityData> | undefined;
export const fixtureMode = () =>
  (import.meta as ImportMeta & { env: { DEV: boolean } }).env.DEV &&
  new URLSearchParams(location.search).has("accFixture");
const fixtureStats = { osFetches: {} as Record<string, number>, cacheHits: 0 };
// Development fixture harness observes the actual IndexedDB cache path without Firebase.
export const getFixtureStats = () => fixtureStats;

export function legacyIssues(records: Nc2Record[]): AccIssue[] {
  return records.flatMap((record) => {
    const items = record.itens?.length ? record.itens : record.itensT || [];
    return items
      .filter((item) => Number(item.quantidadeT) > 0)
      .map((item) => {
        const label = normalizeAccValue(`${item.itemKey} ${item.itemLabel}`);
        const tipo = label.includes("carimbo")
          ? "Carimbo"
          : label.includes("desenho")
            ? "Desenho"
            : label.includes("relatorio")
              ? "Relatorio"
              : label.includes("arquivo")
                ? "Arquivo"
                : "Outros";
        return {
          id: `${record.id}:${item.itemKey}`,
          os: record.osCodigo || record.os,
          contratoCodigo: record.contratoCodigo,
          titulo: item.itemLabel,
          descricao: record.observacoes,
          status:
            record.concluido ||
            item.statusCorrecao === "corrigido" ||
            item.correcaoOrigem === "conformidade"
              ? "Concluido"
              : "Pendente",
          tipo,
          setor: record.disciplina,
          empresa: record.terceirizadaNome || "Quanta Consultoria",
          criadoEm: record.createdAt || record.dataHora,
          origem: "legado" as const,
        };
      });
  });
}

const pendingOs = new Map<string, Promise<AccIssue[]>>();
export function readQualityOs(
  os: string,
  resumo: AccResumo,
): Promise<AccIssue[]> {
  const key = `${os}:${resumo.osVersions[os]}`;
  let pending = pendingOs.get(key);
  if (!pending) {
    pending = readQualityOsUncached(os, resumo).finally(() =>
      pendingOs.delete(key),
    );
    pendingOs.set(key, pending);
  }
  return pending;
}
async function readQualityOsUncached(os: string, resumo: AccResumo) {
  if (fixtureMode()) {
    const fixture = (await import("../../scripts/fixtures/accOs")).default;
    return loadAccOsWith(os, resumo.osVersions[os], {
      ...browserAccCache,
      readCache: async (id) => {
        const cached = await browserAccCache.readCache(id);
        if (cached?.hash === resumo.osVersions[id]) fixtureStats.cacheHits++;
        return cached;
      },
      fetchOs: async (id) => {
        fixtureStats.osFetches[id] = (fixtureStats.osFetches[id] || 0) + 1;
        return { json: JSON.stringify(new URLSearchParams(location.search).has("large") ? (await import("../../scripts/fixtures/accLarge")).largeIssues : fixture[id] || []) };
      },
      fetchChunks: async () => [],
    });
  }
  return loadAccOs(os, resumo);
}

export function loadQuality(): Promise<QualityData> {
  if (!dataPromise)
    dataPromise = (async () => {
      let resumo: AccResumo,
        manual: AccIssue[],
        legacyRecords: Nc2Record[],
        edits: AccEdit[],
        companies: QualityCompany[];
      if (fixtureMode()) {
        resumo = structuredClone(
          (await import("../../scripts/fixtures/accResumo")).default,
        );
        const params = new URLSearchParams(location.search);
        if (params.has("large")) resumo = structuredClone((await import("../../scripts/fixtures/accLarge")).largeResumo);
        if (params.has("empty")) resumo = { osVersions: {}, empresas: [] };
        if (params.has("changed")) resumo.osVersions["061"] = "hash-061-v2";
        manual = JSON.parse(
          sessionStorage.getItem("acc-fixture-manual") || "[]",
        );
        legacyRecords = JSON.parse(
          sessionStorage.getItem("acc-fixture-legacy") || "[]",
        );
        edits = JSON.parse(sessionStorage.getItem("acc-fixture-edits") || "[]");
        companies =
          JSON.parse(
            sessionStorage.getItem("acc-fixture-companies") || "null",
          ) ||
          resumo.empresas.map((nome, index) => ({
            id: `fixture-${index}`,
            nome,
            terceirizada: nome !== "Quanta Consultoria",
          }));
      } else {
        [resumo, manual, legacyRecords, edits, companies] = await Promise.all([
          loadAccResumo(),
          loadManualQuality(),
          fetchFirebaseCollection<Nc2Record>("nc2Records"),
          fetchFirebaseCollection<AccEdit>("accEdicoes"),
          loadAccTerceirizadas(),
        ]);
      }
      const legacy = legacyIssues(legacyRecords);
      return {
        resumo,
        manual,
        legacy,
        legacyRecords,
        edits,
        companies,
        rows: resumoRows(resumo),
      };
    })().catch((error) => {
      dataPromise = undefined;
      throw error;
    });
  return dataPromise;
}

export function invalidateQuality() {
  dataPromise = undefined;
}

export async function saveQualityManual(issue: AccIssue) {
  if (fixtureMode()) {
    const rows: AccIssue[] = JSON.parse(
      sessionStorage.getItem("acc-fixture-manual") || "[]",
    );
    sessionStorage.setItem(
      "acc-fixture-manual",
      JSON.stringify([...rows.filter((row) => row.id !== issue.id), issue]),
    );
  } else
    await setFirebaseDocument("qualidadeManual", issue.id, {
      ...issue,
      origem: "manual",
    });
  invalidateQuality();
}

export async function saveQualityEdit(
  original: AccIssue,
  edited: AccIssue,
  user: string,
  existing?: AccEdit,
) {
  const patch: Record<string, unknown> = {};
  const current = applyAccEdit(original, existing);
  Object.entries(edited).forEach(([field, value]) => {
    if (
      ACC_EDITABLE_FIELDS.includes(field as keyof AccIssue) &&
      JSON.stringify(value) !== JSON.stringify(current[field as keyof AccIssue])
    )
      patch[field] = value;
  });
  const id = issueKey(original);
  const payload = {
    ...patch,
    editadoPor: user,
    editadoEm: new Date().toISOString(),
  };
  if (fixtureMode()) {
    const rows: AccEdit[] = JSON.parse(
      sessionStorage.getItem("acc-fixture-edits") || "[]",
    );
    sessionStorage.setItem(
      "acc-fixture-edits",
      JSON.stringify([
        ...rows.filter((row) => row.id !== id),
        { ...existing, ...payload, id },
      ]),
    );
  } else await setFirebaseDocument("accEdicoes", id, payload, false);
  invalidateQuality();
}

export async function saveQualityCompany(company: QualityCompany) {
  if (fixtureMode()) {
    const data = await loadQuality();
    sessionStorage.setItem(
      "acc-fixture-companies",
      JSON.stringify([
        ...data.companies.filter((row) => row.id !== company.id),
        company,
      ]),
    );
  } else
    await setFirebaseDocument(
      "accTerceirizadas",
      company.id,
      {
        nome: company.nome,
        terceirizada: company.terceirizada,
        manual: Boolean(company.manual),
      },
      false,
    );
  invalidateQuality();
}
export const effectiveAcc = (issue: AccIssue, edits: AccEdit[]) =>
  applyAccEdit(
    issue,
    edits.find((edit) => edit.id === issueKey(issue)),
  );

// Only dashboard and Principal need correction reads. Revisoes never downloads other OS.
const metricPromises = new WeakMap<QualityData, Promise<AccCount[]>>();
export function qualityMetricRows(data: QualityData): Promise<AccCount[]> {
  let promise = metricPromises.get(data);
  if (!promise) {
    const affectedOs = Object.keys(data.resumo.osVersions).filter((os) =>
      data.edits.some((edit) => edit.id.startsWith(`${os}-`)),
    );
    promise = Promise.all(
      affectedOs.map((os) => readQualityOs(os, data.resumo)),
    )
      .then((groups) => correctResumo(data.rows, groups.flat(), data.edits))
      .catch((error) => {
        metricPromises.delete(data);
        throw error;
      });
    metricPromises.set(data, promise);
  }
  return promise;
}
