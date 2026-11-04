// 운영안 자동 생성 — 운영안(붙여넣기 or PDF) → /api/plan-import (Claude) → 미리보기 → "적용" 으로 DB 에 넣는다.
// 적용은 추가만 한다(기존 핀·일정을 지우지 않는다). 두 번 적용하면 두 번 들어가니 미리보기에서 체크를 풀어 고른다.
import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { Card, Button, Alert, Field } from '../../components/ui'
import { PLACE_KIND_LABEL, PROGRAM_KIND_LABEL, type EventRow, type PlaceKind, type ProgramKind } from '../../lib/types'

interface PlanPlace { kind: PlaceKind; name: string; description?: string; hours?: string; x: number; y: number; menu?: { name: string; price?: string }[] }
interface PlanProgram { title: string; kind: ProgramKind; description?: string; place_name?: string; starts_at: string; ends_at: string }
interface PlanNotice { title: string; body: string; pinned?: boolean; urgent?: boolean }
interface PlanDraw { title: string; prize?: string; description?: string; draw_at?: string; winners_count?: number }
interface Plan {
  summary: string; places: PlanPlace[]; programs: PlanProgram[]; notices: PlanNotice[]
  info_text?: string; contact_text?: string; draws?: PlanDraw[]
  survey: { title: string; questions: { type: 'rating' | 'choice' | 'text'; label: string; options?: string[] }[] }
  stamp?: { enabled?: boolean; reward_text?: string; spot_names?: string[] }
}
type Section = 'places' | 'programs' | 'notices' | 'info' | 'draws' | 'survey' | 'stamp'

const fmt = (iso?: string) => { if (!iso) return ''; const d = new Date(iso); return isNaN(d.getTime()) ? iso : d.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) }

async function pdfToText(file: File): Promise<string> {
  const pdfjs = await import('pdfjs-dist')
  const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default
  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise
  const out: string[] = []
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i)
    const tc = await page.getTextContent()
    // 글자 단위로 쪼개져 오는 PDF(크롬 인쇄 등)가 많아 공백은 넣지 않고, 줄은 hasEOL 또는 y 변화로 끊는다
    let line = '', lastY: number | null = null
    for (const it of tc.items as any[]) {
      if (!('str' in it)) continue
      const y = it.transform?.[5]
      if (lastY !== null && Math.abs(y - lastY) > 2 && line) { out.push(line); line = '' }
      line += it.str
      if (it.hasEOL) { out.push(line); line = '' }
      lastY = y
    }
    out.push(line, `\n--- ${i}쪽 끝 ---\n`)
  }
  return out.join('\n')
}

