// order-notify: ord_notifications.pending → 네이버 클라우드 SENS 알림톡 (실패 시 SMS 대체) 발송
// flit-wait 의 notify 함수와 같은 구조·같은 NCP 키를 쓴다 (프로젝트 secrets 공유). 주문 테이블만 다르다.
// 호출: pg_cron (매분) + ord_kick_notify() (알림 적재 즉시). 헤더 x-cron-secret 검증.
//
// secrets (notify 와 공유): NCP_ACCESS_KEY, NCP_SECRET_KEY, NCP_ALIMTALK_SERVICE_ID, NCP_PLUS_FRIEND_ID, NCP_SMS_SERVICE_ID, NCP_SMS_FROM, CRON_SECRET
// 이 함수만: ORDER_BASE_URL (기본 https://order.flitunion.com — PUBLIC_BASE_URL 은 wait 쪽이 쓰므로 이름을 달리 한다), NOTIFY_DRY_RUN
//
// 2026-11-24: 운영에만 있고 저장소에 없던 것을 플릿 프로젝트로 옮기면서 가져왔다. 테이블은 wait 스키마.
import { createClient } from 'npm:@supabase/supabase-js@2'

const env = (k: string, d = '') => Deno.env.get(k) ?? d
const sb = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { db: { schema: 'wait' } })
const ACCESS = env('NCP_ACCESS_KEY'), SECRET = env('NCP_SECRET_KEY')
const AT_SVC = env('NCP_ALIMTALK_SERVICE_ID'), PF_ID = env('NCP_PLUS_FRIEND_ID')
const SMS_SVC = env('NCP_SMS_SERVICE_ID'), SMS_FROM = env('NCP_SMS_FROM')
const CRON_SECRET = env('CRON_SECRET'), BASE_URL = env('ORDER_BASE_URL', 'https://order.flitunion.com')
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

