// Notificacao de desktop (Notification API do navegador). Usada quando alguem cita voce numa
// nota ou publica uma nota da sua disciplina. Nao ha service worker aqui de proposito: sem
// push do servidor, isso so dispara com a aba aberta — que e exatamente o caso de uso.
export type PermissaoNotificacao = 'indisponivel' | 'default' | 'granted' | 'denied';

const suportado = () => typeof window !== 'undefined' && 'Notification' in window;

export function estadoNotificacao(): PermissaoNotificacao {
  if (!suportado()) return 'indisponivel';
  return Notification.permission as PermissaoNotificacao;
}

export async function pedirPermissaoNotificacao(): Promise<PermissaoNotificacao> {
  if (!suportado()) return 'indisponivel';
  if (Notification.permission !== 'default') return Notification.permission as PermissaoNotificacao;
  try {
    return (await Notification.requestPermission()) as PermissaoNotificacao;
  } catch {
    return 'denied';
  }
}

export function notificarDesktop(opcoes: {
  titulo: string;
  corpo: string;
  // tag evita empilhar a mesma nota varias vezes se o dado for reprocessado.
  tag: string;
  aoClicar?: () => void;
}) {
  if (!suportado() || Notification.permission !== 'granted') return;
  try {
    const aviso = new Notification(opcoes.titulo, {
      body: opcoes.corpo,
      tag: opcoes.tag,
      icon: 'https://i.imgur.com/Net1yEQ.png',
    });
    aviso.onclick = () => {
      window.focus();
      opcoes.aoClicar?.();
      aviso.close();
    };
  } catch {
    // ponytail: navegador que recusa a construcao (iOS, aba sem gesto) so nao notifica.
  }
}
