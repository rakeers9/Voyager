'use client';

import dynamic from 'next/dynamic';
import { useSearchParams, useRouter } from 'next/navigation';
import { useEffect, Suspense } from 'react';
import useChatStore from '@/stores/chatStore';
import useTripsListStore from '@/stores/tripsListStore';
import { createDraftTrip } from '@/lib/createDraftTrip';

const NewTripShell = dynamic(() => import('@/components/newtrip/NewTripShell'), {
  ssr: false,
  loading: () => <LoadingScreen />,
});

function LoadingScreen() {
  return (
    <div className="flex items-center justify-center h-screen w-screen bg-base">
      <span className="text-muted text-sm">Loading...</span>
    </div>
  );
}

function NewTripRoute() {
  const router = useRouter();
  const params = useSearchParams();
  const id = params.get('id');
  const loadForTrip = useChatStore((s) => s.loadForTrip);
  const reset = useChatStore((s) => s.reset);
  const loaded = useTripsListStore((s) => s.loaded);
  const loadFromSupabase = useTripsListStore((s) => s.loadFromSupabase);

  useEffect(() => {
    if (!loaded) loadFromSupabase();
  }, [loaded, loadFromSupabase]);

  useEffect(() => {
    if (id) {
      loadForTrip(id);
    } else {
      // No id in URL — create a draft and redirect so we never have an unsaved trip
      reset();
      (async () => {
        const result = await createDraftTrip();
        if (result) {
          useTripsListStore.getState().addDraftTrip(result.trip);
          router.replace(`/new?id=${result.id}`);
        }
      })();
    }
  }, [id, loadForTrip, reset, router]);

  if (!id) return <LoadingScreen />;
  return <NewTripShell />;
}

export default function NewTripPage() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <NewTripRoute />
    </Suspense>
  );
}
