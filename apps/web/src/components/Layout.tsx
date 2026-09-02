import { useEffect, useState, type ReactNode } from 'react'
import { Navigate, NavLink, Outlet, useNavigate } from 'react-router-dom'
import { api, type User } from '../lib/api'
import { cn } from '../lib/utils'
import { RightPanel } from './RightPanel'

// n8n 风格：左侧窄图标栏，仅保留仪表盘 / 会议 / 用户管理（admin）/ 设置
const NAV = [
  { to: '/', label: '仪表盘', icon: 'M3 10.5 10 4l7 6.5V20h-4v-5h-6v5H3z' },
  { to: '/meetings', label: '会议', icon: 'M4 5h16v13H4zM8 3v4M16 3v4M4 9h16' },
  { to: '/admin/users', label: '用户管理', adminOnly: true, icon: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75' },
  { to: '/settings', label: '设置', icon: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM4 12l-1.5-2 1-2.5L6 7l2-2 .5-3L11 3l2.5-1L16 4l3 .5.5 3 2 2-1 2.5 1 2.5-2 2-.5 3-3 .5-2 2-2.5-1-2.5 1-2-2-3-.5-1-2.5z' },
]

export function Layout() {
  const [user, setUser] = useState<User | null>(null)
  const [checked, setChecked] = useState(false)
  const [panelCollapsed, setPanelCollapsed] = useState(false)
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
      {/* 左侧窄图标栏（n8n 风格） */}
      <aside className="flex w-14 shrink-0 flex-col items-center border-r border-gray-200 bg-gray-900">
        <div className="flex h-14 items-center justify-center">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-700 text-sm font-bold text-white">
            会
          </div>
        </div>
        <nav className="flex-1 space-y-1 py-2">
          {NAV.filter((n) => !n.adminOnly || user?.role === 'admin').map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.to === '/'}
              title={n.label}
              className={({ isActive }) =>
                cn(
                  'flex h-10 w-10 items-center justify-center rounded-lg transition-colors',
                  isActive
                    ? 'bg-blue-600/20 text-blue-400'
                    : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200',
                )
              }
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="shrink-0">
                <path d={n.icon} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </NavLink>
          ))}
        </nav>
        <div className="py-3">
          <button
            onClick={logout}
            title="退出登录"
            className="flex h-10 w-10 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-800 hover:text-red-400"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      </aside>

      {/* 中间主内容区 */}
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-5xl px-6 py-6">
          <Outlet context={{ user }} />
        </div>
      </main>

      {/* 右侧面板：日历 / 人员 / 场地 */}
      <RightPanel collapsed={panelCollapsed} onToggle={() => setPanelCollapsed((v) => !v)} />
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
