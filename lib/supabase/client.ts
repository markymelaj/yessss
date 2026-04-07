import { createBrowserClient } from '@supabase/ssr';

import type { Database } from '@/lib/types';

let browserClient: ReturnType<typeof createBrowserClient<Database>> | null = null;

export function createClient() {
  if (browserClient) return browserClient;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error('Faltan variables públicas de Supabase.');
  }

  browserClient = createBrowserClient<Database>(url, anonKey);
  return browserClient;
}
