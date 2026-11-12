import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { demoOnly } from '../lib/demo'
import { DEMO_EVENTS, seedMissingDemoEvents } from '../lib/demoEvents'
import { Spinner, Alert } from '../components/ui'
import DemoBanner from '../components/DemoBanner'

/**
 * /demo — 샘플 행사 다섯 벌(실외 축제 2 · 실내 페어 · 대학 축제 · 기업 행사)을 깐 뒤, 어떤 행사로 볼지 고르게 한다.
 * ?ev=fair 처럼 행사를 주면 **그 행사로 잠근다** — 그 행사만 깔고 손님 홈으로 보내며, 이 기기에서는 다른 데모 행사가 안 열린다 (?ev=all 이 잠금을 푼다).
 * ?to=admin 이면 관리자로 보낸다. ?reset=1 이면 데이터를 새로 깐다.
 * 데모 플래그·잠금·초기화는 lib/demoBoot 가 이 화면이 뜨기 전에 이미 처리했다 — 그래서 새로 로드하지 않고 화면 전환만 한다.
 */
export default function Demo() {
  const nav = useNavigate()
  const [err, setErr] = useState<string | null>(null)
  const [ready, setReady] = useState(false)
  useEffect(() => {
    (async () => {
      try {
        const toAdmin = new URLSearchParams(location.search).get('to') === 'admin'
        if ((window as any).__demoSeeding) return; (window as any).__demoSeeding = true   // StrictMode 이중 실행 방지
        const { DEMO } = await import('../lib/supabase')
        if (!DEMO) throw new Error('이 브라우저에서는 데모를 켤 수 없어요. 개인정보 보호 모드를 끄고 다시 열어 주세요.')
        const ev = DEMO_EVENTS.find(d => d.key === demoOnly())
        await seedMissingDemoEvents(ev?.key)
        if (toAdmin) nav('/admin', { replace: true })
        else if (ev) nav(`/e/${ev.slug}`, { replace: true })
        else { nav('/demo', { replace: true }); setReady(true) }
      } catch (e: any) { setErr(e.message ?? String(e)) }
    })()
  }, []) // eslint-disable-line
  if (err) return <div className="p-6"><Alert kind="error">{err}</Alert></div>
  if (!ready) return <div className="p-6"><Spinner /><p className="mt-3 text-center text-sm text-gray-500">데모 준비 중…</p></div>
  return (
    <div className="mx-auto min-h-dvh max-w-md bg-white pb-10">
      <DemoBanner />
      <header className="px-4 pb-2 pt-6">
        <h1 className="text-[22px] font-bold leading-tight text-gray-900">데모 행사 고르기</h1>
        <p className="mt-1 text-sm text-gray-500">준비하시는 행사와 가까운 걸 골라 보세요. 전부 가상 데이터예요.</p>
      </header>
      <ul className="space-y-3 px-4 pt-2">
        {DEMO_EVENTS.map(d => (
          <li key={d.key}>
            <Link to={`/e/${d.slug}`} className="flex items-stretch gap-3 overflow-hidden rounded-2xl ring-1 ring-gray-200 active:bg-gray-50">
              <img src={d.map} alt="" loading="lazy" className="h-28 w-24 shrink-0 bg-gray-100 object-cover object-top" />
              <span className="flex min-w-0 flex-1 flex-col justify-center py-3 pr-3">
                <span className="text-xs font-semibold text-blue-700">{d.type}</span>
                <span className="truncate text-[17px] font-bold text-gray-900">{d.name}</span>
                <span className="mt-0.5 text-[13px] leading-snug text-gray-500">{d.points}</span>
              </span>
              <span className="flex shrink-0 items-center pr-3 text-gray-400">›</span>
            </Link>
          </li>
        ))}
      </ul>
      <p className="px-4 pt-5 text-center text-sm"><Link to="/admin" className="font-semibold text-gray-700 underline">기획자(관리자) 화면으로 보기</Link></p>
      <p className="pt-6 text-center text-xs text-gray-400">운영 플릿 (FLIT)</p>
    </div>
  )
}
