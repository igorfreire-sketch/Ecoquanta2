import fs from 'fs';
import path from 'path';
import PDFDocument from 'pdfkit';
import SVGtoPDF from 'svg-to-pdfkit';

const outputPath = path.resolve(process.cwd(), 'Relatorio_27-05-2026.pdf');
const stream = fs.createWriteStream(outputPath);

const doc = new PDFDocument({
  size: 'A4',
  margin: 42,
  info: {
    Title: 'Relatorio de hoje',
    Author: 'Codex',
    Subject: 'Resumo das mudancas feitas no Ecoquanta2',
  },
});

doc.pipe(stream);
stream.on('finish', () => console.log(outputPath));

const C = {
  ink: '#1F2937',
  muted: '#64748B',
  line: '#E5E7EB',
  panel: '#F8FAFC',
  orange: '#F05D28',
  blue: '#0F4C81',
  green: '#0F766E',
  sky: '#0EA5E9',
  rose: '#F43F5E',
};

const today = new Date(2026, 4, 27);
const dateLabel = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' }).format(today);

function h(text, size = 16, color = C.ink) {
  doc.fillColor(color).font('Helvetica-Bold').fontSize(size).text(text);
}

function p(text, width = doc.page.width - doc.page.margins.left - doc.page.margins.right, size = 10.5, color = C.muted) {
  doc.fillColor(color).font('Helvetica').fontSize(size).text(text, { width, lineGap: 3 });
}

function bullet(label, body) {
  const x = doc.x;
  const y = doc.y;
  doc.circle(x + 4, y + 6, 2.5).fill(C.orange);
  doc.fillColor(C.ink).font('Helvetica-Bold').fontSize(10.5).text(label, x + 14, y, { continued: false });
  doc.moveDown(0.1);
  doc.fillColor(C.muted).font('Helvetica').fontSize(9.8).text(body, x + 14, y + 14, {
    width: doc.page.width - doc.page.margins.left - doc.page.margins.right - 14,
    lineGap: 2,
  });
  doc.y = y + 36;
}

function renderSvg(svg, x, y, width, height) {
  SVGtoPDF(doc, svg, x, y, { width, height, preserveAspectRatio: 'xMidYMid meet' });
}

