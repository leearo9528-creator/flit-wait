import { useMemo, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { DEMO } from '../lib/supabase'
import { demoLinks, demoOnly, PC_OFF_KEY } from '../lib/demo'

/**
 * /demo/pc — PC 에서 데모를 볼 때의 틀 (2026-11-21, WAIT 업그레이드 설계서 축 ③).
 * 손님 화면은 폰 폭으로 만든 화면이라 PC 브라우저에서 그냥 열면 넓은 창 가운데 좁은 띠로 떠서 허전했다.
 * 가운데 폰 목업(같은 출처 iframe — 데모 저장소를 그대로 쓴다) + 오른쪽에 뭘 눌러 볼지 3줄 + 역할 바꾸기.
 * 폰(1024px 미만)과 실제 행사 주소에는 쓰지 않는다. '전체 화면으로 보기'를 누르면 이 탭에서는 다시 틀을 씌우지 않는다.
 * ⚠️ 폰 안 화면에서는 DemoBanner 를 숨긴다(components/DemoBanner) — 역할 링크는 이 틀의 오른쪽 패널이 맡는다.
 */
const STEPS = ['먹거리 혼잡도 확인하고 주문해 보기', '체험 부스 줄서기 · 스탬프 투어 눌러 보기', '주최 화면에서 공지 올리고 결과보고서 뽑아 보기']

export default function DemoFrame() {
  const l = useMemo(() => demoLinks(), [])
  const to = new URLSearchParams(location.search).get('to')
  // 같은 출처의 앱 경로만 받는다 (//외부주소 같은 값은 무시)
  const first = to && /^\/(?!\/)/.test(to) ? to : l.guest
  const [src, setSrc] = useState(first)
  if (!DEMO) return <Navigate to="/demo" replace />
  const roles = [
    { label: '손님', href: l.guest }, { label: '주최', href: l.host },
    ...(l.staff ? [{ label: '스태프', href: l.staff }] : []), ...(l.vendor ? [{ label: '사장님', href: l.vendor }] : []),
  ]
  const full = () => { try { sessionStorage.setItem(PC_OFF_KEY, '1') } catch { /* 저장소 없음 */ } location.href = src }
  return (
    <div className="flex min-h-dvh items-center justify-center gap-12 bg-gray-100 px-8 py-8">
      <div className="shrink-0 rounded-[44px] bg-gray-900 p-3 shadow-2xl">
        <iframe key={src} src={src} title="데모 화면" className="block h-[min(780px,calc(100dvh-112px))] w-[390px] rounded-[32px] bg-white" />
      </div>
      <aside className="w-[340px] shrink-0">
        <div className="text-sm font-semibold text-blue-700">플릿 웨이팅 데모 · 가상 데이터</div>
        <h1 className="mt-1 break-keep text-[24px] font-bold leading-tight text-gray-900">방문객 폰에 뜨는 화면 그대로예요</h1>
        <ol className="mt-5 space-y-3">
          {STEPS.map((s, i) => (
            <li key={s} className="flex gap-3 text-[16px] leading-snug text-gray-800">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gray-900 text-sm font-bold text-white">{i + 1}</span>{s}
            </li>
          ))}
        </ol>
        <div className="mt-7 text-sm font-semibold text-gray-500">화면 바꿔 보기</div>
        <div className="mt-2 flex flex-wrap gap-2">
          {roles.map(r => (
            <button key={r.label} type="button" onClick={() => setSrc(r.href)} aria-pressed={src === r.href}
              className={`rounded-full px-4 py-2 text-[15px] font-semibold ring-1 ${src === r.href ? 'bg-gray-900 text-white ring-gray-900' : 'bg-white text-gray-800 ring-gray-300 hover:bg-gray-50'}`}>{r.label}</button>
          ))}
        </div>
        <a href="https://www.flitunion.com/#contact" className="mt-7 block rounded-2xl bg-blue-700 px-5 py-4 text-center text-[16px] font-bold text-white hover:bg-blue-800">우리 행사에 맞춰 견적 문의</a>
        <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-sm font-semibold text-gray-600">
          <button type="button" onClick={full} className="underline">전체 화면으로 보기</button>
          {!demoOnly() && <a href="/demo" className="underline">행사 바꾸기</a>}
          <a href="/admin" className="underline">관리자 화면</a>
          <a href="/demo?reset=1" className="underline">초기화</a>
        </div>
      </aside>
    </div>
  )
}
