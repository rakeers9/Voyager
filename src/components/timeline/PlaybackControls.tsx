'use client';

import { Play, Pause, SkipBack, SkipForward } from 'lucide-react';
import usePlaybackStore from '@/stores/playbackStore';
import useTripStore from '@/stores/tripStore';
import { formatTime, formatDate } from '@/lib/time';
import type { ReactNode } from 'react';

const SPEEDS = [1, 2, 10, 50];

export default function PlaybackControls() {
  const tz = useTripStore((s) => s.trip?.timezone ?? 'UTC');
  const isPlaying = usePlaybackStore((s) => s.isPlaying);
  const playbackSpeed = usePlaybackStore((s) => s.playbackSpeed);
  const cursorTime = usePlaybackStore((s) => s.cursorTime);
  const togglePlay = usePlaybackStore((s) => s.togglePlay);
  const setSpeed = usePlaybackStore((s) => s.setSpeed);
  const stepForward = usePlaybackStore((s) => s.stepForward);
  const stepBackward = usePlaybackStore((s) => s.stepBackward);
  const currentSegment = usePlaybackStore((s) => s.currentSegment);

  return (
    <div className="flex items-center justify-between px-4 py-2 border-t border-t-white/[0.025]">
      <div className="flex items-center gap-1">
        <ControlButton onClick={stepBackward} title="Previous segment">
          <SkipBack size={14} />
        </ControlButton>

        <button
          onClick={togglePlay}
          className={`flex items-center justify-center w-8 h-8 rounded-sm transition-colors ${
            isPlaying
              ? 'bg-info/15 text-info hover:bg-info/20'
              : 'bg-elevated/60 text-heading hover:bg-elevated'
          }`}
          title={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? <Pause size={14} /> : <Play size={14} className="ml-0.5" />}
        </button>

        <ControlButton onClick={stepForward} title="Next segment">
          <SkipForward size={14} />
        </ControlButton>
      </div>

      <div className="flex items-center gap-0.5">
        {SPEEDS.map((speed) => (
          <button
            key={speed}
            onClick={() => setSpeed(speed)}
            className={`px-2 py-0.5 text-[11px] font-mono rounded-sm transition-colors ${
              playbackSpeed === speed
                ? 'bg-info/12 text-info border border-info/20'
                : 'text-dim hover:text-muted hover:bg-elevated/40 border border-transparent'
            }`}
          >
            {speed}x
          </button>
        ))}
      </div>

      <div className="flex items-center gap-3 text-right">
        {currentSegment && (
          <span className="text-[11px] text-dim truncate max-w-[180px]">
            {currentSegment.title}
          </span>
        )}
        <div className="text-right">
          <p className="text-[13px] font-mono text-heading leading-none">{formatTime(cursorTime, tz)}</p>
          <p className="text-[10px] font-mono text-dim mt-0.5">{formatDate(cursorTime, tz)}</p>
        </div>
      </div>
    </div>
  );
}

function ControlButton({ children, onClick, title }: { children: ReactNode; onClick: () => void; title: string }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="flex items-center justify-center w-7 h-7 rounded-sm text-dim hover:text-muted hover:bg-elevated/50 transition-colors"
    >
      {children}
    </button>
  );
}
