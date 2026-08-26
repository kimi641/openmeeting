import { useEffect, useState, type ReactNode } from 'react'
import { Navigate, NavLink, Outlet, useNavigate } from 'react-router-dom'
import { api, type User } from '../lib/api'
import { cn } from '../lib/utils'
import { Button } from './ui/button'

const NAV = [
  { to: '/', label: '仪表盘', icon: 'M3 10.5 10 4l7 6.5V20h-4v-5h-6v5H3z' },
  { to: '/meetings', label: '会议', icon: 'M4 5h16v13H4zM8 3v4M16 3v4M4 9h16' },
  { to: '/contacts', label: '通讯录', icon: 'M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM2 20c0-3 2.7-5 6-5s6 2 6 5M16 4a3 3 0 0 1 0 6M17 15c2.5.4 4 2.2 4 5' },
  { to: '/venues', label: '场地', icon: 'M3 20V9l5-4 5 4v11M13 20V11l4-3 4 3v9M6 20v-3h2v3M16 20v-3h2v3' },
  { to: '/settings', label: '系统设置', icon: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM4 12l-1.5-2 1-2.5L6 7l2-2 .5-3L11 3l2.5-1L16 4l3 .5.5 3 2 2-1 2.5 1 2.5-2 2-.5 3-3 .5-2 2-2.5-1-2.5 1-2-2-3-.5-1-2.5z' },
]

export function Layout() {
  const [user, setUser] = useState<User | null>(null)
  const [checked, setChecked] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    api
      .get<User>('/auth/me')
      .then((u) => setUser(u))
      .catch(() => navigate('/login', { replace: true }))
      .finally(() => setChecked(true))
  }, [navigate])

  async function logout() {
    await api.post('/auth/logout').catch(() => {})
    navigate('/login', { replace: true })
  }

  if (!checked) {
    return <div className="flex h-full items-center justify-center text-gray-400">加载中…</div>
  }
  if (!user) return <Navigate to="/login" replace />

  return (
    <div className="flex h-full">
      <aside className="flex w-52 shrink-0 flex-col border-r border-gray-200 bg-white">
        <div className="flex h-14 items-center gap-2 border-b border-gray-100 px-5">
          <div className="flex h-7 w-7 items-center justify-center rounded bg-blue-700 text-xs font-bold text-white">
            会
          </div>
          <span className="font-semibold">会议排程系统</span>
        </div>
        <nav className="flex-1 space-y-0.5 p-2">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.to === '/'}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-2.5 rounded-md px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 hover:text-gray-900',
                  isActive && 'bg-blue-50 font-medium text-blue-700',
                )
              }
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="shrink-0">
                <path d={n.icon} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-gray-100 p-3">
          <div className="mb-2 px-1 text-xs text-gray-500">
            {user.username}
            <span className="ml-1.5 rounded bg-gray-100 px-1.5 py-0.5">
              {user.role === 'admin' ? '管理员' : '成员'}
            </span>
          </div>
          <Button variant="outline" size="sm" className="w-full" onClick={logout}>
            退出登录
          </Button>
        </div>
      </aside>
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-6xl px-6 py-6">
          <Outlet context={{ user }} />
        </div>
      </main>
    </div>
  )
}

export function PageHeader({ title, actions }: { title: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex items-center justify-between">
      <h1 className="text-xl font-semibold">{title}</h1>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  )
}
