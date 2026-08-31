import { useEffect, useState } from 'react'
import { api, type SessionType } from '../../lib/api'
import { Dialog, DialogFooter } from '../ui/dialog'
import { Field, Input } from '../ui/form'

/** 新增/编辑活动类型（名称 + 颜色） */
export function SessionTypeDialog({
  open,
  sessionType,
  meetingId,
  onClose,
  onSaved,
}: {
  open: boolean
  sessionType: SessionType | null
  meetingId: string
  onClose: () => void
  onSaved: () => void
}) {
  const [name, setName] = useState('')
  const [color, setColor] = useState('#3B82F6')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (open) {
      setName(sessionType?.name ?? '')
      setColor(sessionType?.color ?? '#3B82F6')
      setError('')
    }
  }, [open, sessionType])

  async function submit() {
    if (!name.trim()) {
      setError('请填写类型名称')
      return
    }
    setLoading(true)
    setError('')
    try {
      if (sessionType) {
        await api.patch(`/session-types/${sessionType.id}`, { name: name.trim(), color })
      } else {
        await api.post('/session-types', { meetingId, name: name.trim(), color })
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
      title={sessionType ? '编辑活动类型' : '新增活动类型'}
      onClose={onClose}
      footer={<DialogFooter onCancel={onClose} onConfirm={submit} loading={loading} confirmText="保存" />}
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="类型名称">
            <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus placeholder="如：论坛" />
          </Field>
          <Field label="颜色">
            <div className="flex h-9 items-center gap-2">
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="h-8 w-12 cursor-pointer rounded border border-gray-200 bg-white p-0.5"
                title="选择颜色"
              />
              <span className="text-xs text-gray-500">{color}</span>
            </div>
          </Field>
        </div>
        <Field label="预览">
          <span
            className="inline-block rounded border px-2 py-0.5 text-xs"
            style={{
              backgroundColor: `${color}1F`,
              border: `1px solid ${color}66`,
              color,
            }}
          >
            {name.trim() || '类型名称'}
          </span>
        </Field>
        {error && <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>}
      </div>
    </Dialog>
  )
}
