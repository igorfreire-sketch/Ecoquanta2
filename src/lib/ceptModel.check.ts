import assert from 'node:assert/strict';
import {
  buildCeptModel,
  buildRecordKey,
  buildSignature,
  computeAlerts,
  resolveValidationStatus,
  rollupFamilyStatus,
  type CeptComponent,
  type CeptValidacao,
} from './ceptModel';

const c = (overrides: Partial<CeptComponent>): CeptComponent => ({
  recordKey: buildRecordKey(
    overrides.projectCode || '001',
    overrides.disciplineCode || 'ARQ',
    overrides.family || 'RVT',
    overrides.sourceType || 'Torre A'
  ),
  projectCode: '001',
  disciplineCode: 'ARQ',
  family: 'RVT',
  familyLabel: 'Modelo Nativo',
  sourceLabel: 'Torre A',
  sourceType: 'Torre A',
  format: 'RVT',
  editable: true,
  status: 'delivered',
  dateIso: '2026-08-01',
  updatedAt: '2026-08-01T00:00:00.000Z',
  updatedByEmail: 'igor3dprint@gmail.com',
  updatedByNome: 'Igor',
  ...overrides,
});

// --- Regra 1: POSTED_BEFORE_CUTOFF ---
{
  const beforeCutoff = c({ dateIso: '2026-08-10', sourceType: 'Cutoff-1' });
  const afterCutoff = c({ dateIso: '2026-08-20', sourceType: 'Cutoff-2' });
  const alerts = computeAlerts([beforeCutoff, afterCutoff], '2026-08-18');
  const hits = alerts.filter((a) => a.rule === 'POSTED_BEFORE_CUTOFF');
  assert.equal(hits.length, 1);
  assert.equal(hits[0].recordKey, beforeCutoff.recordKey);
}

// --- Regra 2: EDITABLE_AFTER_NONEDITABLE (vermelho) -- editavel posterior ao nao-editavel.
// Par dentro da MESMA familia, sourceType diferente (ex. RVT nativo x PDF exportado, familia RVT).
{
  const editable = c({ sourceType: 'RVT nativo', family: 'RVT', format: 'RVT', editable: true, dateIso: '2026-08-20', status: 'delivered' });
  const noneditable = c({ sourceType: 'RVT (PDF)', family: 'RVT', format: 'PDF', editable: false, dateIso: '2026-08-10', status: 'delivered' });
  const alerts = computeAlerts([editable, noneditable]);
  const hit = alerts.find((a) => a.rule === 'EDITABLE_AFTER_NONEDITABLE');
  assert.ok(hit, 'esperava alerta EDITABLE_AFTER_NONEDITABLE');
  assert.equal(hit!.severity, 'red');
  assert.equal(hit!.recordKey, noneditable.recordKey);
  assert.equal(alerts.some((a) => a.rule === 'NONEDITABLE_MORE_THAN_7_DAYS_AFTER_EDITABLE'), false);
}

// --- Regra 3: NONEDITABLE_MORE_THAN_7_DAYS_AFTER_EDITABLE (amarelo) -- lag > 7 dias, ordem normal ---
{
  const editable = c({ sourceType: 'RVT nativo', family: 'RVT', format: 'RVT', editable: true, dateIso: '2026-08-01', status: 'delivered' });
  const noneditable = c({ sourceType: 'RVT (PDF)', family: 'RVT', format: 'PDF', editable: false, dateIso: '2026-08-15', status: 'delivered' });
  const alerts = computeAlerts([editable, noneditable]);
  const hit = alerts.find((a) => a.rule === 'NONEDITABLE_MORE_THAN_7_DAYS_AFTER_EDITABLE');
  assert.ok(hit, 'esperava alerta NONEDITABLE_MORE_THAN_7_DAYS_AFTER_EDITABLE');
  assert.equal(hit!.severity, 'yellow');
  assert.equal(hit!.recordKey, noneditable.recordKey);
  assert.equal(alerts.some((a) => a.rule === 'EDITABLE_AFTER_NONEDITABLE'), false);
}

// --- Regressao: par vive na MESMA familia (MC) com sourceType diferente por formato --
// "MC (PDF)" e "MC (DOCX/XLSX)" sao duas entregas independentes da familia MC (comentario
// original do APP_CONFIG). Agrupar por sourceType (bug anterior) nunca casava editable com
// nao-editable porque cada sourceType so tem um formato -- essa regra fica muda com esse bug.
{
  const editable = c({ sourceType: 'MC (DOCX/XLSX)', family: 'MC', format: 'DOCX', editable: true, dateIso: '2026-08-01', status: 'delivered' });
  const noneditable = c({ sourceType: 'MC (PDF)', family: 'MC', format: 'PDF', editable: false, dateIso: '2026-08-15', status: 'delivered' });
  const alerts = computeAlerts([editable, noneditable]);
  const hit = alerts.find((a) => a.rule === 'NONEDITABLE_MORE_THAN_7_DAYS_AFTER_EDITABLE');
  assert.ok(hit, 'esperava alerta cruzando sourceType diferente dentro da mesma familia MC');
  assert.equal(hit!.recordKey, noneditable.recordKey);
}

