import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { rpc, cachedRpc } from '../../lib/supabase'
import { useAsync, useBoothLive, fmtPhone, fmtDateTime, fmtWait, LS, me } from '../../lib/util'
import { BoothSummary } from '../../lib/types'
import { Page, Card, Button, Field, Input, Stepper, Alert, Spinner } from '../../components/ui'
import BoothHeader from '../../components/BoothHeader'
import CustomerNav from '../../components/CustomerNav'
import Who from '../../components/Who'
import { useCustomer } from '../../lib/customer'
import { queueWindowState, kstYmd } from '../../components/BoothCard'

export default function QueueJoin() {
  const { slug = '' } = useParams()
  const nav = useNavigate()
  const { data, error, loading, reload } = useAsync<BoothSummary>(() => cachedRpc('booth_summary', slug), [slug])
  useBoothLive(data?.booth.id, reload, 15000, false)

  const [name, setName] = useState(() => me.get().name)
  const [phone, setPhone] = useState(() => me.get().phone)
  const [party, setParty] = useState(() => me.get().party)
  const [consent, setConsent] = useState(false)
  const [again, setAgain] = useState(false)
  // 로그인한 손님이면 계정에 저장된 이름·번호를 한 번 채운다
  const cust = useCustomer()
  const filled = useRef(false)
  useEffect(() => {
    const p = cust.profile
    if (filled.current || !cust.loggedIn) return
    filled.current = true
    if (p?.phone) { setName(p.name); setPhone(fmtPhone(p.phone)); setParty(p.party) }
    else if (!name && cust.nameHint) setName(cust.nameHint.slice(0, 20))
  }, [cust.loggedIn, cust.profile]) // eslint-disable-line
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const existing = LS.get<{ token: string; slug: string; at: number }>(`ticket:${slug}`)
  const hasExisting = !!existing && Date.now() - existing.at < 6 * 3600_000

  if (loading) return <Spinner />
  if (!data) return <Page><Alert kind="error">{error ?? '부스를 찾을 수 없습니다.'}</Alert></Page>  // 폴링 실패 시 마지막 정상 화면 유지

  const { booth, event, waiting_teams } = data
  // 예약 전용(slot) 부스는 현장 대기 접수가 없음 → 예약 화면으로 안내 (Reserve 의 queue 모드 처리와 대칭)
  if (booth.mode === 'slot') return <Page><Alert kind="info">이 부스는 사전 예약제로 운영됩니다. <Link to={`/r/${slug}`} className="font-semibold underline">예약하러 가기</Link></Alert></Page>
  const maxParty = booth.settings.max_party_size ?? 4
  const closed = event.status !== 'open'
  // 스태프가 오늘 '접수 오픈'을 눌렀으면(open_override_date) 행사 시작 시각 전이라도 받는다 (서버 join_queue 도 동일, migration 0031)
  const openedToday = booth.settings.open_override_date === kstYmd(new Date())
  const beforeStart = !closed && !openedToday && new Date(event.starts_at).getTime() > Date.now()
  const cookingLike = booth.mode === 'hybrid'
  // 일별 접수 시간대 (관리자 설정) — 스태프가 오늘 '오픈'을 눌렀으면 open. 마감·일시중단이 우선
  const ws = queueWindowState(booth.settings)
  const windowBlocked = !booth.is_paused && ws !== 'open'

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setErr(null); setBusy(true)
    try {
      const r = await rpc<{ token: string }>('join_queue', { p_slug: slug, p_name: name, p_phone: phone, p_party: party, p_consent: consent })
      me.set({ name, phone, party, agreed: true })
      if (cust.loggedIn) cust.save({ name, phone, party, marketing_ok: cust.profile?.marketing_ok ?? false }).catch(() => {})
      if (existing?.token) LS.set(`ticket:${slug}:${existing.token.slice(0, 8)}`, existing)   // 앞서 받은 표도 '내 대기'에 남긴다
      LS.set(`ticket:${slug}`, { token: r.token, slug, at: Date.now() })
      nav(`/t/${r.token}`, { replace: true })
    } catch (e: any) { setErr(e.message) } finally { setBusy(false) }
  }

  return (
    <Page>
      <BoothHeader booth={booth} event={event} closed={closed ? true : beforeStart && ws === 'open' ? 'before' : false}
        live={<>대기손님 현황 <b className="tabular-nums">{waiting_teams}팀</b>{waiting_teams > 0 && fmtWait(data.avg_service_min ? waiting_teams * data.avg_service_min : null, waiting_teams) ? <span className="ml-1 font-normal text-gray-500">· 예상 {fmtWait(data.avg_service_min ? waiting_teams * data.avg_service_min : null, waiting_teams)}</span> : null}</>} />
      {event.notice && <div className="mb-4"><Alert kind="warn">{event.notice}</Alert></div>}
      {booth.is_paused && (booth.settings.pause_mode === 'closed_today'
        ? <div className="mb-4 rounded-2xl bg-gray-100 p-5 text-center ring-1 ring-gray-300">
            <div className="text-2xl">🌙</div>
            <div className="mt-1 text-lg font-bold text-gray-800">오늘 접수가 마감되었습니다</div>
            <div className="mt-1 text-sm text-gray-600">오늘은 더 이상 접수를 받지 않아요.<br />내일 운영 시간에 다시 만나요.</div>
          </div>
        : <div className="mb-4 rounded-2xl bg-red-50 p-5 text-center ring-1 ring-red-200">
            <div className="text-lg font-bold text-red-800">대기 인원이 많아 접수가 일시 중단 되었습니다.</div>
            <div className="mt-1 text-sm text-red-700">원활한 운영을 위해 최선을 다하겠습니다.</div>
          </div>
      )}

      {cookingLike && (
        <div className="mb-4"><Alert kind="info">
          이 부스는 사전 예약제로 운영됩니다. 현장 대기는 예약 취소·노쇼 자리가 생길 때 순서대로 안내됩니다.
          <Link to={`/r/${slug}`} className="ml-1 font-semibold underline">사전 예약하기</Link>
        </Alert></div>
      )}

      {hasExisting && (
        <div className="mb-4">
          <Alert kind="info">
            이미 접수한 대기표가 있어요. <Link to={`/t/${existing.token}`} className="font-semibold underline">내 대기 현황 보기</Link>
          </Alert>
          {!again && <button type="button" onClick={() => setAgain(true)} className="mt-3 text-sm text-gray-500 underline">다른 사람 이름으로 한 번 더 접수</button>}
        </div>
      )}

      {/* 접수 시간대 밖(오픈 전·마감 후)에는 폼을 그대로 두고 반투명 회색 박스로 덮는다 */}
      {!booth.is_paused && !(hasExisting && !again) && <div className="relative"><Card>
        <form onSubmit={submit} className="space-y-4">
          <Who name={name} phone={phone} setName={setName} setPhone={setPhone} consent={consent} setConsent={setConsent} privacy={event.privacy_text} cust={cust} phoneHint="호출 알림을 카카오 알림톡으로 보내드립니다." />
          <Field label={`인원 (최대 ${maxParty}명)`}>
            <Stepper value={party} onChange={setParty} min={1} max={maxParty} />
          </Field>
          {err && <Alert kind="error">{err}</Alert>}
          <Button type="submit" size="lg" loading={busy} disabled={closed || beforeStart || booth.is_paused || windowBlocked || !consent}>
            {booth.is_paused ? (booth.settings.pause_mode === 'closed_today' ? '오늘 접수 마감' : '일시 중단') : windowBlocked ? (ws === 'before_open' ? '접수 예정' : '오늘 접수 마감') : closed ? '운영 시간이 아닙니다' : beforeStart ? '행사 시작 전' : '대기 접수하기'}
          </Button>
        </form>
      </Card>
      {windowBlocked && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center rounded-2xl bg-gray-500/60 px-6 text-center text-white backdrop-blur-[1.5px]">
          <div className="text-2xl font-bold">{ws === 'before_open' ? '접수 예정' : '오늘 접수 마감'}</div>
          <div className="mt-1.5 text-lg font-semibold">{ws === 'before_open' ? `대기 접수 : ${booth.settings.queue_open_daily_time}~` : `접수 ${booth.settings.queue_close_daily_time} 마감`}</div>
          {ws === 'before_open' && booth.settings.queue_open_note && <div className="mt-1 text-sm text-white/90">{booth.settings.queue_open_note}</div>}
        </div>
      )}
      </div>}
      <p className="mt-4 text-center text-xs text-gray-400">운영 · 플릿 (FLIT)</p>
      <CustomerNav slug={(event as any).slug} />
    </Page>
  )
}
