import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { NextRequest, NextResponse } from 'next/server'

import { makeTechnicalEmail, normalizeIdentifier } from '@/lib/rut'

type CookieOptions = {
  domain?: string
  expires?: Date
  httpOnly?: boolean
  maxAge?: number
  path?: string
  sameSite?: 'lax' | 'strict' | 'none'
  secure?: boolean
}

type CookieToSet = {
  name: string
  value: string
  options?: CookieOptions
}

type LoginProfile = {
  id?: string
  rol: 'admin' | 'auditor' | 'cliente'
  activo: boolean
  requiere_cambio_pass: boolean
  identificador?: string | null
  rut?: string | null
}

function applyCookies(response: NextResponse, cookiesToSet: CookieToSet[]) {
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

  const supabase = createServerClient(url, anonKey, {
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

  const admin = createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  })

  let profile: LoginProfile | null = null

  const { data: profileByIdentifier } = await admin
    .from('perfiles')
    .select('id, rol, activo, requiere_cambio_pass, identificador, rut')
    .or(`identificador.eq.${normalized},rut.eq.${normalized}`)
    .maybeSingle()

  if (profileByIdentifier) {
    profile = profileByIdentifier as unknown as LoginProfile
  } else {
    const { data: profileById } = await admin
      .from('perfiles')
      .select('id, rol, activo, requiere_cambio_pass, identificador, rut')
      .eq('id', data.user.id)
      .maybeSingle()

    if (profileById) {
      profile = profileById as unknown as LoginProfile
    }
  }

  if (!profile) {
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
