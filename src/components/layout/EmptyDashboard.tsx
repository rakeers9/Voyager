'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Compass, ChevronDown, LogOut, Plus, Sparkles, Loader2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { createDraftTrip } from '@/lib/createDraftTrip';
import useTripsListStore from '@/stores/tripsListStore';

export default function EmptyDashboard() {
  const router = useRouter();
  const { user, signOut } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const handleCreateTrip = async () => {
    if (creating) return;
    setCreating(true);
    const result = await createDraftTrip();
    if (result) {
      useTripsListStore.getState().addDraftTrip(result.trip);
      router.push(`/new?id=${result.id}`);
    } else {
      setCreating(false);
    }
  };

  useEffect(() => {
    if (!menuOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [menuOpen]);

  return (
    <div className="flex flex-col h-screen w-screen bg-base">
      {/* TopBar — minimal */}
      <div className="flex items-center gap-3 px-4 h-11 border-b border-white/[0.04] bg-base shrink-0">
        <div ref={menuRef} className="relative shrink-0">
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="flex items-center gap-2 px-2 py-1.5 rounded-sm hover:bg-elevated/60 transition-colors"
          >
            <div className="w-5 h-5 rounded-sm bg-info/10 border border-info/20 flex items-center justify-center">
              <Compass size={12} className="text-info" />
            </div>
            <span className="text-heading font-semibold text-[13px] tracking-wide">VOYAGER</span>
            <ChevronDown size={11} className={`text-dim transition-transform ${menuOpen ? 'rotate-180' : ''}`} />
          </button>

          {menuOpen && (
            <div className="absolute top-full left-0 mt-1 w-64 bg-surface border border-white/[0.04] rounded-sm shadow-lg shadow-black/60 z-50 overflow-hidden">
              <div className="p-1.5">
                <p className="px-2 py-1 text-[9px] font-semibold uppercase tracking-widest text-dim">Signed in</p>
                <p className="px-2 py-1 text-[12px] text-muted truncate">{user?.email ?? '-'}</p>
              </div>
              <div className="border-t border-t-white/[0.03]" />
              <div className="p-1.5">
                <button
                  onClick={() => { setMenuOpen(false); signOut(); }}
                  className="w-full flex items-center gap-2.5 px-2 py-2 rounded-sm text-dim hover:text-primary hover:bg-elevated/50 transition-colors text-left"
                >
                  <LogOut size={13} />
                  <span className="text-[13px]">Log out</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Empty-state hero */}
      <div className="flex-1 flex items-center justify-center">
        <div className="max-w-md text-center px-6">
          <div className="w-14 h-14 rounded-md bg-info/10 border border-info/20 flex items-center justify-center mx-auto mb-6">
            <Sparkles size={22} className="text-info" />
          </div>
          <h1 className="text-heading text-xl font-semibold mb-2">No trips yet</h1>
          <p className="text-[13px] text-dim leading-relaxed mb-6">
            Plan your first trip with the Voyager chatbot. Describe where you want to go, and it'll generate a full itinerary you can play back on the map.
          </p>
          <button
            onClick={handleCreateTrip}
            disabled={creating}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-sm bg-info text-white text-[13px] font-semibold hover:bg-info/90 disabled:opacity-60 transition-colors"
          >
            {creating ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            Create your first trip
          </button>
        </div>
      </div>
    </div>
  );
}
