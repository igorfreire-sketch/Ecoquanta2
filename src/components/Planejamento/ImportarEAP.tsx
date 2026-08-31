// Importação semi-automática da EAP.
//
// ponytail: esta tela NÃO escreve no Firebase nem chama o Apps Script — de propósito.
// O planejamento cola um trecho copiado do MS Project/Excel, a tela valida e corrige
// o que dá pra corrigir de forma determinística, e devolve um bloco limpo para o
// humano colar de volta na planilha. Fica "semi" automático porque a base de produção
// (13 mil linhas coladas à mão) é arriscada demais para gravação automática hoje.

import React, { useMemo, useState } from 'react';
import {
  AlertCircle, AlertTriangle, CheckCircle, Clipboard, Download, Upload, Wand2,
} from 'lucide-react';
import {
  agruparPorOS, corrigirAutomatico, paraTSV, parseColado, parseXlsx, validar,
  type Diagnostico, type LinhaEAP,
} from '../../lib/eapImport';

function Cabecalho({ rotulo, titulo }: { rotulo: string; titulo: string }) {
  return (
    <div>
      <p className="text-[10px] font-extrabold uppercase tracking-[1.2px] text-[#94A3B8]">{rotulo}</p>
      <h2 className="text-[18px] font-black text-[#2D2D2D]">{titulo}</h2>
    </div>
  );
}

function IconeDiagnostico({ nivel }: { nivel: Diagnostico['nivel'] }) {
  if (nivel === 'erro') return <AlertCircle size={16} className="text-[#EF4444] shrink-0 mt-0.5" />;
  return <AlertTriangle size={16} className="text-[#F05D28] shrink-0 mt-0.5" />;
}

