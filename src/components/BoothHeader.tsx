import { useNavigate } from 'react-router-dom'
import type { Booth } from '../lib/types'
import { StatusBadge, boothStatus, showGroupTag } from './BoothCard'

/**
 * 줄서기·회차 예약 화면의 상단 — 지도·가게 상세와 같은 모양(흰 바탕, 뒤로 버튼, 종류 한 줄 → 이름 → 지금 현황).
 * 사진은 올린 부스만 보여 준다 (없으면 빈 그림을 두지 않는다).
 */
export default function BoothHeader({ booth, event, live, closed }: {
  booth: Pick<Booth, 'id' | 'name' | 'mode' | 'is_paused' | 'image_url' | 'description' | 'location' | 'group_name' | 'category'> & { settings?: Partial<Pick<Booth['settings'], 'reserve_open_at' | 'reserve_open_daily_time' | 'pause_mode' | 'queue_open_daily_time' | 'queue_close_daily_time' | 'open_override_date'>> }
  event: { name: string; slug?: string; status?: string }
  live?: React.ReactNode
  closed?: boolean | 'before'
}) {
  const nav = useNavigate()
  // booth_summary 는 오픈 일시·접수 시간대를 settings 안에 담아 주므로 상태 판정(예약 오픈 예정·접수 오픈 예정)에 꺼내 넘긴다
  const s = booth.settings
  const st = boothStatus({
    ...booth, image_url: booth.image_url ?? null, pause_mode: s?.pause_mode ?? null,
    reserve_open_at: s?.reserve_open_at ?? null, reserve_open_daily_time: s?.reserve_open_daily_time ?? null,
    queue_open_daily_time: s?.queue_open_daily_time ?? null, queue_close_daily_time: s?.queue_close_daily_time ?? null, open_override_date: s?.open_override_date ?? null,
  }, closed ?? event.status === 'closed')
  const g = showGroupTag(booth.group_name, booth.category)
  const back = () => (history.length > 1 ? nav(-1) : nav(event.slug ? `/e/${event.slug}` : '/'))
  return (
    <header className="-mx-4 -mt-6 mb-5">
      {booth.image_url
        ? <div className="relative">
            <img src={booth.image_url} alt="" className="block aspect-[16/10] w-full object-cover" />
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/55 to-transparent px-4 pb-2 pt-6 text-right text-[11px] text-white/90">이해를 돕기 위한 예시 사진입니다. 실물과 다를 수 있습니다.</div>
            <button type="button" onClick={back} aria-label="뒤로" className="absolute left-3 top-3 flex h-10 w-10 items-center justify-center rounded-full bg-white text-xl text-gray-900 shadow ring-1 ring-gray-200">‹</button>
          </div>
        : <div className="px-2 pt-2"><button type="button" onClick={back} aria-label="뒤로" className="flex h-10 w-10 items-center justify-center text-2xl text-gray-900">‹</button></div>}
      <div className={`px-4 ${booth.image_url ? 'pt-5' : 'pt-1'}`}>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-gray-500">
          <StatusBadge st={st} />
          {g && <span>{g}</span>}
          {booth.category && <span>{booth.category}</span>}
          {booth.location && <span>· {booth.location}</span>}
        </div>
        <h1 className="mt-1.5 text-2xl font-bold leading-tight text-gray-900">{booth.name}</h1>
        {booth.description && <p className="mt-2 text-[15px] leading-relaxed text-gray-600">{booth.description}</p>}
        {live && <div className="mt-4 rounded-2xl bg-gray-50 px-4 py-3.5 text-[16px] font-semibold text-gray-900 ring-1 ring-gray-200">{live}</div>}
      </div>
    </header>
  )
}
