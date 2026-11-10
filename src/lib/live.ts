import { fmtTime } from './util'
import { CROWD_LABEL, type GuidePlace } from './types'

export type Tone = 'go' | 'mid' | 'busy' | 'time' | 'off'
export type Live = { text: string; tone: Tone; sort: number }
// 색은 셋만 쓴다 — 바로 입장·여유 = 코발트, 보통 = 검정, 오래 기다림·혼잡 = 빨강. (플릿 사이트와 같은 오프화이트 + 코발트 톤)
export const TONE_PIN: Record<Tone, string> = { go: 'bg-blue-700 text-white', mid: 'bg-gray-900 text-white', busy: 'bg-red-600 text-white', time: 'bg-white text-gray-900', off: 'bg-gray-200 text-gray-500' }
export const TONE_TEXT: Record<Tone, string> = { go: 'text-blue-700', mid: 'text-gray-900', busy: 'text-red-600', time: 'text-gray-900', off: 'text-gray-400' }

/** 장소 한 곳의 '지금' 한 줄. 예상 대기(분)를 서버가 주면 분으로, 없으면 팀 수로 보여 준다 */
export function liveOf(p: GuidePlace): Live | null {
  const b = p.booth
  if (b) {
    if (b.is_paused) return { text: '접수 중단', tone: 'off', sort: 9999 }
    if (b.mode === 'queue' || (b.mode === 'hybrid' && b.today_left <= 0)) {
      if (b.waiting_teams <= 0) return { text: '바로 입장', tone: 'go', sort: 0 }
      if (b.est_wait_min != null) {
        const m = Math.max(1, Math.round(b.est_wait_min))
        return { text: m >= 60 ? '60분+' : `${m}분`, tone: m <= 15 ? 'go' : m <= 35 ? 'mid' : 'busy', sort: m }
      }
      return { text: `${b.waiting_teams}팀`, tone: b.waiting_teams <= 3 ? 'go' : b.waiting_teams <= 10 ? 'mid' : 'busy', sort: b.waiting_teams * 5 }
    }
    if (b.today_left <= 0) return { text: '예약 마감', tone: 'off', sort: 9998 }
    return b.next_slot_at ? { text: `${fmtTime(b.next_slot_at)} 회차`, tone: 'time', sort: 20 } : { text: `잔여 ${b.today_left}석`, tone: 'time', sort: 20 }
  }
  if (p.crowd) return { text: CROWD_LABEL[p.crowd], tone: p.crowd === 'low' ? 'go' : p.crowd === 'mid' ? 'mid' : 'busy', sort: p.crowd === 'low' ? 100 : p.crowd === 'mid' ? 200 : 300 }
  return null
}