const fill = (tpl: string, vars: Record<string, string>) => tpl.replace(/#\{([^}]+)\}/g, (_, k) => vars[`#{${k}}`] ?? '')
const won = (n: number) => Math.round(n).toLocaleString('ko-KR')
const itemsSummary = (items: Array<{ name: string; qty: number }>) => {
  if (!items?.length) return ''
  const [f, ...rest] = items
  const head = f.qty > 1 ? `${f.name} ${f.qty}` : f.name
  return rest.length ? `${head} 외 ${rest.length}` : head
}

Deno.serve(async (req) => {
  if (CRON_SECRET && req.headers.get('x-cron-secret') !== CRON_SECRET) return new Response('forbidden', { status: 403 })

  const { data: rows, error } = await sb.from('ord_notifications')
    .select('id, template_code, attempts, ord_orders!inner(id, token, phone, order_no, status, items, amount, cancel_reason, ord_vendors!inner(name, slug, location, settings), events!inner(name))')
    .eq('status', 'pending').lte('scheduled_at', new Date().toISOString()).order('scheduled_at').limit(100)
  if (error) return Response.json({ error: error.message }, { status: 500 })
  if (!rows?.length) return Response.json({ sent: 0 })

  // 원자적 선점 (pending → sending): cron 과 kick 이 겹쳐도 같은 행을 두 번 보내지 않는다
  const { data: claimed } = await sb.from('ord_notifications').update({ status: 'sending', sent_at: new Date().toISOString() })
    .in('id', rows.map((r: any) => r.id)).eq('status', 'pending').select('id')
  const mine = new Set((claimed ?? []).map((c: any) => c.id))
  const work = (rows as any[]).filter(r => mine.has(r.id))
  if (!work.length) return Response.json({ sent: 0, note: 'claimed by another run' })

  const { data: tpls } = await sb.from('templates').select('*').like('code', 'O%')
  const tplMap = Object.fromEntries((tpls ?? []).map((t: any) => [t.code, t]))

  let sent = 0, failed = 0, skipped = 0
  for (const n of work) {
    const o = n.ord_orders, tpl = tplMap[n.template_code]
    // 픽업 호출은 아직 ready 일 때만 (되돌리기·환불로 상태가 바뀌었으면 보내지 않는다)
    const stale = n.template_code === 'O02' && o?.status !== 'ready'
    // 010-00xx-xxxx 는 미할당 번호대 — 부하테스트·시뮬레이션 전용, 절대 실발송 금지 (flit-wait 2026-10-18 규칙 동일)
    const testNumber = /^01000\d{6}$/.test(o?.phone ?? '')
    if (!o?.phone || !tpl?.enabled || stale || testNumber) {
      await sb.from('ord_notifications').update({ status: 'skipped', provider_msg_id: testNumber ? 'TEST_NUMBER' : null }).eq('id', n.id); skipped++; continue
    }

    const vars: Record<string, string> = {
      '#{행사명}': o.events.name, '#{트럭명}': o.ord_vendors.name,
      '#{위치}': o.ord_vendors.location ? `(${o.ord_vendors.location})` : '',
      '#{주문번호}': String(o.order_no ?? ''), '#{메뉴}': itemsSummary(o.items ?? []), '#{금액}': won(o.amount),
      '#{사유}': o.cancel_reason ?? '판매자 취소', '#{소요시간}': String(o.ord_vendors.settings?.prep_minutes ?? 15),
      '#{링크}': `${BASE_URL}/o/${o.token}`, '#{token}': o.token,
    }
    const link = fill(tpl.button_link ?? `${BASE_URL}/o/#{token}`, vars)
    vars['#{링크}'] = link
    const smsText = fill(tpl.sms_fallback_text ?? '', vars)
    const useAlimtalk = !!(tpl.ncp_template_code && tpl.alimtalk_content && AT_SVC && PF_ID)
    const smsFallback = o.ord_vendors.settings?.sms_fallback ?? true
    const payload = { to: o.phone.slice(0, 3) + '****' + o.phone.slice(-4), channel: useAlimtalk ? 'alimtalk' : 'sms', text: useAlimtalk ? fill(tpl.alimtalk_content, vars) : smsText }

    if (DRY_RUN) { await sb.from('ord_notifications').update({ status: 'sent', channel: payload.channel, sent_at: new Date().toISOString(), payload, provider_msg_id: 'DRY_RUN' }).eq('id', n.id); sent++; continue }

    let r: Awaited<ReturnType<typeof ncp>>
    try {
      if (useAlimtalk) {
        const msg: any = { to: o.phone, content: fill(tpl.alimtalk_content, vars), useSmsFailover: !!(smsFallback && SMS_FROM) }
        if (tpl.button_name) msg.buttons = [{ type: 'WL', name: tpl.button_name, linkMobile: link }]
        if (smsFallback && SMS_FROM) msg.failoverConfig = { type: smsText.length > 80 ? 'LMS' : 'SMS', from: SMS_FROM, subject: `[${o.events.name}]`, content: smsText }
        r = await ncp(`/alimtalk/v2/services/${AT_SVC}/messages`, { plusFriendId: PF_ID, templateCode: tpl.ncp_template_code, messages: [msg] })
      } else {
        r = await ncp(`/sms/v2/services/${SMS_SVC}/messages`, { type: smsText.length > 80 ? 'LMS' : 'SMS', from: SMS_FROM, subject: `[${o.events.name}]`, content: smsText, messages: [{ to: o.phone }] })
      }
    } catch (e) { r = { ok: false, status: 0, json: { error: String(e) } } }
    const id = r.json?.requestId ?? r.json?.messages?.[0]?.messageId ?? null
    const fail = !r.ok || (r.json?.messages?.[0]?.requestStatusCode && r.json.messages[0].requestStatusCode !== 'A000')
    const attempts = (n.attempts ?? 0) + 1
    const retry = fail && attempts < 3
    await sb.from('ord_notifications').update({
      status: retry ? 'pending' : fail ? 'failed' : 'sent', attempts, channel: payload.channel,
      sent_at: fail ? null : new Date().toISOString(),
      scheduled_at: retry ? new Date(Date.now() + attempts * 120_000).toISOString() : undefined,
      provider_msg_id: id, error: fail ? `[${attempts}회] ` + JSON.stringify(r.json).slice(0, 480) : null, payload,
    }).eq('id', n.id)
    fail ? failed++ : sent++
  }
  return Response.json({ sent, failed, skipped, dry_run: DRY_RUN })
})
