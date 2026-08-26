import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}

/** ISO UTC 时间 → 本地时区显示 */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '-'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '-'
  return d.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

export function formatTime(iso: string | null | undefined): string {
  if (!iso) return '-'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '-'
  return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '-'
  return iso.slice(0, 10)
}

/** datetime-local 输入框值（本地时区） */
export function toLocalInputValue(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** datetime-local 输入框值 → ISO UTC */
export function fromLocalInputValue(value: string): string {
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  return d.toISOString()
}

export const MEETING_STATUS: Record<string, { label: string; className: string }> = {
  draft: { label: '草稿', className: 'bg-gray-100 text-gray-700' },
  published: { label: '已发布', className: 'bg-blue-100 text-blue-700' },
  ongoing: { label: '进行中', className: 'bg-green-100 text-green-700' },
  finished: { label: '已结束', className: 'bg-stone-200 text-stone-600' },
}

export const SESSION_TYPE: Record<string, { label: string; className: string }> = {
  speech: { label: '演讲', className: 'bg-blue-50 text-blue-700 border-blue-200' },
  panel: { label: '圆桌', className: 'bg-purple-50 text-purple-700 border-purple-200' },
  break: { label: '茶歇', className: 'bg-amber-50 text-amber-700 border-amber-200' },
  checkin: { label: '签到', className: 'bg-teal-50 text-teal-700 border-teal-200' },
  other: { label: '其他', className: 'bg-gray-50 text-gray-700 border-gray-200' },
}

export const SPEAKER_ROLE: Record<string, string> = {
  host: '主持',
  speaker: '演讲',
  panelist: '圆桌嘉宾',
}

export const CONFIRM_STATUS: Record<string, string> = {
  pending: '待确认',
  confirmed: '已确认',
  declined: '已拒绝',
}
