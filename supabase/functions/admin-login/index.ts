// admin-login: 접속 코드 → (유저 자동 생성/연결) → 매직링크 토큰 발급 → 클라이언트가 verifyOtp 로 세션 획득
import { createClient } from 'npm:@supabase/supabase-js@2'

const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } })

async function sha(s: string) {
  const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
  return [...new Uint8Array(h)].map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 24)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'method' }, 405)
  let code = ''
  try { code = String((await req.json()).code ?? '').trim().toUpperCase() } catch {}
  if (!/^[A-Z0-9-]{6,40}$/.test(code)) return json({ error: '코드 형식이 올바르지 않습니다.' }, 400)

  const { data: ac } = await sb.from('admin_codes').select('*').eq('code', code).eq('active', true).maybeSingle()
  if (!ac) { await new Promise(r => setTimeout(r, 600)); return json({ error: '유효하지 않은 코드입니다.' }, 401) }

  const email = `code-${await sha(code)}@admin.flitwait.local`
  let userId: string | null = null
  const { data: list } = await sb.auth.admin.listUsers({ page: 1, perPage: 1000 })
  userId = list?.users.find(u => u.email === email)?.id ?? null
  if (!userId) {
    const { data: cu, error } = await sb.auth.admin.createUser({ email, email_confirm: true, user_metadata: { admin_code: code, label: ac.label } })
    if (error) return json({ error: error.message }, 500)
    userId = cu.user.id
  }
  // admins 연결 (event_id null 은 unique 가 안 걸리므로 직접 확인)
  let q = sb.from('admins').select('id').eq('user_id', userId)
  q = ac.event_id ? q.eq('event_id', ac.event_id) : q.is('event_id', null)
  const { data: ex } = await q.maybeSingle()
  if (!ex) await sb.from('admins').insert({ user_id: userId, event_id: ac.event_id, role: ac.role })
  await sb.from('admin_codes').update({ last_used_at: new Date().toISOString() }).eq('code', code)

  const { data: link, error: le } = await sb.auth.admin.generateLink({ type: 'magiclink', email })
  if (le || !link?.properties?.hashed_token) return json({ error: le?.message ?? 'link' }, 500)
  return json({ token_hash: link.properties.hashed_token, label: ac.label, role: ac.role, event_id: ac.event_id })
})
