import { useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { rpc, supabase } from '../../lib/supabase'
import { useAsync, fmtTime, useTick } from '../../lib/util'

interface B { id: string; name: string; mode: string; is_paused: boolean; waiting_teams: number; called: number[]; last_in: number | null; avg_service_min: number | null; next_slot: { starts_at: string; left: number } | null }
interface Data { event: { name: string; notice: string | null; status: string }; now: string; booths: B[] }

/** 안내부스 모니터용 현황판 — 큰 글씨, 다크, 자동 갱신 */
export default function Board() {
  const { slug = '' } = useParams()
  const { data, reload } = useAsync<Data>(() => rpc('event_board', { p_slug: slug }), [slug])
  useTick(1000)
  useEffect(() => {
    const ch = supabase.channel(`board-${slug}`).on('postgres_changes', { event: '*', schema: 'public', table: 'booth_versions' }, () => reload()).subscribe()
    const iv = setInterval(reload, 8000)
    return () => { supabase.removeChannel(ch); clearInterval(iv) }
  }, [slug]) // eslint-disable-line

  if (!data) return <div className="min-h-dvh bg-gray-950" />
  const { event, booths } = data
  const queues = booths.filter(b => b.mode === 'queue')
  const slots = booths.filter(b => b.mode !== 'queue')
  const clock = new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Seoul' })

  return (
    <div className="min-h-dvh bg-gray-950 p-6 text-white md:p-10">
      <header className="mb-8 flex items-end justify-between">
        <div>
          <div className="text-lg text-gray-400">{event.name}</div>
          <h1 className="text-4xl font-black tracking-tight md:text-5xl">체험부스 현황</h1>
        </div>
        <div className="text-5xl font-bold tabular-nums text-gray-300">{clock}</div>
      </header>
      {event.notice && <div className="mb-8 rounded-2xl bg-amber-400 px-6 py-4 text-2xl font-bold text-amber-950">{event.notice}</div>}

      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        {queues.map(b => (
          <div key={b.id} className="rounded-3xl bg-gray-900 p-6 ring-1 ring-gray-800">
            <div className="mb-4 flex items-center justify-between">
              <div className="text-2xl font-bold">{b.name}</div>
              {b.is_paused && <span className="rounded-full bg-red-500 px-3 py-1 text-sm font-bold">접수 중단</span>}
            </div>
            <div className="mb-5">
              <div className="text-sm text-gray-400">지금 호출</div>
              <div className="flex flex-wrap items-baseline gap-3">
                {b.called.length === 0 ? <span className="text-5xl font-black text-gray-700">—</span>
                  : b.called.map((n, i) => <span key={n} className={`font-black tabular-nums ${i === 0 ? 'text-7xl text-amber-400' : 'text-4xl text-amber-200/70'}`}>{n}</span>)}
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3 text-center">
              <Stat label="대기" v={`${b.waiting_teams}팀`} />
              <Stat label="마지막 입장" v={b.last_in ? `${b.last_in}번` : '—'} />
              <Stat label="예상 대기" v={b.avg_service_min ? `약 ${Math.round(b.waiting_teams * b.avg_service_min)}분` : '—'} />
            </div>
          </div>
        ))}
        {slots.map(b => (
          <div key={b.id} className="rounded-3xl bg-gray-900 p-6 ring-1 ring-gray-800">
            <div className="mb-4 text-2xl font-bold">{b.name}</div>
            {b.next_slot ? (
              <>
                <div className="text-sm text-gray-400">다음 회차</div>
                <div className="text-6xl font-black tabular-nums text-sky-300">{fmtTime(b.next_slot.starts_at)}</div>
                <div className="mt-3 grid grid-cols-2 gap-3 text-center">
                  <Stat label="잔여석" v={b.next_slot.left > 0 ? `${b.next_slot.left}석` : '매진'} />
                  <Stat label="현장 대기" v={`${b.waiting_teams}팀`} />
                </div>
                <div className="mt-3 text-sm text-gray-500">사전 예약제 · 노쇼 자리는 현장 대기 순으로 안내</div>
              </>
            ) : <div className="py-8 text-center text-2xl text-gray-600">오늘 회차 종료</div>}
          </div>
        ))}
      </div>
      <footer className="mt-10 text-center text-sm text-gray-600">운영 · 플릿 (FLIT) · 자동 갱신</footer>
    </div>
  )
}

const Stat = ({ label, v }: { label: string; v: string }) => (
  <div className="rounded-2xl bg-gray-800/60 py-3"><div className="text-xs text-gray-400">{label}</div><div className="text-2xl font-bold tabular-nums">{v}</div></div>
)
