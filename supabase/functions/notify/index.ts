// notify: pending notifications → 솔라피 알림톡(실패 시 SMS 대체) 발송
// 호출: pg_cron (매분) 또는 수동. 헤더 x-cron-secret 검증.
//
// 필요한 secrets (supabase secrets set ...):
//   SOLAPI_API_KEY, SOLAPI_API_SECRET, SOLAPI_SENDER (발신번호, 숫자만), SOLAPI_PF_ID (카카오 발신프로필 pfId)
//   CRON_SECRET, PUBLIC_BASE_URL (예: https://wait.flitunion.com)
import { createClient } from 'npm:@supabase/supabase-js@2'

const SB_URL = Deno.env.get('SUPABASE_URL')!
const SB_SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const API_KEY = Deno.env.get('SOLAPI_API_KEY') ?? ''
const API_SECRET = Deno.env.get('SOLAPI_API_SECRET') ?? ''
const SENDER = Deno.env.get('SOLAPI_SENDER') ?? ''
const PF_ID = Deno.env.get('SOLAPI_PF_ID') ?? ''
const CRON_SECRET = Deno.env.get('CRON_SECRET') ?? ''
const BASE_URL = Deno.env.get('PUBLIC_BASE_URL') ?? 'https://wait.flitunion.com'
const DRY_RUN = Deno.env.get('NOTIFY_DRY_RUN') === '1'

const sb = createClient(SB_URL, SB_SERVICE)

async function hmacHeader() {
  const date = new Date().toISOString()
  const salt = crypto.randomUUID().replace(/-/g, '')
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(API_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(date + salt))
  const hex = [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, '0')).join('')
  return `HMAC-SHA256 apiKey=${API_KEY}, date=${date}, salt=${salt}, signature=${hex}`
}

const fmtKST = (iso: string) => {
  const d = new Date(iso)
  const day = d.toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric', weekday: 'short', timeZone: 'Asia/Seoul' })
  const time = d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Seoul' })
  return `${day} ${time}`
}

