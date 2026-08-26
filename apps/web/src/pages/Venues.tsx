import { useCallback, useEffect, useState } from 'react'
import { api, type ListResult, type Venue } from '../lib/api'
import { Button } from '../components/ui/button'
import { Card, CardContent } from '../components/ui/card'
import { Dialog, DialogFooter } from '../components/ui/dialog'
import { Field, Input, Textarea } from '../components/ui/form'
import { PageHeader } from '../components/Layout'
import { MeetingPicker } from '../components/MeetingPicker'

const EMPTY_FORM = { name: '', capacity: '', equipment: '', note: '' }

export function VenuesPage() {
  const [meetingId, setMeetingId] = useState('')
  const [hasMeetings, setHasMeetings] = useState(true)
  const [venues, setVenues] = useState<Venue[]>([])
  const [loading, setLoading] = useState(true)
  const [dialog, setDialog] = useState<{ open: boolean; venue: Venue | null }>({ open: false, venue: null })

  const load = useCallback(async () => {
    if (!meetingId) {
      setVenues([])
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const r = await api.get<ListResult<Venue>>(`/venues?meetingId=${meetingId}`)
      setVenues(r.data)
    } finally {
      setLoading(false)
    }
  }, [meetingId])

  useEffect(() => {
    void load()
  }, [load])

  async function remove(v: Venue) {
    if (!window.confirm(`确定删除场地「${v.name}」？该会议中引用它的场次将变为未指定场地。`)) return
    await api.delete(`/venues/${v.id}`)
    void load()
  }

  return (
    <div>
      <PageHeader
        title="场地管理"
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
            <Button disabled={!meetingId} onClick={() => setDialog({ open: true, venue: null })}>
              新增场地
            </Button>
          </div>
        }
      />

      <Card>
        <CardContent className="pt-2">
          {!hasMeetings ? (
            <div className="py-10 text-center text-sm text-gray-400">请先创建会议，再为会议管理场地</div>
          ) : loading ? (
            <div className="py-10 text-center text-sm text-gray-400">加载中…</div>
          ) : !meetingId ? (
            <div className="py-10 text-center text-sm text-gray-400">请选择会议</div>
          ) : venues.length === 0 ? (
            <div className="py-10 text-center text-sm text-gray-400">
              该会议暂无场地，点击「新增场地」添加会议室/展厅（日历中的列）
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-xs text-gray-400">
                  <th className="py-2.5 font-normal">顺序</th>
                  <th className="py-2.5 font-normal">场地名称</th>
                  <th className="py-2.5 font-normal">容纳人数</th>
                  <th className="py-2.5 font-normal">设备</th>
                  <th className="py-2.5 font-normal">备注</th>
                  <th className="py-2.5 text-right font-normal">操作</th>
                </tr>
              </thead>
              <tbody>
                {venues.map((v, i) => (
                  <tr key={v.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50">
                    <td className="py-3 text-gray-400">{i + 1}</td>
                    <td className="py-3 font-medium text-gray-900">{v.name}</td>
                    <td className="py-3 text-gray-600">{v.capacity ?? '-'}</td>
                    <td className="py-3 text-gray-600">{v.equipment ?? '-'}</td>
                    <td className="max-w-60 truncate py-3 text-gray-400">{v.note ?? '-'}</td>
                    <td className="py-3 text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => setDialog({ open: true, venue: v })}>
                          编辑
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-red-600 hover:bg-red-50 hover:text-red-700"
                          onClick={() => void remove(v)}
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
        </CardContent>
      </Card>

      <VenueDialog
        open={dialog.open}
        venue={dialog.venue}
        meetingId={meetingId}
        onClose={() => setDialog({ open: false, venue: null })}
        onSaved={() => {
          setDialog({ open: false, venue: null })
          void load()
        }}
      />
    </div>
  )
}

function VenueDialog({
  open,
  venue,
  meetingId,
  onClose,
  onSaved,
}: {
  open: boolean
  venue: Venue | null
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
        venue
          ? {
              name: venue.name,
              capacity: venue.capacity ? String(venue.capacity) : '',
              equipment: venue.equipment ?? '',
              note: venue.note ?? '',
            }
          : EMPTY_FORM,
      )
      setError('')
    }
  }, [open, venue])

  async function submit() {
    if (!form.name.trim()) {
      setError('请填写场地名称')
      return
    }
    const capacity = form.capacity.trim() ? Number(form.capacity) : undefined
    if (capacity !== undefined && (!Number.isInteger(capacity) || capacity <= 0)) {
      setError('容纳人数应为正整数')
      return
    }
    setLoading(true)
    setError('')
    try {
      const body = {
        name: form.name.trim(),
        capacity,
        equipment: form.equipment.trim() || undefined,
        note: form.note.trim() || undefined,
      }
      if (venue) {
        await api.patch(`/venues/${venue.id}`, body)
      } else {
        await api.post('/venues', { ...body, meetingId })
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
      title={venue ? '编辑场地' : '新增场地'}
      onClose={onClose}
      footer={<DialogFooter onCancel={onClose} onConfirm={submit} loading={loading} confirmText="保存" />}
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="场地名称">
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus />
          </Field>
          <Field label="容纳人数">
            <Input
              type="number"
              min={1}
              value={form.capacity}
              onChange={(e) => setForm({ ...form, capacity: e.target.value })}
              placeholder="如：120"
            />
          </Field>
        </div>
        <Field label="设备" hint="如：投影、麦克风、视频会议">
          <Input value={form.equipment} onChange={(e) => setForm({ ...form, equipment: e.target.value })} />
        </Field>
        <Field label="备注">
          <Textarea value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
        </Field>
        {error && <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>}
      </div>
    </Dialog>
  )
}
