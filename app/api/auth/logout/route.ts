import { createServerClient } from '@supabase/ssr';
import { NextRequest, NextResponse } from 'next/server';

import type { Database } from '@/lib/types';

type CookieToSet = {
  name: string;
  value: string;
  options?: Parameters<NextResponse['cookies']['set']>[2];
};

function withRootPath(cookie: CookieToSet): CookieToSet {
  return {
    ...cookie,
    options: {
      ...(cookie.options ?? {}),
      path: '/'
    }
  };
}

export async function POST(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const cookiesToSet: CookieToSet[] = [];

  if (url && anonKey) {
    const supabase = createServerClient<Database>(url, anonKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(nextCookies: CookieToSet[]) {
          nextCookies.forEach((cookie) => cookiesToSet.push(withRootPath(cookie)));
        }
      }
    });

    await supabase.auth.signOut();
  }

  const response = NextResponse.redirect(new URL('/login', request.url), { status: 303 });
  cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
  response.headers.set('Cache-Control', 'no-store');
  return response;
}
