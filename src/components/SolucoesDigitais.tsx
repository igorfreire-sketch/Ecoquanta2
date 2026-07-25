import { useEffect, useState } from 'react';
import {
  isFirebaseConfigured,
  fetchFirebaseCollection,
  setFirebaseDocument,
  deleteFirebaseDocument,
} from '../lib/firebaseDb';

const COLLECTION = 'solucoesDigitaisCronograma';
const DISCIPLINA_ALVO = 'bi - solucoes digitais';

interface CronoRow {
  id: string;
  nome: string;
  predecessoraId: string;
  dataInicio: string;
  duracaoDias: number | null;
  dataFim: string;
  responsavelEmail: string;
  ordem?: number;
}

interface SolucoesDigitaisProps {
  currentUser: { nome: string; email: string; role?: string; isAdmin?: boolean; disciplinas?: string[] };
  usuarios?: Array<{ nome: string; email: string; disciplinas?: string[] }>;
}

function normalizar(valor: string) {
  return valor.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
}

function parseDataLocal(valor: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valor || '');
  if (!match) return null;
  const data = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(data.getTime()) ? null : data;
}

function formatarDataLocal(data: Date): string {
  const y = data.getFullYear();
  const m = String(data.getMonth() + 1).padStart(2, '0');
  const d = String(data.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// ponytail: dias corridos (calendario), sem considerar feriados/dias uteis
function diffDias(inicio: string, fim: string): number | null {
  const dIni = parseDataLocal(inicio);
  const dFim = parseDataLocal(fim);
  if (!dIni || !dFim) return null;
  return Math.round((dFim.getTime() - dIni.getTime()) / 86400000);
}

function addDias(inicio: string, dias: number): string {
  const dIni = parseDataLocal(inicio);
  if (!dIni || !Number.isFinite(dias)) return '';
  const resultado = new Date(dIni);
  resultado.setDate(resultado.getDate() + dias);
  return formatarDataLocal(resultado);
}

export default function SolucoesDigitais({ currentUser, usuarios = [] }: SolucoesDigitaisProps) {
  const [rows, setRows] = useState<CronoRow[]>([]);

  // ponytail: sem gate de loading — a planilha aparece na hora. Se houver linhas salvas no
  // Firebase, elas entram quando chegarem; se a busca falhar/travar, a grade continua usável.
  useEffect(() => {
    let ativo = true;
    (async () => {
      if (!isFirebaseConfigured()) return;
      try {
        const carregadas = await fetchFirebaseCollection<CronoRow>(COLLECTION);
        if (!ativo) return;
        setRows(carregadas.sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0)));
      } catch {
        // sem persistencia agora: segue local, sem travar a UI.
      }
    })();
    return () => { ativo = false; };
  }, []);

  const responsaveis = usuarios.filter((u) =>
    (u.disciplinas || []).some((d) => {
      const n = normalizar(d);
      return n === DISCIPLINA_ALVO || n.includes('solucoes digitais');
    }),
  );

  function persistir(row: CronoRow) {
    if (!isFirebaseConfigured()) return;
    setFirebaseDocument(COLLECTION, row.id, row).catch((err) => console.error('Erro ao salvar linha do cronograma:', err));
  }

  function atualizarLinha(id: string, patch: Partial<CronoRow>, salvarAgora = false) {
    setRows((prev) => {
      const proximo = prev.map((r) => (r.id === id ? { ...r, ...patch } : r));
      if (salvarAgora) {
        const alterada = proximo.find((r) => r.id === id);
        if (alterada) persistir(alterada);
      }
      return proximo;
    });
  }

  function onBlurSalvar(id: string) {
    const row = rows.find((r) => r.id === id);
    if (row) persistir(row);
  }

  function adicionarLinha() {
    const nova: CronoRow = {
      id: crypto.randomUUID(),
      nome: '',
      predecessoraId: '',
      dataInicio: '',
      duracaoDias: null,
      dataFim: '',
      responsavelEmail: '',
      ordem: rows.length,
    };
    setRows((prev) => [...prev, nova]);
    persistir(nova);
  }

  function removerLinha(id: string) {
    setRows((prev) => prev.filter((r) => r.id !== id));
    if (isFirebaseConfigured()) {
      deleteFirebaseDocument(COLLECTION, id).catch((err) => console.error('Erro ao excluir linha do cronograma:', err));
    }
  }

  function onEditarInicio(id: string, valor: string) {
    const row = rows.find((r) => r.id === id);
    if (!row) return;
    if (row.duracaoDias != null) {
      atualizarLinha(id, { dataInicio: valor, dataFim: valor ? addDias(valor, row.duracaoDias) : '' }, true);
    } else if (row.dataFim) {
      atualizarLinha(id, { dataInicio: valor, duracaoDias: diffDias(valor, row.dataFim) }, true);
    } else {
      atualizarLinha(id, { dataInicio: valor }, true);
    }
  }

  function onEditarDuracao(id: string, valorTexto: string) {
    const row = rows.find((r) => r.id === id);
    if (!row) return;
    const duracao = valorTexto === '' ? null : Number(valorTexto);
    const duracaoValida = duracao !== null && Number.isFinite(duracao) ? duracao : null;
    if (row.dataInicio && duracaoValida != null) {
      atualizarLinha(id, { duracaoDias: duracaoValida, dataFim: addDias(row.dataInicio, duracaoValida) }, true);
    } else {
      atualizarLinha(id, { duracaoDias: duracaoValida }, true);
    }
  }

  function onEditarFim(id: string, valor: string) {
    const row = rows.find((r) => r.id === id);
    if (!row) return;
    if (row.dataInicio) {
      atualizarLinha(id, { dataFim: valor, duracaoDias: valor ? diffDias(row.dataInicio, valor) : null }, true);
    } else {
      atualizarLinha(id, { dataFim: valor }, true);
    }
  }

  function onEditarPredecessora(id: string, predecessoraId: string) {
    const row = rows.find((r) => r.id === id);
    if (!row) return;
    // ponytail: validacao de ciclo de 1 nivel apenas (A->B e B->A); ciclos maiores nao sao detectados
    if (predecessoraId) {
      const predecessora = rows.find((r) => r.id === predecessoraId);
      if (predecessoraId === id) return;
      if (predecessora && predecessora.predecessoraId === id) return;
    }
    const predecessora = rows.find((r) => r.id === predecessoraId);
    const sugerirInicio = predecessora?.dataFim && !row.dataInicio ? predecessora.dataFim : row.dataInicio;
    atualizarLinha(id, { predecessoraId, dataInicio: sugerirInicio }, true);
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold text-[#2D2D2D]">Cronograma — Soluções digitais</h2>
        <button
          onClick={adicionarLinha}
          className="px-3 py-2 rounded bg-[#F05D28] text-white text-sm font-medium hover:opacity-90"
        >
          + Atividade
        </button>
      </div>

      <div className="overflow-x-auto border border-[#E5E7EB] rounded">
        <table className="min-w-full text-sm text-[#2D2D2D]">
          <thead className="bg-gray-50 border-b border-[#E5E7EB]">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Atividade</th>
              <th className="px-3 py-2 text-left font-medium">Predecessora</th>
              <th className="px-3 py-2 text-left font-medium">Início</th>
              <th className="px-3 py-2 text-left font-medium">Duração (dias)</th>
              <th className="px-3 py-2 text-left font-medium">Fim</th>
              <th className="px-3 py-2 text-left font-medium">Responsável</th>
              <th className="px-3 py-2 text-left font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-[#E5E7EB] last:border-b-0">
                <td className="px-3 py-1">
                  <input
                    type="text"
                    value={row.nome}
                    onChange={(e) => atualizarLinha(row.id, { nome: e.target.value })}
                    onBlur={() => onBlurSalvar(row.id)}
                    className="w-full border border-[#E5E7EB] rounded px-2 py-1"
                    placeholder="Nome da atividade"
                  />
                </td>
                <td className="px-3 py-1">
                  <select
                    value={row.predecessoraId}
                    onChange={(e) => onEditarPredecessora(row.id, e.target.value)}
                    className="w-full border border-[#E5E7EB] rounded px-2 py-1"
                  >
                    <option value="">Nenhuma</option>
                    {rows.filter((r) => r.id !== row.id).map((r) => (
                      <option key={r.id} value={r.id}>{r.nome || '(sem nome)'}</option>
                    ))}
                  </select>
                </td>
                <td className="px-3 py-1">
                  <input
                    type="date"
                    value={row.dataInicio}
                    onChange={(e) => onEditarInicio(row.id, e.target.value)}
                    className="w-full border border-[#E5E7EB] rounded px-2 py-1"
                  />
                </td>
                <td className="px-3 py-1">
                  <input
                    type="number"
                    value={row.duracaoDias ?? ''}
                    onChange={(e) => onEditarDuracao(row.id, e.target.value)}
                    className="w-24 border border-[#E5E7EB] rounded px-2 py-1"
                  />
                </td>
                <td className="px-3 py-1">
                  <input
                    type="date"
                    value={row.dataFim}
                    onChange={(e) => onEditarFim(row.id, e.target.value)}
                    className="w-full border border-[#E5E7EB] rounded px-2 py-1"
                  />
                </td>
                <td className="px-3 py-1">
                  <select
                    value={row.responsavelEmail}
                    onChange={(e) => atualizarLinha(row.id, { responsavelEmail: e.target.value }, true)}
                    className="w-full border border-[#E5E7EB] rounded px-2 py-1"
                  >
                    <option value="">Sem responsável</option>
                    {responsaveis.map((u) => (
                      <option key={u.email} value={u.email}>{u.nome}</option>
                    ))}
                  </select>
                </td>
                <td className="px-3 py-1 text-center">
                  <button
                    onClick={() => removerLinha(row.id)}
                    className="text-gray-400 hover:text-[#F05D28]"
                    title="Excluir"
                  >
                    🗑
                  </button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-4 text-center text-gray-400">Nenhuma atividade. Clique em "+ Atividade" para começar.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
