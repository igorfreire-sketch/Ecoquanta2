// P.Cronograma — grade de edicao manual do cronograma REAL do sistema, por Contrato/OS.
//
// Le e grava EXATAMENTE a mesma fonte que Cronograma.tsx, Atividades.tsx e a Curva S usam
// (`appData/eap` -> cronograma; `appData/cronograma` so quando a EAP nao traz o array), via
// mutateAppDataPreservandoFormato. Nao existe colecao propria desta tela: qualquer coisa
// salva aqui aparece nas outras telas assim que o snapshot global e atualizado.
//
// NAO confundir com a aba "Project" (SolucoesDigitais.tsx / colecao `cronogramas`): la a
// linha e um CronoRow com id/seq proprios; aqui a identidade da linha e o `code` hierarquico
// da planilha, referenciado por predecessoras, edificioPorItem e planningTodos — por isso
// nada nesta tela renumera code de linha existente.

import React, { useMemo, useState } from 'react';
import { AlertTriangle, Check, GripVertical, Loader2, Plus, RefreshCw } from 'lucide-react';
import SearchableSelect from '../SearchableSelect';
import { getCronogramaSourceRows, buildContractOptions, buildOsOptions, type CronogramaRow } from '../Cronograma';
import { addDias, diffDias } from '../../lib/cronoRow';
import { isFirebaseConfigured, mutateAppDataPreservandoFormato } from '../../lib/firebaseDb';
import {
  aplicarEdicoes,
  caminhoCronogramaEap,
  caminhoEdificioPorItem,
  codigo as codigoDaLinha,
  edicoesVazias,
  edificacaoEfetiva,
  escreverEm,
  lerEm,
  linhasDaOs,
  nivelDoCodigo,
  novaLinha,
  temEdicoes,
  type CronogramaRealRow,
  type EdicoesCronograma,
  type LinhaBruta,
} from '../../lib/cronogramaReal';

interface PCronogramaProps {
  preloadedData?: any;
  lockedContractCode?: string;
  loading?: boolean;
  loadError?: string;
  onRetry?: () => void;
  // Devolve o documento ja gravado pro App atualizar o snapshot global — e o que faz a
  // edicao aparecer "na hora" em Cronograma/Atividades/Curva S sem recarregar a pagina.
  onSalvo?: (payload: { eap?: any; cronograma?: any[] }) => void;
}

const CAMPO_CLASSE = 'w-full rounded-md border border-[#E5E7EB] bg-white px-2 py-1 text-[12px] text-[#2D2D2D] focus:border-[#F05D28] focus:outline-none';

