import { useCallback, useEffect, useState } from 'react'
import { supabase, rpc, DEMO } from './supabase'
import { LS, me } from './util'

/** 손님 로그인(카카오)은 선택 기능 — Supabase 에 카카오 로그인을 켠 뒤 VITE_CUSTOMER_LOGIN=1 로 연다. 데모에서는 흉내만 낸다 */
export const LOGIN_ENABLED = DEMO || import.meta.env.VITE_CUSTOMER_LOGIN === '1'

export type Profile = { name: string; phone: string; party: number; marketing_ok: boolean }
type State = { ready: boolean; loggedIn: boolean; profile: Profile | null; nameHint: string }
const DEMO_KEY = 'flit:demo:customer'
const digits = (s: string) => s.replace(/\D/g, '')

/** 로그인한 손님의 이름·번호. 로그인하지 않았으면 loggedIn=false 이고 화면은 지금처럼 직접 입력을 받는다 */
export function useCustomer() {
  const [s, set] = useState<State>({ ready: !LOGIN_ENABLED, loggedIn: false, profile: null, nameHint: '' })

  const load = useCallback(async () => {
    if (!LOGIN_ENABLED) return
    if (DEMO) { const p = LS.get<Profile>(DEMO_KEY); set({ ready: true, loggedIn: !!p, profile: p, nameHint: '' }); return }
    const { data } = await supabase.auth.getSession()
    const u = data.session?.user
    if (!u) { set({ ready: true, loggedIn: false, profile: null, nameHint: '' }); return }
    const p = await rpc<Profile | null>('my_profile').catch(() => null)
    const m = (u.user_metadata ?? {}) as Record<string, unknown>
    set({ ready: true, loggedIn: true, profile: p, nameHint: String(m.name ?? m.full_name ?? m.nickname ?? m.user_name ?? '') })
  }, [])

  useEffect(() => {
    load()
    if (!LOGIN_ENABLED || DEMO) return
    // 콜백 안에서 바로 supabase 를 다시 부르면 멈출 수 있어 한 박자 늦춘다
    const { data: sub } = supabase.auth.onAuthStateChange(() => { setTimeout(load, 0) })
    return () => sub.subscription.unsubscribe()
  }, [load])

  /** 카카오로 시작 — 끝나면 지금 보던 화면으로 돌아온다 */
  const login = useCallback(async () => {
    if (DEMO) {
      const p: Profile = { name: '김플릿', phone: '01012345678', party: 2, marketing_ok: false }
      LS.set(DEMO_KEY, p); me.set({ name: p.name, phone: p.phone, party: p.party }); await load(); return
    }
    const { error } = await supabase.auth.signInWithOAuth({ provider: 'kakao', options: { redirectTo: window.location.origin + window.location.pathname } })
    if (error) throw new Error('카카오 로그인을 지금 쓸 수 없어요. 이름과 번호를 직접 적어 주세요.')
  }, [load])

  const save = useCallback(async (p: Profile) => {
    const next = { ...p, phone: digits(p.phone) }
    if (DEMO) LS.set(DEMO_KEY, next)
    else await rpc('save_my_profile', { p_name: next.name, p_phone: next.phone, p_party: next.party, p_marketing: next.marketing_ok })
    me.set({ name: next.name, phone: next.phone, party: next.party })
    set(v => ({ ...v, loggedIn: true, profile: next }))
  }, [])

  const logout = useCallback(async () => {
    if (DEMO) LS.del(DEMO_KEY); else await supabase.auth.signOut()
    me.clear()
    set({ ready: true, loggedIn: false, profile: null, nameHint: '' })
  }, [])

  return { ...s, login, save, logout }
}
export type Customer = ReturnType<typeof useCustomer>
