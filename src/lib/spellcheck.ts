// Corretor ortografico pt-BR local (typo-js + dicionario hunspell em public/dict).
// Todo o peso fica num Web Worker: o dicionario leva ~13s pra montar e nao pode travar a UI.
let worker: Worker | null = null;
let proximoId = 1;
const pendentes = new Map<number, (lista: SugestaoOrtografica[]) => void>();

export interface SugestaoOrtografica {
  palavra: string;
  opcoes: string[];
}

function obterWorker() {
  if (!worker) {
    worker = new Worker(new URL('./spellcheck.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (event: MessageEvent<{ id: number; resultado: SugestaoOrtografica[] }>) => {
      const resolver = pendentes.get(event.data.id);
      if (!resolver) return;
      pendentes.delete(event.data.id);
      resolver(event.data.resultado);
    };
    worker.onerror = (evento) => { // sem dicionario o menu so perde a coluna de sugestoes
      console.error('[spell] worker falhou', evento.message || evento);
      pendentes.forEach((resolver) => resolver([]));
      pendentes.clear();
    };
  }
  return worker;
}

// Pre-aquece o dicionario (chamar ao abrir o editor) pra que o menu ja saia com sugestoes.
export function aquecerCorretor() {
  void sugerirCorrecoes('');
}

// Palavras erradas de um texto, com ate 5 sugestoes cada. Ignora siglas e palavras curtas.
export function sugerirCorrecoes(texto: string, maxPalavras = 4): Promise<SugestaoOrtografica[]> {
  const id = proximoId++;
  return new Promise((resolve) => {
    pendentes.set(id, resolve);
    obterWorker().postMessage({ id, texto, maxPalavras });
  });
}

// Troca todas as ocorrencias da palavra respeitando limite de palavra.
export function trocarPalavra(texto: string, de: string, para: string) {
  const escapado = de.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return texto.replace(new RegExp(`(?<!\\p{L})${escapado}(?!\\p{L})`, 'gu'), para);
}
