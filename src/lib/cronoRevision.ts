export function nextCronogramaTimestamp(expected: string, current: string | undefined, allowCreate = false): string {
  if (allowCreate ? current !== undefined : current === undefined || current !== expected) {
    throw new Error('Este Project foi alterado ou excluído em outra tela. Seu rascunho foi preservado. Reabra o Project para carregar a versão atual antes de salvar.');
  }
  return new Date(Math.max(Date.now(), (Date.parse(expected) || 0) + 1)).toISOString();
}
