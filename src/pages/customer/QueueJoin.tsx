import { useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { rpc, cachedRpc } from '../../lib/supabase'
import { useAsync, useBoothLive, fmtPhone, fmtDateTime, fmtWait, LS } from '../../lib/util'
import { BoothSummary } from '../../lib/types'
import { Page, Card, Button, Field, Input, Stepper, Alert, Spinner } from '../../components/ui'
import BoothHeader from '../../components/BoothHeader'
import CustomerNav from '../../components/CustomerNav'
import { queueWindowState, kstYmd } from '../../components/BoothCard'

export default function QueueJoin() {
  const { slug = '' } = useParams()
  const nav = useNavigate()
  const { data, error, loading, reload } = useAsync<BoothSummary>(() => cachedRpc('booth_summary', slug), [slug])
  useBoothLive(data?.booth.id, reload, 15000, false)

  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [party, setParty] = useState(1)
  const [consent, setConsent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const existing = LS.get<{ token: string; slug: string; at: number }>(`ticket:${slug}`)

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
            <div className="text-2xl">⏸️</div>
            <div className="mt-1 text-lg font-bold text-red-800">지금은 접수를 잠시 멈췄어요</div>
            <div className="mt-1 text-sm text-red-700">대기 인원이 많아 운영진이 접수를 일시 중단했습니다.<br />잠시 후 이 화면에서 다시 접수할 수 있어요. (자동으로 갱신됩니다)</div>
          </div>
      )}

      {cookingLike && (
        <div className="mb-4"><Alert kind="info">
          이 부스는 사전 예약제로 운영됩니다. 현장 대기는 예약 취소·노쇼 자리가 생길 때 순서대로 안내됩니다.
          <Link to={`/r/${slug}`} className="ml-1 font-semibold underline">사전 예약하기</Link>
        </Alert></div>
      )}

      {existing && Date.now() - existing.at < 6 * 3600_000 && (
        <div className="mb-4">
          <Alert kind="info">
            이미 접수한 대기표가 있어요. <Link to={`/t/${existing.token}`} className="font-semibold underline">내 대기 현황 보기</Link>
          </Alert>
        </div>
      )}

      {/* 접수 시간대 밖(오픈 전·마감 후)에는 폼을 그대로 두고 반투명 회색 박스로 덮는다 */}
      {!booth.is_paused && <div className="relative"><Card>
        <form onSubmit={submit} className="space-y-4">
          <Field label="이름 (대표자)">
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="홍길동" required maxLength={20} autoComplete="name" />
          </Field>
          <Field label="휴대폰번호" hint="호출 알림을 카카오 알림톡으로 보내드립니다.">
            <Input value={phone} onChange={e => setPhone(fmtPhone(e.target.value))} placeholder="010-0000-0000" inputMode="numeric" required autoComplete="tel" />
          </Field>
          <Field label={`인원 (최대 ${maxParty}명)`}>
            <Stepper value={party} onChange={setParty} min={1} max={maxParty} />
          </Field>
          <label className="flex items-start gap-3 rounded-xl bg-gray-50 p-3 text-sm">
            <input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} className="mt-0.5 h-5 w-5 rounded" required />
            <span className="text-gray-700">
              <span className="font-semibold">개인정보 수집·이용 동의 (필수)</span><br />
              <span className="text-xs text-gray-500">{event.privacy_text}</span>
            </span>
          </label>
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
