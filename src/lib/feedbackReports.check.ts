import assert from 'node:assert/strict';
import { normalizeFeedbackReportPayload } from './feedbackReports';

for (const kind of ['bug', 'request', 'idea'] as const) {
  assert.equal(normalizeFeedbackReportPayload({ kind, route: '/teste' }).kind, kind);
}
assert.throws(() => normalizeFeedbackReportPayload({ kind: 'other' as never, route: '/teste' }));
console.log('feedbackReports: OK');
