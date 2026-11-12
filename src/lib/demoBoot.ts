// main.tsx 의 **첫 번째 import** 여야 한다 — supabase 클라이언트(lib/supabase.ts)가 만들어지기 전에 데모 플래그를 켠다.
// 예전에는 /demo 가 플래그를 켜고 새로 로드 → 샘플을 깔고 또 새로 로드, 이렇게 앱을 세 번 띄워서 LTE 에서 10초 넘게 걸렸다 (2026-11-12).
// 여기서 먼저 켜 두면 /demo 한 번의 로드로 샘플을 깔고 화면 전환만으로 손님 홈에 간다.
import { startDemo, demoStale, leaveDemo, DEMO_KEY, DEMO_KEYS, demoOnly, setDemoOnly } from './demo'

try {
  // 옛 판 샘플이 남은 기기 — 지우고 데모를 끈다. 데모 주소(/e/demo 등)면 main.tsx 가 /demo 로 보내 새로 깐다
  if (location.pathname !== '/demo' && demoStale()) { localStorage.removeItem(`${DEMO_KEY}:db`); leaveDemo() }
  if (location.pathname === '/demo') {
    const sp = new URLSearchParams(location.search)
    let reset = sp.has('reset')
    // 행사 잠금 — /demo?ev=fair 로 받은 기기는 그 행사만 본다 (demo.ts ONLY_KEY 설명 참고). ev=all 이 푼다.
    // auto=1 은 앱이 스스로 돌려보낸 표시라 이미 잠긴 기기의 잠금을 바꾸지 않는다. 잠금이 바뀌면 받은 행사만 남게 샘플을 새로 깐다.
    // 가짜 서버는 만들어질 때 샘플을 읽어 두므로, 지우는 일은 여기(클라이언트가 만들어지기 전)서 해야 한다
    const asked = sp.get('ev'), locked = demoOnly()
    if (asked === 'all') setDemoOnly(null)
    else if (asked && DEMO_KEYS.includes(asked) && !(sp.has('auto') && locked) && asked !== locked) { setDemoOnly(asked); reset = true }
    startDemo(reset)
  }
} catch { /* localStorage 를 못 쓰는 브라우저 — Demo 화면이 오류를 보여 준다 */ }
