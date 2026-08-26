import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, type Meeting, type ListResult } from '../lib/api'
import { Card, CardContent, CardHeader, CardTitle, Badge } from '../components/ui/card'
import { PageHeader } from '../components/Layout'
import { MEETING_STATUS } from '../lib/utils'

export function DashboardPage() {
  const [meetings, setMeetings] = useState<Meeting[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api
      .get<ListResult<Meeting>>('/meetings?pageSize=100')
      .then((r) => setMeetings(r.data))
      .finally(() => setLoading(false))
  }, [])

  const stats = {
    total: meetings.length,
    draft: meetings.filter((m) => m.status === 'draft').length,
    upcoming: meetings.filter((m) => m.status === 'published').length,
    ongoing: meetings.filter((m) => m.status === 'ongoing').length,
  }
  const recent = meetings.slice(0, 8)

  return (
    <div>
      <PageHeader title="仪表盘" />

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          { label: '会议总数', value: stats.total, className: 'text-blue-700' },
          { label: '草稿中', value: stats.draft, className: 'text-gray-700' },
          { label: '待举办', value: stats.upcoming, className: 'text-blue-600' },
          { label: '进行中', value: stats.ongoing, className: 'text-green-600' },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="pt-5">
              <div className="text-sm text-gray-500">{s.label}</div>
              <div className={`mt-1 text-3xl font-semibold ${s.className}`}>{s.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>最近会议</CardTitle>
          <Link to="/meetings" className="text-sm text-blue-700 hover:underline">
            查看全部 →
          </Link>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-8 text-center text-sm text-gray-400">加载中…</div>
          ) : recent.length === 0 ? (
            <div className="py-8 text-center text-sm text-gray-400">
              还没有会议，去
              <Link to="/meetings" className="mx-1 text-blue-700 hover:underline">
                新建一场
              </Link>
              吧
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-xs text-gray-400">
                  <th className="py-2 font-normal">会议名称</th>
                  <th className="py-2 font-normal">日期</th>
                  <th className="py-2 font-normal">场地</th>
                  <th className="py-2 font-normal">状态</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((m) => (
                  <tr key={m.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50">
                    <td className="py-2.5">
                      <Link to={`/meetings/${m.id}`} className="font-medium text-gray-900 hover:text-blue-700">
                        {m.name}
                      </Link>
                    </td>
                    <td className="py-2.5 text-gray-600">
                      {m.startDate === m.endDate ? m.startDate : `${m.startDate} ~ ${m.endDate}`}
                    </td>
                    <td className="py-2.5 text-gray-600">{m.location ?? '-'}</td>
                    <td className="py-2.5">
                      <Badge className={MEETING_STATUS[m.status]?.className}>{MEETING_STATUS[m.status]?.label}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
