import type { TicketStatus } from './types'

/**
 * 대기표·예약(tickets) 상태 머신 — 화면이 같이 쓰는 사본.
 * 정본은 DB 함수다 (join_queue · reserve_slot · cancel_ticket · defer_ticket · staff_update_ticket · run_scheduler).
 * 전이 표와 "어느 화면이 무엇을 누를 수 있나"는 docs/state-machines.md.
 *
 *   waiting ──호출(스태프)──▶ called ──입장──▶ checked_in ──▶ done
 *      │                        │──유효시간 지남(스케줄러)·노쇼(스태프)──▶ no_show
 *      │──취소(손님, 호출 전까지 화면에 보임)──▶ cancelled
 *      │──회차 시작 N분 뒤(스케줄러)──▶ no_show
 *   no_show · cancelled ──복구(스태프)──▶ waiting      checked_in · done ──되돌리기──▶ called(호출됐던 대기표) | waiting
 */
type S = TicketStatus | string

export const TICKET_LABEL: Record<TicketStatus, string> = {
  waiting: '대기 중', called: '호출됨', checked_in: '입장 완료', done: '완료', no_show: '노쇼', cancelled: '취소',
}
export const TICKET_TONE: Record<TicketStatus, 'blue' | 'red' | 'green' | 'gray'> = {
  waiting: 'blue', called: 'red', checked_in: 'green', done: 'green', no_show: 'red', cancelled: 'gray',
}

/** 아직 진행 중 — 손님이 기다리거나 부르는 중 */
export const ticketActive = (s: S) => s === 'waiting' || s === 'called'
/** 입장 처리됨 (checked_in 과 done 은 화면에서 같은 뜻) */
export const ticketEntered = (s: S) => s === 'checked_in' || s === 'done'
/** 끝난 표 — 더 바뀌지 않는다(스태프가 되돌리기 전까지) */
export const ticketFinal = (s: S) => !ticketActive(s)
/** 회차 자리를 차지하는 표 — 서버의 정원 계산(waiting·called·checked_in·done)과 같은 집합 */
export const ticketHoldsSeat = (s: S) => ticketActive(s) || ticketEntered(s)