// --- Lag <= 7 dias: sem alerta de par editavel/nao-editavel ---
{
  const editable = c({ sourceType: 'RVT nativo', family: 'RVT', format: 'RVT', editable: true, dateIso: '2026-08-01', status: 'delivered' });
  const noneditable = c({ sourceType: 'RVT (PDF)', family: 'RVT', format: 'PDF', editable: false, dateIso: '2026-08-05', status: 'delivered' });
  const alerts = computeAlerts([editable, noneditable]);
  assert.equal(alerts.filter((a) => a.rule !== 'POSTED_BEFORE_CUTOFF').length, 0);
}

// --- Rollup de familia: mistura de na e unknown ---
{
  const familyComponents = [
    c({ status: 'na', sourceType: 'A' }),
    c({ status: 'unknown', sourceType: 'B' }),
    c({ status: 'delivered', sourceType: 'C' }),
  ];
  const rollup = rollupFamilyStatus(familyComponents);
  assert.equal(rollup.applicable, 2); // exclui o 'na'
  assert.equal(rollup.status, 'unknown'); // unknown > 0, pending == 0
  assert.equal(rollup.delivered, 1);
  assert.equal(rollup.unknown, 1);
  assert.equal(rollup.pending, 0);
  assert.equal(rollup.percent, 50);
}

// --- Rollup: pending sempre vence ---
{
  const familyComponents = [
    c({ status: 'pending', sourceType: 'A' }),
    c({ status: 'unknown', sourceType: 'B' }),
    c({ status: 'na', sourceType: 'C' }),
  ];
  assert.equal(rollupFamilyStatus(familyComponents).status, 'pending');
}

// --- Rollup: tudo entregue -> delivered ---
{
  const familyComponents = [c({ status: 'delivered', sourceType: 'A' }), c({ status: 'delivered', sourceType: 'B' })];
  const rollup = rollupFamilyStatus(familyComponents);
  assert.equal(rollup.status, 'delivered');
  assert.equal(rollup.percent, 100);
}

// --- Rollup: tudo na -> na ---
{
  const familyComponents = [c({ status: 'na', sourceType: 'A' }), c({ status: 'na', sourceType: 'B' })];
  const rollup = rollupFamilyStatus(familyComponents);
  assert.equal(rollup.status, 'na');
  assert.equal(rollup.applicable, 0);
  assert.equal(rollup.percent, 0);
}

// --- resolveValidationStatus: sem validacao -> unreviewed ---
{
  const comp = c({ sourceType: 'Val-1' });
  assert.equal(resolveValidationStatus(comp.recordKey, 'qualquer-assinatura', []), 'unreviewed');
}

// --- resolveValidationStatus: validacao com assinatura atual -> mapeia action ---
{
  const comp = c({ sourceType: 'Val-2' });
  const signature = buildSignature(comp, [comp]);
  const v = (action: CeptValidacao['action']): CeptValidacao => ({
    recordKey: comp.recordKey,
    projectCode: comp.projectCode,
    signature,
    action,
    usuarioEmail: 'igor3dprint@gmail.com',
    usuarioNome: 'Igor',
    criadoEm: '2026-08-20T00:00:00.000Z',
  });
  assert.equal(resolveValidationStatus(comp.recordKey, signature, [v('RESOLVED')]), 'resolved');
  assert.equal(resolveValidationStatus(comp.recordKey, signature, [v('CONFIRMED_OUTDATED')]), 'confirmed_outdated');
  assert.equal(resolveValidationStatus(comp.recordKey, signature, [v('REOPENED')]), 'open');
}

// --- Invalidacao de assinatura: validacao gravada com assinatura antiga NAO pinta de verde ---
{
  const componentV1 = c({ sourceType: 'Val-3', status: 'pending', dateIso: '2026-08-01' });
  const oldSignature = buildSignature(componentV1, [componentV1]);

  const validation: CeptValidacao = {
    recordKey: componentV1.recordKey,
    projectCode: componentV1.projectCode,
    signature: oldSignature,
    action: 'RESOLVED',
    usuarioEmail: 'igor3dprint@gmail.com',
    usuarioNome: 'Igor',
    criadoEm: '2026-08-05T00:00:00.000Z',
  };

  // componente mudou depois da validacao (status virou delivered) -> assinatura atual diverge
  const componentV2 = { ...componentV1, status: 'delivered' as const };
  const currentSignature = buildSignature(componentV2, [componentV2]);

  assert.notEqual(currentSignature, oldSignature);
  assert.equal(resolveValidationStatus(componentV2.recordKey, currentSignature, [validation]), 'unreviewed');

  // e no modelo completo, displaySeverity nunca vira green por causa dessa validacao velha
  const editable = c({ sourceType: 'Val-3-Par (RVT)', family: 'RVT', format: 'RVT', editable: true, dateIso: '2026-08-20', status: 'delivered' });
  const noneditableStale = { ...componentV2, family: 'RVT', format: 'PDF', editable: false as const, sourceType: 'Val-3-Par (PDF)' };
  const model = buildCeptModel([editable, noneditableStale], [validation], {});
  const alert = model.alerts.find((a) => a.recordKey === noneditableStale.recordKey);
  assert.ok(alert);
  assert.notEqual(alert!.displaySeverity, 'green');
  assert.equal(alert!.validationStatus, 'unreviewed');
}

console.log('ceptModel.check.ts: OK');