function fill(tpl: string, vars: Record<string, string>) {
  return tpl.replace(/#\{([^}]+)\}/g, (_, k) => vars[`#{${k}}`] ?? '')
}

Deno.serve(async (req) => {
  if (CRON_SECRET && req.headers.get('x-cron-secret') !== CRON_SECRET) {
    return new Response('forbidden', { status: 403 })
  }

  // 1) 대상 조회 (최대 100건)
  const { data: rows, error } = await sb
    .from('notifications')
    .select('id, template_code, scheduled_at, tickets!inner(id, token, name, phone, party_size, ticket_no, status, slot_id, booth_id, event_id, booths!inner(name, location, settings), events!inner(name), slots(starts_at, ends_at))')
    .eq('status', 'pending')
    .lte('scheduled_at', new Date().toISOString())
    .order('scheduled_at')
    .limit(100)
  if (error) return Response.json({ error: error.message }, { status: 500 })
  if (!rows?.length) return Response.json({ sent: 0 })

  const { data: tpls } = await sb.from('templates').select('*')
  const tplMap = Object.fromEntries((tpls ?? []).map((t: any) => [t.code, t]))

  // 2) 메시지 구성
  const messages: any[] = []
  const meta: Array<{ id: string; channel: 'alimtalk' | 'sms'; payload: any }> = []
  const skip: string[] = []

  for (const n of rows as any[]) {
    const t = n.tickets
    const tpl = tplMap[n.template_code]
    // 상태가 바뀐 티켓(취소/노쇼)에 리마인드 보내지 않음
    const stale = (n.template_code === 'R02' && t.status !== 'waiting') || (n.template_code === 'Q02' && t.status !== 'waiting')
    if (!t?.phone || !tpl?.enabled || stale) { skip.push(n.id); continue }

    // 앞 대기 수 (Q01/Q02)
    let ahead = ''
    if (n.template_code.startsWith('Q')) {
      const { data: a } = await sb.rpc('ahead_count', { p_ticket: t.id })
      ahead = String(a ?? 0)
    }
    const vars: Record<string, string> = {
      '#{행사명}': t.events.name,
      '#{부스명}': t.booths.name,
      '#{이름}': t.name,
      '#{대기번호}': String(t.ticket_no ?? ''),
      '#{앞대기수}': ahead,
      '#{유효시간}': String(t.booths.settings?.call_valid_min ?? 5),
      '#{일시}': t.slots ? fmtKST(t.slots.starts_at) : '',
      '#{장소}': t.booths.location ?? '',
      '#{인원}': String(t.party_size),
      '#{링크}': `${BASE_URL}/t/${t.token}`,
      '#{token}': t.token,
    }
    const smsText = fill(tpl.sms_fallback_text ?? '', vars)
    const useAlimtalk = !!(tpl.solapi_template_id && PF_ID)
    const msg: any = { to: t.phone, from: SENDER }
    if (useAlimtalk) {
      msg.kakaoOptions = {
        pfId: PF_ID,
        templateId: tpl.solapi_template_id,
        variables: vars,
        disableSms: !(t.booths.settings?.sms_fallback ?? true),
      }
      msg.text = smsText // 대체발송 본문
    } else {
      msg.text = smsText
      msg.type = smsText.length > 45 ? 'LMS' : 'SMS'
      if (msg.type === 'LMS') msg.subject = `[${t.events.name}]`
    }
    messages.push(msg)
    meta.push({ id: n.id, channel: useAlimtalk ? 'alimtalk' : 'sms', payload: { to: t.phone.slice(0, 3) + '****' + t.phone.slice(-4), text: smsText, template: tpl.solapi_template_id } })
  }

  if (skip.length) await sb.from('notifications').update({ status: 'skipped' }).in('id', skip)
  if (!messages.length) return Response.json({ sent: 0, skipped: skip.length })

  // 3) 발송
  if (DRY_RUN || !API_KEY) {
    for (const m of meta) await sb.from('notifications').update({ status: 'sent', channel: m.channel, sent_at: new Date().toISOString(), payload: m.payload, provider_msg_id: 'DRY_RUN' }).eq('id', m.id)
    return Response.json({ sent: messages.length, dry_run: true, skipped: skip.length })
  }

  const res = await fetch('https://api.solapi.com/messages/v4/send-many/detail', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: await hmacHeader() },
    body: JSON.stringify({ messages }),
  })
  const body = await res.json().catch(() => ({}))

  if (!res.ok) {
    const errMsg = `${res.status} ${JSON.stringify(body).slice(0, 300)}`
    for (const m of meta) await sb.from('notifications').update({ status: 'failed', channel: m.channel, error: errMsg, payload: m.payload }).eq('id', m.id)
    return Response.json({ error: errMsg }, { status: 502 })
  }

  // send-many/detail 응답: { groupInfo: { _id, ... }, failedMessageList: [...] }
  const groupId = body?.groupInfo?._id ?? body?.groupId ?? null
  const failed: any[] = body?.failedMessageList ?? []
  const failedIdx = new Set<number>()
  for (const f of failed) {
    const i = messages.findIndex(m => m.to === f.to)
    if (i >= 0) failedIdx.add(i)
  }
  await Promise.all(meta.map((m, i) => {
    const f = failedIdx.has(i)
    return sb.from('notifications').update({
      status: f ? 'failed' : 'sent',
      channel: m.channel,
      sent_at: f ? null : new Date().toISOString(),
      provider_msg_id: groupId,
      error: f ? JSON.stringify(failed.find(x => x.to === messages[i].to)).slice(0, 500) : null,
      payload: m.payload,
    }).eq('id', m.id)
  }))

  return Response.json({ sent: messages.length - failedIdx.size, failed: failedIdx.size, skipped: skip.length, groupId })
})
