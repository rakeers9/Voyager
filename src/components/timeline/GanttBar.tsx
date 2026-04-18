'use client';

import { useRef, useCallback } from 'react';
import usePlaybackStore from '@/stores/playbackStore';
import useTripStore from '@/stores/tripStore';
import { getSegmentColor } from '@/lib/colors';
import { formatTime, getDayStartMs } from '@/lib/time';

const MIN_SEGMENT_WIDTH = 0.4;

export default function GanttBar() {
  const barRef = useRef<HTMLDivElement>(null);
  const segments = useTripStore((s) => s.segments);
  const trip = useTripStore((s) => s.trip);
  const tripStartTime = usePlaybackStore((s) => s.tripStartTime);
  const tripEndTime = usePlaybackStore((s) => s.tripEndTime);
  const cursorTime = usePlaybackStore((s) => s.cursorTime);
  const currentSegmentIndex = usePlaybackStore((s) => s.currentSegmentIndex);
  const seekTo = usePlaybackStore((s) => s.seekTo);
  const jumpToSegment = usePlaybackStore((s) => s.jumpToSegment);

  const tz = trip?.timezone ?? 'UTC';
  const totalDuration = tripEndTime - tripStartTime;
  const playheadPos =
    totalDuration > 0 ? ((cursorTime - tripStartTime) / totalDuration) * 100 : 0;

  // Day dividers — computed in the trip's timezone
  const dayDividers: { pos: number; label: string }[] = [];
  const dayNames = ['Fri', 'Sat'];
  for (let d = 1; d <= 2; d++) {
    const dayMs = getDayStartMs(d + 1, tripStartTime, tz);
    const pos = ((dayMs - tripStartTime) / totalDuration) * 100;
    if (pos > 0 && pos < 100) {
      dayDividers.push({ pos, label: `Day ${d + 1} - ${dayNames[d - 1]}` });
    }
  }

  const handleBarClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!barRef.current) return;
      const rect = barRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const progress = Math.max(0, Math.min(1, x / rect.width));
      seekTo(tripStartTime + progress * totalDuration);
    },
    [tripStartTime, totalDuration, seekTo]
  );

  return (
    <div className="px-4 pt-3 pb-1">
      {/* Day labels */}
      <div className="relative h-4 mb-1">
        <span className="absolute left-0 text-[10px] uppercase tracking-wider text-dim font-medium">
          Day 1 - Thu
        </span>
        {dayDividers.map((div, i) => (
          <span
            key={i}
            className="absolute text-[10px] uppercase tracking-wider text-dim font-medium"
            style={{ left: `${div.pos}%`, transform: 'translateX(-50%)' }}
          >
            {div.label}
          </span>
        ))}
      </div>

      {/* Gantt bar */}
      <div
        ref={barRef}
        className="relative h-7 flex rounded-sm overflow-hidden cursor-pointer border border-white/[0.03]"
        onClick={handleBarClick}
      >
        {segments.map((seg, i) => {
          const segDuration = seg.endTime - seg.startTime;
          const widthPercent =
            totalDuration > 0
              ? Math.max(MIN_SEGMENT_WIDTH, (segDuration / totalDuration) * 100)
              : 0;
          const color = getSegmentColor(seg);
          const isActive = i === currentSegmentIndex;
          const isPast = i < currentSegmentIndex;

          return (
            <div
              key={seg.id}
              onClick={(e) => {
                e.stopPropagation();
                jumpToSegment(i);
              }}
              className="relative h-full transition-opacity duration-150 group"
              style={{
                width: `${widthPercent}%`,
                backgroundColor: color,
                opacity: isPast ? 0.3 : isActive ? 1 : 0.6,
                borderRight: '1px solid rgba(5,8,15,0.5)',
              }}
              title={`${seg.title}\n${formatTime(seg.startTime, tz)} – ${formatTime(seg.endTime, tz)}`}
            >
              {seg.type === 'walk' && (
                <div
                  className="absolute inset-0"
                  style={{
                    backgroundImage: `repeating-linear-gradient(90deg, transparent, transparent 3px, rgba(5,8,15,0.4) 3px, rgba(5,8,15,0.4) 6px)`,
                  }}
                />
              )}
              {isActive && (
                <div
                  className="absolute inset-0"
                  style={{ boxShadow: `inset 0 0 8px ${color}80, 0 0 4px ${color}40` }}
                />
              )}
              <div className="absolute inset-0 bg-white/0 group-hover:bg-white/10 transition-colors" />
            </div>
          );
        })}

        {dayDividers.map((div, i) => (
          <div
            key={`div-${i}`}
            className="absolute top-0 bottom-0 w-px bg-heading/30 z-10 pointer-events-none"
            style={{ left: `${div.pos}%` }}
          />
        ))}

        {/* Playhead */}
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-heading z-20 pointer-events-none"
          style={{
            left: `${playheadPos}%`,
            boxShadow: '0 0 6px rgba(226,232,240,0.4)',
            transition: 'left 100ms linear',
          }}
        >
          <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-heading rounded-full" />
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 mt-1.5 text-[10px] text-dim">
        <LegendItem color="#FBBF24" label="Meal" />
        <LegendItem color="#A78BFA" label="Stay" />
        <LegendItem color="#FB923C" label="Activity" />
        <LegendItem color="#60A5FA" label="Drive / Sight" />
        <LegendItem color="#34D399" label="Walk" dotted />
        <LegendItem color="#64748B" label="Rest" />
      </div>
    </div>
  );
}

function LegendItem({ color, label, dotted }: { color: string; label: string; dotted?: boolean }) {
  return (
    <div className="flex items-center gap-1">
      <div
        className="w-3 h-1.5 rounded-sm"
        style={{
          backgroundColor: color,
          backgroundImage: dotted
            ? 'repeating-linear-gradient(90deg, transparent, transparent 2px, rgba(5,8,15,0.5) 2px, rgba(5,8,15,0.5) 4px)'
            : undefined,
        }}
      />
      <span>{label}</span>
    </div>
  );
}
