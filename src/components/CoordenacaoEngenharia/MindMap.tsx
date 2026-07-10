import React from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import { X } from 'lucide-react';
import type { AnnotationSheet } from './Anotacoes';

interface MindMapProps {
  sheets: AnnotationSheet[];
  currentUserEmail: string;
  onOpenNote: (sheet: AnnotationSheet) => void;
  onClose: () => void;
}

const COLOR_PUBLICA = '#F05D28';
const COLOR_PRIVADA = '#2563EB';
const COLOR_LINK = '#CBD5E1';
const NODE_RADIUS = 6;
const HIT_RADIUS = NODE_RADIUS + 6;

interface OverlayNode {
  id: string;
  x: number;
  y: number;
  name: string;
}

export default function MindMap({ sheets, currentUserEmail, onOpenNote, onClose }: MindMapProps) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const fgRef = React.useRef<any>(null);
  const [size, setSize] = React.useState({ width: 800, height: 600 });
  const [overlay, setOverlay] = React.useState<OverlayNode[]>([]);

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
  const visibleIds = React.useMemo(() => new Set(visibleSheets.map((sheet) => sheet.id)), [visibleSheets]);
  const sheetById = React.useMemo(() => new Map(visibleSheets.map((sheet) => [sheet.id, sheet])), [visibleSheets]);

  const graphData = React.useMemo(() => {
    const nodes = visibleSheets.map((sheet) => ({
      id: sheet.id,
      name: sheet.titulo || 'Sem título',
      privada: sheet.publica === false,
    }));
    const links: Array<{ source: string; target: string }> = [];
    visibleSheets.forEach((sheet) => {
      (sheet.linkedNoteIds || []).forEach((targetId) => {
        if (visibleIds.has(targetId)) links.push({ source: sheet.id, target: targetId });
      });
    });
    return { nodes, links };
  }, [visibleSheets, visibleIds]);

  // react-force-graph desenha os nos num <canvas> — nao ha elemento DOM por no pra
  // receber onClick do React. Em vez de depender do listener de clique interno da
  // lib (que se mostrou pouco confiavel: nao dispara em StrictMode/alguns setups),
  // desenhamos so o visual no canvas e sobrepomos botoes HTML invisiveis nas mesmas
  // coordenadas (via graph2ScreenCoords, que ja leva em conta pan/zoom), garantindo
  // clique via evento React nativo.
  const recomputeOverlay = React.useCallback(() => {
    const fg = fgRef.current;
    if (!fg) return;
    const next: OverlayNode[] = graphData.nodes.map((node: any) => {
      const screen = fg.graph2ScreenCoords(node.x || 0, node.y || 0);
      return { id: String(node.id), x: screen.x, y: screen.y, name: node.name };
    });
    setOverlay(next);
  }, [graphData.nodes]);

  const handleOpenNode = React.useCallback((id: string) => {
    const sheet = sheetById.get(id);
    if (sheet) onOpenNote(sheet);
  }, [sheetById, onOpenNote]);

  return (
    <div className="fixed inset-0 z-[200] flex flex-col overflow-hidden bg-white">
      <div className="flex items-center justify-between gap-4 border-b border-[#E5E7EB] px-5 py-2.5">
        <div className="flex items-center gap-4">
          <h2 className="text-[15px] font-black text-[#2D2D2D]">Mapa Mental</h2>
          <span className="text-[11px] text-[#94A3B8]">{graphData.nodes.length} nota(s) · {graphData.links.length} vínculo(s)</span>
          <div className="flex items-center gap-3 text-[11px] font-medium text-[#64748B]">
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: COLOR_PUBLICA }} />
              Pública
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: COLOR_PRIVADA }} />
              Privada (só suas)
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

      <div ref={containerRef} className="relative min-h-0 flex-1">
        {graphData.nodes.length === 0 ? (
          <div className="flex h-full items-center justify-center text-[13px] text-[#757575]">Nenhuma anotação para exibir ainda.</div>
        ) : (
          <>
            <ForceGraph2D
              ref={fgRef}
              graphData={graphData}
              width={size.width}
              height={size.height}
              nodeLabel="name"
              cooldownTicks={100}
              nodeColor={(node: any) => (node.privada ? COLOR_PRIVADA : COLOR_PUBLICA)}
              linkColor={() => COLOR_LINK}
              linkDirectionalArrowLength={4}
              linkDirectionalArrowRelPos={1}
              onEngineTick={recomputeOverlay}
              onEngineStop={recomputeOverlay}
              onZoom={recomputeOverlay}
              nodeCanvasObject={(node: any, ctx, globalScale) => {
                const label = String(node.name || '');
                const fontSize = 12 / globalScale;
                const x = node.x || 0;
                const y = node.y || 0;

                ctx.beginPath();
                ctx.arc(x, y, NODE_RADIUS, 0, 2 * Math.PI, false);
                ctx.fillStyle = node.privada ? COLOR_PRIVADA : COLOR_PUBLICA;
                ctx.fill();

                ctx.font = `${fontSize}px Montserrat, sans-serif`;
                ctx.fillStyle = '#2D2D2D';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'top';
                ctx.fillText(label, x, y + NODE_RADIUS + 2);
              }}
              onNodeClick={(node: any) => handleOpenNode(String(node.id))}
            />
            <div className="pointer-events-none absolute inset-0">
              {overlay.map((node) => (
                <button
                  key={node.id}
                  type="button"
                  title={node.name}
                  onClick={() => handleOpenNode(node.id)}
                  className="pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2 cursor-pointer rounded-full"
                  style={{ left: node.x, top: node.y, width: HIT_RADIUS * 2, height: HIT_RADIUS * 2 }}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
