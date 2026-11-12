// main.tsx 의 **첫 번째 import** 여야 한다 — supabase 클라이언트(lib/supabase.ts)가 만들어지기 전에 데모 플래그를 켠다.
// 예전에는 /demo 가 플래그를 켜고 새로 로드 → 샘플을 깔고 또 새로 로드, 이렇게 앱을 세 번 띄워서 LTE 에서 10초 넘게 걸렸다 (2026-11-12).
// 여기서 먼저 켜 두면 /demo 한 번의 로드로 샘플을 깔고 화면 전환만으로 손님 홈에 간다.
import { startDemo, demoStale, leaveDemo, DEMO_KEY } from './demo'

try {
  // 옛 판 샘플이 남은 기기 — 지우고 데모를 끈다. 데모 주소(/e/demo 등)면 main.tsx 가 /demo 로 보내 새로 깐다
  if (location.pathname !== '/demo' && demoStale()) { localStorage.removeItem(`${DEMO_KEY}:db`); leaveDemo() }
  if (location.pathname === '/demo') startDemo(new URLSearchParams(location.search).has('reset'))
} catch { /* localStorage 를 못 쓰는 브라우저 — Demo 화면이 오류를 보여 준다 */ }
