import React from 'react';
import { Bug, ClipboardList, Lightbulb, MapPin, X, Send, MousePointer2 } from 'lucide-react';

export type FeedbackKind = 'bug' | 'request' | 'idea';

export interface FeedbackTarget {
  path: string;
  x: number;
  y: number;
  dataTarget?: string;
}

export interface FeedbackDraft {
  kind: FeedbackKind;
  title: string;
  description: string;
  target?: FeedbackTarget;
}

interface FeedbackLauncherProps {
  onSubmit: (draft: FeedbackDraft) => Promise<void> | void;
}

type LauncherMode = 'closed' | 'menu' | 'bug-target' | 'idea-form' | 'idea-target' | 'form';
type HoveredTarget = { left: number; top: number; width: number; height: number };

function getTarget(event: PointerEvent, target: Element | null): FeedbackTarget {
  const marker = target?.closest<HTMLElement>('[data-feedback-target]')?.getAttribute('data-feedback-target') || undefined;
  return {
    path: window.location.pathname,
    x: Math.round((event.clientX / Math.max(window.innerWidth, 1)) * 10000) / 10000,
    y: Math.round((event.clientY / Math.max(window.innerHeight, 1)) * 10000) / 10000,
    ...(marker ? { dataTarget: marker.slice(0, 120) } : {}),
  };
}

function getInspectableTargetAtPoint(clientX: number, clientY: number): Element | null {
  const target = document.elementFromPoint(clientX, clientY);
  if (!target || target.closest('[data-feedback-ui]')) return null;
  return target;
}

function getTargetRect(target: Element | null): HoveredTarget | null {
  if (!target) return null;
  const { left, top, width, height } = target.getBoundingClientRect();
  return { left, top, width, height };
}

