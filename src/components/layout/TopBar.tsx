'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import {
  ChevronDown, LogOut, Map, Compass,
  Play, Pause, SkipBack, SkipForward, ListOrdered,
} from 'lucide-react';
import useTripStore from '@/stores/tripStore';
import usePlaybackStore from '@/stores/playbackStore';
import { getSegmentColor } from '@/lib/colors';
import { formatTime, formatDate, getDayStartMs } from '@/lib/time';
import ItineraryModal from '../ItineraryModal';

const MOCK_TRIPS = [
  { id: 'trip-yosemite-2026', title: 'Yosemite Road Trip', dates: 'Jun 11–13, 2026', active: true },
  { id: 'trip-tahoe-2026', title: 'Lake Tahoe Weekend', dates: 'Jul 18–20, 2026', active: false },
  { id: 'trip-pch-2026', title: 'PCH Road Trip', dates: 'Aug 5–9, 2026', active: false },
];

const MIN_SPEED = 1;
const MAX_SPEED = 500;

export default function TopBar() {
  const trip = useTripStore((s) => s.trip);
  const stats = useTripStore((s) => s.stats);
  const segments = useTripStore((s) => s.segments);
  const tz = trip.timezone;

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
  const menuRef = useRef<HTMLDivElement>(null);
  const scrubberRef = useRef<HTMLDivElement>(null);

  const totalDuration = tripEndTime - tripStartTime;
  const playheadPos = totalDuration > 0 ? ((cursorTime - tripStartTime) / totalDuration) * 100 : 0;

  // Day dividers for scrubber
  const dayDividers: { pos: number }[] = [];
  for (let d = 1; d <= 2; d++) {
    const dayMs = getDayStartMs(d + 1, tripStartTime, tz);
    const pos = ((dayMs - tripStartTime) / totalDuration) * 100;
    if (pos > 0 && pos < 100) dayDividers.push({ pos });
  }

  // Close dropdown on outside click
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
              {MOCK_TRIPS.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setMenuOpen(false)}
                  className={`w-full flex items-center gap-2.5 px-2 py-2 rounded-sm text-left transition-colors ${
                    t.active ? 'bg-info/8 text-heading' : 'text-muted hover:text-primary hover:bg-elevated/50'
                  }`}
                >
                  <Map size={13} className={t.active ? 'text-info' : 'text-dim'} />
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] truncate">{t.title}</p>
                    <p className="text-[10px] font-mono text-dim">{t.dates}</p>
                  </div>
                  {t.active && <div className="w-1.5 h-1.5 rounded-full bg-info shrink-0" />}
                </button>
              ))}
            </div>
            <div className="border-t border-t-white/[0.03]" />
            <div className="p-1.5">
              <button
                onClick={() => setMenuOpen(false)}
                className="w-full flex items-center gap-2.5 px-2 py-2 rounded-sm text-dim hover:text-primary hover:bg-elevated/50 transition-colors text-left"
              >
                <LogOut size={13} />
                <span className="text-[13px]">Log out</span>
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="w-px h-4 bg-white/[0.03] shrink-0" />

      {/* Trip title + itinerary button */}
      <h1 className="text-heading font-semibold text-[13px] tracking-wide uppercase shrink-0">
        {trip.title}
      </h1>
      <button
        onClick={() => setItineraryOpen(true)}
        className="shrink-0 flex items-center justify-center w-6 h-6 rounded-sm text-dim hover:text-heading hover:bg-white/[0.06] transition-colors"
        title="View full itinerary"
      >
        <ListOrdered size={14} />
      </button>

      <div className="w-px h-4 bg-white/[0.03] shrink-0" />

      {/* Transport controls */}
      <div className="flex items-center gap-0.5 shrink-0">
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

      {/* Scrubber — fills remaining space */}
      <div
        ref={scrubberRef}
        className="relative flex-1 h-4 flex rounded-sm overflow-hidden cursor-pointer border border-white/[0.03]"
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

      {/* Speed selector — scroll to adjust */}
      <SpeedDial speed={playbackSpeed} setSpeed={setSpeed} />

      {/* Timestamp */}
      <div className="text-right shrink-0">
        <p className="text-[12px] font-mono text-heading leading-none">{formatTime(cursorTime, tz)}</p>
        <p className="text-[9px] font-mono text-dim mt-0.5">{formatDate(cursorTime, tz)}</p>
      </div>

      {/* Itinerary modal */}
      {itineraryOpen && <ItineraryModal onClose={() => setItineraryOpen(false)} />}
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
