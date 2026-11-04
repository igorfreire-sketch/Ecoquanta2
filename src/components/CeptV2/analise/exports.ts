// Exportacoes da Analise das OS (E §8, F0 §7): X1 CSV + X2..X7 PDF. Tudo no cliente.
import { jsPDF } from 'jspdf';
import autoTable, { pdfText, type RowInput } from './pdfTable';
import { applicablePercent, CEPT_OS061, type CeptModel } from '../../../lib/cept/rules';
import { normalizePdfExportOptions, type PdfExportOptions } from '../../../lib/pdfExport';
import {
  alertText, componentLabel, deliverableLabel, familyView, groupPercent, kpis, matrixFamilyCode, matrixModel,
  SEV_LABEL, STATUS_LABEL, validationText, type Filters, type Group, type HistRow, type Rec,
} from './model';

type Rgb = [number, number, number];
const C = {
  ink: [45, 45, 45] as Rgb, muted: [100, 116, 139] as Rgb, line: [229, 231, 235] as Rgb, orange: [240, 93, 40] as Rgb, head: [30, 41, 59] as Rgb, zebra: [248, 250, 252] as Rgb,
  delivered: [21, 128, 61] as Rgb, pending: [194, 65, 12] as Rgb, unknown: [161, 98, 7] as Rgb, na: [100, 116, 139] as Rgb,
  red: [185, 28, 28] as Rgb, yellow: [180, 83, 9] as Rgb, green: [21, 128, 61] as Rgb,
};
const STATUS_RGB: Record<string, Rgb> = { delivered: C.delivered, pending: C.pending, unknown: C.unknown, na: C.na };
const SOFT = { critical: [255, 247, 237] as Rgb, normal: [241, 245, 249] as Rgb, strong: [240, 253, 250] as Rgb, empty: [245, 247, 248] as Rgb };
const perfRgb = (p: number): Rgb => (p < 40 ? [234, 88, 12] : p >= 80 ? [17, 94, 89] : p >= 65 ? [15, 118, 110] : [100, 116, 139]);
const perfSoft = (p: number): Rgb => (p < 40 ? SOFT.critical : p >= 65 ? SOFT.strong : SOFT.normal);

export const OS_LABEL = 'OS061 - CEPT';
const today = () => new Date().toISOString().slice(0, 10);
const nowText = () => new Date().toLocaleString('pt-BR');
export const sanitizeFileName = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, '_');
export const filePrefix = () => sanitizeFileName(`OS${CEPT_OS061.osCode}_CEPT`);

