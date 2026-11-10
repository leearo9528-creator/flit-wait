import { useEffect, useState, type ReactNode } from 'react'
import { fmtPhone, me } from '../lib/util'
import { Field, Input } from './ui'
import KakaoStart from './KakaoStart'
import type { Customer } from '../lib/customer'

/**
 * 접수·예약·주문 폼의 '누구' 칸.
 * 한 번 적고 동의한 사람(로그인했거나 이 기기에서 접수한 적이 있는 사람)에게는 다시 묻지 않는다 — 이름·번호 한 줄만 보이고 바로 누를 수 있다.
 * 처음이거나 '바꾸기' 를 누르면 입력 칸과 동의 체크가 나온다.
 */
export default function Who({ name, phone, setName, setPhone, consent, setConsent, privacy, cust, phoneHint, kakaoNote }: {
  name: string; phone: string; setName: (v: string) => void; setPhone: (v: string) => void
  consent: boolean; setConsent: (v: boolean) => void; privacy: ReactNode; cust: Customer; phoneHint?: string; kakaoNote?: string
}) {
  const [edit, setEdit] = useState(false)
  const [open, setOpen] = useState(false)
  // 로그인한 계정에 번호가 있거나, 이 기기에서 동의하고 접수한 적이 있으면 '아는 사람'
  const agreed = !!me.get().agreed || (cust.loggedIn && !!cust.profile?.phone)
  const known = agreed && !edit && name.trim().length > 0 && phone.replace(/\D/g, '').length >= 10
  useEffect(() => { if (known && !consent) setConsent(true) }, [known]) // eslint-disable-line

  if (known) return (
    <div className="rounded-xl bg-gray-50 px-4 py-3 ring-1 ring-gray-200">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="truncate text-[16px] font-bold text-gray-900">{name}</div>
          <div className="text-sm tabular-nums text-gray-600">{fmtPhone(phone)}</div>
        </div>
        <button type="button" onClick={() => { setEdit(true); setConsent(false) }} className="shrink-0 text-sm font-semibold text-gray-700 underline">바꾸기</button>
      </div>
      <button type="button" onClick={() => setOpen(o => !o)} className="mt-2 text-left text-xs text-gray-500 underline">앞서 동의한 개인정보 수집·이용 내용대로 접수돼요</button>
      {open && <div className="mt-1 text-xs text-gray-500">{privacy}</div>}
    </div>
  )
  return (
    <>
      <KakaoStart cust={cust} note={kakaoNote ?? '한 번만 하면 다음부터 이름·번호를 안 적어요'} />
      <Field label="이름 (대표자)"><Input value={name} onChange={e => setName(e.target.value)} placeholder="홍길동" required maxLength={20} autoComplete="name" /></Field>
      <Field label="휴대폰번호" hint={phoneHint}><Input value={phone} onChange={e => setPhone(fmtPhone(e.target.value))} placeholder="010-0000-0000" inputMode="numeric" required autoComplete="tel" /></Field>
      <label className="flex items-start gap-3 rounded-xl bg-gray-50 p-3 text-sm">
        <input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 rounded" required />
        <span className="text-gray-700"><span className="font-semibold">개인정보 수집·이용 동의 (필수)</span><br /><span className="text-xs text-gray-500">{privacy}</span></span>
      </label>
      <p className="text-xs text-gray-500">한 번 적으면 이 기기에서는 다음부터 다시 묻지 않아요.</p>
    </>
  )
}
