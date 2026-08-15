import React from 'react';
import { ChevronRight, Plus, Trash2 } from 'lucide-react';
import type { TerceirizadaRecord } from './Administracao';

function getInitials(nome: string) {
  return nome
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((parte) => parte[0]?.toUpperCase() || '')
    .join('');
}

export function getDisciplines(item: TerceirizadaRecord) {
  const values = Array.isArray(item.disciplinas) && item.disciplinas.length > 0
    ? item.disciplinas
    : String(item.disciplina || '').split(',');
  return Array.from(new Set(values.map((value) => String(value).trim()).filter(Boolean)));
}

function cnpjDigits(value: string) {
  return value.replace(/\D/g, '').slice(0, 14);
}

export function isValidCnpj(value: string) {
  const digits = value.replace(/\D/g, '');
  if (!/^\d{14}$/.test(digits) || /^(\d)\1{13}$/.test(digits)) return false;

  const checkDigit = (length: number) => {
    let sum = 0;
    let weight = length - 7;
    for (let index = 0; index < length; index += 1) {
      sum += Number(digits[index]) * weight;
      weight = weight === 2 ? 9 : weight - 1;
    }
    const remainder = sum % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  };

  return Number(digits[12]) === checkDigit(12) && Number(digits[13]) === checkDigit(13);
}

function formatCnpj(value: string) {
  return cnpjDigits(value)
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2}\.\d{3})(\d)/, '$1.$2')
    .replace(/^(\d{2}\.\d{3}\.\d{3})(\d)/, '$1/$2')
    .replace(/(\d{4})(\d{1,2})$/, '$1-$2');
}

