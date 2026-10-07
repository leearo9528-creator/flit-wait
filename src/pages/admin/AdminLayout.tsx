import { useEffect, useState } from 'react'
import { Outlet, Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import type { Session } from '@supabase/supabase-js'
import { Page, Card, Button, Field, Input, Alert, Spinner } from '../../components/ui'

export default function AdminLayout() {
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])
  if (session === undefined) return <Spinner />
  if (!session) return <Login />
  return (
    <div className="min-h-dvh">
      <nav className="sticky top-0 z-10 flex h-12 items-center gap-4 border-b bg-white/90 px-4 text-sm backdrop-blur">
        <Link to="/admin" className="font-bold">FLIT WAIT · 관리자</Link>
        <span className="ml-auto text-gray-500">{(session.user.user_metadata as any)?.label ?? '관리자'}</span>
        <button onClick={() => supabase.auth.signOut()} className="text-gray-600 underline">로그아웃</button>
      </nav>
      <Outlet />
    </div>
  )
}

function Login() {
  const [code, setCode] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr(null)
    try {
      const r = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-login`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', apikey: import.meta.env.VITE_SUPABASE_ANON_KEY },
        body: JSON.stringify({ code }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error ?? '로그인 실패')
      const { error } = await supabase.auth.verifyOtp({ token_hash: j.token_hash, type: 'magiclink' })
      if (error) throw error
    } catch (e: any) { setErr(e.message) } finally { setBusy(false) }
  }
  return (
    <Page title="관리자" sub="FLIT WAIT">
      <Card>
        <form onSubmit={submit} className="space-y-4">
          <Field label="접속 코드" hint="플릿에서 발급한 코드를 입력하세요. 예: FLIT-XXXX-XXXX">
            <Input value={code} onChange={e => setCode(e.target.value.toUpperCase())} placeholder="FLIT-" autoComplete="off" autoCapitalize="characters" required className="font-mono tracking-wider" />
          </Field>
          {err && <Alert kind="error">{err}</Alert>}
          <Button type="submit" loading={busy}>입장</Button>
        </form>
      </Card>
    </Page>
  )
}
