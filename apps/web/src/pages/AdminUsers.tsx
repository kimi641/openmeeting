import { useCallback, useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { api, type AdminUser, type Settings, type User } from '../lib/api'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Field, Input } from '../components/ui/form'
import { PageHeader } from '../components/Layout'

const ROLE_LABEL = { admin: '管理员', member: '成员' } as const

export function AdminUsersPage() {
  const { user: me } = useOutletContext<{ user: User }>()
  const [users, setUsers] = useState<AdminUser[]>([])
  const [settings, setSettings] = useState<Settings | null>(null)
  const [limitInput, setLimitInput] = useState('100')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [busyId, setBusyId] = useState('')

  const load = useCallback(async () => {
    const [usersRes, settingsRes] = await Promise.all([
      api.get<{ data: AdminUser[] }>('/users'),
      api.get<Settings>('/settings'),
    ])
    setUsers(usersRes.data)
    setSettings(settingsRes)
    setLimitInput(String(settingsRes.registrationLimit))
  }, [])

  useEffect(() => {
    load().catch((err) => setError(err instanceof Error ? err.message : '加载失败'))
  }, [load])

  async function saveLimit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    const n = Number(limitInput)
    if (!Number.isInteger(n) || n < 1 || n > 100000) {
      setError('注册上限应为 1 ~ 100000 的整数')
      return
    }
    setSaving(true)
    try {
      await api.patch<Settings>('/settings', { registrationLimit: n })
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  async function toggleDisabled(u: AdminUser) {
    setError('')
    setBusyId(u.id)
    try {
      await api.patch('/users/' + u.id, { disabled: !u.disabled })
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : '操作失败')
    } finally {
      setBusyId('')
    }
  }

  async function resetPassword(u: AdminUser) {
    const password = window.prompt(`为「${u.username}」设置新密码（至少 6 位）：`)
    if (!password) return
    if (password.length < 6) {
      setError('密码至少 6 位')
      return
    }
    setError('')
    setBusyId(u.id)
    try {
      await api.patch('/users/' + u.id, { password })
      window.alert('密码已重置，该用户现有登录已失效')
    } catch (err) {
      setError(err instanceof Error ? err.message : '操作失败')
    } finally {
      setBusyId('')
    }
  }

  async function removeUser(u: AdminUser) {
    const confirmed = window.confirm(
      `确定删除用户「${u.username}」吗？\n\n该用户名下创建的 ${u.meetingCount} 个会议及其全部日程数据将一并删除，且不可恢复。`,
    )
    if (!confirmed) return
    setError('')
    setBusyId(u.id)
    try {
      await api.delete('/users/' + u.id)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除失败')
    } finally {
      setBusyId('')
    }
  }

  return (
    <div>
      <PageHeader title="用户管理" />

      {error && <div className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>注册用户数上限</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={saveLimit} className="space-y-3">
              <div className="text-sm text-gray-500">
                当前用户数：<span className="font-medium text-gray-800">{settings?.userCount ?? '-'}</span>
                <span className="mx-1">/</span>
                上限
              </div>
              <Field label="上限（1 ~ 100000）">
                <Input
                  type="number"
                  min={1}
                  max={100000}
                  value={limitInput}
                  onChange={(e) => setLimitInput(e.target.value)}
                  required
                />
              </Field>
              <p className="text-xs text-gray-400">
                注册用户数达到上限后，新用户注册将被拒绝；删除用户可释放名额。
              </p>
              <Button type="submit" disabled={saving} className="w-full">
                {saving ? '保存中…' : '保存上限'}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>用户列表（{users.length}）</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-xs text-gray-400">
                  <th className="px-4 py-2.5 font-medium">用户名</th>
                  <th className="px-4 py-2.5 font-medium">角色</th>
                  <th className="px-4 py-2.5 font-medium">注册时间</th>
                  <th className="px-4 py-2.5 font-medium">会议数</th>
                  <th className="px-4 py-2.5 font-medium">状态</th>
                  <th className="px-4 py-2.5 text-right font-medium">操作</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-b border-gray-50 last:border-0">
                    <td className="px-4 py-2.5">
                      <span className="font-medium text-gray-800">{u.username}</span>
                      {u.id === me.id && <span className="ml-1.5 text-xs text-blue-600">（我）</span>}
                    </td>
                    <td className="px-4 py-2.5 text-gray-600">{ROLE_LABEL[u.role]}</td>
                    <td className="px-4 py-2.5 text-gray-500">{u.createdAt.slice(0, 16).replace('T', ' ')}</td>
                    <td className="px-4 py-2.5 text-gray-600">{u.meetingCount}</td>
                    <td className="px-4 py-2.5">
                      {u.disabled ? (
                        <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs text-red-600">已禁用</span>
                      ) : (
                        <span className="rounded-full bg-green-50 px-2 py-0.5 text-xs text-green-600">正常</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex justify-end gap-1.5">
                        {u.id !== me.id && (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={busyId === u.id}
                              onClick={() => toggleDisabled(u)}
                            >
                              {u.disabled ? '启用' : '禁用'}
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={busyId === u.id}
                              onClick={() => resetPassword(u)}
                            >
                              重置密码
                            </Button>
                            <Button
                              variant="danger"
                              size="sm"
                              disabled={busyId === u.id}
                              onClick={() => removeUser(u)}
                            >
                              删除
                            </Button>
                          </>
                        )}
                        {u.id === me.id && (
                          <span className="text-xs text-gray-400">当前登录账号不可操作</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
