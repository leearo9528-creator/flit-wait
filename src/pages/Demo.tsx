import { useEffect, useState } from 'react'
import { startDemo } from '../lib/demo'
import { Spinner, Alert } from '../components/ui'

/** /demo — 데모 모드 켜고 샘플 행사(야간 마켓)를 깐 뒤 관리자로 보낸다. ?reset=1 이면 데이터를 새로 깐다 */
export default function Demo() {
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => {
    (async () => {
      try {
        const sp = new URLSearchParams(location.search)
        const reset = sp.has('reset'), seed = sp.has('seed')
        if (!seed) {
          // 1단계: 플래그만 켜고 새로 로드 — supabase 클라이언트는 모듈 로드 시점에 만들어져서, 플래그가 켜진 채로 다시 떠야 가짜 fetch 를 쓴다
          const already = localStorage.getItem('flit:demo') === '1' && !!localStorage.getItem('flit:demo:db') && !reset
          await startDemo(reset)
          location.replace(already ? '/admin' : `/demo?seed=1${reset ? '&reset=1' : ''}`); return
        }
        {
          const { supabase } = await import('../lib/supabase')
          if ((window as any).__demoSeeding) return; (window as any).__demoSeeding = true   // StrictMode 이중 실행 방지
          const { data: ex } = await supabase.from('events').select('id').eq('slug', 'demo')
          if (ex?.length) { location.replace('/admin'); return }
          const { applyTemplate } = await import('../lib/templates')
          const { data: id, error } = await supabase.rpc('create_my_event', { p_name: '성남 윈터 나이트마켓 (데모)', p_slug: 'demo', p_starts_at: new Date(Date.now() + 86400_000 * 10).toISOString().slice(0, 10) + 'T08:00:00.000Z', p_ends_at: new Date(Date.now() + 86400_000 * 11).toISOString().slice(0, 10) + 'T13:00:00.000Z' })
          if (error) throw error
          await applyTemplate('night-market', id, new Date(Date.now() + 86400_000 * 10).toISOString().slice(0, 10) + 'T08:00:00.000Z')
          await supabase.from('events').update({ status: 'open', contact_text: '운영본부 010-2244-3585' }).eq('id', id)
          await supabase.from('places').update({ crowd: 'high' }).eq('event_id', id).eq('kind', 'food')
        }
        location.replace('/admin')
      } catch (e: any) { setErr(e.message ?? String(e)) }
    })()
  }, [])
  return <div className="p-6">{err ? <Alert kind="error">{err}</Alert> : <><Spinner /><p className="mt-3 text-center text-sm text-gray-500">데모 행사를 까는 중…</p></>}</div>
}
