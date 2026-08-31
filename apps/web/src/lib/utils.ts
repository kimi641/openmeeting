import type { CSSProperties } from 'react'
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

/** 内置类型默认值（label + 回退色）：接口未返回 session_types 时兜底 */
export const SESSION_TYPE: Record<string, { label: string; color: string }> = {
  speech: { label: '演讲', color: '#3B82F6' },
  panel: { label: '圆桌', color: '#8B5CF6' },
  forum: { label: '论坛', color: '#F97316' },
  break: { label: '茶歇', color: '#F59E0B' },
  checkin: { label: '签到', color: '#14B8A6' },
  other: { label: '其他', color: '#6B7280' },
}

/** 未知类型的兜底（索引访问可能为 undefined） */
export const DEFAULT_SESSION_TYPE = { label: '其他', color: '#6B7280' }

/** hex 颜色工具：加/减透明度后缀 */
function withAlpha(hex: string, alpha: number): string {
  const a = Math.round(alpha * 255)
    .toString(16)
    .padStart(2, '0')
  return `${hex}${a}`
}

/** 由类型颜色生成统一 inline 样式（背景 12% 透明度、左边框 4px 实色） */
export function typeStyle(color: string): CSSProperties {
  return {
    backgroundColor: withAlpha(color, 0.12),
    borderLeft: `4px solid ${color}`,
    color,
  }
}

/** 类型小标签样式（背景 12% 透明度、1px 边框、文字用类型色） */
export function typeTagStyle(color: string): CSSProperties {
  return {
    backgroundColor: withAlpha(color, 0.12),
    border: `1px solid ${withAlpha(color, 0.4)}`,
    color,
  }
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

/**
 * 读取日历中隐藏场地的完整映射（localStorage 按天存储：Record<日期, 场地ID[]>）。
 * 导出（Excel/PDF）按天应用对应的隐藏列表，保证其他日期的日程不受影响。
 */
export function getHiddenVenueMap(meetingId: string): Record<string, string[]> {
  try {
    const raw = localStorage.getItem(`cal:hidden-venues:${meetingId}`)
    if (!raw) return {}
    return JSON.parse(raw) as Record<string, string[]>
  } catch {
    return {}
  }
}
