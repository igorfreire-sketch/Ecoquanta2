import SearchableSelect from './SearchableSelect';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CalendarDays, ChevronDown, ChevronRight, Filter, Maximize2, X, AlertTriangle, Clock3, ListChecks } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { isFirebaseConfigured, setFirebaseDocument } from '../lib/firebaseDb';

export interface CronogramaRow {
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
  sourceLine?: number;
}

interface CronogramaProps {
  lockedContractCode?: string;
  loading?: boolean;
  loadError?: string;
  onRetry?: () => void;
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
  synthetic?: boolean; // true when the node was inferred to fill a hierarchy gap
}

type GanttScaleMode = 'day' | 'week' | 'month' | 'year';

interface GanttTask {
  code: string;
  name: string;
  row: CronogramaRow;
  level: number;
  rowIndex: number;
  predecessors: string[];
  dependencyCodes: string[];
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

function getTodayInSaoPaulo() {
  const now = new Date();
  const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
  return startOfDay(new Date(utc - (3 * 60 * 60000)));
}

function parsePredecessors(value?: string | string[]) {
  if (Array.isArray(value)) {
    return value
      .flatMap((item) => parsePredecessors(item))
      .map((item) => normalizeCode(item))
      .filter(Boolean);
  }

  return String(value || '')
    .split(/[,;|/\n\r]+/)
    .map((item) => normalizeCode(item))
    .filter(Boolean);
}

function incrementTrailingNumericCode(code: string) {
  const raw = normalizeCode(code);
  const match = raw.match(/^(.*?)(\d+)$/);
  if (!match) return '';

  const prefix = match[1] || '';
  const numeric = match[2] || '';
  const nextValue = Number(numeric) + 1;
  if (Number.isNaN(nextValue)) return '';

  const padded = String(nextValue).padStart(numeric.length, '0');
  return `${prefix}${padded}`;
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

  const code = normalizeCode(row.code || row.codigo || row.id || row.activityId || row.seq);
  const name = normalizeText(row.name || row.nome || row.title);
  if (!code || !name) return null;

  return {
    code,
    name,
    progress: Number(row.progress ?? row.avancoAtual ?? row.percentage ?? row.percentualConcluido ?? 0),
    duration: Number(row.duration ?? row.duracao ?? row.duracaoDias ?? 0),
    plannedStart: String(row.plannedStart || row.inicioPlanejado || row.dataInicio || '').trim(),
    plannedEnd: String(row.plannedEnd || row.terminoPlanejado || row.dataFim || '').trim(),
    predecessor: Array.isArray(row.predecessors)
      ? row.predecessors.join(' | ')
      : String(row.predecessor || row.predecessoras || row.predecessora || row.predecessorCode || '').trim(),
    idealProgress: Number(row.idealProgress ?? row.progressIdeal ?? 0),
    realStart: String(row.realStart || row.dataInicioReal || '').trim(),
    realEnd: String(row.realEnd || row.dataFimReal || '').trim(),
    baselineIdealProgress: Number(row.baselineIdealProgress ?? row.idealProgressBase ?? 0),
  };
}

export function getCronogramaSourceRows(preloadedData?: CronogramaProps['preloadedData']) {
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
  const deduped = normalized.filter((row) => {
    const key = normalizeCode(row.code);
    if (!key) return false;
    const signature = `${key}::${normalizeText(row.name)}`;
    if (seen.has(signature)) return false;
    seen.add(signature);
    return true;
  });

  deduped.forEach((row, index) => {
    row.sourceLine = index + 2;
  });

  return deduped;
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

export function buildContractOptions(rows: CronogramaRow[], preloadedData?: CronogramaProps['preloadedData']) {
  const fromRegistro = Array.isArray(preloadedData?.registro?.contracts) ? preloadedData.registro.contracts : [];
  if (fromRegistro.length) return fromRegistro.map((item) => ({ code: item.codigo, name: item.nome }));

  return rows
    .filter((row) => dotCount(normalizeText(row.code)) === 0)
    .map((row) => ({ code: normalizeText(row.code), name: normalizeText(row.name || row.code) }))
    .filter((item) => item.code);
}

export function buildOsOptions(rows: CronogramaRow[], preloadedData?: CronogramaProps['preloadedData']) {
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

  // Fill hierarchy gaps: for every code whose direct parent is missing from the
  // selected set, synthesize phantom nodes for each missing intermediate so the
  // tree structure is always correct (e.g. 2.20.1 gets a real 2.20 parent).
  const allSet = new Set(selectedCodes);
  const syntheticCodes = new Set<string>();

  selectedCodes.forEach((code) => {
    let parent = getParentCode(code);
    while (parent) {
      if (allSet.has(parent)) break; // chain complete
      syntheticCodes.add(parent);
      allSet.add(parent);
      parent = getParentCode(parent);
    }
  });

  const allCodes = [...selectedCodes, ...Array.from(syntheticCodes)];

  const childrenMap = new Map<string, string[]>();
  allCodes.forEach((code) => {
    const parent = getParentCode(code);
    if (!parent || !allSet.has(parent)) return;
    const bucket = childrenMap.get(parent) || [];
    bucket.push(code);
    childrenMap.set(parent, bucket);
  });

  childrenMap.forEach((children, parentCode) => {
    children.sort(compareHierarchy);
    childrenMap.set(parentCode, children);
  });

  const buildNode = (code: string): TreeNode => {
    const isSynthetic = syntheticCodes.has(code);
    const row = rowMap.get(code) ?? { code, name: code };
    const childCodes = childrenMap.get(code) || [];
    return {
      code,
      name: normalizeText(row.name || row.code || code),
      row,
      children: childCodes.map(buildNode),
      synthetic: isSynthetic,
    };
  };

  const rootCodes = allCodes
    .filter((code) => {
      const parent = getParentCode(code);
      return !parent || !allSet.has(parent);
    })
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
  const today = getTodayInSaoPaulo();
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
  return unitCount > 240 ? 24 : unitCount > 120 ? 26 : 30;
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
    const fraction = Math.max(0, Math.min(1, (diffDays(weekStart, date) + 0.5) / 7));
    return unitIndex * model.unitPx + fraction * model.unitPx;
  }

  if (model.scaleMode === 'month') {
    const daysInMonth = endOfMonth(date).getDate();
    const fraction = Math.max(0, Math.min(1, (startOfDay(date).getDate() - 0.5) / Math.max(1, daysInMonth)));
    return unitIndex * model.unitPx + fraction * model.unitPx;
  }

  const yearStart = startOfYear(date);
  const isLeapYear = new Date(yearStart.getFullYear(), 1, 29).getMonth() === 1;
  const daysInYear = isLeapYear ? 366 : 365;
  const fraction = Math.max(0, Math.min(1, (diffDays(yearStart, date) + 0.5) / Math.max(1, daysInYear)));
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

  const lineCodeMap = new Map<number, string>();
  rowMap.forEach((row, code) => {
    if (typeof row.sourceLine === 'number' && Number.isFinite(row.sourceLine)) {
      lineCodeMap.set(row.sourceLine, code);
    }
  });

  const resolvePredecessorCodes = (tokens: string[]) => {
    const resolved: string[] = [];

    tokens.forEach((token) => {
      const direct = normalizeCode(token);
      if (!direct) return;
      if (rowMap.has(direct)) {
        resolved.push(direct);
        return;
      }

      if (/^\d+$/.test(direct)) {
        const sourceLine = Number(direct) + 2;
        const mappedCode = lineCodeMap.get(sourceLine);
        if (mappedCode) {
          resolved.push(mappedCode);
        }
      }
    });

    return Array.from(new Set(resolved));
  };

  const tasksBase = Array.from(rowMap.entries()).map(([code, row]) => {
    const predecessors = parsePredecessors(row.predecessor);
    const resolvedPredecessors = resolvePredecessorCodes(predecessors);
    const inferredPredecessor = incrementTrailingNumericCode(code);
    const dependencyCodes = resolvedPredecessors.length > 0
      ? resolvedPredecessors
      : inferredPredecessor && rowMap.has(inferredPredecessor)
        ? [inferredPredecessor]
        : [];
    const start = parseDate(row.plannedStart) || parseDate(row.realStart);
    const end = parseDate(row.plannedEnd) || parseDate(row.realEnd);
    const durationDays = estimateDurationDays(row, start, end);
    const milestone = durationDays <= 1 || sameDay(start || end || new Date(), end || start || new Date());
    return {
      code,
      name: normalizeText(row.name || row.code),
      row,
      predecessors,
      dependencyCodes,
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

    const validationPredecessors = task.dependencyCodes.length > 0 ? task.dependencyCodes : task.predecessors;
    validationPredecessors.forEach((predecessorCode) => {
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
    const dependencyList = task.dependencyCodes.length > 0 ? task.dependencyCodes : task.predecessors;
    dependencyList.forEach((predecessorCode) => {
      if (!taskMap.has(predecessorCode)) return;
      indegree.set(code, (indegree.get(code) || 0) + 1);
      adjacency.get(predecessorCode)?.push(code);
    });
  });

  // Binary-insert into sorted queue to keep O(n log n) instead of O(n² log n)
  const insertSorted = (arr: string[], code: string) => {
    const order = codeOrder.get(code) ?? 0;
    let lo = 0;
    let hi = arr.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if ((codeOrder.get(arr[mid]) ?? 0) <= order) lo = mid + 1;
      else hi = mid;
    }
    arr.splice(lo, 0, code);
  };

  const queue = Array.from(indegree.entries())
    .filter(([, value]) => value === 0)
    .map(([code]) => code)
    .sort((a, b) => (codeOrder.get(a) ?? 0) - (codeOrder.get(b) ?? 0));

  const sortedCodes: string[] = [];
  while (queue.length > 0) {
    const code = queue.shift()!;
    sortedCodes.push(code);
    const nextCodes = adjacency.get(code) || [];
    nextCodes.forEach((nextCode) => {
      const nextValue = (indegree.get(nextCode) || 0) - 1;
      indegree.set(nextCode, nextValue);
      if (nextValue === 0) insertSorted(queue, nextCode);
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
    const predecessorEnds = task.dependencyCodes
      .map((predecessorCode) => taskMap.get(predecessorCode)?.end)
      .filter((date): date is Date => Boolean(date && !Number.isNaN(date.getTime())));
    const maxPredecessorEnd = predecessorEnds.length
      ? new Date(Math.max(...predecessorEnds.map((date) => date.getTime())))
      : null;
    const { start, end } = getTaskDisplayDates(task.row, maxPredecessorEnd);
    const finalEnd = end || (start ? addDays(start, Math.max(0, task.durationDays - 1)) : null);

    if (task.dependencyCodes.length > 0 && maxPredecessorEnd && start && start.getTime() <= maxPredecessorEnd.getTime()) {
      task.issues.push('Dependencia possui conflito de datas com predecessora.');
    }
    if (task.dependencyCodes.length > 0 && !maxPredecessorEnd) {
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
    const dependencyList = task.dependencyCodes.length > 0 ? task.dependencyCodes : task.predecessors;
    dependencyList.forEach((predecessorCode) => {
      const predecessor = taskMap.get(predecessorCode);
      if (!predecessor || !predecessor.end) return;
      if (task.start && predecessor.end && task.start.getTime() < addDays(predecessor.end, 1).getTime()) {
        task.issues.push(`A atividade inicia antes do termino de ${predecessorCode}.`);
      }
    });
  });

  const baseBounds = buildGanttTimelineBounds(orderedTasks);
  const bounds = getGanttScaleBounds(baseBounds, scaleMode);
  const rawUnitCount = getGanttSpanUnits(
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
  // ponytail: so um teto ANTI-FREEZE contra data patologica (typo de ano -> centenas de
  // milhares de unidades trava o Array.from de cada render). 20000 nunca corta um cronograma
  // real (20000 dias ~ 54 anos), so barra o lixo. Um teto baixo (3000) truncava cronogramas
  // grandes legitimos e quebrava o Gantt — por isso e alto de proposito.
  const MAX_GANTT_UNITS = 20000;
  const unitCount = Number.isFinite(rawUnitCount) ? Math.min(Math.max(1, rawUnitCount), MAX_GANTT_UNITS) : 1;
  if (rawUnitCount > MAX_GANTT_UNITS) {
    issues.push('Intervalo de datas do cronograma é grande demais para exibir por completo; verifique datas incorretas.');
  }
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

  // Synthetic nodes are phantom grouping nodes inferred to fill hierarchy gaps.
  // They have no real data, so render them as a minimal collapsible header.
  if (node.synthetic) {
    return (
      <>
        <div>
          <div className="px-5 py-2.5">
            <button
              type="button"
              onClick={() => hasChildren && onToggle(node.code)}
              className={`flex w-full items-center gap-2 text-left ${hasChildren ? 'cursor-pointer' : 'cursor-default'}`}
              style={{ paddingLeft: `${level * 18}px` }}
            >
              <span className="flex h-5 w-5 shrink-0 items-center justify-center text-[#9CA3AF]">
                {hasChildren ? (expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />) : <span className="h-1.5 w-1.5 rounded-full bg-[#D1D5DB]" />}
              </span>
              <p className="text-[12px] font-semibold italic text-[#9CA3AF]">
                {node.code}
              </p>
            </button>
          </div>
        </div>
        {hasChildren && expanded && node.children.map((child) => (
          <React.Fragment key={child.code}>
            <TreeRow node={child} level={level + 1} expandedRows={expandedRows} onToggle={onToggle} />
          </React.Fragment>
        ))}
      </>
    );
  }

  return (
    <>
      <div>
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
                <p className="truncate text-[#2D2D2D] text-[13px] font-bold">
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
  loading = false,
  loadError,
  onRetry,
  viewMode = 'default',
  currentUser,
  onPlannerApprovalSubmit,
}: CronogramaProps) {
  const isPlanningMode = viewMode === 'planning';
  const ganttLeftScrollRef = useRef<HTMLDivElement | null>(null);
  const ganttRightScrollRef = useRef<HTMLDivElement | null>(null);
  const ganttScrollLockRef = useRef<'left' | 'right' | null>(null);
  const rows = useMemo(() => getCronogramaSourceRows(preloadedData), [preloadedData]);
  const planningRows = useMemo(
    () => (isPlanningMode ? buildPlanningReviewRows(preloadedData) : []),
    [isPlanningMode, preloadedData],
  );

  const contracts = useMemo(() => buildContractOptions(rows, preloadedData), [rows, preloadedData]);
  const osOptions = useMemo(() => buildOsOptions(rows, preloadedData), [rows, preloadedData]);

  const [contractFilter, setContractFilter] = useState(() => normalizeText(lockedContractCode) || 'Todos');
  const [osFilter, setOsFilter] = useState('Todas');
  const [showInProgressActivities, setShowInProgressActivities] = useState(false);
  const [showGantt, setShowGantt] = useState(false);
  const [ganttScaleMode, setGanttScaleMode] = useState<GanttScaleMode>('day');
  const [approvalDrafts, setApprovalDrafts] = useState<Record<string, boolean>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [savingMessage, setSavingMessage] = useState('');
  const [selectedGanttTaskCode, setSelectedGanttTaskCode] = useState<string | null>(null);

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

  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [ganttExpandedRows, setGanttExpandedRows] = useState<Set<string>>(new Set());

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
  const ganttVisibleTasks = useMemo(() => {
    let rowIndex = 0;
    return ganttVisibleRows
      .map(({ node, level }) => {
        const task = ganttTaskMap.get(node.code);
        if (!task) return null; // synthetic nodes have no Gantt task — skip
        return {
          ...task,
          rowIndex: rowIndex++, // compact: no gaps where synthetics were
          level,
          hasChildren: node.children.length > 0,
        };
      })
      .filter((task): task is GanttTask & { hasChildren: boolean } => Boolean(task));
  }, [ganttTaskMap, ganttVisibleRows]);
  const ganttVisibleIndexByCode = useMemo(() => {
    const indexMap = new Map<string, number>();
    ganttVisibleTasks.forEach((task, index) => indexMap.set(task.code, index));
    return indexMap;
  }, [ganttVisibleTasks]);
  const selectedGanttTask = useMemo(
    () => ganttVisibleTasks.find((task) => task.code === selectedGanttTaskCode) || null,
    [ganttVisibleTasks, selectedGanttTaskCode],
  );

  const GANTT_ROW_HEIGHT = 96;
  const GANTT_HEADER_HEIGHT = 72;
  const ganttTimelineWidth = useMemo(
    () => Math.max(ganttModel.unitCount * ganttModel.unitPx, 720),
    [ganttModel.unitCount, ganttModel.unitPx],
  );
  const ganttChartHeight = useMemo(
    () => GANTT_HEADER_HEIGHT + ganttVisibleTasks.length * GANTT_ROW_HEIGHT + 24,
    [ganttVisibleTasks.length],
  );
  const ganttToday = useMemo(() => getTodayInSaoPaulo(), []);
  const ganttTodayLineX = useMemo(
    () => Math.max(0, Math.min(ganttTimelineWidth, getGanttScaleTimelinePosition(ganttModel, ganttToday))),
    [ganttModel, ganttTimelineWidth, ganttToday],
  );
  const ganttDayMonthGroups = useMemo(() => {
    if (ganttModel.scaleMode !== 'day') return [];
    return Array.from({ length: ganttModel.unitCount }).reduce<Array<{ key: string; label: string; count: number }>>((groups, _, index) => {
      const date = getGanttUnitDate(ganttModel, index);
      const key = `${date.getFullYear()}-${date.getMonth()}`;
      const current = groups[groups.length - 1];
      if (current?.key === key) {
        current.count += 1;
      } else {
        groups.push({ key, label: date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }), count: 1 });
      }
      return groups;
    }, []);
  }, [ganttModel]);

  // Pre-compute all day-header cell data so the render loop is cheap
  const ganttDayCells = useMemo(() => {
    if (ganttModel.scaleMode !== 'day') return [];
    return Array.from({ length: ganttModel.unitCount }, (_, index) => {
      const date = getGanttUnitDate(ganttModel, index);
      return {
        index,
        date,
        isToday: sameDay(date, ganttToday),
        isWeekend: date.getDay() === 0 || date.getDay() === 6,
        dayStr: String(date.getDate()).padStart(2, '0'),
        weekdayStr: date.toLocaleDateString('pt-BR', { weekday: 'narrow' }),
        titleStr: date.toLocaleDateString('pt-BR'),
      };
    });
  }, [ganttModel, ganttToday]);

  // Pre-compute bar geometries so they aren't recalculated during render
  const ganttBarGeometries = useMemo(
    () => new Map(ganttVisibleTasks.map((task) => [task.code, getGanttBarGeometry(ganttModel, task.start, task.end)])),
    [ganttModel, ganttVisibleTasks],
  );

  const syncGanttScroll = useCallback(
    (source: 'left' | 'right') => (event: React.UIEvent<HTMLDivElement>) => {
      const otherRef = source === 'left' ? ganttRightScrollRef : ganttLeftScrollRef;
      const other = otherRef.current;
      if (!other || ganttScrollLockRef.current === source) return;
      ganttScrollLockRef.current = source;
      other.scrollTop = event.currentTarget.scrollTop;
      window.requestAnimationFrame(() => {
        if (ganttScrollLockRef.current === source) ganttScrollLockRef.current = null;
      });
    },
    [],
  );

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
    // Always render — keeps DOM nodes alive for instant open.
    // CSS hides and blocks interaction when !showGantt.
    const rowHeight = GANTT_ROW_HEIGHT;
    const headerHeight = GANTT_HEADER_HEIGHT;
    const leftWidth = 460;
    const timelineWidth = ganttTimelineWidth;
    const chartHeight = ganttChartHeight;
    const todayLineX = ganttTodayLineX;

    // Portal pro body: fora do stacking context do <main> (relative z-10), senao o rail (z-40)
    // apareceria por cima do modo Gantt. No body o z-[200] vale de verdade.
    return createPortal(
      <>
      <div
        className="fixed inset-0 z-[200] bg-slate-950/70 backdrop-blur-sm"
        style={showGantt ? undefined : { visibility: 'hidden', pointerEvents: 'none' }}
      >
        <div className="flex h-full w-full flex-col overflow-hidden bg-white">
          <div className="flex items-center justify-between gap-4 px-5 py-2.5">
            <div className="flex items-center gap-3">
              <Maximize2 size={16} className="text-[#F05D28]" />
              <h2 className="text-[15px] font-black text-[#1F2937]">Modo Gantt</h2>
              <span className="text-[11px] text-slate-400">{ganttVisibleTasks.length} tarefa(s)</span>
              <label className="inline-flex items-center gap-1.5 rounded-full bg-slate-50 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.8px] text-slate-600 shadow-[0_10px_30px_-22px_rgba(15,23,42,0.45)]">
                <span>Escala</span>
                <SearchableSelect
                  value={ganttScaleMode}
                  onChange={(event) => setGanttScaleMode(event.target.value as GanttScaleMode)}
                  className="h-7 min-w-[100px] rounded-md bg-transparent px-2 text-[11px] font-black uppercase tracking-[0.8px] text-[#334155] outline-none hover:bg-slate-100"
                >
                  <option value="day">Dias</option>
                  <option value="week">Semanas</option>
                  <option value="month">Meses</option>
                  <option value="year">Anos</option>
                </SearchableSelect>
              </label>
              <label className="inline-flex items-center gap-1.5 rounded-full bg-slate-50 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.8px] text-slate-600 shadow-[0_10px_30px_-22px_rgba(15,23,42,0.45)]">
                <span>Contrato</span>
                <SearchableSelect
                  value={contractFilter}
                  disabled={Boolean(normalizeText(lockedContractCode))}
                  onChange={(event) => { setContractFilter(event.target.value); setOsFilter('Todas'); }}
                  searchPlaceholder="Pesquisar contrato..."
                  className="h-7 min-w-[140px] rounded-md bg-transparent px-2 text-[11px] font-black uppercase tracking-[0.8px] text-[#334155] outline-none hover:bg-slate-100"
                >
                  {!normalizeText(lockedContractCode) && <option value="Todos">Todos</option>}
                  {contracts.map((contract) => (
                    <option key={contract.code} value={contract.code}>{contract.name || contract.code}</option>
                  ))}
                </SearchableSelect>
              </label>
              <label className="inline-flex items-center gap-1.5 rounded-full bg-slate-50 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.8px] text-slate-600 shadow-[0_10px_30px_-22px_rgba(15,23,42,0.45)]">
                <span>OS</span>
                <SearchableSelect
                  value={osFilter}
                  onChange={(event) => setOsFilter(event.target.value)}
                  searchPlaceholder="Pesquisar OS..."
                  className="h-7 min-w-[140px] rounded-md bg-transparent px-2 text-[11px] font-black uppercase tracking-[0.8px] text-[#334155] outline-none hover:bg-slate-100"
                >
                  <option value="Todas">Todas</option>
                  {osOptions
                    .filter((os) => contractFilter === 'Todos' || os.contractCode === contractFilter)
                    .map((os) => (
                      <option key={os.code} value={os.code}>{os.name || os.code}</option>
                    ))}
                </SearchableSelect>
              </label>
            </div>
            <button
              type="button"
              onClick={() => {
                setSelectedGanttTaskCode(null);
                setShowGantt(false);
              }}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-white px-3 text-[12px] font-bold text-slate-600 shadow-[0_10px_30px_-22px_rgba(15,23,42,0.45)] transition-all hover:text-[#F05D28]"
            >
              <X size={14} />
              Fechar
            </button>
          </div>

          <div className="flex min-h-0 flex-1 overflow-hidden">
            <div
              className="w-full min-w-0"
              style={{ width: `${leftWidth}px`, minWidth: `${leftWidth}px` }}
            >
              <div className="flex h-full flex-col">
                <div className="grid grid-cols-[1.2fr_0.8fr] gap-2 px-4 text-[10px] font-black uppercase tracking-[1.1px] text-slate-500" style={{ height: `${headerHeight}px`, display: 'flex', alignItems: 'center' }}>
                  <span className="flex-1">Atividade</span>
                  <span className="text-right" style={{ width: '120px' }}>Datas / Progresso</span>
                </div>
                <div
                  ref={ganttLeftScrollRef}
                  className="min-h-0 flex-1 overflow-auto"
                  onScroll={syncGanttScroll('left')}
                >
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
                          className="grid grid-cols-[1.2fr_0.8fr] items-center gap-2 px-4 overflow-hidden"
                          style={{ height: `${rowHeight}px` }}
                          onClick={() => setSelectedGanttTaskCode(task.code)}
                        >
                          <div className="min-w-0 py-2">
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
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
                                {(task.dependencyCodes.length > 0 || task.predecessors.length > 0) && (
                                  <p className="mt-1 truncate text-[10px] text-slate-400">
                                    Predecessora(s): {(task.dependencyCodes.length > 0 ? task.dependencyCodes : task.predecessors).join(', ')}
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
                            <button
                              type="button"
                              className="w-full max-w-[160px] cursor-pointer"
                              onClick={(event) => {
                                event.stopPropagation();
                                setSelectedGanttTaskCode(task.code);
                              }}
                            >
                              <ProgressBar progress={progress} />
                            </button>
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

            <div className="relative min-w-0 flex-1">
              <div
                ref={ganttRightScrollRef}
                className="min-w-0 h-full overflow-auto bg-white"
                onScroll={syncGanttScroll('right')}
              >
              <div
                className="relative"
                style={{
                  minWidth: `${timelineWidth}px`,
                  height: `${chartHeight}px`,
                  backgroundImage: `linear-gradient(to right, rgba(226,232,240,0.55) 1px, transparent 1px)`,
                  backgroundSize: `${ganttModel.unitPx}px 100%`,
                }}
              >
                <div
                  className="pointer-events-none absolute bottom-0 top-[72px] z-30"
                  style={{ left: `${todayLineX}px` }}
                >
                  <div className="absolute left-0 top-0 h-full w-px bg-rose-500/80" />
                  <div className="absolute left-0 top-2 -translate-x-1/2 rounded-full bg-rose-500 px-2 py-0.5 text-[10px] font-black uppercase tracking-[1px] text-white shadow-sm">
                    Hoje
                  </div>
                </div>

                <div className="sticky top-0 z-20 h-[72px] bg-white/95 backdrop-blur-sm">
                  {ganttModel.scaleMode === 'day' ? (
                    <div className="h-full">
                      <div className="flex h-8 bg-slate-50">
                        {ganttDayMonthGroups.map((group) => (
                          <div
                            key={group.key}
                            className="flex shrink-0 items-center border-r border-[#F1F5F9] px-2 text-[10px] font-black uppercase tracking-[1px] text-slate-600"
                            style={{ width: `${group.count * ganttModel.unitPx}px` }}
                          >
                            {group.label}
                          </div>
                        ))}
                      </div>
                      <div className="flex h-10">
                        {ganttDayCells.map((cell) => (
                          <div
                            key={`${cell.index}-${ganttModel.scaleMode}`}
                            className={`flex shrink-0 flex-col items-center justify-center border-r border-[#F1F5F9] text-center ${
                              cell.isToday
                                ? 'bg-rose-50 text-rose-600'
                                : cell.isWeekend
                                  ? 'bg-slate-50 text-slate-400'
                                  : 'text-slate-600'
                            }`}
                            style={{ width: `${ganttModel.unitPx}px` }}
                            title={cell.titleStr}
                          >
                            <span className="text-[11px] font-black leading-none">{cell.dayStr}</span>
                            <span className="mt-1 text-[8px] font-bold uppercase leading-none">{cell.weekdayStr}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="flex h-full">
                      {Array.from({ length: ganttModel.unitCount }).map((_, index) => (
                        <div
                          key={`${index}-${ganttModel.scaleMode}`}
                          className="flex h-full shrink-0 items-center justify-center border-r border-[#F1F5F9] px-2 text-center text-[10px] font-black uppercase tracking-[1px] text-slate-500"
                          style={{ width: `${ganttModel.unitPx}px` }}
                        >
                          {index % ganttModel.labelStep === 0 ? getGanttUnitLabel(ganttModel, index) : ''}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <svg
                  className="pointer-events-none absolute left-0 top-[72px] z-10"
                  width={timelineWidth}
                  height={chartHeight - 72}
                  viewBox={`0 0 ${timelineWidth} ${chartHeight - 72}`}
                >
                  {ganttVisibleTasks.flatMap((task) => {
                    if (!task.start || !task.end) return [];
                    return task.dependencyCodes.flatMap((predecessorCode) => {
                      const predecessorIndex = ganttVisibleIndexByCode.get(predecessorCode);
                      if (predecessorIndex === undefined) return [];
                      const predecessor = ganttVisibleTasks[predecessorIndex];
                      if (!predecessor || !predecessor.start || !predecessor.end) return [];
                      const startGeometry = ganttBarGeometries.get(predecessor.code) ?? getGanttBarGeometry(ganttModel, predecessor.start, predecessor.end);
                      const endGeometry = ganttBarGeometries.get(task.code) ?? getGanttBarGeometry(ganttModel, task.start, task.end);
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
                    const geometry = ganttBarGeometries.get(task.code) ?? getGanttBarGeometry(ganttModel, task.start, task.end);
                    const barHeight = 26;
                    const top = task.rowIndex * rowHeight + Math.floor((rowHeight - barHeight) / 2);
                    const barTone = task.critical
                      ? '#F43F5E'
                      : progress >= 100
                        ? '#10B981'
                        : progress > 0
                          ? '#0EA5E9'
                          : '#CBD5E1';
                    const tailTone = task.critical
                      ? 'rgba(244, 63, 94, 0.30)'
                      : progress >= 100
                        ? 'rgba(16, 185, 129, 0.30)'
                        : progress > 0
                          ? 'rgba(14, 165, 233, 0.30)'
                          : 'rgba(148, 163, 184, 0.30)';
                    const barWidth = geometry.width || ganttModel.unitPx * 0.55;
                    const barLeft = geometry.left;

                    return (
                      <div
                        key={task.code}
                        className="absolute left-0 right-0"
                        style={{ top: `${top}px`, height: `${barHeight}px` }}
                      >
                        <div
                          className={`absolute overflow-hidden rounded-full shadow-sm ${task.critical ? 'ring-2 ring-rose-200' : ''}`}
                          style={{
                            left: `${barLeft}px`,
                            width: `${Math.max(barWidth, task.milestone ? 16 : 18)}px`,
                            height: `${barHeight}px`,
                            backgroundColor: barTone,
                            opacity: task.start && task.end ? 0.96 : 0.45,
                          }}
                        >
                          <div
                            className="h-full rounded-full bg-white/25"
                            style={{ width: `${progress}%` }}
                          />
                          {progress < 100 && (
                            <div
                              className="absolute right-0 top-0 h-full w-[22px] rounded-r-full"
                              style={{ backgroundColor: tailTone, filter: 'saturate(0.3)' }}
                            />
                          )}
                          <div className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-white/80 px-2 py-0.5 text-[10px] font-black leading-none text-slate-700 shadow-sm">
                            {progress}%
                          </div>
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
          </div>

          <div className="px-5 py-3">
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

      <AnimatePresence>
        {showGantt && selectedGanttTask && (
          <div
            className="fixed inset-0 z-[240] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-[2px]"
            onClick={() => setSelectedGanttTaskCode(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 12 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
              className="relative w-full max-w-[760px] overflow-hidden rounded-[28px] bg-white shadow-[0_30px_100px_rgba(15,23,42,0.35)]"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-4 px-6 py-5">
                <div className="min-w-0">
                  <p className="text-[11px] font-black uppercase tracking-[1.2px] text-[#F05D28]">Detalhes do Gantt</p>
                  <h3 className="mt-2 truncate text-[20px] font-black text-[#1F2937]">
                    {selectedGanttTask.code} - {selectedGanttTask.name}
                  </h3>
                  <p className="mt-2 text-[12px] text-[#64748B]">
                    Clique no X para fechar ou selecione outro item do gráfico.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedGanttTaskCode(null)}
                  className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-slate-500 shadow-[0_10px_30px_-22px_rgba(15,23,42,0.45)] transition-colors hover:text-[#F05D28]"
                  aria-label="Fechar detalhes"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="grid gap-6 px-6 pb-6 md:grid-cols-2">
                <div>
                  <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[1px] text-[#94A3B8]">
                    <ListChecks size={14} />
                    Resumo
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-[0.9px] text-[#94A3B8]">Código</p>
                      <p className="mt-1 text-[13px] font-bold text-[#2D2D2D]">{selectedGanttTask.code}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-[0.9px] text-[#94A3B8]">Progresso</p>
                      <p className="mt-1 text-[13px] font-bold text-[#2D2D2D]">{toPercent(selectedGanttTask.progress)}%</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-[0.9px] text-[#94A3B8]">Início</p>
                      <p className="mt-1 text-[13px] font-bold text-[#2D2D2D]">{formatDateBR(selectedGanttTask.row.plannedStart)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-[0.9px] text-[#94A3B8]">Término</p>
                      <p className="mt-1 text-[13px] font-bold text-[#2D2D2D]">{formatDateBR(selectedGanttTask.row.plannedEnd)}</p>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[1px] text-[#94A3B8]">
                    <Clock3 size={14} />
                    Dependências e alertas
                  </div>

                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.9px] text-[#94A3B8]">Predecessoras</p>
                    <p className="mt-1 text-[13px] font-semibold text-[#2D2D2D]">
                      {selectedGanttTask.dependencyCodes.length > 0
                        ? selectedGanttTask.dependencyCodes.join(', ')
                        : selectedGanttTask.predecessors.length > 0
                          ? selectedGanttTask.predecessors.join(', ')
                        : 'Nenhuma predecessora informada'}
                    </p>
                  </div>

                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.9px] text-[#94A3B8]">Tipo</p>
                    <p className="mt-1 text-[13px] font-semibold text-[#2D2D2D]">
                      {selectedGanttTask.milestone ? 'Marco' : `${selectedGanttTask.durationDays} dia(s)`}
                      {selectedGanttTask.critical ? ' · Crítica' : ''}
                    </p>
                  </div>

                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.9px] text-[#94A3B8]">Alertas</p>
                    <p className="mt-1 text-[13px] font-semibold text-[#2D2D2D]">
                      {selectedGanttTask.issues.length > 0
                        ? selectedGanttTask.issues.join(' ')
                        : 'Nenhuma inconsistência encontrada'}
                    </p>
                  </div>
                </div>

                <div className="md:col-span-2">
                  <p className="text-[10px] font-bold uppercase tracking-[0.9px] text-[#94A3B8]">Descrição</p>
                  <p className="mt-2 text-[14px] leading-relaxed text-[#2D2D2D]">
                    {selectedGanttTask.row.name}
                  </p>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      </>,
      document.body,
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
            className="inline-flex h-11 items-center gap-2 rounded-2xl bg-white px-4 text-[13px] font-bold text-[#2D2D2D] shadow-[0_10px_30px_-22px_rgba(15,23,42,0.45)] transition-all hover:text-[#F05D28]"
          >
            <Maximize2 size={16} />
            Modo Gantt
          </button>
        </div>
        <p className="text-[13px] text-[#757575]">{description}</p>
      </div>

      {/* Mesmo chip de filtro das outras abas (ver Atividades): rotulo pequeno em cima, valor em negrito. */}
      <div className="grid grid-cols-2 gap-1.5 md:grid-cols-4">
          <label className="inline-flex min-w-0 items-center gap-2 rounded-[20px] bg-white px-2 py-1.5 shadow-[0_10px_30px_-22px_rgba(15,23,42,0.45)]">
            <Filter size={14} className="flex-shrink-0 text-[#94A3B8]" />
            <span className="min-w-0 flex-1">
              <span className="block text-[9px] font-extrabold uppercase tracking-[0.7px] text-[#94A3B8]">Contrato</span>
              <SearchableSelect
                value={contractFilter}
                disabled={Boolean(normalizeText(lockedContractCode))}
                onChange={(event) => { setContractFilter(event.target.value); setOsFilter('Todas'); }}
                searchPlaceholder="Pesquisar contrato..."
                className="w-full bg-transparent text-[13px] font-black text-[#2D2D2D] outline-none"
              >
                {!normalizeText(lockedContractCode) && <option value="Todos">Todos</option>}
                {contracts.map((contract) => (
                  <option key={contract.code} value={contract.code}>{contract.name || contract.code}</option>
                ))}
              </SearchableSelect>
            </span>
          </label>

          <label className="inline-flex min-w-0 items-center gap-2 rounded-[20px] bg-white px-2 py-1.5 shadow-[0_10px_30px_-22px_rgba(15,23,42,0.45)]">
            <Filter size={14} className="flex-shrink-0 text-[#94A3B8]" />
            <span className="min-w-0 flex-1">
              <span className="block text-[9px] font-extrabold uppercase tracking-[0.7px] text-[#94A3B8]">OS</span>
              <SearchableSelect
                value={osFilter}
                onChange={(event) => setOsFilter(event.target.value)}
                searchPlaceholder="Pesquisar OS..."
                className="w-full bg-transparent text-[13px] font-black text-[#2D2D2D] outline-none"
              >
                <option value="Todas">Todas</option>
                {osOptions
                  .filter((os) => contractFilter === 'Todos' || os.contractCode === contractFilter)
                  .map((os) => (
                    <option key={os.code} value={os.code}>{os.name || os.code}</option>
                  ))}
              </SearchableSelect>
            </span>
          </label>

          {includePlanningToggle ? (
            <label className={`inline-flex min-w-0 cursor-pointer items-center gap-2 rounded-[20px] bg-white px-2 py-1.5 shadow-[0_10px_30px_-22px_rgba(15,23,42,0.45)] transition-colors ${showInProgressActivities ? 'ring-2 ring-[#F05D28]' : ''}`}>
              <input
                type="checkbox"
                checked={showInProgressActivities}
                onChange={(event) => setShowInProgressActivities(event.target.checked)}
                className="h-4 w-4 flex-shrink-0 rounded border-[#CBD5E1] accent-[#F05D28]"
              />
              <span className="min-w-0 flex-1">
                <span className="block text-[9px] font-extrabold uppercase tracking-[0.7px] text-[#94A3B8]">Modo</span>
                <span className="block truncate text-[13px] font-black text-[#2D2D2D]">Atividades em andamento</span>
              </span>
            </label>
          ) : null}

          <div className="inline-flex min-w-0 items-center gap-2 rounded-[20px] bg-white px-2 py-1.5 shadow-[0_10px_30px_-22px_rgba(15,23,42,0.45)]">
            <Filter size={14} className="flex-shrink-0 text-[#F05D28]" />
            <span className="min-w-0 flex-1">
              <span className="block text-[9px] font-extrabold uppercase tracking-[0.7px] text-[#94A3B8]">Itens</span>
              <span className="block text-[13px] font-black text-[#2D2D2D]">{rows.length}</span>
            </span>
          </div>
      </div>

      <section className="bg-white rounded-2xl shadow-[0_10px_30px_-22px_rgba(15,23,42,0.45)] overflow-hidden">
        <div className="flex items-center justify-between gap-4 px-5 py-3">
          <p className="text-[11px] font-bold uppercase tracking-[1px] text-[#757575]">Cronograma</p>
          <p className="text-[11px] font-bold uppercase tracking-[1px] text-[#757575]">{dateSummary}</p>
        </div>

        <div className="max-h-[680px] overflow-auto">
          {loading ? (
            <div className="p-8 text-[13px] font-semibold text-[#64748B]">Carregando cronograma...</div>
          ) : loadError ? (
            <div className="flex flex-col items-start gap-3 p-8">
              <p className="text-[13px] font-semibold text-[#B91C1C]">Não foi possível carregar o cronograma. {loadError}</p>
              {onRetry && (
                <button type="button" onClick={onRetry} className="rounded-xl bg-[#F05D28] px-4 py-2 text-[12px] font-black uppercase tracking-[1px] text-white">
                  Tentar de novo
                </button>
              )}
            </div>
          ) : tree.length === 0 ? (
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

    if (!showInProgressActivities || loading || loadError) {
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
              className="inline-flex h-11 items-center gap-2 rounded-2xl bg-white px-4 text-[13px] font-bold text-[#2D2D2D] shadow-[0_10px_30px_-22px_rgba(15,23,42,0.45)] transition-all hover:text-[#F05D28]"
            >
              <Maximize2 size={16} />
              Modo Gantt
            </button>
          </div>
          <p className="text-[13px] text-[#757575]">
            As barras azuis mostram todas as atividades em andamento registradas pela Area Tecnica. Marque o check para aprovar a porcentagem e enviar a atualizacao.
          </p>
        </div>

        <section className="bg-white rounded-2xl shadow-[0_10px_30px_-22px_rgba(15,23,42,0.45)] p-5">
          <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-4 items-end">
            <div>
              <label className="text-[11px] font-medium text-[#757575] uppercase tracking-[1px]">Contrato</label>
              <div className="relative mt-1.5">
                <SearchableSelect
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
                      {contract.name || contract.code}
                    </option>
                  ))}
                </SearchableSelect>
                <ChevronDown size={18} className="absolute right-4 top-1/2 -translate-y-1/2 text-[#757575] pointer-events-none" />
              </div>
            </div>

            <div>
              <label className="text-[11px] font-medium text-[#757575] uppercase tracking-[1px]">OS</label>
              <div className="relative mt-1.5">
                <SearchableSelect
                  value={osFilter}
                  onChange={(event) => setOsFilter(event.target.value)}
                  className="w-full h-11 px-4 bg-white border border-[#E5E7EB] rounded-xl text-[14px] font-medium text-[#2D2D2D] appearance-none focus:border-[#F05D28] focus:ring-2 focus:ring-[#F05D28]/20 outline-none"
                >
                  <option value="Todas">Todas</option>
                  {osOptions
                    .filter((os) => contractFilter === 'Todos' || os.contractCode === contractFilter)
                    .map((os) => (
                      <option key={os.code} value={os.code}>
                        {os.name || os.code}
                      </option>
                    ))}
                </SearchableSelect>
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
              <div className="h-11 px-4 rounded-xl bg-[#F9FAFB] shadow-[0_10px_30px_-22px_rgba(15,23,42,0.45)] flex items-center gap-2 text-[13px] font-bold text-[#2D2D2D]">
                <Filter size={16} className="text-[#F05D28]" />
                {progressRowsCount} item(ns)
              </div>
            </div>
          </div>
        </section>

        <section className="bg-white rounded-2xl shadow-[0_10px_30px_-22px_rgba(15,23,42,0.45)] overflow-hidden">
          <div className="flex items-center justify-between gap-4 px-5 py-3">
            <p className="text-[11px] font-bold uppercase tracking-[1px] text-[#757575]">Atividades em andamento</p>
            <p className="text-[11px] font-bold uppercase tracking-[1px] text-[#757575]">{planningDateSummary}</p>
          </div>

          <div className="max-h-[680px] overflow-auto">
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

                    <div className="px-4 py-3">
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
          <div className="rounded-2xl bg-white px-4 py-3 text-[13px] font-medium text-[#64748B] shadow-[0_10px_30px_-22px_rgba(15,23,42,0.45)]">
            {savingMessage}
          </div>
        )}

        {(Object.keys(approvalDrafts).length > 0 || pendingCount > 0) && (
          <div className="fixed bottom-6 right-6 z-[90] flex items-center gap-3 rounded-2xl bg-white px-4 py-3 shadow-[0_18px_50px_rgba(240,93,40,0.18)]">
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
