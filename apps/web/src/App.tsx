import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import { Layout } from './components/Layout'
import { LoginPage } from './pages/Login'
import { DashboardPage } from './pages/Dashboard'
import { MeetingsPage } from './pages/Meetings'
import { MeetingDetailPage } from './pages/MeetingDetail'
import { SettingsPage } from './pages/Settings'
import { PrintSchedulePage } from './pages/PrintSchedule'

const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  // 独立打印页（无侧栏布局，浏览器打印 → 另存为 PDF）
  { path: '/print/schedule/:id', element: <PrintSchedulePage /> },
  {
    path: '/',
    element: <Layout />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: 'meetings', element: <MeetingsPage /> },
      { path: 'meetings/:id', element: <MeetingDetailPage /> },
      { path: 'settings', element: <SettingsPage /> },
    ],
  },
])

export default function App() {
  return <RouterProvider router={router} />
}
