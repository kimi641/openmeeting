import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import { Button } from '../components/ui/button'
import { Field, Input } from '../components/ui/form'

type Mode = 'login' | 'register'

export function LoginPage() {
  const [mode, setMode] = useState<Mode>('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  function switchMode(next: Mode) {
    setMode(next)
    setError('')
    setPassword('')
    setConfirm('')
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (mode === 'register') {
      if (password.length < 6) {
        setError('密码至少 6 位')
        return
      }
      if (password !== confirm) {
        setError('两次输入的密码不一致')
        return
      }
    }

    setLoading(true)
    try {
      if (mode === 'login') {
        await api.post('/auth/login', { username, password })
      } else {
        await api.post('/auth/register', { username, password })
      }
      navigate('/', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : mode === 'login' ? '登录失败' : '注册失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex h-full items-center justify-center bg-gray-100">
      <div className="w-96 rounded-lg border border-gray-200 bg-white p-8 shadow-sm">
        <div className="mb-6 flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-700 font-bold text-white">
            会
          </div>
          <div>
            <div className="text-lg font-semibold">会议排程系统</div>
            <div className="text-xs text-gray-400">
              {mode === 'login' ? '登录后管理你的会议日程' : '注册账号，开始排程（注册即用）'}
            </div>
          </div>
        </div>

        <div className="mb-5 grid grid-cols-2 rounded-lg bg-gray-100 p-1 text-sm">
          <button
            type="button"
            onClick={() => switchMode('login')}
            className={
              mode === 'login'
                ? 'rounded-md bg-white py-1.5 font-medium text-blue-700 shadow-sm'
                : 'py-1.5 text-gray-500'
            }
          >
            登录
          </button>
          <button
            type="button"
            onClick={() => switchMode('register')}
            className={
              mode === 'register'
                ? 'rounded-md bg-white py-1.5 font-medium text-blue-700 shadow-sm'
                : 'py-1.5 text-gray-500'
            }
          >
            注册
          </button>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <Field label="用户名">
            <Input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder={mode === 'register' ? '2-32 位，支持中文/字母/数字/_/-' : '请输入用户名'}
              autoFocus
              required
            />
          </Field>
          <Field label="密码">
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={mode === 'register' ? '至少 6 位' : '请输入密码'}
              required
            />
          </Field>
          {mode === 'register' && (
            <Field label="确认密码">
              <Input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="再次输入密码"
                required
              />
            </Field>
          )}
          {error && <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>}
          <Button
            type="submit"
            className="w-full"
            disabled={loading || !username || !password || (mode === 'register' && !confirm)}
          >
            {loading ? (mode === 'login' ? '登录中…' : '注册中…') : mode === 'login' ? '登 录' : '注 册'}
          </Button>
        </form>
      </div>
    </div>
  )
}
