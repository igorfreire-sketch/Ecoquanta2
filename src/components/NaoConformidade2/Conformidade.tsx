import React, { useEffect, useMemo, useState } from "react";
import {
  qualitySectorLabel,
  countBy,
  accMonth,
  filterAccIssues,
  isAccDone,
  isOutsourced,
  issueWeight,
  normalizeAccValue,
  type AccCount,
  type AccFilters,
  type AccIssue,
} from "../../lib/accData";
import {
  qualityMetricRows,
  loadQualityView,
  type QualityData,
} from "../../lib/qualityStore";
import Preenchimento, { qualityInputClass } from "./Preenchimento";
import Revisoes from "./Revisoes";
import QualityCompanies from "./QualityCompanies";
import { DistributionDonut } from "./QualityCharts";

type Option = {
  id?: string;
  code?: string;
  codigo?: string;
  name?: string;
  nome?: string;
  contractCode?: string;
  contratoCodigo?: string;
};
export interface ConformidadeProps {
  activeTab: string;
  onTabChange: (
    tab: "dashboard" | "preenchimento" | "revisoes" | "terceirizadas",
  ) => void;
  currentUser: { nome: string; email: string };
  activeContractCode?: string;
  lockedContractCode?: string;
  pendingOs?: string;
  onPendingEditConsumed?: () => void;
  preloadedData?: { registro?: { contracts?: Option[]; osOptions?: Option[] } };
  [key: string]: unknown;
}
const filterLabels: Record<keyof AccFilters, string> = {
  contrato: "Contrato",
  os: "OS",
  mes: "Mes",
  setor: "Setor",
  tipo: "Tipo de erro",
  terceirizada: "Terceirizado ou interno",
  empresa: "Terceirizada",
  status: "Status",
};
const sum = (rows: AccCount[]) =>
  rows.reduce((total, row) => total + issueWeight(row), 0);

// App usa "Todos" como contrato ativo; aqui isso significa sem filtro.
// ponytail: EAP has no contract names yet; add a registry field if a third contract appears.
const CONTRACT_NAMES: Record<string, string> = { "1": "Macaé", "2": "Maricá" };
const contractName = (code: string) => CONTRACT_NAMES[code] || code;
// ACC identifies an OS by number ("061"); the EAP names it ("OS 061 - CEPT LOD 400", code 2.23).
const osNumberFromName = (name: string) => {
  const number = name.match(/OS\s*0*(\d+)/i)?.[1];
  return number ? number.padStart(3, "0") : "";
};

const qualityContract = (locked?: string, active?: string) => {
  const value = String(locked || active || "").trim();
  return value.toLowerCase() === "todos" ? "" : value;
};

