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
        <span className="ml-auto text-gray-500">{session.user.email}</span>
        <button onClick={() => supabase.auth.signOut()} className="text-gray-600 underline">로그아웃</button>
      </nav>
      <Outlet />
    </div>
  )
}

function Login() {
  const [email, setEmail] = useState('')
  const [pw, setPw] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr(null)
    const { error } = await supabase.auth.signInWithPassword({ email, password: pw })
    if (error) setErr(error.message)
    setBusy(false)
  }
  return (
    <Page title="관리자 로그인" sub="FLIT WAIT">
      <Card>
        <form onSubmit={submit} className="space-y-4">
          <Field label="이메일"><Input type="email" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="email" /></Field>
          <Field label="비밀번호"><Input type="password" value={pw} onChange={e => setPw(e.target.value)} required autoComplete="current-password" /></Field>
          {err && <Alert kind="error">{err}</Alert>}
          <Button type="submit" loading={busy}>로그인</Button>
        </form>
      </Card>
    </Page>
  )
}
