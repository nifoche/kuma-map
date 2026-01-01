'use client';

import dynamic from 'next/dynamic';
import type { BearSighting } from '@/types';

const BearMap = dynamic(() => import('./BearMap'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-[600px] bg-muted flex items-center justify-center rounded-lg">
      <p className="text-muted-foreground">地図を読み込み中...</p>
    </div>
  ),
});

interface BearMapWrapperProps {
  sightings: BearSighting[];
}

export default function BearMapWrapper({ sightings }: BearMapWrapperProps) {
  return <BearMap sightings={sightings} />;
}
