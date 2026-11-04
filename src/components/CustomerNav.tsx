import { Link } from 'react-router-dom'
import { LS } from '../lib/util'

/** 손님 화면 공통 하단 바. `stamp` 가 true 면 스탬프 탭이 보인다 (행사 설정 stamp_enabled) */
export default function CustomerNav({ slug, active, stamp }: { slug?: string | null; active?: 'home' | 'map' | 'schedule' | 'stamp' | 'my'; stamp?: boolean }) {
  if (!slug) return null
  // 스탬프 탭: 아는 화면(지도·일정·스탬프)이 값을 넘기면 기억해 두고, 모르는 화면(체험부스·내 대기)은 기억한 값을 쓴다
  if (stamp !== undefined) LS.set(`stampon:${slug}`, stamp)
  const showStamp = stamp ?? !!LS.get<boolean>(`stampon:${slug}`)
  const item = (to: string, label: string, icon: string, on: boolean) => (
    <Link key={to} to={to} className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-semibold ${on ? 'text-gray-900' : 'text-gray-400'}`}>
      <span className="text-xl leading-none">{icon}</span>{label}
    </Link>
  )
  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 mx-auto flex max-w-md border-t border-gray-200 bg-white/95 backdrop-blur" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
      {item(`/e/${slug}`, '체험부스', '🎪', active === 'home')}
      {item(`/e/${slug}/map`, '지도', '🗺️', active === 'map')}
      {item(`/e/${slug}/schedule`, '일정·안내', '📅', active === 'schedule')}
      {showStamp && item(`/e/${slug}/stamp`, '스탬프', '🔖', active === 'stamp')}
      {item(`/e/${slug}/my`, '내 대기·예약', '🎫', active === 'my')}
    </nav>
  )
}
