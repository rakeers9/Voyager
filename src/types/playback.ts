export interface PlaybackState {
  isPlaying: boolean;
  playbackSpeed: number;
  cursorTime: number;
  tripStartTime: number;
  tripEndTime: number;

  currentSegmentIndex: number;
  currentSegment: import('./segment').Segment | null;
  progressInSegment: number;
  currentPosition: { lat: number; lng: number };

  play: () => void;
  pause: () => void;
  togglePlay: () => void;
  setSpeed: (speed: number) => void;
  seekTo: (timestamp: number) => void;
  jumpToSegment: (index: number) => void;
  stepForward: () => void;
  stepBackward: () => void;
}
