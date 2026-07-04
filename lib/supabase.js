/**
 * supabase.js — server-side Supabase client factory.
 *
 * Uses the service-role key, so this must ONLY ever be imported from scripts or
 * Next.js server code — never from a client component. The key grants full
 * database access and must not reach the browser bundle.
 */

import { createClient } from "@supabase/supabase-js";

export function createSupabaseClient() {
  const url = process.env.SUPABASE_URL;
  // Supabase's current naming is "secret key"; older projects call it the
  // service_role key. Accept either so the collector works with both.
  const key =
    process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "SUPABASE_URL / SUPABASE_SECRET_KEY not set (add them to .env).",
    );
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
