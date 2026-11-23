import { useState, type FormEvent, type ReactNode } from 'react'
import { DEMO } from '../lib/supabase'
import { rolesUnlocked, unlockRoles, inFrame } from '../lib/demo'
import { Alert, Button, Field, Input } from './ui'

/**
 * 데모의 운영자 화면 잠금 (2026-11-23, WAIT 업그레이드 설계서 축 ①).
 * 손님 화면은 입력 없이 열리고, 주최·스태프·사장님·관리자 화면은 이름·기관명·이메일을 적어야 열린다.
 * 적은 내용은 www 의 api/demo 가 문의와 같은 Discord 채널로 보낸다 — 알림이 가야 열린다(누가 봤는지 모르는 채로 열리지 않게).
 * 한 번 적은 기기는 다시 묻지 않는다 (flit:demo:roles). 실제 행사 주소(데모가 아닐 때)에는 아무것도 하지 않는다.
 * ⚠️ 문턱일 뿐이다 — 데모는 브라우저 안에서만 돌아 저장소 값을 직접 바꾸면 넘어간다. 가짜 이메일도 통과한다(메일 확인 단계 없음).
 * ⚠️ 받는 항목을 바꾸면 www 의 api/demo 와 /privacy 표도 같이 고칠 것.
 */
const LEAD_API = import.meta.env.VITE_DEMO_LEAD_API || 'https://www.flitunion.com/api/demo'
const ROLE_LABEL = { host: '주최', staff: '스태프', vendor: '사장님', admin: '관리자' } as const
type Role = keyof typeof ROLE_LABEL

export default function DemoRoleGate({ role, children }: { role: Role; children: ReactNode }) {
  const [open, setOpen] = useState(() => !DEMO || rolesUnlocked())
  const [form, setForm] = useState({ name: '', org: '', email: '' })
  const [consent, setConsent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  if (open) return <>{children}</>

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm(f => ({ ...f, [k]: e.target.value }))
  async function submit(e: FormEvent) {
    e.preventDefault()
    if (busy) return
    if (!form.name.trim() || !form.org.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) { setErr('이름, 기관명, 이메일을 확인해 주세요.'); return }
    if (!consent) { setErr('개인정보 수집·이용에 동의해 주세요.'); return }
    setBusy(true); setErr(null)
    try {
      const res = await fetch(LEAD_API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...form, role, consent: true }) })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok) throw new Error(data.error || '접수하지 못했어요.')
      unlockRoles(); setOpen(true)
    } catch (e: any) {
      setErr(`${e?.message === 'Failed to fetch' ? '연결하지 못했어요.' : e?.message ?? '접수하지 못했어요.'} 잠시 뒤 다시 눌러 주세요.`)
    } finally { setBusy(false) }
  }

  return (
    <div className="mx-auto min-h-dvh max-w-md bg-white px-5 pb-10 pt-8">
      <div className="text-sm font-semibold text-blue-700">플릿 웨이팅 데모</div>
      <h1 className="mt-1 break-keep text-[22px] font-bold leading-tight text-gray-900">{ROLE_LABEL[role]} 화면은 운영자용이에요</h1>
      <p className="mt-2 break-keep text-[15px] leading-relaxed text-gray-600">이름·기관명·이메일을 적으면 주최·스태프·사장님·관리자 화면이 바로 열려요. 한 번만 적으면 돼요.</p>
      <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
        <Field label="이름"><Input value={form.name} onChange={set('name')} autoComplete="name" placeholder="홍길동" maxLength={50} /></Field>
        <Field label="기관명"><Input value={form.org} onChange={set('org')} autoComplete="organization" placeholder="○○시청 문화관광과" maxLength={100} /></Field>
        <Field label="이메일"><Input type="email" inputMode="email" value={form.email} onChange={set('email')} autoComplete="email" placeholder="name@example.com" maxLength={100} /></Field>
        <label className="flex items-start gap-3 text-sm text-gray-800">
          <input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0" />
          <span>개인정보 수집·이용에 동의해요
            <span className="mt-1 block text-xs text-gray-500">이름·기관명·이메일을 데모 안내와 상담에 쓰고 1년 뒤 지워요. <a href="https://www.flitunion.com/privacy" target="_blank" rel="noopener" className="underline">개인정보처리방침</a></span>
          </span>
        </label>
        {err && <Alert kind="error">{err}</Alert>}
        <Button type="submit" loading={busy}>{ROLE_LABEL[role]} 화면 열기</Button>
      </form>
      {/* 폰 목업 안에서는 틀의 오른쪽 패널에 손님 화면 단추가 있다 */}
      {!inFrame() && <a href="/demo" className="mt-5 block text-center text-sm font-semibold text-gray-600 underline">손님 화면으로 돌아가기</a>}
    </div>
  )
}
