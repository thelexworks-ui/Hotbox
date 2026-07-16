import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Server-only client: service role key bypasses RLS.
// Never expose this to the browser.
export const db = createClient(url, key, { auth: { persistSession: false } });
