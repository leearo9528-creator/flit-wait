import { useEffect, useRef, useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { rpc, DEMO } from '../../lib/supabase'
import { useAsync, LS } from '../../lib/util'
import { Alert, Spinner, Button } from '../../components/ui'
import CustomerNav from '../../components/CustomerNav'
import type { StampStatus } from '../../lib/types'

/** 손님 기기마다 카드 하나 — localStorage 토큰. 지우면 새 카드가 된다 (행사 하루이틀이라 충분) */
function cardToken(slug: string) {
  const k = `stamp:${slug}`
  let t = LS.get<string>(k)
  if (!t) { t = crypto.randomUUID().replace(/-/g, ''); LS.set(k, t) }
  return t
}

/**
 * 스탬프 투어 — /e/:slug/stamp 는 내 카드, /e/:slug/stamp/:code 는 부스 QR 진입(적립 후 카드로)
 */
export default function StampTour() {
  const { slug = '', code } = useParams()
  const nav = useNavigate()
  const token = cardToken(slug)
  const { data, error, loading, reload } = useAsync<StampStatus>(() => rpc('stamp_status', { p_slug: slug, p_card: token }), [slug])
  const [toast, setToast] = useState<{ kind: 'success' | 'info' | 'error'; text: string } | null>(null)

  // QR 로 들어온 경우: 적립 → 결과 안내 → 카드 화면으로 주소 정리
  const collected = useRef<string | null>(null)  // StrictMode 이중 실행·재렌더에서 같은 코드를 두 번 보내지 않게
  useEffect(() => {
    if (!code || collected.current === code) return
    collected.current = code
    ;(async () => {
      try {
        const r = await rpc<{ spot: string; new: boolean; count: number; goal: number; completed: boolean }>('stamp_collect', { p_slug: slug, p_code: code, p_card: token })
        setToast(r.new ? { kind: 'success', text: `${r.spot} 스탬프를 찍었어요. (${r.count}/${r.goal})` } : { kind: 'info', text: `${r.spot} 스탬프는 이미 찍었어요.` })
      } catch (e: any) { setToast({ kind: 'error', text: e.message }) }
      nav(`/e/${slug}/stamp`, { replace: true })
      reload()
    })()
  }, [code]) // eslint-disable-line

  if (loading && !data) return <Spinner />
  if (error && !data) return <div className="p-6"><Alert kind="error">{error}</Alert></div>
  const s = data!
  // 데모에서는 QR 을 찍을 수 없으니, 아직 안 찍은 지점의 QR 주소를 대신 연다
  const demoStamp = () => { try { const db = JSON.parse(localStorage.getItem('flit:demo:db') ?? '{}'); const next = s.spots.find(x => !x.got); const c = (db.stamp_spots ?? []).find((x: any) => x.id === next?.id || x.name === next?.name)?.code; if (c) nav(`/e/${slug}/stamp/${c}`) } catch { /* 데모 저장소 없음 */ } }
  const done = s.count >= s.goal && s.goal > 0

  return (
    <div className="mx-auto min-h-dvh max-w-md bg-white pb-24">
      <header className="sticky top-0 z-10 bg-white/95 backdrop-blur">
        <div className="flex h-14 items-center px-4"><h1 className="text-xl font-bold">스탬프 투어</h1></div>
      </header>
      <div className="px-4">
        {toast && <div className="mb-3"><Alert kind={toast.kind}>{toast.text}</Alert></div>}
        {!s.enabled && <Alert kind="info">지금은 스탬프 투어가 진행 중이 아니에요.</Alert>}
        {DEMO && s.enabled && !done && <button type="button" onClick={demoStamp} className="mb-3 flex h-12 w-full items-center justify-center rounded-xl bg-blue-50 text-[15px] font-bold text-blue-800 ring-1 ring-blue-200 active:bg-blue-100">데모 · QR 찍은 것처럼 스탬프 받기</button>}

        {s.enabled && (
          <>
            <div className="rounded-2xl bg-gray-900 px-5 py-5 text-white">
              <div className="text-sm text-white/60">모은 스탬프</div>
              <div className="mt-1 text-4xl font-bold tabular-nums">{s.count} <span className="text-xl text-white/50">/ {s.goal}</span></div>
              {s.reward_text && !done && <p className="mt-2 text-sm text-white/70">{s.goal}개를 모으면 {s.reward_text}</p>}
              {done && (
                <div className="mt-4 rounded-xl bg-white px-4 py-3 text-gray-900">
                  <div className="text-xs text-gray-500">{s.redeemed_at ? '경품 수령 완료' : '경품 교환 코드 — 안내소 스태프에게 보여 주세요'}</div>
                  <div className={`mt-0.5 text-3xl font-bold tracking-[0.2em] tabular-nums ${s.redeemed_at ? 'text-gray-400 line-through' : ''}`}>{s.reward_code}</div>
                  {s.reward_text && <div className="mt-1 text-sm text-gray-600">{s.reward_text}</div>}
                </div>
              )}
            </div>

            <ul className="mt-5 grid grid-cols-3 gap-3">
              {s.spots.map((sp, i) => (
                <li key={sp.id} className={`flex aspect-square flex-col items-center justify-center rounded-2xl text-center ring-1 ${sp.got ? 'bg-orange-500 text-white ring-orange-500' : 'bg-gray-50 text-gray-400 ring-gray-200'}`}>
                  <div className="text-2xl font-bold">{sp.got ? '✓' : i + 1}</div>
                  <div className={`mt-1 px-1 text-[12px] font-semibold leading-tight ${sp.got ? 'text-white' : 'text-gray-500'}`}>{sp.name}</div>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-center text-sm text-gray-500">부스에 붙어 있는 스탬프 QR 을 카메라로 찍으면 자동으로 적립돼요.</p>
            <div className="mt-3"><Link to={`/e/${slug}`}><Button variant="secondary">지도에서 부스 찾기</Button></Link></div>
          </>
        )}
        <p className="pt-6 text-center text-xs text-gray-400">운영 플릿 (FLIT)</p>
      </div>
      <CustomerNav slug={slug} active="stamp" stamp={s.enabled} />
    </div>
  )
}
