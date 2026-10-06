import React, { useMemo, useState } from 'react';
import { COLUNAS } from '../../lib/eapImport';
import { parseEapMarkdown, scopeProjectRows } from '../../lib/eapMarkdown';
import { convertProject, isEapServiceConfigured, previewProject, publishProject } from '../../lib/eapService';

interface OsOption { codigo: string; nome: string; contratoCodigo?: string }
interface ContractOption { codigo: string; nome: string }
interface Entry {
  id: string;
  file: File;
  rows?: string[][];
  rootName?: string;
  selectedOs: string;
  newCode: string;
  newName: string;
  error?: string;
  published?: string;
  predecessorsAreWbs: boolean;
}

function osNumber(value: string): number | null {
  const match = value.match(/\bOS\s*[-_.]?\s*0*(\d+)\b/i);
  return match ? Number(match[1]) : null;
}

export default function ImportarEAP({ osOptions, contracts, email, lockedContractCode, onPublished }: {
  osOptions: OsOption[];
  contracts: ContractOption[];
  email: string;
  lockedContractCode?: string;
  onPublished: () => Promise<void>;
}) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [activeId, setActiveId] = useState('');
  const [page, setPage] = useState(0);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [message, setMessage] = useState('');
  const serviceReady = isEapServiceConfigured();
  const options = useMemo(() => osOptions
    .filter((item) => /^\d+\.\d+$/.test(String(item.codigo || '')))
    .filter((item) => !lockedContractCode || String(item.contratoCodigo || item.codigo.split('.')[0]) === lockedContractCode)
    .sort((a, b) => a.codigo.localeCompare(b.codigo, 'pt-BR', { numeric: true })),
  [osOptions, lockedContractCode]);
  const active = entries.find((entry) => entry.id === activeId);
  const activeCode = active?.selectedOs === '__new__' ? active.newCode.trim() : active?.selectedOs || '';
  const activeName = active?.selectedOs === '__new__' ? active.newName.trim() : options.find((option) => option.codigo === active?.selectedOs)?.nome || '';
  let visibleRows = active?.rows || [];
  let activeScopeError = '';
  if (activeCode && activeName && active?.rows) {
    try { visibleRows = scopeProjectRows(active.rows, activeCode, activeName, active.predecessorsAreWbs); }
    catch (error) { activeScopeError = error instanceof Error ? error.message : 'A OS escolhida não confere com o arquivo.'; }
  }

  function patch(id: string, values: Partial<Entry>) {
    setEntries((current) => current.map((entry) => entry.id === id ? { ...entry, ...values } : entry));
  }

  async function addFiles(files: FileList | File[]) {
    if (busy) return;
    const chosen = Array.from(files);
    if (!chosen.length) return;
    const incoming: Entry[] = chosen.map((file) => ({ id: crypto.randomUUID(), file, selectedOs: '', newCode: '', newName: '', predecessorsAreWbs: file.name.toLowerCase().endsWith('.mpp') }));
    setEntries((current) => [...current, ...incoming]);
    setActiveId(incoming[0].id);
    setPage(0);
    setMessage('');
    setBusy(true);
    try {
      for (const entry of incoming) {
        try {
          const isMarkdown = entry.file.name.toLowerCase().endsWith('.md');
          if (!isMarkdown && !serviceReady) throw new Error('O serviço de conversão .mpp ainda não está configurado.');
          if (!isMarkdown && entry.file.size > 30 * 1024 * 1024) throw new Error('O arquivo .mpp excede o limite de 30 MB.');
          if (!isMarkdown && !entry.file.name.toLowerCase().endsWith('.mpp')) throw new Error('Use um arquivo .mpp ou .md gerado pela macro Ecoquanta.');
          let converted;
          if (isMarkdown) {
            const rows = parseEapMarkdown(await entry.file.text());
            converted = { rows, rootName: rows.find((row) => row[3].trim() === '0')?.[4] || rows[0]?.[4] || '' };
          } else {
            converted = await convertProject(entry.file, email);
          }
          const number = osNumber(converted.rootName);
          const matches = number === null ? [] : options.filter((option) => osNumber(option.nome) === number);
          patch(entry.id, { ...converted, selectedOs: matches.length === 1 ? matches[0].codigo : '', newName: converted.rootName });
        } catch (error) {
          patch(entry.id, { error: error instanceof Error ? error.message : 'Não foi possível converter o arquivo.' });
        }
      }
    } finally { setBusy(false); }
  }

  function chosenOs(entry: Entry) {
    const isNew = entry.selectedOs === '__new__';
    const code = isNew ? entry.newCode.trim() : entry.selectedOs;
    const name = isNew ? entry.newName.trim() : options.find((option) => option.codigo === code)?.nome || '';
    if (!/^\d+\.\d+$/.test(code) || !name) throw new Error('Selecione uma OS ou informe código e nome da nova OS.');
    if (isNew) {
      if (osOptions.some((option) => option.codigo === code)) throw new Error('Esta OS já existe. Selecione-a na lista.');
      const contractCode = code.split('.')[0];
      if (lockedContractCode && contractCode !== lockedContractCode) throw new Error('A nova OS deve pertencer ao seu contrato.');
      if (contracts.length && !contracts.some((contract) => String(contract.codigo) === contractCode)) throw new Error('O contrato informado não existe.');
    }
    return { code, name, isNew };
  }

  async function publishAll() {
    if (busy) return;
    setMessage('');
    const pending = entries.filter((item) => !item.published);
    const codes = new Set<string>();
    const prepared: { entry: Entry; code: string; name: string; isNew: boolean; rows: string[][] }[] = [];
    let invalid = false;
    for (const entry of pending) {
      try {
        if (!entry.rows) throw new Error(entry.error || 'A conversão não terminou. Remova o arquivo ou tente novamente.');
        const selection = chosenOs(entry);
        if (codes.has(selection.code)) throw new Error('A mesma OS foi escolhida para dois arquivos neste lote.');
        codes.add(selection.code);
        prepared.push({ entry, ...selection, rows: scopeProjectRows(entry.rows!, selection.code, selection.name, entry.predecessorsAreWbs) });
        patch(entry.id, { error: undefined });
      } catch (error) {
        invalid = true;
        patch(entry.id, { error: error instanceof Error ? error.message : 'Verifique a OS deste arquivo.' });
      }
    }
    if (invalid) { setMessage('Corrija os arquivos indicados antes de publicar o lote.'); return; }
    setBusy(true);
    let published = 0;
    try {
      for (const { entry, code, name, isNew, rows } of prepared) {
        try {
          const preview = await previewProject(code, name, isNew, rows, email);
          const result = await publishProject(preview, email);
          patch(entry.id, { published: `OS ${result.os} publicada na versão ${result.version}.`, error: undefined });
          published++;
        } catch (error) {
          patch(entry.id, { error: error instanceof Error ? error.message : 'Não foi possível publicar esta EAP.' });
        }
      }
      if (published) {
        try { await onPublished(); }
        catch { setMessage('As OS foram publicadas, mas a tela não recarregou os dados. Atualize a página.'); }
      }
    } finally { setBusy(false); }
  }

  return <div className="max-w-full space-y-5 p-6 font-['Montserrat']"
    onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
    onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragging(false); }}
    onDrop={(event) => { event.preventDefault(); setDragging(false); void addFiles(event.dataTransfer.files); }}>
    <div>
      <h2 className="text-xl font-bold text-[#2D2D2D]">Atualização EAP</h2>
      <p className="text-sm text-[#64748B]">Selecione ou arraste arquivos .mpp ou .md gerados pela macro. Confira a OS e as tarefas antes de publicar.</p>
    </div>
    {!serviceReady && <p role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">O conversor .mpp ainda não está configurado. Arquivos .md gerados pela macro podem ser conferidos e publicados normalmente.</p>}
    <div className={`rounded-xl border-2 border-dashed p-7 text-center ${dragging ? 'border-[#F05D28] bg-orange-50' : 'border-[#CBD5E1] bg-white'}`}>
      <p className="mb-3 text-sm font-semibold">Arraste os arquivos .mpp ou .md para cá</p>
      <label className="inline-block cursor-pointer rounded-lg bg-[#F05D28] px-5 py-2.5 text-sm font-bold text-white">
        Selecionar arquivos
        <input type="file" multiple accept=".mpp,.md" className="sr-only" onChange={(event) => { void addFiles(event.target.files || []); event.target.value = ''; }} />
      </label>
      {busy && <p role="status" className="mt-3 text-sm">Convertendo ou publicando arquivos…</p>}
    </div>
    {message && <p role="alert" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">{message}</p>}
    {entries.length > 0 && <div className="space-y-3">
      {entries.map((entry) => <div key={entry.id} className="rounded-xl border border-[#E5E7EB] bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <button type="button" onClick={() => { setActiveId(entry.id); setPage(0); }} className="text-left font-semibold text-[#2D2D2D] underline">{entry.file.name}</button>
          <span className="text-xs text-[#64748B]">{entry.rows ? `${entry.rows.length} tarefas · ${entry.rootName}` : entry.error ? 'Falha na conversão' : 'Convertendo…'}</span>
          {!busy && !entry.published && <button type="button" onClick={() => { setEntries((current) => current.filter((item) => item.id !== entry.id)); if (activeId === entry.id) setActiveId(''); }} className="text-sm text-red-700">Remover</button>}
        </div>
        {entry.rows && !entry.published && <div className="mt-3 flex flex-wrap gap-3">
          <label className="min-w-72 flex-1 text-sm font-semibold">Ordem de serviço
            <select value={entry.selectedOs} onChange={(event) => patch(entry.id, { selectedOs: event.target.value, error: undefined })} className="mt-1 w-full rounded-lg border border-[#CBD5E1] p-2 font-normal">
              <option value="">Selecione a OS</option>
              {options.map((option) => <option key={option.codigo} value={option.codigo}>{option.codigo} — {option.nome}</option>)}
              <option value="__new__">+ Criar nova OS</option>
            </select>
          </label>
          {entry.selectedOs === '__new__' && <>
            <label className="text-sm font-semibold">Código da nova OS<input value={entry.newCode} onChange={(event) => patch(entry.id, { newCode: event.target.value, error: undefined })} placeholder="Ex.: 2.26" className="mt-1 block rounded-lg border border-[#CBD5E1] p-2 font-normal" /></label>
            <label className="min-w-72 flex-1 text-sm font-semibold">Nome da nova OS<input value={entry.newName} onChange={(event) => patch(entry.id, { newName: event.target.value, error: undefined })} className="mt-1 block w-full rounded-lg border border-[#CBD5E1] p-2 font-normal" /></label>
          </>}
        </div>}
        {entry.error && <p role="alert" className="mt-2 text-sm text-red-700">{entry.error}</p>}
        {entry.published && <p role="status" className="mt-2 text-sm text-green-700">{entry.published}</p>}
      </div>)}
      <button type="button" disabled={busy || !entries.some((entry) => entry.rows && !entry.published)} onClick={() => { void publishAll(); }} className="rounded-lg bg-[#15803D] px-6 py-2.5 text-sm font-bold text-white disabled:opacity-40">OK, publicar EAPs conferidas</button>
    </div>}
    {active?.rows && <section className="space-y-3">
      <h3 className="font-bold">Prévia: {active.file.name}</h3>
      {activeScopeError && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{activeScopeError}</p>}
      <div className="max-h-[65vh] overflow-auto rounded-xl border border-[#CBD5E1] bg-white">
        <table className="min-w-max border-collapse text-left text-xs">
          <thead className="sticky top-0 bg-[#F1F5F9] text-[#334155]"><tr><th className="border p-2">#</th>{COLUNAS.map((name, index) => <th key={index} className="border p-2">{name}</th>)}</tr></thead>
          <tbody>{visibleRows.slice(page * 100, (page + 1) * 100).map((row, index) => <tr key={`${page}-${index}`} className="odd:bg-white even:bg-[#F8FAFC]"><td className="border p-2">{page * 100 + index + 1}</td>{row.map((cell, col) => <td key={col} className="max-w-80 truncate border p-2" title={cell}>{cell}</td>)}</tr>)}</tbody>
        </table>
      </div>
      {visibleRows.length > 100 && <div className="flex items-center gap-3 text-sm">
        <button type="button" disabled={page === 0} onClick={() => setPage(page - 1)} className="rounded border px-3 py-1 disabled:opacity-40">Anterior</button>
        <span>Página {page + 1} de {Math.ceil(visibleRows.length / 100)}</span>
        <button type="button" disabled={(page + 1) * 100 >= visibleRows.length} onClick={() => setPage(page + 1)} className="rounded border px-3 py-1 disabled:opacity-40">Próxima</button>
      </div>}
    </section>}
  </div>;
}
