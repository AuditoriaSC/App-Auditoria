import { createClient } from 'npm:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || ''
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') || ''
const FROM_EMAIL = Deno.env.get('INVITATION_FROM_EMAIL') || Deno.env.get('REPORT_FROM_EMAIL') || Deno.env.get('RESEND_FROM') || ''
const WEB_APP_URL = (Deno.env.get('WEB_APP_URL') || '').replace(/\/$/, '')
const ANDROID_DOWNLOAD_URL = Deno.env.get('ANDROID_DOWNLOAD_URL') || ''
const SUPPORT_EMAIL = Deno.env.get('SUPPORT_EMAIL') || 'Ext.430'
const CORPORATE_DOMAIN = '@sweetandcoffee.com.ec'

const colors = {
  greenDark: '#165034',
  green: '#1F6B47',
  greenSoft: '#E7F1EC',
  creamSoft: '#FBF8F1',
  border: '#DED2C2',
  textPrimary: '#2B2118',
  textSecondary: '#6B5B4B',
  white: '#FFFFFF',
  logoWhite: '#EEEEEE',
}

type InvitationRow = {
  id: string
  email: string
  role: string
  code: string
  is_used: boolean
  region: string | null
  status: string | null
  expires_at: string | null
  accepted_at: string | null
  canceled_at: string | null
}

type ProfileRow = {
  role: string
  region: string | null
}

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function escapeHtml(value: string | null | undefined) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function statusOf(invitation: InvitationRow) {
  const status = String(invitation.status || '').toLowerCase()
  if (invitation.is_used || invitation.accepted_at || status === 'accepted' || status === 'aceptada') return 'accepted'
  if (invitation.canceled_at || status === 'canceled' || status === 'cancelada') return 'canceled'
  if (invitation.expires_at && new Date(invitation.expires_at).getTime() < Date.now()) return 'expired'
  return 'pending'
}

function roleLabel(value: string) {
  if (value === 'super_admin') return 'Super admin'
  if (value === 'admin') return 'Admin'
  return 'Auditor'
}

function button(label: string, href: string) {
  if (!href) return ''
  return `
    <a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer"
      style="display:inline-block; margin:8px 8px 8px 0; padding:12px 16px; background:${colors.greenDark}; color:${colors.white}; text-decoration:none; border-radius:8px; font-weight:700;">
      ${escapeHtml(label)}
    </a>
  `
}

