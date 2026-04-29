interface DadoOS {
  os: string;
  disciplina: string;
  quantidade: number;
  percentual: number;
}

export function processComposicaoProfissionaisPorOS(activities: any[]): DadoOS[] {
  const grupos: Record<string, Set<string>> = {};
  
  activities.forEach(activity => {
    const os = activity.OSCodigo || activity.osCodigo || '';
    const disciplina = activity.CriadoPorDisciplina || activity.criadoPorDisciplina || 'Sem Disciplina';
    const emailsStr = activity.profissionaisEmails || activity.profissionais_emails || '';
    const emails = emailsStr.split(' | ').filter(email => email.trim());
    
    if (os && emails.length > 0) {
      const key = `${os}_${disciplina}`;
      if (!grupos[key]) {
        grupos[key] = new Set();
      }
      emails.forEach(email => grupos[key].add(email.trim().toLowerCase()));
    }
  });

  // Totais por OS
  const osTotals: Record<string, number> = {};
  Object.keys(grupos).forEach(key => {
    const os = key.split('_')[0];
    osTotals[os] = (osTotals[os] || 0) + grupos[key].size;
  });

  // Resultado final
  const resultado: Dado
