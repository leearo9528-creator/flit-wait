import { Link } from 'react-router-dom'
import type { Booth } from '../lib/types'
import { StatusBadge, boothStatus, showGroupTag } from './BoothCard'

/**
 * 부스 상세 상단 — 주문 앱(PAMP) 상세와 같은 순서:
 * 큰 사진(뒤로가기 오버레이) → [상태 뱃지 · 존 · 카테고리] → 이름 → 대기 현황(주황) → 안내문 박스
 */
export default function BoothHeader({ booth, event, live, closed }: {
  booth: Pick<Booth, 'id' | 'name' | 'mode' | 'is_paused' | 'image_url' | 'description' | 'location' | 'group_name' | 'category'> & { settings?: Partial<Pick<Booth['settings'], 'reserve_open_at' | 'reserve_open_daily_time'>> }
  event: { name: string; slug?: string; status?: string }
  live?: React.ReactNode
  closed?: boolean
}) {
  // booth_summary 는 오픈 일시를 settings 안에 담아 주므로 상태 판정(예약 오픈 예정)에 꺼내 넘긴다
  const st = boothStatus({ ...booth, image_url: booth.image_url ?? null, reserve_open_at: booth.settings?.reserve_open_at ?? null, reserve_open_daily_time: booth.settings?.reserve_open_daily_time ?? null }, closed ?? event.status === 'closed')
  const g = showGroupTag(booth.group_name, booth.category)
  return (
    <header className="-mx-4 -mt-6 mb-4">
      <div className="relative h-60 overflow-hidden bg-gray-200">
        {booth.image_url
          ? <img src={booth.image_url} alt="" className="h-full w-full object-cover" />
          : <div className="h-full w-full bg-[radial-gradient(ellipse_at_top_right,_#fdba74_0%,_#f1f5f9_65%)]" />}
        {event.slug && (
          <Link to={`/e/${event.slug}`} aria-label="목록으로" className="absolute left-3 top-3 flex h-10 w-10 items-center justify-center rounded-full bg-black/35 text-2xl text-white backdrop-blur">‹</Link>
        )}
      </div>
      <div className="px-4 pt-5">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-gray-500">
          <StatusBadge st={st} />
          {g && <span>{g}</span>}
          {booth.category && <span>{booth.category}</span>}
        </div>
        <h1 className="mt-2 text-[26px] font-bold leading-tight tracking-tight">{booth.name}</h1>
        {live && <div className="mt-3 flex items-center gap-1.5 text-[16px] font-semibold text-orange-500"><span aria-hidden>👤</span>{live}</div>}
        {(booth.description || booth.location) && (
          <div className="mt-3 flex items-start gap-3 rounded-xl px-4 py-3.5 ring-1 ring-gray-200">
            <span className="mt-0.5 text-lg" aria-hidden>🏪</span>
            <div className="min-w-0 text-[15px] leading-relaxed text-gray-700">
              {booth.description && <div>{booth.description}</div>}
              {booth.location && <div className="text-sm text-gray-500">위치 · {booth.location}</div>}
            </div>
          </div>
        )}
      </div>
    </header>
  )
}