function buildEmail(invitation: InvitationRow) {
  const acceptUrl = `${WEB_APP_URL}/accept-invite?token=${encodeURIComponent(invitation.code)}`
  const webUrl = WEB_APP_URL
  const androidUrl = ANDROID_DOWNLOAD_URL

  return `
    <div style="font-family:Arial,sans-serif; background:${colors.creamSoft}; padding:28px; color:${colors.textPrimary};">
      <div style="max-width:760px; margin:0 auto;">
        <div style="background:${colors.greenDark}; color:${colors.logoWhite}; padding:22px 26px; border-radius:12px 12px 0 0;">
          <h1 style="margin:0; font-size:22px; color:${colors.white};">App Auditoría Sweet & Coffee</h1>
          <p style="margin:8px 0 0 0;">Invitación de acceso</p>
        </div>
        <div style="background:${colors.white}; border:1px solid ${colors.border}; border-top:0; border-radius:0 0 12px 12px; padding:26px;">
          <p>Hola,</p>
          <p>Has sido invitado/a a la App de Auditoría Sweet & Coffee.</p>

          <div style="background:${colors.greenSoft}; border:1px solid ${colors.border}; border-radius:10px; padding:14px; margin:18px 0;">
            <p style="margin:0 0 6px 0;"><strong>Correo:</strong> ${escapeHtml(invitation.email)}</p>
            <p style="margin:0 0 6px 0;"><strong>Rol:</strong> ${escapeHtml(roleLabel(invitation.role))}</p>
            <p style="margin:0;"><strong>Región:</strong> ${escapeHtml(invitation.region || 'Sin región')}</p>
          </div>

          <h2 style="font-size:17px; color:${colors.greenDark}; margin-top:18px;">Paso 1</h2>
          <p>Acepta la invitación y crea tu contraseña.</p>
          ${button('Aceptar invitación', acceptUrl)}
          <p style="word-break:break-all; color:${colors.textSecondary}; font-size:13px;">${escapeHtml(acceptUrl)}</p>

          <h2 style="font-size:17px; color:${colors.greenDark}; margin-top:22px;">Paso 2</h2>
          <p>Ingresa a la app según tu dispositivo.</p>
          ${button('Descargar app Android', androidUrl)}
          ${button('Abrir App Web / iOS', webUrl)}

          <p><strong>Para iPhone:</strong> abre el enlace desde Safari, toca Compartir y selecciona “Agregar a pantalla de inicio”.</p>
          <p style="color:${colors.textSecondary};">Soporte: ${escapeHtml(SUPPORT_EMAIL)}</p>
        </div>
      </div>
    </div>
  `
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return jsonResponse({ error: 'Metodo no permitido.' }, 405)
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return jsonResponse({ error: 'Configuracion de Supabase incompleta.' }, 500)
  if (!RESEND_API_KEY || !FROM_EMAIL) return jsonResponse({ error: 'Configuracion de correo incompleta.' }, 500)
  if (!WEB_APP_URL) return jsonResponse({ error: 'WEB_APP_URL no configurada.' }, 500)

  try {
    const authHeader = req.headers.get('Authorization') || ''
    const token = authHeader.replace(/^Bearer\s+/i, '')
    if (!token) return jsonResponse({ error: 'Sesion no valida.' }, 401)

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
    const { data: userData, error: userError } = await supabase.auth.getUser(token)
    if (userError || !userData.user) return jsonResponse({ error: 'Sesion no valida.' }, 401)

    const { invitationId } = await req.json()
    if (!invitationId) return jsonResponse({ error: 'Invitacion requerida.' }, 400)

    const [{ data: profile }, { data: invitation, error: invitationError }] = await Promise.all([
      supabase
        .from('profiles')
        .select('role, region')
        .eq('id', userData.user.id)
        .single<ProfileRow>(),
      supabase
        .from('user_invitations')
        .select('id, email, role, code, is_used, region, status, expires_at, accepted_at, canceled_at')
        .eq('id', invitationId)
        .single<InvitationRow>(),
    ])

    if (!profile || !['admin', 'super_admin'].includes(profile.role)) return jsonResponse({ error: 'No tienes permisos para enviar invitaciones.' }, 403)
    if (invitationError || !invitation) return jsonResponse({ error: 'Invitacion no encontrada.' }, 404)
    if (profile.role !== 'super_admin' && profile.region !== invitation.region) return jsonResponse({ error: 'No puedes enviar invitaciones de otra region.' }, 403)
    if (!invitation.email.toLowerCase().endsWith(CORPORATE_DOMAIN)) return jsonResponse({ error: 'Solo se permiten correos corporativos.' }, 400)

    const state = statusOf(invitation)
    if (state === 'accepted') return jsonResponse({ error: 'Esta invitacion ya fue aceptada.' }, 400)
    if (state === 'canceled') return jsonResponse({ error: 'Esta invitacion fue cancelada.' }, 400)
    if (state === 'expired') return jsonResponse({ error: 'Esta invitacion esta expirada.' }, 400)

    const resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: [invitation.email],
        subject: 'Invitación App Auditoría Sweet & Coffee',
        html: buildEmail(invitation),
      }),
    })

    const resendData = await resendResponse.json().catch(() => null)
    if (!resendResponse.ok) {
      console.error('send-invitation:resend-error', { status: resendResponse.status, data: resendData })
      return jsonResponse({ error: 'No se pudo enviar el correo de invitacion.' }, 502)
    }

    return jsonResponse({ ok: true, message: 'Correo de invitacion enviado.', data: resendData })
  } catch (error) {
    console.error('send-invitation:error', error)
    return jsonResponse({ error: 'No se pudo enviar la invitacion.' }, 500)
  }
})
