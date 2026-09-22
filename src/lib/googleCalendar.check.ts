import assert from 'node:assert/strict';
import { matchCalendarAttendees } from './googleCalendar';

assert.deepEqual(
  matchCalendarAttendees({ id: 'event', title: '', htmlLink: '', start: '', attendeeEmails: ['ANA@QUANTA.COM', 'externo@exemplo.com'] }, [{ email: 'ana@quanta.com' }, { email: 'bruno@quanta.com' }]),
  ['ana@quanta.com'],
);
console.log('googleCalendar attendees: OK');
