import React from 'react';
import { createPortal } from 'react-dom';

// Codigo secreto: setas cima cima baixo baixo esquerda direita esquerda direita + A B.
const KONAMI = ['arrowup', 'arrowup', 'arrowdown', 'arrowdown', 'arrowleft', 'arrowright', 'arrowleft', 'arrowright', 'a', 'b'];

// Easter egg escondido: um chase preto-e-branco de boneco de palito. Fica montado sempre; so
// escuta o codigo. Quando aberto, marca document.body.dataset.minigame pra pausar atalhos do app
// (ex.: navegacao por setas nas sub-abas).
export default function KonamiGame() {
  const [aberto, setAberto] = React.useState(false);
  const bufferRef = React.useRef<string[]>([]);
  const fechar = React.useCallback(() => setAberto(false), []);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      bufferRef.current = [...bufferRef.current, e.key.toLowerCase()].slice(-KONAMI.length);
      if (bufferRef.current.join(',') === KONAMI.join(',')) {
        bufferRef.current = [];
        setAberto(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  React.useEffect(() => {
    if (aberto) document.body.dataset.minigame = 'on';
    else delete document.body.dataset.minigame;
    return () => { delete document.body.dataset.minigame; };
  }, [aberto]);

  if (!aberto) return null;
  return createPortal(<Jogo onFechar={fechar} />, document.body);
}

function Jogo({ onFechar }: { onFechar: () => void }) {
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const fecharRef = React.useRef(onFechar);
  fecharRef.current = onFechar;
  const [pontos, setPontos] = React.useState(0);

  React.useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const W = 640;
    const H = 400;
    const laneYs = [H * 0.33, H * 0.5, H * 0.67];
    const playerX = 90;
    const KICK = 50; // distancia pra alcancar e chutar

    let gap = 320;      // distancia ate o boneco da frente
    let pLane = 1;      // via do jogador (0..2)
    let tLane = 1;      // via do alvo
    let score = 0;
    let frame = 0;
    let lastSpawn = 0;
    let tLaneTimer = 0;
    let kickFlash = 0;
    let speedMult = 1;      // sobe a cada 100 pts ("aumento") — tudo fica mais rapido
    let nextRaise = 100;
    let raiseFlash = 0;
    const obs: Array<{ x: number; lane: number }> = [];
    let raf = 0;
    let vivo = true;

    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (k === 'escape') { fecharRef.current(); return; }
      if (k === 'arrowup' || k === 'w') { pLane = Math.max(0, pLane - 1); e.preventDefault(); }
      if (k === 'arrowdown' || k === 's') { pLane = Math.min(2, pLane + 1); e.preventDefault(); }
    };
    window.addEventListener('keydown', onKey);

    // Boneco de palito preto. phase (0/1) da o passo; kicking estica a perna pra frente.
    const drawStick = (x: number, y: number, phase: number, kicking: boolean) => {
      ctx.strokeStyle = '#000';
      ctx.fillStyle = '#000';
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.beginPath(); ctx.arc(x, y - 26, 7, 0, Math.PI * 2); ctx.fill();           // cabeca
      ctx.beginPath(); ctx.moveTo(x, y - 19); ctx.lineTo(x, y - 2); ctx.stroke();    // tronco
      ctx.beginPath();                                                               // bracos
      ctx.moveTo(x, y - 15); ctx.lineTo(x + (phase ? 8 : 10), y - 11);
      ctx.moveTo(x, y - 15); ctx.lineTo(x - (phase ? 8 : 6), y - 9);
      ctx.stroke();
      ctx.beginPath();                                                               // pernas
      if (kicking) {
        ctx.moveTo(x, y - 2); ctx.lineTo(x + 17, y - 7);
        ctx.moveTo(x, y - 2); ctx.lineTo(x - 5, y + 10);
      } else if (phase) {
        ctx.moveTo(x, y - 2); ctx.lineTo(x + 7, y + 10);
        ctx.moveTo(x, y - 2); ctx.lineTo(x - 7, y + 8);
      } else {
        ctx.moveTo(x, y - 2); ctx.lineTo(x + 4, y + 11);
        ctx.moveTo(x, y - 2); ctx.lineTo(x - 4, y + 11);
      }
      ctx.stroke();
    };

    const loop = () => {
      if (!vivo) return;
      frame++;
      const base = Math.max(0, score);
      const velObs = Math.min(4.4, 2.1 + base * 0.02) * speedMult;  // aceleram com placar e aumentos
      const spawnEvery = Math.max(16, (64 - base) / speedMult);

      gap -= 1.15 * speedMult;                              // jogador levemente mais rapido
      for (const o of obs) o.x -= velObs;
      for (let i = obs.length - 1; i >= 0; i--) if (obs[i].x < -30) obs.splice(i, 1);

      if (frame - lastSpawn > spawnEvery) {
        lastSpawn = frame;
        obs.push({ x: W + 20, lane: Math.floor(Math.random() * 3) });
      }

      // Bateu num quadrado na sua via: -10 pontos e empurrao pra tras.
      for (let i = obs.length - 1; i >= 0; i--) {
        if (obs[i].lane === pLane && Math.abs(obs[i].x - playerX) < 20) {
          gap += 55;
          score -= 10;
          setPontos(score);
          obs.splice(i, 1);
        }
      }

      if (frame - tLaneTimer > 80) { tLaneTimer = frame; tLane = Math.floor(Math.random() * 3); }

      if (gap < KICK) {
        if (pLane === tLane) {
          score += 10;
          setPontos(score);
          kickFlash = 10;
          gap = 320;                                        // chutou: se distancia de novo
        } else {
          gap = KICK;                                       // do lado, mas via errada: nao passa
        }
      }
      if (kickFlash > 0) kickFlash--;

      // Chegou a mais 100 pontos: "aumento" — mensagem na tela e tudo acelera.
      if (score >= nextRaise) {
        nextRaise += 100;
        speedMult += 0.35;
        raiseFlash = 140;
      }
      if (raiseFlash > 0) raiseFlash--;

      // ---- desenho (fundo branco, tudo preto) ----
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = '#d4d4d4';
      ctx.lineWidth = 2;
      ctx.setLineDash([10, 10]);
      for (let l = 0; l <= 3; l++) {
        const y = H * 0.25 + (H * 0.5) * (l / 3);
        ctx.beginPath(); ctx.moveTo(20, y); ctx.lineTo(W - 20, y); ctx.stroke();
      }
      ctx.setLineDash([]);

      const phase = Math.floor(frame / Math.max(8, Math.round(20 / speedMult))) % 2; // ~3fps, acelera com aumento
      ctx.fillStyle = '#000';
      for (const o of obs) ctx.fillRect(o.x - 11, laneYs[o.lane] - 11, 22, 22);

      const tx = Math.min(W - 40, playerX + gap);
      drawStick(tx, laneYs[tLane], phase, false);
      drawStick(playerX, laneYs[pLane], phase, kickFlash > 0);

      ctx.fillStyle = '#000';
      ctx.font = 'bold 16px monospace';
      ctx.fillText(`PONTOS ${score}`, 16, 27);
      if (kickFlash > 0) {
        ctx.font = 'bold 18px monospace';
        ctx.fillText('CHUTE! +10', tx - 34, laneYs[tLane] - 42);
      }
      if (raiseFlash > 0) {
        ctx.textAlign = 'center';
        ctx.font = 'bold 30px monospace';
        ctx.fillText('VOCÊ GANHOU AUMENTO!', W / 2, H / 2 - 6);
        ctx.font = 'bold 14px monospace';
        ctx.fillText('tudo ficou mais rápido', W / 2, H / 2 + 20);
        ctx.textAlign = 'left';
      }

      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => { vivo = false; cancelAnimationFrame(raf); window.removeEventListener('keydown', onKey); };
  }, []); // roda uma vez; usa fecharRef pra fechar sem reiniciar o jogo a cada re-render do app

  return (
    <div className="fixed inset-0 z-[400] flex items-center justify-center bg-black/70 p-4" onClick={onFechar}>
      <div className="flex flex-col items-center gap-3 rounded-2xl bg-white p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex w-full items-center justify-between">
          <p className="font-mono text-[13px] font-black tracking-widest text-black">CORRE-CHUTE · {pontos} pts</p>
          <button type="button" onClick={onFechar} className="font-mono text-[12px] font-bold text-black hover:text-[#F05D28]">ESC ✕</button>
        </div>
        <canvas ref={canvasRef} width={640} height={400} className="rounded-lg border-2 border-black" style={{ imageRendering: 'pixelated' }} />
        <p className="font-mono text-[11px] text-neutral-500">↑ / ↓ trocam de via · alcance o boneco na mesma via pra dar o chute · ESC sai</p>
      </div>
    </div>
  );
}
