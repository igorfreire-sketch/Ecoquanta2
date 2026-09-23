import { ExternalLink, Folder, Globe2, Lock, Pencil, Plus, Search, X } from 'lucide-react';
import { FormEvent, useMemo, useState } from 'react';
import type { DatabaseLinkRecord } from './Administracao';

export interface BancoLinksPageProps {
  links: DatabaseLinkRecord[];
  canManage: boolean;
  currentUserEmail: string;
  onSaveLink?: (payload: Omit<DatabaseLinkRecord, 'id'> & { id?: string }) => Promise<void> | void;
}

const isHttpUrl = (value: string) => { try { return ['http:', 'https:'].includes(new URL(value).protocol); } catch { return false; } };
const sameEmail = (a?: string, b?: string) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();

export default function BancoLinksPage({ links, canManage, currentUserEmail, onSaveLink }: BancoLinksPageProps) {
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<DatabaseLinkRecord | null>(null);
  const [nome, setNome] = useState(''); const [link, setLink] = useState('');
  const [tipo, setTipo] = useState<'link' | 'pasta'>('link'); const [pastaId, setPastaId] = useState('');
  const [publico, setPublico] = useState(true); const [error, setError] = useState(''); const [saving, setSaving] = useState(false);
  const visible = useMemo(() => links.filter((item) => item.publico !== false || canManage || sameEmail(item.criadoPor, currentUserEmail)), [links, canManage, currentUserEmail]);
  const folders = visible.filter((item) => item.tipo === 'pasta');
  const query = search.trim().toLowerCase();
  const canEdit = (item: DatabaseLinkRecord) => canManage || sameEmail(item.criadoPor, currentUserEmail);
  const close = () => { setEditing(null); setNome(''); setLink(''); setTipo('link'); setPastaId(''); setPublico(true); setError(''); };
  const open = (item?: DatabaseLinkRecord, nextType: 'link' | 'pasta' = 'link') => {
    setEditing(item || { id: '', nome: '', link: '', descricao: '', tipo: nextType, publico: true });
    setNome(item?.nome || ''); setLink(item?.link || ''); setTipo(item?.tipo || nextType); setPastaId(item?.pastaId || ''); setPublico(item?.publico !== false); setError('');
  };
  const save = async (event: FormEvent) => {
    event.preventDefault(); const nomeLimpo = nome.trim(); const url = link.trim();
    if (!nomeLimpo || (tipo === 'link' && !url)) return setError(tipo === 'pasta' ? 'Dê um nome à pasta.' : 'Preencha nome e link.');
    if (tipo === 'link' && !isHttpUrl(url)) return setError('Use uma URL iniciada em http:// ou https://.');
    if (!editing || !onSaveLink) return;
    setSaving(true); try { await onSaveLink({ ...(editing.id ? { id: editing.id } : {}), nome: nomeLimpo, link: tipo === 'link' ? url : '', descricao: '', tipo, pastaId: tipo === 'link' ? pastaId || undefined : undefined, publico, criadoPor: editing.criadoPor || currentUserEmail }); close(); }
    catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível salvar.'); } finally { setSaving(false); }
  };
  const matches = (item: DatabaseLinkRecord) => !query || `${item.nome} ${item.link}`.toLowerCase().includes(query);
  const LinkCard = ({ item }: { item: DatabaseLinkRecord }) => <div className="group flex items-center gap-3 rounded-xl border border-[#E5E7EB] bg-white p-3 shadow-sm transition hover:border-[#FED7AA]">
    {item.publico === false ? <Lock size={15} className="shrink-0 text-[#B45309]" /> : <Globe2 size={15} className="shrink-0 text-[#10B981]" />}<div className="min-w-0 flex-1"><p className="truncate text-[13px] font-bold text-[#2D2D2D]">{item.nome}</p><a href={item.link} target="_blank" rel="noopener noreferrer" className="flex min-w-0 items-center gap-1 text-[11px] text-[#F05D28] hover:underline"><span className="truncate">{item.link}</span><ExternalLink size={12} /></a></div>{canEdit(item) && <button type="button" onClick={() => open(item)} className="rounded p-1 text-[#94A3B8] hover:bg-[#FFF3EC] hover:text-[#F05D28]" aria-label={`Editar ${item.nome}`}><Pencil size={14} /></button>}
  </div>;
  const linksDaPasta = (folderId?: string) => visible.filter((item) => item.tipo !== 'pasta' && (item.pastaId || '') === (folderId || '') && matches(item));
  return <section className="rounded-2xl bg-white p-4 shadow-[0_10px_30px_-22px_rgba(15,23,42,0.45)] sm:p-5">
    <div className="flex flex-wrap items-center gap-2"><div><h2 className="text-[18px] font-black text-[#2D2D2D]">Banco de Links</h2><p className="text-[12px] text-[#64748B]">Itens públicos para todos; privados apenas para quem criou e administradores.</p></div><div className="ml-auto flex gap-2"><button type="button" onClick={() => open(undefined, 'pasta')} className="inline-flex h-9 items-center gap-1 rounded-lg border border-[#E5E7EB] px-3 text-[12px] font-bold text-[#2D2D2D] hover:bg-[#F9FAFB]"><Folder size={15} />Pasta</button><button type="button" onClick={() => open()} className="inline-flex h-9 items-center gap-1 rounded-lg bg-[#F05D28] px-3 text-[12px] font-bold text-white"><Plus size={15} />Link</button></div></div>
    <label className="mt-4 flex h-10 items-center gap-2 rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] px-3"><Search size={15} className="text-[#757575]" /><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Pesquisar links e pastas" className="min-w-0 flex-1 bg-transparent text-[13px] outline-none" /></label>
    {editing && <form onSubmit={save} className="mt-4 grid gap-3 rounded-xl border border-[#FED7AA] bg-[#FFF8F4] p-4 sm:grid-cols-2"><div className="flex gap-2 sm:col-span-2"><button type="button" onClick={() => setTipo('link')} className={`rounded-lg px-3 py-1.5 text-[12px] font-bold ${tipo === 'link' ? 'bg-[#F05D28] text-white' : 'bg-white text-[#64748B]'}`}>Link</button><button type="button" onClick={() => setTipo('pasta')} className={`rounded-lg px-3 py-1.5 text-[12px] font-bold ${tipo === 'pasta' ? 'bg-[#F05D28] text-white' : 'bg-white text-[#64748B]'}`}>Pasta</button><button type="button" onClick={close} className="ml-auto text-[#64748B]"><X size={18} /></button></div><input autoFocus value={nome} onChange={(event) => setNome(event.target.value)} placeholder={tipo === 'pasta' ? 'Nome da pasta' : 'Nome do link'} className="h-10 rounded-lg border border-[#E5E7EB] bg-white px-3 text-[13px] outline-none focus:border-[#F05D28]" />{tipo === 'link' ? <input value={link} onChange={(event) => setLink(event.target.value)} placeholder="https://..." className="h-10 rounded-lg border border-[#E5E7EB] bg-white px-3 text-[13px] outline-none focus:border-[#F05D28]" /> : <div />}{tipo === 'link' && <select value={pastaId} onChange={(event) => setPastaId(event.target.value)} className="h-10 rounded-lg border border-[#E5E7EB] bg-white px-3 text-[13px]"><option value="">Sem pasta</option>{folders.filter((folder) => folder.id !== editing.id).map((folder) => <option key={folder.id} value={folder.id}>{folder.nome}</option>)}</select>}<label className="flex h-10 items-center gap-2 rounded-lg border border-[#E5E7EB] bg-white px-3 text-[12px] font-bold text-[#2D2D2D]"><input type="checkbox" checked={publico} onChange={(event) => setPublico(event.target.checked)} className="accent-[#F05D28]" />Público</label>{error && <p role="alert" className="text-[12px] font-bold text-[#DC2626] sm:col-span-2">{error}</p>}<button disabled={saving} className="h-10 rounded-lg bg-[#F05D28] text-[12px] font-bold text-white disabled:opacity-60 sm:col-span-2">{saving ? 'Salvando...' : 'Salvar'}</button></form>}
    <div className="mt-5 space-y-5">{folders.filter(matches).map((folder) => <div key={folder.id} className="rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] p-3"><div className="mb-3 flex items-center gap-2"><Folder size={16} className="text-[#F05D28]" /><p className="font-black text-[#2D2D2D]">{folder.nome}</p>{folder.publico === false ? <Lock size={13} className="text-[#B45309]" /> : <Globe2 size={13} className="text-[#10B981]" />}{canEdit(folder) && <button type="button" onClick={() => open(folder)} className="ml-auto text-[#94A3B8] hover:text-[#F05D28]"><Pencil size={14} /></button>}</div><div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{linksDaPasta(folder.id).map((item) => <div key={item.id}>{LinkCard({ item })}</div>)}{linksDaPasta(folder.id).length === 0 && <p className="text-[12px] text-[#94A3B8]">Nenhum link nesta pasta.</p>}</div></div>)}<div><p className="mb-2 text-[12px] font-black uppercase tracking-wide text-[#64748B]">Sem pasta</p><div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{linksDaPasta().map((item) => <div key={item.id}>{LinkCard({ item })}</div>)}{linksDaPasta().length === 0 && <p className="text-[12px] text-[#94A3B8]">Nenhum link encontrado.</p>}</div></div></div>
  </section>;
}