export default function FeedbackLauncher({ onSubmit }: FeedbackLauncherProps) {
  const [mode, setMode] = React.useState<LauncherMode>('closed');
  const [draft, setDraft] = React.useState<FeedbackDraft>({ kind: 'bug', title: '', description: '' });
  const [sending, setSending] = React.useState(false);
  const [error, setError] = React.useState('');
  const [hoveredTarget, setHoveredTarget] = React.useState<HoveredTarget | null>(null);
  const [pointerPosition, setPointerPosition] = React.useState<{ x: number; y: number } | null>(null);

  const close = React.useCallback(() => {
    setMode('closed');
    setError('');
    setSending(false);
    setHoveredTarget(null);
    setPointerPosition(null);
  }, []);

  React.useEffect(() => {
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    window.addEventListener('keydown', onEscape);
    return () => window.removeEventListener('keydown', onEscape);
  }, [close]);

  React.useEffect(() => {
    if (mode !== 'bug-target' && mode !== 'idea-target') return undefined;

    const previousCursor = document.body.style.cursor;
    document.body.style.cursor = 'crosshair';

    const onPointerMove = (event: PointerEvent) => {
      const target = getInspectableTargetAtPoint(event.clientX, event.clientY);
      setPointerPosition({ x: event.clientX, y: event.clientY });
      setHoveredTarget(getTargetRect(target));
    };

    const onPointerDown = (event: PointerEvent) => {
      // Capture only the safe location metadata. Never serialize the DOM, screenshot,
      // input values, cookies, or any part of the clicked element beyond its opt-in marker.
      const target = getInspectableTargetAtPoint(event.clientX, event.clientY);
      event.preventDefault();
      event.stopPropagation();
      if (!target) return;
      setDraft((current) => ({ ...current, target: getTarget(event, target) }));
      setMode('form');
    };
    window.addEventListener('pointermove', onPointerMove, true);
    window.addEventListener('pointerdown', onPointerDown, true);
    return () => {
      window.removeEventListener('pointermove', onPointerMove, true);
      window.removeEventListener('pointerdown', onPointerDown, true);
      document.body.style.cursor = previousCursor;
    };
  }, [mode]);

  const chooseBug = () => {
    setDraft({ kind: 'bug', title: '', description: '' });
    setError('');
    setHoveredTarget(null);
    setPointerPosition(null);
    setMode('bug-target');
  };

  const chooseIdea = () => {
    setDraft({ kind: 'idea', title: '', description: '' });
    setError('');
    setMode('idea-form');
  };

  const chooseRequest = () => {
    setDraft({ kind: 'request', title: '', description: '' });
    setError('');
    setMode('idea-form');
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!draft.description.trim()) {
      setError('Descreva o que está acontecendo.');
      return;
    }
    setSending(true);
    setError('');
    try {
      await onSubmit({ ...draft, title: draft.title.trim(), description: draft.description.trim() });
      close();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Não foi possível enviar agora.');
      setSending(false);
    }
  };

  const title = draft.kind === 'bug' ? 'Relatar bug' : draft.kind === 'request' ? 'Pedir alteração' : 'Enviar ideia';

  return (
    <>
      {/* z acima do teto do app (z-[500] em Atividades.tsx/SearchableSelect.tsx), senão fica por baixo das telas fullscreen (Notas, Mapa mental) */}
      <div data-feedback-ui className="fixed left-1/2 top-2 z-[600] -translate-x-1/2 font-['Montserrat']">
        <button
          type="button"
          aria-haspopup="menu"
          aria-expanded={mode !== 'closed'}
          onClick={() => setMode((current) => current === 'closed' ? 'menu' : 'closed')}
          className="inline-flex h-9 items-center gap-2 rounded-full border border-[#F6B39A] bg-white/95 px-4 text-[12px] font-bold text-[#B9461E] shadow-[0_8px_22px_-12px_rgba(15,23,42,0.55)] backdrop-blur transition hover:bg-[#FFF7F3]"
        >
          <MapPin size={14} aria-hidden />
          Feedback
        </button>
        {mode === 'menu' && (
          <div role="menu" className="absolute left-1/2 mt-2 w-52 -translate-x-1/2 rounded-2xl border border-[#E5E7EB] bg-white p-2 shadow-xl">
            <button type="button" role="menuitem" onClick={chooseBug} className="flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-[#FFF4EE]">
              <Bug size={17} className="mt-0.5 text-[#F05D28]" />
              <span><strong className="block text-[12px] text-[#2D2D2D]">Relatar bug</strong><small className="text-[11px] text-[#757575]">Marque onde está o problema</small></span>
            </button>
            <button type="button" role="menuitem" onClick={chooseIdea} className="flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-[#FFF4EE]">
              <Lightbulb size={17} className="mt-0.5 text-[#F05D28]" />
              <span><strong className="block text-[12px] text-[#2D2D2D]">Enviar ideia</strong><small className="text-[11px] text-[#757575]">Sugira uma melhoria</small></span>
            </button>
            <button type="button" role="menuitem" onClick={chooseRequest} className="flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-[#FFF4EE]">
              <ClipboardList size={17} className="mt-0.5 text-[#F05D28]" />
              <span><strong className="block text-[12px] text-[#2D2D2D]">Pedir alteração</strong><small className="text-[11px] text-[#757575]">Descreva a mudança necessária</small></span>
            </button>
          </div>
        )}
      </div>

      {(mode === 'bug-target' || mode === 'idea-target') && (
        <div className="pointer-events-none fixed inset-0 z-[590] bg-[#F05D28]/[0.06]" aria-live="polite">
          {hoveredTarget && <div className="absolute rounded-md border-2 border-[#F05D28] bg-[#F05D28]/[0.12] shadow-[0_0_0_1px_rgba(255,255,255,0.85)]" style={hoveredTarget} />}
          {pointerPosition && (
            <div className="absolute h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[#F05D28] bg-white/60 shadow-[0_0_0_1px_rgba(255,255,255,0.85)]" style={{ left: pointerPosition.x, top: pointerPosition.y }} />
          )}
          <div data-feedback-ui className="pointer-events-auto absolute left-1/2 top-16 -translate-x-1/2 rounded-full bg-[#2D2D2D] px-4 py-2 text-[12px] font-bold text-white shadow-lg">
            Clique no local {mode === 'bug-target' ? 'do bug' : draft.kind === 'request' ? 'do pedido' : 'da ideia'} · Esc para cancelar
          </div>
        </div>
      )}

      {mode === 'idea-form' && (
        <div className="fixed inset-0 z-[610] flex items-center justify-center bg-slate-950/35 p-4" onClick={close}>
          <form onSubmit={submit} onClick={(event) => event.stopPropagation()} className="w-full max-w-lg rounded-3xl border border-[#E5E7EB] bg-white p-6 shadow-2xl">
            <FormHeader title={title} onClose={close} />
            <FormFields draft={draft} setDraft={setDraft} error={error} />
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <button type="button" onClick={() => setMode('idea-target')} className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#E5E7EB] px-3 text-[12px] font-bold text-[#757575] hover:bg-[#F9FAFB]"><MousePointer2 size={15} />Marcar local (opcional)</button>
              <button type="submit" disabled={sending} className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#F05D28] px-5 text-[12px] font-bold text-white hover:bg-[#D94E1F] disabled:opacity-60"><Send size={15} />{sending ? 'Enviando...' : draft.kind === 'request' ? 'Enviar pedido' : 'Enviar ideia'}</button>
            </div>
          </form>
        </div>
      )}

      {mode === 'form' && (
        <div className="fixed inset-0 z-[610] flex items-center justify-center bg-slate-950/35 p-4" onClick={close}>
          <form onSubmit={submit} onClick={(event) => event.stopPropagation()} className="w-full max-w-lg rounded-3xl border border-[#E5E7EB] bg-white p-6 shadow-2xl">
            <FormHeader title={title} onClose={close} />
            <div className="mb-4 rounded-xl bg-[#FFF7F3] px-3 py-2 text-[12px] font-medium text-[#9A4A2C]">Local marcado nesta tela. Você pode complementar com a descrição abaixo.</div>
            <FormFields draft={draft} setDraft={setDraft} error={error} />
            <div className="mt-4 flex justify-end"><button type="submit" disabled={sending} className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#F05D28] px-5 text-[12px] font-bold text-white hover:bg-[#D94E1F] disabled:opacity-60"><Send size={15} />{sending ? 'Enviando...' : draft.kind === 'request' ? 'Enviar pedido' : 'Enviar relato'}</button></div>
          </form>
        </div>
      )}
    </>
  );
}

