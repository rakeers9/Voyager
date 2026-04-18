'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Compass, MapPin, ChevronDown, LogOut, Map, Plus } from 'lucide-react';
import dynamic from 'next/dynamic';
import ChatOverlay from '../chat/ChatOverlay';
import useChatStore from '@/stores/chatStore';
import useTripsListStore from '@/stores/tripsListStore';
import { createDraftTrip } from '@/lib/createDraftTrip';
import { useAuth } from '@/hooks/useAuth';

const MapViewport = dynamic(() => import('../map/MapViewport'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-base">
      <span className="text-muted text-sm">Loading map...</span>
    </div>
  ),
});

export default function NewTripShell() {
  const router = useRouter();
  const params = useSearchParams();
  const activeDraftId = params.get('id');
  const currentPlan = useChatStore((s) => s.currentPlan);
  const reset = useChatStore((s) => s.reset);
  const savedTrips = useTripsListStore((s) => s.trips);
  const switchToTrip = useTripsListStore((s) => s.switchToTrip);
  const loaded = useTripsListStore((s) => s.loaded);
  const loadFromSupabase = useTripsListStore((s) => s.loadFromSupabase);
  const { user, signOut } = useAuth();

  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!loaded && user) loadFromSupabase();
  }, [loaded, user, loadFromSupabase]);

  const activeTrip = savedTrips.find((t) => t.trip.id === activeDraftId);
  const headerTitle = currentPlan?.title || activeTrip?.trip.title || 'Untitled Trip';

  useEffect(() => {
    if (!menuOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [menuOpen]);

  const handleTripClick = (tripId: string) => {
    setMenuOpen(false);
    const saved = savedTrips.find((t) => t.trip.id === tripId);
    if (saved?.trip.status === 'draft') {
      reset();
      router.push(`/new?id=${tripId}`);
    } else {
      reset();
      switchToTrip(tripId);
      router.push('/');
    }
  };

  return (
    <div className="flex flex-col h-screen w-screen bg-base">
      {/* Top bar — same VOYAGER dropdown as main dashboard */}
      <div className="flex items-center gap-3 px-4 h-11 border-b border-white/[0.04] bg-base shrink-0">
        {/* Logo dropdown */}
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
                <p className="px-2 py-1 text-[9px] font-semibold uppercase tracking-widest text-dim">Your Trips</p>
                {savedTrips.map((saved) => {
                  const isActive = saved.trip.id === activeDraftId;
                  // For the trip we're currently editing, prefer the (possibly-renamed) plan title.
                  const displayTitle = isActive && currentPlan?.title ? currentPlan.title : saved.trip.title;
                  return (
                    <button
                      key={saved.trip.id}
                      onClick={() => handleTripClick(saved.trip.id)}
                      className={`w-full flex items-center gap-2.5 px-2 py-2 rounded-sm text-left transition-colors ${
                        isActive ? 'bg-info/8 text-heading' : 'text-muted hover:text-primary hover:bg-elevated/50'
                      }`}
                    >
                      <Map size={13} className={isActive ? 'text-info' : 'text-dim'} />
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] truncate">{displayTitle}</p>
                        <p className="text-[10px] font-mono text-dim">
                          {saved.trip.status === 'draft'
                            ? (isActive ? 'Draft · In progress' : 'Draft — tap to continue')
                            : `${saved.trip.start_date} to ${saved.trip.end_date}`}
                        </p>
                      </div>
                      {isActive && <div className="w-1.5 h-1.5 rounded-full bg-info shrink-0" />}
                    </button>
                  );
                })}
              </div>
              {/* New trip button */}
              <div className="border-t border-t-white/[0.03]" />
              <div className="p-1.5">
                <button
                  onClick={async () => {
                    setMenuOpen(false);
                    reset();
                    const result = await createDraftTrip();
                    if (result) {
                      useTripsListStore.getState().addDraftTrip(result.trip);
                      router.push(`/new?id=${result.id}`);
                    }
                  }}
                  className="w-full flex items-center gap-2.5 px-2 py-2 rounded-sm text-info hover:bg-info/8 transition-colors text-left"
                >
                  <Plus size={13} />
                  <span className="text-[13px] font-medium">New Trip</span>
                </button>
              </div>
              <div className="border-t border-t-white/[0.03]" />
              <div className="p-1.5">
                <button
                  onClick={() => { setMenuOpen(false); signOut(); }}
                  className="w-full flex items-center gap-2.5 px-2 py-2 rounded-sm text-dim hover:text-primary hover:bg-elevated/50 transition-colors text-left"
                >
                  <LogOut size={13} />
                  <span className="text-[13px]">{user ? 'Log out' : 'Sign in'}</span>
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="w-px h-4 bg-white/[0.03] shrink-0" />

        <span className="text-heading font-semibold text-[13px] tracking-wide uppercase truncate">{headerTitle}</span>
      </div>

      {/* Main content: placeholder left, map center, chat right */}
      <div className="relative flex-1 min-h-0">
        <div className="absolute inset-0">
          <MapViewport empty />
        </div>

        <div className="absolute top-0 left-0 bottom-0 w-[340px] border-r border-white/[0.06] bg-[#09090B]/85 backdrop-blur-xl z-10 overflow-y-auto">
          {currentPlan ? (
            <PlanPreview plan={currentPlan} />
          ) : (
            <EmptyPlaceholder />
          )}
        </div>

        <ChatOverlay defaultOpen />
      </div>
    </div>
  );
}

function EmptyPlaceholder() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-6">
      <div className="w-12 h-12 rounded-sm bg-white/[0.03] border border-white/[0.06] flex items-center justify-center mb-4">
        <MapPin size={24} className="text-dim" />
      </div>
      <h3 className="text-heading text-[15px] font-semibold mb-2">No Trip Yet</h3>
      <p className="text-[13px] text-dim leading-relaxed">
        Paste or upload your trip plan on the right. Once parsed, your itinerary will appear here.
      </p>
    </div>
  );
}

function PlanPreview({ plan }: { plan: import('@/lib/tripBuilder').TripPlanData }) {
  return (
    <div className="px-4 py-4">
      <div className="mb-4">
        <h2 className="text-heading text-base font-bold">{plan.title}</h2>
        <p className="text-[12px] text-dim mt-1">{plan.description}</p>
        <p className="text-[11px] font-mono text-dim mt-1">
          {plan.start_date} to {plan.end_date}
        </p>
      </div>

      <div className="space-y-1">
        {plan.stops.map((stop, i) => (
          <div key={i} className="flex items-start gap-2 py-1.5">
            <div className="w-4 text-[11px] font-mono text-dim text-right shrink-0 mt-0.5">
              {i + 1}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] text-primary truncate">{stop.name}</p>
              <p className="text-[11px] text-dim">
                {stop.category} · {stop.duration_minutes}min
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
