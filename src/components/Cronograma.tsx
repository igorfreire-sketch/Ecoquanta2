import React, { useEffect, useMemo, useState } from 'react';
import { CalendarDays, ChevronDown, ChevronRight, Filter, Maximize2, X, AlertTriangle } from 'lucide-react';
import { isFirebaseConfigured, setFirebaseDocument } from '../lib/firebaseDb';

interface CronogramaRow {
  code?: string;
  name?: string;
  progress?: number;
  duration?: number;
  plannedStart?: string;
  plannedEnd?: string;
  predecessor?: string;
  idealProgress?: number;
  realStart?: string;
  realEnd?: string;
  baselineIdealProgress?: number;
}

interface CronogramaProps {
  lockedContractCode?: string;
  viewMode?: 'default' | 'planning';
  currentUser?: {
    nome?: string;
    email?: string;
    role?: string;
  };
  preloadedData?: {
    cronograma?: CronogramaRow[];
    eap?: any;
    registro?: {
      contracts?: Array<{ codigo: string; nome: string }>;
      osOptions?: Array<{ codigo: string; nome: string; contratoCodigo: string }>;
      activitiesList?: Array<Record<string, any>>;
      cronograma?: CronogramaRow[];
    };
    planningTodos?: Array<Record<string, any>>;
  };
  onPlannerApprovalSubmit?: (rows: Array<{
    id: string;
    itemCodigo: string;
    itemNome: string;
    progress: number;
    approved: boolean;
  }>) => Promise<void> | void;
}

interface TreeNode {
  code: string;
  name: string;
  row: CronogramaRow;
  children: TreeNode[];
}

type GanttScaleMode = 'day' | 'week' | 'month' | 'year';

interface GanttTask {
  code: string;
  name: string;
  row: CronogramaRow;
  level: number;
  rowIndex: number;
  predecessors: string[];
  start: Date | null;
  end: Date | null;
  durationDays: number;
  progress: number;
  milestone: boolean;
  critical: boolean;
  issues: string[];
}

interface GanttModel {
  tasks: GanttTask[];
  issues: string[];
  scaleMode: GanttScaleMode;
  timelineStart: Date;
  timelineEnd: Date;
  unitPx: number;
  unitCount: number;
  labelStep: number;
}

function normalizeText(value: any) {
  return String(value || '').trim();
}

function normalizeCode(value: any) {
  return String(value || '').trim();
}

function normalizeKey(value: any) {
  return String(value || '').trim().toLowerCase();
}

function dotCount(code: string) {
  return (code.match(/\./g) || []).length;
}

function parseDate(value?: string) {
  const raw = normalizeText(value);
  if (!raw) return null;

  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));

  const br = raw.match(/^(\d{2})[\/\-.](\d{2})[\/\-.](\d{4})/);
  if (br) return new Date(Number(br[3]), Number(br[2]) - 1, Number(br[1]));

  return null;
}

function startOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function startOfWeek(date: Date) {
  const next = startOfDay(date);
  const day = next.getDay();
  const offset = (day + 6) % 7;
  next.setDate(next.getDate() - offset);
  return next;
}