export default function ImportarEAP() {
  const [texto, setTexto] = useState('');
  const [linhas, setLinhas] = useState<LinhaEAP[] | null>(null);
  const [corrigidas, setCorrigidas] = useState(0);
  const [separarPorOS, setSepararPorOS] = useState(false);
  const [copiado, setCopiado] = useState(false);

  const resumo = useMemo(() => (linhas ? validar(linhas) : null), [linhas]);

  const diagnosticosPorOS = useMemo(() => {
    if (!linhas || !resumo) return [];
    const grupos = agruparPorOS(linhas);
    const porLinha = new Map<number, Diagnostico[]>();
    resumo.diagnosticos.forEach((d) => {
      const arr = porLinha.get(d.linha) ?? [];
      arr.push(d);
      porLinha.set(d.linha, arr);
    });
    // indice original por identidade do objeto: um grupo de agruparPorOS não é uma
    // fatia contígua de `linhas` (a mesma OS pode reaparecer em índices espalhados),
    // então nunca dá pra recalcular o índice por offset acumulado do grupo.
    const indicePorLinha = new Map<LinhaEAP, number>();
    linhas.forEach((l, i) => indicePorLinha.set(l, i));

    const saida: { os: string; itens: { linha: LinhaEAP; diagnosticos: Diagnostico[] }[] }[] = [];
    grupos.forEach((itensGrupo, os) => {
      const itens = itensGrupo
        .map((linha) => ({ linha, diagnosticos: porLinha.get(indicePorLinha.get(linha)!) ?? [] }))
        .filter((item) => item.diagnosticos.length > 0);
      if (itens.length > 0) saida.push({ os: os || '(sem código)', itens });
    });
    return saida;
  }, [linhas, resumo]);

  function conferir() {
    setLinhas(parseColado(texto));
    setCorrigidas(0);
    setCopiado(false);
  }

  async function lerXlsx(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      setLinhas(await parseXlsx(await file.arrayBuffer()));
      setCorrigidas(0);
      setCopiado(false);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Não foi possível ler o XLSX.');
    } finally {
      event.target.value = '';
    }
  }

  function aplicarCorrecao() {
    if (!linhas) return;
    const r = corrigirAutomatico(linhas);
    setLinhas(r.linhas);
    setCorrigidas(r.aplicadas);
  }

  async function copiarBloco() {
    if (!linhas) return;
    await navigator.clipboard.writeText(paraTSV(linhas));
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  }

  function baixarCSV() {
    if (!linhas) return;
    const blob = new Blob([paraTSV(linhas)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'eap-corrigida.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  const grupos = linhas ? agruparPorOS(linhas) : new Map<string, LinhaEAP[]>();

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      <Cabecalho rotulo="Planejamento" titulo="Importar EAP" />

      {/* Passo 1: colar */}
      <div className="space-y-3">
        <p className="text-[13px] text-[#757575]">
          Copie o trecho no MS Project ou no Excel e cole aqui — Ctrl+V. Pode ser a EAP inteira
          ou só uma OS.
        </p>
        <textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Cole aqui o bloco copiado..."
          rows={10}
          className="w-full rounded-xl border border-[#E5E7EB] bg-white/70 backdrop-blur-[2px] p-3 text-[13px] font-mono text-[#2D2D2D] focus:outline-none focus:border-[#F05D28]"
        />
        <button
          onClick={conferir}
          disabled={!texto.trim()}
          className="rounded-xl bg-[#F05D28] px-4 py-2 text-[13px] font-bold text-white disabled:opacity-40"
        >
          Conferir
        </button>
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-[#FFF3EC] px-4 py-2 text-[13px] font-bold text-[#F05D28]">
          <Upload size={15} /> Ler arquivo XLSX
          <input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={lerXlsx} className="sr-only" />
        </label>
      </div>

      {/* Passo 2: conferir */}
      {resumo && (
        <div className="space-y-4">
          <Cabecalho rotulo="Passo 2" titulo="Conferir" />
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-[13px]">
            <span className="text-[#2D2D2D] font-bold">{resumo.totalLinhas} linhas</span>
            <span className="text-[#EF4444] font-bold flex items-center gap-1">
              <AlertCircle size={14} /> {resumo.erros} erro{resumo.erros === 1 ? '' : 's'}
            </span>
            <span className="text-[#F05D28] font-bold flex items-center gap-1">
              <AlertTriangle size={14} /> {resumo.avisos} aviso{resumo.avisos === 1 ? '' : 's'}
            </span>
            <span className="text-[#757575]">{resumo.osDetectadas} OS detectadas</span>
          </div>

          <button
            onClick={aplicarCorrecao}
            className="rounded-xl bg-[#FFF3EC] px-4 py-2 text-[13px] font-bold text-[#F05D28] flex items-center gap-2 w-fit"
          >
            <Wand2 size={15} /> Corrigir automaticamente
          </button>
          {corrigidas > 0 && (
            <p className="text-[13px] text-[#10B981] font-bold flex items-center gap-1">
              <CheckCircle size={14} /> {corrigidas} linha{corrigidas === 1 ? '' : 's'} corrigida{corrigidas === 1 ? '' : 's'} (deslize I/J).
            </p>
          )}

          {diagnosticosPorOS.length === 0 ? (
            <p className="text-[13px] text-[#10B981] font-bold flex items-center gap-1">
              <CheckCircle size={14} /> Nenhum problema encontrado.
            </p>
          ) : (
            <div className="space-y-4">
              {diagnosticosPorOS.map((grupo) => (
                <div key={grupo.os} className="space-y-2">
                  <p className="text-[11px] font-extrabold uppercase tracking-[0.8px] text-[#94A3B8]">
                    OS {grupo.os}
                  </p>
                  <div className="space-y-2">
                    {grupo.itens.map(({ linha, diagnosticos }, i) => (
                      <div key={i} className="text-[13px] space-y-1">
                        <p className="text-[#2D2D2D] font-bold">
                          {linha.celulas[3] || '(sem código)'} — {linha.celulas[4] || '(sem nome)'}
                        </p>
                        {diagnosticos.map((d, j) => (
                          <div key={j} className="flex items-start gap-2 pl-3 text-[#757575]">
                            <IconeDiagnostico nivel={d.nivel} />
                            <span>
                              <span className="font-bold">{d.nivel === 'erro' ? 'Erro' : 'Aviso'}:</span> {d.mensagem}
                            </span>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Passo 3: devolver */}
      {linhas && linhas.length > 0 && (
        <div className="space-y-4">
          <Cabecalho rotulo="Passo 3" titulo="Devolver" />
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={copiarBloco}
              className="rounded-xl bg-[#F05D28] px-4 py-2 text-[13px] font-bold text-white flex items-center gap-2"
            >
              <Clipboard size={15} /> {copiado ? 'Copiado!' : 'Copiar bloco corrigido'}
            </button>
            <button
              onClick={baixarCSV}
              className="rounded-xl bg-[#FFF3EC] px-4 py-2 text-[13px] font-bold text-[#F05D28] flex items-center gap-2"
            >
              <Download size={15} /> Baixar CSV
            </button>
            <label className="flex items-center gap-2 text-[13px] text-[#757575] ml-auto">
              <input
                type="checkbox"
                checked={separarPorOS}
                onChange={(e) => setSepararPorOS(e.target.checked)}
              />
              Separar por OS
            </label>
          </div>

          {separarPorOS && (
            <div className="space-y-4">
              {Array.from(grupos.entries()).map(([os, itens]) => (
                <div key={os} className="space-y-1">
                  <p className="text-[11px] font-extrabold uppercase tracking-[0.8px] text-[#94A3B8]">
                    OS {os || '(sem código)'} · {itens.length} linha{itens.length === 1 ? '' : 's'}
                  </p>
                  <textarea
                    readOnly
                    value={paraTSV(itens)}
                    rows={4}
                    className="w-full rounded-xl border border-[#E5E7EB] bg-white/70 backdrop-blur-[2px] p-2 text-[12px] font-mono text-[#2D2D2D]"
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
