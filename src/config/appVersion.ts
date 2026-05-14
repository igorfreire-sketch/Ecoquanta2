/**
 * VERSIONAMENTO VISIVEL DO APP
 *
 * Regra obrigatoria para qualquer IA ou pessoa que atualizar este projeto:
 * 1. Sempre leia a versao atual abaixo.
 * 2. Sempre incremente a partir do numero anterior, sem voltar para tras.
 * 3. Em mudancas pequenas, suba o ultimo bloco: 1.0.7 -> 1.0.8
 * 4. Em mudancas medias, suba o bloco do meio e zere o ultimo: 1.0.8 -> 1.1.0
 * 5. Em mudancas grandes, suba o primeiro bloco e zere os demais: 1.1.0 -> 2.0.0
 *
 * Se este arquivo for alterado em uma entrega, a versao precisa ser atualizada
 * aqui manualmente com base na versao anterior.
 */
export const APP_VERSION = '1.0.3';

export function getAppVersionLabel() {
  return `v${APP_VERSION}`;
}
