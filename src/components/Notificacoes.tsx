import React from 'react';

export interface NotificacaoItem {
  id: string;
  titulo: string;
  descricao: string;
  data?: string;
}

interface NotificacoesProps {
  icone: React.ReactNode;
  titulo: string;
  vazio: string;
  itens: NotificacaoItem[];
  // Itens mais recentes que a ultima visita: viram o contador vermelho.
  naoLidos: number;
  onAbrir: (id: string) => void;
  onVisualizar: () => void;
  // 'header' = botao redondo com borda; 'rail' = simbolo sutil no rodape da barra, painel sobe.
  variante?: 'header' | 'rail';
}

export default function Notificacoes({ icone, titulo, vazio, itens, naoLidos, onAbrir, onVisualizar, variante = 'header' }: NotificacoesProps) {
  const [aberto, setAberto] = React.useState(false);
  const botaoRef = React.useRef<HTMLButtonElement>(null);
  // No rail o pai tem overflow-hidden, entao o painel escapa por posicao fixa medida na hora.
  const [coord, setCoord] = React.useState<{ left: number; bottom: number } | null>(null);

  const alternar = () => {
    const proximo = !aberto;
    if (proximo && variante === 'rail' && botaoRef.current) {
      const r = botaoRef.current.getBoundingClientRect();
      setCoord({ left: r.right + 10, bottom: window.innerHeight - r.bottom });
    }
    setAberto(proximo);
    // Abrir o painel ja conta como visto - o contador zera.
    if (proximo) onVisualizar();
  };

  const rail = variante === 'rail';

  return (
    <div className="relative">
      <button
        ref={botaoRef}
        type="button"
        onClick={alternar}
        title={titulo}
        aria-label={titulo}
        className={rail
          ? 'relative flex h-6 w-6 items-center justify-center rounded-lg text-[#9CA3AF] transition-colors hover:bg-[#FFF3EC] hover:text-[#F05D28]'
          : 'relative flex h-10 w-10 items-center justify-center rounded-full border border-[#E5E7EB] bg-white text-[#9CA3AF] transition-colors hover:bg-[#F8FAFC] hover:text-[#F05D28]'}
      >
        {icone}
        {naoLidos > 0 && (
          <span className={rail
            ? 'absolute -right-0.5 -top-0.5 flex h-3.5 min-w-[14px] items-center justify-center rounded-full bg-[#DC2626] px-1 text-[9px] font-bold text-white'
            : 'absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[#DC2626] px-1 text-[10px] font-bold text-white'}>
            {naoLidos > 9 ? '9+' : naoLidos}
          </span>
        )}
      </button>

      {aberto && (
        <>
          <div className="fixed inset-0 z-[240]" onClick={() => setAberto(false)} />
          <div
            className={rail
              ? 'fixed z-[241] flex max-h-[70vh] w-80 flex-col overflow-hidden rounded-xl border border-[#E5E7EB] bg-white shadow-lg'
              : 'absolute right-0 top-full z-[241] mt-2 flex max-h-[70vh] w-80 flex-col overflow-hidden rounded-xl border border-[#E5E7EB] bg-white shadow-lg'}
            style={rail && coord ? { left: coord.left, bottom: coord.bottom } : undefined}
          >
            <div className="border-b border-[#F1F5F9] px-4 py-2.5">
              <p className="text-[12px] font-black text-[#2D2D2D]">{titulo}</p>
            </div>
            <div className="flex-1 overflow-auto">
              {itens.length === 0 ? (
                <p className="px-4 py-4 text-[12px] text-[#94A3B8]">{vazio}</p>
              ) : (
                itens.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => { setAberto(false); onAbrir(item.id); }}
                    className="block w-full border-b border-[#F8FAFC] px-4 py-2.5 text-left last:border-b-0 hover:bg-[#FFF7F3]"
                  >
                    <p className="truncate text-[13px] font-bold text-[#2D2D2D]">{item.titulo}</p>
                    <p className="truncate text-[11px] text-[#94A3B8]">{item.descricao}</p>
                    {item.data && <p className="mt-0.5 text-[10px] text-[#CBD5E1]">{item.data}</p>}
                  </button>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
