import React, { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import Conformidade from "../../src/components/NaoConformidade2/Conformidade";
import Kanban from "../../src/components/NaoConformidade2/QualityKanban";
import { getFixtureStats } from "../../src/lib/qualityStore";
import "../../src/index.css";
const user = { nome: "Teste local", email: "fixture@example.test" };
const preloadedData = {
  registro: {
    contracts: [{ code: "MRK" }, { code: "OUTRO" }],
    osOptions: [
      { code: "061", contractCode: "MRK" },
      { code: "068", contractCode: "MRK" },
    ],
  },
};
Object.assign(window, { accFixtureStats: getFixtureStats });
function Harness() {
  const [tab, setTab] = useState(
    new URLSearchParams(location.search).get("tab") || "dashboard",
  );
  const [pendingOs, setPendingOs] = useState(
    new URLSearchParams(location.search).get("os") || "",
  );
  return (
    <main className="min-h-screen bg-slate-100 p-5">
      <nav aria-label="Fixture tabs" className="mb-5 flex flex-wrap gap-2">
        {[
          "dashboard",
          "preenchimento",
          "revisoes",
          "terceirizadas",
          "principal",
        ].map((value) => (
          <button
            key={value}
            className="rounded border bg-white px-3 py-2"
            onClick={() => setTab(value)}
          >
            {value}
          </button>
        ))}
      </nav>
      {tab === "principal" ? (
        <Kanban
          currentUser={user}
          preloadedData={preloadedData}
          onOpenOs={(os) => {
            setPendingOs(os);
            setTab("revisoes");
          }}
        />
      ) : (
        <Conformidade
          activeTab={tab}
          onTabChange={setTab}
          currentUser={user}
          preloadedData={preloadedData}
          pendingOs={pendingOs}
          onPendingEditConsumed={() => setPendingOs("")}
        />
      )}
    </main>
  );
}
if (!(import.meta as ImportMeta & { env: { DEV: boolean } }).env.DEV)
  throw new Error("Fixture harness is dev-only.");
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Harness />
  </StrictMode>,
);
