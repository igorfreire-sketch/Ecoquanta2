import React from 'react';
import { createPortal } from 'react-dom';
import ForceGraph2D, { type ForceGraphMethods } from 'react-force-graph-2d';
import { X } from 'lucide-react';
import { getDisciplineDisplayName } from '../Atividades';
import { getSheetDisciplinas, type AnnotationSheet } from './Anotacoes';

interface MindMapProps {
  sheets: AnnotationSheet[];
  currentUserEmail: string;
  osOptions?: Array<{ codigo: string; nome: string }>;
  onOpenNote: (sheet: AnnotationSheet) => void;
  onClose?: () => void;
  // Versao reduzida pro painel lateral do editor de nota (sem header/filtros), centrada na nota aberta.
  embedded?: boolean;
  highlightId?: string;
}

type Modo = 'geral' | 'os' | 'disciplina';

const COLOR_PUBLICA = '#F05D28';
const COLOR_PRIVADA = '#2563EB';
const COLOR_HUB = '#1F2937';
const COLOR_LINK = '#CBD5E1';
const COLOR_LINK_HOVER = '#EF4444';
const HOVER_FADE_MS = 500;

interface GraphNode {
  id: string;
  name: string;
  kind: 'nota' | 'hub';
  privada?: boolean;
}

// Pai das notas sem OS, pra elas nunca ficarem soltas no mapa.
const HUB_GERAL = 'os:__geral__';

function hexToRgb(hex: string) {
  const clean = hex.replace('#', '');
  const value = parseInt(clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean, 16);
  return { r: (value >> 16) & 255, g: (value >> 8) & 255, b: value & 255 };
}

function mixColors(hexA: string, hexB: string, t: number) {
  const a = hexToRgb(hexA);
  const b = hexToRgb(hexB);
  const r = Math.round(a.r + (b.r - a.r) * t);
  const g = Math.round(a.g + (b.g - a.g) * t);
  const bl = Math.round(a.b + (b.b - a.b) * t);
  return `rgb(${r}, ${g}, ${bl})`;
}

