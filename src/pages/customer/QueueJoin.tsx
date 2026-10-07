import { useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { rpc } from '../../lib/supabase'
import { useAsync, useBoothLive, fmtPhone, LS } from '../../lib/util'
import { BoothSummary } from '../../lib/types'
import { Page, Card, Button, Field, Input, Stepper, Alert, Spinner, Badge } from '../../components/ui'
import BoothHeader from '../../components/BoothHeader'

export default function QueueJoin() {
  const { slug = '' } = useParams()
  const nav = useNavigate()
  const { data, error, loading, reload } = useAsync<BoothSummary>(() => rpc('booth_summary', { p_slug: slug }), [slug])
  useBoothLive(data?.booth.id, reload, 10000)

  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [party, setParty] = useState(1)
  const [consent, setConsent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const existing = LS.get<{ token: string; slug: string; at: number }>(`ticket:${slug}`)

  if (loading) return <Spinner />
  if (error || !data) return <Page><Alert kind="error">{error ?? '부스를 찾을 수 없습니다.'}</Alert></Page>

  const { booth, event, waiting_teams } = data
  const maxParty = booth.settings.max_party_size ?? 4
  const closed = event.status !== 'open'
  const cookingLike = booth.mode === 'hybrid'

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
      <BoothHeader booth={booth} event={event} />
      {event.notice && <div className="mb-4"><Alert kind="warn">{event.notice}</Alert></div>}

      <Card className="mb-4">
        <div className="flex items-end justify-between">
          <div>
            <div className="text-sm text-gray-500">현재 대기</div>
            <div className="text-4xl font-bold tabular-nums">{waiting_teams}<span className="ml-1 text-lg font-medium text-gray-500">팀</span></div>
            {data.avg_service_min && waiting_teams > 0 && <div className="text-sm text-gray-500">예상 약 {Math.max(1, Math.round(waiting_teams * data.avg_service_min))}분</div>}
          </div>
          {booth.is_paused ? <Badge tone="red">접수 일시중단</Badge> : closed ? <Badge tone="gray">운영 종료</Badge> : <Badge tone="green">접수 중</Badge>}
        </div>
        {booth.location && <div className="mt-2 text-sm text-gray-500">위치 · {booth.location}</div>}
        {cookingLike && (
          <div className="mt-3 text-sm text-gray-600">
            이 부스는 사전 예약제로 운영됩니다. 현장 대기는 예약 취소·노쇼 자리가 생길 때 순서대로 안내됩니다.
            <Link to={`/r/${slug}`} className="ml-1 font-semibold underline">사전 예약하기</Link>
          </div>
        )}
      </Card>

      {existing && Date.now() - existing.at < 6 * 3600_000 && (
        <div className="mb-4">
          <Alert kind="info">
            이미 접수한 대기표가 있어요. <Link to={`/t/${existing.token}`} className="font-semibold underline">내 대기 현황 보기</Link>
          </Alert>
        </div>
      )}

      <Card>
        <form onSubmit={submit} className="space-y-4">
          <Field label="이름 (대표자)">
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="홍길동" required maxLength={20} autoComplete="name" />
          </Field>
          <Field label="휴대폰번호" hint="호출 알림을 카카오 알림톡(또는 문자)으로 보내드립니다.">
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
          <Button type="submit" size="lg" loading={busy} disabled={closed || booth.is_paused || !consent}>
            {booth.is_paused ? '접수 일시중단' : closed ? '운영 시간이 아닙니다' : '대기 접수하기'}
          </Button>
        </form>
      </Card>
      <p className="mt-4 text-center text-xs text-gray-400">운영 · 플릿 (FLIT)</p>
    </Page>
  )
}
