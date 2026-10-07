import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { rpc } from '../../lib/supabase'
import { useAsync, fmtTime, fmtDate, STATUS_LABEL, useTick } from '../../lib/util'
import { Ticket } from '../../lib/types'
import { Page, Card, Button, Alert, Spinner, Badge } from '../../components/ui'
import { useEffect } from 'react'
import { supabase } from '../../lib/supabase'

export default function MyTicket() {
  const { token = '' } = useParams()
  const { data: t, error, loading, reload } = useAsync<Ticket>(() => rpc('get_ticket', { p_token: token }), [token])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  useTick(1000)

  // 대기 상태 변화 감지: booth_versions 구독 (slug 기준 booth id 를 모르니 폴링 중심 + 전체 테이블 변경 구독)
  useEffect(() => {
    const ch = supabase.channel(`ticket-${token}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'booth_versions' }, () => reload())
      .subscribe()
    const iv = setInterval(reload, 7000)
    const onVis = () => { if (document.visibilityState === 'visible') reload() }
    document.addEventListener('visibilitychange', onVis)
    return () => { supabase.removeChannel(ch); clearInterval(iv); document.removeEventListener('visibilitychange', onVis) }
  }, [token]) // eslint-disable-line

  if (loading) return <Spinner />
  if (error || !t) return <Page><Alert kind="error">{error ?? '티켓을 찾을 수 없습니다.'}</Alert></Page>

  const isSlot = !!t.slot
  const callValid = (t.booth.settings.call_valid_min ?? 5) * 60
  const calledElapsed = t.called_at ? Math.floor((Date.now() - new Date(t.called_at).getTime()) / 1000) : 0
  const callLeft = Math.max(0, callValid - calledElapsed)

  async function cancel() {
    if (!confirm(isSlot ? '예약을 취소할까요?' : '대기를 취소할까요?')) return
    setBusy(true); setErr(null)
    try { await rpc('cancel_ticket', { p_token: token }); reload() } catch (e: any) { setErr(e.message) } finally { setBusy(false) }
  }

  const tone = ({ waiting: 'blue', called: 'amber', checked_in: 'green', done: 'green', no_show: 'red', cancelled: 'gray' } as const)[t.status]

  return (
    <Page title={t.booth.name} sub={t.event.name}>
      {t.event.notice && <div className="mb-4"><Alert kind="warn">{t.event.notice}</Alert></div>}

      <Card className="mb-4 text-center">
        <div className="mb-2"><Badge tone={tone}>{STATUS_LABEL[t.status]}</Badge></div>

        {!isSlot && (
          <>
            <div className="text-sm text-gray-500">대기번호</div>
            <div className="text-7xl font-black tabular-nums tracking-tight">{t.ticket_no}</div>
            {t.status === 'waiting' && (
              <div className="mt-4 rounded-xl bg-gray-50 py-3">
                <div className="text-sm text-gray-500">내 앞 대기</div>
                <div className="text-3xl font-bold tabular-nums">{t.ahead}<span className="ml-1 text-base font-medium text-gray-500">팀</span></div>
                {t.ahead !== null && t.ahead <= (t.booth.settings.notify_ahead_teams ?? 2) && <div className="mt-1 text-sm font-semibold text-amber-700">곧 차례예요. 부스 근처로 와주세요.</div>}
              </div>
            )}
            {t.status === 'called' && (
              <div className="mt-4 rounded-xl bg-amber-50 py-4 ring-1 ring-amber-200">
                <div className="text-lg font-bold text-amber-900">지금 입장해 주세요</div>
                <div className="mt-1 text-sm text-amber-800">{Math.floor(callLeft / 60)}:{String(callLeft % 60).padStart(2, '0')} 안에 부스로 오지 않으면 다음 순서로 넘어갑니다.</div>
              </div>
            )}
          </>
        )}

        {isSlot && (
          <>
            <div className="text-sm text-gray-500">예약 회차</div>
            <div className="text-3xl font-bold">{fmtDate(t.slot!.starts_at)}</div>
            <div className="text-5xl font-black tabular-nums tracking-tight">{fmtTime(t.slot!.starts_at)}</div>
            <div className="mt-1 text-sm text-gray-500">~ {fmtTime(t.slot!.ends_at)}</div>
            {t.status === 'waiting' && (
              <div className="mt-4 rounded-xl bg-gray-50 px-4 py-3 text-sm text-gray-700">
                시작 10분 전까지 부스에 도착해 이 화면을 스태프에게 보여주세요. 시작 {t.booth.settings.noshow_after_start_min ?? 10}분 후까지 미도착 시 자동 취소됩니다.
              </div>
            )}
          </>
        )}

        <div className="mt-4 grid grid-cols-2 gap-2 text-left text-sm">
          <div className="rounded-xl bg-gray-50 p-3"><div className="text-xs text-gray-500">예약자</div><div className="font-semibold">{t.name}</div></div>
          <div className="rounded-xl bg-gray-50 p-3"><div className="text-xs text-gray-500">인원</div><div className="font-semibold">{t.party_size}명</div></div>
          {t.phone_tail && <div className="rounded-xl bg-gray-50 p-3 col-span-2"><div className="text-xs text-gray-500">연락처</div><div className="font-semibold">010-****-{t.phone_tail}</div></div>}
        </div>
        {t.booth.location && <div className="mt-3 text-sm text-gray-500">위치 · {t.booth.location}</div>}
      </Card>

      {(t.status === 'no_show' || t.status === 'cancelled') && (
        <div className="mb-4">
          <Alert kind="info">
            {t.status === 'no_show' ? '시간 내 도착하지 않아 순서가 지나갔어요.' : '취소된 접수입니다.'}{' '}
            <Link to={isSlot ? `/r/${t.booth.slug}` : `/q/${t.booth.slug}`} className="font-semibold underline">{isSlot ? '다시 예약하기' : '다시 접수하기'}</Link>
          </Alert>
        </div>
      )}

      {err && <div className="mb-4"><Alert kind="error">{err}</Alert></div>}
      {t.can_cancel && <Button variant="secondary" onClick={cancel} loading={busy}>{isSlot ? '예약 취소' : '대기 취소'}</Button>}

      <p className="mt-6 text-center text-xs text-gray-400">이 화면은 자동으로 갱신됩니다 · 운영 플릿 (FLIT)</p>
    </Page>
  )
}
