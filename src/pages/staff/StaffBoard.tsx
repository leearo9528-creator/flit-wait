import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { rpc } from '../../lib/supabase'
import { LS, useAsync, useBoothLive, useTick, fmtTime, minutesSince } from '../../lib/util'
import { StaffBoard, StaffSession, StaffTicket } from '../../lib/types'
import { Page, Card, Button, Alert, Spinner, Badge, Empty, Input, Stepper } from '../../components/ui'

export default function StaffBoardPage() {
  const { slug = '' } = useParams()
  const nav = useNavigate()
  const sess = LS.get<StaffSession>(`staff:${slug}`)
  useEffect(() => { if (!sess) nav(`/s/${slug}`, { replace: true }) }, [sess, slug, nav])
  if (!sess) return null
  return <Board sess={sess} slug={slug} />
}

function Board({ sess, slug }: { sess: StaffSession; slug: string }) {
  const nav = useNavigate()
  const { data, error, loading, reload } = useAsync<StaffBoard>(() => rpc('staff_board', { p_booth: sess.booth_id, p_token: sess.staff_token }), [sess.booth_id])
  useBoothLive(sess.booth_id, reload, 5000)
  useTick(1000)
  const [tab, setTab] = useState<'queue' | 'slots'>('queue')
  const [err, setErr] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [walkin, setWalkin] = useState(false)
  const [big, setBig] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => { if (error?.includes('인증')) { LS.del(`staff:${slug}`); nav(`/s/${slug}`, { replace: true }) } }, [error, slug, nav])
  if (error && !error.includes('인증')) return <Page><Alert kind="error">{error}</Alert></Page>
  if (loading || !data) return <Spinner />

  const { booth, queue, slots } = data
  const showSlots = booth.mode !== 'queue'
  const showQueue = booth.mode !== 'slot'
  const activeTab = showQueue && showSlots ? tab : showSlots ? 'slots' : 'queue'

  async function act(id: string | null, action: string) {
    setBusyId(id ?? action); setErr(null)
    try {
      const r = await rpc<{ ok: boolean; message?: string; ticket_no?: number; name?: string; transferred?: number }>('staff_update_ticket', { p_booth: sess.booth_id, p_token: sess.staff_token, p_ticket: id, p_action: action })
      if (r && r.ok === false) setErr(r.message ?? '처리할 수 없습니다.')
      else if (action === 'call_next' && r?.ticket_no) flash(`${r.ticket_no}번 ${r.name} 호출`)
      else if (action === 'recall') flash('재호출 알림 발송')
      else if (r?.transferred) flash(`빈 자리 ${r.transferred}팀 현장 대기에서 이관 · 호출됨`)
      reload()
    }
    catch (e: any) { setErr(e.message) } finally { setBusyId(null) }
  }
  function flash(m: string) { setToast(m); setTimeout(() => setToast(null), 2500) }
  async function togglePause() {
    try { await rpc('staff_toggle_pause', { p_booth: sess.booth_id, p_token: sess.staff_token, p_paused: !booth.is_paused }); reload() }
    catch (e: any) { setErr(e.message) }
  }

  const called = queue.filter(t => t.status === 'called')
  const waiting = queue.filter(t => t.status === 'waiting')
  const validSec = (booth.settings.call_valid_min ?? 5) * 60

  return (
    <Page title={booth.name} sub="스태프" wide>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {booth.is_paused ? <Badge tone="red">접수 일시중단</Badge> : <Badge tone="green">접수 중</Badge>}
        <span className="text-sm text-gray-500">대기 {waiting.length}팀 · 호출 {called.length} · 완료 {data.done_today} · 노쇼 {data.noshow_today}</span>
        <div className="ml-auto flex gap-2">
          <button onClick={() => setBig(b => !b)} className="h-9 rounded-lg bg-white px-3 text-sm ring-1 ring-gray-300">{big ? '보통 글씨' : '큰 글씨'}</button>
          {showQueue && <button onClick={togglePause} className={`h-9 rounded-lg px-3 text-sm ring-1 ${booth.is_paused ? 'bg-green-600 text-white ring-green-600' : 'bg-white ring-gray-300'}`}>{booth.is_paused ? '접수 재개' : '접수 일시중단'}</button>}
          <button onClick={() => { LS.del(`staff:${slug}`); nav(`/s/${slug}`) }} className="h-9 rounded-lg bg-white px-3 text-sm ring-1 ring-gray-300">로그아웃</button>
        </div>
      </div>

      {showQueue && showSlots && (
        <div className="mb-4 grid grid-cols-2 gap-2">
          <button onClick={() => setTab('queue')} className={`h-11 rounded-xl text-sm font-semibold ring-1 ${activeTab === 'queue' ? 'bg-gray-900 text-white ring-gray-900' : 'bg-white ring-gray-300'}`}>현장 대기 ({queue.length})</button>
          <button onClick={() => setTab('slots')} className={`h-11 rounded-xl text-sm font-semibold ring-1 ${activeTab === 'slots' ? 'bg-gray-900 text-white ring-gray-900' : 'bg-white ring-gray-300'}`}>오늘 회차 ({slots.length})</button>
        </div>
      )}
      {err && <div className="mb-4"><Alert kind="error">{err}</Alert></div>}
      {toast && <div className="fixed inset-x-4 top-4 z-50 rounded-xl bg-gray-900 px-4 py-3 text-center text-sm font-semibold text-white shadow-lg">{toast}</div>}

      {activeTab === 'queue' && (
        <div className={big ? 'text-xl' : ''}>
          <Button size="lg" className="mb-4 !h-16 !text-xl" onClick={() => act(null, 'call_next')} loading={busyId === 'call_next'} disabled={waiting.length === 0}>
            {waiting.length === 0 ? '대기 없음' : `다음 호출 → ${waiting[0].ticket_no}번 ${waiting[0].name}`}
          </Button>
          {called.length > 0 && (
            <section className="mb-4">
              <h2 className="mb-2 text-sm font-semibold text-amber-700">호출됨 · 입장 대기</h2>
              <div className="space-y-2">
                {called.map(t => {
                  const left = Math.max(0, validSec - Math.floor((Date.now() - new Date(t.called_at!).getTime()) / 1000))
                  return (
                    <Card key={t.id} className="!p-4 ring-amber-300">
                      <div className="flex items-center gap-3">
                        <div className={`${big ? 'text-5xl' : 'text-4xl'} w-20 font-black tabular-nums`}>{t.ticket_no}</div>
                        <div className="flex-1 min-w-0">
                          <div className="truncate font-semibold">{t.name} <span className="font-normal text-gray-500">{t.party_size}명 {t.phone_tail && `· ${t.phone_tail}`}</span></div>
                          <div className={`text-sm tabular-nums ${left === 0 ? 'text-red-600 font-semibold' : 'text-amber-700'}`}>{left === 0 ? '유효시간 지남' : `남은 시간 ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`}</div>
                        </div>
                      </div>
                      <div className="mt-3 grid grid-cols-4 gap-2">
                        <Button size="lg" className="col-span-2" onClick={() => act(t.id, 'checkin')} loading={busyId === t.id}>입장</Button>
                        <Button size="lg" variant="danger" onClick={() => act(t.id, 'noshow')} loading={busyId === t.id}>노쇼</Button>
                        <Button size="lg" variant="secondary" onClick={() => act(t.id, 'recall')} loading={busyId === t.id} disabled={!t.phone_tail}>재호출</Button>
                      </div>
                    </Card>
                  )
                })}
              </div>
            </section>
          )}

          <section>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-700">대기 중 {waiting.length}팀</h2>
              <button onClick={() => setWalkin(w => !w)} className="text-sm font-semibold text-gray-700 underline">대리 접수</button>
            </div>
            {walkin && <WalkinForm sess={sess} onDone={() => { setWalkin(false); reload() }} />}
            {waiting.length === 0 && <Empty>대기 중인 팀이 없습니다.</Empty>}
            <div className="space-y-2">
              {waiting.map((t, i) => (
                <Card key={t.id} className="!p-4">
                  <div className="flex items-center gap-3">
                    <div className={`${big ? 'text-5xl' : 'text-4xl'} w-20 font-black tabular-nums`}>{t.ticket_no}</div>
                    <div className="flex-1 min-w-0">
                      <div className="truncate font-semibold">{t.name}</div>
                      <div className="text-sm text-gray-500">{t.party_size}명 {t.phone_tail ? `· ${t.phone_tail}` : '· 대리접수'}</div>
                      <div className="text-xs text-gray-400">{fmtTime(t.created_at)} 접수 · {minutesSince(t.created_at)}분</div>
                    </div>
                    <div className="flex w-24 flex-col gap-1.5">
                      <Button size="md" onClick={() => act(t.id, t.phone_tail ? 'call' : 'checkin')} loading={busyId === t.id}>{t.phone_tail ? '호출' : '입장'}</Button>
                      <Button size="sm" variant="ghost" onClick={() => act(t.id, 'noshow')} loading={busyId === t.id}>삭제</Button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </section>
        </div>
      )}

      {activeTab === 'slots' && (
        <div className={`space-y-3 ${big ? 'text-xl' : ''}`}>
          {slots.length === 0 && <Empty>오늘 회차가 없습니다.</Empty>}
          {slots.map(s => <SlotCard key={s.id} s={s} act={act} busyId={busyId} big={big} sess={sess} onWalkin={reload} />)}
        </div>
      )}
    </Page>
  )
}

function SlotCard({ s, act, busyId, big, sess, onWalkin }: { s: StaffBoard['slots'][number]; act: (id: string, a: string) => void; busyId: string | null; big: boolean; sess: StaffSession; onWalkin: () => void }) {
  const [open, setOpen] = useState(() => Math.abs(Date.now() - new Date(s.starts_at).getTime()) < 90 * 60000)
  const [walkin, setWalkin] = useState(false)
  const live = s.tickets.filter(t => ['waiting', 'called', 'checked_in', 'done'].includes(t.status))
  const seats = live.reduce((a, t) => a + t.party_size, 0)
  const checked = s.tickets.filter(t => t.status === 'checked_in' || t.status === 'done').reduce((a, t) => a + t.party_size, 0)
  const started = Date.now() > new Date(s.starts_at).getTime()
  return (
    <Card className="!p-4">
      <button className="flex w-full items-center justify-between text-left" onClick={() => setOpen(o => !o)}>
        <div>
          <div className={`${big ? 'text-3xl' : 'text-2xl'} font-bold tabular-nums`}>{fmtTime(s.starts_at)} <span className="text-base font-normal text-gray-500">~ {fmtTime(s.ends_at)}</span></div>
          <div className="text-sm text-gray-500">예약 {seats}/{s.capacity}석 · 체크인 {checked}명 {started && <Badge tone="amber">진행 중</Badge>}</div>
        </div>
        <span className="text-gray-400">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="mt-3 space-y-2">
          {s.tickets.map(t => (
            <div key={t.id} className={`flex items-center gap-3 rounded-xl p-3 ring-1 ${t.status === 'checked_in' || t.status === 'done' ? 'bg-green-50 ring-green-200' : t.status === 'no_show' ? 'bg-gray-50 ring-gray-200 opacity-60' : 'bg-white ring-gray-200'}`}>
              <div className="flex-1 min-w-0">
                <div className="truncate font-semibold">{t.name}</div>
                <div className="text-xs text-gray-500">{t.party_size}명 {t.phone_tail ? `· ${t.phone_tail}` : '· 현장'} · {t.status === 'checked_in' ? `체크인 ${fmtTime(t.checked_in_at!)}` : t.status === 'no_show' ? '노쇼' : '미도착'}</div>
              </div>
              {t.status === 'waiting' && (
                <div className="flex gap-1.5">
                  <Button size="md" className="!w-20" onClick={() => act(t.id, 'checkin')} loading={busyId === t.id}>체크인</Button>
                  <Button size="md" variant="danger" className="!w-16" onClick={() => act(t.id, 'noshow')} loading={busyId === t.id}>노쇼</Button>
                </div>
              )}
              {t.status === 'no_show' && <Button size="sm" variant="secondary" className="!w-24" onClick={() => act(t.id, 'restore')} loading={busyId === t.id}>복구</Button>}
            </div>
          ))}
          {seats < s.capacity && (
            <button onClick={() => setWalkin(w => !w)} className="w-full rounded-xl border border-dashed border-gray-300 py-3 text-sm font-semibold text-gray-600">+ 현장 손님 추가 (잔여 {s.capacity - seats}석)</button>
          )}
          {walkin && <WalkinForm sess={sess} slotId={s.id} onDone={() => { setWalkin(false); onWalkin() }} />}
        </div>
      )}
    </Card>
  )
}

function WalkinForm({ sess, slotId, onDone }: { sess: StaffSession; slotId?: string; onDone: () => void }) {
  const [name, setName] = useState('')
  const [party, setParty] = useState(1)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr(null)
    try { await rpc('staff_add_walkin', { p_booth: sess.booth_id, p_token: sess.staff_token, p_name: name, p_party: party, p_slot: slotId ?? null }); onDone() }
    catch (e: any) { setErr(e.message) } finally { setBusy(false) }
  }
  return (
    <form onSubmit={submit} className="mb-3 space-y-2 rounded-xl bg-gray-50 p-3 ring-1 ring-gray-200">
      <div className="text-xs font-semibold text-gray-500">대리 접수 (알림 없음)</div>
      <Input value={name} onChange={e => setName(e.target.value)} placeholder="이름 또는 특징 (예: 빨간모자)" />
      <Stepper value={party} onChange={setParty} min={1} max={10} />
      {err && <Alert kind="error">{err}</Alert>}
      <Button type="submit" loading={busy}>추가</Button>
    </form>
  )
}

export type { StaffTicket }