function endOfWeek(date: Date) {
  return addDays(startOfWeek(date), 6);
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function endOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

function startOfYear(date: Date) {
  return new Date(date.getFullYear(), 0, 1);
}

function endOfYear(date: Date) {
  return new Date(date.getFullYear(), 11, 31);
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function addWeeks(date: Date, weeks: number) {
  return addDays(date, weeks * 7);
}

function addMonths(date: Date, months: number) {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return new Date(next.getFullYear(), next.getMonth(), 1);
}

function addYears(date: Date, years: number) {
  return new Date(date.getFullYear() + years, 0, 1);
}

function diffDays(start: Date, end: Date) {
  const dayMs = 24 * 60 * 60 * 1000;
  return Math.round((startOfDay(end).getTime() - startOfDay(start).getTime()) / dayMs);
}

function diffWeeks(start: Date, end: Date) {
  return Math.round(diffDays(startOfWeek(start), startOfWeek(end)) / 7);
}

function diffMonths(start: Date, end: Date) {
  return (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
}

function diffYears(start: Date, end: Date) {
  return end.getFullYear() - start.getFullYear();
}

function sameDay(a: Date, b: Date) {
  return startOfDay(a).getTime() === startOfDay(b).getTime();
}

function parsePredecessors(value?: string) {
  return String(value || '')
    .split(/[,;|]+/)
    .map((item) => normalizeCode(item))
    .filter(Boolean);
}

function normalizeCronogramaRow(row: any): CronogramaRow | null {
  if (!row) return null;

  if (Array.isArray(row)) {
    const code = normalizeCode(row[0]);
    const name = normalizeText(row[1]);
    if (!code || !name) return null;
    return {
      code,
      name,
      progress: Number(row[2] || 0),
      duration: Number(row[5] || 0),
      plannedStart: String(row[6] || '').trim(),
      plannedEnd: String(row[7] || '').trim(),
      predecessor: String(row[8] || '').trim(),
      idealProgress: Number(row[9] || 0),
      realStart: String(row[11] || '').trim(),
      realEnd: String(row[12] || '').trim(),
      baselineIdealProgress: Number(row[13] || 0),
    };
  }

  const code = normalizeCode(row.code || row.codigo || row.id);
  const name = normalizeText(row.name || row.nome || row.title);
  if (!code || !name) return null;

  return {
    code,
    name,
    progress: Number(row.progress ?? row.avancoAtual ?? row.percentage ?? 0),
    duration: Number(row.duration ?? row.duracao ?? 0),
    plannedStart: String(row.plannedStart || row.inicioPlanejado || row.dataInicio || '').trim(),
    plannedEnd: String(row.plannedEnd || row.terminoPlanejado || row.dataFim || '').trim(),
    predecessor: String(row.predecessor || row.predecessoras || row.predecessora || '').trim(),
    idealProgress: Number(row.idealProgress ?? row.progressIdeal ?? 0),
    realStart: String(row.realStart || row.dataInicioReal || '').trim(),
    realEnd: String(row.realEnd || row.dataFimReal || '').trim(),
    baselineIdealProgress: Number(row.baselineIdealProgress ?? row.idealProgressBase ?? 0),
  };
}

function getCronogramaSourceRows(preloadedData?: CronogramaProps['preloadedData']) {
  const candidates = [
    preloadedData?.cronograma,
    preloadedData?.eap?.data?.cronograma,
    preloadedData?.eap?.cronograma,
    preloadedData?.registro?.cronograma,
  ];

  const normalized: CronogramaRow[] = [];
  candidates.forEach((candidate) => {
    if (!Array.isArray(candidate)) return;
    candidate.forEach((row) => {
      const normalizedRow = normalizeCronogramaRow(row);
      if (normalizedRow) normalized.push(normalizedRow);
    });
  });

  const seen = new Set<string>();
  return normalized.filter((row) => {
    const key = normalizeCode(row.code);
    if (!key) return false;
    const signature = `${key}::${normalizeText(row.name)}`;
    if (seen.has(signature)) return false;
    seen.add(signature);
    return true;
  });
}

function formatDateBR(value?: string) {
  const date = parseDate(value);
  if (!date || Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('pt-BR');
}

function toPercent(value: any) {
  const raw = typeof value === 'number'
    ? value
    : Number(String(value || 0).replace(/\./g, '').replace(',', '.'));
  const normalized = Number.isNaN(raw) ? 0 : raw;
  const percent = normalized > 0 && normalized <= 1 ? normalized * 100 : normalized;
  return Math.max(0, Math.min(100, Math.round(percent)));
}

function compareHierarchy(a: string, b: string) {
  const aParts = a.split('.').map((item) => Number(item.replace(/\D/g, '')) || 0);
  const bParts = b.split('.').map((item) => Number(item.replace(/\D/g, '')) || 0);
  const maxLength = Math.max(aParts.length, bParts.length);

  for (let index = 0; index < maxLength; index += 1) {
    const diff = (aParts[index] || 0) - (bParts[index] || 0);
    if (diff !== 0) return diff;
  }

  return a.localeCompare(b, 'pt-BR');
}

function getParentCode(code: string) {
  const parts = code.split('.');
  if (parts.length <= 1) return '';
  parts.pop();
  return parts.join('.');
}

function buildContractOptions(rows: CronogramaRow[], preloadedData?: CronogramaProps['preloadedData']) {
  const fromRegistro = Array.isArray(preloadedData?.registro?.contracts) ? preloadedData.registro.contracts : [];
  if (fromRegistro.length) return fromRegistro.map((item) => ({ code: item.codigo, name: item.nome }));

  return rows
    .filter((row) => dotCount(normalizeText(row.code)) === 0)
    .map((row) => ({ code: normalizeText(row.code), name: normalizeText(row.name || row.code) }))
    .filter((item) => item.code);
}

function buildOsOptions(rows: CronogramaRow[], preloadedData?: CronogramaProps['preloadedData']) {
  const fromRegistro = Array.isArray(preloadedData?.registro?.osOptions) ? preloadedData.registro.osOptions : [];
  if (fromRegistro.length) {
    return fromRegistro.map((item) => ({ code: item.codigo, name: item.nome, contractCode: item.contratoCodigo }));
  }

  return rows
    .filter((row) => dotCount(normalizeText(row.code)) === 1)
    .map((row) => {
      const code = normalizeText(row.code);
      return {
        code,
        name: normalizeText(row.name || row.code),
        contractCode: getParentCode(code),
      };
    })
    .filter((item) => item.code && item.contractCode);
}

function buildTree(rows: CronogramaRow[], contractFilter: string, osFilter: string) {
  const rowMap = new Map<string, CronogramaRow>();
  rows.forEach((row) => {
    const code = normalizeText(row.code);
    const name = normalizeText(row.name);
    if (code && name) rowMap.set(code, row);
  });

  const selectedCodes = Array.from(rowMap.keys()).filter((code) => {
    if (osFilter !== 'Todas') return code === osFilter || code.startsWith(`${osFilter}.`);
    if (contractFilter !== 'Todos') return code === contractFilter || code.startsWith(`${contractFilter}.`);
    return true;
  });

  const selectedSet = new Set(selectedCodes);
  const childrenMap = new Map<string, string[]>();

  selectedCodes.forEach((code) => {
    const parentCode = getParentCode(code);
    if (!selectedSet.has(parentCode)) return;
    const bucket = childrenMap.get(parentCode) || [];
    bucket.push(code);
    childrenMap.set(parentCode, bucket);
  });

  childrenMap.forEach((children, parentCode) => {
    children.sort(compareHierarchy);
    childrenMap.set(parentCode, children);
  });

  const buildNode = (code: string): TreeNode => {
    const row = rowMap.get(code)!;
    const childCodes = childrenMap.get(code) || [];
    return {
      code,
      name: normalizeText(row.name || row.code),
      row,
      children: childCodes.map(buildNode),
    };
  };

  const rootCodes = selectedCodes
    .filter((code) => !selectedSet.has(getParentCode(code)))
    .sort(compareHierarchy);

  return rootCodes.map(buildNode);
}

function flattenCodes(nodes: TreeNode[]): string[] {
  return nodes.flatMap((node) => [node.code, ...flattenCodes(node.children)]);
}

function flattenTreeNodes(nodes: TreeNode[]): TreeNode[] {
  return nodes.flatMap((node) => [node, ...flattenTreeNodes(node.children)]);
}

function flattenVisibleTreeNodes(nodes: TreeNode[], expandedRows: Set<string>, level = 0): Array<{ node: TreeNode; level: number }> {
  return nodes.flatMap((node) => {
    const current = [{ node, level }];
    if (node.children.length > 0 && expandedRows.has(node.code)) {
      current.push(...flattenVisibleTreeNodes(node.children, expandedRows, level + 1));
    }
    return current;
  });
}

function estimateDurationDays(row: CronogramaRow, start: Date | null, end: Date | null) {
  const durationFromField = Number(row.duration || 0);
  if (durationFromField > 0) return Math.max(1, Math.round(durationFromField));
  if (start && end) return Math.max(1, diffDays(start, end) + 1);
  return 1;
}

function buildGanttTimelineBounds(tasks: Array<{ start: Date | null; end: Date | null }>) {
  const dates = tasks.flatMap((task) => [task.start, task.end]).filter((date): date is Date => Boolean(date && !Number.isNaN(date.getTime())));
  const today = startOfDay(new Date());
  if (!dates.length) {
    return { start: today, end: addDays(today, 14) };
  }

  const minDate = new Date(Math.min(...dates.map((date) => date.getTime())));
  const maxDate = new Date(Math.max(...dates.map((date) => date.getTime())));
  return {
    start: startOfDay(new Date(Math.min(minDate.getTime(), today.getTime()))),
    end: startOfDay(new Date(Math.max(maxDate.getTime(), today.getTime()))),
  };
}

function getTaskDisplayDates(row: CronogramaRow, predecessorEnd: Date | null) {
  const plannedStart = parseDate(row.plannedStart);
  const plannedEnd = parseDate(row.plannedEnd);
  const start = plannedStart || (predecessorEnd ? addDays(predecessorEnd, 1) : null);
  const inferredEnd = start && row.duration ? addDays(start, Math.max(0, Math.round(row.duration) - 1)) : null;
  const end = plannedEnd || inferredEnd || (start ? start : null);
  return { start, end };
}

function getGanttScaleLabel(scaleMode: GanttScaleMode) {
  switch (scaleMode) {
    case 'week':
      return 'Semanas';
    case 'month':
      return 'Meses';
    case 'year':
      return 'Anos';
    default:
      return 'Dias';
  }
}

function getGanttScaleBounds(bounds: { start: Date; end: Date }, scaleMode: GanttScaleMode) {
  switch (scaleMode) {
    case 'week':
      return {
        start: startOfWeek(bounds.start),
        end: endOfWeek(bounds.end),
      };
    case 'month':
      return {
        start: startOfMonth(bounds.start),
        end: endOfMonth(bounds.end),
      };
    case 'year':
      return {
        start: startOfYear(bounds.start),
        end: endOfYear(bounds.end),
      };
    default:
      return {
        start: startOfDay(bounds.start),
        end: startOfDay(bounds.end),
      };
  }
}

function getGanttUnitDate(model: GanttModel, index: number) {
  switch (model.scaleMode) {
    case 'week':
      return addWeeks(model.timelineStart, index);
    case 'month':
      return addMonths(model.timelineStart, index);
    case 'year':
      return addYears(model.timelineStart, index);
    default:
      return addDays(model.timelineStart, index);
  }
}

function getGanttUnitLabel(model: GanttModel, index: number) {
  const date = getGanttUnitDate(model, index);
  switch (model.scaleMode) {
    case 'week':
      return `${date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}`;
    case 'month':
      return date.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });
    case 'year':
      return date.toLocaleDateString('pt-BR', { year: 'numeric' });
    default:
      return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
  }
}

function getGanttUnitIndex(model: GanttModel, date: Date) {
  switch (model.scaleMode) {
    case 'week':
      return diffWeeks(model.timelineStart, date);
    case 'month':
      return diffMonths(model.timelineStart, date);
    case 'year':
      return diffYears(model.timelineStart, date);
    default:
      return diffDays(model.timelineStart, date);
  }
}

function getGanttSpanUnits(model: GanttModel, start: Date, end: Date) {
  switch (model.scaleMode) {
    case 'week':
      return Math.max(1, diffWeeks(startOfWeek(start), startOfWeek(end)) + 1);
    case 'month':
      return Math.max(1, diffMonths(startOfMonth(start), startOfMonth(end)) + 1);
    case 'year':
      return Math.max(1, diffYears(startOfYear(start), startOfYear(end)) + 1);
    default:
      return Math.max(1, diffDays(startOfDay(start), startOfDay(end)) + 1);
  }
}

function getGanttScaleUnitPx(scaleMode: GanttScaleMode, unitCount: number) {
  if (scaleMode === 'year') return 150;
  if (scaleMode === 'month') return 128;
  if (scaleMode === 'week') return 96;
  return unitCount > 240 ? 12 : unitCount > 120 ? 16 : unitCount > 60 ? 20 : 26;
}

function getGanttScaleLabelStep(scaleMode: GanttScaleMode, unitCount: number) {
  if (scaleMode === 'year') return 1;
  if (scaleMode === 'month') return 1;
  if (scaleMode === 'week') return 1;
  return unitCount > 240 ? 30 : unitCount > 120 ? 14 : unitCount > 60 ? 7 : 1;
}

function getGanttScaleTimelinePosition(model: GanttModel, date: Date) {
  const unitIndex = getGanttUnitIndex(model, date);

  if (model.scaleMode === 'day') {
    return unitIndex * model.unitPx + model.unitPx / 2;
  }

  if (model.scaleMode === 'week') {
    const weekStart = startOfWeek(date);
    const fraction = Math.max(0, Math.min(1, diffDays(weekStart, date) / 7));
    return unitIndex * model.unitPx + fraction * model.unitPx;
  }

  if (model.scaleMode === 'month') {
    const daysInMonth = endOfMonth(date).getDate();
    const fraction = Math.max(0, Math.min(1, startOfDay(date).getDate() / Math.max(1, daysInMonth)));
    return unitIndex * model.unitPx + fraction * model.unitPx;
  }

  const yearStart = startOfYear(date);
  const isLeapYear = new Date(yearStart.getFullYear(), 1, 29).getMonth() === 1;
  const daysInYear = isLeapYear ? 366 : 365;
  const fraction = Math.max(0, Math.min(1, diffDays(yearStart, date) / Math.max(1, daysInYear)));
  return unitIndex * model.unitPx + fraction * model.unitPx;
}

function getGanttTaskStatusLabel(progress: number) {
  if (progress >= 100) return 'Concluida';
  if (progress > 0) return 'Em andamento';
  return 'Futura';
}

function buildGanttModel(rows: CronogramaRow[], treeNodes: TreeNode[], scaleMode: GanttScaleMode) {
  const orderedCodes = flattenTreeNodes(treeNodes).map((node) => normalizeCode(node.code));
  const codeOrder = new Map<string, number>();
  orderedCodes.forEach((code, index) => {
    if (!codeOrder.has(code)) codeOrder.set(code, index);
  });

  const rowMap = new Map<string, CronogramaRow>();
  const duplicates = new Set<string>();
  const issues: string[] = [];

  rows.forEach((row) => {
    const code = normalizeCode(row.code);
    if (!code) return;
    if (rowMap.has(code)) {
      duplicates.add(code);
      return;
    }
    rowMap.set(code, row);
  });

  duplicates.forEach((code) => {
    issues.push(`Codigo duplicado encontrado no cronograma: ${code}.`);
  });

  const tasksBase = Array.from(rowMap.entries()).map(([code, row]) => {
    const predecessors = parsePredecessors(row.predecessor);
    const start = parseDate(row.plannedStart) || parseDate(row.realStart);
    const end = parseDate(row.plannedEnd) || parseDate(row.realEnd);
    const durationDays = estimateDurationDays(row, start, end);
    const milestone = durationDays <= 1 || sameDay(start || end || new Date(), end || start || new Date());
    return {
      code,
      name: normalizeText(row.name || row.code),
      row,
      predecessors,
      start,
      end,
      durationDays,
      progress: toPercent(row.progress),
      milestone,
      critical: false,
      issues: [] as string[],
      level: 0,
    };
  });

  const taskMap = new Map<string, typeof tasksBase[number]>();
  tasksBase.forEach((task) => taskMap.set(task.code, task));

  tasksBase.forEach((task) => {
    if (!task.start) task.issues.push('Sem data de inicio.');
    if (!task.end) task.issues.push('Sem data de termino.');
    if (task.start && task.end && task.end.getTime() < task.start.getTime()) {
      task.issues.push('Data de termino anterior ao inicio.');
    }

    task.predecessors.forEach((predecessorCode) => {
      if (predecessorCode === task.code) {
        task.issues.push('Auto-dependencia identificada.');
        return;
      }
      if (!taskMap.has(predecessorCode)) {
        task.issues.push(`Predecessora ausente: ${predecessorCode}.`);
      }
    });
  });

  const indegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();
  taskMap.forEach((_task, code) => {
    indegree.set(code, 0);
    adjacency.set(code, []);
  });

  taskMap.forEach((task, code) => {
    task.predecessors.forEach((predecessorCode) => {
      if (!taskMap.has(predecessorCode)) return;
      indegree.set(code, (indegree.get(code) || 0) + 1);
      adjacency.get(predecessorCode)?.push(code);
    });
  });

  const queue = Array.from(indegree.entries())
    .filter(([, value]) => value === 0)
    .map(([code]) => code)
    .sort((a, b) => (codeOrder.get(a) || 0) - (codeOrder.get(b) || 0));

  const sortedCodes: string[] = [];
  while (queue.length > 0) {
    const code = queue.shift()!;
    sortedCodes.push(code);
    const nextCodes = adjacency.get(code) || [];
    nextCodes.forEach((nextCode) => {
      const nextValue = (indegree.get(nextCode) || 0) - 1;
      indegree.set(nextCode, nextValue);
      if (nextValue === 0) {
        queue.push(nextCode);
        queue.sort((a, b) => (codeOrder.get(a) || 0) - (codeOrder.get(b) || 0));
      }
    });
  }

  if (sortedCodes.length !== taskMap.size) {
    issues.push('Existe um ciclo ou dependencias impossiveis de resolver no cronograma.');
    taskMap.forEach((_task, code) => {
      if (!sortedCodes.includes(code)) sortedCodes.push(code);
    });
    sortedCodes.sort((a, b) => (codeOrder.get(a) || 0) - (codeOrder.get(b) || 0));
  }

  const longestPath = new Map<string, number>();
  const criticalParent = new Map<string, string | null>();
  sortedCodes.forEach((code) => {
    const task = taskMap.get(code);
    if (!task) return;
    const ownDuration = Math.max(1, task.durationDays);
    let bestScore = ownDuration;
    let bestParent: string | null = null;

    task.predecessors.forEach((predecessorCode) => {
      if (!taskMap.has(predecessorCode)) return;
      const predecessorScore = longestPath.get(predecessorCode) || 0;
      const candidateScore = predecessorScore + ownDuration;
      if (candidateScore > bestScore) {
        bestScore = candidateScore;
        bestParent = predecessorCode;
      }
    });

    longestPath.set(code, bestScore);
    criticalParent.set(code, bestParent);
  });

  const criticalEndCode = sortedCodes.reduce((bestCode, code) => {
    const currentScore = longestPath.get(code) || 0;
    const bestScore = bestCode ? (longestPath.get(bestCode) || 0) : 0;
    return currentScore > bestScore ? code : bestCode;
  }, '');

  const criticalChain = new Set<string>();
  let criticalCursor: string | null = criticalEndCode || null;
  while (criticalCursor) {
    criticalChain.add(criticalCursor);
    criticalCursor = criticalParent.get(criticalCursor) || null;
  }

  const orderedTasks = sortedCodes.map((code, index) => {
    const task = taskMap.get(code)!;
    const predecessorEnds = task.predecessors
      .map((predecessorCode) => taskMap.get(predecessorCode)?.end)
      .filter((date): date is Date => Boolean(date && !Number.isNaN(date.getTime())));
    const maxPredecessorEnd = predecessorEnds.length
      ? new Date(Math.max(...predecessorEnds.map((date) => date.getTime())))
      : null;
    const { start, end } = getTaskDisplayDates(task.row, maxPredecessorEnd);
    const finalEnd = end || (start ? addDays(start, Math.max(0, task.durationDays - 1)) : null);

    if (task.predecessors.length > 0 && maxPredecessorEnd && start && start.getTime() <= maxPredecessorEnd.getTime()) {
      task.issues.push('Dependencia possui conflito de datas com predecessora.');
    }
    if (task.predecessors.length > 0 && !maxPredecessorEnd) {
      task.issues.push('Dependencia sem datas suficientes para validação.');
    }

    const level = task.code.split('.').length - 1;

    return {
      ...task,
      level,
      start,
      end: finalEnd,
      critical: criticalChain.has(code),
      issues: Array.from(new Set(task.issues)),
      rowIndex: index,
    };
  });

  orderedTasks.forEach((task) => {
    if (!task.start || !task.end) return;
    task.predecessors.forEach((predecessorCode) => {
      const predecessor = taskMap.get(predecessorCode);
      if (!predecessor || !predecessor.end) return;
      if (task.start && predecessor.end && task.start.getTime() < addDays(predecessor.end, 1).getTime()) {
        task.issues.push(`A atividade inicia antes do termino de ${predecessorCode}.`);
      }
    });
  });

  const baseBounds = buildGanttTimelineBounds(orderedTasks);
  const bounds = getGanttScaleBounds(baseBounds, scaleMode);
  const unitCount = getGanttSpanUnits(
    {
      scaleMode,
      timelineStart: bounds.start,
      timelineEnd: bounds.end,
      unitPx: 0,
      unitCount: 0,
      labelStep: 0,
      tasks: [],
      issues: [],
    },
    bounds.start,
    bounds.end,
  );
  const timelineStart = bounds.start;
  const timelineEnd = bounds.end;
  const unitPx = getGanttScaleUnitPx(scaleMode, unitCount);
  const labelStep = getGanttScaleLabelStep(scaleMode, unitCount);

  if (!orderedTasks.some((task) => task.critical)) {
    issues.push('Nao foi possivel determinar um caminho critico com confianca plena.');
  }

  return {
    tasks: orderedTasks,
    issues: Array.from(new Set(issues.flatMap((item) => item ? [item] : []))),
    scaleMode,
    timelineStart,
    timelineEnd,
    unitPx,
    unitCount,
    labelStep,
  } satisfies GanttModel;
}

function getGanttBarGeometry(model: GanttModel, start: Date | null, end: Date | null) {
  if (!start || !end) return { left: 0, width: 0 };
  const left = Math.max(0, getGanttUnitIndex(model, start) * model.unitPx);
  const width = Math.max(1, getGanttSpanUnits(model, start, end) * model.unitPx);
  return { left, width };
}

function ProgressBar({ progress }: { progress: number }) {
  return (
    <div className="flex items-center gap-3">
      <div className="h-2.5 flex-1 min-w-[160px] rounded-full bg-[#EEF2F7] overflow-hidden">
        <div className="h-full rounded-full bg-[#F05D28] transition-all duration-300" style={{ width: `${progress}%` }} />
      </div>
      <span className="w-12 text-right text-[12px] font-bold text-[#2D2D2D]">{progress}%</span>
    </div>
  );
}

function BlueProgressBar({ progress }: { progress: number }) {
  return (
    <div className="flex items-center gap-3">
      <div className="h-2.5 flex-1 min-w-[160px] rounded-full bg-[#EAF2FF] overflow-hidden">
        <div className="h-full rounded-full bg-[#2563EB] transition-all duration-300" style={{ width: `${progress}%` }} />
      </div>
      <span className="w-12 text-right text-[12px] font-bold text-[#1D4ED8]">{progress}%</span>
    </div>
  );
}

interface PlanningReviewRow {
  id: string;
  itemCodigo: string;
  itemNome: string;
  contratoCodigo: string;
  contratoNome: string;
  osCodigo: string;
  osNome: string;
  disciplina: string;
  plannedStart: string;
  plannedEnd: string;
  technicalProgress: number;
  hasTechnicalActivity: boolean;
  activityStatus: string;
  approved: boolean;
  sourceActivityId: string;
  plannerApprovedAt: string;
  plannerApprovedBy: string;
}

function buildPlanningReviewRows(preloadedData?: CronogramaProps['preloadedData']) {
  const planningTodoRows = Array.isArray(preloadedData?.planningTodos) ? preloadedData.planningTodos : [];
  const planningReviews = planningTodoRows.filter((item: any) => {
    const recordType = normalizeKey(item?.recordType);
    const origin = normalizeKey(item?.origin);
    return recordType === 'planning-review' || origin === 'planning-review';
  });
  const activitiesList = Array.isArray(preloadedData?.registro?.activitiesList) ? preloadedData.registro.activitiesList : [];

  const planningReviewById = new Map(
    planningReviews.map((item: any) => {
      const id = normalizeKey(item?.id || item?.activityId || item?.sourceActivityId || item?.itemCodigo);
      return [id, item];
    }),
  );
  const planningReviewByCode = new Map(
    planningReviews.map((item: any) => {
      const code = normalizeKey(item?.itemCodigo || item?.atividadeCodigo || item?.sourceCode || item?.id);
      return [code, item];
    }),
  );
  const activityById = new Map(
    activitiesList.map((item: any) => {
      const id = normalizeKey(item?.activityId || item?.id);
      return [id, item];
    }),
  );
  const activityByCode = new Map(
    activitiesList.map((item: any) => {
      const code = normalizeKey(item?.itemCodigo || item?.atividadeCodigo || item?.sourceCode);
      return [code, item];
    }),
  );
  const activitySources = activitiesList.length > 0 ? activitiesList : planningReviews;

  return activitySources
    .map((source: any) => {
      const itemCodigo = normalizeText(source?.itemCodigo || source?.atividadeCodigo || source?.sourceCode || source?.id || source?.activityId);
      if (!itemCodigo) return null;

      const sourceId = normalizeKey(source?.activityId || source?.id || itemCodigo);
      const activity = activityById.get(sourceId)
        || activityByCode.get(normalizeKey(itemCodigo))
        || {};
      const planningReview = planningReviewById.get(sourceId)
        || planningReviewByCode.get(normalizeKey(itemCodigo))
        || {};
      const sourceActivityId = normalizeText(activity?.activityId || activity?.id || planningReview?.sourceActivityId || planningReview?.id || source?.activityId || source?.id || itemCodigo);
      const hasTechnicalActivity = Boolean(activity?.activityId || activity?.id || activity?.status);
      const activityStatus = normalizeText(activity?.status || planningReview?.status || source?.status || '').toLowerCase();
      const technicalProgress = toPercent(activity?.avancoAtual ?? activity?.progress ?? planningReview?.technicalProgress ?? planningReview?.progress ?? source?.progress ?? 0);
      const approved = Boolean(planningReview?.plannerApproved || planningReview?.approvedByPlanner || planningReview?.plannerOk || source?.plannerApproved || source?.approvedByPlanner || source?.plannerOk);
      const plannerApprovedAt = normalizeText(planningReview?.plannerApprovedAt || planningReview?.approvedAt || source?.plannerApprovedAt || '');
      const plannerApprovedBy = normalizeText(planningReview?.plannerApprovedBy || planningReview?.approvedBy || source?.plannerApprovedBy || '');

      return {
        id: normalizeText(activity?.activityId || activity?.id || planningReview?.id || itemCodigo),
        itemCodigo,
        itemNome: normalizeText(activity?.itemNome || activity?.descricao || planningReview?.itemNome || planningReview?.titulo || itemCodigo),
        contratoCodigo: normalizeText(activity?.contratoCodigo || planningReview?.contratoCodigo || ''),
        contratoNome: normalizeText(activity?.contratoNome || planningReview?.contratoNome || activity?.contratoCodigo || planningReview?.contratoCodigo || ''),
        osCodigo: normalizeText(activity?.osCodigo || planningReview?.osCodigo || ''),
        osNome: normalizeText(activity?.osNome || planningReview?.osNome || ''),
        disciplina: normalizeText(activity?.criadoPorDisciplina || activity?.disciplina || planningReview?.disciplina || ''),
        plannedStart: normalizeText(planningReview?.plannedStart || planningReview?.inicioPlanejado || activity?.plannedStart || activity?.inicioPlanejado || ''),
        plannedEnd: normalizeText(planningReview?.plannedEnd || planningReview?.terminoPlanejado || activity?.plannedEnd || activity?.terminoPlanejado || ''),
        technicalProgress,
        hasTechnicalActivity,
        activityStatus,
        approved,
        sourceActivityId,
        plannerApprovedAt,
        plannerApprovedBy,
      } as PlanningReviewRow;
    })
    .filter(Boolean) as PlanningReviewRow[];
}

function serializePlanningReviewRow(row: PlanningReviewRow) {
  const now = new Date().toISOString();
  return {
    id: row.id,
    itemCodigo: row.itemCodigo,
    itemNome: row.itemNome,
    titulo: row.itemNome,
    sourceCode: row.itemCodigo,
    sourceName: row.itemNome,
    sourceActivityId: row.sourceActivityId,
    contratoCodigo: row.contratoCodigo,
    contratoNome: row.contratoNome,
    osCodigo: row.osCodigo,
    osNome: row.osNome,
    disciplina: row.disciplina,
    plannedStart: row.plannedStart,
    plannedEnd: row.plannedEnd,
    progress: row.technicalProgress,
    technicalProgress: row.technicalProgress,
    note: '',
    lodLabel: '',
    plannerApproved: row.approved,
    plannerApprovedAt: row.approved ? (row.plannerApprovedAt || now) : '',
    plannerApprovedBy: row.approved ? row.plannerApprovedBy : '',
    plannerApprovedProgress: row.approved ? row.technicalProgress : 0,
    approvedByPlanner: row.approved,
    approvedAt: row.approved ? (row.plannerApprovedAt || now) : '',
    approvedBy: row.approved ? row.plannerApprovedBy : '',
    recordType: 'planning-review',
    updatedAt: now,
    origin: 'planning-review',
  };
}

interface TreeRowProps {
  key?: React.Key;
  node: TreeNode;
  level: number;
  expandedRows: Set<string>;
  onToggle: (code: string) => void;
}

function TreeRow({
  node,
  level,
  expandedRows,
  onToggle,
}: TreeRowProps) {
  const hasChildren = node.children.length > 0;
  const expanded = expandedRows.has(node.code);
  const progress = toPercent(node.row.progress);
  const predecessor = normalizeText(node.row.predecessor);

  return (
    <>
      <div className="border-b border-[#F3F4F6] last:border-b-0">
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.3fr)_minmax(260px,0.7fr)] gap-4 px-5 py-4">
          <div className="min-w-0">
            <button
              type="button"
              onClick={() => hasChildren && onToggle(node.code)}
              className={`flex w-full items-start gap-3 text-left ${hasChildren ? 'cursor-pointer' : 'cursor-default'}`}
              style={{ paddingLeft: `${level * 18}px` }}
            >
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center text-[#757575]">
                {hasChildren ? (expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />) : <span className="h-2 w-2 rounded-full bg-[#D1D5DB]" />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-bold text-[#2D2D2D]">
                  {node.code} - {node.name}
                </p>
                <p className="mt-1 text-[11px] text-[#757575]">
                  {formatDateBR(node.row.plannedStart)} a {formatDateBR(node.row.plannedEnd)}
                </p>
                {predecessor && (
                  <p className="mt-1 text-[10px] text-[#94A3B8]">
                    Predecessora: {predecessor}
                  </p>
                )}
              </div>
            </button>
          </div>

          <div className="flex flex-col justify-center gap-2">
            <ProgressBar progress={progress} />
          </div>
        </div>
      </div>

      {hasChildren && expanded && node.children.map((child) => (
        <React.Fragment key={child.code}>
          <TreeRow
            node={child}
            level={level + 1}
            expandedRows={expandedRows}
            onToggle={onToggle}
          />
        </React.Fragment>
      ))}
    </>
  );
}

export default function Cronograma({
  preloadedData,
  lockedContractCode,
  viewMode = 'default',
  currentUser,
  onPlannerApprovalSubmit,
}: CronogramaProps) {
  const isPlanningMode = viewMode === 'planning';
  const rows = useMemo(() => getCronogramaSourceRows(preloadedData), [preloadedData]);
  const planningRows = useMemo(
    () => (isPlanningMode ? buildPlanningReviewRows(preloadedData) : []),
    [isPlanningMode, preloadedData],
  );

  const contracts = useMemo(() => buildContractOptions(rows, preloadedData), [rows, preloadedData]);
  const osOptions = useMemo(() => buildOsOptions(rows, preloadedData), [rows, preloadedData]);

  const [contractFilter, setContractFilter] = useState('Todos');
  const [osFilter, setOsFilter] = useState('Todas');
  const [showInProgressActivities, setShowInProgressActivities] = useState(false);
  const [showGantt, setShowGantt] = useState(false);
  const [ganttScaleMode, setGanttScaleMode] = useState<GanttScaleMode>('day');
  const [approvalDrafts, setApprovalDrafts] = useState<Record<string, boolean>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [savingMessage, setSavingMessage] = useState('');

  useEffect(() => {
    const locked = normalizeText(lockedContractCode);
    if (!locked) return;
    setContractFilter(locked);
    setOsFilter('Todas');
  }, [lockedContractCode]);

  const tree = useMemo(
    () => buildTree(rows, contractFilter, osFilter),
    [rows, contractFilter, osFilter],
  );
  const ganttModel = useMemo(
    () => buildGanttModel(rows, tree, ganttScaleMode),
    [rows, tree, ganttScaleMode],
  );

  const expandedDefaults = useMemo(() => new Set(tree.map((node) => node.code)), [tree]);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [ganttExpandedRows, setGanttExpandedRows] = useState<Set<string>>(new Set());

  useEffect(() => {
    setExpandedRows(expandedDefaults);
  }, [expandedDefaults]);

  useEffect(() => {
    setGanttExpandedRows(expandedDefaults);
  }, [expandedDefaults]);

  const toggleRow = (code: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  };

  const dateSummary = useMemo(() => {
    const dates = rows
      .flatMap((row) => [parseDate(row.plannedStart), parseDate(row.plannedEnd)])
      .filter((date): date is Date => Boolean(date && !Number.isNaN(date.getTime())));

    if (!dates.length) return '-';

    const start = new Date(Math.min(...dates.map((date) => date.getTime())));
    const end = new Date(Math.max(...dates.map((date) => date.getTime())));
    return `${start.toLocaleDateString('pt-BR')} ate ${end.toLocaleDateString('pt-BR')}`;
  }, [rows]);

  const planningDateSummary = useMemo(() => {
    if (!isPlanningMode) return dateSummary;

    const dates = planningRows
      .flatMap((row) => [parseDate(row.plannedStart), parseDate(row.plannedEnd)])
      .filter((date): date is Date => Boolean(date && !Number.isNaN(date.getTime())));

    if (!dates.length) return dateSummary;

    const start = new Date(Math.min(...dates.map((date) => date.getTime())));
    const end = new Date(Math.max(...dates.map((date) => date.getTime())));
    return `${start.toLocaleDateString('pt-BR')} ate ${end.toLocaleDateString('pt-BR')}`;
  }, [dateSummary, isPlanningMode, planningRows]);

  const ganttVisibleRows = useMemo(() => flattenVisibleTreeNodes(tree, ganttExpandedRows), [tree, ganttExpandedRows]);
  const ganttTaskMap = useMemo(() => new Map(ganttModel.tasks.map((task) => [task.code, task])), [ganttModel.tasks]);
  const ganttVisibleTasks = useMemo(
    () => ganttVisibleRows
      .map(({ node, level }, index) => {
        const task = ganttTaskMap.get(node.code);
        if (!task) return null;
        return {
          ...task,
          rowIndex: index,
          level,
          hasChildren: node.children.length > 0,
        };
      })
      .filter((task): task is GanttTask & { hasChildren: boolean } => Boolean(task)),
    [ganttTaskMap, ganttVisibleRows],
  );
  const ganttVisibleIndexByCode = useMemo(() => {
    const indexMap = new Map<string, number>();
    ganttVisibleTasks.forEach((task, index) => indexMap.set(task.code, index));
    return indexMap;
  }, [ganttVisibleTasks]);

  const planningVisibleRows = useMemo(() => {
    if (!isPlanningMode || !showInProgressActivities) return [];

    return planningRows
      .filter((row) => {
        const contractMatch = contractFilter === 'Todos' || normalizeKey(row.contratoCodigo) === normalizeKey(contractFilter);
        const osMatch = osFilter === 'Todas' || normalizeKey(row.osCodigo) === normalizeKey(osFilter);
        const progressMatch = row.hasTechnicalActivity && row.activityStatus !== 'concluida';
        return contractMatch && osMatch && progressMatch;
      })
      .sort((a, b) => {
        const contractDiff = a.contratoCodigo.localeCompare(b.contratoCodigo, 'pt-BR');
        if (contractDiff !== 0) return contractDiff;
        const osDiff = a.osCodigo.localeCompare(b.osCodigo, 'pt-BR');
        if (osDiff !== 0) return osDiff;
        return a.itemCodigo.localeCompare(b.itemCodigo, 'pt-BR');
      });
  }, [contractFilter, isPlanningMode, osFilter, planningRows, showInProgressActivities]);

  const togglePlannerApproval = (row: PlanningReviewRow) => {
    setApprovalDrafts((prev) => {
      const current = prev[row.id] ?? row.approved;
      if (current) return prev;
      const nextState = { ...prev };
      nextState[row.id] = true;
      return nextState;
    });
    setSavingMessage('');
  };

  const handlePlannerSend = async () => {
    if (!isPlanningMode || !onPlannerApprovalSubmit) return;
    if (!isFirebaseConfigured()) {
      setSavingMessage('Firebase nao configurado para salvar o cronograma de aprovacao.');
      return;
    }

    const changedRows = planningRows
      .filter((row) => approvalDrafts[row.id] && !row.approved)
      .map((row) => ({
        ...row,
        approved: true,
      }));

    if (!changedRows.length) {
      setSavingMessage('Nenhuma aprovacao pendente para enviar.');
      return;
    }

    setIsSaving(true);
    setSavingMessage('');
    try {
      const approverName = normalizeText(currentUser?.nome || currentUser?.email || 'Planejamento');
      const approverLabel = approverName || 'Planejamento';
      for (const row of changedRows) {
        await setFirebaseDocument('planningTodos', row.id, serializePlanningReviewRow({
          ...row,
          plannerApprovedBy: row.approved ? approverLabel : '',
          plannerApprovedAt: row.approved ? new Date().toISOString() : '',
        }));
      }

      const approvedRows = changedRows.map((row) => ({
        id: row.id,
        itemCodigo: row.itemCodigo,
        itemNome: row.itemNome,
        progress: row.technicalProgress,
        approved: row.approved,
      }));

      if (approvedRows.length > 0) {
        await onPlannerApprovalSubmit(approvedRows);
      }

      setApprovalDrafts({});
      setSavingMessage('Aprovacoes enviadas com sucesso.');
    } catch (error) {
      console.error('Erro ao salvar o cronograma de aprovacao:', error);
      setSavingMessage('Nao foi possivel enviar as informacoes do cronograma.');
    } finally {
      setIsSaving(false);
    }
  };

  const renderGanttModal = () => {
    if (!showGantt) return null;

    const rowHeight = 76;
    const headerHeight = 72;
    const leftWidth = 460;
    const timelineWidth = Math.max(ganttModel.unitCount * ganttModel.unitPx, 720);
    const chartHeight = headerHeight + ganttVisibleTasks.length * rowHeight + 24;
    const todayLineX = Math.max(0, Math.min(timelineWidth, getGanttScaleTimelinePosition(ganttModel, startOfDay(new Date()))));

    return (
      <div className="fixed inset-0 z-[200] bg-slate-950/70 backdrop-blur-sm p-3 md:p-5">
        <div className="flex h-full w-full flex-col overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_30px_120px_rgba(15,23,42,0.35)]">
          <div className="flex flex-col gap-4 border-b border-slate-200 px-5 py-4 md:flex-row md:items-start md:justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-3">
                <Maximize2 size={20} className="text-[#F05D28]" />
                <div>
                  <h2 className="text-[18px] font-black text-[#1F2937]">Modo Gantt</h2>
                  <p className="text-[12px] text-[#64748B]">
                    Estrutura em cascata a esquerda, cronologia e dependencias a direita.
                  </p>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] font-bold uppercase tracking-[1px] text-[#64748B]">
                <span className="rounded-full bg-[#F8FAFC] px-3 py-1">{ganttVisibleTasks.length} tarefa(s)</span>
                <label className="inline-flex items-center gap-2 rounded-full bg-[#F8FAFC] px-3 py-1">
                  <span>Escala</span>
                  <select
                    value={ganttScaleMode}
                    onChange={(event) => setGanttScaleMode(event.target.value as GanttScaleMode)}
                    className="bg-transparent text-[11px] font-black uppercase tracking-[1px] text-[#334155] outline-none"
                  >
                    <option value="day">Dias</option>
                    <option value="week">Semanas</option>
                    <option value="month">Meses</option>
                    <option value="year">Anos</option>
                  </select>
                </label>
                {ganttModel.issues.length > 0 && (
                  <span className="rounded-full bg-amber-50 px-3 py-1 text-amber-700">{ganttModel.issues.length} inconsistencia(s)</span>
                )}
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="hidden rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-right md:block">
                <div className="text-[10px] font-black uppercase tracking-[1.2px] text-slate-400">Legenda</div>
                <div className="mt-1 text-[12px] text-slate-500">
                  Concluido, andamento, futuro, marco e critico
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowGantt(false)}
                className="inline-flex h-11 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-[13px] font-bold text-slate-600 transition-all hover:border-slate-300 hover:bg-slate-50"
              >
                <X size={18} />
                Fechar
              </button>
            </div>
          </div>

          {ganttModel.issues.length > 0 && (
            <div className="border-b border-amber-200 bg-amber-50 px-5 py-3">
              <div className="flex items-center gap-2 text-[12px] font-black uppercase tracking-[1px] text-amber-800">
                <AlertTriangle size={15} />
                Inconsistencias encontradas
              </div>
              <ul className="mt-2 space-y-1 text-[12px] text-amber-900">
                {ganttModel.issues.map((issue) => (
                  <li key={issue}>- {issue}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex min-h-0 flex-1 overflow-hidden">
            <div
              className="w-full min-w-0 border-slate-200 md:border-r"
              style={{ width: `${leftWidth}px`, minWidth: `${leftWidth}px` }}
            >
              <div className="flex h-full flex-col">
                <div className="grid grid-cols-[1.2fr_0.8fr] gap-2 border-b border-slate-200 bg-slate-50 px-4 py-3 text-[10px] font-black uppercase tracking-[1.1px] text-slate-500">
                  <span>Atividade</span>
                  <span className="text-right">Datas / Progresso</span>
                </div>
                <div className="min-h-0 flex-1 overflow-auto">
                  {ganttVisibleTasks.length === 0 ? (
                    <div className="p-6 text-[13px] text-slate-500">Nenhuma atividade disponivel para o Gantt.</div>
                  ) : (
                    ganttVisibleTasks.map((task) => {
                      const progress = toPercent(task.progress);
                      const statusClass = progress >= 100
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                        : progress > 0
                          ? 'border-sky-200 bg-sky-50 text-sky-700'
                          : 'border-slate-200 bg-slate-50 text-slate-600';
                      const issueCount = task.issues.length;
                      const expanded = ganttExpandedRows.has(task.code);
                      return (
                        <div
                          key={task.code}
                          className="grid grid-cols-[1.2fr_0.8fr] gap-2 border-b border-slate-100 px-4 py-3"
                          style={{ minHeight: `${rowHeight}px` }}
                        >
                          <div className="min-w-0">
                            <button
                              type="button"
                              onClick={() => {
                                if (!task.hasChildren) return;
                                setGanttExpandedRows((prev) => {
                                  const next = new Set(prev);
                                  if (next.has(task.code)) next.delete(task.code);
                                  else next.add(task.code);
                                  return next;
                                });
                              }}
                              className={`flex w-full items-start gap-2 text-left ${task.hasChildren ? 'cursor-pointer' : 'cursor-default'}`}
                              style={{ paddingLeft: `${task.level * 18}px` }}
                            >
                              <span className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center text-[#64748B]">
                                {task.hasChildren ? (
                                  expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />
                                ) : (
                                  <span
                                    className="h-2.5 w-2.5 rounded-full"
                                    style={{
                                      backgroundColor: task.critical
                                        ? '#DC2626'
                                        : progress >= 100
                                          ? '#10B981'
                                          : progress > 0
                                            ? '#2563EB'
                                            : '#94A3B8',
                                    }}
                                  />
                                )}
                              </span>
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-[13px] font-bold text-slate-800">
                                  {task.code} - {task.name}
                                </p>
                                <p className="mt-1 text-[11px] text-slate-500">
                                  {formatDateBR(task.row.plannedStart)} a {formatDateBR(task.row.plannedEnd)}
                                </p>
                                {task.predecessors.length > 0 && (
                                  <p className="mt-1 truncate text-[10px] text-slate-400">
                                    Predecessora(s): {task.predecessors.join(', ')}
                                  </p>
                                )}
                                {issueCount > 0 && (
                                  <p className="mt-1 truncate text-[10px] font-medium text-rose-600">
                                    {issueCount} alerta(s)
                                  </p>
                                )}
                              </div>
                            </button>
                          </div>
                          <div className="flex flex-col items-end justify-center gap-2 text-right">
                            <span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[1px] ${statusClass}`}>
                              {getGanttTaskStatusLabel(progress)}
                            </span>
                            <div className="w-full max-w-[160px]">
                              <ProgressBar progress={progress} />
                            </div>
                            <div className="text-[10px] font-medium text-slate-400">
                              {task.milestone ? 'Marco' : `${task.durationDays} dia(s)`}
                              {task.critical ? ' · Critica' : ''}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>

            <div className="min-w-0 flex-1 overflow-auto bg-white">
              <div
                className="relative"
                style={{
                  minWidth: `${timelineWidth}px`,
                  height: `${chartHeight}px`,
                  backgroundImage: `linear-gradient(to right, rgba(226,232,240,0.55) 1px, transparent 1px)`,
                  backgroundSize: `${ganttModel.unitPx}px 100%`,
                }}
              >
                <div className="sticky top-0 z-20 flex h-[72px] border-b border-slate-200 bg-white/95 backdrop-blur-sm">
                  {Array.from({ length: ganttModel.unitCount }).map((_, index) => (
                    <div
                      key={`${index}-${ganttModel.scaleMode}`}
                      className="flex h-full items-center justify-center border-r border-slate-200 px-2 text-center text-[10px] font-black uppercase tracking-[1px] text-slate-500"
                      style={{ width: `${ganttModel.unitPx}px` }}
                    >
                      {index % ganttModel.labelStep === 0 ? getGanttUnitLabel(ganttModel, index) : ''}
                    </div>
                  ))}
                </div>

                <div
                  className="pointer-events-none absolute left-0 top-0 z-30 h-full"
                  style={{ transform: `translateX(${todayLineX}px)` }}
                >
                  <div className="absolute left-0 top-0 h-full w-px bg-rose-500/80" />
                  <div className="absolute left-0 top-2 -translate-x-1/2 rounded-full bg-rose-500 px-2 py-0.5 text-[10px] font-black uppercase tracking-[1px] text-white shadow-sm">
                    Hoje
                  </div>
                </div>

                <svg
                  className="pointer-events-none absolute left-0 top-[72px] z-10"
                  width={timelineWidth}
                  height={chartHeight - 72}
                  viewBox={`0 0 ${timelineWidth} ${chartHeight - 72}`}
                >
                  {ganttVisibleTasks.flatMap((task) => {
                    if (!task.start || !task.end) return [];
                    return task.predecessors.flatMap((predecessorCode) => {
                      const predecessorIndex = ganttVisibleIndexByCode.get(predecessorCode);
                      if (predecessorIndex === undefined) return [];
                      const predecessor = ganttVisibleTasks[predecessorIndex];
                      if (!predecessor || !predecessor.start || !predecessor.end) return [];
                      const startGeometry = getGanttBarGeometry(ganttModel, predecessor.start, predecessor.end);
                      const endGeometry = getGanttBarGeometry(ganttModel, task.start, task.end);
                      const fromX = startGeometry.left + startGeometry.width;
                      const toX = endGeometry.left;
                      const fromY = predecessor.rowIndex * rowHeight + rowHeight / 2;
                      const toY = task.rowIndex * rowHeight + rowHeight / 2;
                      const bend = Math.max(12, Math.min(36, Math.abs(toY - fromY) / 2));
                      return (
                        <path
                          key={`${predecessorCode}-${task.code}`}
                          d={`M ${fromX} ${fromY} L ${fromX + bend} ${fromY} L ${fromX + bend} ${toY} L ${toX} ${toY}`}
                          stroke="#111827"
                          strokeWidth="1.15"
                          fill="none"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          opacity="0.75"
                        />
                      );
                    });
                  })}
                </svg>

                <div className="relative z-20">
                  {ganttVisibleTasks.map((task) => {
                    const progress = toPercent(task.progress);
                    const geometry = getGanttBarGeometry(ganttModel, task.start, task.end);
                    const top = 72 + task.rowIndex * rowHeight + 22;
                    const barHeight = 26;
                    const colorClass = task.critical
                      ? 'bg-rose-500'
                      : progress >= 100
                        ? 'bg-emerald-500'
                        : progress > 0
                          ? 'bg-sky-500'
                          : 'bg-slate-300';
                    const barWidth = geometry.width || ganttModel.unitPx * 0.55;
                    const barLeft = geometry.left;

                    return (
                      <div
                        key={task.code}
                        className="absolute left-0 right-0"
                        style={{ top: `${top}px`, height: `${barHeight}px` }}
                      >
                        <div
                          className={`absolute rounded-full shadow-sm ${colorClass} ${task.critical ? 'ring-2 ring-rose-200' : ''}`}
                          style={{
                            left: `${barLeft}px`,
                            width: `${Math.max(barWidth, task.milestone ? 16 : 18)}px`,
                            height: `${barHeight}px`,
                            opacity: task.start && task.end ? 0.96 : 0.45,
                          }}
                        >
                          <div
                            className="h-full rounded-full bg-white/25"
                            style={{ width: `${progress}%` }}
                          />
                        </div>

                        {task.milestone && (
                          <div
                            className={`absolute top-1/2 h-4 w-4 -translate-y-1/2 rotate-45 border ${task.critical ? 'border-rose-600 bg-rose-500' : progress >= 100 ? 'border-emerald-600 bg-emerald-500' : 'border-amber-500 bg-amber-400'}`}
                            style={{ left: `${barLeft}px` }}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          <div className="border-t border-slate-200 bg-slate-50 px-5 py-3">
            <div className="flex flex-wrap items-center gap-3 text-[12px] font-medium text-slate-600">
              <span className="inline-flex items-center gap-2"><span className="h-3 w-3 rounded-full bg-emerald-500" /> Concluida</span>
              <span className="inline-flex items-center gap-2"><span className="h-3 w-3 rounded-full bg-sky-500" /> Em andamento</span>
              <span className="inline-flex items-center gap-2"><span className="h-3 w-3 rounded-full bg-slate-300" /> Futura</span>
              <span className="inline-flex items-center gap-2"><span className="h-3 w-3 rotate-45 bg-amber-400" /> Marco</span>
              <span className="inline-flex items-center gap-2"><span className="h-3 w-3 rounded-full bg-rose-500" /> Critica</span>
              <span className="inline-flex items-center gap-2"><span className="h-px w-6 bg-black" /> Dependencia</span>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderStandardCronograma = (title: string, description: string, includePlanningToggle = false) => (
    <>
    <div className="w-full animate-in fade-in duration-500 space-y-6">
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <CalendarDays size={22} className="text-[#F05D28]" />
            <h1 className="text-[20px] font-bold text-[#2D2D2D]">{title}</h1>
          </div>
          <button
            type="button"
            onClick={() => setShowGantt(true)}
            className="inline-flex h-11 items-center gap-2 rounded-2xl border border-[#E5E7EB] bg-white px-4 text-[13px] font-bold text-[#2D2D2D] shadow-sm transition-all hover:border-[#F05D28]/30 hover:text-[#F05D28]"
          >
            <Maximize2 size={16} />
            Modo Gantt
          </button>
        </div>
        <p className="text-[13px] text-[#757575]">{description}</p>
      </div>

      <section className="bg-white border border-[#E5E7EB] rounded-2xl shadow-sm p-5">
        <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-4 items-end">
          <div>
            <label className="text-[11px] font-medium text-[#757575] uppercase tracking-[1px]">Contrato</label>
            <div className="relative mt-1.5">
              <select
                value={contractFilter}
                disabled={Boolean(normalizeText(lockedContractCode))}
                onChange={(event) => {
                  setContractFilter(event.target.value);
                  setOsFilter('Todas');
                }}
                className="w-full h-11 px-4 bg-white border border-[#E5E7EB] rounded-xl text-[14px] font-medium text-[#2D2D2D] appearance-none focus:border-[#F05D28] focus:ring-2 focus:ring-[#F05D28]/20 outline-none"
              >
                {!normalizeText(lockedContractCode) && <option value="Todos">Todos</option>}
                {contracts.map((contract) => (
                  <option key={contract.code} value={contract.code}>
                    {contract.code} - {contract.name}
                  </option>
                ))}
              </select>
              <ChevronDown size={18} className="absolute right-4 top-1/2 -translate-y-1/2 text-[#757575] pointer-events-none" />
            </div>
          </div>

          <div>
            <label className="text-[11px] font-medium text-[#757575] uppercase tracking-[1px]">OS</label>
            <div className="relative mt-1.5">
              <select
                value={osFilter}
                onChange={(event) => setOsFilter(event.target.value)}
                className="w-full h-11 px-4 bg-white border border-[#E5E7EB] rounded-xl text-[14px] font-medium text-[#2D2D2D] appearance-none focus:border-[#F05D28] focus:ring-2 focus:ring-[#F05D28]/20 outline-none"
              >
                <option value="Todas">Todas</option>
                {osOptions
                  .filter((os) => contractFilter === 'Todos' || os.contractCode === contractFilter)
                  .map((os) => (
                    <option key={os.code} value={os.code}>
                      {os.code} - {os.name}
                    </option>
                  ))}
              </select>
              <ChevronDown size={18} className="absolute right-4 top-1/2 -translate-y-1/2 text-[#757575] pointer-events-none" />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            {includePlanningToggle ? (
              <label className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[1px] text-[#757575]">
                <input
                  type="checkbox"
                  checked={showInProgressActivities}
                  onChange={(event) => setShowInProgressActivities(event.target.checked)}
                  className="h-4 w-4 rounded border-[#CBD5E1] text-[#F05D28] accent-[#F05D28]"
                />
                Modo atividades em andamento
              </label>
            ) : null}
            <div className="h-11 px-4 rounded-xl bg-[#F9FAFB] border border-[#E5E7EB] flex items-center gap-2 text-[13px] font-bold text-[#2D2D2D]">
              <Filter size={16} className="text-[#F05D28]" />
              {rows.length} item(ns)
            </div>
          </div>
        </div>
      </section>

      <section className="bg-white border border-[#E5E7EB] rounded-2xl shadow-sm overflow-hidden">
        <div className="flex items-center justify-between gap-4 border-b border-[#E5E7EB] bg-[#F9FAFB] px-5 py-3">
          <p className="text-[11px] font-bold uppercase tracking-[1px] text-[#757575]">Cronograma</p>
          <p className="text-[11px] font-bold uppercase tracking-[1px] text-[#757575]">{dateSummary}</p>
        </div>

        <div className="max-h-[680px] overflow-auto">
          {tree.length === 0 ? (
            <div className="p-8 text-[13px] text-[#757575]">Nenhuma atividade encontrada no recorte atual.</div>
          ) : (
            tree.map((node) => (
              <TreeRow
                key={node.code}
                node={node}
                level={0}
                expandedRows={expandedRows}
                onToggle={toggleRow}
              />
            ))
          )}
        </div>
      </section>
    </div>
    {renderGanttModal()}
    </>
  );

  if (isPlanningMode) {
    const pendingCount = Object.keys(approvalDrafts).length;
    const progressRowsCount = planningVisibleRows.length;

    if (!showInProgressActivities) {
      return renderStandardCronograma(
        'Cronograma de Planejamento',
        'Sem o modo atividades em andamento, o cronograma se comporta como os demais.',
        true,
      );
    }

    return (
      <>
      <div className="w-full animate-in fade-in duration-500 space-y-6">
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <CalendarDays size={22} className="text-[#F05D28]" />
              <h1 className="text-[20px] font-bold text-[#2D2D2D]">Cronograma de Planejamento</h1>
            </div>
            <button
              type="button"
              onClick={() => setShowGantt(true)}
              className="inline-flex h-11 items-center gap-2 rounded-2xl border border-[#E5E7EB] bg-white px-4 text-[13px] font-bold text-[#2D2D2D] shadow-sm transition-all hover:border-[#F05D28]/30 hover:text-[#F05D28]"
            >
              <Maximize2 size={16} />
              Modo Gantt
            </button>
          </div>
          <p className="text-[13px] text-[#757575]">
            As barras azuis mostram todas as atividades em andamento registradas pela Area Tecnica. Marque o check para aprovar a porcentagem e enviar a atualizacao.
          </p>
        </div>

        <section className="bg-white border border-[#E5E7EB] rounded-2xl shadow-sm p-5">
          <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-4 items-end">
            <div>
              <label className="text-[11px] font-medium text-[#757575] uppercase tracking-[1px]">Contrato</label>
              <div className="relative mt-1.5">
                <select
                  value={contractFilter}
                  disabled={Boolean(normalizeText(lockedContractCode))}
                  onChange={(event) => {
                    setContractFilter(event.target.value);
                    setOsFilter('Todas');
                  }}
                  className="w-full h-11 px-4 bg-white border border-[#E5E7EB] rounded-xl text-[14px] font-medium text-[#2D2D2D] appearance-none focus:border-[#F05D28] focus:ring-2 focus:ring-[#F05D28]/20 outline-none"
                >
                  {!normalizeText(lockedContractCode) && <option value="Todos">Todos</option>}
                  {contracts.map((contract) => (
                    <option key={contract.code} value={contract.code}>
                      {contract.code} - {contract.name}
                    </option>
                  ))}
                </select>
                <ChevronDown size={18} className="absolute right-4 top-1/2 -translate-y-1/2 text-[#757575] pointer-events-none" />
              </div>
            </div>

            <div>
              <label className="text-[11px] font-medium text-[#757575] uppercase tracking-[1px]">OS</label>
              <div className="relative mt-1.5">
                <select
                  value={osFilter}
                  onChange={(event) => setOsFilter(event.target.value)}
                  className="w-full h-11 px-4 bg-white border border-[#E5E7EB] rounded-xl text-[14px] font-medium text-[#2D2D2D] appearance-none focus:border-[#F05D28] focus:ring-2 focus:ring-[#F05D28]/20 outline-none"
                >
                  <option value="Todas">Todas</option>
                  {osOptions
                    .filter((os) => contractFilter === 'Todos' || os.contractCode === contractFilter)
                    .map((os) => (
                      <option key={os.code} value={os.code}>
                        {os.code} - {os.name}
                      </option>
                    ))}
                </select>
                <ChevronDown size={18} className="absolute right-4 top-1/2 -translate-y-1/2 text-[#757575] pointer-events-none" />
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <label className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[1px] text-[#757575]">
                <input
                  type="checkbox"
                  checked={showInProgressActivities}
                  onChange={(event) => setShowInProgressActivities(event.target.checked)}
                  className="h-4 w-4 rounded border-[#CBD5E1] text-[#F05D28] accent-[#F05D28]"
                />
                Modo atividades em andamento
              </label>
              <div className="h-11 px-4 rounded-xl bg-[#F9FAFB] border border-[#E5E7EB] flex items-center gap-2 text-[13px] font-bold text-[#2D2D2D]">
                <Filter size={16} className="text-[#F05D28]" />
                {progressRowsCount} item(ns)
              </div>
            </div>
          </div>
        </section>

        <section className="bg-white border border-[#E5E7EB] rounded-2xl shadow-sm overflow-hidden">
          <div className="flex items-center justify-between gap-4 border-b border-[#E5E7EB] bg-[#F9FAFB] px-5 py-3">
            <p className="text-[11px] font-bold uppercase tracking-[1px] text-[#757575]">Atividades em andamento</p>
            <p className="text-[11px] font-bold uppercase tracking-[1px] text-[#757575]">{planningDateSummary}</p>
          </div>

          <div className="max-h-[680px] overflow-auto divide-y divide-[#F3F4F6]">
            {planningVisibleRows.length === 0 ? (
              <div className="p-8 text-[13px] text-[#757575]">Nenhuma atividade em andamento no recorte atual.</div>
            ) : (
              planningVisibleRows.map((row) => {
                const approved = approvalDrafts[row.id] ?? row.approved;
                return (
                  <div key={row.id} className="grid grid-cols-1 gap-4 px-5 py-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(260px,0.75fr)_auto] lg:items-center">
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-bold text-[#2D2D2D]">
                        {row.itemCodigo} - {row.itemNome}
                      </p>
                      <p className="mt-1 text-[11px] text-[#757575]">
                        {row.contratoCodigo || 'Sem contrato'}{row.osCodigo ? ` · ${row.osCodigo}` : ''}{row.disciplina ? ` · ${row.disciplina}` : ''}
                      </p>
                      <div className="mt-3">
                        <BlueProgressBar progress={row.technicalProgress} />
                      </div>
                      <p className="mt-2 text-[11px] font-medium text-[#94A3B8]">
                        {approved ? 'Aprovado para atualizacao da EAP' : 'Aguardando aprovacao do Planejamento'}
                      </p>
                    </div>

                    <div className="rounded-2xl border border-[#E5E7EB] bg-[#F8FAFC] px-4 py-3">
                      <p className="text-[10px] font-black uppercase tracking-[0.8px] text-[#94A3B8]">Detalhes</p>
                      <div className="mt-2 grid grid-cols-2 gap-2 text-[12px] font-bold text-[#2D2D2D]">
                        <span>OS</span>
                        <span className="text-right text-[#64748B]">{row.osCodigo || '-'}</span>
                        <span>Disciplina</span>
                        <span className="text-right text-[#64748B]">{row.disciplina || '-'}</span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => togglePlannerApproval(row)}
                      disabled={approved}
                      className={`inline-flex h-12 items-center justify-center gap-2 rounded-2xl border px-4 text-[13px] font-bold transition-all ${
                        approved
                          ? 'cursor-default border-[#BBF7D0] bg-[#F0FDF4] text-[#166534]'
                          : 'border-[#E5E7EB] bg-white text-[#64748B] hover:border-[#CBD5E1]'
                      }`}
                    >
                      <span className="text-[16px]">{approved ? '✓' : '○'}</span>
                      {approved ? 'Aprovado' : 'Aprovar'}
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </section>

        {savingMessage && (
          <div className="rounded-2xl border border-[#E5E7EB] bg-white px-4 py-3 text-[13px] font-medium text-[#64748B] shadow-sm">
            {savingMessage}
          </div>
        )}

        {(Object.keys(approvalDrafts).length > 0 || pendingCount > 0) && (
          <div className="fixed bottom-6 right-6 z-[90] flex items-center gap-3 rounded-2xl border border-[#FED7AA] bg-white px-4 py-3 shadow-[0_18px_50px_rgba(240,93,40,0.18)]">
            <div>
              <div className="text-[11px] font-black uppercase tracking-[1px] text-[#C2410C]">Cronograma</div>
              <div className="text-[13px] font-semibold text-[#9A3412]">
                {Object.keys(approvalDrafts).length} aprovacao(oes) pronta(s) para envio
              </div>
            </div>
            <button
              type="button"
              onClick={() => void handlePlannerSend()}
              disabled={isSaving}
              className="inline-flex h-14 items-center justify-center gap-2 rounded-2xl bg-[#F05D28] px-6 font-bold text-white shadow-xl shadow-[#F05D28]/25 transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-70"
            >
              {isSaving ? 'Enviando...' : 'Enviar informacoes'}
            </button>
          </div>
        )}
      </div>
      {renderGanttModal()}
      </>
    );
  }

  return renderStandardCronograma(
    'Cronograma de Engenharia',
    'Visual em cascata com expansao por nivel. O cronograma agora mostra somente a hierarquia e as barras de progresso.',
  );
}
