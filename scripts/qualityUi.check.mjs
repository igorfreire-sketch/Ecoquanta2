import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright";
import { createServer } from "vite";

const base =
  process.env.QUALITY_TEST_URL ||
  "http://127.0.0.1:2501/scripts/fixtures/quality.html?accFixture";
const server = await createServer({
  clearScreen: false,
  server: {
    host: "127.0.0.1",
    port: 2501,
    strictPort: true,
    hmr: false,
    watch: { ignored: ["**/relatorio/**"] },
  },
});
await server.listen();
const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1100 },
});
const page = await context.newPage();
page.setDefaultTimeout(15000);
const errors = [];
const firebaseRequests = [];
page.on("pageerror", (error) => errors.push(error.message));
await context.route("**/*", (route) => {
  const url = route.request().url();
  if (/firestore.googleapis|identitytoolkit.googleapis/.test(url))
    firebaseRequests.push(url);
  return url.startsWith("http://127.0.0.1:2501/") || url.startsWith("data:")
    ? route.continue()
    : route.abort();
});
const tab = (name) =>
  page
    .getByRole("navigation", { name: "Fixture tabs" })
    .getByRole("button", { name, exact: true })
    .click();
const metric = async (label, expected) => {
  await page.waitForFunction(
    ({ label, expected }) =>
      document.querySelector(`[data-testid="metric-${label}"]`)?.textContent ===
      String(expected),
    { label, expected },
  );
};
const filter = async (label, value, expected) => {
  await page.getByLabel(`Filtro ${label}`, { exact: true }).selectOption(value);
  await metric("Issues", expected);
};
const stats = () => page.evaluate(() => window.accFixtureStats());
const matrix = [];
try {
  await page.goto(base);
  await page.evaluate(async () => {
    sessionStorage.clear();
    await new Promise((resolve, reject) => {
      const request = indexedDB.deleteDatabase("ecoquanta-acc");
      request.onsuccess = resolve;
      request.onerror = reject;
    });
  });
  await page.reload();
  await metric("Issues", 5);
  await metric("Abertas", 3);
  await metric("Terceirizadas", 3);
  assert.deepEqual(
    (await stats()).osFetches,
    {},
    "dashboard must not download issue collections",
  );
  for (const [label, value, expected] of [
    ["Contrato", "OUTRO", 0],
    ["OS", "061", 3],
    ["Mes", "2026-11", 3],
    ["Setor", "Arquitetura", 3],
    ["Tipo de erro", "Desenho", 2],
    ["Terceirizada", "sim", 3],
    ["Status", "Aberto", 2],
  ]) {
    await filter(label, value, expected);
    matrix.push({ filter: label, value, expected, actual: expected });
    await filter(label, "", 5);
  }
  for (const [label, value] of [
    ["Contrato", "MRK"],
    ["OS", "061"],
    ["Mes", "2026-11"],
    ["Setor", "Eletrica"],
    ["Tipo de erro", "Relatorio"],
    ["Terceirizada", "sim"],
    ["Status", "Pendente"],
  ])
    await page
      .getByLabel(`Filtro ${label}`, { exact: true })
      .selectOption(value);
  await metric("Issues", 1);
  matrix.push({ filter: "all seven combined", expected: 1, actual: 1 });
  for (const label of [
    "Contrato",
    "OS",
    "Mes",
    "Setor",
    "Tipo de erro",
    "Terceirizada",
    "Status",
  ])
    await page.getByLabel(`Filtro ${label}`, { exact: true }).selectOption("");
  await metric("Issues", 5);
  await tab("revisoes");
  await page.getByLabel("OS para revisar").selectOption("061");
  await page
    .getByRole("heading", { name: "Folha sem carimbo", exact: true })
    .waitFor();
  await page.getByLabel("OS para revisar").selectOption("068");
  await page
    .getByRole("heading", { name: "Arquivo ausente", exact: true })
    .waitFor();
  assert.deepEqual((await stats()).osFetches, { "061": 1, "068": 1 });
  await page.reload();
  await tab("revisoes");
  await page.getByLabel("OS para revisar").selectOption("061");
  await page
    .getByRole("heading", { name: "Folha sem carimbo", exact: true })
    .waitFor();
  await page.getByLabel("OS para revisar").selectOption("068");
  await page
    .getByRole("heading", { name: "Arquivo ausente", exact: true })
    .waitFor();
  assert.deepEqual(
    (await stats()).osFetches,
    {},
    "second open must reuse IndexedDB without a refetch",
  );
  matrix.push({
    cache: "second page open",
    osFetches: {},
    cacheHits: (await stats()).cacheHits,
  });
  await page.goto(`${base}&changed`);
  await tab("revisoes");
  await page.getByLabel("OS para revisar").selectOption("061");
  await page
    .getByRole("heading", { name: "Folha sem carimbo", exact: true })
    .waitFor();
  await page.getByLabel("OS para revisar").selectOption("068");
  await page
    .getByRole("heading", { name: "Arquivo ausente", exact: true })
    .waitFor();
  assert.deepEqual(
    (await stats()).osFetches,
    { "061": 1 },
    "changed hash refetches only OS 061",
  );
  matrix.push({
    cache: "changed 061 hash",
    osFetches: (await stats()).osFetches,
  });
  await tab("terceirizadas");
  await page
    .getByRole("checkbox", { name: "Projetos Alfa", exact: true })
    .uncheck();
  await page.waitForFunction(
    () =>
      JSON.parse(sessionStorage.getItem("acc-fixture-companies")).find(
        (row) => row.nome === "Projetos Alfa",
      ).terceirizada === false,
  );
  await tab("dashboard");
  await page.getByLabel("Filtro OS", { exact: true }).selectOption("");
  await metric("Terceirizadas", 1);
  const companyChart = page.getByRole("img", {
    name: "Terceirizadas: 5 issues",
    exact: true,
  });
  await companyChart.waitFor();
  matrix.push({ companyCheckbox: "Projetos Alfa unchecked", outsourced: 1 });
  await tab("terceirizadas");
  await page.getByRole("button", { name: "+ Novo", exact: true }).click();
  await page
    .getByLabel("Nome da empresa", { exact: true })
    .fill("Nova Empresa");
  await page.getByRole("button", { name: "Adicionar", exact: true }).click();
  await page
    .getByRole("checkbox", { name: "Nova Empresa", exact: true })
    .waitFor();
  await tab("preenchimento");
  for (const [label, value] of [
    ["Contrato", "MRK"],
    ["OS", "061"],
    ["Titulo", "Item manual de teste"],
    ["Tipo", "Desenho"],
    ["Setor", "Arquitetura"],
    ["Empresa", "Nova Empresa"],
  ])
    await page.getByLabel(label, { exact: true }).fill(value);
  await page
    .getByRole("button", { name: "Salvar novo item", exact: true })
    .click();
  await page
    .getByRole("status")
    .filter({ hasText: "Item manual salvo." })
    .waitFor();
  await tab("dashboard");
  await metric("Issues", 6);
  await metric("Terceirizadas", 2);
  matrix.push({ manual: "new issue merged", total: 6, outsourced: 2 });
  await tab("revisoes");
  await page.getByLabel("OS para revisar").selectOption("061");
  const article = page
    .locator("article")
    .filter({
      has: page.getByRole("heading", {
        name: "Folha sem carimbo",
        exact: true,
      }),
    });
  await article.getByRole("button", { name: "Editar", exact: true }).click();
  await page.getByLabel("Status", { exact: true }).selectOption("Fechado");
  await page.getByLabel("Setor", { exact: true }).fill("Eletrica");
  await page
    .getByRole("button", { name: "Salvar edicao", exact: true })
    .click();
  await page
    .getByText("Editado por fixture@example.test", { exact: false })
    .waitFor();
  await tab("dashboard");
  await page.getByLabel("Filtro OS", { exact: true }).selectOption("");
  await metric("Issues", 6);
  await metric("Abertas", 3);
  await filter("Setor", "Eletrica", 2);
  await filter("Status", "Fechado", 1);
  matrix.push({
    overlay: "061-#1 becomes Fechado / Eletrica",
    total: 6,
    open: 3,
    correctedFilter: 1,
  });
  await filter("Setor", "", 2);
  await filter("Status", "", 6);
  await tab("revisoes");
  await page.getByLabel("OS para revisar").selectOption("061");
  await page
    .locator("article")
    .filter({
      has: page.getByRole("heading", {
        name: "Folha sem carimbo",
        exact: true,
      }),
    })
    .getByRole("button", { name: "Editar", exact: true })
    .click();
  await page
    .locator("form")
    .getByText("Editado · ACC: Aberto", { exact: true })
    .waitFor();
  await page.getByLabel("Status", { exact: true }).selectOption("Aberto");
  await page
    .getByRole("button", { name: "Salvar edicao", exact: true })
    .click();
  await tab("dashboard");
  await page.getByLabel("Filtro OS", { exact: true }).selectOption("");
  await metric("Abertas", 4);
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Exportar PDF", exact: true }).click();
  const download = await downloadPromise;
  assert.match(download.suggestedFilename(), /qualidade.*\.pdf$/);
  await mkdir("relatorio/acc-ui", { recursive: true });
  await download.saveAs("relatorio/acc-ui/qualidade-fixture.pdf");
  await page.locator(".recharts-sector").first().waitFor({ state: "visible" });
  await page.screenshot({
    path: "relatorio/acc-ui/dashboard.png",
    fullPage: true,
  });
  await tab("principal");
  await page.getByRole("heading", { name: "Qualidade por OS" }).waitFor();
  const cards = page.getByRole("button").filter({ hasText: /issues abertas/ });
  assert.equal(await cards.count(), 2);
  await cards.filter({ hasText: "OS 068" }).click();
  await page
    .getByRole("heading", { name: "Arquivo ausente", exact: true })
    .waitFor();
  assert.equal(await page.getByLabel("OS para revisar").inputValue(), "068");
  matrix.push({ principal: "one card per OS", cards: 2, clickOpens: "068" });
  await page.setViewportSize({ width: 390, height: 844 });
  await tab("dashboard");
  await page.getByLabel("Filtro OS", { exact: true }).selectOption("");
  await metric("Issues", 6);
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
    "mobile must not overflow horizontally",
  );
  await page.screenshot({
    path: "relatorio/acc-ui/mobile.png",
    fullPage: true,
  });
  await tab("revisoes");
  await page.getByLabel("OS para revisar").selectOption("061");
  const manualArticle = page
    .locator("article")
    .filter({
      has: page.getByRole("heading", {
        name: "Item manual de teste",
        exact: true,
      }),
    });
  await manualArticle
    .getByRole("button", { name: "Editar", exact: true })
    .click();
  await page.getByLabel("Titulo", { exact: true }).fill("Item manual revisado");
  await page
    .getByRole("button", { name: "Salvar edicao", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Item manual revisado", exact: true })
    .waitFor();
  matrix.push({ manualEdit: "only Revisoes", saved: true });
  await page.evaluate(() =>
    sessionStorage.setItem(
      "acc-fixture-legacy",
      JSON.stringify([
        {
          id: "legacy-1",
          contratoCodigo: "MRK",
          osCodigo: "061",
          disciplina: "Arquitetura",
          dataHora: "2026-10-01",
          itens: [
            { itemKey: "desenho", itemLabel: "Desenho legado", quantidadeT: 4 },
            {
              itemKey: "arquivo",
              itemLabel: "Arquivo sem problema",
              quantidadeT: 0,
            },
          ],
          observacoesHistorico: [{ mensagem: "historico preservado" }],
        },
        {
          id: "legacy-zero",
          contratoCodigo: "MRK",
          osCodigo: "068",
          disciplina: "Arquitetura",
          itens: [],
        },
      ]),
    ),
  );
  await page.reload();
  await metric("Issues", 7);
  await page
    .getByText("Registros anteriores (legado):", { exact: false })
    .click();
  await page.locator("summary").filter({ hasText: "legacy-zero" }).waitFor();
  matrix.push({
    legacy: "two records preserved, one positive T line counted once",
    total: 7,
  });
  await page.evaluate(async () => {
    sessionStorage.clear();
    sessionStorage.setItem(
      "acc-fixture-edits",
      JSON.stringify([
        {
          id: "061-#1",
          status: "Fechado",
          editadoPor: "fixture",
          editadoEm: "2026-11-06",
        },
      ]),
    );
    await new Promise((resolve, reject) => {
      const request = indexedDB.deleteDatabase("ecoquanta-acc");
      request.onsuccess = resolve;
      request.onerror = reject;
    });
  });
  await page.goto(`${base}&tab=revisoes&os=068`);
  await page
    .getByRole("heading", { name: "Arquivo ausente", exact: true })
    .waitFor();
  assert.deepEqual(
    (await stats()).osFetches,
    { "068": 1 },
    "direct Revisoes must not fetch overlay OS 061",
  );
  matrix.push({
    directRevisoes: "overlay exists on 061, chosen 068",
    osFetches: (await stats()).osFetches,
  });
  await context.clearCookies();
  await page.evaluate(() => sessionStorage.clear());
  await page.goto(`${base}&empty`);
  await metric("Issues", 0);
  await page
    .getByText("Nenhum item neste recorte.", { exact: false })
    .waitFor();
  matrix.push({ emptyResumo: "renders before import", total: 0 });
  assert.deepEqual(errors, []);
  assert.deepEqual(firebaseRequests, []);
  await writeFile(
    "relatorio/acc-ui/matrix.json",
    JSON.stringify(
      { passed: true, matrix, pageErrors: errors, firebaseRequests },
      null,
      2,
    ),
  );
  console.log(
    JSON.stringify(
      { passed: true, matrix, pageErrors: errors, firebaseRequests },
      null,
      2,
    ),
  );
} catch (error) {
  await mkdir("relatorio/acc-ui", { recursive: true });
  await page.screenshot({
    path: "relatorio/acc-ui/failure.png",
    fullPage: true,
  });
  console.error(
    JSON.stringify({
      pageErrors: errors,
      firebaseRequests,
      text: (await page.locator("body").innerText()).slice(0, 3500),
    }),
  );
  throw error;
} finally {
  await browser.close();
  await server.close();
}
