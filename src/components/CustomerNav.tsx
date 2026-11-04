import { Link } from 'react-router-dom'

/** 손님 화면 공통 하단 바 5탭. 스탬프는 홈 카드·지도에서 들어간다 */
export default function CustomerNav({ slug, active }: { slug?: string | null; active?: 'hub' | 'home' | 'map' | 'schedule' | 'stamp' | 'my'; stamp?: boolean }) {
  if (!slug) return null
  const item = (to: string, label: string, icon: string, on: boolean) => (
    <Link key={to} to={to} className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-semibold ${on ? 'text-gray-900' : 'text-gray-400'}`}>
      <span className="text-xl leading-none">{icon}</span>{label}
    </Link>
  )
  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 mx-auto flex max-w-md border-t border-gray-200 bg-white/95 backdrop-blur" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
      {item(`/e/${slug}`, '홈', '🏠', active === 'hub')}
      {item(`/e/${slug}/booths`, '체험부스', '🎪', active === 'home')}
      {item(`/e/${slug}/map`, '지도', '🗺️', active === 'map')}
      {item(`/e/${slug}/schedule`, '일정·안내', '📅', active === 'schedule')}
      {item(`/e/${slug}/my`, '내 대기·예약', '🎫', active === 'my')}
    </nav>
  )
}
