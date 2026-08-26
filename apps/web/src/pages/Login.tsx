import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import { Button } from '../components/ui/button'
import { Field, Input } from '../components/ui/form'

export function LoginPage() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await api.post('/auth/login', { username, password })
      navigate('/', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : '登录失败')
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
            <div className="text-xs text-gray-400">本地部署 · 数据不出内网</div>
          </div>
        </div>
        <form onSubmit={onSubmit} className="space-y-4">
          <Field label="用户名">
            <Input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="请输入用户名"
              autoFocus
              required
            />
          </Field>
          <Field label="密码">
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="请输入密码"
              required
            />
          </Field>
          {error && <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>}
          <Button type="submit" className="w-full" disabled={loading || !username || !password}>
            {loading ? '登录中…' : '登 录'}
          </Button>
        </form>
      </div>
    </div>
  )
}
