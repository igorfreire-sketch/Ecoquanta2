import React, { useEffect, useState } from "react";
import { qualitySectorLabel, normalizeAccValue, issueKey, type AccEdit, type AccIssue } from "../../lib/accData";
import {
  effectiveAcc,
  readQualityOs,
  saveQualityEdit,
  saveQualityManual,
  type QualityData,
} from "../../lib/qualityStore";
import {
  IssueFields,
  QUALITY_FIELDS,
  qualityButtonClass,
  qualityInputClass,
  validateIssue,
} from "./Preenchimento";

type OsIssuesProps = {
  data: QualityData;
  os: string;
  manualRows: AccIssue[];
  filterIssue: (issue: AccIssue) => boolean;
  user: string;
  options: Partial<Record<keyof AccIssue, string[]>>;
  onSaved: () => void;
  contract?: string;
};

function OsIssues({
  data,
  os,
  manualRows,
  filterIssue,
  user,
  options,
  onSaved,
  contract,
}: OsIssuesProps) {
  const [imported, setImported] = useState<AccIssue[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<{
    original: AccIssue;
    draft: AccIssue;
    edit?: AccEdit;
  }>();
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState("");
  useEffect(() => { setPage(1); setEditing(undefined); }, [os, query]);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    setImported([]);
    setEditing(undefined);
    setError("");
    if (!os || !data.resumo.osVersions[os]) {
      setLoading(false);
      return;
    }
    setLoading(true);
    readQualityOs(os, data.resumo)
      .then((rows) => {
        if (active) setImported(rows);
      })
      .catch((error) => {
        if (active) setError(String(error.message || error));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
  return () => {
      active = false;
    };
  }, [os, data]);
  const rows = [
    ...imported.map((issue) => ({ ...issue, origem: "acc" as const })),
    ...manualRows,
  ].filter(
    (issue) =>
      !contract || !issue.contratoCodigo || issue.contratoCodigo === contract,
  );
  const beginEdit = (original: AccIssue) => {
    const edit =
      original.origem === "acc"
        ? data.edits.find((edit) => edit.id === issueKey(original))
        : undefined;
    setEditing({
      original,
      edit,
      draft:
        original.origem === "acc"
          ? effectiveAcc(original, data.edits)
          : { ...original },
    });
    setError("");
  };
    const matching = rows.filter(original => {
    const issue = original.origem === 'acc' ? effectiveAcc(original, data.edits) : original;
    if (!filterIssue(issue)) return false;
    return normalizeAccValue([issue.id, issue.titulo, issue.descricao, issue.status, issue.setor, qualitySectorLabel(issue.setor), issue.tipo, issue.empresa].join(' ')).includes(normalizeAccValue(query));
  });
  const pages = Math.max(1, Math.ceil(matching.length / 50));
  const currentPage = Math.min(page, pages);
  const visibleRows = matching.slice((currentPage - 1) * 50, currentPage * 50);
  const editForm = editing ? (
        <form
          className="rounded-xl border border-orange-200 bg-orange-50/30 p-5"
          onSubmit={async (event) => {
            event.preventDefault();
            setBusy(true);
            setError("");
            try {
              validateIssue(editing.draft);
              if (editing.original.origem === "acc")
                await saveQualityEdit(
                  editing.original,
                  editing.draft,
                  user,
                  editing.edit,
                );
              else await saveQualityManual(editing.draft);
              setEditing(undefined);
              onSaved();
            } catch (error) {
              setError(
                error instanceof Error ? error.message : "Falha ao salvar.",
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          <h3 className="mb-4 font-bold">
            Editar {issueKey(editing.original)}
          </h3>
          <IssueFields
            issue={editing.draft}
            original={editing.original}
            edit={editing.edit}
            options={options}
            onChange={(draft) => setEditing({ ...editing, draft })}
          />
          <div className="mt-5 flex gap-3">
            <button disabled={busy} className={qualityButtonClass}>
              {busy ? "Salvando..." : "Salvar edicao"}
            </button>
            <button
              type="button"
              disabled={busy}
              className="rounded-xl border px-4 py-2"
              onClick={() => setEditing(undefined)}
            >
              Cancelar
            </button>
          </div>
        </form>
) : null;

  return (
    <div className="space-y-3 border-t border-slate-200 p-4">
      {os && <div className="flex flex-wrap items-end gap-3">
        <label className="min-w-56 flex-1 text-sm font-semibold">Buscar issues<input aria-label="Buscar issues" className={qualityInputClass} value={query} onChange={event => setQuery(event.target.value)} placeholder="ID, titulo, status, setor ou empresa" /></label>
        <button aria-label="Pagina anterior" disabled={currentPage === 1} className="rounded border px-3 py-2 disabled:opacity-40" onClick={() => { setPage(currentPage - 1); setEditing(undefined); }}>Anterior</button>
        <span role="status" className="py-2 text-sm">Pagina {currentPage} de {pages} · {matching.length} itens · 50 por pagina</span>
        <button aria-label="Proxima pagina" disabled={currentPage === pages} className="rounded border px-3 py-2 disabled:opacity-40" onClick={() => { setPage(currentPage + 1); setEditing(undefined); }}>Proxima</button>
      </div>}
      {loading && <p role="status">Carregando OS {os}...</p>}
      {error && (
        <p role="alert" className="text-red-700">
          {error}
        </p>
      )}
      {os && !loading && !rows.length && (
        <p>Nenhum item ACC ou manual nesta OS.</p>
      )}
      {!loading && (
        <div className="divide-y divide-slate-200">
          {visibleRows.map((original) => {
            const issue =
              original.origem === "acc"
                ? effectiveAcc(original, data.edits)
                : original;
            const edit =
              original.origem === "acc"
                ? data.edits.find((edit) => edit.id === issueKey(original))
                : undefined;
            return (
              <details key={`${original.origem}-${issueKey(original)}`} className="py-3">
                <summary className="cursor-pointer text-sm font-bold">
                  {issueKey(issue)} · {issue.titulo} · {issue.status}
                </summary>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold text-slate-500">
                      {original.origem === "acc" ? "ACC" : "Manual"} ·{" "}
                      {issueKey(issue)} · {issue.status}
                    </p>
                    <h3 className="mt-1 font-bold">{issue.titulo}</h3>
                    <p className="mt-1 text-sm text-slate-600">
                      {qualitySectorLabel(issue.setor)} · {issue.tipo} ·{" "}
                      {issue.empresa || "Interno"}
                    </p>
                  </div>
                  <button
                    className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-bold"
                    onClick={() => beginEdit(original)}
                  >
                    Editar
                  </button>
                </div>
                {edit && (
                  <p className="mt-2 text-xs text-amber-800">
                    Editado por {edit.editadoPor} em {edit.editadoEm}
                  </p>
                )}
                <details open className="mt-2 text-sm">
                  <summary className="cursor-pointer text-slate-600">
                    Ver todos os campos
                  </summary>
                  <dl className="mt-2 grid gap-2 md:grid-cols-2">
                    {QUALITY_FIELDS.map(({ key, label }) => (
                      <div key={key}>
                        <dt className="font-semibold">{label}</dt>
                        <dd className="whitespace-pre-wrap break-words">
                          {Array.isArray(issue[key])
                            ? (issue[key] as string[]).join(", ")
                            : key === "setor" ? qualitySectorLabel(issue[key]) : String(issue[key] ?? "")}
                          {edit && Object.hasOwn(edit, key) && (
                            <small className="block text-amber-800">
                              Editado · ACC:{" "}
                              {key === "setor" ? qualitySectorLabel(original[key]) : String(original[key] || "(vazio)")}
                            </small>
                          )}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </details>
                {editing?.original.origem === original.origem && issueKey(editing.original) === issueKey(original) && editForm}
              </details>
            );
          })}
        </div>
      )}

    </div>
  );
}

// Cascata: toda OS aparece fechada; os itens so sao lidos ao abrir, para nao gastar a cota.
function OsGroup({
  os,
  label,
  count,
  startOpen,
  ...props
}: Omit<OsIssuesProps, "os"> & {
  os: string;
  label: string;
  count: number;
  startOpen: boolean;
}) {
  const [open, setOpen] = useState(startOpen);
  return (
    <details
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
      className="rounded-xl border border-slate-200 bg-white"
    >
      <summary className="flex cursor-pointer items-center justify-between gap-3 p-4 font-bold">
        <span>{label}</span>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs">{count} itens</span>
      </summary>
      {open && <OsIssues {...props} os={os} />}
    </details>
  );
}

export default function Revisoes({
  groups,
  openOs,
  filterBar,
  ...props
}: Omit<OsIssuesProps, "os" | "manualRows"> & {
  groups: Array<{ os: string; label: string; count: number; manualRows: AccIssue[] }>;
  openOs: string;
  filterBar: React.ReactNode;
}) {
  return (
    <section className="space-y-4">
      {filterBar}
      <p className="text-sm text-slate-500">
        Abra uma OS para ver e editar os itens. Edicoes do ACC preservam o valor importado.
      </p>
      {groups.map((group) => (
        <React.Fragment key={group.os}><OsGroup {...props} {...group} startOpen={group.os === openOs} /></React.Fragment>
      ))}
      {!groups.length && <p className="rounded-xl bg-white p-5">Nenhum item neste recorte.</p>}
    </section>
  );
}
