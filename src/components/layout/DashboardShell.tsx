'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { GripVertical, X } from 'lucide-react';
import TopBar from './TopBar';
import IntelPanel from '../intel/IntelPanel';
import UpNextBar from '../timeline/UpNextBar';
import KeyboardHandler from '../KeyboardHandler';
import ChatOverlay from '../chat/ChatOverlay';
import useViewStore from '@/stores/viewStore';

const MapViewport = dynamic(() => import('../map/MapViewport'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-base">
      <span className="text-muted text-sm">Loading map…</span>
    </div>
  ),
});

const MIN_SIDEBAR = 0;
const MAX_SIDEBAR = 520;
const DEFAULT_SIDEBAR = 380;
const COLLAPSE_THRESHOLD = 80;
const MOBILE_BREAKPOINT = 768;

export default function DashboardShell({ readOnly = false }: { readOnly?: boolean } = {}) {
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_SIDEBAR);
  const [collapsed, setCollapsed] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const dragging = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(DEFAULT_SIDEBAR);

  const mobilePanelOpen = useViewStore((s) => s.mobilePanelOpen);
  const setMobilePanelOpen = useViewStore((s) => s.setMobilePanelOpen);

  // Track viewport size to switch layout modes.
  useEffect(() => {
    const update = () => setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  // Close drawer when leaving mobile so it doesn't linger as overlay on resize.
  useEffect(() => {
    if (!isMobile) setMobilePanelOpen(false);
  }, [isMobile, setMobilePanelOpen]);

  const desktopWidth = collapsed ? 0 : sidebarWidth;
  // On mobile, the sidebar overlays the map (no map shift) — pass 0.
  const mapSidebarWidth = isMobile ? 0 : desktopWidth;

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    dragging.current = true;
    startX.current = e.clientX;
    startWidth.current = collapsed ? 0 : sidebarWidth;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [sidebarWidth, collapsed]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging.current) return;
    const delta = e.clientX - startX.current;
    const newWidth = Math.max(MIN_SIDEBAR, Math.min(MAX_SIDEBAR, startWidth.current + delta));
    if (newWidth < COLLAPSE_THRESHOLD) {
      setCollapsed(true);
    } else {
      setCollapsed(false);
      setSidebarWidth(newWidth);
    }
  }, []);

  const onPointerUp = useCallback(() => {
    dragging.current = false;
  }, []);

  useEffect(() => {
    const prevent = (e: Event) => { if (dragging.current) e.preventDefault(); };
    document.addEventListener('selectstart', prevent);
    return () => document.removeEventListener('selectstart', prevent);
  }, []);

  return (
    <div className="flex flex-col h-[100dvh] w-screen bg-base overflow-hidden">
      <KeyboardHandler />
      <TopBar readOnly={readOnly} />

      <div className="relative flex-1 min-h-0">
        {/* Map — fills entire area. `z-0` creates a stacking context so
            Mapbox DOM markers (e.g. the playhead arrow with its own
            z-index) can't escape above the sidebar/bottom bar. */}
        <div className="absolute inset-0 z-0">
          <MapViewport sidebarWidth={mapSidebarWidth} />
        </div>

        {/* Backdrop for mobile drawer */}
        {isMobile && mobilePanelOpen && (
          <div
            onClick={() => setMobilePanelOpen(false)}
            className="absolute inset-0 z-20 bg-black/40 backdrop-blur-sm md:hidden"
          />
        )}

        {/* Intel sidebar — desktop: resizable; mobile: full-screen drawer */}
        <div
          className={`absolute top-0 left-0 bottom-0 border-r border-white/[0.04] bg-[#09090B]/85 md:bg-[#09090B]/60 backdrop-blur-2xl backdrop-saturate-150 overflow-hidden z-30 md:z-10 transition-[width,transform] duration-200 ease-out
            ${isMobile ? (mobilePanelOpen ? 'translate-x-0' : '-translate-x-full') : ''}
          `}
          style={{
            width: isMobile ? 'min(92vw, 420px)' : desktopWidth,
          }}
        >
          {/* Mobile close button */}
          {isMobile && (
            <button
              type="button"
              onClick={() => setMobilePanelOpen(false)}
              aria-label="Close panel"
              className="absolute top-2 right-2 z-50 w-8 h-8 flex items-center justify-center rounded-sm text-dim hover:text-heading hover:bg-white/[0.06] transition-colors md:hidden"
            >
              <X size={16} />
            </button>
          )}
          {(!collapsed || isMobile) && <IntelPanel />}
        </div>

        {/* Resize handle — desktop only */}
        <div
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          className="hidden md:flex absolute top-0 bottom-0 w-3 z-20 cursor-col-resize items-center justify-center group hover:bg-white/[0.02] transition-[left,background-color] duration-200 ease-out border-r border-white/[0.04] bg-[#09090B]/70 backdrop-blur-xl"
          style={{ left: Math.max(0, desktopWidth - 6) }}
          title="Drag to resize · drag fully left to collapse"
        >
          <GripVertical size={14} className="text-dim" />
        </div>

        {/* Up Next bar — desktop only (hidden on small screens for breathing room) */}
        <div
          className="hidden md:block absolute bottom-0 right-0 z-10 transition-[left] duration-200 ease-out"
          style={{ left: desktopWidth }}
        >
          <UpNextBar />
        </div>

        {/* Chat overlay — hidden in read-only (shared) view */}
        {!readOnly && <ChatOverlay />}
      </div>
    </div>
  );
}
