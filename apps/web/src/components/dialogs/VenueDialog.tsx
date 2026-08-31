import { useEffect, useState } from 'react'
import { api, type Venue } from '../../lib/api'
import { Dialog, DialogFooter } from '../ui/dialog'
import { Field, Input, Textarea } from '../ui/form'

const EMPTY_FORM = { name: '', capacity: '', equipment: '', note: '' }

export function VenueDialog({
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
