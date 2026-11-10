import { Link } from 'react-router-dom'

/** 손님 화면 공통 하단 바 — 어느 화면·어느 행사에서도 같은 4탭. 홈이 곧 지도(대기 현황)이고, 스탬프·럭키드로우는 홈 아래 '행사 즐기기' 에서 들어간다 */
type Key = 'hub' | 'home' | 'map' | 'schedule' | 'stamp' | 'my'
const ICON: Record<string, string> = {
  hub: 'M12 21s-6.5-5.6-6.5-10.2A6.5 6.5 0 0 1 12 4.3a6.5 6.5 0 0 1 6.5 6.5C18.5 15.4 12 21 12 21Zm0-7.6a2.6 2.6 0 1 0 0-5.2 2.6 2.6 0 0 0 0 5.2Z',
  home: 'M4.5 6.5h15M4.5 12h15M4.5 17.5h15',
  schedule: 'M6 4.5v3M18 4.5v3M4.5 9.5h15M6.5 6h11a2 2 0 0 1 2 2v9.5a2 2 0 0 1-2 2h-11a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2Z',
  my: 'M5 8a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v1.5a2.5 2.5 0 0 0 0 5V16a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-1.5a2.5 2.5 0 0 0 0-5V8Zm9-2v12',
}
export default function CustomerNav({ slug, active }: { slug?: string | null; active?: Key; stamp?: boolean }) {
  if (!slug) return null
  const on = active === 'map' || active === 'stamp' ? 'hub' : active
  const item = (key: string, to: string, label: string) => (
    <Link key={key} to={to} className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-semibold ${on === key ? 'text-gray-900' : 'text-gray-400'}`}>
      <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={on === key ? 2 : 1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={ICON[key]} /></svg>
      {label}
    </Link>
  )
  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 mx-auto flex max-w-md border-t border-gray-200 bg-white/95 backdrop-blur" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
      {item('hub', `/e/${slug}`, '지도')}
      {item('home', `/e/${slug}/booths`, '체험')}
      {item('schedule', `/e/${slug}/schedule`, '일정·안내')}
      {item('my', `/e/${slug}/my`, '내 대기')}
    </nav>
  )
}
