// ============================================================
// SUPABASE CLIENT — browser-side singleton
// ============================================================

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON) {
  console.warn('[supabase] Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY');
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON);