function ganttSvg() {
  return `
  <svg xmlns="http://www.w3.org/2000/svg" width="1200" height="420" viewBox="0 0 1200 420">
    <defs>
      <marker id="arrowHead" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
        <path d="M 0 0 L 10 5 L 0 10 z" fill="#94A3B8"/>
      </marker>
    </defs>
    <rect x="1" y="1" width="1198" height="418" rx="28" fill="#FFFFFF" stroke="#E5E7EB"/>
    <rect x="24" y="20" width="220" height="30" rx="15" fill="#F8FAFC" stroke="#E5E7EB"/>
    <text x="40" y="40" font-family="Helvetica-Bold" font-size="12" fill="#1F2937">Modo Gantt</text>
    <rect x="1030" y="20" width="140" height="30" rx="15" fill="#FEECE6" stroke="#F7C7B7"/>
    <text x="1068" y="40" font-family="Helvetica-Bold" font-size="12" fill="#F05D28">HOJE</text>
    <line x1="390" y1="60" x2="390" y2="350" stroke="#F43F5E" stroke-width="2.5"/>
    <text x="373" y="56" font-family="Helvetica-Bold" font-size="10" fill="#F43F5E">HOJE</text>
    ${Array.from({ length: 13 }, (_, i) => `<line x1="${70 + i * 88}" y1="60" x2="${70 + i * 88}" y2="350" stroke="#E5E7EB" stroke-width="1"/>`).join('')}
    ${Array.from({ length: 4 }, (_, i) => `<line x1="24" y1="${128 + i * 56}" x2="1176" y2="${128 + i * 56}" stroke="#EEF2F7" stroke-width="1"/>`).join('')}

    <path d="M 305 114 L 336 114 L 336 170 L 345 170" stroke="#111827" stroke-width="1.7" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M 515 170 L 548 170 L 548 226 L 556 226" stroke="#111827" stroke-width="1.7" fill="none" stroke-linecap="round" stroke-linejoin="round"/>

    <text x="38" y="150" font-family="Helvetica" font-size="11" fill="#94A3B8">167</text>
    <text x="92" y="150" font-family="Helvetica-Bold" font-size="13" fill="#1F2937">Projeto base</text>
    <rect x="90" y="132" width="230" height="28" rx="14" fill="#0EA5E9"/>
    <rect x="90" y="132" width="180" height="28" rx="14" fill="rgba(255,255,255,0.26)"/>
    <text x="280" y="150" font-family="Helvetica-Bold" font-size="11" fill="#FFFFFF">78%</text>

    <text x="38" y="206" font-family="Helvetica" font-size="11" fill="#94A3B8">168</text>
    <text x="92" y="206" font-family="Helvetica-Bold" font-size="13" fill="#1F2937">Predecessora ligada</text>
    <rect x="310" y="188" width="190" height="28" rx="14" fill="#F05D28"/>
    <rect x="310" y="188" width="98" height="28" rx="14" fill="rgba(255,255,255,0.26)"/>
    <text x="474" y="206" font-family="Helvetica-Bold" font-size="11" fill="#FFFFFF">52%</text>

    <text x="38" y="262" font-family="Helvetica" font-size="11" fill="#94A3B8">169</text>
    <text x="92" y="262" font-family="Helvetica-Bold" font-size="13" fill="#1F2937">Conferencia final</text>
    <rect x="530" y="244" width="150" height="28" rx="14" fill="#0F766E"/>
    <rect x="530" y="244" width="33" height="28" rx="14" fill="rgba(255,255,255,0.26)"/>
    <text x="652" y="262" font-family="Helvetica-Bold" font-size="11" fill="#FFFFFF">22%</text>

    <text x="38" y="318" font-family="Helvetica" font-size="11" fill="#94A3B8">170</text>
    <text x="92" y="318" font-family="Helvetica-Bold" font-size="13" fill="#1F2937">Revisao</text>
    <rect x="750" y="300" width="120" height="28" rx="14" fill="#CBD5E1"/>
    <text x="852" y="318" font-family="Helvetica-Bold" font-size="11" fill="#FFFFFF">0%</text>
  </svg>`;
}

function cardSvg() {
  return `
  <svg xmlns="http://www.w3.org/2000/svg" width="560" height="360" viewBox="0 0 560 360">
    <rect x="1" y="1" width="558" height="358" rx="28" fill="#FFFFFF" stroke="#E5E7EB"/>
    <rect x="22" y="24" width="58" height="24" rx="12" fill="#EFF6FF" stroke="#DBEAFE"/>
    <text x="51" y="40" font-family="Helvetica-Bold" font-size="10" fill="#0F4C81" text-anchor="middle">HID</text>
    <rect x="22" y="60" width="516" height="64" rx="18" fill="#FFFFFF" stroke="#E7EDF4"/>
    <text x="38" y="88" font-family="Helvetica-Bold" font-size="15" fill="#F05D28">OS 045 - PROJETO BASICO SAREM</text>
    <text x="38" y="110" font-family="Helvetica" font-size="11" fill="#64748B">Card mais limpo, sem dado pre-setado, com disciplina no rodape.</text>
    <rect x="22" y="138" width="516" height="76" rx="18" fill="#F0FDF4"/>
    <text x="40" y="164" font-family="Helvetica-Bold" font-size="10" fill="#166534">PARTICIPANTES</text>
    <text x="40" y="188" font-family="Helvetica-Bold" font-size="13" fill="#166534">EXEC 0%</text>
    <circle cx="500" cy="177" r="18" fill="#0F766E"/>
    <text x="500" y="181" font-family="Helvetica-Bold" font-size="10" fill="#FFFFFF" text-anchor="middle">IF</text>
    <rect x="22" y="230" width="516" height="72" rx="18" fill="#F8FAFC" stroke="#E5E7EB"/>
    <text x="160" y="255" font-family="Helvetica-Bold" font-size="10" fill="#94A3B8" text-anchor="middle">INICIO</text>
    <text x="400" y="255" font-family="Helvetica-Bold" font-size="10" fill="#94A3B8" text-anchor="middle">TERMINO</text>
    <text x="160" y="277" font-family="Helvetica-Bold" font-size="12" fill="#475569" text-anchor="middle">27/06/2026</text>
    <text x="400" y="277" font-family="Helvetica-Bold" font-size="12" fill="#475569" text-anchor="middle">25/05/2026</text>
    <rect x="188" y="314" width="184" height="24" rx="12" fill="#EFF6FF" stroke="#DBEAFE"/>
    <text x="280" y="330" font-family="Helvetica-Bold" font-size="10" fill="#0F4C81" text-anchor="middle">HIDRAULICA</text>
  </svg>`;
}

