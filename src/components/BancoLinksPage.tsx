import { ExternalLink, Pencil, Plus, Search, X } from 'lucide-react';
import { FormEvent, useMemo, useState } from 'react';
import type { DatabaseLinkRecord } from './Administracao';

export interface BancoLinksPageProps {
  links: DatabaseLinkRecord[];
  canManage: boolean;
  onSaveLink?: (payload: Omit<DatabaseLinkRecord, 'id'> & { id?: string }) => Promise<void> | void;
}

function isHttpUrl(value: string) {
  try {
    return ['http:', 'https:'].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

export default function BancoLinksPage({ links, canManage, onSaveLink }: BancoLinksPageProps) {
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<DatabaseLinkRecord | null>(null);
  const [nome, setNome] = useState('');
  const [link, setLink] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const filteredLinks = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('pt-BR');
    if (!query) return links;
    return links.filter((item) => `${item.nome} ${item.link}`.toLocaleLowerCase('pt-BR').includes(query));
  }, [links, search]);

  const closeForm = () => {
    setEditing(null);
    setNome('');
    setLink('');
    setError('');
  };

  const openForm = (item?: DatabaseLinkRecord) => {
    setEditing(item ?? { id: '', nome: '', link: '', descricao: '' });
    setNome(item?.nome ?? '');
    setLink(item?.link ?? '');
    setError('');
  };

  const handleSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextName = nome.trim();
    const nextLink = link.trim();
    if (!nextName || !nextLink) return setError('Preencha nome e link.');
    if (!isHttpUrl(nextLink)) return setError('Use uma URL iniciada em http:// ou https://.');
    if (!onSaveLink || !editing) return;

    setSaving(true);
    try {
      await onSaveLink({
        ...(editing.id ? { id: editing.id } : {}),
        nome: nextName,
        link: nextLink,
        descricao: editing.descricao || '',
      });
      closeForm();
    } catch {
      setError('Não foi possível salvar o link. Tente novamente.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="overflow-hidden rounded-2xl bg-white shadow-[0_10px_30px_-22px_rgba(15,23,42,0.45)]">
      <div className="flex items-center gap-2 border-b border-[#E5E7EB] px-3 py-2.5 sm:px-4">
        <label className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-lg border border-[#E5E7EB] bg-[#F9FAFB] px-3 focus-within:border-[#F05D28] focus-within:bg-white">
          <Search size={15} className="shrink-0 text-[#757575]" aria-hidden="true" />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Pesquisar links"
            aria-label="Pesquisar links"
            className="min-w-0 flex-1 bg-transparent text-[13px] text-[#2D2D2D] outline-none placeholder:text-[#9CA3AF]"
          />
        </label>
        {canManage && (
          <button
            type="button"
            onClick={() => openForm()}
            className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-[#F05D28] px-3 text-[12px] font-bold text-white transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F05D28]"
          >
            <Plus size={15} aria-hidden="true" />
            Link
          </button>
        )}
      </div>

      {editing && canManage && (
        <form onSubmit={handleSave} className="grid gap-2 border-b border-[#FDE3D5] bg-[#FFF8F4] p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)_auto] sm:items-center">
          <input
            autoFocus
            value={nome}
            onChange={(event) => setNome(event.target.value)}
            placeholder="Nome"
            aria-label="Nome do link"
            className="h-9 rounded-lg border border-[#E5E7EB] bg-white px-3 text-[13px] text-[#2D2D2D] outline-none focus:border-[#F05D28]"
          />
          <input
            type="url"
            value={link}
            onChange={(event) => setLink(event.target.value)}
            placeholder="https://..."
            aria-label="URL do link"
            className="h-9 rounded-lg border border-[#E5E7EB] bg-white px-3 text-[13px] text-[#2D2D2D] outline-none focus:border-[#F05D28]"
          />
          <div className="flex gap-1.5">
            <button type="submit" disabled={saving} className="h-9 rounded-lg bg-[#F05D28] px-3 text-[12px] font-bold text-white disabled:cursor-not-allowed disabled:opacity-60">
              {saving ? 'Salvando' : 'Salvar'}
            </button>
            <button type="button" onClick={closeForm} className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[#E5E7EB] bg-white text-[#757575] hover:text-[#2D2D2D]" aria-label="Cancelar edição">
              <X size={15} aria-hidden="true" />
            </button>
          </div>
          {error && <p role="alert" className="text-[12px] font-medium text-[#DC2626] sm:col-span-3">{error}</p>}
        </form>
      )}

      <div className="overflow-x-auto">
        <div className="min-w-[540px]">
          <div className="grid grid-cols-[minmax(180px,.8fr)_minmax(280px,1.6fr)] border-b border-[#E5E7EB] bg-[#F9FAFB] px-4 py-2 text-[10px] font-bold uppercase tracking-[0.08em] text-[#757575]">
            <span>Nome</span>
            <span>Link</span>
          </div>
          {filteredLinks.map((item) => {
            const validLink = isHttpUrl(item.link);
            return (
              <div key={item.id || item.link} className="grid grid-cols-[minmax(180px,.8fr)_minmax(280px,1.6fr)] items-center border-b border-[#F3F4F6] px-4 py-2.5 text-[13px] last:border-b-0 hover:bg-[#FFF8F4]/55">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="truncate font-semibold text-[#2D2D2D]" title={item.nome}>{item.nome}</span>
                  {canManage && (
                    <button type="button" onClick={() => openForm(item)} className="shrink-0 rounded p-1 text-[#9CA3AF] hover:bg-white hover:text-[#F05D28] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#F05D28]" aria-label={`Editar ${item.nome}`}>
                      <Pencil size={13} aria-hidden="true" />
                    </button>
                  )}
                </div>
                {validLink ? (
                  <a href={item.link} target="_blank" rel="noopener noreferrer" className="flex min-w-0 items-center gap-1.5 text-[#F05D28] hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F05D28]" title={item.link} aria-label={`Abrir ${item.nome}: ${item.link}`}>
                    <span className="truncate">{item.link}</span>
                    <ExternalLink size={13} className="shrink-0" aria-hidden="true" />
                  </a>
                ) : (
                  <span className="truncate text-[#9CA3AF]" title={item.link}>Link inválido</span>
                )}
              </div>
            );
          })}
          {filteredLinks.length === 0 && (
            <p className="px-4 py-8 text-center text-[13px] text-[#757575]">
              {search.trim() ? 'Nenhum link corresponde à pesquisa.' : 'Nenhum link cadastrado.'}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
