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
}

export default function Notificacoes({ icone, titulo, vazio, itens, naoLidos, onAbrir, onVisualizar }: NotificacoesProps) {
  const [aberto, setAberto] = React.useState(false);

  const alternar = () => {
    const proximo = !aberto;
    setAberto(proximo);
    // Abrir o painel ja conta como visto - o contador zera.
    if (proximo) onVisualizar();
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={alternar}
        title={titulo}
        aria-label={titulo}
        className="relative flex h-10 w-10 items-center justify-center rounded-full border border-[#E5E7EB] bg-white text-[#9CA3AF] transition-colors hover:bg-[#F8FAFC] hover:text-[#F05D28] dark:border-[#27303F] dark:bg-[#111827] dark:text-[#94A3B8] dark:hover:bg-[#1F2937]"
      >
        {icone}
        {naoLidos > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[#DC2626] px-1 text-[10px] font-bold text-white">
            {naoLidos > 9 ? '9+' : naoLidos}
          </span>
        )}
      </button>

      {aberto && (
        <>
          <div className="fixed inset-0 z-[240]" onClick={() => setAberto(false)} />
          <div className="absolute right-0 top-full z-[241] mt-2 flex max-h-[70vh] w-80 flex-col overflow-hidden rounded-xl border border-[#E5E7EB] bg-white shadow-lg dark:border-[#1F2937] dark:bg-[#0F172A]">
            <div className="border-b border-[#F1F5F9] px-4 py-2.5 dark:border-[#1F2937]">
              <p className="text-[12px] font-black text-[#2D2D2D] dark:text-[#F1F5F9]">{titulo}</p>
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
                    className="block w-full border-b border-[#F8FAFC] px-4 py-2.5 text-left last:border-b-0 hover:bg-[#FFF7F3] dark:border-[#1F2937] dark:hover:bg-[#1F2937]"
                  >
                    <p className="truncate text-[13px] font-bold text-[#2D2D2D] dark:text-[#F1F5F9]">{item.titulo}</p>
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
