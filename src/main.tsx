import './lib/demoBoot'   // ⚠️ 맨 위 유지 — supabase 클라이언트보다 먼저 데모 플래그를 켠다
import React, { lazy, Suspense } from 'react'
import ReactDOM from 'react-dom/client'
import { createBrowserRouter, RouterProvider, Navigate } from 'react-router-dom'
import './index.css'
import { isDemo, demoKeyOf, demoOnly, wantPcFrame, pcFrameUrl } from './lib/demo'
import QueueJoin from './pages/customer/QueueJoin'
import Reserve from './pages/customer/Reserve'
import MyTicket from './pages/customer/MyTicket'
import Home from './pages/Home'
import NowHome from './pages/customer/NowHome'
import Browse from './pages/customer/Browse'
import ParkHome from './pages/customer/ParkHome'
import PlaceDetail from './pages/customer/PlaceDetail'
import MyTickets from './pages/customer/MyTickets'
import EventSchedule from './pages/customer/EventSchedule'
import StampTour from './pages/customer/StampTour'
import LuckyDraw from './pages/customer/LuckyDraw'
import Survey from './pages/customer/Survey'
import VendorSignup from './pages/customer/VendorSignup'
import Board from './pages/customer/Board'
import OrderCheckout from './pages/customer/OrderCheckout'
import OrderStatus from './pages/customer/OrderStatus'
import VendorOrders from './pages/vendor/VendorOrders'
import HostBoard from './pages/host/HostBoard'
import { Spinner, Building } from './components/ui'
// 스태프·현황판은 그 주소로 바로 들어오므로 지연 로딩이 왕복만 늘린다 → 메인 번들에 포함 (합쳐서 ~16KB)
import StaffLogin from './pages/staff/StaffLogin'
import StaffBoardPage from './pages/staff/StaffBoard'
// 관리자는 손님 번들을 키우지 않도록 지연 로딩 유지. 레이아웃(로그인 화면)은 즉시, 하위 화면은 레이아웃이 뜨면 미리 받아둔다 (AdminLayout 참고)
import AdminLayout from './pages/admin/AdminLayout'
const Demo = lazy(() => import('./pages/Demo'))
const DemoFrame = lazy(() => import('./pages/DemoFrame'))
const AdminEvents = lazy(() => import('./pages/admin/AdminEvents'))
const AdminEvent = lazy(() => import('./pages/admin/AdminEvent'))
const AdminBooth = lazy(() => import('./pages/admin/AdminBooth'))


// 배포 직후, 예전 앱 셸(서비스 워커 캐시)로 떠 있는 기기가 3D 지도·데모·관리자 묶음을 받으려 하면 그 파일 이름은 이미 없어 실패한다 —
// 3D 지도가 안 열리던 원인 (2026-11-18). 새 서비스 워커를 받아 한 번만 새로 로드한다 (30초 안에 또 실패하면 반복하지 않는다)
window.addEventListener('vite:preloadError', e => {
  const KEY = 'flit:chunk-reload'
  try {
    if (Date.now() - Number(sessionStorage.getItem(KEY) || 0) < 30000) return
    sessionStorage.setItem(KEY, String(Date.now()))
  } catch { return }   // 저장소를 못 쓰면 반복을 막을 수 없으니 새로 로드하지 않는다
  e.preventDefault()
  const go = () => location.reload()
  if ('serviceWorker' in navigator) navigator.serviceWorker.getRegistration().then(r => r?.update()).catch(() => {}).finally(go)
  else go()
})

const router = createBrowserRouter([
  { path: '/', element: <Home /> },
  { path: '/demo', element: <Demo /> },
  { path: '/demo/pc', element: <DemoFrame /> },
  { path: '/e/:slug', element: <NowHome /> },
  { path: '/e/:slug/map', element: <ParkHome /> },
  { path: '/e/:slug/food', element: <Browse tab="food" /> },
  { path: '/e/:slug/p/:placeId', element: <PlaceDetail /> },
  { path: '/e/:slug/p/:placeId/order', element: <OrderCheckout /> },
  { path: '/o/:token', element: <OrderStatus /> },
  { path: '/vo/:token', element: <VendorOrders /> },
  { path: '/h/:token', element: <HostBoard /> },
  { path: '/e/:slug/booths', element: <Browse tab="booth" /> },
  { path: '/e/:slug/b/:boothSlug', element: <PlaceDetail /> },
  { path: '/e/:slug/schedule', element: <EventSchedule /> },
  { path: '/e/:slug/stamp', element: <StampTour /> },
  { path: '/e/:slug/stamp/:code', element: <StampTour /> },
  { path: '/e/:slug/draw', element: <LuckyDraw /> },
  { path: '/e/:slug/survey', element: <Survey /> },
  { path: '/v/:token', element: <VendorSignup /> },
  { path: '/e/:slug/my', element: <MyTickets /> },
  { path: '/board/:slug', element: <Board /> },
  { path: '/q/:slug', element: <QueueJoin /> },
  { path: '/r/:slug', element: <Reserve /> },
  { path: '/t/:token', element: <MyTicket /> },
  { path: '/s/:slug', element: <StaffLogin /> },
  { path: '/s/:slug/board', element: <StaffBoardPage /> },
  {
    path: '/admin', element: <AdminLayout />,
    children: [
      { index: true, element: <AdminEvents /> },
      { path: 'events/:eventId', element: <AdminEvent /> },
      { path: 'booths/:boothId', element: <AdminBooth /> },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
])

// 데모 주소(/e/demo 등)를 데모 모드가 아닌 기기에서 바로 열면 실제 DB 에는 그 행사가 없어 '행사를 찾을 수 없습니다' 가 뜬다.
// 영업 링크로 /e/demo 가 그대로 공유돼도 열리도록, 데모 주소는 /demo 로 보내 데모를 먼저 켠다. (행사 slug 'demo' 는 데모 전용 — 0042 에서 생성을 막는다. 부스는 데모가 쓰는 slug 6개만 해당)
// 데모 행사가 여러 벌이라(demo · demo-beer · demo-fair · demo-univ · demo-corp) 주소에서 어느 행사인지 읽어 그 행사로 바로 보낸다
const dm = /^\/(?:e|board)\/(demo(?:-(?:beer|fair|univ|corp))?)(?:\/|$)/.exec(location.pathname) ?? /^\/(?:q|r)\/(demo-[a-z-]+)$/.exec(location.pathname)
const dk = dm ? demoKeyOf(dm[1]) ?? 'winter' : null, only = demoOnly()
// 행사 하나로 잠긴 기기에서 다른 데모 행사 주소를 열면 받은 행사로 돌려보낸다 (auto=1 — 잠금은 그대로)
if (dk && only && dk !== only) location.replace(`/demo?ev=${only}&auto=1`)
else if (dm && !isDemo()) location.replace(`/demo?ev=${only ?? dk}&auto=1`)
// 데모 손님 홈(/e/demo…)을 PC 에서 바로 열면 폰 목업 틀로 감싼다 (공유된 링크·새로고침). 실제 행사 주소는 건드리지 않는다
else if (dm && isDemo() && /^\/e\/[^/]+\/?$/.test(location.pathname) && wantPcFrame()) location.replace(pcFrameUrl(location.pathname))
else ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Suspense fallback={location.pathname.startsWith('/demo') ? <Building /> : <Spinner />}>
      <RouterProvider router={router} />
    </Suspense>
  </React.StrictMode>,
)
