import { jsPDF } from 'jspdf';
import type { DashboardMetricSlice } from './Conformidade.metrics.check';

const PAGE_W = 297;
const PAGE_H = 210;
const MARGIN = 16;
const CONTENT_W = PAGE_W - MARGIN * 2;
const FOOTER_Y = 198;
const QUANTA_LOGO_URL = 'https://i.imgur.com/Net1yEQ.png';

type Rgb = readonly [number, number, number];

const COLORS = {
  paper: [248, 249, 250] as Rgb,
  white: [255, 255, 255] as Rgb,
  ink: [45, 45, 45] as Rgb,
  muted: [117, 117, 117] as Rgb,
  soft: [148, 163, 184] as Rgb,
  line: [226, 232, 240] as Rgb,
  slate: [71, 85, 105] as Rgb,
  slateDark: [30, 41, 59] as Rgb,
  orange: [240, 93, 40] as Rgb,
  orangeSoft: [255, 243, 238] as Rgb,
  green: [5, 150, 105] as Rgb,
  greenSoft: [236, 253, 245] as Rgb,
};

export interface ConformidadePdfData {
  generatedAt: Date;
  contractLabel: string;
  osLabel: string;
  recordCount: number;
  internalAnalyzed: number;
  outsourcedAnalyzed: number;
  perfectFiles: number;
  totalAnalyzed: number;
  totalNonConformities: number;
  ncByDiscipline: DashboardMetricSlice[];
  ncByType: DashboardMetricSlice[];
  ncByCompany: DashboardMetricSlice[];
}

interface ConformidadePdfOptions {
  logoDataUrl?: string;
}

function setColor(doc: jsPDF, target: 'fill' | 'draw' | 'text', value: Rgb) {
  if (target === 'fill') doc.setFillColor(...value);
  if (target === 'draw') doc.setDrawColor(...value);
  if (target === 'text') doc.setTextColor(...value);
}

function safeNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, number) : 0;
}

function cleanLabel(value: string | undefined, fallback: string) {
  return String(value || '').trim() || fallback;
}

function formatNumber(value: unknown) {
  return safeNumber(value).toLocaleString('pt-BR');
}

function formatGeneratedAt(value: Date) {
  const date = value instanceof Date && Number.isFinite(value.getTime()) ? value : new Date();
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date);
}

function validSlices(values: DashboardMetricSlice[]) {
  return (Array.isArray(values) ? values : [])
    .map((item) => ({ name: cleanLabel(item?.name, 'Não informada'), value: safeNumber(item?.value) }))
    .filter((item) => item.value > 0)
    .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name, 'pt-BR'));
}

function drawBrand(doc: jsPDF, logoDataUrl?: string) {
  let imageAdded = false;
  if (logoDataUrl) {
    try {
      doc.addImage(logoDataUrl, 'PNG', MARGIN, 10, 44, 10, undefined, 'FAST');
      imageAdded = true;
    } catch {
      imageAdded = false;
    }
  }
  if (!imageAdded) {
    setColor(doc, 'fill', COLORS.orange);
    doc.roundedRect(MARGIN, 10, 9, 9, 2, 2, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    setColor(doc, 'text', COLORS.ink);
    doc.text('QUANTA', MARGIN + 13, 17);
  }
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  setColor(doc, 'text', COLORS.soft);
  doc.text('ECOQUANTA / CONFORMIDADE', PAGE_W - MARGIN, 16, { align: 'right' });
}

function drawPageBase(doc: jsPDF, logoDataUrl?: string) {
  setColor(doc, 'fill', COLORS.paper);
  doc.rect(0, 0, PAGE_W, PAGE_H, 'F');
  setColor(doc, 'fill', COLORS.orange);
  doc.rect(0, 0, 3, PAGE_H, 'F');
  drawBrand(doc, logoDataUrl);
}

function drawSectionHeading(doc: jsPDF, eyebrow: string, title: string, subtitle: string) {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  setColor(doc, 'text', COLORS.orange);
  doc.text(eyebrow.toUpperCase(), MARGIN, 34);
  doc.setFontSize(21);
  setColor(doc, 'text', COLORS.ink);
  doc.text(title, MARGIN, 45);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  setColor(doc, 'text', COLORS.muted);
  doc.text(subtitle, MARGIN, 52);
}

function drawFooter(doc: jsPDF, page: number, totalPages: number, generatedAt: Date) {
  setColor(doc, 'draw', COLORS.line);
  doc.setLineWidth(0.25);
  doc.line(MARGIN, FOOTER_Y, PAGE_W - MARGIN, FOOTER_Y);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.8);
  setColor(doc, 'text', COLORS.soft);
  doc.text(`Gerado em ${formatGeneratedAt(generatedAt)}`, MARGIN, 204);
  doc.text(`Página ${page} de ${totalPages}`, PAGE_W - MARGIN, 204, { align: 'right' });
}

