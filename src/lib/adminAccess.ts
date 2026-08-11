import { getPrimaryDisciplineValue, splitDisciplineValues } from './disciplineCatalog';

export function getRoleTabs<T extends string>(permissions: Record<string, T[]>, cargo: string): T[] {
  return Array.from(new Set((permissions[cargo] || []).map((tab) => String(tab).trim()).filter(Boolean))) as T[];
}

export function getDisciplinePatch(patch: { disciplina?: string; disciplinas?: string[] }) {
  const source = Object.prototype.hasOwnProperty.call(patch, 'disciplinas') ? patch.disciplinas : patch.disciplina;
  const disciplinas = splitDisciplineValues(source);
  return { disciplina: getPrimaryDisciplineValue(disciplinas[0]), disciplinas };
}
