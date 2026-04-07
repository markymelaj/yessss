import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { NextRequest, NextResponse } from 'next/server'

import type { Database } from '@/lib/types'
import { makeTechnicalEmail, normalizeIdentifier } from '@/lib/rut'

type CookieToSet = {
  name: string
  value: string
  options?: Record<string, unknown>
}

function applyCookies(
  response: NextResponse,
  cookiesToSet: CookieToSet[]
) {
  cookiesToSet.forEach(({ name, value, options }) => {
    response.cookies.set(name, value, {
      path: '/',
      ...(options ?? {})
    })
  })
  response.headers.set('Cache-Control', 'no-store')
  return response
}

function redirectWithCookies(
  request: NextRequest,
  pathname: string,
  cookiesToSet: CookieToSet[] = []
) {
  const response = NextResponse.redirect(new URL(pathname, request.url), {
    status: 303
  })
  return applyCookies(response, cookiesToSet)
}

export async function POST(request: NextRequest) {
  const formData = await request.formData()
  const rawIdentifier = String(formData.get('identifier') ?? '').trim()
  const password = String(formData.get('password') ?? '')

  const normalized = normalizeIdentifier(rawIdentifier)

  if (!normalized || !password) {
    return redirectWithCookies(request, '/login?error=missing')
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !anonKey || !serviceRoleKey) {
    return redirectWithCookies(request, '/login?error=config')
  }

  const cookiesToSet: CookieToSet[] = []

  const supabase = createServerClient<Database>(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(nextCookies: CookieToSet[]) {
        nextCookies.forEach((cookie) => cookiesToSet.push(cookie))
      }
    }
  })

  const { data, error } = await supabase.auth.signInWithPassword({
    email: makeTechnicalEmail(normalized),
    password
  })

  if (error || !data.user) {
    return redirectWithCookies(request, '/login?error=invalid', cookiesToSet)
  }

  const admin = createClient<Database>(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  })

  const { data: profile, error: profileError } = await admin
    .from('perfiles')
    .select('rol, activo, requiere_cambio_pass')
    .eq('id', data.user.id)
    .single()

  if (profileError || !profile) {
    return redirectWithCookies(request, '/login?error=profile', cookiesToSet)
  }

  if (!profile.activo) {
    return redirectWithCookies(request, '/login?error=inactive', cookiesToSet)
  }

  if (profile.requiere_cambio_pass) {
    return redirectWithCookies(request, '/cambiar-clave', cookiesToSet)
  }

  if (profile.rol === 'admin') {
    return redirectWithCookies(request, '/admin', cookiesToSet)
  }

  if (profile.rol === 'auditor') {
    return redirectWithCookies(request, '/auditor', cookiesToSet)
  }

  return redirectWithCookies(request, '/dashboard', cookiesToSet)
}
