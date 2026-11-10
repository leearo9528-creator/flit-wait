import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { rpc } from '../../lib/supabase'
import { useAsync, LS, me, fmtDateTime, fmtPhone } from '../../lib/util'
import { Alert, Spinner, Button, Field, Input } from '../../components/ui'
import CustomerNav from '../../components/CustomerNav'
import type { DrawPublic } from '../../lib/types'

function cardToken(slug: string) {
  const k = `stamp:${slug}`; let t = LS.get<string>(k)
  if (!t) { t = crypto.randomUUID().replace(/-/g, ''); LS.set(k, t) }
  return t
}

/** 럭키드로우 — 응모(이름·휴대폰), 당첨자 발표(이름 가림·번호 뒷자리) */
export default function LuckyDraw() {
  const { slug = '' } = useParams()
  const token = cardToken(slug)
  const { data, error, loading, reload } = useAsync<DrawPublic[]>(() => rpc('draw_status', { p_slug: slug, p_card: token }), [slug])
  // 스탬프 완주가 조건인 추첨이 있으면 내 스탬프 수를 같이 본다 — 못 채웠으면 응모 폼 대신 안내
  const needStamp = !!data?.some(d => d.require_stamp)
  const stamp = useAsync<{ count: number; goal: number } | null>(() => needStamp ? rpc('stamp_status', { p_slug: slug, p_card: token }) : Promise.resolve(null), [slug, needStamp])
  if (loading && !data) return <Spinner />
  if (error && !data) return <div className="p-6"><Alert kind="error">{error}</Alert></div>
  return (
    <div className="mx-auto min-h-dvh max-w-md bg-white pb-24">
      <header className="sticky top-0 z-10 bg-white/95 backdrop-blur"><div className="flex h-14 items-center px-4"><h1 className="text-xl font-bold">럭키드로우</h1></div></header>
      <div className="space-y-4 px-4">
        {data?.length === 0 && <p className="py-16 text-center text-sm text-gray-400">진행 중인 추첨이 없어요.</p>}
        {data?.map(d => <DrawCard key={d.id} d={d} slug={slug} token={token} onChanged={reload} stamp={stamp.data ?? null} />)}
        <p className="pt-4 text-center text-xs text-gray-400">응모 정보는 당첨 안내에만 쓰고 행사 후 삭제돼요 · 운영 플릿 (FLIT)</p>
      </div>
      <CustomerNav slug={slug} active="hub" />
    </div>
  )
}

function DrawCard({ d, slug, token, onChanged, stamp }: { d: DrawPublic; slug: string; token: string; onChanged: () => void; stamp: { count: number; goal: number } | null }) {
  const short = d.require_stamp && !!stamp && stamp.goal > 0 && stamp.count < stamp.goal
  const [f, setF] = useState({ name: LS.get<string>('draw:name') ?? me.get().name, phone: fmtPhone(LS.get<string>('draw:phone') ?? me.get().phone) })
  const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false)
  const closed = d.status !== 'open' || (d.draw_at != null && new Date(d.draw_at).getTime() < Date.now())
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr(null)
    try {
      await rpc('draw_enter', { p_slug: slug, p_draw: d.id, p_card: token, p_name: f.name, p_phone: f.phone })
      LS.set('draw:name', f.name); LS.set('draw:phone', f.phone); onChanged()
    } catch (e: any) { setErr(e.message) } finally { setBusy(false) }
  }
  return (
    <div className="rounded-2xl bg-white p-5 ring-1 ring-gray-200">
      <div className="flex items-center gap-2 text-xs text-gray-500">
        <span className={`rounded-full px-2 py-0.5 font-bold text-white ${d.status === 'drawn' ? 'bg-gray-900' : closed ? 'bg-gray-400' : 'bg-orange-500'}`}>{d.status === 'drawn' ? '발표' : closed ? '마감' : '응모 중'}</span>
        {d.draw_at && <span>추첨 {fmtDateTime(d.draw_at)}</span>}<span>· 응모 {d.entries}명</span>
      </div>
      <h2 className="mt-2 text-lg font-bold text-gray-900">{d.title}</h2>
      {d.prize && <p className="text-[15px] font-semibold text-orange-600">🎁 {d.prize} × {d.winners_count}명</p>}
      {d.description && <p className="mt-1 text-sm text-gray-600">{d.description}</p>}
      {d.require_stamp && !short && !d.mine && <p className="mt-1 text-xs text-gray-500">스탬프 투어를 완주해야 응모할 수 있어요. <Link to={`/e/${slug}/stamp`} className="underline">내 스탬프</Link></p>}

      {d.status === 'drawn' ? (
        <div className="mt-3 rounded-xl bg-gray-50 p-3">
          {d.mine?.won ? <Alert kind="success">축하해요. 당첨됐어요. 안내소에서 이름과 휴대폰 번호를 확인하고 경품을 받으세요.</Alert>
            : d.mine ? <p className="text-sm text-gray-600">아쉽지만 이번엔 당첨되지 않았어요.</p> : null}
          <div className="mt-2 text-xs font-semibold text-gray-500">당첨자</div>
          <ul className="mt-1 flex flex-wrap gap-2 text-sm">{d.winners.map((w, i) => <li key={i} className="rounded-full bg-white px-3 py-1 ring-1 ring-gray-200">{w.name} ({w.phone_tail})</li>)}</ul>
        </div>
      ) : d.mine ? (
        <Alert kind="success">{d.mine.name}님, 응모 완료. 추첨 결과는 이 화면에서 확인할 수 있어요.</Alert>
      ) : closed ? null : short ? (
        <div className="mt-3 rounded-xl bg-gray-50 p-4 text-center ring-1 ring-gray-200">
          <div className="text-[15px] font-bold text-gray-900">스탬프 {stamp!.count} / {stamp!.goal}</div>
          <p className="mt-1 text-sm text-gray-600">{stamp!.goal - stamp!.count}개만 더 모으면 응모할 수 있어요.</p>
          <Link to={`/e/${slug}/stamp`} className="mt-3 flex h-12 items-center justify-center rounded-xl bg-gray-900 text-[15px] font-bold text-white active:bg-gray-800">스탬프 투어 가기</Link>
        </div>
      ) : (
        <form onSubmit={submit} className="mt-3 space-y-3">
          <Field label="이름"><Input value={f.name} onChange={e => setF({ ...f, name: e.target.value })} required maxLength={20} /></Field>
          <Field label="휴대폰 번호" hint="당첨 안내용"><Input type="tel" inputMode="tel" value={f.phone} onChange={e => setF({ ...f, phone: fmtPhone(e.target.value) })} required placeholder="010-0000-0000" /></Field>
          {err && <Alert kind="error">{err}</Alert>}
          <Button type="submit" loading={busy}>응모하기</Button>
        </form>
      )}
    </div>
  )
}
