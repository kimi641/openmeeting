import { useEffect, useState } from 'react'
import { api, type Organization } from '../../lib/api'
import { Dialog, DialogFooter } from '../ui/dialog'
import { Field, Input, Textarea } from '../ui/form'

const EMPTY_FORM = { name: '', contact: '', phone: '', note: '' }

export function OrganizationDialog({
  open,
  organization,
  meetingId,
  onClose,
  onSaved,
}: {
  open: boolean
  organization: Organization | null
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
        organization
          ? {
              name: organization.name,
              contact: organization.contact ?? '',
              phone: organization.phone ?? '',
              note: organization.note ?? '',
            }
          : EMPTY_FORM,
      )
      setError('')
    }
  }, [open, organization])

  async function submit() {
    if (!form.name.trim()) {
      setError('请填写组织名称')
      return
    }
    setLoading(true)
    setError('')
    try {
      const body = {
        name: form.name.trim(),
        contact: form.contact.trim() || undefined,
        phone: form.phone.trim() || undefined,
        note: form.note.trim() || undefined,
      }
      if (organization) {
        await api.patch(`/organizations/${organization.id}`, body)
      } else {
        await api.post('/organizations', { ...body, meetingId })
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
      title={organization ? '编辑组织' : '新增组织'}
      onClose={onClose}
      footer={<DialogFooter onCancel={onClose} onConfirm={submit} loading={loading} confirmText="保存" />}
    >
      <div className="space-y-4">
        <Field label="名称">
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="联系人">
            <Input value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })} />
          </Field>
          <Field label="联系电话">
            <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </Field>
        </div>
        <Field label="备注">
          <Textarea value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
        </Field>
        {error && <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>}
      </div>
    </Dialog>
  )
}