export default function AdminPlan({ e, onSaved }: { e: EventRow; onSaved: () => void }) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [plan, setPlan] = useState<Plan | null>(null)
  const [sel, setSel] = useState<Record<Section, boolean>>({ places: true, programs: true, notices: true, info: true, draws: true, survey: true, stamp: true })
  const [done, setDone] = useState<string | null>(null)

  async function onFile(f: File | null) {
    if (!f) return
    setErr(null); setBusy('PDF 읽는 중…')
    try {
      if (f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')) setText(await pdfToText(f))
      else setText(await f.text())
    } catch (x: any) { setErr(`파일을 읽지 못했어요: ${x.message ?? x}`) }
    setBusy(null)
  }

  async function generate() {
    setErr(null); setDone(null); setPlan(null); setBusy('운영안 읽는 중… (20~40초)')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('로그인이 필요해요.')
      const r = await fetch('/api/plan-import', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ event_id: e.id, event_name: e.name, starts_at: e.starts_at, ends_at: e.ends_at, text }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j.error ?? `실패 (${r.status})`)
      setPlan(j.plan as Plan)
    } catch (x: any) { setErr(x.message ?? String(x)) }
    setBusy(null)
  }

  async function apply() {
    if (!plan) return
    setErr(null); setBusy('적용 중…')
    try {
      const ev: Record<string, unknown> = {}
      const nameToId = new Map<string, string>()
      if (sel.places && plan.places.length) {
        const { data: existing } = await supabase.from('places').select('id').eq('event_id', e.id)
        const base = (existing?.length ?? 0) * 10
        const rows = plan.places.map((p, i) => ({ event_id: e.id, kind: p.kind, name: p.name, description: p.description || null, hours: p.hours || null, x: clamp(p.x), y: clamp(p.y), menu: p.menu?.length ? p.menu : [], sort_order: base + (i + 1) * 10 }))
        const { data, error } = await supabase.from('places').insert(rows).select('id,name'); if (error) throw error
        for (const r of data ?? []) nameToId.set(r.name, r.id)
      }
      if (sel.programs && plan.programs.length) {
        const rows = plan.programs.map(p => ({ event_id: e.id, title: p.title, kind: p.kind, description: p.description || null, place_id: p.place_name ? nameToId.get(p.place_name) ?? null : null, starts_at: p.starts_at, ends_at: p.ends_at }))
          .filter(r => !isNaN(new Date(r.starts_at).getTime()) && new Date(r.ends_at) > new Date(r.starts_at))
        if (rows.length) { const { error } = await supabase.from('programs').insert(rows); if (error) throw error }
      }
      if (sel.notices && plan.notices.length) {
        const { error } = await supabase.from('notices').insert(plan.notices.map(n => ({ event_id: e.id, title: n.title, body: n.body, pinned: !!n.pinned, urgent: !!n.urgent }))); if (error) throw error
      }
      if (sel.info) { if (plan.info_text) ev.info_text = plan.info_text; if (plan.contact_text) ev.contact_text = plan.contact_text }
      if (sel.draws && plan.draws?.length) {
        const { error } = await supabase.from('draws').insert(plan.draws.map(d => ({ event_id: e.id, title: d.title, prize: d.prize || null, description: d.description || null, draw_at: d.draw_at && !isNaN(new Date(d.draw_at).getTime()) ? d.draw_at : null, winners_count: Math.min(500, Math.max(1, d.winners_count ?? 1)), status: 'open' }))); if (error) throw error
      }
      if (sel.survey && plan.survey?.questions?.length) {
        const questions = plan.survey.questions.map((q, i) => ({ id: `q${i + 1}`, type: q.type, label: q.label, options: q.type === 'choice' ? (q.options ?? []) : undefined }))
        const { error } = await supabase.from('surveys').upsert({ event_id: e.id, enabled: true, title: plan.survey.title, questions }); if (error) throw error
      }
      if (sel.stamp && plan.stamp?.enabled) {
        ev.stamp_enabled = true; if (plan.stamp.reward_text) ev.stamp_reward_text = plan.stamp.reward_text
        const spots = (plan.stamp.spot_names ?? []).filter(n => nameToId.has(n))
        if (spots.length) { const { error } = await supabase.from('stamp_spots').insert(spots.map((n, i) => ({ event_id: e.id, place_id: nameToId.get(n), name: n, sort_order: (i + 1) * 10 }))); if (error) throw error }
      }
      if (Object.keys(ev).length) { const { error } = await supabase.from('events').update(ev).eq('id', e.id); if (error) throw error }
      setDone('들어갔어요. 지도·일정·안내 탭에서 다듬어 주세요. 핀 위치는 지도 탭에서 끌어서 맞추면 돼요.')
      setPlan(null); onSaved()
    } catch (x: any) { setErr(x.message ?? String(x)) }
    setBusy(null)
  }

  const Sec = ({ k, title, n, children }: { k: Section; title: string; n: number; children: React.ReactNode }) => (
    <div className={`rounded-xl border p-3 ${sel[k] ? 'border-gray-200' : 'border-dashed border-gray-200 opacity-50'}`}>
      <label className="flex items-center gap-2 font-bold"><input type="checkbox" checked={sel[k]} onChange={x => setSel({ ...sel, [k]: x.target.checked })} />{title} <span className="text-xs font-normal text-gray-500">{n}</span></label>
      <div className="mt-2 text-sm">{children}</div>
    </div>
  )

  return (
    <div className="space-y-4">
      <Card>
        <h3 className="font-bold">운영안 자동 생성</h3>
        <p className="mt-1 text-sm text-gray-600">기획서·큐시트·부스 배치표를 붙여 넣거나 PDF 를 올리면 지도 핀·타임테이블·공지·안내·럭키드로우·설문 초안을 뽑아 줘요. 미리 보고 고른 것만 들어가요.</p>
        <div className="mt-3 grid gap-3">
          <Field label="운영안 파일 (PDF · txt · md)"><input type="file" accept=".pdf,.txt,.md,text/plain,application/pdf" onChange={x => onFile(x.target.files?.[0] ?? null)} className="block w-full text-sm" /></Field>
          <Field label="또는 붙여넣기" hint={`${text.length.toLocaleString()}자`}>
            <textarea value={text} onChange={x => setText(x.target.value)} rows={10} placeholder={'예)\n12/20(토) 11:00~20:00 ○○광장\n부스: 셀러 20팀(핸드메이드·소품), 푸드트럭 4대(핫도그·츄러스·뱅쇼·핫초코)\n무대: 11:00 오픈 캐롤 / 15:00 어쿠스틱 공연 / 18:00 럭키드로우 추첨(선물세트 3명)\n스탬프 5곳 완주 시 안내소에서 선물\n주차: 인근 공영주차장 / 우천 시 공연 취소'} className="w-full rounded-xl border border-gray-300 p-3 text-sm" />
          </Field>
          <Button onClick={generate} disabled={!!busy || text.trim().length < 40}>{busy ?? '자동 생성'}</Button>
        </div>
        {err && <div className="mt-3"><Alert kind="error">{err}</Alert></div>}
        {done && <div className="mt-3"><Alert kind="success">{done}</Alert></div>}
      </Card>

      {plan && (
        <Card>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div><h3 className="font-bold">미리보기</h3><p className="mt-1 text-sm text-gray-600">{plan.summary}</p></div>
            <Button onClick={apply} disabled={!!busy} className="!w-auto px-6">{busy ?? '체크한 것 적용'}</Button>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <Sec k="places" title="지도 핀" n={plan.places.length}>
              <ul className="space-y-1">{plan.places.map((p, i) => <li key={i}><span className="rounded bg-gray-100 px-1 text-xs">{PLACE_KIND_LABEL[p.kind] ?? p.kind}</span> <b>{p.name}</b> {p.hours && <span className="text-gray-500">{p.hours}</span>}{p.description && <div className="text-xs text-gray-500">{p.description}</div>}{p.menu?.length ? <div className="text-xs text-gray-500">{p.menu.map(m => `${m.name}${m.price ? ` ${m.price}` : ''}`).join(' · ')}</div> : null}</li>)}</ul>
              {plan.places.length === 0 && <div className="text-gray-400">없음</div>}
            </Sec>
            <Sec k="programs" title="타임테이블" n={plan.programs.length}>
              <ul className="space-y-1">{plan.programs.map((p, i) => <li key={i}><span className="tabular-nums text-gray-500">{fmt(p.starts_at)}~{fmt(p.ends_at).split(' ').pop()}</span> <b>{p.title}</b> <span className="text-xs text-gray-500">{PROGRAM_KIND_LABEL[p.kind] ?? p.kind}{p.place_name ? ` · ${p.place_name}` : ''}</span></li>)}</ul>
              {plan.programs.length === 0 && <div className="text-gray-400">없음</div>}
            </Sec>
            <Sec k="notices" title="공지" n={plan.notices.length}>
              <ul className="space-y-1">{plan.notices.map((n, i) => <li key={i}><b>{n.title}</b>{n.pinned && <span className="ml-1 text-xs text-gray-500">고정</span>}<div className="text-xs text-gray-500">{n.body}</div></li>)}</ul>
            </Sec>
            <Sec k="info" title="행사 안내·문의처" n={(plan.info_text ? 1 : 0) + (plan.contact_text ? 1 : 0)}>
              <pre className="whitespace-pre-wrap font-sans text-xs text-gray-700">{plan.info_text || '(없음)'}</pre>
              {plan.contact_text && <div className="mt-1 text-xs text-gray-700">문의: {plan.contact_text}</div>}
            </Sec>
            <Sec k="draws" title="럭키드로우" n={plan.draws?.length ?? 0}>
              <ul className="space-y-1">{(plan.draws ?? []).map((d, i) => <li key={i}><b>{d.title}</b> <span className="text-xs text-gray-500">{d.prize ?? ''} · {d.winners_count ?? 1}명{d.draw_at ? ` · ${fmt(d.draw_at)}` : ''}</span></li>)}</ul>
              {!plan.draws?.length && <div className="text-gray-400">없음</div>}
            </Sec>
            <Sec k="survey" title="만족도 설문" n={plan.survey?.questions?.length ?? 0}>
              <div className="font-semibold">{plan.survey?.title}</div>
              <ol className="list-decimal pl-5">{plan.survey?.questions?.map((q, i) => <li key={i}>{q.label} <span className="text-xs text-gray-500">{q.type}{q.options?.length ? ` · ${q.options.join('/')}` : ''}</span></li>)}</ol>
            </Sec>
            <Sec k="stamp" title="스탬프 투어" n={plan.stamp?.spot_names?.length ?? 0}>
              {plan.stamp?.enabled ? <div>{plan.stamp.reward_text && <div>보상: {plan.stamp.reward_text}</div>}<div className="text-xs text-gray-500">지점: {(plan.stamp.spot_names ?? []).join(', ') || '(지도 핀 중에서 골라야 해요)'}</div></div> : <div className="text-gray-400">운영안에 없음</div>}
            </Sec>
          </div>
          <p className="mt-3 text-xs text-gray-500">적용은 추가만 해요 — 이미 있는 핀·일정은 지우지 않아요. 한 번 더 적용하면 중복으로 들어가니 체크를 풀어 고르세요.</p>
        </Card>
      )}
    </div>
  )
}

const clamp = (n: number) => Math.min(100, Math.max(0, Number.isFinite(n) ? Math.round(n * 100) / 100 : 50))
