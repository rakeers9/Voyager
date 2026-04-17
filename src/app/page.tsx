'use client';

import dynamic from 'next/dynamic';

const DashboardShell = dynamic(() => import('@/components/layout/DashboardShell'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-screen w-screen bg-base">
      <span className="text-muted text-sm">Loading…</span>
    </div>
  ),
});

export default function HomePage() {
  return <DashboardShell />;
}
