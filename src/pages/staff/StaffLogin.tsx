import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { rpc } from '../../lib/supabase'
import { LS } from '../../lib/util'
import { StaffSession } from '../../lib/types'
import { Page, Card, Button, Alert } from '../../components/ui'

export default function StaffLogin() {
  const { slug = '' } = useParams()
  const nav = useNavigate()
  const [pin, setPin] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    const s = LS.get<StaffSession>(`staff:${slug}`)
    if (s?.staff_token) nav(`/s/${slug}/board`, { replace: true })
  }, [slug, nav])

  async function submit(e?: React.FormEvent) {
    e?.preventDefault()
    setBusy(true); setErr(null)
    try {
      const r = await rpc<Omit<StaffSession, 'slug'>>('staff_login', { p_slug: slug, p_pin: pin })
      LS.set(`staff:${slug}`, { ...r, slug })
      nav(`/s/${slug}/board`, { replace: true })
    } catch (e: any) { setErr(e.message); setPin('') } finally { setBusy(false) }
  }

  const press = (d: string) => { if (pin.length < 6) setPin(pin + d) }

  return (
    <Page title="스태프 로그인" sub={`부스 · ${slug}`}>
      <Card>
        <form onSubmit={submit}>
          <div className="mb-4 text-center text-sm text-gray-500">부스 PIN을 입력하세요</div>
          <div className="mb-5 flex justify-center gap-3">
            {[0, 1, 2, 3, 4, 5].map(i => (
              <div key={i} className={`h-4 w-4 rounded-full ${i < pin.length ? 'bg-gray-900' : i < 4 ? 'bg-gray-300' : 'bg-gray-200'}`} />
            ))}
          </div>
          <div className="grid grid-cols-3 gap-2">
            {['1','2','3','4','5','6','7','8','9','←','0','OK'].map(k => (
              <button key={k} type={k === 'OK' ? 'submit' : 'button'}
                onClick={() => k === '←' ? setPin(pin.slice(0, -1)) : k === 'OK' ? undefined : press(k)}
                className={`h-16 rounded-xl text-2xl font-semibold ring-1 active:bg-gray-100 ${k === 'OK' ? 'bg-gray-900 text-white ring-gray-900' : 'bg-white ring-gray-300'}`}>
                {k}
              </button>
            ))}
          </div>
          {err && <div className="mt-4"><Alert kind="error">{err}</Alert></div>}
          <div className="mt-4"><Button type="submit" loading={busy} disabled={pin.length < 4}>입장</Button></div>
        </form>
      </Card>
    </Page>
  )
}
