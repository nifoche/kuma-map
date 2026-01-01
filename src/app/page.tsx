import SightingsView from '@/components/SightingsView';
import { supabase, type BearSightingRow } from '@/lib/supabase';
import type { BearSighting } from '@/types';

// Supabaseからデータ取得（ページネーションで全件取得）
async function getSightings(): Promise<BearSighting[]> {
  const allData: BearSightingRow[] = [];
  const pageSize = 1000;
  let page = 0;
  let hasMore = true;

  while (hasMore) {
    const from = page * pageSize;
    const to = from + pageSize - 1;

    const { data, error } = await supabase
      .from('bear_sightings')
      .select('*')
      .order('date', { ascending: false })
      .range(from, to);

    if (error) {
      console.error('Supabase error:', error);
      break;
    }

    if (data && data.length > 0) {
      allData.push(...(data as BearSightingRow[]));
      hasMore = data.length === pageSize;
      page++;
    } else {
      hasMore = false;
    }
  }

  // DBのスネークケースをキャメルケースに変換
  return allData.map(row => ({
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
