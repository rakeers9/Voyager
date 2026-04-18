'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { GripVertical } from 'lucide-react';
import TopBar from './TopBar';
import IntelPanel from '../intel/IntelPanel';
import UpNextBar from '../timeline/UpNextBar';
import KeyboardHandler from '../KeyboardHandler';
import ChatOverlay from '../chat/ChatOverlay';

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

export default function DashboardShell({ readOnly = false }: { readOnly?: boolean } = {}) {
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_SIDEBAR);
  const [collapsed, setCollapsed] = useState(false);
  const dragging = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(DEFAULT_SIDEBAR);

  const effectiveWidth = collapsed ? 0 : sidebarWidth;

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
    <div className="flex flex-col h-screen w-screen bg-base">
      <KeyboardHandler />
      <TopBar readOnly={readOnly} />

      <div className="relative flex-1 min-h-0">
        {/* Map — fills entire area */}
        <div className="absolute inset-0">
          <MapViewport sidebarWidth={effectiveWidth} />
        </div>

        {/* Intel sidebar */}
        <div
          className="absolute top-0 left-0 bottom-0 border-r border-white/[0.04] bg-[#09090B]/60 backdrop-blur-2xl backdrop-saturate-150 overflow-hidden z-10 transition-[width] duration-200 ease-out"
          style={{ width: effectiveWidth }}
        >
          {!collapsed && <IntelPanel />}
        </div>

        {/* Resize handle — drag to resize or collapse */}
        <div
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          className="absolute top-0 bottom-0 w-3 z-20 cursor-col-resize flex items-center justify-center group hover:bg-white/[0.02] transition-[left,background-color] duration-200 ease-out border-r border-white/[0.04] bg-[#09090B]/70 backdrop-blur-xl"
          style={{ left: Math.max(0, effectiveWidth - 6) }}
          title="Drag to resize · drag fully left to collapse"
        >
          <GripVertical size={14} className="text-dim" />
        </div>

        {/* Up Next bar */}
        <div
          className="absolute bottom-0 right-0 z-10 transition-[left] duration-200 ease-out"
          style={{ left: effectiveWidth }}
        >
          <UpNextBar />
        </div>

        {/* Chat overlay — hidden in read-only (shared) view */}
        {!readOnly && <ChatOverlay />}
      </div>
    </div>
  );
}
