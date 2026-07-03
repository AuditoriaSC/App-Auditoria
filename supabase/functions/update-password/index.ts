import { createClient } from 'npm:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || ''
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' }

function response(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers })
  if (req.method !== 'POST') return response({ error: 'Metodo no permitido.' }, 405)
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return response({ error: 'Configuracion incompleta.' }, 500)

  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '')
  if (!token) return response({ error: 'El enlace no es valido o ya vencio.' }, 401)

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data: userData, error: userError } = await admin.auth.getUser(token)
  if (userError || !userData.user) return response({ error: 'El enlace no es valido o ya vencio.' }, 401)

  const { password } = await req.json().catch(() => ({ password: '' }))
  const cleanPassword = String(password || '')
  if (cleanPassword.length < 8 || !/^[A-Za-z0-9]+$/.test(cleanPassword) || !/[A-Za-z]/.test(cleanPassword) || !/[0-9]/.test(cleanPassword)) {
    return response({ error: 'Usa minimo 8 caracteres combinando letras y numeros.' }, 400)
  }

  const { error: passwordError } = await admin.auth.admin.updateUserById(userData.user.id, { password: cleanPassword })
  if (passwordError) return response({ error: 'No se pudo actualizar la contrasena.' }, 400)

  const { error: profileError } = await admin.from('profiles').update({ password_changed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', userData.user.id)
  if (profileError) return response({ error: 'La contrasena cambio, pero no se pudo registrar su vigencia.' }, 500)

  return response({ ok: true })
})
