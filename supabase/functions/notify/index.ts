// notify: pending notifications → 네이버 클라우드 SENS 알림톡 (실패 시 SMS 대체) 발송
// 호출: pg_cron (매분) 또는 수동. 헤더 x-cron-secret 검증.
//
// secrets:
//   NCP_ACCESS_KEY, NCP_SECRET_KEY            NCP 콘솔 > 마이페이지 > 인증키
//   NCP_ALIMTALK_SERVICE_ID                   SENS > Biz Message(알림톡) 서비스 ID
//   NCP_PLUS_FRIEND_ID                        카카오 채널 ID (예: @플릿)
//   NCP_SMS_SERVICE_ID, NCP_SMS_FROM          SENS > SMS 서비스 ID, 등록된 발신번호(숫자만)
//   CRON_SECRET, PUBLIC_BASE_URL, NOTIFY_DRY_RUN(=1 이면 발송 안 함)
import { createClient } from 'npm:@supabase/supabase-js@2'

const env = (k: string, d = '') => Deno.env.get(k) ?? d
const sb = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'))
const ACCESS = env('NCP_ACCESS_KEY'), SECRET = env('NCP_SECRET_KEY')
const AT_SVC = env('NCP_ALIMTALK_SERVICE_ID'), PF_ID = env('NCP_PLUS_FRIEND_ID')
const SMS_SVC = env('NCP_SMS_SERVICE_ID'), SMS_FROM = env('NCP_SMS_FROM')
const CRON_SECRET = env('CRON_SECRET'), BASE_URL = env('PUBLIC_BASE_URL', 'https://wait.flitunion.com')
const DRY_RUN = env('NOTIFY_DRY_RUN') === '1' || !ACCESS
const HOST = 'https://sens.apigw.ntruss.com'

async function sign(method: string, uri: string, ts: string) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${method} ${uri}\n${ts}\n${ACCESS}`))
  return btoa(String.fromCharCode(...new Uint8Array(sig)))
}
async function ncp(uri: string, body: unknown) {
  const ts = String(Date.now())
  const res = await fetch(HOST + uri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'x-ncp-apigw-timestamp': ts, 'x-ncp-iam-access-key': ACCESS, 'x-ncp-apigw-signature-v2': await sign('POST', uri, ts) },
    body: JSON.stringify(body),
  })
  const json = await res.json().catch(() => ({}))
  return { ok: res.status === 202 || res.ok, status: res.status, json }
}

const fmtKST = (iso: string) => {
  const d = new Date(iso)
  return d.toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric', weekday: 'short', timeZone: 'Asia/Seoul' }) + ' ' +
    d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Seoul' })
}
const fill = (tpl: string, vars: Record<string, string>) => tpl.replace(/#\{([^}]+)\}/g, (_, k) => vars[`#{${k}}`] ?? '')

Deno.serve(async (req) => {
  if (CRON_SECRET && req.headers.get('x-cron-secret') !== CRON_SECRET) return new Response('forbidden', { status: 403 })

  const { data: rows, error } = await sb.from('notifications')
    .select('id, template_code, tickets!inner(id, token, name, phone, party_size, ticket_no, status, booths!inner(name, slug, location, settings), events!inner(name), slots(starts_at))')
    .eq('status', 'pending').lte('scheduled_at', new Date().toISOString()).order('scheduled_at').limit(100)
  if (error) return Response.json({ error: error.message }, { status: 500 })
  if (!rows?.length) return Response.json({ sent: 0 })

  const { data: tpls } = await sb.from('templates').select('*')
  const tplMap = Object.fromEntries((tpls ?? []).map((t: any) => [t.code, t]))

  let sent = 0, failed = 0, skipped = 0
  for (const n of rows as any[]) {
    const t = n.tickets, tpl = tplMap[n.template_code]
    const stale = (n.template_code === 'R02' || n.template_code === 'Q02') && t.status !== 'waiting'
    if (!t?.phone || !tpl?.enabled || stale) { await sb.from('notifications').update({ status: 'skipped' }).eq('id', n.id); skipped++; continue }

    let ahead = ''
    if (n.template_code.startsWith('Q')) { const { data: a } = await sb.rpc('ahead_count', { p_ticket: t.id }); ahead = String(a ?? 0) }
    const vars: Record<string, string> = {
      '#{행사명}': t.events.name, '#{부스명}': t.booths.name, '#{이름}': t.name,
      '#{대기번호}': String(t.ticket_no ?? ''), '#{앞대기수}': ahead,
      '#{유효시간}': String(t.booths.settings?.call_valid_min ?? 5),
      '#{일시}': t.slots ? fmtKST(t.slots.starts_at) : '', '#{장소}': t.booths.location ?? '',
      '#{인원}': String(t.party_size), '#{링크}': `${BASE_URL}/t/${t.token}`, '#{token}': t.token, '#{부스slug}': t.booths.slug,
    }
    const link = fill(tpl.button_link ?? `${BASE_URL}/t/#{token}`, vars)
    vars['#{링크}'] = link
    const smsText = fill(tpl.sms_fallback_text ?? '', vars)
    const useAlimtalk = !!(tpl.ncp_template_code && tpl.alimtalk_content && AT_SVC && PF_ID)
    const smsFallback = t.booths.settings?.sms_fallback ?? true
    const payload = { to: t.phone.slice(0, 3) + '****' + t.phone.slice(-4), channel: useAlimtalk ? 'alimtalk' : 'sms', text: useAlimtalk ? fill(tpl.alimtalk_content, vars) : smsText }

    if (DRY_RUN) { await sb.from('notifications').update({ status: 'sent', channel: payload.channel, sent_at: new Date().toISOString(), payload, provider_msg_id: 'DRY_RUN' }).eq('id', n.id); sent++; continue }

    let r
    if (useAlimtalk) {
      const msg: any = { to: t.phone, content: fill(tpl.alimtalk_content, vars), useSmsFailover: smsFallback }
      if (tpl.button_name) msg.buttons = [{ type: 'WL', name: tpl.button_name, linkMobile: link, linkPc: link }]
      if (smsFallback && SMS_FROM) msg.failoverConfig = { type: smsText.length > 80 ? 'LMS' : 'SMS', from: SMS_FROM, subject: `[${t.events.name}]`, content: smsText }
      r = await ncp(`/alimtalk/v2/services/${AT_SVC}/messages`, { plusFriendId: PF_ID, templateCode: tpl.ncp_template_code, messages: [msg] })
    } else {
      r = await ncp(`/sms/v2/services/${SMS_SVC}/messages`, { type: smsText.length > 80 ? 'LMS' : 'SMS', from: SMS_FROM, subject: `[${t.events.name}]`, content: smsText, messages: [{ to: t.phone }] })
    }
    const id = r.json?.requestId ?? r.json?.messages?.[0]?.messageId ?? null
    const fail = !r.ok || (r.json?.messages?.[0]?.requestStatusCode && r.json.messages[0].requestStatusCode !== 'A000')
    await sb.from('notifications').update({
      status: fail ? 'failed' : 'sent', channel: payload.channel, sent_at: fail ? null : new Date().toISOString(),
      provider_msg_id: id, error: fail ? JSON.stringify(r.json).slice(0, 500) : null, payload,
    }).eq('id', n.id)
    fail ? failed++ : sent++
  }
  return Response.json({ sent, failed, skipped, dry_run: DRY_RUN })
})
