import SightingsView from '@/components/SightingsView';
import { supabase, type BearSightingRow } from '@/lib/supabase';
import type { BearSighting } from '@/types';

// Supabaseからデータ取得
async function getSightings(): Promise<BearSighting[]> {
  const { data, error } = await supabase
    .from('bear_sightings')
    .select('*')
    .order('date', { ascending: false });

  if (error) {
    console.error('Supabase error:', error);
    return [];
  }

  // DBのスネークケースをキャメルケースに変換
  return (data as BearSightingRow[]).map(row => ({
    id: row.id,
    date: row.date,
    prefecture: row.prefecture,
    city: row.city,
    location: row.location,
    lat: row.lat,
    lng: row.lng,
    source: row.source,
    summary: row.summary,
    createdAt: row.created_at,
  }));
}

export const revalidate = 60; // 60秒ごとに再検証

export default async function Home() {
  const sightings = await getSightings();

  return <SightingsView sightings={sightings} />;
}