export default function Conformidade({
  activeTab,
  onTabChange,
  currentUser,
  activeContractCode,
  lockedContractCode,
  preloadedData,
  pendingOs,
  onPendingEditConsumed,
}: ConformidadeProps) {
  const [data, setData] = useState<QualityData>();
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [filters, setFilters] = useState<AccFilters>({
    contrato: qualityContract(lockedContractCode, activeContractCode),
  });
  const [pdfBusy, setPdfBusy] = useState(false);
  const [metricRows, setMetricRows] = useState<AccCount[]>();
  useEffect(() => {
    let active = true;
    if (!data || (activeTab !== "dashboard" && activeTab !== "revisoes")) return;
    setMetricRows(undefined);
    qualityMetricRows(data)
      .then((rows) => {
        if (active) setMetricRows(rows);
      })
      .catch((error) => {
        if (active) setError(String(error.message || error));
      });
    return () => {
      active = false;
    };
  }, [data, activeTab]);
  const refresh = () => setRevision((value) => value + 1);
  const editScope = activeTab === "dashboard" ? filters.os || undefined : activeTab === "revisoes" ? undefined : null;
  useEffect(() => {
    let active = true;
    setError("");
    loadQualityView(editScope)
      .then((value) => {
        if (active) setData(value);
      })
      .catch((error) => {
        if (active) setError(String(error.message || error));
      });
    return () => {
      active = false;
    };
  }, [revision, editScope]);
  useEffect(() => {
    setFilters((current) => ({
      ...current,
      contrato: qualityContract(lockedContractCode, activeContractCode),
      os: "",
    }));
  }, [lockedContractCode, activeContractCode]);
  useEffect(() => {
    if (pendingOs) {
      setFilters((current) => ({ ...current, os: pendingOs }));
      onPendingEditConsumed?.();
    }
  }, [pendingOs]);
  const osCatalog = useMemo(
    () =>
      (preloadedData?.registro?.osOptions || []).flatMap((option) => {
        const code = String(option.code || option.codigo || option.id || "");
        const name = String(option.name || option.nome || code);
        if (code.split(".").length !== 2) return [];
        return [{ code, name, contract: code.split(".")[0], value: osNumberFromName(name) || code }];
      }),
    [preloadedData],
  );
  const findOs = (value: string) =>
    osCatalog.find((item) => item.value === value || item.code === value);
  const osLabel = (value: string) => findOs(value)?.name || value;
  const rows: AccCount[] = useMemo(
    () =>
      data
        ? [...(metricRows || data.rows), ...data.manual, ...data.legacy].map(
            (row) => {
              const os = findOs(String(row.os || ""));
              return {
                ...row,
                os: os?.value || row.os,
                contratoCodigo: row.contratoCodigo || os?.contract || "",
              };
            },
          )
        : [],
    [data, metricRows, osCatalog],
  );
  const checked = new Set<string>(
    data?.companies
      .filter((company) => company.terceirizada)
      .map((company) => normalizeAccValue(company.nome)),
  );
  const filtered = filterAccIssues(rows, filters, checked);
  const total = sum(filtered);
  const done = sum(filtered.filter((row) => isAccDone(row.status)));
  const outsourced = sum(
    filtered.filter((row) => isOutsourced(row.empresa, checked)),
  );
  const unique = (field: keyof AccIssue) =>
    [
      ...new Set<string>(
        rows.map((row) => field === "setor" ? qualitySectorLabel(row[field]) : String(row[field] || "")).filter(Boolean),
      ),
    ].sort();
  const osValues = [
    ...new Set<string>([
      ...Object.keys(data?.resumo.osVersions || {}),
      ...unique("os"),
      ...osCatalog.map((item) => item.value),
    ]),
  ].sort();
  const fieldOptions: Partial<Record<keyof AccIssue, string[]>> = {
    os: osValues,
    contratoCodigo: [
      ...new Set<string>([
        ...unique("contratoCodigo"),
        ...(preloadedData?.registro?.contracts || []).map((option) =>
          String(option.code || option.codigo || option.id || ""),
        ),
      ]),
    ].filter(Boolean),
    tipo: unique("tipo"),
    setor: unique("setor"),
    empresa: data?.resumo.empresas || [],
  };
  if (error)
    return (
      <div role="alert" className="rounded-xl bg-red-50 p-6 text-red-800">
        Nao foi possivel carregar Qualidade: {error}
        <button className="ml-4 underline" onClick={refresh}>
          Tentar novamente
        </button>
      </div>
    );
  if (!data || ((activeTab === "dashboard" || activeTab === "revisoes") && !metricRows))
    return (
      <p role="status" className="p-6">
        Carregando Qualidade...
      </p>
    );
  const exportPdf = async () => {
    setPdfBusy(true);
    try {
      const { buildConformidadePdf, getConformidadePdfFilename } =
        await import("./conformidadePdf");
      const generatedAt = new Date();
      const pdf = buildConformidadePdf({
        generatedAt,
        contractLabel: filters.contrato ? contractName(filters.contrato) : "Todos",
        osLabel: filters.os ? osLabel(filters.os) : "Todas",
        filterLabel: Object.entries(filterLabels)
          .map(
            ([key, label]) =>
              `${label}: ${filters[key as keyof AccFilters] || "Todos"}`,
          )
          .join(" | "),
        recordCount: total,
        totalAnalyzed: total,
        internalAnalyzed: total - outsourced,
        outsourcedAnalyzed: outsourced,
        perfectFiles: done,
        totalNonConformities: total - done,
        ncByDiscipline: countBy(filtered, "setor"),
        ncByType: countBy(filtered, "tipo"),
        ncByCompany: countBy(filtered, "empresa"),
      });
      pdf.save(
        getConformidadePdfFilename(
          generatedAt,
          filters.contrato || "",
          filters.os || "",
        ),
      );
    } catch (error) {
      window.alert(
        error instanceof Error ? error.message : "Falha ao gerar PDF.",
      );
    } finally {
      setPdfBusy(false);
    }
  };
  const filterBar = (
    <div className="grid gap-3 rounded-2xl bg-white p-5 shadow-sm sm:grid-cols-2 lg:grid-cols-4">
            {Object.entries(filterLabels).map(([key, label]) => {
              const field = key as keyof AccFilters;
              const options =
                field === "contrato"
                  ? fieldOptions.contratoCodigo || []
                  : field === "os"
                    ? osValues.filter((value) => !filters.contrato || !findOs(value) || findOs(value)?.contract === filters.contrato)
                    : field === "mes"
                      ? [
                          ...new Set<string>(
                            rows
                              .map((row) => accMonth(row.criadoEm))
                              .filter(Boolean),
                          ),
                        ].sort()
                      : field === "terceirizada"
                        ? ["sim", "nao"]
                        : field === "empresa"
                          ? (data?.companies || []).filter((company) => company.terceirizada).map((company) => company.nome).sort()
                        : unique(field as keyof AccIssue);
              return (
                <label key={key} className="space-y-1 text-xs font-bold">
                  {label}
                  <select
                    className={qualityInputClass}
                    aria-label={`Filtro ${label}`}
                    disabled={
                      field === "contrato" && Boolean(lockedContractCode)
                    }
                    value={filters[field] || ""}
                    onChange={(event) =>
                      setFilters((current) => ({
                        ...current,
                        [field]: event.target.value,
                      }))
                    }
                  >
                    <option value="">Todos</option>
                    {[
                      ...new Set([...options, filters[field]].filter(Boolean)),
                    ].map((value) => (
                      <option key={value} value={value}>
                        {field === "contrato"
                          ? contractName(String(value))
                          : field === "os"
                            ? osLabel(String(value))
                            : value === "sim"
                              ? "Terceirizado"
                              : value === "nao"
                                ? "Interno"
                                : value}
                      </option>
                    ))}
                  </select>
                </label>
              );
            })}
            <button
              className="self-end justify-self-start rounded-lg bg-[#F05D28] px-3 py-1.5 text-xs font-bold text-white hover:bg-[#D94E1F] disabled:opacity-60"
              disabled={pdfBusy}
              onClick={exportPdf}
            >
              {pdfBusy ? "Gerando..." : "Exportar PDF"}
            </button>
          </div>
  );
  const nested = filterAccIssues(
    filtered.filter((row) => row.origem !== "legado"),
    {},
    checked,
  );
  const revisionGroups = [...new Set(nested.map((row) => String(row.os || "")))]
    .filter(Boolean)
    .sort()
    .map((os) => ({
      os,
      label: osLabel(os),
      count: sum(nested.filter((row) => row.os === os)),
      manualRows: rows.filter((row) => row.origem === "manual" && row.os === os) as AccIssue[],
    }));
  return (
    <div className="space-y-5 pb-16 text-slate-800">
      <div>
        <h1 className="text-2xl font-bold">Qualidade</h1>
        <p className="mt-1 text-sm text-slate-500">
          ACC, entradas manuais e registros anteriores
        </p>
      </div>
      {activeTab === "preenchimento" ? (
        <Preenchimento
          contract={lockedContractCode || filters.contrato}
          user={currentUser.nome || currentUser.email}
          options={fieldOptions}
          onSaved={refresh}
        />
      ) : activeTab === "terceirizadas" ? (
        <QualityCompanies data={data} onSaved={refresh} />
      ) : activeTab === "revisoes" ? (
        <Revisoes
          data={data}
          groups={revisionGroups}
          openOs={filters.os || ""}
          filterBar={filterBar}
          filterIssue={(issue) =>
            filterAccIssues([issue], { ...filters, contrato: "", os: "" }, checked).length > 0
          }
          user={currentUser.email}
          options={fieldOptions}
          onSaved={refresh}
          contract={lockedContractCode}
        />
      ) : (
        <>
          {filterBar}
          <div className="grid gap-3 sm:grid-cols-4">
            {[
              ["Issues", total],
              ["Abertas", total - done],
              ["Concluidas / fechadas", done],
              ["Terceirizadas", outsourced],
            ].map(([label, value]) => (
              <div key={label} className="rounded-2xl bg-white p-5 shadow-sm">
                <p className="text-xs font-bold text-slate-500">{label}</p>
                <p
                  data-testid={`metric-${label}`}
                  className="mt-2 text-3xl font-bold"
                >
                  {value}
                </p>
              </div>
            ))}
          </div>
          {!total && (
            <p className="rounded-xl bg-white p-5">
              Nenhum item neste recorte. A tela esta pronta para a primeira
              importacao.
            </p>
          )}
          <div className="grid gap-4 lg:grid-cols-2">
            {(
              [
                ["Setor", "setor"],
                ["Tipo de erro", "tipo"],
                ["Empresa", "empresa"],
                ["Status", "status"],
              ] as const
            ).map(([label, field]) => (
              <div key={field}>
                <DistributionDonut
                  title={label}
                  subtitle="Itens no recorte selecionado"
                  data={countBy(filtered, field).filter(
                    (slice) => slice.value > 0,
                  )}
                  remainderLabel="Outros"
                  emptyMessage="Sem itens neste recorte"
                />
              </div>
            ))}
            <DistributionDonut
              title="Terceirizadas"
              subtitle="Conforme cadastro de empresas"
              data={[
                ...countBy(
                  filtered.filter((row) => isOutsourced(row.empresa, checked)),
                  "empresa",
                ),
                { name: "Interno", value: total - outsourced },
              ].filter((slice) => slice.value > 0)}
              remainderLabel="Outros"
              emptyMessage="Sem itens neste recorte"
            />
          </div>
          <details className="rounded-2xl bg-white p-5">
            <summary className="cursor-pointer font-bold">
              Registros anteriores (legado): {data.legacyRecords.length}{" "}
              registros, {data.legacy.length} itens com problema
            </summary>
            <p className="my-3 text-sm text-slate-500">
              Uma ocorrencia por linha antiga com T maior que zero, seguindo a
              contagem anterior. Dados originais preservados, somente leitura.
            </p>
            <div className="max-h-96 overflow-auto">
              {filterAccIssues(data.legacy, filters, checked).map((issue) => (
                <p key={issue.id} className="border-t py-2 text-sm">
                  OS {issue.os} · {issue.titulo} · {qualitySectorLabel(issue.setor)} ·{" "}
                  {issue.status} · {issue.empresa} · {issue.descricao}
                </p>
              ))}
            </div>
            <div className="mt-4 space-y-2">
              {data.legacyRecords
                .filter(
                  (record) =>
                    (!filters.contrato ||
                      record.contratoCodigo === filters.contrato) &&
                    (!filters.os ||
                      (record.osCodigo || record.os) === filters.os),
                )
                .map((record) => (
                  <details key={record.id} className="border-t py-2">
                    <summary className="cursor-pointer text-sm">
                      {record.id} · OS {record.osCodigo || record.os} ·{" "}
                      {record.disciplina}
                    </summary>
                    <pre className="overflow-auto whitespace-pre-wrap text-xs">
                      {JSON.stringify(record, null, 2)}
                    </pre>
                  </details>
                ))}
            </div>
          </details>
        </>
      )}
    </div>
  );
}
