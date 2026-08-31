import { useEffect, useState } from 'react'
import { api, type Participant } from '../../lib/api'
import { Dialog, DialogFooter } from '../ui/dialog'
import { Field, Input, Textarea } from '../ui/form'

const EMPTY_FORM = { name: '', orgName: '', title: '', phone: '', email: '', note: '' }

export function ParticipantDialog({
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
