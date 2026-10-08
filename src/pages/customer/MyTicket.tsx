import { useState, useRef } from 'react'
import { useParams, Link } from 'react-router-dom'
import { rpc } from '../../lib/supabase'
import { useAsync, fmtTime, fmtDate, STATUS_LABEL, useTick, LS } from '../../lib/util'
import { Ticket } from '../../lib/types'
import { Page, Card, Button, Alert, Spinner, Badge } from '../../components/ui'
import CustomerNav from '../../components/CustomerNav'
import { useEffect } from 'react'

export default function MyTicket() {
  const { token = '' } = useParams()
  const { data: t, error, loading, reload } = useAsync<Ticket>(() => rpc('get_ticket', { p_token: token }), [token])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  useTick(1000)

  // 호출되면 진동 + 소리 + 브라우저 알림 (알림톡이 늦을 때 보조)
  const prevStatus = useRef<string | null>(null)
  const [alertOn, setAlertOn] = useState<boolean>(() => LS.get<boolean>('alert:on') ?? true)
  useEffect(() => {
    if (!t) return
    if (prevStatus.current && prevStatus.current !== 'called' && t.status === 'called') {
      try { navigator.vibrate?.([300, 100, 300, 100, 600]) } catch {}
      if (alertOn) { try { beep() } catch {} }
      if ('Notification' in window && Notification.permission === 'granted') {
        try { new Notification(`${t.booth.name} 입장하세요`, { body: `대기번호 ${t.ticket_no}번 · ${t.booth.settings.call_valid_min ?? 5}분 안에 부스로 와주세요`, tag: 'flit-call' }) } catch {}
      }
    }
    prevStatus.current = t.status
  }, [t?.status]) // eslint-disable-line
  async function enableNotify() {
    if (!('Notification' in window)) return
    const p = await Notification.requestPermission(); setAlertOn(true); LS.set('alert:on', true)
    if (p === 'granted') try { beep() } catch {}
  }

  // 대기 상태 변화 감지: booth_versions 구독 (slug 기준 booth id 를 모르니 폴링 중심 + 전체 테이블 변경 구독)
  // 손님 화면은 Realtime 대신 폴링 (동시접속 수천 명 대비 — Realtime 연결 수 한도 보호). 호출 임박/호출 상태면 더 자주.
  useEffect(() => {
    let timer: number
    const tick = () => {
      if (document.visibilityState === 'visible') reload()
      const hot = t?.status === 'called' || (t?.ahead != null && t.ahead <= 2)
      const base = hot ? 6000 : 15000
      timer = window.setTimeout(tick, base + Math.random() * 3000)
    }
    timer = window.setTimeout(tick, 8000)
    const onVis = () => { if (document.visibilityState === 'visible') reload() }
    document.addEventListener('visibilitychange', onVis)
    return () => { clearTimeout(timer); document.removeEventListener('visibilitychange', onVis) }
  }, [token, t?.status, t?.ahead]) // eslint-disable-line

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
      {(t.event as any).slug && <Link to={`/e/${(t.event as any).slug}`} className="-mt-3 mb-3 inline-block text-sm font-semibold text-gray-600 underline">← 체험부스 전체</Link>}
      {t.event.notice && <div className="mb-4"><Alert kind="warn">{t.event.notice}</Alert></div>}

      <Card className="mb-4 text-center">
        <div className="mb-2"><Badge tone={tone}>{STATUS_LABEL[t.status]}</Badge></div>

        {(t.status === 'checked_in' || t.status === 'done') && (
          <div className="mb-4 rounded-xl bg-green-50 py-4 ring-1 ring-green-200">
            <div className="text-lg font-bold text-green-900">입장 완료 · 즐거운 체험 되세요</div>
            <div className="mt-1 text-sm text-green-800">{isSlot ? '체크인이 확인되었습니다.' : '대기가 끝났습니다. 이 화면은 닫으셔도 돼요.'}</div>
          </div>
        )}
        {!isSlot && (
          <>
            <div className="text-sm text-gray-500">대기번호</div>
            <div className="text-7xl font-black tabular-nums tracking-tight">{t.ticket_no}</div>
            {t.status === 'waiting' && (
              <div className="mt-4 rounded-xl bg-gray-50 py-3">
                <div className="text-sm text-gray-500">내 앞 대기</div>
                <div className="text-3xl font-bold tabular-nums">{t.ahead}<span className="ml-1 text-base font-medium text-gray-500">팀</span></div>
                {t.est_wait_min != null && t.ahead! > 0 && <div className="text-sm text-gray-500">예상 약 {Math.max(1, t.est_wait_min)}분</div>}
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

      {!isSlot && t.status === 'waiting' && 'Notification' in window && Notification.permission === 'default' && (
        <div className="mb-4">
          <button onClick={enableNotify} className="w-full rounded-xl bg-amber-50 px-4 py-3 text-left text-sm text-amber-900 ring-1 ring-amber-200">
            <b>🔔 이 화면 알림 켜기</b> — 호출되면 소리·진동으로 알려드려요. (알림톡과 별개, 화면을 꺼두면 안 울려요)
          </button>
        </div>
      )}

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
      <CustomerNav slug={(t.event as any).slug} active="my" />
    </Page>
  )
}

function beep() {
  const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext
  if (!Ctx) return
  const ctx = new Ctx(); const now = ctx.currentTime
  ;[0, 0.25, 0.5].forEach((d, i) => {
    const o = ctx.createOscillator(); const g = ctx.createGain()
    o.type = 'sine'; o.frequency.value = i === 2 ? 1320 : 880
    g.gain.setValueAtTime(0.0001, now + d); g.gain.exponentialRampToValueAtTime(0.4, now + d + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, now + d + 0.2)
    o.connect(g).connect(ctx.destination); o.start(now + d); o.stop(now + d + 0.22)
  })
}