function flowSvg() {
  return `
  <svg xmlns="http://www.w3.org/2000/svg" width="760" height="210" viewBox="0 0 760 210">
    <defs>
      <marker id="arrowHead" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
        <path d="M 0 0 L 10 5 L 0 10 z" fill="#94A3B8"/>
      </marker>
    </defs>
    <rect x="1" y="1" width="758" height="208" rx="22" fill="#FFFFFF" stroke="#E5E7EB"/>
    <rect x="40" y="60" width="152" height="72" rx="18" fill="#FFF7ED" stroke="#F7C7B7"/>
    <text x="116" y="89" font-family="Helvetica-Bold" font-size="15" fill="#F05D28" text-anchor="middle">PLANILHA</text>
    <text x="116" y="110" font-family="Helvetica" font-size="11" fill="#64748B" text-anchor="middle">nutre o Firebase</text>
    <rect x="304" y="42" width="152" height="104" rx="20" fill="#EFF6FF" stroke="#C9E1F7"/>
    <text x="380" y="82" font-family="Helvetica-Bold" font-size="18" fill="#0F4C81" text-anchor="middle">FIREBASE</text>
    <text x="380" y="106" font-family="Helvetica" font-size="11" fill="#64748B" text-anchor="middle">fonte publica do app</text>
    <rect x="568" y="60" width="152" height="72" rx="18" fill="#F0FDF4" stroke="#BBF7D0"/>
    <text x="644" y="89" font-family="Helvetica-Bold" font-size="15" fill="#0F766E" text-anchor="middle">SITE</text>
    <text x="644" y="110" font-family="Helvetica" font-size="11" fill="#64748B" text-anchor="middle">lÃª so do Firebase</text>
    <line x1="192" y1="96" x2="304" y2="96" stroke="#94A3B8" stroke-width="2.2" marker-end="url(#arrowHead)"/>
    <line x1="456" y1="96" x2="568" y2="96" stroke="#94A3B8" stroke-width="2.2" marker-end="url(#arrowHead)"/>
    <path d="M 380 146 C 380 172, 166 172, 116 132" stroke="#F05D28" stroke-width="2.2" fill="none" marker-end="url(#arrowHead)"/>
    <text x="380" y="182" font-family="Helvetica-Bold" font-size="11" fill="#64748B" text-anchor="middle">No site, nada vem direto da planilha.</text>
  </svg>`;
}

// Cover
doc.rect(0, 0, doc.page.width, 122).fill(C.orange);
doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(24).text('Relatorio de hoje', 42, 30);
doc.font('Helvetica').fontSize(11).text(dateLabel, 42, 62);
doc.font('Helvetica').fontSize(11).text('Resumo simples do que foi ajustado no Ecoquanta2, sem inventar dados e sem peso visual demais.', 42, 82, {
  width: 500,
  lineGap: 3,
});
doc.fillColor(C.orange).roundedRect(430, 28, 184, 26, 13).fillAndStroke('#FFFFFF', '#FFFFFF');
doc.fillColor(C.orange).font('Helvetica-Bold').fontSize(9).text('Gantt + Cards + Firebase', 448, 37);