export default function MindMap({ sheets, currentUserEmail, osOptions = [], onOpenNote, onClose, embedded = false, highlightId }: MindMapProps) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const fgRef = React.useRef<ForceGraphMethods<GraphNode, { source: string; target: string }> | undefined>(undefined);
  const [size, setSize] = React.useState({ width: 800, height: 600 });
  const [modo, setModo] = React.useState<Modo>('geral');
  const [filtroDisciplina, setFiltroDisciplina] = React.useState('Todas');
  const [filtroOs, setFiltroOs] = React.useState('Todas');
  const [nodeSize, setNodeSize] = React.useState(6);
  const [fontSize, setFontSize] = React.useState(12);
  const panRef = React.useRef<{ x: number; y: number; cx: number; cy: number } | null>(null);
  const [hoveredNodeId, setHoveredNodeId] = React.useState<string | null>(null);
  const linkFadeRef = React.useRef<Map<any, number>>(new Map());
  const lastFrameTimeRef = React.useRef(performance.now());

  React.useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        setSize({ width: containerRef.current.clientWidth, height: containerRef.current.clientHeight });
      }
    };
    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, []);

  // Publicas + privadas do proprio usuario (privadas de outras pessoas nunca aparecem aqui).
  const visibleSheets = React.useMemo(
    () => sheets.filter((sheet) => sheet.publica !== false || sheet.autorEmail === currentUserEmail),
    [sheets, currentUserEmail]
  );

  const disciplinaOptions = React.useMemo(() => {
    const set = new Set<string>();
    visibleSheets.forEach((sheet) => getSheetDisciplinas(sheet).forEach((item) => set.add(item)));
    return Array.from(set).sort((a, b) => getDisciplineDisplayName(a).localeCompare(getDisciplineDisplayName(b), 'pt-BR'));
  }, [visibleSheets]);

  const osOptionsPresentes = React.useMemo(() => {
    const codes = new Set<string>();
    visibleSheets.forEach((sheet) => { if (sheet.osCodigo) codes.add(sheet.osCodigo); });
    const byCode = new Map(osOptions.map((os) => [os.codigo, os.nome]));
    return Array.from(codes).map((codigo) => ({ codigo, nome: byCode.get(codigo) || codigo })).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  }, [visibleSheets, osOptions]);

  const filteredSheets = React.useMemo(() => visibleSheets.filter((sheet) => {
    const matchesDisciplina = filtroDisciplina === 'Todas' || getSheetDisciplinas(sheet).includes(filtroDisciplina);
    const matchesOs = filtroOs === 'Todas' || sheet.osCodigo === filtroOs;
    return matchesDisciplina && matchesOs;
  }), [visibleSheets, filtroDisciplina, filtroOs]);

  const visibleIds = React.useMemo(() => new Set(filteredSheets.map((sheet) => sheet.id)), [filteredSheets]);
  const sheetById = React.useMemo(() => new Map(filteredSheets.map((sheet) => [sheet.id, sheet])), [filteredSheets]);

  const graphData = React.useMemo(() => {
    const notaNodes: GraphNode[] = filteredSheets.map((sheet) => ({
      id: sheet.id,
      name: sheet.titulo || 'Sem título',
      kind: 'nota',
      privada: sheet.publica === false,
    }));

    if (modo === 'geral') {
      const links: Array<{ source: string; target: string }> = [];
      filteredSheets.forEach((sheet) => {
        (sheet.linkedNoteIds || []).forEach((targetId) => {
          if (visibleIds.has(targetId)) links.push({ source: sheet.id, target: targetId });
        });
      });
      return { nodes: notaNodes, links };
    }

    if (modo === 'os') {
      const hubByCodigo = new Map<string, GraphNode>();
      const links: Array<{ source: string; target: string }> = [];
      filteredSheets.forEach((sheet) => {
        // Nota sem OS cai no hub "Geral": antes ela era pulada e ficava solta no grafo,
        // sem nenhum pai pra se ligar.
        const hubId = sheet.osCodigo ? `os:${sheet.osCodigo}` : HUB_GERAL;
        if (!hubByCodigo.has(hubId)) {
          const nome = sheet.osCodigo
            ? (osOptions.find((os) => os.codigo === sheet.osCodigo)?.nome || sheet.osCodigo)
            : 'Geral';
          hubByCodigo.set(hubId, { id: hubId, name: nome, kind: 'hub' });
        }
        links.push({ source: hubId, target: sheet.id });
      });
      return { nodes: [...hubByCodigo.values(), ...notaNodes], links };
    }

    // modo === 'disciplina'
    const hubByNome = new Map<string, GraphNode>();
    const links: Array<{ source: string; target: string }> = [];
    filteredSheets.forEach((sheet) => {
      getSheetDisciplinas(sheet).forEach((disciplina) => {
        const nome = getDisciplineDisplayName(disciplina);
        const hubId = `disc:${nome}`;
        if (!hubByNome.has(hubId)) hubByNome.set(hubId, { id: hubId, name: nome, kind: 'hub' });
        links.push({ source: hubId, target: sheet.id });
      });
    });
    return { nodes: [...hubByNome.values(), ...notaNodes], links };
  }, [filteredSheets, visibleIds, modo, osOptions]);

  const handleOpenNode = React.useCallback((node: GraphNode) => {
    if (node.kind !== 'nota') return;
    const sheet = sheetById.get(node.id);
    if (sheet) onOpenNote(sheet);
  }, [sheetById, onOpenNote]);

  const hoveredNodeIdRef = React.useRef<string | null>(null);
  const handleNodeHover = React.useCallback((node: GraphNode | null) => {
    const id = node ? String(node.id) : null;
    hoveredNodeIdRef.current = id;
    setHoveredNodeId(id);
  }, []);

  // Roda a cada frame (o canvas ja redesenha continuamente por causa das particulas dos links)
  // e vai aproximando cada link do alvo (1 = link tocando o no em hover, 0 = normal) — e o fade.
  const handleRenderFramePre = React.useCallback(() => {
    const now = performance.now();
    const dt = now - lastFrameTimeRef.current;
    lastFrameTimeRef.current = now;
    const rate = Math.min(1, dt / HOVER_FADE_MS);
    graphData.links.forEach((link: any) => {
      const sourceId = typeof link.source === 'object' ? link.source?.id : link.source;
      const targetId = typeof link.target === 'object' ? link.target?.id : link.target;
      const target = hoveredNodeId !== null && (sourceId === hoveredNodeId || targetId === hoveredNodeId) ? 1 : 0;
      const current = linkFadeRef.current.get(link) ?? 0;
      linkFadeRef.current.set(link, current + (target - current) * rate);
    });
  }, [graphData.links, hoveredNodeId]);

  const linkColorWithHover = React.useCallback((link: any) => {
    const fade = linkFadeRef.current.get(link) ?? 0;
    return fade < 0.01 ? COLOR_LINK : mixColors(COLOR_LINK, COLOR_LINK_HOVER, fade);
  }, []);

  // Raio usado tanto pra desenhar quanto pra area clicavel (nodePointerAreaPaint) — tem que
  // ser exatamente o mesmo calculo, senao a area de clique fica menor/maior que o desenho.
  const getNodeRadius = React.useCallback((node: GraphNode) => {
    const isHub = node.kind === 'hub';
    const isHighlighted = embedded && node.id === highlightId;
    return (isHub ? nodeSize * 1.6 : nodeSize) * (isHighlighted ? 1.3 : 1);
  }, [nodeSize, embedded, highlightId]);

  const paintNodePointerArea = React.useCallback((node: GraphNode & { x?: number; y?: number }, color: string, ctx: CanvasRenderingContext2D) => {
    const radius = getNodeRadius(node);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(node.x || 0, node.y || 0, radius, 0, 2 * Math.PI, false);
    ctx.fill();
  }, [getNodeRadius]);

  // Pan com o botao do meio (scroll), independente de estar em cima de um no —
  // arrastar com o botao esquerdo continua livre pra mover os proprios nos (nativo da lib).
  const clickCandidateRef = React.useRef<{ x: number; y: number; time: number } | null>(null);

  const handleMouseDown = (event: React.MouseEvent) => {
    if (event.button === 1 && fgRef.current) {
      event.preventDefault();
      const center = fgRef.current.centerAt();
      panRef.current = { x: event.clientX, y: event.clientY, cx: center.x, cy: center.y };
      return;
    }
    if (event.button === 0) {
      clickCandidateRef.current = { x: event.clientX, y: event.clientY, time: Date.now() };
    }
  };
  const handleMouseMove = (event: React.MouseEvent) => {
    if (!panRef.current || !fgRef.current) return;
    const zoom = fgRef.current.zoom() || 1;
    const dx = (event.clientX - panRef.current.x) / zoom;
    const dy = (event.clientY - panRef.current.y) / zoom;
    fgRef.current.centerAt(panRef.current.cx - dx, panRef.current.cy - dy, 0);
  };
  const stopPan = () => { panRef.current = null; clickCandidateRef.current = null; };

  // onNodeClick da lib se mostrou pouco confiavel neste app (StrictMode). Deteccao propria:
  // no mouseup, se o ponteiro nao andou quase nada (nao foi um drag), acha o no mais perto
  // do ponto (em coordenadas do grafo) dentro do proprio raio e abre a nota na mao.
  const handleMouseUp = (event: React.MouseEvent) => {
    const candidate = clickCandidateRef.current;
    clickCandidateRef.current = null;
    panRef.current = null;
    if (!candidate || !fgRef.current || !containerRef.current) return;
    const dist = Math.hypot(event.clientX - candidate.x, event.clientY - candidate.y);
    const elapsed = Date.now() - candidate.time;
    if (dist > 6 || elapsed > 600) return;

    const rect = containerRef.current.getBoundingClientRect();
    const graphPoint = fgRef.current.screen2GraphCoords(event.clientX - rect.left, event.clientY - rect.top);
    let closest: GraphNode | null = null;
    let closestDist = Infinity;
    graphData.nodes.forEach((node: any) => {
      if (node.x === undefined || node.y === undefined) return;
      const d = Math.hypot(node.x - graphPoint.x, node.y - graphPoint.y);
      const r = getNodeRadius(node) + 4;
      if (d <= r && d < closestDist) {
        closest = node;
        closestDist = d;
      }
    });
    if (closest) handleOpenNode(closest);
  };

  // Versao embutida: centraliza e da um leve zoom na nota que esta sendo editada assim que a simulacao acomoda.
  const centeredOnHighlightRef = React.useRef<string | undefined>(undefined);
  const handleEmbeddedEngineStop = React.useCallback(() => {
    if (!embedded || !highlightId || !fgRef.current || centeredOnHighlightRef.current === highlightId) return;
    const node = graphData.nodes.find((item) => item.id === highlightId) as GraphNode & { x?: number; y?: number } | undefined;
    if (!node || node.x === undefined || node.y === undefined) return;
    centeredOnHighlightRef.current = highlightId;
    fgRef.current.centerAt(node.x, node.y, 400);
    fgRef.current.zoom(3, 400);
  }, [embedded, highlightId, graphData.nodes]);

  React.useEffect(() => {
    centeredOnHighlightRef.current = undefined;
  }, [highlightId]);

  if (embedded) {
    return (
      <div
        ref={containerRef}
        className="relative h-full w-full overflow-hidden rounded-xl bg-[#FBFCFE]"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={stopPan}
      >
        {graphData.nodes.length === 0 ? (
          <div className="flex h-full items-center justify-center text-center text-[12px] text-[#94A3B8]">Nenhuma anotação para exibir ainda.</div>
        ) : (
          <ForceGraph2D
            ref={fgRef}
            graphData={graphData}
            width={size.width}
            height={size.height}
            backgroundColor="#FBFCFE"
            nodeLabel="name"
            cooldownTicks={100}
            enableZoomInteraction={false}
            nodeColor={(node) => (node.kind === 'hub' ? COLOR_HUB : (node.privada ? COLOR_PRIVADA : COLOR_PUBLICA))}
            linkColor={linkColorWithHover}
            linkWidth={1}
            linkDirectionalArrowLength={3}
            linkDirectionalArrowRelPos={1}
            onEngineStop={handleEmbeddedEngineStop}
            onRenderFramePre={handleRenderFramePre}
            onNodeHover={handleNodeHover}
            onNodeDragEnd={(node) => { node.fx = node.x; node.fy = node.y; }}
            nodePointerAreaPaint={paintNodePointerArea}
            nodeCanvasObject={(node, ctx, globalScale) => {
              const isHub = node.kind === 'hub';
              const isHighlighted = node.id === highlightId;
              const isHovered = node.id === hoveredNodeId;
              const radius = getNodeRadius(node);
              const x = node.x || 0;
              const y = node.y || 0;
              const baseColor = isHub ? COLOR_HUB : (node.privada ? COLOR_PRIVADA : COLOR_PUBLICA);

              if (isHighlighted) {
                ctx.beginPath();
                ctx.arc(x, y, radius + 3, 0, 2 * Math.PI, false);
                ctx.strokeStyle = '#F05D28';
                ctx.lineWidth = 2 / globalScale;
                ctx.stroke();
              }

              ctx.save();
              ctx.shadowColor = 'rgba(15, 23, 42, 0.2)';
              ctx.shadowBlur = 4;
              ctx.beginPath();
              ctx.arc(x, y, radius, 0, 2 * Math.PI, false);
              const gradient = ctx.createRadialGradient(x - radius / 3, y - radius / 3, 0, x, y, radius);
              gradient.addColorStop(0, '#ffffff');
              gradient.addColorStop(0.15, baseColor);
              gradient.addColorStop(1, baseColor);
              ctx.fillStyle = gradient;
              ctx.fill();
              ctx.restore();

              if (isHighlighted || isHovered) {
                const resolvedFontSize = (fontSize + 1) / globalScale;
                ctx.font = `bold ${resolvedFontSize}px Montserrat, sans-serif`;
                ctx.fillStyle = '#111827';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'top';
                ctx.fillText(String(node.name || ''), x, y + radius + 3);
              }
            }}
            onNodeClick={handleOpenNode}
          />
        )}
      </div>
    );
  }

  // Portal pro body: fora do stacking context do <main> (relative z-10), senao o rail (z-40)
  // ficaria por cima deste overlay fullscreen. Assim o z-[200] vale de verdade.
  return createPortal(
    <div className="fixed inset-0 z-[200] flex flex-col overflow-hidden bg-white">
      <div className="flex items-center justify-between gap-4 px-5 py-3">
        <div className="flex items-center gap-4">
          <h2 className="text-[15px] font-black text-[#2D2D2D]">Mapa Mental</h2>
          <span className="text-[11px] text-[#94A3B8]">{graphData.nodes.length} nó(s) · {graphData.links.length} vínculo(s)</span>
          <div className="flex items-center gap-3 text-[11px] font-medium text-[#64748B]">
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: COLOR_PUBLICA }} />
              Pública
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: COLOR_PRIVADA }} />
              Privada
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#E5E7EB] bg-white px-3 text-[12px] font-bold text-[#64748B] transition-colors hover:border-[#F7C7B7] hover:bg-[#F9FAFB] hover:text-[#2D2D2D]"
        >
          <X size={14} />
          Fechar
        </button>
      </div>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <aside className="w-64 flex-shrink-0 overflow-y-auto p-4">
          <div className="mb-5">
            <p className="mb-2 text-[11px] font-bold uppercase tracking-widest text-[#94A3B8]">Modo</p>
            <div className="flex flex-col gap-1.5">
              {([
                ['geral', 'Geral'],
                ['os', 'Por Ordem de Serviço'],
                ['disciplina', 'Por Disciplina'],
              ] as Array<[Modo, string]>).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setModo(value)}
                  className={`h-9 rounded-lg px-3 text-left text-[12px] font-bold transition-colors ${modo === value ? 'bg-[#F05D28] text-white' : 'border border-[#E5E7EB] text-[#64748B] hover:border-[#F7C7B7] hover:text-[#F05D28]'}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="mb-5">
            <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-widest text-[#94A3B8]">Disciplina</label>
            <select
              value={filtroDisciplina}
              onChange={(event) => setFiltroDisciplina(event.target.value)}
              className="h-9 w-full rounded-lg border border-[#E5E7EB] bg-white px-2 text-[12px] font-medium text-[#2D2D2D] outline-none focus:border-[#F05D28]"
            >
              <option value="Todas">Todas</option>
              {disciplinaOptions.map((item) => (
                <option key={item} value={item}>{getDisciplineDisplayName(item)}</option>
              ))}
            </select>
          </div>

          <div className="mb-5">
            <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-widest text-[#94A3B8]">Ordem de Serviço</label>
            <select
              value={filtroOs}
              onChange={(event) => setFiltroOs(event.target.value)}
              className="h-9 w-full rounded-lg border border-[#E5E7EB] bg-white px-2 text-[12px] font-medium text-[#2D2D2D] outline-none focus:border-[#F05D28]"
            >
              <option value="Todas">Todas</option>
              {osOptionsPresentes.map((os) => (
                <option key={os.codigo} value={os.codigo}>{os.nome}</option>
              ))}
            </select>
          </div>

          <div className="mb-5">
            <label className="mb-1.5 flex items-center justify-between text-[11px] font-bold uppercase tracking-widest text-[#94A3B8]">
              Tamanho da letra <span className="text-[#2D2D2D]">{fontSize}px</span>
            </label>
            <input
              type="range"
              min={8}
              max={20}
              value={fontSize}
              onChange={(event) => setFontSize(Number(event.target.value))}
              className="w-full accent-[#F05D28]"
            />
          </div>

          <div>
            <label className="mb-1.5 flex items-center justify-between text-[11px] font-bold uppercase tracking-widest text-[#94A3B8]">
              Tamanho dos nós <span className="text-[#2D2D2D]">{nodeSize}px</span>
            </label>
            <input
              type="range"
              min={3}
              max={16}
              value={nodeSize}
              onChange={(event) => setNodeSize(Number(event.target.value))}
              className="w-full accent-[#F05D28]"
            />
          </div>
        </aside>

        <div
          ref={containerRef}
          className="relative min-h-0 flex-1"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={stopPan}
        >
          {graphData.nodes.length === 0 ? (
            <div className="flex h-full items-center justify-center text-[13px] text-[#757575]">Nenhuma anotação para exibir ainda.</div>
          ) : (
            <ForceGraph2D
              ref={fgRef}
              graphData={graphData}
              width={size.width}
              height={size.height}
              backgroundColor="#FBFCFE"
              nodeLabel="name"
              cooldownTicks={100}
              nodeColor={(node) => (node.kind === 'hub' ? COLOR_HUB : (node.privada ? COLOR_PRIVADA : COLOR_PUBLICA))}
              linkColor={linkColorWithHover}
              linkWidth={1.2}
              linkDirectionalParticles={1}
              linkDirectionalParticleWidth={2}
              linkDirectionalParticleColor={linkColorWithHover}
              linkDirectionalArrowLength={4}
              linkDirectionalArrowRelPos={1}
              onRenderFramePre={handleRenderFramePre}
              onNodeHover={handleNodeHover}
              onNodeDragEnd={(node) => { node.fx = node.x; node.fy = node.y; }}
              nodePointerAreaPaint={paintNodePointerArea}
              nodeCanvasObject={(node, ctx, globalScale) => {
                const label = String(node.name || '');
                const isHub = node.kind === 'hub';
                const isHovered = node.id === hoveredNodeId;
                const radius = getNodeRadius(node);
                const resolvedFontSize = (isHub || isHovered ? fontSize + 1 : fontSize) / globalScale;
                const x = node.x || 0;
                const y = node.y || 0;

                ctx.save();
                ctx.shadowColor = 'rgba(15, 23, 42, 0.25)';
                ctx.shadowBlur = 6;
                ctx.beginPath();
                ctx.arc(x, y, radius, 0, 2 * Math.PI, false);
                const gradient = ctx.createRadialGradient(x - radius / 3, y - radius / 3, 0, x, y, radius);
                const baseColor = isHub ? COLOR_HUB : (node.privada ? COLOR_PRIVADA : COLOR_PUBLICA);
                gradient.addColorStop(0, '#ffffff');
                gradient.addColorStop(0.15, baseColor);
                gradient.addColorStop(1, baseColor);
                ctx.fillStyle = gradient;
                ctx.fill();
                ctx.restore();

                ctx.font = `${isHub || isHovered ? 'bold ' : ''}${resolvedFontSize}px Montserrat, sans-serif`;
                ctx.fillStyle = isHovered ? '#111827' : (isHub ? '#111827' : '#2D2D2D');
                ctx.textAlign = 'center';
                ctx.textBaseline = 'top';
                ctx.fillText(label, x, y + radius + 2);
              }}
              onNodeClick={handleOpenNode}
            />
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
