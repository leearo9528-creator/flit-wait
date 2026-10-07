import React from 'react'
import ReactDOM from 'react-dom/client'
import { createBrowserRouter, RouterProvider, Navigate } from 'react-router-dom'
import './index.css'
import QueueJoin from './pages/customer/QueueJoin'
import Reserve from './pages/customer/Reserve'
import MyTicket from './pages/customer/MyTicket'
import StaffLogin from './pages/staff/StaffLogin'
import StaffBoardPage from './pages/staff/StaffBoard'
import AdminLayout from './pages/admin/AdminLayout'
import AdminEvents from './pages/admin/AdminEvents'
import AdminEvent from './pages/admin/AdminEvent'
import AdminBooth from './pages/admin/AdminBooth'
import Home from './pages/Home'
import EventHome from './pages/customer/EventHome'

const router = createBrowserRouter([
  { path: '/', element: <Home /> },
  { path: '/e/:slug', element: <EventHome /> },
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
    <RouterProvider router={router} />
  </React.StrictMode>,
)
