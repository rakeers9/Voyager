'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { GripHorizontal, MapPin, Star } from 'lucide-react';
import usePlaybackStore from '@/stores/playbackStore';
import useTripStore from '@/stores/tripStore';
import { getSegmentColor, getCategoryLabel } from '@/lib/colors';
import { formatTime, formatDuration, formatDistance } from '@/lib/time';
import { isStopSegment, isTransitSegment } from '@/types/segment';
import type { Segment } from '@/types/segment';

const MIN_HEIGHT = 0;
const MAX_HEIGHT = 400;
const DEFAULT_HEIGHT = 140;
const COLLAPSE_THRESHOLD = 40;

export default function UpNextBar() {
  const [height, setHeight] = useState(DEFAULT_HEIGHT);
  const [collapsed, setCollapsed] = useState(false);
  const dragging = useRef(false);
  const startY = useRef(0);
  const startHeight = useRef(DEFAULT_HEIGHT);

  const currentSegmentIndex = usePlaybackStore((s) => s.currentSegmentIndex);
  const jumpToSegment = usePlaybackStore((s) => s.jumpToSegment);
  const segments = useTripStore((s) => s.segments);
  const tz = useTripStore((s) => s.trip?.timezone ?? 'UTC');

  const upNext = segments.slice(currentSegmentIndex + 1, currentSegmentIndex + 12);

  const effectiveHeight = collapsed ? 0 : height;

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    dragging.current = true;
    startY.current = e.clientY;
    startHeight.current = collapsed ? 0 : height;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [height, collapsed]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging.current) return;
    const delta = startY.current - e.clientY;
    const newHeight = Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, startHeight.current + delta));
    if (newHeight < COLLAPSE_THRESHOLD) {
      setCollapsed(true);
    } else {
      setCollapsed(false);
      setHeight(newHeight);
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

  if (upNext.length === 0) return null;

  const showContent = !collapsed && height >= 50;
  const expanded = height > 180;
  const fullDetail = height > 280;

  return (
    <div className="relative">
      {/* Drag handle — drag to resize or collapse */}
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        title="Drag to resize · drag fully down to collapse"
        className="flex items-center justify-center py-1 cursor-ns-resize select-none hover:bg-white/[0.02] transition-colors border-t border-white/[0.04] bg-[#09090B]/70 backdrop-blur-xl"
      >
        <GripHorizontal size={14} className="text-dim" />
      </div>

      {/* Expandable content */}
      <div
        className="bg-[#09090B]/70 backdrop-blur-xl flex flex-col overflow-hidden transition-[height] duration-200 ease-out"
        style={{ height: effectiveHeight }}
      >
        {showContent && (
          <>
            {/* Header */}
            <div className="flex items-center gap-2 px-4 pb-1.5 pt-1 shrink-0">
              <span className="text-[10px] font-semibold uppercase tracking-widest text-muted">
                Up Next
              </span>
              <span className="text-[10px] font-mono text-dim ml-auto">{upNext.length} segments</span>
            </div>

            {/* Cards */}
            <div
              className="flex-1 flex gap-2.5 px-4 pb-3 overflow-x-auto overflow-y-hidden min-h-0"
              style={{ scrollbarWidth: 'none' }}
            >
              {upNext.map((seg, i) => {
                const idx = currentSegmentIndex + 1 + i;
                return (
                  <UpNextCard
                    key={seg.id}
                    segment={seg}
                    index={idx}
                    tz={tz}
                    expanded={expanded}
                    fullDetail={fullDetail}
                    onJump={jumpToSegment}
                  />
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function UpNextCard({
  segment: seg,
  index,
  tz,
  expanded,
  fullDetail,
  onJump,
}: {
  segment: Segment;
  index: number;
  tz: string;
  expanded: boolean;
  fullDetail: boolean;
  onJump: (idx: number) => void;
}) {
  const segColor = getSegmentColor(seg);
  const label = isStopSegment(seg) ? getCategoryLabel(seg.category) : seg.type === 'drive' ? 'Drive' : 'Walk';
  const d = seg.details;

  return (
    <button
      onClick={() => onJump(index)}
      className="shrink-0 w-[220px] flex flex-col gap-1 px-3.5 py-2.5 rounded-sm bg-white/[0.03] border border-white/[0.04] hover:border-white/[0.08] hover:bg-white/[0.05] transition-all text-left group h-full overflow-hidden"
    >
      {/* Category badge */}
      <div className="flex items-center gap-2 shrink-0">
        <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: segColor }} />
        <span
          className="text-[9px] font-semibold uppercase tracking-widest"
          style={{ color: segColor }}
        >
          {label}
        </span>
        {isTransitSegment(seg) && (
          <span className="text-[9px] font-mono text-dim ml-auto">
            {formatDistance(seg.distance_meters)}
          </span>
        )}
      </div>

      {/* Title */}
      <p className={`text-[13px] text-primary group-hover:text-heading transition-colors leading-tight shrink-0 ${expanded ? 'line-clamp-2' : 'truncate'}`}>
        {seg.title}
      </p>

      {/* Expanded: description + details */}
      {expanded && (
        <div className="flex-1 min-h-0 overflow-hidden space-y-1 mt-0.5">
          {d.description && (
            <p className={`text-[11px] text-dim leading-snug ${fullDetail ? 'line-clamp-4' : 'line-clamp-2'}`}>
              {d.description}
            </p>
          )}

          {fullDetail && (
            <>
              {d.rating != null && (
                <div className="flex items-center gap-1">
                  <Star size={10} className="text-warning fill-warning" />
                  <span className="text-[11px] text-muted">{d.rating}/5</span>
                  {d.cuisine && <span className="text-[10px] text-dim">· {d.cuisine}</span>}
                </div>
              )}
              {!d.rating && d.cuisine && (
                <p className="text-[10px] text-dim">{d.cuisine}</p>
              )}
              {d.trail_difficulty && (
                <p className="text-[10px] text-dim">Difficulty: {d.trail_difficulty}</p>
              )}
              {d.address && (
                <div className="flex items-start gap-1">
                  <MapPin size={9} className="text-dim mt-0.5 shrink-0" />
                  <p className="text-[10px] text-dim truncate">{d.address}</p>
                </div>
              )}
              {d.notes && (
                <p className="text-[10px] text-dim italic line-clamp-2">{d.notes}</p>
              )}
            </>
          )}
        </div>
      )}

      {/* Time — always at bottom */}
      <p className="text-[10px] font-mono text-dim mt-auto pt-1 shrink-0">
        {formatTime(seg.startTime, tz)} · {formatDuration(seg.duration_minutes)}
      </p>
    </button>
  );
}
