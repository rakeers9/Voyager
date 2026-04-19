'use client';

import { SkipBack, SkipForward, Play, Pause } from 'lucide-react';
import { useRef } from 'react';
import usePlaybackStore from '@/stores/playbackStore';
import useTripStore from '@/stores/tripStore';
import { getSegmentColor } from '@/lib/colors';
import { formatTime } from '@/lib/time';

export default function MobilePlayerBar() {
  const trip = useTripStore((s) => s.trip);
  const segments = useTripStore((s) => s.segments);

  const isPlaying = usePlaybackStore((s) => s.isPlaying);
  const cursorTime = usePlaybackStore((s) => s.cursorTime);
  const currentSegmentIndex = usePlaybackStore((s) => s.currentSegmentIndex);
  const tripStartTime = usePlaybackStore((s) => s.tripStartTime);
  const tripEndTime = usePlaybackStore((s) => s.tripEndTime);
  const togglePlay = usePlaybackStore((s) => s.togglePlay);
  const stepForward = usePlaybackStore((s) => s.stepForward);
  const stepBackward = usePlaybackStore((s) => s.stepBackward);
  const seekTo = usePlaybackStore((s) => s.seekTo);
  const jumpToSegment = usePlaybackStore((s) => s.jumpToSegment);

  const scrubberRef = useRef<HTMLDivElement>(null);

  if (!trip || segments.length === 0) return null;

  const totalDuration = tripEndTime - tripStartTime;
  const playheadPos = totalDuration > 0 ? ((cursorTime - tripStartTime) / totalDuration) * 100 : 0;
  const tz = trip.timezone;

  const handleScrubberClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!scrubberRef.current) return;
    const rect = scrubberRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const progress = Math.max(0, Math.min(1, x / rect.width));
    seekTo(tripStartTime + progress * totalDuration);
  };

  return (
    <div className="flex items-center gap-2 px-3 py-2 border-t border-white/[0.06] bg-[#09090B]/92 backdrop-blur-xl">
      <button
        onClick={stepBackward}
        aria-label="Previous segment"
        className="flex items-center justify-center w-9 h-9 rounded-sm text-dim active:bg-white/[0.08] transition-colors shrink-0"
      >
        <SkipBack size={16} />
      </button>

      <button
        onClick={togglePlay}
        aria-label={isPlaying ? 'Pause' : 'Play'}
        className={`flex items-center justify-center w-10 h-10 rounded-sm transition-colors shrink-0 ${
          isPlaying ? 'bg-info/20 text-info' : 'bg-elevated/70 text-heading'
        }`}
      >
        {isPlaying ? <Pause size={18} /> : <Play size={18} className="ml-0.5" />}
      </button>

      <button
        onClick={stepForward}
        aria-label="Next segment"
        className="flex items-center justify-center w-9 h-9 rounded-sm text-dim active:bg-white/[0.08] transition-colors shrink-0"
      >
        <SkipForward size={16} />
      </button>

      <div className="flex-1 min-w-0 flex flex-col gap-1">
        {/* Segment scrubber */}
        <div
          ref={scrubberRef}
          onClick={handleScrubberClick}
          className="relative flex h-2 rounded-full overflow-hidden bg-white/[0.05] cursor-pointer"
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
                className="h-full"
                style={{
                  width: `${widthPercent}%`,
                  backgroundColor: color,
                  opacity: isPast ? 0.3 : isActive ? 1 : 0.55,
                }}
              />
            );
          })}
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-white z-10 pointer-events-none"
            style={{
              left: `${playheadPos}%`,
              boxShadow: '0 0 4px rgba(255,255,255,0.55)',
              transition: 'left 100ms linear',
            }}
          />
        </div>
        <p className="text-[10px] font-mono text-dim leading-none">{formatTime(cursorTime, tz)}</p>
      </div>
    </div>
  );
}
