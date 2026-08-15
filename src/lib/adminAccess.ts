import { getPrimaryDisciplineValue, splitDisciplineValues } from './disciplineCatalog';

type AccessUser = { id?: string; email?: string; allowedTabs: string[] };

const normalizeIdentity = (value: unknown) => String(value || '').trim().toLowerCase();
const userKey = (user: Pick<AccessUser, 'id' | 'email'>) => normalizeIdentity(user.email || user.id);
const sameValue = (left: unknown, right: unknown) => Object.is(left, right) || JSON.stringify(left) === JSON.stringify(right);

export function getRoleTabs<T extends string>(permissions: Record<string, T[]>, cargo: string): T[] {
  return Array.from(new Set((permissions[cargo] || []).map((tab) => String(tab).trim()).filter(Boolean))) as T[];
}

export function applyUserAccessPatch<T extends AccessUser>(user: T, patch: Partial<T>): T {
  const next = { ...user, ...patch };
  if (!Object.prototype.hasOwnProperty.call(patch, 'allowedTabs')) next.allowedTabs = user.allowedTabs;
  return next;
}

export function hasPersistedTabAccess(tabs: readonly string[], tab: string, aliases: readonly string[] = []) {
  const persisted = new Set(tabs.map((item) => String(item).trim()).filter(Boolean));
  return persisted.has(tab) || aliases.some((alias) => persisted.has(alias));
}

export function mergeDirtyUserRecords<T extends AccessUser>(options: {
  remoteUsers: T[];
  baseUsers: T[];
  draftUsers: T[];
  dirtyUserIds: readonly string[];
  deletedUserEmails: readonly string[];
}): T[] {
  const deleted = new Set(options.deletedUserEmails.map(normalizeIdentity));
  const dirty = new Set(options.dirtyUserIds.map(normalizeIdentity));
  const baseByKey = new Map(options.baseUsers.map((user) => [userKey(user), user]));
  const result = options.remoteUsers.filter((user) => !deleted.has(userKey(user))).map((user) => ({ ...user }));
  const indexByKey = new Map(result.map((user, index) => [userKey(user), index]));

  options.draftUsers.forEach((draft) => {
    if (!dirty.has(normalizeIdentity(draft.id)) && !dirty.has(normalizeIdentity(draft.email))) return;
    const key = userKey(draft);
    if (!key || deleted.has(key)) return;
    const index = indexByKey.get(key);
    if (index === undefined) {
      indexByKey.set(key, result.push({ ...draft }) - 1);
      return;
    }

    const base = baseByKey.get(key);
    const localPatch: Partial<T> = {};
    for (const field in draft) {
      if (!base || !sameValue(draft[field], base[field])) localPatch[field] = draft[field];
    }
    result[index] = { ...result[index], ...localPatch };
  });

  return result;
}

export function getDisciplinePatch(patch: { disciplina?: string; disciplinas?: string[] }) {
  const source = Object.prototype.hasOwnProperty.call(patch, 'disciplinas') ? patch.disciplinas : patch.disciplina;
  const disciplinas = splitDisciplineValues(source);
  return { disciplina: getPrimaryDisciplineValue(disciplinas[0]), disciplinas };
}
