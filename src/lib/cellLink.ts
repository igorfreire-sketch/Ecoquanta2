export const REGEX_LINK_MARKDOWN = /\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)/;
export const REGEX_URL_SOLTA = /(https?:\/\/[^\s)]+)/;
export function extrairLinkDaCelula(texto: string): string | null {
  const viaMarkdown = REGEX_LINK_MARKDOWN.exec(texto || '');
  if (viaMarkdown) return viaMarkdown[2];
  const viaUrl = REGEX_URL_SOLTA.exec(texto || '');
  return viaUrl ? viaUrl[1] : null;
}
