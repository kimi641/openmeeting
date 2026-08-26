import { useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { api, type User } from '../lib/api'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { PageHeader } from '../components/Layout'

interface HealthInfo {
  ok: boolean
  version: string
}

export function SettingsPage() {
  const { user } = useOutletContext<{ user: User }>()
  const [health, setHealth] = useState<HealthInfo | null>(null)

  useEffect(() => {
    api.get<HealthInfo>('/health').then(setHealth).catch(() => {})
  }, [])

  return (
    <div>
      <PageHeader title="系统设置" />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>当前账号</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label="用户名" value={user.username} />
            <Row label="角色" value={user.role === 'admin' ? '管理员' : '成员'} />
            <Row label="认证方式" value="本地账号密码" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>系统信息</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label="服务状态" value={health ? '运行中' : '未知'} />
            <Row label="版本" value={health?.version ?? '-'} />
            <Row label="数据库" value="SQLite（本地内嵌）" />
            <Row label="数据目录" value="本地 data/ 目录，备份即拷贝" />
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>关于</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-gray-600">
            本地部署会议排程系统：数据不出内网、零外部依赖。支持会议设计（日历化场次编排，以场地为列）、场地与人员冲突检测（仅警告不阻断）、场景模板与通讯录管理。
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-gray-50 py-2 last:border-0">
      <span className="text-gray-400">{label}</span>
      <span className="text-gray-800">{value}</span>
    </div>
  )
}
