import type { Segment } from '@/types/segment';

/**
 * Binary search for the segment containing a given timestamp.
 * Returns { index, progress } where progress is 0.0–1.0 within that segment.
 */
export function findSegmentAtTime(
  segments: Segment[],
  time: number
): { index: number; progress: number } {
  if (!segments || segments.length === 0) return { index: 0, progress: 0 };

  if (time <= segments[0].startTime) return { index: 0, progress: 0 };
  const last = segments[segments.length - 1];
  if (time >= last.endTime) return { index: segments.length - 1, progress: 1 };

  let lo = 0;
  let hi = segments.length - 1;

  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    const seg = segments[mid];
    if (time < seg.startTime) {
      hi = mid - 1;
    } else if (time > seg.endTime) {
      lo = mid + 1;
    } else {
      const duration = seg.endTime - seg.startTime;
      const progress = duration > 0 ? (time - seg.startTime) / duration : 0;
      return { index: mid, progress: Math.min(1, Math.max(0, progress)) };
    }
  }

  return { index: Math.min(lo, segments.length - 1), progress: 0 };
}