function drawMetricCard(
  doc: jsPDF,
  label: string,
  value: number,
  x: number,
  y: number,
  width: number,
  accent: Rgb,
  background: Rgb = COLORS.white,
) {
  setColor(doc, 'fill', background);
  doc.roundedRect(x, y, width, 30, 3, 3, 'F');
  setColor(doc, 'fill', accent);
  doc.roundedRect(x, y, 3, 30, 1.5, 1.5, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(17);
  setColor(doc, 'text', COLORS.slateDark);
  doc.text(formatNumber(value), x + 8, y + 14);
  doc.setFontSize(6.8);
  setColor(doc, 'text', COLORS.muted);
  doc.text(label.toUpperCase(), x + 8, y + 23);
}

function drawDonut(
  doc: jsPDF,
  values: Array<{ value: number; color: Rgb }>,
  cx: number,
  cy: number,
  radius: number,
) {
  const total = values.reduce((sum, item) => sum + item.value, 0);
  if (total <= 0) {
    setColor(doc, 'draw', COLORS.line);
    doc.setLineWidth(6);
    doc.circle(cx, cy, radius);
    return;
  }
  let angle = -90;
  values.forEach((item) => {
    if (item.value <= 0) return;
    const degrees = (item.value / total) * 360;
    const steps = Math.max(8, Math.ceil(degrees / 5));
    setColor(doc, 'fill', item.color);
    for (let step = 0; step < steps; step += 1) {
      const start = ((angle + (degrees * step) / steps) * Math.PI) / 180;
      const end = ((angle + (degrees * (step + 1)) / steps) * Math.PI) / 180;
      doc.triangle(
        cx,
        cy,
        cx + Math.cos(start) * radius,
        cy + Math.sin(start) * radius,
        cx + Math.cos(end) * radius,
        cy + Math.sin(end) * radius,
        'F',
      );
    }
    angle += degrees;
  });
  setColor(doc, 'fill', COLORS.white);
  doc.circle(cx, cy, radius * 0.57, 'F');
}

function drawCover(doc: jsPDF, data: ConformidadePdfData, logoDataUrl?: string) {
  drawPageBase(doc, logoDataUrl);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  setColor(doc, 'text', COLORS.orange);
  doc.text('RELATÓRIO EXECUTIVO', MARGIN, 39);
  doc.setFontSize(28);
  setColor(doc, 'text', COLORS.ink);
  doc.text('Conformidade documental', MARGIN, 54);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  setColor(doc, 'text', COLORS.muted);
  doc.text('Visão consolidada para acompanhamento da diretoria', MARGIN, 63);

  const filterText = `Contrato: ${cleanLabel(data.contractLabel, 'Todos os contratos')}   |   OS: ${cleanLabel(data.osLabel, 'Todas as OS')}`;
  setColor(doc, 'fill', COLORS.white);
  doc.roundedRect(MARGIN, 72, CONTENT_W, 17, 3, 3, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  setColor(doc, 'text', COLORS.slate);
  doc.text((doc.splitTextToSize(filterText, CONTENT_W - 12) as string[]).slice(0, 1), MARGIN + 6, 82.5);

  const gap = 5;
  const cardWidth = (CONTENT_W - gap * 3) / 4;
  drawMetricCard(doc, 'Total analisado', data.totalAnalyzed, MARGIN, 98, cardWidth, COLORS.slate);
  drawMetricCard(doc, 'Arquivos perfeitos', data.perfectFiles, MARGIN + cardWidth + gap, 98, cardWidth, COLORS.green, COLORS.greenSoft);
  drawMetricCard(doc, 'Não conformidades', data.totalNonConformities, MARGIN + (cardWidth + gap) * 2, 98, cardWidth, COLORS.orange, COLORS.orangeSoft);
  drawMetricCard(doc, 'Registros', data.recordCount, MARGIN + (cardWidth + gap) * 3, 98, cardWidth, COLORS.slateDark);

  setColor(doc, 'fill', COLORS.white);
  doc.roundedRect(MARGIN, 138, CONTENT_W, 48, 4, 4, 'F');
  drawDonut(
    doc,
    [
      { value: safeNumber(data.internalAnalyzed), color: COLORS.slate },
      { value: safeNumber(data.outsourcedAnalyzed), color: COLORS.orange },
    ],
    MARGIN + 30,
    162,
    17,
  );
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  setColor(doc, 'text', COLORS.slateDark);
  doc.text(formatNumber(data.totalAnalyzed), MARGIN + 30, 164, { align: 'center' });
  doc.setFontSize(7);
  setColor(doc, 'text', COLORS.muted);
  doc.text('ANALISADOS', MARGIN + 30, 170, { align: 'center' });

  const legendX = MARGIN + 62;
  [
    { label: 'Internos analisados', value: data.internalAnalyzed, color: COLORS.slate },
    { label: 'Terceirizados analisados', value: data.outsourcedAnalyzed, color: COLORS.orange },
  ].forEach((item, index) => {
    const y = 152 + index * 17;
    setColor(doc, 'fill', item.color);
    doc.circle(legendX, y, 2.2, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    setColor(doc, 'text', COLORS.ink);
    doc.text(item.label, legendX + 6, y + 1);
    doc.setFontSize(13);
    doc.text(formatNumber(item.value), PAGE_W - MARGIN - 8, y + 1, { align: 'right' });
  });
}

function addRankingPages(
  doc: jsPDF,
  title: string,
  subtitle: string,
  slices: DashboardMetricSlice[],
  logoDataUrl?: string,
) {
  const values = validSlices(slices);
  const pageSize = 10;
  const chunks = values.length
    ? Array.from({ length: Math.ceil(values.length / pageSize) }, (_, index) =>
        values.slice(index * pageSize, (index + 1) * pageSize),
      )
    : [[]];
  const total = values.reduce((sum, item) => sum + item.value, 0);
  const max = Math.max(1, ...values.map((item) => item.value));

  chunks.forEach((chunk, pageIndex) => {
    doc.addPage();
    drawPageBase(doc, logoDataUrl);
    drawSectionHeading(
      doc,
      'ANÁLISE DE NÃO CONFORMIDADES',
      pageIndex ? `${title} - continuação` : title,
      subtitle,
    );

    if (!chunk.length) {
      setColor(doc, 'fill', COLORS.white);
      doc.roundedRect(MARGIN, 68, CONTENT_W, 86, 4, 4, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      setColor(doc, 'text', COLORS.slate);
      doc.text('Nenhuma não conformidade encontrada neste recorte.', PAGE_W / 2, 108, {
        align: 'center',
      });
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      setColor(doc, 'text', COLORS.soft);
      doc.text('O relatório não inclui dados demonstrativos.', PAGE_W / 2, 117, { align: 'center' });
      return;
    }

    chunk.forEach((item, index) => {
      const globalIndex = pageIndex * pageSize + index;
      const y = 61 + index * 12.7;
      setColor(doc, 'fill', COLORS.white);
      doc.roundedRect(MARGIN, y, CONTENT_W, 10.5, 2, 2, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      setColor(doc, 'text', COLORS.orange);
      doc.text(String(globalIndex + 1).padStart(2, '0'), MARGIN + 5, y + 6.8);
      doc.setFontSize(8.2);
      setColor(doc, 'text', COLORS.ink);
      const label = (doc.splitTextToSize(item.name, 90) as string[])[0] || 'Não informada';
      doc.text(label, MARGIN + 17, y + 6.8);

      const barX = MARGIN + 112;
      const barWidth = 104;
      setColor(doc, 'fill', COLORS.line);
      doc.roundedRect(barX, y + 3.2, barWidth, 4, 2, 2, 'F');
      setColor(doc, 'fill', globalIndex === 0 ? COLORS.orange : COLORS.slate);
      doc.roundedRect(barX, y + 3.2, Math.max(2, (item.value / max) * barWidth), 4, 2, 2, 'F');
      doc.setFontSize(8);
      setColor(doc, 'text', COLORS.slateDark);
      doc.text(formatNumber(item.value), PAGE_W - MARGIN - 21, y + 6.8, { align: 'right' });
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      setColor(doc, 'text', COLORS.muted);
      const percentage = total > 0 ? (item.value / total) * 100 : 0;
      doc.text(`${percentage.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`, PAGE_W - MARGIN - 5, y + 6.8, { align: 'right' });
    });
  });
}

function applyFooters(doc: jsPDF, generatedAt: Date) {
  const totalPages = doc.getNumberOfPages();
  for (let page = 1; page <= totalPages; page += 1) {
    doc.setPage(page);
    drawFooter(doc, page, totalPages, generatedAt);
  }
}

export async function loadQuantaLogoDataUrl() {
  try {
    const response = await fetch(QUANTA_LOGO_URL, { referrerPolicy: 'no-referrer' });
    if (!response.ok) return undefined;
    const blob = await response.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  } catch {
    return undefined;
  }
}

export function getConformidadePdfFilename(
  generatedAt: Date,
  contractCode: string,
  osCode: string,
) {
  const slug = (value: string, fallback: string) =>
    value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || fallback;
  const date = generatedAt.toISOString().slice(0, 10);
  return `ecoquanta-conformidade-${slug(contractCode, 'todos')}-${slug(osCode, 'todas')}-${date}.pdf`;
}

export function buildConformidadePdf(
  data: ConformidadePdfData,
  options: ConformidadePdfOptions = {},
) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: true });
  drawCover(doc, data, options.logoDataUrl);
  addRankingPages(
    doc,
    'Não conformidades por disciplina',
    'Quantidade T agrupada por disciplina. Todos os tipos no recorte de Contrato e OS.',
    data.ncByDiscipline,
    options.logoDataUrl,
  );
  addRankingPages(
    doc,
    'Não conformidades por tipo',
    'Quantidade T agrupada em Carimbo, Desenho, Relatório, Arquivo e Outros.',
    data.ncByType,
    options.logoDataUrl,
  );
  addRankingPages(
    doc,
    'Não conformidades por terceirizada',
    'Somente registros terceirizados. Cadastros legados sem nome aparecem como Não informada.',
    data.ncByCompany,
    options.logoDataUrl,
  );
  applyFooters(doc, data.generatedAt);
  return doc;
}
