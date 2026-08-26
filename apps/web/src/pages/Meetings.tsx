import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api, type ListResult, type Meeting, type Template } from '../lib/api'
import { Button } from '../components/ui/button'
import { Badge, Card, CardContent } from '../components/ui/card'
import { Dialog, DialogFooter } from '../components/ui/dialog'
import { Field, Input, Select, Textarea } from '../components/ui/form'
import { PageHeader } from '../components/Layout'
import { MEETING_STATUS } from '../lib/utils'

const STATUS_OPTIONS = [
  { value: '', label: '全部状态' },
  { value: 'draft', label: '草稿' },
  { value: 'published', label: '已发布' },
  { value: 'ongoing', label: '进行中' },
  { value: 'finished', label: '已结束' },
]

const PAGE_SIZE = 10

export function MeetingsPage() {
  const navigate = useNavigate()
  const [meetings, setMeetings] = useState<Meeting[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState('')
  const [keyword, setKeyword] = useState('')
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const q = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) })
      if (status) q.set('status', status)
      if (keyword.trim()) q.set('keyword', keyword.trim())
      const r = await api.get<ListResult<Meeting>>(`/meetings?${q}`)
      setMeetings(r.data)
      setTotal(r.total)
    } finally {
      setLoading(false)
    }
  }, [page, status, keyword])

  useEffect(() => {
    void load()
  }, [load])

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  async function duplicate(m: Meeting) {
    await api.post(`/meetings/${m.id}/duplicate`)
    void load()
  }

  async function remove(m: Meeting) {
    if (!window.confirm(`确定删除会议「${m.name}」？其下场次将一并删除。`)) return
    await api.delete(`/meetings/${m.id}`)
    void load()
  }

  return (
    <div>
      <PageHeader
        title="会议"
        actions={<Button onClick={() => setShowCreate(true)}>新建会议</Button>}
      />

      <div className="mb-4 flex items-center gap-2">
        <Input
          className="w-64"
          placeholder="搜索会议名称 / 场地…"
          value={keyword}
          onChange={(e) => {
            setKeyword(e.target.value)
            setPage(1)
          }}
        />
        <Select
          className="w-32"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value)
            setPage(1)
          }}
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      </div>

      <Card>
        <CardContent className="pt-2">
          {loading ? (
            <div className="py-10 text-center text-sm text-gray-400">加载中…</div>
          ) : meetings.length === 0 ? (
            <div className="py-10 text-center text-sm text-gray-400">暂无会议</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-xs text-gray-400">
                  <th className="py-2.5 font-normal">会议名称</th>
                  <th className="py-2.5 font-normal">日期</th>
                  <th className="py-2.5 font-normal">场地</th>
                  <th className="py-2.5 font-normal">场次</th>
                  <th className="py-2.5 font-normal">状态</th>
                  <th className="py-2.5 text-right font-normal">操作</th>
                </tr>
              </thead>
              <tbody>
                {meetings.map((m) => (
                  <tr key={m.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50">
                    <td className="py-3">
                      <Link to={`/meetings/${m.id}`} className="font-medium text-gray-900 hover:text-blue-700">
                        {m.name}
                      </Link>
                    </td>
                    <td className="py-3 text-gray-600">
                      {m.startDate === m.endDate ? m.startDate : `${m.startDate} ~ ${m.endDate}`}
                    </td>
                    <td className="py-3 text-gray-600">{m.location ?? '-'}</td>
                    <td className="py-3 text-gray-600">{m.stats ? String(m.stats.sessions) : '-'}</td>
                    <td className="py-3">
                      <Badge className={MEETING_STATUS[m.status]?.className}>
                        {MEETING_STATUS[m.status]?.label}
                      </Badge>
                    </td>
                    <td className="py-3 text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => navigate(`/meetings/${m.id}`)}>
                          详情
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => void duplicate(m)}>
                          复制
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-red-600 hover:bg-red-50 hover:text-red-700"
                          onClick={() => void remove(m)}
                        >
                          删除
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {totalPages > 1 && (
            <div className="mt-3 flex items-center justify-between text-sm text-gray-500">
              <span>
                共 {total} 条 · 第 {page}/{totalPages} 页
              </span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                  上一页
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  下一页
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <CreateMeetingDialog
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={(id) => navigate(`/meetings/${id}`)}
      />
    </div>
  )
}

function CreateMeetingDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean
  onClose: () => void
  onCreated: (id: string) => void
}) {
  const [name, setName] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [location, setLocation] = useState('')
  const [description, setDescription] = useState('')
  const [templateId, setTemplateId] = useState('')
  const [templates, setTemplates] = useState<Template[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (open) {
      api
        .get<ListResult<Template>>('/templates')
        .then((r) => setTemplates(r.data))
        .catch(() => {})
    }
  }, [open])

  async function submit() {
    setError('')
    if (endDate < startDate) {
      setError('结束日期不能早于开始日期')
      return
    }
    setLoading(true)
    try {
      const m = await api.post<Meeting>('/meetings', {
        name,
        startDate,
        endDate,
        location: location || undefined,
        description: description || undefined,
        templateId: templateId || undefined,
      })
      onCreated(m.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : '创建失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog
      open={open}
      title="新建会议"
      onClose={onClose}
      footer={<DialogFooter onCancel={onClose} onConfirm={submit} loading={loading} confirmText="创建" />}
    >
      <div className="space-y-4">
        <Field label="会议名称">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="如：2026 行业闭门论坛" autoFocus />
        </Field>
        <Field label="场景模板" hint="可选，应用后自动生成日程骨架">
          <Select value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
            <option value="">不使用模板</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="开始日期">
            <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </Field>
          <Field label="结束日期">
            <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </Field>
        </div>
        <Field label="举办地点">
          <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="如：总部 3 号楼" />
        </Field>
        <Field label="会议简介">
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        {error && <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>}
      </div>
    </Dialog>
  )
}
