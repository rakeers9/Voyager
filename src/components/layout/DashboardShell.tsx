'use client';

import dynamic from 'next/dynamic';
import TopBar from './TopBar';
import IntelPanel from '../intel/IntelPanel';
import UpNextBar from '../timeline/UpNextBar';
import KeyboardHandler from '../KeyboardHandler';

const MapViewport = dynamic(() => import('../map/MapViewport'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-base">
      <span className="text-muted text-sm">Loading map…</span>
    </div>
  ),
});

export default function DashboardShell() {
  return (
    <div className="flex flex-col h-screen w-screen bg-base">
      <KeyboardHandler />
      <TopBar />

      {/* Main content: Map is full-bleed, sidebar + bottom bar overlay on top */}
      <div className="relative flex-1 min-h-0">
        {/* Map — fills entire area behind everything */}
        <div className="absolute inset-0">
          <MapViewport />
        </div>
        {/* Intel sidebar */}
        <div className="absolute top-0 left-0 bottom-0 w-[380px] border-r border-white/[0.04] bg-[#09090B]/60 backdrop-blur-2xl backdrop-saturate-150 overflow-hidden z-10">
          <IntelPanel />
        </div>
        {/* Up Next bar — bottom, right of sidebar */}
        <div className="absolute bottom-0 left-[380px] right-0 z-10">
          <UpNextBar />
        </div>
      </div>
    </div>
  );
}
