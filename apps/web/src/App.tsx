import { useState } from 'react'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import { Layout } from './components/Layout'
import { LoginPage } from './pages/Login'
import { DashboardPage } from './pages/Dashboard'
import { MeetingsPage } from './pages/Meetings'
import { MeetingDetailPage } from './pages/MeetingDetail'
import { ContactsPage } from './pages/Contacts'
import { VenuesPage } from './pages/Venues'
import { SettingsPage } from './pages/Settings'

const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  {
    path: '/',
    element: <Layout />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: 'meetings', element: <MeetingsPage /> },
      { path: 'meetings/:id', element: <MeetingDetailPage /> },
      { path: 'contacts', element: <ContactsPage /> },
      { path: 'venues', element: <VenuesPage /> },
      { path: 'settings', element: <SettingsPage /> },
    ],
  },
])

export default function App() {
  return <RouterProvider router={router} />
}
