// O modo escuro foi removido do sistema. O que resta aqui e o modo daltonico, que troca a
// dupla verde/vermelho (a que some pra quem tem deficiencia de visao de cor) por azul/carmim,
// separados tambem por luminosidade — assim funciona ate pra quem nao enxerga cor nenhuma.
export type Acessibilidade = 'padrao' | 'daltonico';

const STORAGE_KEY = 'ecoquanta_acessibilidade';

export function getStoredAcessibilidade(): Acessibilidade {
  if (typeof window === 'undefined') return 'padrao';
  return window.localStorage.getItem(STORAGE_KEY) === 'daltonico' ? 'daltonico' : 'padrao';
}

export function applyAcessibilidade(modo: Acessibilidade) {
  const root = document.documentElement;
  root.classList.toggle('daltonico', modo === 'daltonico');
  // Limpeza da versao anterior: sem isso quem ja tinha o escuro ligado ficava preso nele.
  root.classList.remove('dark');
  window.localStorage.setItem(STORAGE_KEY, modo);
  window.localStorage.removeItem('ecoquanta_theme');
}
