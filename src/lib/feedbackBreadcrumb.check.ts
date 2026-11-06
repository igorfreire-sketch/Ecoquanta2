import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { buildFeedbackBreadcrumb } from './feedbackReports';

// Exercise the App call site: headerTabs intentionally has no sidebar items
// for Principal/Cronograma, but their selected sub-tab still belongs in feedback.
const source = ts.createSourceFile('App.tsx', readFileSync(new URL('../App.tsx', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let expression = '';
function visit(node: ts.Node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(source) === 'feedbackBreadcrumb') expression = node.initializer!.getText(source);
  ts.forEachChild(node, visit);
}
visit(source);
assert(expression, 'App must build its feedback breadcrumb');
function breadcrumb(activeTab: string, principalSubTab = 'inicio', cronogramaSubTab = 'cronograma', headerTabs: unknown[] = []) {
  return vm.runInNewContext(expression, { activeTab, principalSubTab, cronogramaSubTab, headerTabs, buildFeedbackBreadcrumb,
    AREA_LABELS: { principal: 'Principal', cronograma: 'Cronograma', planejamento: 'Planejamento' } });
}
assert.equal(breadcrumb('principal', 'project'), 'Ecoquanta2 › Principal › Project');
assert.equal(breadcrumb('cronograma', 'inicio', 'disciplinas'), 'Ecoquanta2 › Cronograma › Notas');
assert.equal(breadcrumb('principal'), 'Ecoquanta2 › Principal');
assert.equal(breadcrumb('cronograma'), 'Ecoquanta2 › Cronograma');
assert.equal(breadcrumb('planejamento', 'project', 'disciplinas', [{ label: 'Curva S', active: true }]), 'Ecoquanta2 › Planejamento › Curva S');
console.log('feedbackBreadcrumb: OK (actual App expression; hidden sub-tabs and defaults)');
