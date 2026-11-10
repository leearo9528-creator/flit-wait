import React, { lazy, Suspense } from 'react'
import ReactDOM from 'react-dom/client'
import { createBrowserRouter, RouterProvider, Navigate } from 'react-router-dom'
import './index.css'
import { isDemo } from './lib/demo'
import QueueJoin from './pages/customer/QueueJoin'
import Reserve from './pages/customer/Reserve'
import MyTicket from './pages/customer/MyTicket'
import Home from './pages/Home'
import EventHome from './pages/customer/EventHome'
import ParkHome from './pages/customer/ParkHome'
import PlaceDetail from './pages/customer/PlaceDetail'
import MyTickets from './pages/customer/MyTickets'
import EventMap from './pages/customer/EventMap'
import EventSchedule from './pages/customer/EventSchedule'
import StampTour from './pages/customer/StampTour'
import LuckyDraw from './pages/customer/LuckyDraw'
import Survey from './pages/customer/Survey'
import VendorSignup from './pages/customer/VendorSignup'
import Board from './pages/customer/Board'
import { Spinner } from './components/ui'
// 스태프·현황판은 그 주소로 바로 들어오므로 지연 로딩이 왕복만 늘린다 → 메인 번들에 포함 (합쳐서 ~16KB)
import StaffLogin from './pages/staff/StaffLogin'
import StaffBoardPage from './pages/staff/StaffBoard'
// 관리자는 손님 번들을 키우지 않도록 지연 로딩 유지. 레이아웃(로그인 화면)은 즉시, 하위 화면은 레이아웃이 뜨면 미리 받아둔다 (AdminLayout 참고)
import AdminLayout from './pages/admin/AdminLayout'
const Demo = lazy(() => import('./pages/Demo'))
const AdminEvents = lazy(() => import('./pages/admin/AdminEvents'))
const AdminEvent = lazy(() => import('./pages/admin/AdminEvent'))
const AdminBooth = lazy(() => import('./pages/admin/AdminBooth'))

const router = createBrowserRouter([
  { path: '/', element: <Home /> },
  { path: '/demo', element: <Demo /> },
  { path: '/e/:slug', element: <ParkHome /> },
  { path: '/e/:slug/p/:placeId', element: <PlaceDetail /> },
  { path: '/e/:slug/booths', element: <EventHome /> },
  { path: '/e/:slug/map', element: <EventMap /> },
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
const demoPath = /^\/(e|board)\/demo(\/|$)/.test(location.pathname) || /^\/(q|r)\/demo-(slope|kids|fish|sled|candle|keyring)$/.test(location.pathname)
if (demoPath && !isDemo()) location.replace('/demo')
else ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Suspense fallback={<Spinner />}>
      <RouterProvider router={router} />
    </Suspense>
  </React.StrictMode>,
)
