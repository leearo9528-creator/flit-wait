import { useMemo, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { rpc, cachedRpc } from '../../lib/supabase'
import { useAsync, useBoothLive, fmtPhone, fmtTime, fmtDate, fmtDateTime, LS } from '../../lib/util'
import { BoothSummary, SlotPublic } from '../../lib/types'
import { Page, Card, Button, Field, Input, Stepper, Alert, Spinner, Badge } from '../../components/ui'
import BoothHeader from '../../components/BoothHeader'

export default function Reserve() {
  const { slug = '' } = useParams()
  const nav = useNavigate()
  const { data, error, loading, reload } = useAsync<BoothSummary>(() => cachedRpc('booth_summary', slug), [slug])
  useBoothLive(data?.booth.id, reload, 20000, false)

  const [slotId, setSlotId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [party, setParty] = useState(1)
  const [consent, setConsent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const days = useMemo(() => {
    const m = new Map<string, SlotPublic[]>()
    for (const s of data?.slots ?? []) {
      if (new Date(s.ends_at).getTime() < Date.now()) continue
      const k = fmtDate(s.starts_at)
      m.set(k, [...(m.get(k) ?? []), s])
    }
    return [...m.entries()]
  }, [data])
  const [day, setDay] = useState<string | null>(null)
  const activeDay = day ?? days[0]?.[0] ?? null

  if (loading) return <Spinner />
  if (error || !data) return <Page><Alert kind="error">{error ?? '부스를 찾을 수 없습니다.'}</Alert></Page>

  const { booth, event } = data
  if (booth.mode === 'queue') return <Page><Alert kind="info">이 부스는 현장 대기표로 운영됩니다. <Link to={`/q/${slug}`} className="font-semibold underline">대기 접수하기</Link></Alert></Page>

  const maxParty = booth.settings.max_party_size ?? 4
  const openAt = booth.settings.reserve_open_at ? new Date(booth.settings.reserve_open_at) : null
  const notYet = !!openAt && openAt.getTime() > Date.now()
  const closeBefore = (booth.settings.reserve_close_before_min ?? 60) * 60000
  const selected = data.slots.find(s => s.id === slotId) ?? null
  const existing = LS.get<{ token: string; at: number }>(`resv:${slug}`)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!slotId) { setErr('회차를 선택해 주세요.'); return }
    setErr(null); setBusy(true)
    try {
      const r = await rpc<{ token: string }>('reserve_slot', { p_slot: slotId, p_name: name, p_phone: phone, p_party: party, p_consent: consent })
      LS.set(`resv:${slug}`, { token: r.token, at: Date.now() })
      nav(`/t/${r.token}`, { replace: true })
    } catch (e: any) { setErr(e.message); reload() } finally { setBusy(false) }
  }

  return (
    <Page>
      <BoothHeader booth={booth} event={event} tag="사전 예약" />
      {event.notice && <div className="mb-4"><Alert kind="warn">{event.notice}</Alert></div>}
      {notYet && <div className="mb-4"><Alert kind="info">예약은 <b>{fmtDateTime(openAt!.toISOString())}</b>부터 열립니다.</Alert></div>}
      {existing && Date.now() - existing.at < 7 * 86400_000 && (
        <div className="mb-4"><Alert kind="info">이미 예약하신 내역이 있어요. <Link to={`/t/${existing.token}`} className="font-semibold underline">예약 확인</Link></Alert></div>
      )}

      <Card className="mb-4">
        <div className="mb-3 text-sm font-semibold text-gray-700">1. 날짜</div>
        <div className="flex gap-2">
          {days.map(([d]) => (
            <button key={d} type="button" onClick={() => { setDay(d); setSlotId(null) }}
              className={`h-11 flex-1 rounded-xl text-sm font-semibold ring-1 ${activeDay === d ? 'bg-gray-900 text-white ring-gray-900' : 'bg-white text-gray-800 ring-gray-300'}`}>{d}</button>
          ))}
          {days.length === 0 && <div className="text-sm text-gray-500">예약 가능한 회차가 없습니다.</div>}
        </div>

        <div className="mb-3 mt-5 text-sm font-semibold text-gray-700">2. 회차</div>
        <div className="grid grid-cols-2 gap-2">
          {(days.find(([d]) => d === activeDay)?.[1] ?? []).map(s => {
            const left = s.capacity - s.reserved
            const past = Date.now() > new Date(s.starts_at).getTime() - closeBefore
            const dis = left <= 0 || past || s.status !== 'open'
            const on = slotId === s.id
            return (
              <button key={s.id} type="button" disabled={dis} onClick={() => { setSlotId(s.id); if (party > left) setParty(Math.max(1, left)) }}
                className={`rounded-xl p-3 text-left ring-1 transition ${on ? 'bg-gray-900 text-white ring-gray-900' : dis ? 'bg-gray-50 text-gray-400 ring-gray-200' : 'bg-white ring-gray-300 active:bg-gray-50'}`}>
                <div className="text-lg font-bold tabular-nums">{fmtTime(s.starts_at)}</div>
                <div className={`text-xs ${on ? 'text-gray-200' : ''}`}>
                  {s.status !== 'open' ? '마감' : left <= 0 ? '매진' : past ? '예약 마감 · 현장 대기' : `잔여 ${left}석`}
                </div>
              </button>
            )
          })}
        </div>
      </Card>

      <Card>
        <div className="mb-3 text-sm font-semibold text-gray-700">3. 예약자 정보</div>
        <form onSubmit={submit} className="space-y-4">
          {selected && (
            <div className="flex items-center justify-between rounded-xl bg-gray-50 px-4 py-3 text-sm">
              <span>{fmtDate(selected.starts_at)} {fmtTime(selected.starts_at)} 회차</span>
              <Badge tone="green">잔여 {selected.capacity - selected.reserved}석</Badge>
            </div>
          )}
          <Field label="이름 (대표자)"><Input value={name} onChange={e => setName(e.target.value)} placeholder="홍길동" required maxLength={20} autoComplete="name" /></Field>
          <Field label="휴대폰번호" hint="예약 확정·리마인드 알림을 카카오 알림톡(또는 문자)으로 보내드립니다.">
            <Input value={phone} onChange={e => setPhone(fmtPhone(e.target.value))} placeholder="010-0000-0000" inputMode="numeric" required autoComplete="tel" />
          </Field>
          <Field label={`인원 (최대 ${maxParty}명)`}><Stepper value={party} onChange={setParty} min={1} max={Math.min(maxParty, selected ? selected.capacity - selected.reserved : maxParty)} /></Field>
          <label className="flex items-start gap-3 rounded-xl bg-gray-50 p-3 text-sm">
            <input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} className="mt-0.5 h-5 w-5 rounded" required />
            <span className="text-gray-700"><span className="font-semibold">개인정보 수집·이용 동의 (필수)</span><br /><span className="text-xs text-gray-500">{event.privacy_text}</span></span>
          </label>
          <p className="text-xs text-gray-500">체험 시작 {booth.settings.noshow_after_start_min ?? 10}분이 지나도 도착하지 않으면 예약이 취소되고 현장 대기자에게 자리가 넘어갑니다. 취소는 시작 {Math.round((booth.settings.cancel_until_before_min ?? 120) / 60)}시간 전까지 가능합니다.</p>
          {err && <Alert kind="error">{err}</Alert>}
          <Button type="submit" size="lg" loading={busy} disabled={notYet || !slotId || !consent || event.status !== 'open'}>
            {notYet ? '예약 오픈 전' : '예약하기'}
          </Button>
        </form>
      </Card>
      <p className="mt-4 text-center text-xs text-gray-400">운영 · 플릿 (FLIT)</p>
    </Page>
  )
}
