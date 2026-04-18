'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { X, MessageCircle, Compass, GripHorizontal } from 'lucide-react';
import ChatPanel from './ChatPanel';
import useChatStore from '@/stores/chatStore';
import useTripsListStore from '@/stores/tripsListStore';

const STORAGE_KEY = 'voyager.chat.rect';
const MIN_W = 320;
const MIN_H = 360;
const DEFAULT_W = 400;
const DEFAULT_H = 640;
const EDGE_MARGIN = 12;

type Rect = { x: number; y: number; w: number; h: number };
type Handle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw' | 'move';

function clamp(v: number, lo: number, hi: number) {
  return Math.min(Math.max(v, lo), hi);
}

function loadRect(): Rect | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Rect) : null;
  } catch {
    return null;
  }
}

export default function ChatOverlay({ defaultOpen = false }: { defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const [rect, setRect] = useState<Rect | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const parentSizeRef = useRef<{ w: number; h: number }>({ w: 0, h: 0 });

  // Sync chat history to the currently active trip so the bot can edit it.
  const activeTripId = useTripsListStore((s) => s.activeTripId);
  const chatTripId = useChatStore((s) => s.tripId);
  const loadForTrip = useChatStore((s) => s.loadForTrip);
  const resetChat = useChatStore((s) => s.reset);
  useEffect(() => {
    if (activeTripId && activeTripId !== chatTripId) {
      loadForTrip(activeTripId);
    } else if (!activeTripId && chatTripId) {
      resetChat();
    }
  }, [activeTripId, chatTripId, loadForTrip, resetChat]);

  // Measure parent and initialize rect on first open
  useEffect(() => {
    if (!open) return;
    const parent = wrapperRef.current?.parentElement;
    if (!parent) return;

    const measure = () => {
      const r = parent.getBoundingClientRect();
      parentSizeRef.current = { w: r.width, h: r.height };
      setRect((prev) => {
        const init =
          prev ??
          loadRect() ??
          {
            w: DEFAULT_W,
            h: Math.min(DEFAULT_H, r.height - EDGE_MARGIN * 2),
            x: r.width - DEFAULT_W - EDGE_MARGIN,
            y: Math.max(EDGE_MARGIN, (r.height - DEFAULT_H) / 2),
          };
        return clampRect(init, r.width, r.height);
      });
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(parent);
    return () => ro.disconnect();
  }, [open]);

  // Persist
  useEffect(() => {
    if (!rect) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(rect));
    } catch {
      /* ignore */
    }
  }, [rect]);

  const startInteraction = useCallback(
    (e: React.PointerEvent, handle: Handle) => {
      if (!rect) return;
      e.preventDefault();
      e.stopPropagation();
      const target = e.currentTarget as HTMLElement;
      target.setPointerCapture(e.pointerId);

      const startX = e.clientX;
      const startY = e.clientY;
      const start = { ...rect };
      const { w: pW, h: pH } = parentSizeRef.current;

      const onMove = (ev: PointerEvent) => {
        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;
        let next: Rect = { ...start };

        if (handle === 'move') {
          next.x = start.x + dx;
          next.y = start.y + dy;
        } else {
          if (handle.includes('e')) next.w = start.w + dx;
          if (handle.includes('s')) next.h = start.h + dy;
          if (handle.includes('w')) {
            next.w = start.w - dx;
            next.x = start.x + dx;
          }
          if (handle.includes('n')) {
            next.h = start.h - dy;
            next.y = start.y + dy;
          }

          // Enforce min size while keeping the opposite edge anchored
          if (next.w < MIN_W) {
            if (handle.includes('w')) next.x = start.x + start.w - MIN_W;
            next.w = MIN_W;
          }
          if (next.h < MIN_H) {
            if (handle.includes('n')) next.y = start.y + start.h - MIN_H;
            next.h = MIN_H;
          }
        }

        setRect(clampRect(next, pW, pH));
      };

      const onUp = () => {
        target.releasePointerCapture?.(e.pointerId);
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onUp);
      };

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onUp);
    },
    [rect]
  );

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open chat"
        className="absolute top-14 right-3 z-20 w-9 h-9 flex items-center justify-center rounded-sm border border-white/10 bg-black/70 backdrop-blur-sm text-white/70 hover:text-white hover:bg-black/80 transition-colors shadow-lg shadow-black/40"
      >
        <MessageCircle size={16} />
      </button>
    );
  }

  // Reserve a mount point even before rect is measured (so the parent ref resolves)
  const style: React.CSSProperties = rect
    ? { left: rect.x, top: rect.y, width: rect.w, height: rect.h }
    : { visibility: 'hidden', left: 0, top: 0, width: DEFAULT_W, height: DEFAULT_H };

  return (
    <div
      ref={wrapperRef}
      className="absolute z-20 border border-white/[0.08] rounded-md bg-[#09090B]/92 backdrop-blur-xl shadow-2xl shadow-black/60 flex flex-col overflow-hidden select-none"
      style={style}
    >
      {/* Header — drag handle */}
      <div
        onPointerDown={(e) => startInteraction(e, 'move')}
        className="shrink-0 flex items-center gap-2 px-3 h-9 border-b border-white/[0.06] bg-white/[0.02] cursor-grab active:cursor-grabbing"
      >
        <div className="w-5 h-5 rounded-sm bg-info/10 border border-info/20 flex items-center justify-center">
          <Compass size={11} className="text-info" />
        </div>
        <span className="text-[12px] font-semibold tracking-[0.14em] text-heading uppercase">
          Voyager
        </span>
        <GripHorizontal size={12} className="text-dim ml-1" />
        <div className="flex-1" />
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => setOpen(false)}
          aria-label="Close chat"
          className="w-6 h-6 flex items-center justify-center rounded-sm text-dim hover:text-heading hover:bg-white/[0.06] transition-colors"
        >
          <X size={13} />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 min-h-0 select-text">
        <ChatPanel />
      </div>

      {/* Resize handles */}
      <ResizeEdges onStart={startInteraction} />
    </div>
  );
}

