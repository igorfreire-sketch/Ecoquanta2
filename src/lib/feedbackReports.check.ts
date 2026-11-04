import assert from 'node:assert/strict';
import { isQuantaDashReport, normalizeFeedbackReportPayload } from './feedbackReports';

for (const kind of ['bug', 'request', 'idea'] as const) {
  assert.equal(normalizeFeedbackReportPayload({ kind, route: '/teste' }).kind, kind);
}
assert.throws(() => normalizeFeedbackReportPayload({ kind: 'other' as never, route: '/teste' }));
assert.equal(isQuantaDashReport({ route: '  Quanta-Dash › Obras  ' }), true);
assert.equal(isQuantaDashReport({ route: 'quanta-dash › Relatórios' }), true);
assert.equal(isQuantaDashReport({ route: 'Ecoquanta › Principal' }), false);
console.log('feedbackReports: OK');
