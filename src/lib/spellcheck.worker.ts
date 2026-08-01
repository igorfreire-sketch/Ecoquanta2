// Worker do corretor: carregar o dicionario hunspell pt-BR leva ~13s e travaria a UI.
import Typo from 'typo-js';
// publicDir esta desligado no vite.config: o dicionario entra como asset do bundle.
import affUrl from '../dict/pt.aff?url';
import dicUrl from '../dict/pt.dic?url';

let dicionario: any = null;

const pronto = (async () => {
  const [aff, dic] = await Promise.all([
    fetch(affUrl).then((res) => res.text()),
    fetch(dicUrl).then((res) => res.text()),
  ]);
  dicionario = new Typo('pt', aff, dic);
})();

self.onmessage = async (event: MessageEvent<{ id: number; texto: string; maxPalavras: number }>) => {
  const { id, texto, maxPalavras } = event.data;
  await pronto;

  const palavras = Array.from(new Set(String(texto || '').match(/\p{L}[\p{L}'-]{2,}/gu) || []))
    .filter((palavra) => palavra !== palavra.toUpperCase()); // SIGLAS ficam de fora

  const resultado: Array<{ palavra: string; opcoes: string[] }> = [];
  for (const palavra of palavras) {
    if (resultado.length >= maxPalavras) break;
    if (dicionario.check(palavra)) continue;
    // Sinaliza a palavra errada mesmo sem sugestao do dicionario - senao ela some da lista
    // e parece que o corretor nao pegou o erro.
    const opcoes = dicionario.suggest(palavra).slice(0, 5);
    resultado.push({ palavra, opcoes });
  }

  (self as any).postMessage({ id, resultado });
};