function FormHeader({ title, onClose }: { title: string; onClose: () => void }) {
  return <div className="mb-5 flex items-center justify-between gap-4"><h2 className="text-[18px] font-black text-[#2D2D2D]">{title}</h2><button type="button" aria-label="Fechar" onClick={onClose} className="rounded-full p-2 text-[#94A3B8] hover:bg-[#F3F4F6] hover:text-[#2D2D2D]"><X size={17} /></button></div>;
}

function FormFields({ draft, setDraft, error }: { draft: FeedbackDraft; setDraft: React.Dispatch<React.SetStateAction<FeedbackDraft>>; error: string }) {
  return <div className="space-y-3">
    <label className="block text-[12px] font-bold text-[#757575]">Título (opcional)<input value={draft.title} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} maxLength={140} className="mt-1.5 h-11 w-full rounded-xl border border-[#E5E7EB] px-3 text-[13px] text-[#2D2D2D] outline-none focus:border-[#F05D28]" placeholder={draft.kind === 'bug' ? 'Ex.: botão não salva' : 'Ex.: filtro por disciplina'} /></label>
    <label className="block text-[12px] font-bold text-[#757575]">{draft.kind === 'bug' ? 'O que está acontecendo?' : draft.kind === 'request' ? 'Qual alteração você precisa?' : 'Qual é a sua ideia?'}<textarea required value={draft.description} onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))} maxLength={4000} rows={5} className="mt-1.5 w-full resize-y rounded-xl border border-[#E5E7EB] px-3 py-3 text-[13px] leading-relaxed text-[#2D2D2D] outline-none focus:border-[#F05D28]" placeholder={draft.kind === 'bug' ? 'Descreva o que você esperava e o que aconteceu.' : draft.kind === 'request' ? 'Descreva a alteração necessária.' : 'Descreva a melhoria que você gostaria de ver.'} /></label>
    {error && <p role="alert" className="text-[12px] font-bold text-[#B91C1C]">{error}</p>}
  </div>;
}
