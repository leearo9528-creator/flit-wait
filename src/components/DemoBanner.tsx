import { DEMO } from '../lib/supabase'
import { DEMO_KEY } from '../lib/demo'

/** 데모 모드 띠 — 어느 화면에서든 "이건 가짜 데이터" 를 알린다 */
export default function DemoBanner() {
  if (!DEMO) return null
  return (
    <div className="sticky top-0 z-40 flex items-center justify-between bg-amber-400 px-3 py-1 text-[11px] font-semibold text-amber-950">
      <span>데모 모드 · 브라우저 안에서만 돌아가요 (리포트 숫자는 샘플)</span>
      <span className="flex gap-2">
        <a href="/demo?reset=1" className="underline">초기화</a>
        <button type="button" className="underline" onClick={() => { localStorage.removeItem(DEMO_KEY); localStorage.removeItem(`${DEMO_KEY}:db`); location.href = '/' }}>끝내기</button>
      </span>
    </div>
  )
}
