import { createClient } from 'npm:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || ''
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
const CORPORATE_DOMAIN = '@sweetandcoffee.com.ec'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

type InvitationRow = {
  id: string
  email: string
  role: 'auditor' | 'admin' | 'super_admin'
  code: string
  is_used: boolean
  region: string | null
  status: string | null
  expires_at: string | null
  accepted_at: string | null
  canceled_at: string | null
}

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function friendlyError(message: string, status = 400) {
  return jsonResponse({ ok: false, message }, status)
}

function normalizeStatus(status?: string | null) {
  return String(status || '').trim().toLowerCase()
}

function isAccepted(invitation: InvitationRow) {
  const status = normalizeStatus(invitation.status)
  return invitation.is_used || status === 'accepted' || status === 'aceptada' || Boolean(invitation.accepted_at)
}

function isCanceled(invitation: InvitationRow) {
  const status = normalizeStatus(invitation.status)
  return status === 'canceled' || status === 'cancelada' || Boolean(invitation.canceled_at)
}

function isExpired(invitation: InvitationRow) {
  if (!invitation.expires_at) return false
  const expiresAt = new Date(invitation.expires_at).getTime()
  return Number.isFinite(expiresAt) && expiresAt < Date.now()
}

function isCorporateEmail(email: string) {
  return email.trim().toLowerCase().endsWith(CORPORATE_DOMAIN)
}

function profileNameFromEmail(email: string) {
  return email.split('@')[0] || 'Usuario'
}

async function findUserIdByEmail(supabase: ReturnType<typeof createClient>, email: string) {
  let page = 1
  const perPage = 100

  while (page <= 20) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage })
    if (error) throw new Error('No se pudo validar si el usuario ya existe.')

    const user = data.users.find((item) => item.email?.toLowerCase() === email.toLowerCase())
    if (user) return user.id
    if (data.users.length < perPage) return null
    page += 1
  }

  return null
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return friendlyError('Metodo no permitido.', 405)
  }

  try {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return friendlyError('Configuracion del servidor incompleta.', 500)
    }

    const payload = await req.json().catch(() => null)
    const token = String(payload?.token || '').trim()
    const password = String(payload?.password || '')
    const mode = String(payload?.mode || 'accept')

    if (!token) return friendlyError('Invitacion no valida.')

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const { data: invitation, error: invitationError } = await supabase
      .from('user_invitations')
      .select('id, email, role, code, is_used, region, status, expires_at, accepted_at, canceled_at')
      .eq('code', token)
      .single<InvitationRow>()

    if (invitationError || !invitation) return friendlyError('Invitacion no encontrada.', 404)
    if (isAccepted(invitation)) return friendlyError('Esta invitacion ya fue usada.')
    if (isCanceled(invitation)) return friendlyError('Esta invitacion fue cancelada.')
    if (isExpired(invitation)) return friendlyError('Esta invitacion ya expiro.')

    const email = invitation.email.trim().toLowerCase()
    if (!isCorporateEmail(email)) {
      return friendlyError('Solo se permiten correos corporativos @sweetandcoffee.com.ec.')
    }

    if (mode === 'preview') {
      return jsonResponse({
        ok: true,
        invitation: {
          email,
          role: invitation.role,
          region: invitation.region,
        },
      })
    }

    if (!password || password.length < 8) return friendlyError('La contrasena debe tener minimo 8 caracteres.')

    let userId = await findUserIdByEmail(supabase, email)

    if (!userId) {
      const { data: createdUser, error: createError } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      })

      if (createError || !createdUser.user) {
        return friendlyError('No se pudo crear el usuario. Contacta al administrador.')
      }

      userId = createdUser.user.id
    } else {
      const { error: updateUserError } = await supabase.auth.admin.updateUserById(userId, {
        password,
        email_confirm: true,
      })

      if (updateUserError) {
        return friendlyError('El usuario ya existe, pero no se pudo actualizar su contrasena. Contacta al administrador.')
      }
    }

    const { data: existingProfile } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', userId)
      .maybeSingle<{ full_name: string | null }>()

    const now = new Date().toISOString()
    const { error: profileError } = await supabase
      .from('profiles')
      .upsert({
        id: userId,
        email,
        full_name: existingProfile?.full_name || profileNameFromEmail(email),
        role: invitation.role,
        region: invitation.region || 'Costa',
        is_active: true,
        updated_at: now,
      }, { onConflict: 'id' })

    if (profileError) return friendlyError('No se pudo habilitar el perfil del usuario. Contacta al administrador.')

    const { error: updateInvitationError } = await supabase
      .from('user_invitations')
      .update({
        is_used: true,
        status: 'accepted',
        accepted_at: now,
      })
      .eq('id', invitation.id)
      .eq('is_used', false)

    if (updateInvitationError) return friendlyError('No se pudo marcar la invitacion como aceptada.')

    return jsonResponse({
      ok: true,
      message: 'Invitacion aceptada. Ya puedes iniciar sesion.',
    })
  } catch (_error) {
    return friendlyError('No se pudo aceptar la invitacion. Intenta nuevamente.', 500)
  }
})
