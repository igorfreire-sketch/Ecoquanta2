import assert from 'node:assert/strict';
import {
  businessDaysBetween,
  classifyDelivery,
  deriveLodWorkdays,
  deriveMeasurement,
  normalizeDateInput,
  normalizeDeliveryComponent,
  toCeptDeliveryComponent,
  normalizeResponsibilityLod,
  validateMeasurement,
  type MeasurementInput,
} from './index';

// Entrega: ELE e canonizado, TOPO/TSD nao podem escapar da Implantacao.
{
  const normalized = normalizeDeliveryComponent({
    projectCode: '1', disciplineCode: 'ele', sourceType: ' MC (PDF) ',
    applicability: 'applicable', status: 'pending', date: '18/08',
  });
  assert.equal(normalized.valid, true);
  assert.equal(normalized.value.projectCode, '001');
  assert.equal(normalized.value.disciplineCode, 'ELET');
  assert.equal(normalized.value.date.display, '18/08');
  assert.equal(normalized.value.date.iso, undefined, 'DD/MM nunca ganha ano por inferencia');
  assert.equal(normalizeDeliveryComponent({
    projectCode: '002', disciplineCode: 'TOPO', sourceType: 'Modelo', applicability: 'applicable', status: 'pending', date: '',
  }).errors.some((error) => error.code === 'DISCIPLINE_RESTRICTED_TO_PROJECT'), true);
}

// A fronteira cria a chave por OS e não deixa o formulário definir família/status derivado.
{
  const normalized = normalizeDeliveryComponent({ osCode: 'OS061', osName: 'CEPT', projectCode: '001', disciplineCode: 'ARQ', sourceType: 'MC (PDF)', applicability: 'applicable', status: 'delivered', date: '18/08/2026' });
  const component = toCeptDeliveryComponent(normalized.value, { email: 'autor@quanta.com' });
  assert.equal(component.recordKey, 'OS061|001|ARQ|MC|MC (PDF)');
  assert.equal(component.family, 'MC');
  assert.equal(component.status, 'delivered');
  assert.equal(component.updatedByEmail, 'autor@quanta.com');
}

// Fonte XLS/App Script: classificacao e natureza nao ficam editaveis no formulario.
{
  assert.deepEqual(classifyDelivery('Memorial de Cálculo', 'MC (PDF)'), {
    family: 'MC', familyLabel: 'Memorial de Cálculo', format: 'PDF', editable: false,
  });
  assert.equal(classifyDelivery('Modelo BIM', 'RVT').editable, true);
}

// Datas completas viram ISO; data impossivel retorna erro estruturado.
{
  assert.equal(normalizeDateInput('18/08/2026').value.iso, '2026-08-18');
  assert.equal(normalizeDateInput('31/02/2026').errors[0]?.code, 'DATE_INVALID');
}

// LOD: excecao e uma configuracao de marco, nao um numero de linha XLS oculto.
{
  const lod = normalizeResponsibilityLod({
    projectCode: '001', disciplineCode: 'TODAS', performanceRating: 6, mode: 'Quanta',
    closed: false, bimCompatibility: true,
    milestones: { '100': '01/09/2026', '200': '08/09/2026', final: '15/09/2026' },
  });
  assert.equal(lod.valid, true);
  const derived = deriveLodWorkdays(lod.value.milestones, { excludedMilestones: ['200'] });
  assert.deepEqual(derived.includedMilestones, ['100', '300', '350', '400', 'final']);
  assert.deepEqual(derived.segments, [{ from: '100', to: 'final', businessDays: 10 }]);
  assert.equal(derived.totalBusinessDays, 10);
  assert.equal(businessDaysBetween('2026-09-01', '2026-09-08'), 5);
}

// Medicao: pesos nao podem mudar e tecn./contratual permanecem independentes.
{
  const measurement: MeasurementInput = {
    projectCode: '001', disciplineCode: 'ARQ', supplier: 'Fornecedor', internalResponsible: 'Responsavel interno',
    milestones: {
      1: { technicalApproved: true, contractualApproved: true },
      2: { technicalApproved: true, contractualApproved: false, weight: 20 },
      3: { technicalApproved: false, contractualApproved: true },
      4: { technicalApproved: false, contractualApproved: false },
      5: { technicalApproved: false, contractualApproved: false },
      6: { technicalApproved: false, contractualApproved: false },
    },
  };
  assert.deepEqual(deriveMeasurement(measurement), {
    technicalEarnedPercent: 30, contractualEarnedPercent: 30, earnedPercent: 10,
    pendingTechnicalPercent: 70, pendingContractualPercent: 70,
  });
  assert.equal(validateMeasurement({ ...measurement, milestones: { ...measurement.milestones, 1: { technicalApproved: true, contractualApproved: true, weight: 99 } } })
    .some((error) => error.code === 'MEASUREMENT_WEIGHT_IMMUTABLE'), true);
}

console.log('ceptPreenchimento.check.ts: OK');
