export interface CalendarEventOption {
  id: string;
  title: string;
  htmlLink: string;
  start: string;
  geminiNotesUrl?: string;
}

// Eventos da Agenda Google no dia de `at` (usado pra abrir um popup e o usuario escolher
// qual reuniao vincular a nota - so eventos com horario, ignora os de dia inteiro).
export async function listTodayCalendarEvents(accessToken: string, at: Date = new Date()): Promise<CalendarEventOption[]> {
  const inicioDoDia = new Date(at.getFullYear(), at.getMonth(), at.getDate(), 0, 0, 0);
  const fimDoDia = new Date(at.getFullYear(), at.getMonth(), at.getDate(), 23, 59, 59);
  const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${encodeURIComponent(inicioDoDia.toISOString())}&timeMax=${encodeURIComponent(fimDoDia.toISOString())}&singleEvents=true&orderBy=startTime`;
  const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Não foi possível consultar a Agenda do Google (${response.status}): ${body.slice(0, 300)}`);
  }

  const data = await response.json();
  const items: any[] = data.items || [];
  return items
    .filter((event) => event.start?.dateTime)
    .map((event) => {
      // O Gemini anexa a ata da reuniao como um Google Doc no proprio evento (attachments) -
      // nao precisa de escopo do Drive pra pegar o link, só pra abrir o conteudo (o usuario
      // abre no próprio Google com a permissão dele).
      const attachments: any[] = event.attachments || [];
      const geminiDoc = attachments.find((att) => String(att.mimeType || '').includes('document')) || attachments[0];
      return {
        id: event.id,
        title: event.summary || 'Reunião sem título',
        htmlLink: event.htmlLink,
        start: event.start.dateTime,
        geminiNotesUrl: geminiDoc?.fileUrl,
      };
    });
}

// Escreve (ou atualiza) uma linha de referencia a nota no campo description do evento -
// pra quem abre o evento no Google Agenda ver que existe uma nota da EcoQuanta vinculada.
// Precisa do escopo de escrita (calendar.events, nao só readonly). Idempotente: se a linha
// dessa nota ja estiver la, nao duplica.
export async function linkNoteToEvent(accessToken: string, eventId: string, notaTitulo: string, notaUrl: string): Promise<void> {
  const eventUrl = `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(eventId)}`;
  const getResponse = await fetch(eventUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!getResponse.ok) throw new Error(`Não foi possível ler o evento da Agenda (${getResponse.status}).`);
  const evento = await getResponse.json();

  const linha = `📝 Nota EcoQuanta: "${notaTitulo || 'Sem título'}" — ${notaUrl}`;
  const descricaoAtual: string = evento.description || '';
  if (descricaoAtual.includes(linha)) return;

  const patchResponse = await fetch(eventUrl, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ description: descricaoAtual ? `${descricaoAtual}\n\n${linha}` : linha }),
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
