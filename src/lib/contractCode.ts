export function sameContractCode(first?: string, second?: string) {
  const normalize = (value?: string) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
  return normalize(first) === normalize(second);
}
