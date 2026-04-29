interface DadoOS {
  os: string;
  nomeCompleto?: string;
  contrato?: string;
  [key: string]: string | number | undefined;
}

function normalizeText(value: string) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function disciplinaKey(value: string) {
  return `disc_${normalizeText(value).replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'sem_disciplina'}`;
}

function splitEmails(value: unknown) {
  if (Array.isArray(value)) return value.map(String).map((item) => item.trim()).filter(Boolean);
  return String(value || '').split(' | ').map((item) => item.trim()).filter(Boolean);
}

export function processComposicaoProfissionaisPorOS(activities: any[]): DadoOS[] {
  const grupos: Record<string, {
    os: string;
    nomeCompleto: string;
    contrato: string;
    disciplinas: Record<string, Set<string>>;
  }> = {};

  (activities || []).forEach((activity) => {
    const os = String(activity.OSCodigo || activity.osCodigo || '').trim();
    const osNome = String(activity.OSNome || activity.osNome || os).trim();
    const contrato = String(activity.ContratoNome || activity.contratoNome || activity.contratoCodigo || '').trim();
    const disciplina = String(activity.CriadoPorDisciplina || activity.criadoPorDisciplina || 'Sem Disciplina').trim();
    const emails = splitEmails(activity.profissionaisEmails || activity.ProfissionaisEmails || activity.profissionais_emails);

    if (!os || !emails.length) return;

    if (!grupos[os]) {
      grupos[os] = {
        os,
        nomeCompleto: osNome,
        contrato,
        disciplinas: {},
      };
    }

    const key = disciplinaKey(disciplina);
    if (!grupos[os].disciplinas[key]) grupos[os].disciplinas[key] = new Set<string>();
    emails.forEach((email) => grupos[os].disciplinas[key].add(email.toLowerCase()));
  });

  return Object.values(grupos).map((grupo) => {
    const row: DadoOS = {
      os: grupo.os,
      nomeCompleto: grupo.nomeCompleto,
      contrato: grupo.contrato,
    };

    Object.entries(grupo.disciplinas).forEach(([key, emails]) => {
      row[key] = emails.size;
    });

    return row;
  });
}