function download(blob: Blob, name: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function newDoc(opts?: PdfExportOptions) {
  const { orientation, format } = normalizePdfExportOptions(opts, 'landscape');
  return new jsPDF({ orientation, unit: 'mm', format });
}
const W = (d: jsPDF) => d.internal.pageSize.getWidth();
const H = (d: jsPDF) => d.internal.pageSize.getHeight();

/** Base comum: faixa laranja 3 mm, marca e titulo. Retorna o y livre. */
function pageHeader(d: jsPDF, title: string, subtitle?: string, lines: string[] = []) {
  d.setFillColor(...C.orange); d.rect(0, 0, 3, H(d), 'F');
  d.setFont('helvetica', 'bold'); d.setFontSize(8); d.setTextColor(...C.muted);
  d.text('ECOQUANTA / GERENCIAMENTO', 12, 9);
  d.text(`${OS_LABEL} | Compatibilização Final`, W(d) - 12, 9, { align: 'right' });
  d.setFontSize(14); d.setTextColor(...C.ink); d.text(title, 12, 17);
  let y = 17;
  d.setFont('helvetica', 'normal'); d.setFontSize(8.5); d.setTextColor(...C.muted);
  [subtitle, ...lines].filter(Boolean).forEach((t) => {
    const wrapped = d.splitTextToSize(pdfText(String(t)), W(d) - 24) as string[];
    d.text(wrapped, 12, y + 5); y += 4 * wrapped.length + 1;
  });
  return y + 5;
}
function footers(d: jsPDF, extra = '') {
  const n = d.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    d.setPage(i);
    d.setDrawColor(...C.line); d.line(12, H(d) - 9, W(d) - 12, H(d) - 9);
    d.setFont('helvetica', 'normal'); d.setFontSize(7); d.setTextColor(...C.muted);
    d.text(`${OS_LABEL} | EcoQuanta - Gestão de Projetos${extra ? ' | ' + extra : ''}`, 12, H(d) - 5);
    d.text(`Página ${i} de ${n}`, W(d) - 12, H(d) - 5, { align: 'right' });
  }
}
const tableBase = (startY: number, fontSize = 7) => ({
  startY, margin: { left: 12, right: 12, bottom: 14 }, theme: 'grid' as const,
  styles: { font: 'helvetica', fontSize, cellPadding: 1.2, lineColor: C.line, lineWidth: 0.1, textColor: C.ink, overflow: 'linebreak' as const },
  headStyles: { fillColor: C.head, textColor: [255, 255, 255] as Rgb, fontStyle: 'bold' as const },
  alternateRowStyles: { fillColor: C.zebra },
});
const lastY = (d: jsPDF) => (d as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 30;

// ---------- X1 CSV do historico ----------
const csvArrows = (s: string) => s.replace(/→/g, '->').replace(/←/g, '<-');
export function historyCsv(rows: HistRow[]) {
  // Excel must keep user text as text, including values beginning with formula operators.
  const q = (v: unknown) => { const s = csvArrows(String(v ?? '')); return `"${(/^[\s]*[=+@-]/.test(s) ? "'" + s : s).replace(/"/g, '""')}"`; };
  const head = ['Data / hora', 'Autor', 'Projeto', 'Disciplina', 'Responsável', 'Entregável', 'Campo', 'Alteração'];
  const body = rows.map((h) => [h.when, h.user, `${h.projectCode} - ${h.projectName}`, h.discipline, h.responsible, h.deliverable, h.fieldLabel, h.change]);
  return '\ufeff' + [head, ...body].map((r) => r.map(q).join(';')).join('\r\n');
}
export function exportHistoryCsv(rows: HistRow[]) {
  const csv = historyCsv(rows);
  download(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `historico_${CEPT_OS061.osCode.replace(/\W/g, '')}_${today()}.csv`);
}

// ---------- X2 PDF do historico ----------
export function exportHistoryPdf(rows: HistRow[], levelTitle: string, opts?: PdfExportOptions) {
  const d = newDoc(opts);
  const y = pageHeader(d, `${OS_LABEL} | ${levelTitle}`, `${rows.length} alterações · mais recentes primeiro`);
  const split = (s: string) => { const i = s.indexOf('→'); return i < 0 ? null : [s.slice(0, i).trim(), s.slice(i + 1).trim()]; };
  autoTable(d, {
    ...tableBase(y, 6.5),
    head: [['Data / hora', 'Autor', 'Projeto', 'Disciplina', 'Responsável', 'Entregável', 'Campo', 'Alteração']],
    body: rows.map((h) => [h.when, h.user, `${h.projectCode} - ${h.projectName}`, h.discipline, h.responsible, h.deliverable, h.fieldLabel, h.change]),
    columnStyles: { 0: { cellWidth: 28 }, 1: { cellWidth: 18 }, 2: { cellWidth: 45 }, 3: { cellWidth: 20, fontStyle: 'bold' }, 4: { cellWidth: 40 }, 5: { cellWidth: 22, fontStyle: 'bold' }, 6: { cellWidth: 15 }, 7: { cellWidth: 65 } },
    didParseCell: (h) => { if (h.section === 'body' && h.column.index === 7) { const p = split(String(h.cell.raw)); if (p) h.cell.text = [`${p[0]} -> ${p[1]}`]; } },
    didDrawCell: (h) => {
      if (h.section !== 'body' || h.column.index !== 7) return;
      const p = split(String(h.cell.raw)); if (!p) return;
      // Place a vector arrow above the change text, never over wrapped before/after values.
      const x0 = h.cell.x + h.cell.padding('left'); const yy = h.cell.y + 0.6;
      d.setDrawColor(...C.orange); d.setFillColor(...C.orange); d.setLineWidth(0.35);
      d.line(x0, yy, x0 + 4, yy); d.triangle(x0 + 4, yy - 1, x0 + 4, yy + 1, x0 + 5.6, yy, 'F');
    },
  });
  footers(d);
  d.save(`historico_${CEPT_OS061.osCode}_${today()}.pdf`);
}

// ---------- X3 Relatorio executivo ----------
async function captureChart(id: string): Promise<{ data: string; ratio: number } | null> {
  if (typeof document === 'undefined') return null;
  const el = document.querySelector(`[data-cept-chart="${id}"]`) as HTMLElement | null;
  if (!el) return null;
  const { default: html2canvas } = await import('html2canvas');
  const canvas = await html2canvas(el, { scale: 2, backgroundColor: '#ffffff', logging: false });
  return { data: canvas.toDataURL('image/png'), ratio: canvas.height / canvas.width };
}
function metricCard(d: jsPDF, x: number, y: number, w: number, label: string, value: string, color: Rgb) {
  d.setFillColor(...C.zebra); d.setDrawColor(...C.line); d.roundedRect(x, y, w, 20, 2, 2, 'FD');
  d.setFillColor(...color); d.rect(x, y, w, 1.2, 'F');
  d.setFont('helvetica', 'bold'); d.setFontSize(6.5); d.setTextColor(...C.muted); d.text(label.toUpperCase(), x + 3, y + 6);
  d.setFontSize(15); d.setTextColor(...color); d.text(value, x + 3, y + 15);
}
function donut(d: jsPDF, cx: number, cy: number, r: number, parts: Array<{ v: number; c: Rgb }>) {
  const total = parts.reduce((s, p) => s + p.v, 0);
  if (!total) { d.setDrawColor(...C.line); d.setLineWidth(6); d.circle(cx, cy, r, 'S'); return; }
  let a = -Math.PI / 2;
  parts.forEach((p) => {
    const span = p.v / total * Math.PI * 2; if (!span) return;
    d.setFillColor(...p.c);
    d.setDrawColor(...p.c); d.setLineWidth(0.03);
    const steps = Math.max(2, Math.ceil(span / 0.08));
    for (let i = 0; i < steps; i++) {
      const a1 = a + span * i / steps; const a2 = a + span * (i + 1) / steps;
      d.triangle(cx, cy, cx + r * Math.cos(a1), cy + r * Math.sin(a1), cx + r * Math.cos(a2) + 0.01, cy + r * Math.sin(a2) + 0.01, 'FD');
    }
    a += span;
  });
  d.setFillColor(255, 255, 255); d.circle(cx, cy, r * 0.5, 'F');
}
const narrative = (gs: Group[]) => {
  if (!gs.length) return 'Sem dados aplicáveis no recorte.';
  const s = [...gs].sort((a, b) => b.percent - a.percent);
  return `Maior conclusão no recorte: ${s[0].label} (${s[0].percent}%). Menor conclusão: ${s[s.length - 1].label} (${s[s.length - 1].percent}%).`;
};

export async function exportExecutivePdf(records: Rec[], filterText: string, sourceUpdated: string, opts?: PdfExportOptions) {
  const d = newDoc(opts);
  const k = kpis(records);
  const pw = W(d);
  // Pag 1
  let y = pageHeader(d, 'Relatório executivo do dashboard', `Gerado em ${nowText()} | Fonte atualizada em ${sourceUpdated || '—'}`, [filterText]);
  const cards: Array<[string, string, Rgb]> = [['Conclusão', `${k.percent}%`, C.orange], ['Disponibilizados', String(k.delivered), C.delivered], ['Pendentes', String(k.pending), C.pending],
    ['Aplicáveis', String(k.applicable), C.head], ['Vermelhos', String(k.red), C.red], ['Amarelos', String(k.yellow), C.yellow], ['Validados', String(k.green), C.green]];
  const cw = (pw - 24 - 6 * 3) / 7;
  cards.forEach(([l, v, c], i) => metricCard(d, 12 + i * (cw + 3), y, cw, l, v, c));
  y += 28;
  donut(d, 50, y + 32, 28, [{ v: k.delivered, c: C.delivered }, { v: k.pending, c: C.pending }]);
  d.setFontSize(8); d.setTextColor(...C.ink);
  d.text(`Disponibilizados ${k.delivered} · Pendentes ${k.pending}`, 50, y + 70, { align: 'center' });
  d.setFont('helvetica', 'bold'); d.setFontSize(11); d.text('Leitura executiva', 100, y + 6);
  d.setFont('helvetica', 'normal'); d.setFontSize(9);
  const paras = [
    `No recorte atual, ${k.percent}% dos entregáveis aplicáveis estão concluídos: ${k.delivered} disponibilizados de ${k.applicable} aplicáveis.`,
    `Restam ${k.pending} entregáveis pendentes, sem check na fonte.`,
    `Há ${k.red + k.yellow} alertas ativos (${k.red} vermelhos e ${k.yellow} amarelos) e ${k.green} alertas já validados.`,
  ];
  let py = y + 13;
  paras.forEach((p) => { const t = d.splitTextToSize(p, pw - 112) as string[]; d.text(t, 100, py); py += t.length * 4.5 + 3; });
  // Pag 2-5
  const pages: Array<[string, string, Group[], string]> = [
    ['Conclusão por projeto', 'project', groupPercent(records, (r) => r.projectCode, (c) => `${c} - ${records.find((r) => r.projectCode === c)?.projectName || c}`), 'Cada coluna mostra o percentual de entregáveis aplicáveis concluídos no projeto. Laranja = crítico (<40%), cinza-azulado = normal, teal = forte (≥80%).'],
    ['Conclusão por tipo de entregável', 'deliverable', groupPercent(records, (r) => r.chartKey, deliverableLabel), 'IFC isolado e os pares Edit/PDF de PRJ, MD, MC e RL: nove componentes agrupados em cinco grupos. A cor indica a conclusão.'],
    ['Conclusão por disciplina', 'discipline', groupPercent(records, (r) => r.disciplineCode), 'Percentual de entregáveis aplicáveis concluídos por disciplina, considerando todos os projetos do recorte.'],
    ['Conclusão por responsável', 'responsible', groupPercent(records.filter((r) => r.responsible), (r) => r.responsible), 'Equipe interna e terceirizados. Use a lista do dashboard para cobrança.'],
  ];
  for (const [title, id, groups, how] of pages) {
    d.addPage();
    const top = pageHeader(d, title, filterText);
    let img: Awaited<ReturnType<typeof captureChart>> = null;
    try { img = await captureChart(id); } catch { /* render a vector chart if browser capture fails */ }
    const imgW = Math.min(184, pw - 24 - 85);
    if (img) {
      const h = Math.max(78, Math.min(112, imgW * img.ratio));
      d.addImage(img.data, 'PNG', 12, top, imgW, h);
    } else {
      // Bounded vector fallback keeps the executive report at six pages, including from Matrix.
      const rowH = Math.min(7, 112 / Math.max(1, groups.length));
      groups.forEach((g, i) => {
        const yy = top + i * rowH;
        d.setFontSize(6.5); d.setTextColor(...C.ink);
        d.text(pdfText(g.label).slice(0, 30), 12, yy + 3);
        d.setFillColor(...perfRgb(g.percent)); d.rect(60, yy, Math.max(0.2, (imgW - 62) * g.percent / 100), rowH * 0.6, 'F');
        d.text(`${g.percent}%`, 12 + imgW - 10, yy + 3);
      });
    }
    const bx = 12 + imgW + 6;
    d.setFillColor(...C.zebra); d.setDrawColor(...C.line); d.roundedRect(bx, top, 79, 60, 2, 2, 'FD');
    d.setFont('helvetica', 'bold'); d.setFontSize(9); d.setTextColor(...C.ink); d.text('Como interpretar', bx + 4, top + 7);
    d.setFont('helvetica', 'normal'); d.setFontSize(8);
    d.text(d.splitTextToSize(pdfText(`${how} ${narrative(groups)}`), 71) as string[], bx + 4, top + 13);
  }
  // Pag 6
  d.addPage();
  y = pageHeader(d, 'Alertas e validações', filterText);
  const cw2 = (pw - 24 - 9) / 4;
  ([['Vermelhos', k.red, C.red], ['Amarelos', k.yellow, C.yellow], ['Validados', k.green, C.green], ['Sem alerta', k.none, C.muted]] as Array<[string, number, Rgb]>)
    .forEach(([l, v, c], i) => metricCard(d, 12 + i * (cw2 + 3), y, cw2, l, String(v), c));
  y += 26;
  const box = (x: number, title: string, lines: string[]) => {
    d.setFillColor(...C.zebra); d.setDrawColor(...C.line); d.roundedRect(x, y, (pw - 30) / 2, 34, 2, 2, 'FD');
    d.setFont('helvetica', 'bold'); d.setFontSize(9); d.setTextColor(...C.ink); d.text(title, x + 4, y + 6);
    d.setFont('helvetica', 'normal'); d.setFontSize(7.5);
    d.text(d.splitTextToSize(lines.map((l) => '• ' + l).join('\n'), (pw - 30) / 2 - 8) as string[], x + 4, y + 11);
  };
  // B6: textos condicionados a OS (so OS061 nesta fase).
  box(12, 'Regras automáticas', [
    'Amarelo: arquivo postado antes de 18/08/2026.',
    'Vermelho: existe arquivo editável posterior ao não editável da mesma família.',
    'Amarelo: o não editável foi postado mais de 7 dias depois do editável.',
    'Verde: alerta validado por um usuário autorizado; volta a alertar se a família mudar.',
  ]);
  box(12 + (pw - 30) / 2 + 6, 'Rastreabilidade da validação', [
    'Somente os validadores autorizados podem validar ou reabrir alertas.',
    'Cada decisão fica registrada com usuário, data, assinatura do estado da família e observação.',
  ]);
  y += 40;
  const byProject = new Map<string, { red: number; yellow: number; green: number }>();
  records.forEach((r) => { if (r.sev === 'none') return; const e = byProject.get(r.projectCode) || { red: 0, yellow: 0, green: 0 }; e[r.sev]++; byProject.set(r.projectCode, e); });
  autoTable(d, {
    ...tableBase(y), headStyles: { fillColor: [63, 89, 101], textColor: [255, 255, 255], fontStyle: 'bold' },
    head: [['Projeto', 'Vermelhos', 'Amarelos', 'Validados', 'Ativos']],
    body: [...byProject.entries()].sort().map(([p, e]) => [`${p} - ${records.find((r) => r.projectCode === p)?.projectName || ''}`, e.red, e.yellow, e.green, e.red + e.yellow]),
  });
  footers(d, `gerado em ${nowText()}`);
  d.save(`${filePrefix()}_Relatorio_Executivo_Dashboard_${today()}.pdf`);
}

// ---------- X4 PDF da validacao ----------
export function exportValidationPdf(rec: Rec, history: Array<{ when: string; user: string; action: string; severity: string; fileDate: string; counterpart: string; reasons: string; observation: string }>, opts?: PdfExportOptions) {
  const d = newDoc(opts);
  const y = pageHeader(d, `${OS_LABEL} | Alerta e histórico de validação`, `${rec.projectCode} - ${rec.projectName} | ${rec.disciplineCode} | ${componentLabel(rec)}`, [
    `Data atual: ${rec.dateFull || rec.date || '—'} | Alerta: ${SEV_LABEL[rec.sev]} | Validação: ${validationText(rec)}`,
    'Motivos atuais: ' + (rec.alert.reasons.map((r) => `${r.message}${r.counterpartDate ? ` (Contraparte: ${r.counterpartDate})` : ''}`).join(' | ') || 'Nenhum alerta automático no estado atual.'),
  ]);
  autoTable(d, {
    ...tableBase(y), headStyles: { fillColor: [47, 111, 159], textColor: [255, 255, 255], fontStyle: 'bold' },
    head: [['Data', 'Usuário', 'Ação', 'Alerta', 'Data arquivo', 'Contraparte', 'Motivo', 'Observação']],
    body: history.map((h) => [h.when, h.user, h.action, h.severity, h.fileDate, h.counterpart, h.reasons, h.observation]),
  });
  footers(d);
  d.save(`${filePrefix()}_Validacao_${sanitizeFileName(`${rec.projectCode}_${rec.disciplineCode}_${rec.family}`)}_${today()}.pdf`);
}

// ---------- X5 PDF da matriz ----------
export function exportMatrixPdf(model: CeptModel, all: Rec[], filtered: Rec[], filters: Filters, full: boolean, filterText: string, sourceUpdated: string, opts?: PdfExportOptions) {
  const m = matrixModel(model, all, filtered, filters);
  if (!m.projects.length || !m.disciplines.length) throw new Error('Não há dados para exportar com os filtros atuais.');
  const d = newDoc(opts);
  const k = kpis(filtered);
  const ctx = `${full ? 'Matriz completa' : filterText} | Fonte: ${sourceUpdated || '—'} | Emissão: ${nowText()}`;
  const fam = (p: string, disc: string) => model.projects.find((x) => x.code === p)?.disciplines[disc];
  const chunks: string[][] = [];
  for (let i = 0; i < m.disciplines.length; i += 24) chunks.push(m.disciplines.slice(i, i + 24));
  chunks.forEach((cols, ci) => {
    if (ci) d.addPage();
    const y = pageHeader(d, 'Visão geral · Projetos × Disciplinas', ctx);
    const cw = (W(d) - 24 - 9) / 4;
    ([['Conclusão', `${k.percent}%`, C.orange], ['Disponibilizados', String(k.delivered), C.delivered], ['Pendentes', String(k.pending), C.pending], ['Aplicáveis', String(k.applicable), C.head]] as Array<[string, string, Rgb]>)
      .forEach(([l, v, c], i) => metricCard(d, 12 + i * (cw + 3), y, cw, l, v, c));
    const cells: Record<string, { p: number; ap: number }> = {};
    autoTable(d, {
      ...tableBase(y + 25, 5.8), styles: { ...tableBase(0, 5.8).styles, halign: 'center', valign: 'middle' },
      head: [['Projeto', ...cols]],
      body: m.projects.map((p) => [`${p.code} - ${p.name}`, ...cols.map((disc) => {
        const recs = filtered.filter((r) => r.projectCode === p.code && r.disciplineCode === disc);
        const dl = recs.filter((r) => r.status === 'delivered').length; const ap = dl + recs.filter((r) => r.status === 'pending').length;
        cells[`${p.code}|${disc}`] = { p: applicablePercent(dl, ap - dl), ap };
        return ap ? `${applicablePercent(dl, ap - dl)}%\n${dl}/${ap}` : '—';
      })]),
      columnStyles: { 0: { cellWidth: 39, halign: 'left', fontStyle: 'bold' } },
      didParseCell: (h) => {
        if (h.section !== 'body' || h.column.index === 0) return;
        const p = m.projects[h.row.index]; const c = cells[`${p.code}|${cols[h.column.index - 1]}`];
        if (!c || !c.ap) { h.cell.styles.fillColor = SOFT.empty; h.cell.styles.textColor = C.muted; return; }
        h.cell.styles.fillColor = perfSoft(c.p); h.cell.styles.textColor = perfRgb(c.p); h.cell.styles.fontStyle = 'bold';
      },
    });
  });
  // Parte 2: uma pagina por projeto com aplicavel
  m.projects.forEach((p) => {
    const recs = filtered.filter((r) => r.projectCode === p.code);
    if (!recs.some((r) => r.status === 'delivered' || r.status === 'pending')) return;
    const families = p.deliverableTypes;
    const discs = m.disciplines.filter((disc) => p.disciplines[disc]);
    d.addPage();
    const y = pageHeader(d, `${p.code} - ${p.name}`, ctx);
    const tag = (s: string) => (s === 'red' ? ' !V' : s === 'yellow' ? ' !A' : s === 'green' ? ' !G' : '');
    const code = (s: string) => (s === 'delivered' ? 'OK' : s === 'pending' ? 'PEND' : s === 'unknown' ? '?' : '—');
    const statusAt: Record<string, string> = {};
    autoTable(d, {
      ...tableBase(y, 6),
      head: [['Disciplina', 'Responsável', ...families.map(matrixFamilyCode)]], // B10: PRJ/RL como a tela
      body: discs.map((disc) => {
        const dd = fam(p.code, disc)!;
        return [disc, dd.responsible || 'Responsável não identificado', ...families.map((f) => {
          const comps = recs.filter((r) => r.disciplineCode === disc && r.family === f);
          if (!comps.length) return '—';
          const v = familyView(f, '', comps); statusAt[`${disc}|${f}`] = v.status;
          if (comps.length === 1) return `${code(comps[0].status)}${tag(comps[0].sev)}${comps[0].date ? ' ' + comps[0].date : ''}`;
          return comps.map((c) => `${c.editable === true ? 'EDIT' : c.editable === false ? 'N-EDIT' : 'ARQ'} ${code(c.status)}${tag(c.sev)}${c.date ? ' ' + c.date : ''}`).join('\n');
        })];
      }),
      didParseCell: (h) => {
        if (h.section !== 'body') return;
        if (h.column.index === 1 && String(h.cell.raw) === 'Responsável não identificado') { h.cell.styles.textColor = C.pending; h.cell.styles.fontStyle = 'bold'; }
        if (h.column.index < 2) return;
        const s = statusAt[`${discs[h.row.index]}|${families[h.column.index - 2]}`];
        if (s === 'delivered') { h.cell.styles.fillColor = [240, 253, 244]; h.cell.styles.textColor = C.delivered; }
        if (s === 'pending') { h.cell.styles.fillColor = [255, 247, 237]; h.cell.styles.textColor = C.pending; }
        if (s === 'unknown') { h.cell.styles.fillColor = [255, 248, 230]; h.cell.styles.textColor = [170, 123, 38]; }
      },
    });
    d.setFontSize(7); d.setTextColor(...C.muted);
    d.text('OK = disponibilizado · PEND = pendente · — = não aplicável', 12, Math.min(lastY(d) + 5, H(d) - 12));
  });
  footers(d, `fonte atualizada em ${sourceUpdated || '—'}`);
  d.save(`${filePrefix()}_${full ? 'Matriz_Completa' : 'Filtro_Atual'}_${today()}.pdf`);
}

// ---------- X6 PDF da visao consolidada ----------
export function exportOverviewPdf(kind: 'projects' | 'disciplines', rows: Group[], extraCount: (key: string) => number, filterText: string, search: string, opts?: PdfExportOptions) {
  const d = newDoc(opts);
  const y = pageHeader(d, `${OS_LABEL} | Compatibilização Final`, kind === 'projects' ? 'Projetos — visão consolidada' : 'Disciplinas — visão consolidada', [filterText + (search ? ` · Busca: ${search}` : '')]);
  autoTable(d, {
    ...tableBase(y),
    head: [[kind === 'projects' ? 'Projeto' : 'Disciplina', 'Conclusão', 'Disponibilizados', 'Pendentes', kind === 'projects' ? 'Disciplinas' : 'Projetos']],
    body: rows.map((g) => [g.label, `${g.percent}%`, g.delivered, g.pending, extraCount(g.key)]),
  });
  footers(d);
  d.save(`${filePrefix()}_${kind === 'projects' ? 'Projetos' : 'Disciplinas'}_Resumo.pdf`);
}

// ---------- X7 PDF do detalhe ----------
export function exportDetailPdf(title: string, subtitle: string, recorte: string, rows: Rec[], sourceUpdated: string, opts?: PdfExportOptions) {
  if (!rows.length) throw new Error('Não há dados para exportar com os filtros atuais.');
  const d = newDoc(opts);
  const k = kpis(rows);
  const y = pageHeader(d, title, subtitle, [
    `Fonte atualizada em ${sourceUpdated || '—'} | PDF emitido em ${nowText()}`,
    `Recorte da janela: ${recorte}`,
    `Resumo do recorte: ${k.percent}% concluído | ${k.delivered} disponibilizados | ${k.pending} pendentes | ${k.applicable} aplicáveis | ${rows.length} linhas`,
  ]);
  autoTable(d, {
    ...tableBase(y, 6.6), headStyles: { fillColor: [47, 111, 159], textColor: [255, 255, 255], fontStyle: 'bold' },
    head: [['Projeto', 'Disc.', 'Responsável', 'Entregável', 'Situação', 'Data', 'Alerta', 'Validação', 'Motivo']],
    body: rows.map((r) => [`${r.projectCode} · ${r.projectName}`, r.disciplineCode, r.responsible || 'Responsável não identificado', componentLabel(r), STATUS_LABEL[r.status], r.date || '—', alertText(r), validationText(r), r.alert.reasons.map((x) => x.message).join(' | ')] as RowInput),
    didParseCell: (h) => {
      if (h.section !== 'body' || h.column.index !== 4) return;
      const s = rows[h.row.index].status;
      h.cell.styles.textColor = STATUS_RGB[s]; if (s === 'pending' || s === 'delivered') h.cell.styles.fontStyle = 'bold';
    },
  });
  footers(d);
  d.save(`${filePrefix()}_${sanitizeFileName(title)}_${today()}.pdf`);
}
