import React, { lazy, Suspense } from 'react'
import ReactDOM from 'react-dom/client'
import { createBrowserRouter, RouterProvider, Navigate } from 'react-router-dom'
import './index.css'
import QueueJoin from './pages/customer/QueueJoin'
import Reserve from './pages/customer/Reserve'
import MyTicket from './pages/customer/MyTicket'
import Home from './pages/Home'
import EventHome from './pages/customer/EventHome'
import MyTickets from './pages/customer/MyTickets'
import Board from './pages/customer/Board'
import { Spinner } from './components/ui'
// 스태프·현황판은 그 주소로 바로 들어오므로 지연 로딩이 왕복만 늘린다 → 메인 번들에 포함 (합쳐서 ~16KB)
import StaffLogin from './pages/staff/StaffLogin'
import StaffBoardPage from './pages/staff/StaffBoard'
// 관리자는 손님 번들을 키우지 않도록 지연 로딩 유지. 레이아웃(로그인 화면)은 즉시, 하위 화면은 레이아웃이 뜨면 미리 받아둔다 (AdminLayout 참고)
import AdminLayout from './pages/admin/AdminLayout'
const AdminEvents = lazy(() => import('./pages/admin/AdminEvents'))
const AdminEvent = lazy(() => import('./pages/admin/AdminEvent'))
const AdminBooth = lazy(() => import('./pages/admin/AdminBooth'))

const router = createBrowserRouter([
  { path: '/', element: <Home /> },
  { path: '/e/:slug', element: <EventHome /> },
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

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Suspense fallback={<Spinner />}>
      <RouterProvider router={router} />
    </Suspense>
  </React.StrictMode>,
)
