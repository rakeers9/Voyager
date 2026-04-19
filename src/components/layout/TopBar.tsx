'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  ChevronDown, LogOut, Map, Compass, Plus,
  Play, Pause, SkipBack, SkipForward, ListOrdered, Trash2,
  MoreVertical, Share2, Menu,
} from 'lucide-react';
import useTripStore from '@/stores/tripStore';
import usePlaybackStore from '@/stores/playbackStore';
import useTripsListStore from '@/stores/tripsListStore';
import useViewStore from '@/stores/viewStore';
import { getSegmentColor } from '@/lib/colors';
import { formatTime, formatDate, getDayStartMs } from '@/lib/time';
import { useAuth } from '@/hooks/useAuth';
import { createDraftTrip } from '@/lib/createDraftTrip';
import ItineraryModal from '../ItineraryModal';
import ShareTripModal from '../ShareTripModal';
import EditableText from '../inline/EditableText';

const MIN_SPEED = 1;
const MAX_SPEED = 500;

export default function TopBar({ readOnly = false }: { readOnly?: boolean } = {}) {
  const router = useRouter();
  const trip = useTripStore((s) => s.trip);
  const stats = useTripStore((s) => s.stats);
  const segments = useTripStore((s) => s.segments);

  const savedTrips = useTripsListStore((s) => s.trips);
  const activeTripId = useTripsListStore((s) => s.activeTripId);
  const switchToTrip = useTripsListStore((s) => s.switchToTrip);
  const deleteTrip = useTripsListStore((s) => s.deleteTrip);
  const renameTrip = useTripsListStore((s) => s.renameTrip);
  const loaded = useTripsListStore((s) => s.loaded);
  const loadFromSupabase = useTripsListStore((s) => s.loadFromSupabase);

  const { user, signOut } = useAuth();
  const toggleMobilePanel = useViewStore((s) => s.toggleMobilePanel);

  // Load saved trips from Supabase on mount (once).
  // Skip in read-only (shared) mode — viewer doesn't need a trip list.
  useEffect(() => {
    if (!readOnly && !loaded && user) loadFromSupabase();
  }, [readOnly, loaded, user, loadFromSupabase]);

  const isPlaying = usePlaybackStore((s) => s.isPlaying);
  const playbackSpeed = usePlaybackStore((s) => s.playbackSpeed);
  const cursorTime = usePlaybackStore((s) => s.cursorTime);
  const currentSegmentIndex = usePlaybackStore((s) => s.currentSegmentIndex);
  const tripStartTime = usePlaybackStore((s) => s.tripStartTime);
  const tripEndTime = usePlaybackStore((s) => s.tripEndTime);
  const togglePlay = usePlaybackStore((s) => s.togglePlay);
  const setSpeed = usePlaybackStore((s) => s.setSpeed);
  const stepForward = usePlaybackStore((s) => s.stepForward);
  const stepBackward = usePlaybackStore((s) => s.stepBackward);
  const seekTo = usePlaybackStore((s) => s.seekTo);
  const jumpToSegment = usePlaybackStore((s) => s.jumpToSegment);

  const [menuOpen, setMenuOpen] = useState(false);
  const [itineraryOpen, setItineraryOpen] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [tripMenuOpen, setTripMenuOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [confirmDeleteActive, setConfirmDeleteActive] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const tripMenuRef = useRef<HTMLDivElement>(null);
  const scrubberRef = useRef<HTMLDivElement>(null);

  const totalDuration = tripEndTime - tripStartTime;
  const playheadPos = totalDuration > 0 ? ((cursorTime - tripStartTime) / totalDuration) * 100 : 0;
  const tz = trip?.timezone ?? 'UTC';

  // Day dividers for scrubber
  const dayDividers: { pos: number }[] = [];
  if (trip && stats) {
    for (let d = 1; d <= stats.totalDays - 1; d++) {
      const dayMs = getDayStartMs(d + 1, tripStartTime, tz);
      const pos = ((dayMs - tripStartTime) / totalDuration) * 100;
      if (pos > 0 && pos < 100) dayDividers.push({ pos });
    }
  }

  // Close dropdown on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
        setConfirmDeleteId(null);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [menuOpen]);

  // Close trip menu on outside click
  useEffect(() => {
    if (!tripMenuOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (tripMenuRef.current && !tripMenuRef.current.contains(e.target as Node)) {
        setTripMenuOpen(false);
        setConfirmDeleteActive(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [tripMenuOpen]);

  const handleShare = () => {
    if (!trip) return;
    setTripMenuOpen(false);
    setShareOpen(true);
  };

  const shareUrl = trip ? `${typeof window !== 'undefined' ? window.location.origin : ''}/share/${trip.id}` : '';

  const handleDeleteActive = async () => {
    if (!trip) return;
    setDeleting(true);
    await deleteTrip(trip.id);
    setDeleting(false);
    setConfirmDeleteActive(false);
    setTripMenuOpen(false);
  };

  const handleConfirmDelete = async (tripId: string) => {
    setDeleting(true);
    await deleteTrip(tripId);
    setDeleting(false);
    setConfirmDeleteId(null);
  };

  // Scrubber click
  const handleScrubberClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!scrubberRef.current) return;
      const rect = scrubberRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const progress = Math.max(0, Math.min(1, x / rect.width));
      seekTo(tripStartTime + progress * totalDuration);
    },
    [tripStartTime, totalDuration, seekTo]
  );

  return (
    <div className="flex items-center gap-2 md:gap-3 px-2 md:px-4 h-11 border-b border-white/[0.04] bg-base shrink-0">
      {/* Mobile-only: open Intel panel drawer */}
      {!readOnly && (
        <button
          type="button"
          onClick={toggleMobilePanel}
          aria-label="Open trip details"
          className="md:hidden flex items-center justify-center w-9 h-9 rounded-sm bg-white/[0.04] border border-white/[0.06] text-heading active:bg-white/[0.08] transition-colors shrink-0"
        >
          <Menu size={17} />
        </button>
      )}

      {/* Logo dropdown (interactive only when not read-only) */}
      <div ref={menuRef} className="relative shrink-0">
        <button
          onClick={() => { if (!readOnly) setMenuOpen(!menuOpen); }}
          disabled={readOnly}
          className={`flex items-center gap-2 px-2 py-1.5 rounded-sm transition-colors ${
            readOnly ? 'cursor-default' : 'hover:bg-elevated/60'
          }`}
        >
          <div className="w-5 h-5 rounded-sm bg-info/10 border border-info/20 flex items-center justify-center">
            <Compass size={12} className="text-info" />
          </div>
          <span className="hidden sm:inline text-heading font-semibold text-[13px] tracking-wide">VOYAGER</span>
          {!readOnly && (
            <ChevronDown size={11} className={`text-dim transition-transform ${menuOpen ? 'rotate-180' : ''}`} />
          )}
        </button>

        {menuOpen && !readOnly && (
          <div className="absolute top-full left-0 mt-1 w-64 bg-surface border border-white/[0.04] rounded-sm shadow-lg shadow-black/60 z-50 overflow-hidden">
            <div className="p-1.5">
              <p className="px-2 py-1 text-[9px] font-semibold uppercase tracking-widest text-dim">Your Trips</p>
              {savedTrips.map((saved) => {
                const isActive = saved.trip.id === activeTripId;
                const isConfirming = confirmDeleteId === saved.trip.id;

                if (isConfirming) {
                  return (
                    <div
                      key={saved.trip.id}
                      className="flex items-center gap-2 px-2 py-2 rounded-sm bg-danger/8 border border-danger/20"
                    >
                      <Trash2 size={13} className="text-danger shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-[12px] text-heading truncate">Delete &ldquo;{saved.trip.title}&rdquo;?</p>
                        <p className="text-[10px] text-dim">This cannot be undone.</p>
                      </div>
                      <button
                        disabled={deleting}
                        onClick={(e) => { e.stopPropagation(); handleConfirmDelete(saved.trip.id); }}
                        className="text-[11px] font-medium px-2 py-1 rounded-sm bg-danger/20 text-danger hover:bg-danger/30 disabled:opacity-50 transition-colors"
                      >
                        {deleting ? '...' : 'Delete'}
                      </button>
                      <button
                        disabled={deleting}
                        onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(null); }}
                        className="text-[11px] px-2 py-1 rounded-sm text-dim hover:text-primary hover:bg-elevated/50 disabled:opacity-50 transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  );
                }

                return (
                  <div
                    key={saved.trip.id}
                    className={`group w-full flex items-center gap-1 pr-1 rounded-sm transition-colors ${
                      isActive ? 'bg-info/8 text-heading' : 'text-muted hover:text-primary hover:bg-elevated/50'
                    }`}
                  >
                    <button
                      onClick={() => {
                        setMenuOpen(false);
                        if (saved.trip.status === 'draft') {
                          router.push(`/new?id=${saved.trip.id}`);
                        } else {
                          switchToTrip(saved.trip.id);
                        }
                      }}
                      className="flex items-center gap-2.5 flex-1 min-w-0 px-2 py-2 text-left"
                    >
                      <Map size={13} className={isActive ? 'text-info' : 'text-dim'} />
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] truncate">{saved.trip.title}</p>
                        <p className="text-[10px] font-mono text-dim">
                          {saved.trip.status === 'draft' ? 'Draft, tap to continue' : `${saved.trip.start_date} to ${saved.trip.end_date}`}
                        </p>
                      </div>
                      {isActive && <div className="w-1.5 h-1.5 rounded-full bg-info shrink-0" />}
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(saved.trip.id); }}
                      title="Delete trip"
                      className="shrink-0 flex items-center justify-center w-6 h-6 rounded-sm text-dim opacity-0 group-hover:opacity-100 hover:text-danger hover:bg-danger/10 transition-all"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                );
              })}
            </div>
            <div className="border-t border-t-white/[0.03]" />
            <div className="p-1.5">
              <button
                onClick={async () => {
                  setMenuOpen(false);
                  const result = await createDraftTrip();
                  if (result) {
                    useTripsListStore.getState().addDraftTrip(result.trip);
                    router.push(`/new?id=${result.id}`);
                  } else {
                    router.push('/new');
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

      {/* Trip title + menu */}
      {trip && !readOnly ? (
        <h1 className="text-heading font-semibold text-[13px] tracking-wide uppercase shrink-0 max-w-[16ch] sm:max-w-[40ch] truncate">
          <EditableText
            value={trip.title}
            onSave={(next) => renameTrip(trip.id, next)}
            placeholder="Untitled Trip"
            ariaLabel="Edit trip title"
            className="block truncate"
          />
        </h1>
      ) : (
        <h1 className="text-heading font-semibold text-[13px] tracking-wide uppercase shrink-0 truncate max-w-[16ch] sm:max-w-[40ch]">
          {trip?.title ?? 'Untitled Trip'}
        </h1>
      )}

      {readOnly ? (
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[10px] font-mono uppercase tracking-widest text-dim px-1.5 py-0.5 rounded-sm border border-white/[0.06] bg-white/[0.02]">
            Shared · Read-only
          </span>
          <button
            onClick={() => router.push('/login')}
            className="text-[11px] font-medium px-2 py-1 rounded-sm bg-info/15 text-info hover:bg-info/25 transition-colors"
          >
            Sign in to build your own
          </button>
        </div>
      ) : (
      <div ref={tripMenuRef} className="relative shrink-0">
        <button
          onClick={() => { setTripMenuOpen((o) => !o); setConfirmDeleteActive(false); }}
          disabled={!trip}
          className="flex items-center justify-center w-6 h-6 rounded-sm text-dim hover:text-heading hover:bg-white/[0.06] transition-colors disabled:opacity-40 disabled:hover:bg-transparent"
          title="Trip menu"
        >
          <MoreVertical size={14} />
        </button>

        {tripMenuOpen && trip && (
          <div className="absolute top-full left-0 mt-1 w-48 bg-surface border border-white/[0.04] rounded-sm shadow-lg shadow-black/60 z-50 overflow-hidden">
            {confirmDeleteActive ? (
              <div className="p-2 bg-danger/8">
                <p className="text-[11px] text-heading mb-2 leading-snug">
                  Delete &ldquo;{trip.title}&rdquo;? This cannot be undone.
                </p>
                <div className="flex items-center gap-1.5">
                  <button
                    disabled={deleting}
                    onClick={handleDeleteActive}
                    className="flex-1 text-[11px] font-medium px-2 py-1 rounded-sm bg-danger/20 text-danger hover:bg-danger/30 disabled:opacity-50 transition-colors"
                  >
                    {deleting ? '...' : 'Delete'}
                  </button>
                  <button
                    disabled={deleting}
                    onClick={() => setConfirmDeleteActive(false)}
                    className="flex-1 text-[11px] px-2 py-1 rounded-sm text-dim hover:text-primary hover:bg-elevated/50 disabled:opacity-50 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="p-1">
                <TripMenuItem
                  icon={<ListOrdered size={13} />}
                  label="View Itinerary"
                  onClick={() => { setTripMenuOpen(false); setItineraryOpen(true); }}
                />
                <TripMenuItem
                  icon={<Share2 size={13} />}
                  label="Share Trip"
                  onClick={handleShare}
                />
                <TripMenuItem
                  icon={<Trash2 size={13} />}
                  label="Delete Trip"
                  danger
                  onClick={() => setConfirmDeleteActive(true)}
                />
              </div>
            )}
          </div>
        )}
      </div>
      )}

      <div className="w-px h-4 bg-white/[0.03] shrink-0" />

      {/* Transport controls — desktop only; mobile has a bottom player bar */}
      <div className="hidden md:flex items-center gap-0.5 shrink-0">
        <ControlButton onClick={stepBackward} title="Previous segment">
          <SkipBack size={13} />
        </ControlButton>
        <button
          onClick={togglePlay}
          className={`flex items-center justify-center w-7 h-7 rounded-sm transition-colors ${
            isPlaying ? 'bg-info/15 text-info hover:bg-info/20' : 'bg-elevated/60 text-heading hover:bg-elevated'
          }`}
          title={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? <Pause size={13} /> : <Play size={13} className="ml-0.5" />}
        </button>
        <ControlButton onClick={stepForward} title="Next segment">
          <SkipForward size={13} />
        </ControlButton>
      </div>

      {/* Scrubber — fills remaining space (desktop only; too narrow on phones) */}
      <div
        ref={scrubberRef}
        className="hidden md:flex relative flex-1 h-4 rounded-sm overflow-hidden cursor-pointer border border-white/[0.03]"
        onClick={handleScrubberClick}
      >
        {segments.map((seg, i) => {
          const segDuration = seg.endTime - seg.startTime;
          const widthPercent = totalDuration > 0 ? Math.max(0.3, (segDuration / totalDuration) * 100) : 0;
          const color = getSegmentColor(seg);
          const isActive = i === currentSegmentIndex;
          const isPast = i < currentSegmentIndex;

          return (
            <div
              key={seg.id}
              onClick={(e) => { e.stopPropagation(); jumpToSegment(i); }}
              className="relative h-full group"
              style={{
                width: `${widthPercent}%`,
                backgroundColor: color,
                opacity: isPast ? 0.25 : isActive ? 1 : 0.5,
                borderRight: '1px solid rgba(11,17,32,0.5)',
              }}
              title={`${seg.title}\n${formatTime(seg.startTime, tz)} – ${formatTime(seg.endTime, tz)}`}
            >
              {seg.type === 'walk' && (
                <div className="absolute inset-0" style={{
                  backgroundImage: 'repeating-linear-gradient(90deg, transparent, transparent 2px, rgba(11,17,32,0.4) 2px, rgba(11,17,32,0.4) 4px)',
                }} />
              )}
              {isActive && (
                <div className="absolute inset-0" style={{ boxShadow: `inset 0 0 6px ${color}80` }} />
              )}
              <div className="absolute inset-0 bg-white/0 group-hover:bg-white/10 transition-colors" />
            </div>
          );
        })}

        {/* Day dividers */}
        {dayDividers.map((div, i) => (
          <div
            key={`d-${i}`}
            className="absolute top-0 bottom-0 w-px bg-heading/20 z-10 pointer-events-none"
            style={{ left: `${div.pos}%` }}
          />
        ))}

        {/* Playhead */}
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-heading z-20 pointer-events-none"
          style={{
            left: `${playheadPos}%`,
            boxShadow: '0 0 4px rgba(255,255,255,0.4)',
            transition: 'left 100ms linear',
          }}
        />
      </div>

      {/* Spacer to push the right-side controls when scrubber is hidden on mobile */}
      <div className="md:hidden flex-1" />

      {/* Speed selector — scroll to adjust (desktop only) */}
      <div className="hidden md:flex">
        <SpeedDial speed={playbackSpeed} setSpeed={setSpeed} />
      </div>

      {/* Timestamp — desktop only; mobile surfaces the time in the bottom player bar */}
      <div className="hidden md:block text-right shrink-0">
        <p className="text-[12px] font-mono text-heading leading-none">{formatTime(cursorTime, tz)}</p>
        <p className="text-[9px] font-mono text-dim mt-0.5">{formatDate(cursorTime, tz)}</p>
      </div>

      {/* Itinerary modal */}
      {itineraryOpen && <ItineraryModal onClose={() => setItineraryOpen(false)} />}
      {shareOpen && trip && (
        <ShareTripModal
          tripTitle={trip.title}
          shareUrl={shareUrl}
          onClose={() => setShareOpen(false)}
        />
      )}
    </div>
  );
}

function SpeedDial({ speed, setSpeed }: { speed: number; setSpeed: (s: number) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      if (editing) return;
      e.preventDefault();
      const direction = e.deltaY < 0 ? 1 : -1;
      let step: number;
      if (speed < 10) step = 1;
      else if (speed < 50) step = 5;
      else if (speed < 200) step = 10;
      else step = 25;
      const next = Math.max(MIN_SPEED, Math.min(MAX_SPEED, speed + direction * step));
      setSpeed(next);
    },
    [speed, setSpeed, editing]
  );

  const startEditing = () => {
    setDraft(String(speed));
    setEditing(true);
  };

  const commit = () => {
    const parsed = parseInt(draft, 10);
    if (!isNaN(parsed) && parsed >= MIN_SPEED && parsed <= MAX_SPEED) {
      setSpeed(parsed);
    }
    setEditing(false);
  };

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  return (
    <div
      onWheel={handleWheel}
      className="flex items-center gap-1.5 shrink-0 px-2 py-1 rounded-sm border border-white/[0.03] bg-elevated/30 cursor-ns-resize select-none"
      title="Scroll or click to adjust speed (1x–500x)"
    >
      <span className="text-[10px] text-dim uppercase tracking-widest">Speed</span>
      {editing ? (
        <input
          ref={inputRef}
          type="text"
          inputMode="numeric"
          value={draft}
          onChange={(e) => setDraft(e.target.value.replace(/[^0-9]/g, ''))}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit();
            if (e.key === 'Escape') setEditing(false);
          }}
          className="w-[3.5ch] bg-transparent text-[12px] font-mono text-info font-semibold text-right outline-none border-b border-info/40"
        />
      ) : (
        <span
          onClick={startEditing}
          className="text-[12px] font-mono text-info font-semibold min-w-[3ch] text-right cursor-text"
        >
          {speed}
        </span>
      )}
      <span className="text-[10px] font-mono text-dim">x</span>
    </div>
  );
}

function TripMenuItem({
  icon, label, onClick, danger = false,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2.5 px-2 py-2 rounded-sm text-left transition-colors ${
        danger
          ? 'text-dim hover:text-danger hover:bg-danger/10'
          : 'text-muted hover:text-primary hover:bg-elevated/50'
      }`}
    >
      <span className={danger ? '' : 'text-dim'}>{icon}</span>
      <span className="text-[13px]">{label}</span>
    </button>
  );
}

function ControlButton({ children, onClick, title }: { children: React.ReactNode; onClick: () => void; title: string }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="flex items-center justify-center w-6 h-6 rounded-sm text-dim hover:text-muted hover:bg-elevated/50 transition-colors"
    >
      {children}
    </button>
  );
}
