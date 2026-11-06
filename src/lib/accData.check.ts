import assert from "node:assert/strict";
import fixture from "../../scripts/fixtures/accOs";
import resumo from "../../scripts/fixtures/accResumo";
import {
  applyAccEdit,
  correctResumo,
  countBy,
  filterAccIssues,
  isOutsourced,
  issueWeight,
  loadAccOsWith,
  parseAccJson,
  resumoRows,
  type AccEdit,
  type AccIssue,
} from "./accData";
import { legacyIssues } from "./qualityStore";

const all = [...fixture["061"], ...fixture["068"]];
const outsourced = new Set(["projetos alfa", "projetos beta"]);
const total = (rows: AccIssue[]) =>
  rows.reduce((sum, row) => sum + issueWeight(row), 0);
assert.equal(filterAccIssues(all, { os: "061" }, outsourced).length, 3);
assert.equal(
  filterAccIssues(all, { mes: "2026-11", status: "Aberto" }, outsourced).length,
  1,
);
assert.equal(
  filterAccIssues(all, { setor: "Arquitetura", tipo: "Desenho" }, outsourced)
    .length,
  2,
);
assert.equal(
  filterAccIssues(all, { terceirizada: "sim" }, outsourced).length,
  3,
);
assert.deepEqual(countBy(all, "os"), [
  { name: "061", value: 3 },
  { name: "068", value: 2 },
]);
assert.equal(isOutsourced("", new Set([""])), false);
assert.equal(
  isOutsourced("Quanta Consultoria", new Set(["quanta consultoria"])),
  false,
);
assert.equal(total(resumoRows(resumo)), 5);
assert.deepEqual(resumoRows({ osVersions: {}, empresas: [] }), []);
assert.throws(
  () => resumoRows({ osVersions: { "061": "hash" }, empresas: [], totais: {} }),
  /cruzamentos/,
);
const edit: AccEdit = {
  id: "061-#1",
  status: "Fechado",
  setor: "Eletrica",
  tipo: "Arquivo",
  empresa: "Quanta Consultoria",
  criadoEm: "2026-12-01T12:00:00-03:00",
  contratoCodigo: "OUTRO",
  editadoPor: "teste",
  editadoEm: "2026-11-06",
};
const corrected = correctResumo(resumoRows(resumo), fixture["061"], [edit]);
assert.equal(total(corrected), 5, "overlay never adds an issue");
assert.equal(
  total(filterAccIssues(corrected, { setor: "Arquitetura" }, outsourced)),
  2,
);
assert.equal(
  total(filterAccIssues(corrected, { status: "Aberto" }, outsourced)),
  1,
);
assert.equal(
  total(filterAccIssues(corrected, { terceirizada: "sim" }, outsourced)),
  2,
);
assert.equal(
  total(
    filterAccIssues(
      corrected,
      {
        contrato: "OUTRO",
        mes: "2026-12",
        setor: "Eletrica",
        tipo: "Arquivo",
        status: "Fechado",
        terceirizada: "nao",
        os: "061",
      },
      outsourced,
    ),
  ),
  1,
);
assert.equal(
  total(filterAccIssues(corrected, { mes: "2026-10" }, outsourced)),
  1,
);
assert.equal(
  applyAccEdit(fixture["061"][0], edit).id,
  "#1",
  "overlay document id must not replace issue id",
);
const legacy = legacyIssues([
  {
    id: "old",
    osCodigo: "061",
    disciplina: "Arquitetura",
    dataHora: "2026-10-01",
    itens: [
      { itemKey: "desenho", itemLabel: "Desenho", quantidadeT: 4 },
      { itemKey: "arquivo", itemLabel: "Arquivo", quantidadeT: 0 },
    ],
    observacoesHistorico: [{ mensagem: "preservar" }],
  } as any,
]);
assert.equal(
  legacy.length,
  1,
  "legacy counts one problem line, not T quantity",
);
assert.equal(legacy[0].origem, "legado");

let fetches = 0;
const cache = new Map<string, { hash: string; issues: AccIssue[] }>();
const deps = {
  readCache: async (os: string) => cache.get(os) || null,
  writeCache: async (
    os: string,
    entry: { hash: string; issues: AccIssue[] },
  ) => {
    cache.set(os, entry);
  },
  fetchOs: async (os: string) => {
    fetches++;
    return { json: JSON.stringify(fixture[os]) };
  },
  fetchChunks: async () => [],
};
await loadAccOsWith("061", "v1", deps);
await loadAccOsWith("068", "v1", deps);
await loadAccOsWith("061", "v1", deps);
await loadAccOsWith("068", "v1", deps);
assert.equal(fetches, 2);
await loadAccOsWith("061", "v2", deps);
await loadAccOsWith("068", "v1", deps);
assert.equal(fetches, 3, "changed hash refetches only selected OS");
assert.equal(
  (
    await loadAccOsWith("061", "chunks", {
      ...deps,
      fetchOs: async () => ({ chunkCount: 2 }),
      fetchChunks: async () => {
        const json = JSON.stringify(fixture["061"]);
        return [json.slice(0, 60), json.slice(60)];
      },
    })
  ).length,
  3,
);
await assert.rejects(
  loadAccOsWith("061", "missing", { ...deps, fetchOs: async () => null }),
  /ausente/,
);
await assert.rejects(
  loadAccOsWith("061", "old", {
    ...deps,
    fetchOs: async () => ({ hash: "new", json: "[]" }),
  }),
  /importacao em andamento/,
);
assert.equal(parseAccJson("[]").length, 0);
assert.throws(() => parseAccJson("{}"), /lista/);
console.log(
  "accData.check: OK (filters, corrections, legacy, chunks, cache, import races)",
);
