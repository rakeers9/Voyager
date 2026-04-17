import { create } from 'zustand';
import { findSegmentAtTime } from '@/lib/segmentLookup';
import { interpolateAlongRoute } from '@/lib/polyline';
import { isTransitSegment } from '@/types/segment';
import type { Segment } from '@/types/segment';
import type { PlaybackState } from '@/types/playback';
import useTripStore from './tripStore';

function computeDerivedState(cursorTime: number, segments: Segment[]) {
  const { index, progress } = findSegmentAtTime(segments, cursorTime);
  const segment = segments[index] ?? null;

  let currentPosition = { lat: 0, lng: 0 };
  if (segment) {
    if (isTransitSegment(segment)) {
      currentPosition = interpolateAlongRoute(segment.routeCoordinates, progress);
    } else {
      currentPosition = { lat: segment.latitude, lng: segment.longitude };
    }
  }

  return {
    currentSegmentIndex: index,
    currentSegment: segment,
    progressInSegment: progress,
    currentPosition,
  };
}

interface InternalPlaybackState extends PlaybackState {
  _rafId: number | null;
  _lastFrameTime: number | null;
}

const usePlaybackStore = create<InternalPlaybackState>((set, get) => {
  const segments = useTripStore.getState().segments;
  const tripStartTime = segments[0]?.startTime ?? 0;
  const tripEndTime = segments[segments.length - 1]?.endTime ?? 0;
  const initial = computeDerivedState(tripStartTime, segments);

  return {
    isPlaying: false,
    playbackSpeed: 1,
    cursorTime: tripStartTime,
    tripStartTime,
    tripEndTime,
    ...initial,

    _rafId: null,
    _lastFrameTime: null,

    play: () => {
      const state = get();
      if (state.isPlaying) return;
      if (state.cursorTime >= state.tripEndTime) {
        const segs = useTripStore.getState().segments;
        set({ cursorTime: state.tripStartTime, ...computeDerivedState(state.tripStartTime, segs) });
      }
      set({ isPlaying: true, _lastFrameTime: performance.now() });

      const tick = (now: number) => {
        const s = get();
        if (!s.isPlaying) return;

        const delta = now - (s._lastFrameTime ?? now);
        const newCursor = s.cursorTime + delta * s.playbackSpeed;

        const segs = useTripStore.getState().segments;

        if (newCursor >= s.tripEndTime) {
          set({
            cursorTime: s.tripEndTime,
            isPlaying: false,
            _rafId: null,
            _lastFrameTime: null,
            ...computeDerivedState(s.tripEndTime, segs),
          });
          return;
        }

        const rafId = requestAnimationFrame(tick);
        set({
          cursorTime: newCursor,
          _lastFrameTime: now,
          _rafId: rafId,
          ...computeDerivedState(newCursor, segs),
        });
      };

      const rafId = requestAnimationFrame(tick);
      set({ _rafId: rafId });
    },

    pause: () => {
      const { _rafId } = get();
      if (_rafId) cancelAnimationFrame(_rafId);
      set({ isPlaying: false, _rafId: null, _lastFrameTime: null });
    },

    togglePlay: () => {
      const { isPlaying, play, pause } = get();
      isPlaying ? pause() : play();
    },

    setSpeed: (speed: number) => set({ playbackSpeed: speed }),

    seekTo: (timestamp: number) => {
      const { tripStartTime, tripEndTime } = get();
      const clamped = Math.max(tripStartTime, Math.min(tripEndTime, timestamp));
      const segs = useTripStore.getState().segments;
      set({ cursorTime: clamped, ...computeDerivedState(clamped, segs) });
    },

    jumpToSegment: (index: number) => {
      const segs = useTripStore.getState().segments;
      const segment = segs[index];
      if (!segment) return;
      set({ cursorTime: segment.startTime, ...computeDerivedState(segment.startTime, segs) });
    },

    stepForward: () => {
      const { currentSegmentIndex } = get();
      const segs = useTripStore.getState().segments;
      const nextIndex = Math.min(currentSegmentIndex + 1, segs.length - 1);
      const segment = segs[nextIndex];
      set({ cursorTime: segment.startTime, ...computeDerivedState(segment.startTime, segs) });
    },

    stepBackward: () => {
      const { currentSegmentIndex, cursorTime } = get();
      const segs = useTripStore.getState().segments;
      const currentSeg = segs[currentSegmentIndex];
      const targetIndex =
        cursorTime > currentSeg.startTime + 1000
          ? currentSegmentIndex
          : Math.max(0, currentSegmentIndex - 1);
      const segment = segs[targetIndex];
      set({ cursorTime: segment.startTime, ...computeDerivedState(segment.startTime, segs) });
    },
  };
});

export default usePlaybackStore;
