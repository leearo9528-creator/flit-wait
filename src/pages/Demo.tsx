import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Spinner, Alert } from '../components/ui'

/** /demo — 샘플 행사(겨울 축제 한 벌)를 깐 뒤 손님 홈으로 보낸다 (?to=admin 이면 관리자). ?reset=1 이면 데이터를 새로 깐다.
 *  데모 플래그는 lib/demoBoot 가 이 화면이 뜨기 전에 이미 켰다 — 그래서 새로 로드하지 않고 화면 전환만 한다. */
export default function Demo() {
  const nav = useNavigate()
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => {
    (async () => {
      try {
        const dest = new URLSearchParams(location.search).get('to') === 'admin' ? '/admin' : '/e/demo'
        if ((window as any).__demoSeeding) return; (window as any).__demoSeeding = true   // StrictMode 이중 실행 방지
        const { supabase, DEMO } = await import('../lib/supabase')
        if (!DEMO) throw new Error('이 브라우저에서는 데모를 켤 수 없어요. 개인정보 보호 모드를 끄고 다시 열어 주세요.')
        const { data: ex } = await supabase.from('events').select('id').eq('slug', 'demo')
        if (!ex?.length) {
          const { seedDemoEvent } = await import('../lib/demoSeed')
          const { data: id, error } = await supabase.rpc('create_my_event', { p_name: '플릿 윈터 페스티벌 (데모)', p_slug: 'demo', p_starts_at: new Date().toISOString(), p_ends_at: new Date(Date.now() + 86400_000).toISOString() })
          if (error) throw error
          await seedDemoEvent(id)
        }
        nav(dest, { replace: true })
      } catch (e: any) { setErr(e.message ?? String(e)) }
    })()
  }, []) // eslint-disable-line
  return <div className="p-6">{err ? <Alert kind="error">{err}</Alert> : <><Spinner /><p className="mt-3 text-center text-sm text-gray-500">데모 준비 중…</p></>}</div>
}
