import React, { lazy, Suspense } from 'react'
import ReactDOM from 'react-dom/client'
import { createBrowserRouter, RouterProvider, Navigate } from 'react-router-dom'
import './index.css'
import QueueJoin from './pages/customer/QueueJoin'
import Reserve from './pages/customer/Reserve'
import MyTicket from './pages/customer/MyTicket'
const StaffLogin = lazy(() => import('./pages/staff/StaffLogin'))
const StaffBoardPage = lazy(() => import('./pages/staff/StaffBoard'))
const AdminLayout = lazy(() => import('./pages/admin/AdminLayout'))
const AdminEvents = lazy(() => import('./pages/admin/AdminEvents'))
const AdminEvent = lazy(() => import('./pages/admin/AdminEvent'))
const AdminBooth = lazy(() => import('./pages/admin/AdminBooth'))
import Home from './pages/Home'
import EventHome from './pages/customer/EventHome'
const Board = lazy(() => import('./pages/customer/Board'))
import MyTickets from './pages/customer/MyTickets'

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
    <Suspense fallback={null}>
      <RouterProvider router={router} />
    </Suspense>
  </React.StrictMode>,
)
