'use client';

import { useEffect } from 'react';
import usePlaybackStore from '@/stores/playbackStore';

export default function KeyboardHandler() {
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      const { togglePlay, stepForward, stepBackward, setSpeed, playbackSpeed } =
        usePlaybackStore.getState();

      switch (e.code) {
        case 'Space':
          e.preventDefault();
          togglePlay();
          break;
        case 'ArrowRight':
          e.preventDefault();
          stepForward();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          stepBackward();
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSpeed(Math.min(500, playbackSpeed + (playbackSpeed < 10 ? 1 : playbackSpeed < 50 ? 5 : playbackSpeed < 200 ? 10 : 25)));
          break;
        case 'ArrowDown':
          e.preventDefault();
          setSpeed(Math.max(1, playbackSpeed - (playbackSpeed <= 10 ? 1 : playbackSpeed <= 50 ? 5 : playbackSpeed <= 200 ? 10 : 25)));
          break;
      }
    };

    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  return null;
}
