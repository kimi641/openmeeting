import { useCallback, useEffect, useState } from 'react'
import { api, type ListResult, type Participant } from '../lib/api'
import { Button } from '../components/ui/button'
import { Card, CardContent } from '../components/ui/card'
import { Dialog, DialogFooter } from '../components/ui/dialog'
import { Field, Input, Textarea } from '../components/ui/form'
import { PageHeader } from '../components/Layout'
import { MeetingPicker } from '../components/MeetingPicker'

const PAGE_SIZE = 20

const EMPTY_FORM = { name: '', orgName: '', title: '', phone: '', email: '', note: '' }

export function ContactsPage() {
  const [meetingId, setMeetingId] = useState('')
  const [hasMeetings, setHasMeetings] = useState(true)
  const [participants, setParticipants] = useState<Participant[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [keyword, setKeyword] = useState('')
  const [loading, setLoading] = useState(true)
  const [dialog, setDialog] = useState<{ open: boolean; participant: Participant | null }>({
    open: false,
    participant: null,
  })

  const load = useCallback(async () => {
    if (!meetingId) {
      setParticipants([])
      setTotal(0)
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const q = new URLSearchParams({
        meetingId,
        page: String(page),
        pageSize: String(PAGE_SIZE),
      })
      if (keyword.trim()) q.set('keyword', keyword.trim())
      const r = await api.get<ListResult<Participant>>(`/participants?${q}`)
      setParticipants(r.data)
      setTotal(r.total)
    } finally {
      setLoading(false)
    }
  }, [meetingId, page, keyword])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    setPage(1)
  }, [meetingId])

  async function remove(p: Participant) {
    if (!window.confirm(`确定删除人员「${p.name}」？其场次嘉宾关联将一并删除。`)) return
    await api.delete(`/participants/${p.id}`)
    void load()
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div>
      <PageHeader
        title="通讯录"
        actions={
          <div className="flex items-center gap-2">
            <MeetingPicker
              value={meetingId}
              onChange={setMeetingId}
              onLoaded={(ms) => {
                setHasMeetings(ms.length > 0)
                setMeetingId(ms[0]?.id ?? '')
              }}
            />
            <Button disabled={!meetingId} onClick={() => setDialog({ open: true, participant: null })}>
              新增人员
            </Button>
          </div>
        }
      />

      <div className="mb-4">
        <Input
          className="w-64"
          placeholder="搜索姓名 / 单位 / 职务 / 电话 / 邮箱…"
          value={keyword}
          onChange={(e) => {
            setKeyword(e.target.value)
            setPage(1)
          }}
        />
      </div>

      <Card>
        <CardContent className="pt-2">
          {!hasMeetings ? (
            <div className="py-10 text-center text-sm text-gray-400">请先创建会议，再为会议维护通讯录</div>
          ) : loading ? (
            <div className="py-10 text-center text-sm text-gray-400">加载中…</div>
          ) : !meetingId ? (
            <div className="py-10 text-center text-sm text-gray-400">请选择会议</div>
          ) : participants.length === 0 ? (
            <div className="py-10 text-center text-sm text-gray-400">该会议暂无人员</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-xs text-gray-400">
                  <th className="py-2.5 font-normal">姓名</th>
                  <th className="py-2.5 font-normal">单位</th>
                  <th className="py-2.5 font-normal">职务</th>
                  <th className="py-2.5 font-normal">电话</th>
                  <th className="py-2.5 font-normal">邮箱</th>
                  <th className="py-2.5 font-normal">备注</th>
                  <th className="py-2.5 text-right font-normal">操作</th>
                </tr>
              </thead>
              <tbody>
                {participants.map((p) => (
                  <tr key={p.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50">
                    <td className="py-3 font-medium text-gray-900">{p.name}</td>
                    <td className="py-3 text-gray-600">{p.orgName ?? '-'}</td>
                    <td className="py-3 text-gray-600">{p.title ?? '-'}</td>
                    <td className="py-3 text-gray-600">{p.phone ?? '-'}</td>
                    <td className="py-3 text-gray-600">{p.email ?? '-'}</td>
                    <td className="max-w-40 truncate py-3 text-gray-400">{p.note ?? '-'}</td>
                    <td className="py-3 text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => setDialog({ open: true, participant: p })}>
                          编辑
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-red-600 hover:bg-red-50 hover:text-red-700"
                          onClick={() => void remove(p)}
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
                共 {total} 人 · 第 {page}/{totalPages} 页
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

      <ParticipantDialog
        open={dialog.open}
        participant={dialog.participant}
        meetingId={meetingId}
        onClose={() => setDialog({ open: false, participant: null })}
        onSaved={() => {
          setDialog({ open: false, participant: null })
          void load()
        }}
      />
    </div>
  )
}

function ParticipantDialog({
  open,
  participant,
  meetingId,
  onClose,
  onSaved,
}: {
  open: boolean
  participant: Participant | null
  meetingId: string
  onClose: () => void
  onSaved: () => void
}) {
  const [form, setForm] = useState(EMPTY_FORM)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (open) {
      setForm(
        participant
          ? {
              name: participant.name,
              orgName: participant.orgName ?? '',
              title: participant.title ?? '',
              phone: participant.phone ?? '',
              email: participant.email ?? '',
              note: participant.note ?? '',
            }
          : EMPTY_FORM,
      )
      setError('')
    }
  }, [open, participant])

  const set = (key: keyof typeof EMPTY_FORM) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm({ ...form, [key]: e.target.value })

  async function submit() {
    if (!form.name.trim()) {
      setError('请填写姓名')
      return
    }
    setLoading(true)
    setError('')
    try {
      const body = {
        name: form.name.trim(),
        orgName: form.orgName.trim() || undefined,
        title: form.title.trim() || undefined,
        phone: form.phone.trim() || undefined,
        email: form.email.trim() || undefined,
        note: form.note.trim() || undefined,
      }
      if (participant) {
        await api.patch(`/participants/${participant.id}`, body)
      } else {
        await api.post('/participants', { ...body, meetingId })
      }
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog
      open={open}
      title={participant ? '编辑人员' : '新增人员'}
      onClose={onClose}
      footer={<DialogFooter onCancel={onClose} onConfirm={submit} loading={loading} confirmText="保存" />}
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="姓名">
            <Input value={form.name} onChange={set('name')} autoFocus />
          </Field>
          <Field label="单位">
            <Input value={form.orgName} onChange={set('orgName')} placeholder="如：XX 协会" />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="职务">
            <Input value={form.title} onChange={set('title')} placeholder="如：总监" />
          </Field>
          <Field label="电话">
            <Input value={form.phone} onChange={set('phone')} />
          </Field>
        </div>
        <Field label="邮箱">
          <Input type="email" value={form.email} onChange={set('email')} />
        </Field>
        <Field label="备注">
          <Textarea value={form.note} onChange={set('note')} />
        </Field>
        {error && <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>}
      </div>
    </Dialog>
  )
}
