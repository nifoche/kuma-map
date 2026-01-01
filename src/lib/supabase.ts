import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Supabase環境変数が設定されていません。NEXT_PUBLIC_SUPABASE_URLとNEXT_PUBLIC_SUPABASE_ANON_KEYを設定してください。'
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export type BearSightingRow = {
  id: string;
  date: string;
  prefecture: string;
  city: string;
  location: string;
  lat: number;
  lng: number;
  source: string;
  summary: string;
  created_at: string;
};
