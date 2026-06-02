import { splitDisciplineValues } from '../../../lib/disciplineCatalog';

export type DisciplineMaps = {
  byEmail: Record<string, string>;
  byName: Record<string, string>;
};

export type RegistroParticipant = {
  nome: string;
  email: string;
  disciplina: string;
};

export function normalizeText(value?: string) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
}

export function isAllContract(value?: string) {
  const normalized = normalizeText(value);
  return !normalized || normalized === 'todos' || normalized === 'todos os contratos';
}

function toStringList(value: any) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || '').trim()).filter(Boolean);
  }
  return String(value || '')
    .split(' | ')
    .map((item) => item.trim())
    .filter(Boolean);
}

export function getRegistroActivities(registro: any) {
  const activitiesList = Array.isArray(registro?.activitiesList) ? registro.activitiesList : [];
  const activeActivities = Array.isArray(registro?.activeActivities) ? registro.activeActivities : [];
  const completedActivities = Array.isArray(registro?.completedActivities) ? registro.completedActivities : [];
  const alternateActivities = Array.isArray(registro?.activities)
    ? registro.activities
    : Array.isArray(registro?.atividades)
      ? registro.atividades
      : [];
  const source = activitiesList.length > 0
    ? activitiesList
    : activeActivities.length + completedActivities.length > 0
      ? [...activeActivities, ...completedActivities]
      : alternateActivities;

  const seen = new Set<string>();
  return source.filter((activity: any, index: number) => {
    const key = String(activity?.activityId || activity?.id || activity?.itemCodigo || index).trim();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function getAdminUsers(admin: any) {
  if (Array.isArray(admin?.users)) return admin.users;
  if (admin?.usersByEmail && typeof admin.usersByEmail === 'object') return Object.values(admin.usersByEmail);
  return [];
}

function formatUserDiscipline(user: any) {
  const list = splitDisciplineValues(user?.disciplinas || user?.discipline || user?.disciplina);
  if (list.length > 0) return list.join(' | ');
  return String(user?.disciplina || user?.discipline || '').trim();
}

export function buildProfessionalDisciplineMaps(registro: any, admin?: any): DisciplineMaps {
  const byEmail: Record<string, string> = {};
  const byName: Record<string, string> = {};

  const adminUsers = getAdminUsers(admin);
  adminUsers.forEach((user: any) => {
    const email = normalizeText(user?.email);
    const name = normalizeText(user?.nome || user?.name);
    const disciplina = formatUserDiscipline(user);
    if (email && disciplina && !byEmail[email]) byEmail[email] = disciplina;
    if (name && disciplina && !byName[name]) byName[name] = disciplina;
  });

  const usersSummary = Array.isArray(registro?.usersSummary) ? registro.usersSummary : [];
  usersSummary.forEach((user: any) => {
    const email = normalizeText(user?.email);
    const name = normalizeText(user?.nome || user?.name);
    const disciplina = formatUserDiscipline(user);
    if (email && disciplina && !byEmail[email]) byEmail[email] = disciplina;
    if (name && disciplina && !byName[name]) byName[name] = disciplina;
  });

  const professionalsByDisciplina = registro?.professionalsByDisciplina || {};
  Object.keys(professionalsByDisciplina).forEach((disciplina) => {
    const profissionais = Array.isArray(professionalsByDisciplina[disciplina]) ? professionalsByDisciplina[disciplina] : [];
    profissionais.forEach((prof: any) => {
      const email = normalizeText(prof?.email);
      const name = normalizeText(prof?.nome || prof?.name);
      const disciplinaAtual = formatUserDiscipline(prof) || String(prof?.disciplina || disciplina || '').trim();
      if (email && !byEmail[email]) byEmail[email] = disciplinaAtual;
      if (name && !byName[name]) byName[name] = disciplinaAtual;
    });
  });

  return { byEmail, byName };
}

export function extractParticipantAssignments(activity: any, maps: DisciplineMaps): RegistroParticipant[] {
  const emails = toStringList(activity?.profissionaisEmails);
  const nomes = toStringList(activity?.profissionais);
  const fallbackNome = String(
    activity?.criadoPorNome || activity?.createdByName || activity?.registradoPorNome || activity?.responsavel || 'Responsavel nao informado'
  ).trim();
  const fallbackEmail = String(activity?.criadoPorEmail || activity?.createdByEmail || '').trim();

  const total = Math.max(nomes.length, emails.length, 1);
  const seen = new Set<string>();
  const participants: RegistroParticipant[] = [];

  for (let index = 0; index < total; index += 1) {
    const nome = nomes[index] || nomes[0] || fallbackNome;
    const email = emails[index] || emails[0] || fallbackEmail;
    const disciplina =
      maps.byEmail[normalizeText(email)] ||
      maps.byName[normalizeText(nome)] ||
      maps.byEmail[normalizeText(fallbackEmail)] ||
      maps.byName[normalizeText(fallbackNome)] ||
      String(activity?.criadoPorDisciplina || activity?.disciplina || activity?.userDisciplina || '').trim() ||
      'Sem disciplina';

    const uniqueKey = `${normalizeText(nome)}|${normalizeText(email)}`;
    if (seen.has(uniqueKey)) continue;
    seen.add(uniqueKey);

    participants.push({
      nome,
      email,
      disciplina,
    });
  }

  return participants;
}

export function getRegistroContractOptions(registro: any) {
  const sourceRegistro = registro?.eap?.data?.registro || registro?.eap?.registro || registro || {};
  const fromRegistro = Array.isArray(sourceRegistro?.contracts) ? sourceRegistro.contracts : [];
  const map = new Map<string, { codigo: string; nome: string }>();

  fromRegistro.forEach((item: any) => {
    const codigo = String(item?.codigo || item?.code || item?.id || '').trim();
    const nome = String(item?.nome || item?.name || codigo).trim();
    if (codigo && !map.has(codigo)) map.set(codigo, { codigo, nome });
  });

  return Array.from(map.values());
}

export function getRegistroOsOptions(registro: any, contrato: string) {
  const target = normalizeText(contrato);
  const map = new Map<string, string>();
  const sourceRegistro = registro?.eap?.data?.registro || registro?.eap?.registro || registro || {};
  const fromRegistro = Array.isArray(sourceRegistro?.osOptions) ? sourceRegistro.osOptions : [];

  fromRegistro
    .filter((item: any) => {
      const contratoOs = String(item?.contratoCodigo || item?.contractCode || '').trim();
      return isAllContract(contrato) || normalizeText(contratoOs) === target;
    })
    .forEach((item: any) => {
      const codigo = String(item?.codigo || item?.code || item?.id || '').trim();
      const nome = String(item?.nome || item?.name || codigo).trim();
      if (codigo && !map.has(codigo)) map.set(codigo, nome);
    });

  return Array.from(map.entries()).map(([codigo, nome]) => ({ codigo, nome }));
}
