'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState, use } from 'react';
import useTripStore from '@/stores/tripStore';
import usePlaybackStore from '@/stores/playbackStore';
import { computeTripStats } from '@/lib/tripBuilder';
import type { Trip } from '@/types/trip';
import type { Segment } from '@/types/segment';

const DashboardShell = dynamic(() => import('@/components/layout/DashboardShell'), {
  ssr: false,
  loading: () => <LoadingScreen />,
});

function LoadingScreen() {
  return (
    <div className="flex items-center justify-center h-screen w-screen bg-base">
      <span className="text-muted text-sm">Loading trip…</span>
    </div>
  );
}

function ErrorScreen({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-screen w-screen bg-base px-6 text-center">
      <h1 className="text-heading text-xl font-semibold mb-2">Trip unavailable</h1>
      <p className="text-[13px] text-dim max-w-md">{message}</p>
    </div>
  );
}

export default function SharedTripPage({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = use(params);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch(`/api/public/trips/${tripId}`);
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          if (!cancelled) {
            setErrorMessage(body?.error || 'This trip is not shared or does not exist.');
            setStatus('error');
          }
          return;
        }

        const { trip, segments } = (await res.json()) as { trip: Trip; segments: Segment[] };

        if (cancelled) return;

        const startDate = new Date(trip.start_date);
        const endDate = new Date(trip.end_date);
        const totalDays = Math.max(
          1,
          Math.round((endDate.getTime() - startDate.getTime()) / 86400000) + 1
        );
        const stats = computeTripStats(segments, totalDays);

        useTripStore.getState().loadTrip(trip, segments, stats);
        usePlaybackStore.getState().reinitialize();
        setStatus('ready');
      } catch {
        if (!cancelled) {
          setErrorMessage('Could not load this trip. Please try again later.');
          setStatus('error');
        }
      }
    })();

    return () => {
      cancelled = true;
      // Clear the shared trip from the store so a later authed session doesn't see stale data.
      useTripStore.getState().clearTrip();
    };
  }, [tripId]);

  if (status === 'loading') return <LoadingScreen />;
  if (status === 'error') return <ErrorScreen message={errorMessage} />;
  return <DashboardShell readOnly />;
}
