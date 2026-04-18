'use client';

import dynamic from 'next/dynamic';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import useTripsListStore from '@/stores/tripsListStore';

const DashboardShell = dynamic(() => import('@/components/layout/DashboardShell'), {
  ssr: false,
  loading: () => <LoadingScreen />,
});

const EmptyDashboard = dynamic(() => import('@/components/layout/EmptyDashboard'), {
  ssr: false,
  loading: () => <LoadingScreen />,
});

function LoadingScreen() {
  return (
    <div className="flex items-center justify-center h-screen w-screen bg-base">
      <span className="text-muted text-sm">Loading…</span>
    </div>
  );
}

export default function HomePage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const trips = useTripsListStore((s) => s.trips);
  const loaded = useTripsListStore((s) => s.loaded);
  const loadFromSupabase = useTripsListStore((s) => s.loadFromSupabase);

  useEffect(() => {
    if (user && !loaded) loadFromSupabase();
  }, [user, loaded, loadFromSupabase]);

  const hasBuiltTrip = trips.some((t) => t.trip.status !== 'draft');
  const drafts = trips.filter((t) => t.trip.status === 'draft');

  // If the user only has drafts (no built trips), resume the most recent one
  // instead of showing the empty state — otherwise reloading `/` looks like
  // "you have no trips" even though the drafts are saved.
  useEffect(() => {
    if (!user || !loaded || hasBuiltTrip || drafts.length === 0) return;
    const newest = drafts[drafts.length - 1];
    router.replace(`/new?id=${newest.trip.id}`);
  }, [user, loaded, hasBuiltTrip, drafts, router]);

  if (authLoading || (user && !loaded)) return <LoadingScreen />;
  if (!user) return <LoadingScreen />; // middleware will redirect to /login
  if (!hasBuiltTrip && drafts.length > 0) return <LoadingScreen />; // redirecting
  if (!hasBuiltTrip) return <EmptyDashboard />;
  return <DashboardShell />;
}
