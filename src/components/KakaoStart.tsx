import { useState } from 'react'
import { LOGIN_ENABLED, type Customer } from '../lib/customer'

/** '카카오로 시작하기' — 로그인하지 않은 손님에게만 보인다. 로그인은 선택이라 아래 폼은 그대로 쓸 수 있다 */
export default function KakaoStart({ cust, note }: { cust: Customer; note?: string }) {
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  if (!LOGIN_ENABLED || !cust.ready || cust.loggedIn) return null
  async function go() { setErr(null); setBusy(true); try { await cust.login() } catch (e: any) { setErr(e.message) } finally { setBusy(false) } }
  return (
    <div>
      <button type="button" onClick={go} disabled={busy}
        className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#FEE500] text-[15px] font-bold text-[#191919] active:brightness-95 disabled:opacity-60">
        <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true"><path fill="#191919" d="M12 3C6.48 3 2 6.58 2 11c0 2.83 1.84 5.31 4.6 6.73-.2.73-.72 2.66-.83 3.07-.13.51.19.5.4.37.16-.11 2.6-1.76 3.65-2.48.7.1 1.43.16 2.18.16 5.52 0 10-3.58 10-8S17.52 3 12 3z" /></svg>
        카카오로 시작하기
      </button>
      {note && !err && <p className="mt-1.5 text-center text-xs text-gray-500">{note}</p>}
      {err && <p className="mt-1.5 text-center text-xs text-red-600">{err}</p>}
    </div>
  )
}
