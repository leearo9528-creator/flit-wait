import { Link } from 'react-router-dom'
import { thirdTab } from '../lib/guide'

/**
 * 손님 화면 공통 하단 바 — 홈 · 지도 · 먹거리 · 내 것 (2026-11-11 개편).
 * 홈은 '지금 뭐 하지', 지도는 '어디 있지'. 먹거리가 없는 행사는 셋째 칸이 '체험' 으로 바뀐다.
 * active 의 옛 이름(hub·home·schedule·stamp)도 받아 준다.
 */
type Key = 'now' | 'map' | 'food' | 'my' | 'hub' | 'home' | 'schedule' | 'stamp'
const ICON: Record<string, string> = {
  now: 'M4 11.5 12 5l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5h-5v5H5a1 1 0 0 1-1-1v-7.5Z',
  map: 'M12 21s-6.5-5.6-6.5-10.2A6.5 6.5 0 0 1 12 4.3a6.5 6.5 0 0 1 6.5 6.5C18.5 15.4 12 21 12 21Zm0-7.6a2.6 2.6 0 1 0 0-5.2 2.6 2.6 0 0 0 0 5.2Z',
  food: 'M7 4v7a2 2 0 0 0 2 2v7M7 4v5M9 4v5M11 4v7a2 2 0 0 1-2 2M17 20v-7m0 0c-1.7 0-2.5-1.5-2.5-4S15.5 4 17 4v9Z',
  booth: 'M4.5 6.5h15M4.5 12h15M4.5 17.5h15',
  my: 'M12 12a3.6 3.6 0 1 0 0-7.2 3.6 3.6 0 0 0 0 7.2Zm-7 8a7 7 0 0 1 14 0',
}
const ALIAS: Record<string, string> = { hub: 'map', home: 'food', schedule: 'now', stamp: 'now' }
export default function CustomerNav({ slug, active }: { slug?: string | null; active?: Key; stamp?: boolean }) {
  if (!slug) return null
  const on = active ? ALIAS[active] ?? active : undefined
  const third = thirdTab(slug)
  const item = (key: string, icon: string, to: string, label: string) => (
    <Link key={key} to={to} className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-semibold ${on === key ? 'text-gray-900' : 'text-gray-400'}`}>
      <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={on === key ? 2 : 1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={ICON[icon]} /></svg>
      {label}
    </Link>
  )
  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 mx-auto flex max-w-md border-t border-gray-200 bg-white/95 backdrop-blur" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
      {item('now', 'now', `/e/${slug}`, '홈')}
      {item('map', 'map', `/e/${slug}/map`, '지도')}
      {third === 'food' ? item('food', 'food', `/e/${slug}/food`, '먹거리') : item('food', 'booth', `/e/${slug}/booths`, '체험')}
      {item('my', 'my', `/e/${slug}/my`, '내 것')}
    </nav>
  )
}
