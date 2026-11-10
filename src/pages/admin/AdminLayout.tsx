import { useEffect, useState } from 'react'
import { Outlet, Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import type { Session } from '@supabase/supabase-js'
import { Page, Card, Button, Field, Input, Alert, Spinner } from '../../components/ui'
import DemoBanner from '../../components/DemoBanner'

export default function AdminLayout() {
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    // 로그인 화면이 떠 있는 동안 하위 화면 청크를 미리 받아둔다 → 입장 직후 화면 전환이 즉시
    const idle = (cb: () => void) => ('requestIdleCallback' in window ? (window as any).requestIdleCallback(cb) : setTimeout(cb, 300))
    idle(() => { import('./AdminEvents'); import('./AdminEvent'); import('./AdminBooth') })
    return () => sub.subscription.unsubscribe()
  }, [])
  if (session === undefined) return <Spinner />
  if (!session) return <Login />
  return (
    <div className="min-h-dvh bg-gray-50">
      <DemoBanner />
      <nav className="sticky top-0 z-10 flex h-12 items-center gap-4 border-b bg-white/90 px-4 text-sm backdrop-blur">
        <Link to="/admin" className="font-bold">FLIT 축제 앱 · 행사 관리</Link>
        <span className="ml-auto text-gray-500">{(session.user.user_metadata as any)?.label ?? session.user.email ?? '관리자'}</span>
        <button onClick={() => supabase.auth.signOut()} className="text-gray-600 underline">로그아웃</button>
      </nav>
      <Outlet />
    </div>
  )
}

function Login() {
  const [mode, setMode] = useState<'email' | 'code'>('email')
  return (
    <Page title="기획자 · 행사 관리" sub="FLIT 축제 앱">
      <div className="mb-3 flex gap-1 rounded-xl bg-gray-100 p-1 text-sm">
        {(['email', 'code'] as const).map(m => (
          <button key={m} type="button" onClick={() => setMode(m)} className={`flex-1 rounded-lg py-2 font-semibold ${mode === m ? 'bg-white shadow-sm' : 'text-gray-600'}`}>{m === 'email' ? '이메일·카카오로 시작' : '접속 코드'}</button>
        ))}
      </div>
      {mode === 'email' ? <EmailLogin /> : <CodeLogin />}
    </Page>
  )
}

/** 셀프 가입 — 이메일 매직링크 또는 카카오. 로그인 후 '새 행사' 로 자기 행사를 만들면 그 행사의 담당자가 된다 */
function EmailLogin() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const redirectTo = `${window.location.origin}/admin`
  async function sendLink(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr(null)
    const { error } = await supabase.auth.signInWithOtp({ email: email.trim(), options: { emailRedirectTo: redirectTo } })
    if (error) setErr(error.message); else setSent(true)
    setBusy(false)
  }
  async function kakao() {
    setErr(null)
    const { error } = await supabase.auth.signInWithOAuth({ provider: 'kakao', options: { redirectTo } })
    if (error) setErr(`카카오 로그인을 아직 쓸 수 없어요. 이메일로 시작해 주세요. (${error.message})`)
  }
  return (
    <Card>
      {sent ? (
        <Alert kind="success">{email} 로 로그인 링크를 보냈어요. 메일의 링크를 누르면 바로 들어와져요. (안 보이면 스팸함 확인)</Alert>
      ) : (
        <form onSubmit={sendLink} className="space-y-4">
          <Field label="이메일" hint="처음이면 자동으로 가입돼요. 결제 없이 행사를 만들고 바로 써 볼 수 있어요.">
            <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="name@example.com" required autoComplete="email" />
          </Field>
          {err && <Alert kind="error">{err}</Alert>}
          <Button type="submit" loading={busy}>로그인 링크 받기</Button>
          <button type="button" onClick={kakao} className="flex h-12 w-full items-center justify-center rounded-xl bg-[#FEE500] font-semibold text-[#191919] active:scale-[0.98]">카카오로 시작하기</button>
        </form>
      )}
    </Card>
  )
}

function CodeLogin() {
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
    <Card>
      <form onSubmit={submit} className="space-y-4">
        <Field label="접속 코드" hint="플릿이 대행하는 행사는 발급받은 코드로 들어와요. 예: FLIT-XXXX-XXXX">
          <Input value={code} onChange={e => setCode(e.target.value.toUpperCase())} placeholder="FLIT-" autoComplete="off" autoCapitalize="characters" required className="font-mono tracking-wider" />
        </Field>
        {err && <Alert kind="error">{err}</Alert>}
        <Button type="submit" loading={busy}>입장</Button>
      </form>
    </Card>
  )
}
