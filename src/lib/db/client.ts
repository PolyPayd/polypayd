// Supabase client setup.
//
// createServerClient  — uses the SERVICE ROLE KEY which bypasses RLS entirely.
//   Must only be used in server-side route handlers and webhook handlers.
//   NEVER import this in a client component or expose it to the browser.
//
// createBrowserClient — uses the ANON KEY; subject to RLS policies.
//   Safe for use in client components.

import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

export function createServerClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
  }

  return createClient<Database>(url, key, {
    auth: { persistSession: false },
  });
}

export function createBrowserClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be set'
    );
  }

  return createClient<Database>(url, key);
}
