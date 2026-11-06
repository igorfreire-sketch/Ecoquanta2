import assert from 'node:assert/strict';
import {
  buildFeedbackBreadcrumb,
  compareFeedbackCreatedAt,
  formatFeedbackDate,
  formatFeedbackLocation,
  isQuantaDashReport,
  normalizeFeedbackReportPayload,
} from './feedbackReports';

for (const kind of ['bug', 'request', 'idea'] as const) {
  assert.equal(normalizeFeedbackReportPayload({ kind, route: '/teste' }).kind, kind);
}
assert.throws(() => normalizeFeedbackReportPayload({ kind: 'other' as never, route: '/teste' }));
assert.equal(isQuantaDashReport({ route: '  Quanta-Dash › Obras  ' }), true);
assert.equal(isQuantaDashReport({ route: 'quanta-dash › Relatórios' }), true);
assert.equal(isQuantaDashReport({ route: 'Ecoquanta › Principal' }), false);
assert.equal(buildFeedbackBreadcrumb('Ecoquanta2', 'Planejamento', 'Project', 'Conteudo principal'), 'Ecoquanta2 › Planejamento › Project › Conteudo principal');

const timestamp = { toDate: () => new Date(2026, 10, 6, 14, 5) };
assert.equal(formatFeedbackDate(timestamp), '06/11/2026 14:05');
assert.equal(formatFeedbackDate(null), 'Data nao registrada');
assert.equal(formatFeedbackLocation({ route: '/', xRatio: 0.123, yRatio: 0.456 }), 'Aba nao registrada · 12%, 46%');
assert.equal(formatFeedbackLocation({ route: 'Ecoquanta2 › Planejamento', xRatio: 0.123, yRatio: 0.456 }), 'Ecoquanta2 › Planejamento');

const reports = [
  { id: 'null', createdAt: null },
  { id: 'null-2', createdAt: null },
  { id: 'newer', createdAt: { toDate: () => new Date(2026, 0, 2) } },
  { id: 'older', createdAt: { toDate: () => new Date(2026, 0, 1) } },
].sort(compareFeedbackCreatedAt);
assert.deepEqual(reports.map(({ id }) => id), ['older', 'newer', 'null', 'null-2']);
console.log('feedbackReports: OK');