export default function TerceirizadasCadastro({
  terceirizadas,
  disciplinas,
  pendingIds,
  onSave,
  onDelete,
}: {
  terceirizadas: TerceirizadaRecord[];
  disciplinas: string[];
  pendingIds: string[];
  onSave: (payload: Omit<TerceirizadaRecord, 'id'> & { id?: string }) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [nome, setNome] = React.useState('');
  const [cnpj, setCnpj] = React.useState('');
  const [telefone, setTelefone] = React.useState('');
  const [cidade, setCidade] = React.useState('');
  const [disciplinasSelecionadas, setDisciplinasSelecionadas] = React.useState<string[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [cnpjError, setCnpjError] = React.useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = nome.trim();
    const cleanCnpj = cnpjDigits(cnpj);
    const cleanTelefone = telefone.trim();
    const cleanCidade = cidade.trim();
    const cleanDisciplinas = Array.from(new Set<string>(disciplinasSelecionadas.map((item) => item.trim()).filter(Boolean)));
    if (!isValidCnpj(cleanCnpj)) {
      setCnpjError('CNPJ inválido. Confira os 14 dígitos informados.');
      return;
    }
    setCnpjError('');
    if (!cleanName || !cleanTelefone || !cleanCidade || cleanDisciplinas.length === 0) return;

    setLoading(true);
    try {
      await onSave({
        nome: cleanName,
        cnpj: cleanCnpj,
        telefone: cleanTelefone,
        cidade: cleanCidade,
        disciplina: cleanDisciplinas.join(', '),
        disciplinas: cleanDisciplinas,
      });
      setNome('');
      setCnpj('');
      setTelefone('');
      setCidade('');
      setDisciplinasSelecionadas([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl shadow-[0_10px_30px_-22px_rgba(15,23,42,0.45)] p-6 space-y-5">
        <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div className="space-y-2">
            <label className="bentham-label">Nome da terceirizada</label>
            <input
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              className="bentham-input focus:border-[#F05D28] focus:ring-[#F05D28]/20"
              placeholder="Ex.: Empresa parceira"
              required
            />
          </div>

          <div className="space-y-2">
            <label className="bentham-label" htmlFor="terceirizada-cnpj">CNPJ</label>
            <input
              id="terceirizada-cnpj"
              value={cnpj}
              onChange={(e) => {
                setCnpj(formatCnpj(e.target.value));
                if (cnpjError) setCnpjError('');
              }}
              className="bentham-input focus:border-[#F05D28] focus:ring-[#F05D28]/20"
              placeholder="00.000.000/0000-00"
              inputMode="numeric"
              autoComplete="off"
              maxLength={18}
              required
              aria-invalid={Boolean(cnpjError)}
              aria-describedby={cnpjError ? 'terceirizada-cnpj-error' : undefined}
            />
            {cnpjError && <p id="terceirizada-cnpj-error" className="text-[11px] font-medium text-[#B91C1C]">{cnpjError}</p>}
          </div>

          <div className="space-y-2">
            <label className="bentham-label" htmlFor="terceirizada-telefone">Telefone</label>
            <input
              id="terceirizada-telefone"
              value={telefone}
              onChange={(e) => setTelefone(e.target.value)}
              className="bentham-input focus:border-[#F05D28] focus:ring-[#F05D28]/20"
              placeholder="(00) 00000-0000"
              inputMode="tel"
              autoComplete="tel"
              required
            />
          </div>

          <div className="space-y-2">
            <label className="bentham-label" htmlFor="terceirizada-cidade">Cidade</label>
            <input
              id="terceirizada-cidade"
              value={cidade}
              onChange={(e) => setCidade(e.target.value)}
              className="bentham-input focus:border-[#F05D28] focus:ring-[#F05D28]/20"
              placeholder="Ex.: Belo Horizonte"
              autoComplete="address-level2"
              required
            />
          </div>

          <fieldset className="min-w-0 rounded-2xl bg-[#FAFBFC] p-4 sm:col-span-2 xl:col-span-3">
            <legend className="bentham-label">Setores / disciplinas atendidos</legend>
            <div className="mt-2 max-h-28 overflow-y-auto rounded-xl border border-[#E5E7EB] bg-white p-2">
              {disciplinas.map((item) => (
                <label key={item} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-[12px] font-medium text-[#374151] hover:bg-[#FFF7F2]">
                  <input
                    type="checkbox"
                    checked={disciplinasSelecionadas.includes(item)}
                    onChange={() => setDisciplinasSelecionadas((prev) => prev.includes(item) ? prev.filter((value) => value !== item) : [...prev, item])}
                    className="h-4 w-4 accent-[#F05D28]"
                  />
                  <span className="truncate">{item}</span>
                </label>
              ))}
            </div>
            <p className="mt-1 text-[11px] font-medium text-[#64748B]">
              {disciplinasSelecionadas.length > 0 ? `${disciplinasSelecionadas.length} selecionado(s)` : 'Selecione ao menos um setor'}
            </p>
          </fieldset>

          <button
            type="submit"
            disabled={loading || !nome.trim() || !cnpjDigits(cnpj) || !telefone.trim() || !cidade.trim() || disciplinasSelecionadas.length === 0}
            className="h-11 self-end px-5 rounded-xl bg-[#F05D28] text-white text-[13px] font-bold hover:bg-[#D94E1F] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F05D28] focus-visible:ring-offset-2 transition-colors inline-flex items-center justify-center gap-2 disabled:opacity-70"
          >
            <Plus size={16} />
            Registrar
          </button>
        </form>

        <div className="space-y-4">
          {terceirizadas.length === 0 && (
            <p className="text-[13px] text-[#757575]">Nenhuma terceirizada cadastrada.</p>
          )}

          {terceirizadas.map((item, index) => (
            <details key={item.id} className={`group rounded-2xl overflow-hidden ${index % 2 === 1 ? 'bg-[#FAFBFC]' : 'bg-white'}`}>
              <summary className="min-h-[64px] px-5 py-3 flex items-center gap-3 cursor-pointer list-none hover:bg-[#F9FAFB] transition-colors [&::-webkit-details-marker]:hidden">
                <div className="w-10 h-10 rounded-full bg-[#F05D28]/10 flex items-center justify-center text-[#F05D28] font-bold text-sm shrink-0">
                  {getInitials(item.nome)}
                </div>

                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-bold text-[#2D2D2D] truncate">{item.nome}</p>
                  <p className="text-[12px] text-[#757575] truncate">{getDisciplines(item).join(' · ')}</p>
                </div>

                <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-[#F9FAFB] text-[#757575] text-[11px] font-bold shrink-0">
                  TERCEIRIZADA
                </span>

                {pendingIds.includes(item.id) && (
                  <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-[#FFF7ED] text-[#C2410C] text-[11px] font-bold shrink-0">
                    Alteracoes pendentes
                  </span>
                )}

                <ChevronRight size={20} className="shrink-0 text-[#757575] transition-transform group-open:rotate-90" />
              </summary>

              <div className="p-5 pt-0">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <div className="flex flex-col gap-1.5">
                    <label className="bentham-label">Disciplina</label>
                    <p className="text-[13px] font-medium text-[#2D2D2D]">{getDisciplines(item).join(' · ')}</p>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="bentham-label">CNPJ</label>
                    <p className="text-[13px] font-medium text-[#2D2D2D]">{item.cnpj ? formatCnpj(item.cnpj) : 'Não informado'}</p>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="bentham-label">Telefone</label>
                    <p className="text-[13px] font-medium text-[#2D2D2D]">{item.telefone || 'Não informado'}</p>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="bentham-label">Cidade</label>
                    <p className="text-[13px] font-medium text-[#2D2D2D]">{item.cidade || 'Não informado'}</p>
                  </div>

                  <div className="flex flex-col gap-2 md:col-span-2 xl:col-span-4">
                    <label className="bentham-label">Ações</label>
                    <button
                      type="button"
                      onClick={() => void onDelete(item.id)}
                      className="h-11 px-4 rounded-xl bg-[#FEF2F2] text-[#B91C1C] border border-[#FECACA] text-[13px] font-bold hover:bg-[#FEE2E2] transition-colors inline-flex items-center justify-center gap-2 w-fit"
                    >
                      <Trash2 size={16} />
                      Excluir
                    </button>
                  </div>
                </div>
              </div>
            </details>
          ))}
        </div>
      </div>
    </div>
  );
}
