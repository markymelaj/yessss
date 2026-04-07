import { createServerClient } from '@supabase/ssr';
import { NextRequest, NextResponse } from 'next/server';

import type { Database } from '@/lib/types';
import { getSupabasePublishableKey, getSupabaseUrl } from '@/lib/supabase/env';
import { createAdminClient } from '@/lib/supabase/admin';
import { makeTechnicalEmail, normalizeIdentifier } from '@/lib/rut';

type CookieToSet = {
  name: string;
  value: string;
  options?: Parameters<NextResponse['cookies']['set']>[2];
};

type LoginProfile = Pick<
  Database['public']['Tables']['perfiles']['Row'],
  'id' | 'rol' | 'activo' | 'requiere_cambio_pass'
>;

function withRootPath(cookie: CookieToSet): CookieToSet {
  return {
    ...cookie,
    options: {
      ...(cookie.options ?? {}),
      path: '/'
    }
  };
}

function upsertCookie(target: CookieToSet[], cookie: CookieToSet) {
  const nextCookie = withRootPath(cookie);
  const existingIndex = target.findIndex(({ name }) => name === nextCookie.name);

  if (existingIndex >= 0) {
    target[existingIndex] = nextCookie;
    return;
  }

  target.push(nextCookie);
}

function redirectWithCookies(request: NextRequest, pathname: string, cookiesToSet: CookieToSet[] = []) {
  const response = NextResponse.redirect(new URL(pathname, request.url), { status: 303 });

  cookiesToSet.forEach(({ name, value, options }) => {
    response.cookies.set(name, value, options);
  });

  response.headers.set('Cache-Control', 'no-store');
  return response;
}

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const rawIdentifier = String(formData.get('identifier') ?? '');
  const password = String(formData.get('password') ?? '');
  const normalizedIdentifier = normalizeIdentifier(rawIdentifier);

  if (!normalizedIdentifier || !password) {
    return redirectWithCookies(request, '/login?error=missing');
  }

  const cookiesToSet: CookieToSet[] = [];

  const supabase = createServerClient<Database>(getSupabaseUrl(), getSupabasePublishableKey(), {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(nextCookies: CookieToSet[]) {
        nextCookies.forEach((cookie) => {
          const rootCookie = withRootPath(cookie);
          request.cookies.set(rootCookie.name, rootCookie.value);
          upsertCookie(cookiesToSet, rootCookie);
        });
      }
    }
  });

  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: makeTechnicalEmail(normalizedIdentifier),
    password
  });

  if (signInError) {
    return redirectWithCookies(request, '/login?error=invalid', cookiesToSet);
  }

  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser();

  if (userError || !user) {
    await supabase.auth.signOut();
    return redirectWithCookies(request, '/login?error=session', cookiesToSet);
  }

  const admin = createAdminClient();

  const { data: profileData, error: profileError } = await admin
    .from('perfiles')
    .select('id, rol, activo, requiere_cambio_pass')
    .eq('id', user.id)
    .maybeSingle();

  const profile = (profileData ?? null) as LoginProfile | null;

  if (profileError || !profile) {
    await supabase.auth.signOut();
    return redirectWithCookies(request, '/login?error=profile', cookiesToSet);
  }

  if (!profile.activo) {
    await supabase.auth.signOut();
    return redirectWithCookies(request, '/login?inactive=1', cookiesToSet);
  }

  if (profile.requiere_cambio_pass) {
    return redirectWithCookies(request, '/cambiar-clave', cookiesToSet);
  }

  if (profile.rol === 'admin') {
    return redirectWithCookies(request, '/admin', cookiesToSet);
  }

  if (profile.rol === 'auditor') {
    return redirectWithCookies(request, '/auditor', cookiesToSet);
  }

  return redirectWithCookies(request, '/dashboard', cookiesToSet);
}
