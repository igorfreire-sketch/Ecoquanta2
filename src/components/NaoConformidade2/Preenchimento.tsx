import React, { useState } from "react";
import { ACC_STATUSES, type AccEdit, type AccIssue } from "../../lib/accData";
import { saveQualityManual } from "../../lib/qualityStore";

export const QUALITY_FIELDS: Array<{
  key: keyof AccIssue;
  label: string;
  required?: boolean;
}> = [
  { key: "contratoCodigo", label: "Contrato", required: true },
  { key: "os", label: "OS", required: true },
  { key: "titulo", label: "Titulo", required: true },
  { key: "status", label: "Status", required: true },
  { key: "categoria", label: "Categoria" },
  { key: "tipo", label: "Tipo", required: true },
  { key: "descricao", label: "Descricao" },
  { key: "pessoa", label: "Atribuido a (pessoa)" },
  { key: "cargo", label: "Atribuido a (cargo)" },
  { key: "empresa", label: "Empresa" },
  { key: "seguidores", label: "Seguidores" },
  { key: "criadoPor", label: "Criado por" },
  { key: "criadoEm", label: "Criado em", required: true },
  { key: "vencimento", label: "Data de vencimento" },
  { key: "posicionamento", label: "Posicionamento" },
  { key: "setor", label: "Setor", required: true },
  { key: "atualizadoEm", label: "Atualizado em" },
  { key: "fechadoPor", label: "Fechado por" },
  { key: "fechadoEm", label: "Fechado as" },
  { key: "comentarios", label: "Comentarios" },
];
const fieldValue = (value: unknown) =>
  Array.isArray(value) ? value.join("\n") : String(value ?? "");
export const qualityInputClass =
  "w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 disabled:bg-slate-100";
export const qualityButtonClass =
  "rounded-xl bg-[#F05D28] px-4 py-2 text-sm font-bold text-white disabled:opacity-50";

export function IssueFields({
  issue,
  onChange,
  original,
  edit,
  options = {},
}: {
  issue: AccIssue;
  onChange: (next: AccIssue) => void;
  original?: AccIssue;
  edit?: AccEdit;
  options?: Partial<Record<keyof AccIssue, string[]>>;
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {QUALITY_FIELDS.map(({ key, label, required }) => (
        <label
          key={key}
          className="space-y-1 text-sm font-semibold text-slate-700"
        >
          <span>
            {label}
            {required && " *"}
          </span>
          {key === "status" ? (
            <select
              className={qualityInputClass}
              aria-label={label}
              value={issue.status}
              onChange={(event) =>
                onChange({ ...issue, status: event.target.value })
              }
            >
              {[
                ...new Set([...ACC_STATUSES, issue.status].filter(Boolean)),
              ].map((status) => (
                <option key={status}>{status}</option>
              ))}
            </select>
          ) : ["descricao", "comentarios", "seguidores"].includes(key) ? (
            <textarea
              className={qualityInputClass}
              aria-label={label}
              value={fieldValue(issue[key])}
              onChange={(event) =>
                onChange({
                  ...issue,
                  [key]:
                    key === "seguidores"
                      ? event.target.value.split("\n")
                      : event.target.value,
                })
              }
            />
          ) : (
            <>
              <input
                className={qualityInputClass}
                aria-label={label}
                required={required}
                disabled={original?.origem === "acc" && key === "os"}
                list={`quality-${key}`}
                value={fieldValue(issue[key])}
                onChange={(event) =>
                  onChange({ ...issue, [key]: event.target.value })
                }
              />
              {options[key]?.length > 0 && (
                <datalist id={`quality-${key}`}>
                  {options[key].map((value) => (
                    <option key={value} value={value} />
                  ))}
                </datalist>
              )}
            </>
          )}
          {edit && Object.hasOwn(edit, key) && (
            <small className="block text-amber-800">
              Editado · ACC: {fieldValue(original?.[key]) || "(vazio)"}
            </small>
          )}
          {["criadoEm", "vencimento", "atualizadoEm", "fechadoEm"].includes(
            key,
          ) && (
            <small className="block font-normal text-slate-500">
              Data ISO: AAAA-MM-DD ou AAAA-MM-DDThh:mm:ss-03:00
            </small>
          )}
        </label>
      ))}
    </div>
  );
}

export function validateIssue(issue: AccIssue) {
  for (const field of QUALITY_FIELDS.filter((field) => field.required))
    if (!String(issue[field.key] || "").trim())
      throw new Error(`Preencha ${field.label}.`);
  for (const key of [
    "criadoEm",
    "vencimento",
    "atualizadoEm",
    "fechadoEm",
  ] as const)
    if (
      issue[key] &&
      (!/^\d{4}-\d{2}-\d{2}/.test(issue[key]) ||
        Number.isNaN(Date.parse(issue[key])))
    )
      throw new Error(
        `Data invalida: ${QUALITY_FIELDS.find((field) => field.key === key)?.label}.`,
      );
}

export default function Preenchimento({
  contract = "",
  user,
  options,
  onSaved,
}: {
  contract?: string;
  user: string;
  options?: Partial<Record<keyof AccIssue, string[]>>;
  onSaved: () => void;
}) {
  const fresh = (): AccIssue => ({
    id: crypto.randomUUID(),
    contratoCodigo: contract,
    os: "",
    titulo: "",
    status: "Aberto",
    categoria: "Quality",
    tipo: "",
    setor: "",
    empresa: "",
    criadoPor: user,
    criadoEm: new Date().toISOString(),
    origem: "manual",
  });
  const [issue, setIssue] = useState(fresh);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  return (
    <section className="rounded-2xl bg-white p-6 shadow-sm">
      <h2 className="mb-2 text-xl font-bold">Preenchimento manual</h2>
      <p className="mb-6 text-sm text-slate-500">
        Novo item no padrao ACC. Para editar um item existente, use Revisoes.
      </p>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          setBusy(true);
          setMessage("");
          try {
            validateIssue(issue);
            await saveQualityManual(issue);
            setIssue(fresh());
            setMessage("Item manual salvo.");
            onSaved();
          } catch (error) {
            setMessage(
              error instanceof Error ? error.message : "Falha ao salvar.",
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        <IssueFields issue={issue} onChange={setIssue} options={options} />
        <div className="mt-6 flex items-center gap-4">
          <button className={qualityButtonClass} disabled={busy}>
            {busy ? "Salvando..." : "Salvar novo item"}
          </button>
          <p role="status">{message}</p>
        </div>
      </form>
    </section>
  );
}
