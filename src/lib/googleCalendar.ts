export interface CalendarEventOption {
  id: string;
  calendarId: string;
  title: string;
  htmlLink: string;
  start: string;
  end: string;
  attendeeEmails: string[];
  geminiNotesUrl?: string;
}

const normalizeEmail = (value: unknown) => String(value || '').trim().toLowerCase();

export function matchCalendarAttendees(event: CalendarEventOption, users: Array<{ email: string }>): string[] {
  const attendees = new Set(event.attendeeEmails.map(normalizeEmail).filter(Boolean));
  return Array.from(new Set(users.map((user) => normalizeEmail(user.email)).filter((email) => attendees.has(email))));
}

export async function listCalendarEvents(accessToken: string, inicio: Date, fim: Date): Promise<CalendarEventOption[]> {
  const headers = { Authorization: `Bearer ${accessToken}` };
  const calendarsResponse = await fetch('https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=250', { headers });
  if (!calendarsResponse.ok) throw new Error(`Autorize novamente a Agenda do Google para ler todos os calendários (${calendarsResponse.status}).`);
  const calendars = ((await calendarsResponse.json()).items || []).filter((calendar: any) => !calendar.deleted && calendar.selected !== false);
  const results = await Promise.all(calendars.map(async (calendar: any) => {
    const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendar.id)}/events?timeMin=${encodeURIComponent(inicio.toISOString())}&timeMax=${encodeURIComponent(fim.toISOString())}&singleEvents=true&orderBy=startTime`;
    const response = await fetch(url, { headers });
    if (!response.ok) return [];
    return ((await response.json()).items || []).map((event: any) => ({ event, calendarId: calendar.id }));
  }));
  return results.flat()
    .filter(({ event }) => event.start?.dateTime)
    .map(({ event, calendarId }) => {
      // O Gemini anexa a ata da reuniao como um Google Doc no proprio evento (attachments) -
      // nao precisa de escopo do Drive pra pegar o link, só pra abrir o conteudo (o usuario
      // abre no próprio Google com a permissão dele).
      const attachments: any[] = event.attachments || [];
      const geminiDoc = attachments.find((att) => String(att.mimeType || '').includes('document')) || attachments[0];
      const attendeeEmails = [
        ...(Array.isArray(event.attendees) ? event.attendees.map((attendee: any) => attendee?.email) : []),
        event.organizer?.email,
      ].map(normalizeEmail).filter(Boolean);
      return {
        id: event.id,
        calendarId,
        title: event.summary || 'Reunião sem título',
        htmlLink: event.htmlLink,
        start: event.start.dateTime,
        end: event.end?.dateTime || event.start.dateTime,
        attendeeEmails: Array.from(new Set(attendeeEmails)),
        geminiNotesUrl: geminiDoc?.fileUrl,
      };
    });
}

// Compatibilidade com o seletor antigo de um dia.
export function listTodayCalendarEvents(accessToken: string, at: Date = new Date()): Promise<CalendarEventOption[]> {
  const inicioDoDia = new Date(at.getFullYear(), at.getMonth(), at.getDate());
  const fimDoDia = new Date(inicioDoDia);
  fimDoDia.setDate(fimDoDia.getDate() + 1);
  return listCalendarEvents(accessToken, inicioDoDia, fimDoDia);
}

// Escreve (ou atualiza) uma linha de referencia a nota no campo description do evento -
// pra quem abre o evento no Google Agenda ver que existe uma nota da EcoQuanta vinculada.
export async function linkNoteToEvent(accessToken: string, calendarId: string, eventId: string, notaUrl: string): Promise<void> {
  const eventUrl = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`;
  const getResponse = await fetch(eventUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!getResponse.ok) throw new Error(`Não foi possível ler o evento da Agenda (${getResponse.status}).`);
  const evento = await getResponse.json();

  const inicio = `— Nota EcoQuanta: ${notaUrl} —`;
  const fim = `— Fim da nota EcoQuanta: ${notaUrl} —`;
  const linha = `📝 Nota EcoQuanta: ${notaUrl}`;
  const descricaoAtual: string = evento.description || '';
  const inicioIndice = descricaoAtual.indexOf(inicio);
  const fimIndice = descricaoAtual.indexOf(fim, inicioIndice);
  const descricaoSemCopia = inicioIndice >= 0 && fimIndice >= inicioIndice
    ? `${descricaoAtual.slice(0, inicioIndice)}${descricaoAtual.slice(fimIndice + fim.length)}`.trim()
    : descricaoAtual;
  if (descricaoSemCopia.includes(linha)) return;
  const descricao = descricaoSemCopia ? `${descricaoSemCopia}\n\n${linha}` : linha;

  const patchResponse = await fetch(eventUrl, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ description: descricao }),
  });
  if (!patchResponse.ok) throw new Error(`Não foi possível escrever no evento da Agenda (${patchResponse.status}).`);
}

const REGEX_DOC_ID = /\/document\/d\/([a-zA-Z0-9_-]+)/;

// Texto puro da ata do Gemini (Google Doc anexado ao evento), via Docs API. Precisa do escopo
// documents.readonly - e o Doc precisa estar compartilhado com quem logou (o Gemini ja
// compartilha automatico com os participantes da reuniao). So le paragrafos de texto; tabela
// dentro da ata (raro em ata do Gemini) e ignorada.
export async function fetchGoogleDocText(accessToken: string, docUrl: string): Promise<string | null> {
  const docId = REGEX_DOC_ID.exec(docUrl)?.[1];
  if (!docId) return null;

  const response = await fetch(`https://docs.googleapis.com/v1/documents/${docId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Não foi possível ler a ata do Gemini (${response.status}): ${body.slice(0, 300)}`);
  }

  const doc = await response.json();
  const paragrafos: any[] = doc.body?.content || [];
  return paragrafos
    .map((bloco) => (bloco.paragraph?.elements || []).map((el: any) => el.textRun?.content || '').join(''))
    .join('')
    .trim();
}
