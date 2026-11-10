import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { rpc } from '../../lib/supabase'
import { useAsync, LS } from '../../lib/util'
import { Alert, Spinner, Button } from '../../components/ui'
import CustomerNav from '../../components/CustomerNav'
import type { SurveyPublic } from '../../lib/types'

function cardToken(slug: string) {
  const k = `stamp:${slug}`; let t = LS.get<string>(k)
  if (!t) { t = crypto.randomUUID().replace(/-/g, ''); LS.set(k, t) }
  return t
}

/** 만족도 설문 — 별점·선택·주관식. 기기당 1회(다시 내면 덮어씀) */
export default function Survey() {
  const { slug = '' } = useParams()
  const token = cardToken(slug)
  const { data, error, loading, reload } = useAsync<SurveyPublic>(() => rpc('survey_get', { p_slug: slug, p_card: token }), [slug])
  const [a, setA] = useState<Record<string, string>>({})
  const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false); const [sent, setSent] = useState(false)
  if (loading && !data) return <Spinner />
  if (error && !data) return <div className="p-6"><Alert kind="error">{error}</Alert></div>
  const s = data!
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr(null)
    try { await rpc('survey_submit', { p_slug: slug, p_card: token, p_answers: a }); setSent(true); reload() } catch (e: any) { setErr(e.message) } finally { setBusy(false) }
  }
  return (
    <div className="mx-auto min-h-dvh max-w-md bg-white pb-24">
      <header className="sticky top-0 z-10 bg-white/95 backdrop-blur"><div className="flex h-14 items-center px-4"><h1 className="text-xl font-bold">{s.title ?? '만족도 설문'}</h1></div></header>
      <div className="px-4">
        {!s.enabled ? <Alert kind="info">지금은 설문을 받지 않아요.</Alert>
        : sent || s.done ? <Alert kind="success">{s.thanks ?? '답변 고마워요. 다음 행사에 꼭 반영할게요.'}</Alert>
        : (
          <form onSubmit={submit} className="space-y-6">
            {s.questions.map((q, i) => (
              <div key={q.id}>
                <div className="mb-2 text-[15px] font-semibold text-gray-900"><span className="mr-1.5 text-gray-400">{i + 1}.</span>{q.label}</div>
                {q.type === 'rating' && (
                  <div className="flex gap-1.5">{[1, 2, 3, 4, 5].map(n => (
                    <button key={n} type="button" onClick={() => setA({ ...a, [q.id]: String(n) })} aria-label={`${n}점`}
                      className={`h-12 flex-1 rounded-xl text-2xl ring-1 ${Number(a[q.id] ?? 0) >= n ? 'bg-gray-900 text-white ring-gray-900' : 'bg-white text-gray-300 ring-gray-200'}`}>★</button>
                  ))}</div>
                )}
                {q.type === 'choice' && (
                  <div className="flex flex-wrap gap-2">{(q.options ?? []).map(o => (
                    <button key={o} type="button" onClick={() => setA({ ...a, [q.id]: o })}
                      className={`rounded-full px-4 py-2 text-[15px] font-semibold ring-1 ${a[q.id] === o ? 'bg-gray-900 text-white ring-gray-900' : 'bg-white text-gray-800 ring-gray-300'}`}>{o}</button>
                  ))}</div>
                )}
                {q.type === 'text' && <textarea value={a[q.id] ?? ''} onChange={e => setA({ ...a, [q.id]: e.target.value.slice(0, 500) })} rows={3} className="w-full rounded-xl border border-gray-300 p-3 text-base" placeholder="자유롭게 적어 주세요" />}
              </div>
            ))}
            {err && <Alert kind="error">{err}</Alert>}
            <Button type="submit" loading={busy} disabled={s.questions.some(q => q.type !== 'text' && !a[q.id])}>보내기</Button>
          </form>
        )}
        <p className="pt-6 text-center text-xs text-gray-400">익명으로 집계돼요 · 운영 플릿 (FLIT)</p>
      </div>
      <CustomerNav slug={slug} active="now" />
    </div>
  )
}
