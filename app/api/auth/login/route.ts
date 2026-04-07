import { createServerClient } from '@supabase/ssr';
import { NextRequest, NextResponse } from 'next/server';

import type { Database } from '@/lib/types';
import { createAdminClient } from '@/lib/supabase/admin';
import { makeTechnicalEmail, normalizeIdentifier } from '@/lib/rut';

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

function redirectWithCookies(request: NextRequest, pathname: string, cookiesToSet: CookieToSet[] = []) {
  const response = NextResponse.redirect(new URL(pathname, request.url), { status: 303 });
  cookiesToSet.map(withRootPath).forEach(({ name, value, options }) => {
    response.cookies.set(name, value, options);
  });
  response.headers.set('Cache-Control', 'no-store');
  return response;
}

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const rawIdentifier = String(formData.get('identifier') ?? '');
  const password = String(formData.get('password') ?? '');
  const normalized = normalizeIdentifier(rawIdentifier);

  if (!normalized || !password) {
    return redirectWithCookies(request, '/login?error=missing');
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    return redirectWithCookies(request, '/login?error=config');
  }

  const cookiesToSet: CookieToSet[] = [];

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

  const { data, error } = await supabase.auth.signInWithPassword({
    email: makeTechnicalEmail(normalized),
    password
  });

  if (error || !data.user) {
    return redirectWithCookies(request, '/login?error=invalid', cookiesToSet);
  }

  const admin = createAdminClient();
  const { data: profileData } = await admin
    .from('perfiles')
    .select('rol, activo, requiere_cambio_pass')
    .eq('id', data.user.id)
    .maybeSingle();

  const profile: any = profileData;

  if (!profile) {
    await supabase.auth.signOut();
    return redirectWithCookies(request, '/login?error=invalid', cookiesToSet);
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