// Mesmas duas formas aceitas por parseDate em Cronograma.tsx (ISO e BR), normalizadas
// pro formato que <input type="date"> exige.
function paraIso(valor?: string): string {
  const bruto = String(valor || '').trim();
  const iso = bruto.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const br = bruto.match(/^(\d{2})[/\-.](\d{2})[/\-.](\d{4})/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  return '';
}

function lerEdificioPorItem(preloadedData: any): Record<string, string> {
  const fonte = [
    preloadedData?.eap?.edificioPorItem,
    preloadedData?.eap?.data?.edificioPorItem,
    preloadedData?.edificioPorItem,
  ].find((item) => item && typeof item === 'object') || {};
  return Object.fromEntries(
    Object.entries(fonte as Record<string, unknown>).map(([code, nome]) => [String(code).trim(), String(nome ?? '').trim()]),
  );
}

function predecessoraPorIdDaPagina(valor: unknown, linhas: CronogramaRow[]): string {
  const porCodigo = new Map(linhas.map((linha) => [String(linha.code || '').trim(), String(linha.code || '').trim()]));
  const porLinhaFonte = new Map(
    linhas
      .filter((linha) => linha.sourceLine != null)
      .map((linha) => [String(linha.sourceLine).trim(), String(linha.code || '').trim()]),
  );
  return String(valor || '')
    .split(/[,;|/\n\r]+/)
    .map((token) => token.trim().replace(/^#/, ''))
    .filter(Boolean)
    .map((token) => porCodigo.get(token) || porLinhaFonte.get(token) || token)
    .join(' | ');
}

export default function PCronograma({
  preloadedData,
  lockedContractCode,
  loading = false,
  loadError,
  onRetry,
  onSalvo,
}: PCronogramaProps) {
  const rows = useMemo(() => getCronogramaSourceRows(preloadedData), [preloadedData]);
  const contratos = useMemo(() => buildContractOptions(rows, preloadedData), [rows, preloadedData]);
  const opcoesOs = useMemo(() => buildOsOptions(rows, preloadedData), [rows, preloadedData]);
  const edificioPorItemBase = useMemo(() => lerEdificioPorItem(preloadedData), [preloadedData]);

  const [contrato, setContrato] = useState(() => String(lockedContractCode || '').trim());
  const [os, setOs] = useState('');
  const [edicoes, setEdicoes] = useState<EdicoesCronograma>(edicoesVazias);
  const [edificacoes, setEdificacoes] = useState<Record<string, string>>({});
  const [arrastada, setArrastada] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');

  const contratoTravado = Boolean(String(lockedContractCode || '').trim());
  const sujo = temEdicoes(edicoes) || Object.keys(edificacoes).length > 0;

  const osFiltradas = useMemo(
    () => opcoesOs.filter((item) => !contrato || item.contractCode === contrato),
    [opcoesOs, contrato],
  );

  // Linhas exibidas: as reais da OS + as criadas nesta sessao, na ordem do array (a mesma
  // ordem que sera gravada). Os patches pendentes entram por cima, so pra exibicao.
  const linhas = useMemo(() => {
    if (!os) return [] as CronogramaRow[];
    const reais = linhasDaOs(rows, os);
    const novasDaOs = edicoes.novas
      .filter((linha) => codigoDaLinha(linha).startsWith(`${os}.`))
      .map((linha) => ({
        code: codigoDaLinha(linha),
        name: '',
        progress: 0,
        duration: 0,
        plannedStart: '',
        plannedEnd: '',
        predecessor: '',
      } as CronogramaRow));
    const todas = [...reais, ...novasDaOs].map((linha) => ({
      ...linha,
      predecessor: predecessoraPorIdDaPagina(linha.predecessor, [...reais, ...novasDaOs]),
    }));
    if (edicoes.ordem.length > 1) {
      const alvo = new Set(edicoes.ordem);
      const porCodigo = new Map(todas.map((linha) => [String(linha.code), linha]));
      const sequencia = edicoes.ordem.map((code) => porCodigo.get(code)).filter(Boolean) as CronogramaRow[];
      let cursor = 0;
      return todas.map((linha) => (alvo.has(String(linha.code)) && sequencia[cursor] ? sequencia[cursor++] : linha));
    }
    return todas;
  }, [rows, os, edicoes]);

  // Edificacoes ja usadas nesta OS — padrão.md: nunca sugerir edificacao de outra OS.
  const edificacoesDaOs = useMemo(() => {
    const nomes = new Set<string>();
    linhas.forEach((linha) => {
      const nome = edificacaoDe(String(linha.code));
      if (nome) nomes.add(nome);
    });
    return Array.from(nomes).sort((a, b) => a.localeCompare(b, 'pt-BR'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linhas, edificacoes, edificioPorItemBase]);

  function edificacaoDe(code: string): string {
    if (edificacoes[code] !== undefined) return edificacoes[code];
    return edificacaoEfetiva(code, { ...edificioPorItemBase, ...edificacoes });
  }

  function valor<K extends keyof CronogramaRow>(linha: CronogramaRow, campo: K): CronogramaRow[K] {
    const patch = edicoes.patches[String(linha.code)] as Partial<CronogramaRow> | undefined;
    return (patch && campo in patch ? patch[campo] : linha[campo]) as CronogramaRow[K];
  }

  function editar(code: string, patch: Partial<CronogramaRealRow>) {
    setErro('');
    setAviso('');
    setEdicoes((prev) => ({
      ...prev,
      patches: { ...prev.patches, [code]: { ...(prev.patches[code] || {}), ...patch } },
    }));
  }

  // Data e duracao se completam entre si (mesma convencao da grade Project).
  function editarInicio(linha: CronogramaRow, iso: string) {
    const duracao = Number(valor(linha, 'duration') || 0);
    const fim = duracao > 0 && iso ? addDias(iso, duracao) : paraIso(valor(linha, 'plannedEnd'));
    editar(String(linha.code), { plannedStart: iso, plannedEnd: fim });
  }

  function editarFim(linha: CronogramaRow, iso: string) {
    const inicio = paraIso(valor(linha, 'plannedStart'));
    const dias = diffDias(inicio, iso);
    editar(String(linha.code), { plannedEnd: iso, ...(dias === null ? {} : { duration: dias }) });
  }

  function editarDuracao(linha: CronogramaRow, dias: number) {
    const inicio = paraIso(valor(linha, 'plannedStart'));
    editar(String(linha.code), { duration: dias, ...(inicio ? { plannedEnd: addDias(inicio, dias) } : {}) });
  }

  function adicionarLinha() {
    if (!os) return;
    setErro('');
    setAviso('');
    setEdicoes((prev) => {
      const existentes: LinhaBruta[] = [...(rows as unknown as LinhaBruta[]), ...prev.novas];
      return { ...prev, novas: [...prev.novas, novaLinha(existentes, os)] };
    });
  }

  // Arrastar so reordena o array entre as linhas da OS: os codes ficam onde estao, porque
  // renumerar quebraria predecessoras, edificioPorItem e planningTodos (padrão.md).
  function soltar(alvoCode: string) {
    if (!arrastada || arrastada === alvoCode) return;
    const atual = linhas.map((linha) => String(linha.code));
    const sem = atual.filter((code) => code !== arrastada);
    const indice = sem.indexOf(alvoCode);
    if (indice < 0) return;
    const nova = [...sem.slice(0, indice), arrastada, ...sem.slice(indice)];
    setEdicoes((prev) => ({ ...prev, ordem: nova }));
    setArrastada(null);
  }

  function descartar() {
    setEdicoes(edicoesVazias());
    setEdificacoes({});
    setErro('');
    setAviso('');
  }

  async function salvar() {
    if (!isFirebaseConfigured()) {
      setErro('Firebase nao configurado nesta sessao; nada foi gravado.');
      return;
    }
    const semNome = edicoes.novas.find((linha) => {
      const code = codigoDaLinha(linha);
      return !String(edicoes.patches[code]?.name || '').trim();
    });
    if (semNome) {
      setErro('Toda atividade nova precisa de nome — sem nome a linha e ignorada pelo Cronograma.');
      return;
    }

    setSalvando(true);
    setErro('');
    setAviso('');
    try {
      const caminhoPreload = caminhoCronogramaEap(preloadedData?.eap);
      if (caminhoPreload) {
        const eapNovo = await mutateAppDataPreservandoFormato<any>('eap', (atual) => {
          if (!atual || typeof atual !== 'object') throw new Error('appData/eap veio vazio; gravacao cancelada.');
          const caminho = caminhoCronogramaEap(atual) || caminhoPreload;
          const linhasAtuais = (lerEm<LinhaBruta[]>(atual, caminho) || []) as LinhaBruta[];
          const caminhoEdif = caminhoEdificioPorItem(atual, caminho);
          const edifAtual = (lerEm<Record<string, string>>(atual, caminhoEdif) || {}) as Record<string, string>;
          const comLinhas = escreverEm(atual, caminho, aplicarEdicoes(linhasAtuais, edicoes));
          return escreverEm(comLinhas, caminhoEdif, { ...edifAtual, ...edificacoes });
        });
        onSalvo?.({ eap: eapNovo });
      } else {
        if (Object.keys(edificacoes).length > 0) {
          throw new Error('A EAP nao esta carregada; edificacao so pode ser gravada com a EAP disponivel.');
        }
        const doc = await mutateAppDataPreservandoFormato<any>('cronograma', (atual) => {
          const linhasAtuais: LinhaBruta[] = Array.isArray(atual)
            ? atual
            : Array.isArray(atual?.cronograma) ? atual.cronograma : [];
          if (!linhasAtuais.length) throw new Error('appData/cronograma veio vazio; gravacao cancelada.');
          const proximas = aplicarEdicoes(linhasAtuais, edicoes);
          return Array.isArray(atual) ? proximas : { ...atual, cronograma: proximas };
        });
        onSalvo?.({ cronograma: Array.isArray(doc) ? doc : doc?.cronograma });
      }
      setEdicoes(edicoesVazias());
      setEdificacoes({});
      setAviso('Cronograma atualizado.');
    } catch (error) {
      setErro(error instanceof Error ? error.message : 'Falha ao salvar o cronograma.');
    } finally {
      setSalvando(false);
    }
  }

  const osSelecionada = opcoesOs.find((item) => item.code === os);

  return (
    <div className="w-full flex flex-col gap-4 font-['Montserrat']">
      <div className="rounded-2xl border border-[#E5E7EB] bg-white p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[220px] flex-1">
            <label className="bentham-label">Contrato</label>
            <SearchableSelect
              value={contrato}
              disabled={contratoTravado}
              onChange={(event) => { setContrato(event.target.value); setOs(''); }}
              className="bentham-select h-10 text-[13px]"
            >
              <option value="">Selecione</option>
              {contratos.map((item) => (
                <option key={item.code} value={item.code}>{item.name || item.code}</option>
              ))}
            </SearchableSelect>
          </div>
          <div className="min-w-[260px] flex-1">
            <label className="bentham-label">OS</label>
            <SearchableSelect
              value={os}
              disabled={!contrato}
              onChange={(event) => { setOs(event.target.value); setEdicoes(edicoesVazias()); setEdificacoes({}); }}
              className="bentham-select h-10 text-[13px]"
            >
              <option value="">{contrato ? 'Selecione a OS' : 'Escolha o contrato primeiro'}</option>
              {osFiltradas.map((item) => (
                <option key={item.code} value={item.code}>{`${item.name || item.code} (${item.code})`}</option>
              ))}
            </SearchableSelect>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={adicionarLinha}
              disabled={!os || salvando}
              className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-[#F05D28] px-3 text-[12px] font-bold text-white disabled:opacity-40"
            >
              <Plus size={14} /> Atividade
            </button>
            <button
              type="button"
              onClick={() => void salvar()}
              disabled={!sujo || salvando}
              className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-[#0F766E] bg-[#0F766E] px-3 text-[12px] font-bold text-white disabled:opacity-40"
            >
              {salvando ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Salvar
            </button>
            {sujo && !salvando && (
              <button type="button" onClick={descartar} className="h-10 px-2 text-[12px] font-bold text-[#64748B] hover:underline">
                Descartar
              </button>
            )}
          </div>
        </div>

        <p className="mt-2 text-[11px] font-medium text-[#64748B]">
          Grava direto no cronograma real do sistema (o mesmo lido por Cronograma, Atividades e Curva S).
          Arrastar reordena as linhas da OS sem renumerar codigos.
        </p>

        {(erro || aviso || loadError) && (
          <div className={`mt-2 inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-bold ${erro || loadError ? 'border-[#FECACA] bg-[#FEF2F2] text-[#B91C1C]' : 'border-[#A7F3D0] bg-[#ECFDF5] text-[#047857]'}`}>
            {(erro || loadError) && <AlertTriangle size={12} />}
            {erro || loadError || aviso}
            {loadError && onRetry && (
              <button type="button" onClick={onRetry} className="ml-1 inline-flex items-center gap-1 underline">
                <RefreshCw size={12} /> Tentar novamente
              </button>
            )}
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-[#E5E7EB] bg-white p-4">
        {loading ? (
          <p className="text-[13px] font-bold text-[#64748B]">Carregando o cronograma...</p>
        ) : !os ? (
          <p className="text-[13px] font-bold text-[#64748B]">Selecione contrato e OS para editar as atividades.</p>
        ) : linhas.length === 0 ? (
          <p className="text-[13px] font-bold text-[#64748B]">
            {`Nenhuma atividade em ${osSelecionada?.name || os}. Use "+ Atividade" para cadastrar a primeira.`}
          </p>
        ) : (
          <div className="overflow-auto">
            <table className="min-w-full text-[12px] text-[#2D2D2D]">
              <thead>
                <tr className="border-b border-[#E5E7EB] text-left text-[10px] font-extrabold uppercase tracking-[0.6px] text-[#94A3B8]">
                  <th className="w-[130px] px-2 py-2">Código</th>
                  <th className="min-w-[240px] px-2 py-2">Atividade</th>
                  <th className="w-[120px] px-2 py-2">Predecessora</th>
                  <th className="w-[90px] px-2 py-2">Duração</th>
                  <th className="w-[140px] px-2 py-2">Início</th>
                  <th className="w-[140px] px-2 py-2">Fim</th>
                  <th className="w-[100px] px-2 py-2">% Concluído</th>
                  <th className="w-[160px] px-2 py-2">Edificação</th>
                </tr>
              </thead>
              <tbody>
                {linhas.map((linha) => {
                  const code = String(linha.code);
                  const recuo = Math.max(0, nivelDoCodigo(code) - nivelDoCodigo(os)) - 1;
                  return (
                    <tr
                      key={code}
                      onDragOver={(event) => { if (arrastada) event.preventDefault(); }}
                      onDrop={() => soltar(code)}
                      onDragEnd={() => setArrastada(null)}
                      className={`border-b border-[#F1F5F9] last:border-b-0 ${arrastada === code ? 'opacity-50' : ''}`}
                    >
                      <td
                        draggable
                        onDragStart={(event) => { setArrastada(code); event.dataTransfer.effectAllowed = 'move'; }}
                        title="Arraste para reordenar as linhas desta OS (o código não muda)"
                        className="cursor-grab px-2 py-1 font-bold text-[#64748B]"
                      >
                        <span className="inline-flex items-center gap-1" style={{ paddingLeft: `${Math.max(0, recuo) * 12}px` }}>
                          <GripVertical size={12} className="text-[#CBD5E1]" />
                          {code}
                        </span>
                      </td>
                      <td className="px-2 py-1">
                        <input
                          className={CAMPO_CLASSE}
                          value={String(valor(linha, 'name') || '')}
                          onChange={(event) => editar(code, { name: event.target.value })}
                          placeholder="Nome da atividade"
                        />
                      </td>
                      <td className="px-2 py-1">
                        <input
                          className={CAMPO_CLASSE}
                          value={String(valor(linha, 'predecessor') || '')}
                          onChange={(event) => editar(code, { predecessor: event.target.value })}
                          placeholder="ex.: 2.4.1"
                        />
                      </td>
                      <td className="px-2 py-1">
                        <input
                          type="number"
                          min={0}
                          className={CAMPO_CLASSE}
                          value={Number(valor(linha, 'duration') || 0)}
                          onChange={(event) => editarDuracao(linha, Number(event.target.value || 0))}
                        />
                      </td>
                      <td className="px-2 py-1">
                        <input
                          type="date"
                          className={CAMPO_CLASSE}
                          value={paraIso(valor(linha, 'plannedStart'))}
                          onChange={(event) => editarInicio(linha, event.target.value)}
                        />
                      </td>
                      <td className="px-2 py-1">
                        <input
                          type="date"
                          className={CAMPO_CLASSE}
                          value={paraIso(valor(linha, 'plannedEnd'))}
                          onChange={(event) => editarFim(linha, event.target.value)}
                        />
                      </td>
                      <td className="px-2 py-1">
                        <input
                          type="number"
                          min={0}
                          max={100}
                          className={CAMPO_CLASSE}
                          value={Number(valor(linha, 'progress') || 0)}
                          onChange={(event) => editar(code, { progress: Math.min(100, Math.max(0, Number(event.target.value || 0))) })}
                        />
                      </td>
                      <td className="px-2 py-1">
                        <input
                          className={CAMPO_CLASSE}
                          list="pcronograma-edificacoes"
                          value={edificacaoDe(code)}
                          onChange={(event) => { setEdificacoes((prev) => ({ ...prev, [code]: event.target.value })); setAviso(''); setErro(''); }}
                          placeholder="Edificação"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <datalist id="pcronograma-edificacoes">
              {edificacoesDaOs.map((nome) => <option key={nome} value={nome} />)}
            </datalist>
          </div>
        )}
      </div>
    </div>
  );
}