doc.y = 150;
h('O que entrou no pacote');
doc.moveDown(0.2);
p('A meta foi deixar o sistema mais previsivel, menos dependente de cache local e com uma leitura visual mais limpa.');
doc.moveDown(0.4);
bullet('Fonte unica', 'O site passou a ler o preload apenas do Firebase. Saiu o cache local de dados operacionais.');
bullet('Atividades reais', 'A aba de atividades parou de cair em cards ficticios quando a base vem vazia.');
bullet('Gantt mais util', 'Entraram predecessoras visiveis, linha de dependencia, modal central e scroll sincronizado.');
bullet('Cards mais limpos', 'A disciplina foi para o rodape, com miniatura e layout mais organizado.');

doc.moveDown(0.6);
h('Fluxo de dados');
doc.moveDown(0.2);
p('O desenho abaixo mostra o caminho certo: a planilha alimenta o Firebase, e o site trabalha em cima do Firebase. Nada de ir direto na planilha para nao puxar lentidao.');
doc.moveDown(0.3);
renderSvg(flowSvg(), 42, doc.y, 510, 140);

// Gantt page
doc.addPage({ size: 'A4', layout: 'landscape', margin: 34 });
doc.rect(0, 0, doc.page.width, 82).fill(C.blue);
doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(22).text('Gantt', 34, 24);
doc.font('Helvetica').fontSize(10.5).text('Dependencias, linha de hoje, modal central e scroll sincronizado.', 34, 50);
doc.y = 96;
h('O que mudou no Gantt');
doc.moveDown(0.2);
p('A parte mais importante foi parar de deixar o painel quebrado na leitura de predecessoras e transformar o detalhe em um card central, mais direto.', 760);
doc.moveDown(0.2);
renderSvg(ganttSvg(), 34, doc.y, 912, 308);
doc.moveDown(0.7);
bullet('Dependencia visivel', 'Quando existe predecessora inferida, o card agora mostra a dependencia certa no detalhe.');
bullet('Marcador de hoje', 'A linha de hoje acompanha a area visivel do painel.');
bullet('Melhor leitura', 'A barra ganhou porcentagem final, ponta menos saturada e scroll das duas colunas andando junto.');
bullet('Modal central', 'Clique em qualquer atividade e abre o card no meio, com fade in e fade out.');

// Cards page
doc.addPage({ size: 'A4', margin: 42 });
h('Cards e atividades');
doc.moveDown(0.2);
p('Essa parte ficou mais limpa: sem dados pre-setados, com disciplina no rodape e card menos apertado.');
doc.moveDown(0.5);
renderSvg(cardSvg(), 42, doc.y, 510, 328);

doc.moveDown(0.8);
h('Detalhes praticos');
doc.moveDown(0.2);
bullet('Sem mock', 'A aba de atividades nao inventa mais cards quando o Firebase nao devolve dados.');
bullet('Disciplina no rodape', 'O nome da disciplina saiu de cima e ficou centralizado abaixo das datas.');
bullet('Miniatura por disciplina', 'A etiqueta curta da disciplina ficou no card de apoio da coordenacao.');
bullet('Padrao consistente', 'As abas de planejamento e contrato ficaram com o mesmo criterio de filtro.');

doc.moveDown(0.6);
h('Arquivos principais tocados');
doc.moveDown(0.2);
doc.fillColor(C.ink).font('Helvetica').fontSize(10.2).text([
  'src/App.tsx',
  'src/components/Cronograma.tsx',
  'src/components/Atividades.tsx',
  'src/components/CoordenacaoEngenharia.tsx',
  'src/components/CoordenacaoEngenharia/Contrato.tsx',
  'Registrodeatividades/registrodeatividades.gs',
  'src/lib/firebaseDb.ts',
].join('   ·   '), { width: 510, lineGap: 4 });

doc.moveDown(1.0);
doc.fillColor(C.muted).font('Helvetica-Oblique').fontSize(9.5).text('Gerado automaticamente no mesmo dia, com foco em clareza e sem exagero de formatacao.', {
  width: 510,
});

doc.end();
