import { DEMO } from '../lib/supabase'
import { DEMO_KEY } from '../lib/demo'

/** 데모 모드 띠 — 어느 화면에서든 "이건 가짜 데이터" 를 알린다 */
export default function DemoBanner() {
  if (!DEMO) return null
  return (
    <div className="sticky top-0 z-40 flex items-center justify-between border-b border-blue-100 bg-blue-50 px-3 py-1.5 text-[11px] font-semibold text-blue-800">
      <span>데모 · 숫자는 가상이에요</span>
      <span className="flex gap-2.5">
        <a href="/e/demo" className="underline">손님</a>
        <a href="/s/demo-fish" className="underline">스태프</a>
        <a href="/admin" className="underline">관리자</a>
        <a href="/board/demo" className="underline">현황판</a>
        <a href="/demo?reset=1" className="underline">초기화</a>
        <button type="button" className="underline" onClick={() => { localStorage.removeItem(DEMO_KEY); localStorage.removeItem(`${DEMO_KEY}:db`); location.href = '/' }}>끝내기</button>
      </span>
    </div>
  )
}
