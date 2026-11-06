import React, { useState } from 'react';
import { normalizeAccValue } from '../../lib/accData';
import { saveQualityCompany, type QualityCompany, type QualityData } from '../../lib/qualityStore';
import { qualityButtonClass, qualityInputClass } from './Preenchimento';

export default function QualityCompanies({ data, onSaved }: { data: QualityData; onSaved: () => void }) {
  const [name, setName] = useState('');
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const names: string[] = [...new Set<string>([...data.resumo.empresas, ...data.companies.map(company => company.nome), ...data.manual.map(issue => issue.empresa || '')].filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const findCompany = (nome: string) => data.companies.find(company => normalizeAccValue(company.nome) === normalizeAccValue(nome));
  const persist = async (company: QualityCompany) => { setBusy(true); setError(''); try { await saveQualityCompany(company); onSaved(); return true; } catch (error) { setError(error instanceof Error ? error.message : 'Falha ao salvar empresa.'); return false; } finally { setBusy(false); } };
  return <section className="space-y-5 rounded-2xl bg-white p-6 shadow-sm"><div className="flex items-center justify-between gap-3"><div><h2 className="text-xl font-bold">Terceirizados</h2><p className="mt-1 text-sm text-slate-500">Marque as empresas terceirizadas. Empresa vazia ou Quanta Consultoria e sempre interna.</p></div><button className={qualityButtonClass} onClick={() => setAdding(true)}>+ Novo</button></div>
    {adding && <form className="flex flex-wrap gap-3" onSubmit={async event => { event.preventDefault(); const nome = name.trim(); if (!nome) return; if (names.some(value => normalizeAccValue(value) === normalizeAccValue(nome))) { setError('Empresa ja cadastrada.'); return; } if (await persist({ id: crypto.randomUUID(), nome, terceirizada: true, manual: true })) { setName(''); setAdding(false); } }}><label className="flex-1 text-sm font-bold">Nome da empresa<input autoFocus required aria-label="Nome da empresa" className={qualityInputClass} value={name} onChange={event => setName(event.target.value)} /></label><button disabled={busy} className={qualityButtonClass}>Adicionar</button><button type="button" onClick={() => setAdding(false)}>Cancelar</button></form>}
    {error && <p role="alert" className="text-red-700">{error}</p>}
    {!names.length && <p>Nenhuma empresa importada. Use + Novo para cadastrar um nome.</p>}
    <div className="divide-y divide-slate-100">{names.map(nome => { const company = findCompany(nome); const internal = normalizeAccValue(nome) === 'quanta consultoria'; return <label key={nome} className="flex items-center gap-3 py-3 text-sm"><input type="checkbox" aria-label={nome} disabled={busy || internal} checked={!internal && Boolean(company?.terceirizada)} onChange={event => void persist({ id: company?.id || crypto.randomUUID(), nome, terceirizada: event.target.checked, manual: company?.manual || false })} className="h-5 w-5 accent-[#F05D28]" />{nome}{internal && <span className="text-slate-500">(interno)</span>}</label>; })}</div>
  </section>;
}
