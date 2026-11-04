import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { rpc } from '../../lib/supabase'
import { useAsync, fmtDate, fmtPhone } from '../../lib/util'
import { Page, Card, Alert, Spinner, Button, Field, Input } from '../../components/ui'
import ImageUpload from '../../components/ImageUpload'

const KINDS = [['market', '마켓 셀러'], ['food', '푸드트럭·먹거리'], ['booth', '체험 부스'], ['other', '기타']] as const

/**
 * 셀러·푸드트럭 셀프 등록 (/v/:token) — 기획자가 단톡방에 링크를 뿌리면 업체가 직접 입력.
 * 승인되면 손님 지도·먹거리 목록에 올라간다. 연락처는 기획자만 본다.
 */
export default function VendorSignup() {
  const { token = '' } = useParams()
  const { data, error, loading } = useAsync<{ event_name: string; slug: string; open: boolean; starts_at: string; ends_at: string } | null>(() => rpc('vendor_info', { p_token: token }), [token])
  const [f, setF] = useState({ kind: 'market' as typeof KINDS[number][0], name: '', description: '', menu: '', image_url: null as string | null, contact: '' })
  const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false); const [done, setDone] = useState(false)
  if (loading) return <Spinner />
  if (error || !data) return <Page><Alert kind="error">등록 링크가 올바르지 않아요.</Alert></Page>
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr(null)
    const menu = f.menu.split('\n').map(l => l.trim()).filter(Boolean).map(l => { const m = l.match(/^(.*?)\s+(\S*\d\S*)$/); return m ? { name: m[1].trim(), price: m[2] } : { name: l } })
    try {
      await rpc('vendor_submit', { p_token: token, p_kind: f.kind, p_name: f.name, p_description: f.description, p_menu: menu, p_image_url: f.image_url, p_contact: f.contact })
      setDone(true)
    } catch (e: any) { setErr(e.message) } finally { setBusy(false) }
  }
  return (
    <Page title={`${data.event_name} 참가 업체 등록`} sub={`${fmtDate(data.starts_at)} ~ ${fmtDate(data.ends_at)}`}>
      <Card>
        {!data.open ? <Alert kind="info">지금은 등록을 받지 않아요. 주최 측에 문의해 주세요.</Alert>
        : done ? <Alert kind="success">등록됐어요. 주최 측이 확인하면 행사 앱 지도와 목록에 올라가요.</Alert>
        : (
          <form onSubmit={submit} className="space-y-4">
            <p className="text-sm text-gray-600">아래 내용이 방문객 앱(지도·먹거리 목록)에 그대로 보여요. 연락처는 주최 측만 봐요.</p>
            <Field label="구분">
              <div className="flex flex-wrap gap-2">{KINDS.map(([k, l]) => <button key={k} type="button" onClick={() => setF({ ...f, kind: k })} className={`rounded-full px-4 py-2 text-[15px] font-semibold ring-1 ${f.kind === k ? 'bg-gray-900 text-white ring-gray-900' : 'bg-white text-gray-800 ring-gray-300'}`}>{l}</button>)}</div>
            </Field>
            <Field label="업체명 (방문객에게 보이는 이름)"><Input value={f.name} onChange={e => setF({ ...f, name: e.target.value })} required maxLength={60} placeholder="예: 소이캔들 공방 윤" /></Field>
            <Field label="한 줄 소개"><Input value={f.description} onChange={e => setF({ ...f, description: e.target.value })} maxLength={120} placeholder="예: 수제 소이캔들 · 선물 포장 가능 · 카드 결제 가능" /></Field>
            <Field label="대표 메뉴·상품 (한 줄에 하나, 가격은 선택)" hint="예: 캔들 12,000원"><textarea value={f.menu} onChange={e => setF({ ...f, menu: e.target.value })} rows={4} className="w-full rounded-xl border border-gray-300 p-3 text-base" /></Field>
            <Field label="대표 사진 (선택)"><ImageUpload value={f.image_url} folder={`vendors/${data.slug}`} onChange={u => setF({ ...f, image_url: u })} aspect="aspect-[4/3]" /></Field>
            <Field label="연락처 (주최 측 확인용)"><Input type="tel" inputMode="tel" value={f.contact} onChange={e => setF({ ...f, contact: fmtPhone(e.target.value) })} required placeholder="010-0000-0000" /></Field>
            {err && <Alert kind="error">{err}</Alert>}
            <Button type="submit" loading={busy}>등록하기</Button>
          </form>
        )}
      </Card>
      <p className="mt-4 text-center text-xs text-gray-400">FLIT 축제 앱 · 플릿</p>
    </Page>
  )
}
