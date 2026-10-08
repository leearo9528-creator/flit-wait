import { useEffect, useRef, useState, useCallback } from 'react'
import { supabase } from './supabase'

export const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Seoul' })

export const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric', weekday: 'short', timeZone: 'Asia/Seoul' })

export const fmtDateTime = (iso: string) => `${fmtDate(iso)} ${fmtTime(iso)}`

export const fmtPhone = (digits: string) => {
  const d = digits.replace(/\D/g, '').slice(0, 11)
  if (d.length <= 3) return d
  if (d.length <= 7) return `${d.slice(0, 3)}-${d.slice(3)}`
  return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`
}

export const minutesSince = (iso: string) => Math.floor((Date.now() - new Date(iso).getTime()) / 60000)

export const STATUS_LABEL: Record<string, string> = {
  waiting: '대기 중',
  called: '호출됨',
  checked_in: '입장 완료',
  done: '완료',
  no_show: '노쇼',
  cancelled: '취소',
}

/** 부스 version 변경 구독 + 폴링 fallback → 콜백 재실행 */
export function useBoothLive(boothId: string | undefined, reload: () => void, pollMs = 8000, realtime = true) {
  const reloadRef = useRef(reload)
  reloadRef.current = reload
  useEffect(() => {
    if (!boothId) return
    const ch = realtime ? supabase
      .channel(`booth-${boothId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'booth_versions', filter: `booth_id=eq.${boothId}` }, () => reloadRef.current())
      .subscribe() : null
    const iv = setInterval(() => { if (document.visibilityState === 'visible') reloadRef.current() }, pollMs + Math.random() * 3000)
    const onVis = () => { if (document.visibilityState === 'visible') reloadRef.current() }
    document.addEventListener('visibilitychange', onVis)
    return () => { if (ch) supabase.removeChannel(ch); clearInterval(iv); document.removeEventListener('visibilitychange', onVis) }
  }, [boothId, pollMs, realtime])
}

/** 간단 async 상태 */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const run = useCallback(() => {
    fn().then(d => { setData(d); setError(null) }).catch(e => setError(e.message)).finally(() => setLoading(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  useEffect(() => { run() }, [run])
  return { data, error, loading, reload: run, setData }
}

/** 1초 틱 (남은 시간 표시용) */
export function useTick(ms = 1000) {
  const [, set] = useState(0)
  useEffect(() => { const i = setInterval(() => set(n => n + 1), ms); return () => clearInterval(i) }, [ms])
}

export const LS = {
  get<T>(k: string): T | null { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : null } catch { return null } },
  set(k: string, v: unknown) { try { localStorage.setItem(k, JSON.stringify(v)) } catch {} },
  del(k: string) { try { localStorage.removeItem(k) } catch {} },
}