function clampRect(r: Rect, pW: number, pH: number): Rect {
  const w = clamp(r.w, MIN_W, Math.max(MIN_W, pW));
  const h = clamp(r.h, MIN_H, Math.max(MIN_H, pH));
  const x = clamp(r.x, 0, Math.max(0, pW - w));
  const y = clamp(r.y, 0, Math.max(0, pH - h));
  return { x, y, w, h };
}

function ResizeEdges({
  onStart,
}: {
  onStart: (e: React.PointerEvent, handle: Handle) => void;
}) {
  const edge = 'absolute';
  return (
    <>
      {/* edges */}
      <div
        onPointerDown={(e) => onStart(e, 'n')}
        className={`${edge} top-0 left-2 right-2 h-1.5 cursor-ns-resize`}
      />
      <div
        onPointerDown={(e) => onStart(e, 's')}
        className={`${edge} bottom-0 left-2 right-2 h-1.5 cursor-ns-resize`}
      />
      <div
        onPointerDown={(e) => onStart(e, 'w')}
        className={`${edge} left-0 top-2 bottom-2 w-1.5 cursor-ew-resize`}
      />
      <div
        onPointerDown={(e) => onStart(e, 'e')}
        className={`${edge} right-0 top-2 bottom-2 w-1.5 cursor-ew-resize`}
      />
      {/* corners */}
      <div
        onPointerDown={(e) => onStart(e, 'nw')}
        className={`${edge} top-0 left-0 w-3 h-3 cursor-nwse-resize`}
      />
      <div
        onPointerDown={(e) => onStart(e, 'ne')}
        className={`${edge} top-0 right-0 w-3 h-3 cursor-nesw-resize`}
      />
      <div
        onPointerDown={(e) => onStart(e, 'sw')}
        className={`${edge} bottom-0 left-0 w-3 h-3 cursor-nesw-resize`}
      />
      <div
        onPointerDown={(e) => onStart(e, 'se')}
        className={`${edge} bottom-0 right-0 w-3 h-3 cursor-nwse-resize`}
      />
    </>
  );
}
