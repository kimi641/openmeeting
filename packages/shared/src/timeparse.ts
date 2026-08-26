/**
 * 中文会议时间解析引擎（纯函数，前后端共用，PRD §6.6）
 *
 * 支持的输入示例（结合会议起始日 baseDate 推断年份 / 相对日期）：
 * - `2026-08-22 14:00`、`2026/8/22 下午2点`
 * - `8月22日 14:00-15:30`（年份取 baseDate 的年份）
 * - `第二天上午 9:00`（相对 baseDate）
 * - `14:00-15:30`（日期取 baseDate 当天）
 *
 * 规则：
 * - 无时区信息的时间一律按服务器本地时区构造 Date（内部即 UTC）；
 * - 必须带小时，"8月22日下午"这类无小时表述按解析失败处理，返回 null；
 * - 解析失败一律返回 null，不抛错。
 */

export interface ParsedTimeRange {
  start: Date
  end: Date | null
}

type Meridiem = 'am' | 'pm' | 'noon'

const AM_WORDS = ['上午', '早上', '早晨', '凌晨', '清晨']
const PM_WORDS = ['下午', '傍晚', '晚上', '夜里', '夜晚', '今晚']
const NOON_WORDS = ['中午']

const CHINESE_DIGITS: Record<string, number> = {
  一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10,
  十一: 11, 十二: 12,
}

/** 中文/阿拉伯数字 → 数字（支持 1-99 的简单组合：十、二十三） */
function toNumber(s: string): number | null {
  if (/^\d+$/.test(s)) return parseInt(s, 10)
  if (s in CHINESE_DIGITS) return CHINESE_DIGITS[s]!
  // 二十三 / 二十 这类组合
  const m = s.match(/^([一二两三四五六七八九])?十([一二三四五六七八九])?$/)
  if (m) {
    const tens = m[1] ? CHINESE_DIGITS[m[1]]! : 1
    const ones = m[2] ? CHINESE_DIGITS[m[2]]! : 0
    return tens * 10 + ones
  }
  return null
}

function stripMeridiem(text: string): { meridiem: Meridiem | null; rest: string } {
  for (const w of NOON_WORDS) {
    if (text.startsWith(w)) return { meridiem: 'noon', rest: text.slice(w.length) }
  }
  for (const w of AM_WORDS) {
    if (text.startsWith(w)) return { meridiem: 'am', rest: text.slice(w.length) }
  }
  for (const w of PM_WORDS) {
    if (text.startsWith(w)) return { meridiem: 'pm', rest: text.slice(w.length) }
  }
  return { meridiem: null, rest: text }
}

/** 解析单个时间点（必须含小时），失败返回 null */
export function parseTimeToken(text: string): { hour: number; minute: number } | null {
  const { meridiem, rest } = stripMeridiem(text.trim())
  let s = rest.trim()

  // 中文数字全部转阿拉伯（如 九点三十分 → 9点30分）
  s = s.replace(/[一二两三四五六七八九十]+/g, (m) => {
    const n = toNumber(m)
    return n === null ? m : String(n)
  })

  // 形态：H / H:M / H时 / H点 / H时M分 / H点M分 / H:M分 / H点半 / H半
  let m = s.match(/^(\d{1,2})\s*(?:[:：时点]\s*(\d{1,2})?\s*分?)?$/)
  if (!m) {
    const half = s.match(/^(\d{1,2})\s*(?:[:：时点]\s*)?半$/)
    if (half) m = [half[0], half[1]!, '30']
  }
  if (!m) return null

  let hour = parseInt(m[1]!, 10)
  const minute = m[2] ? parseInt(m[2], 10) : 0

  if (meridiem === 'pm') {
    if (hour !== 12) hour += 12
  } else if (meridiem === 'am') {
    if (hour === 12) hour = 0
  }
  // noon：中午 12 点保持 12，其余不变

  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null
  return { hour, minute }
}

interface DateParts {
  year: number
  month: number
  day: number
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}

const RELATIVE_DAYS: Record<string, number> = {
  今天: 0,
  今日: 0,
  明天: 1,
  明日: 1,
  后天: 2,
  大后天: 3,
}

/** 解析日期片段（相对 baseDate），失败返回 null */
export function parseDateToken(text: string, baseDate: Date): DateParts | null {
  const s = text.trim()
  let parts: DateParts | null = null

  // 2026-08-22 / 2026/8/22 / 2026.8.22 / 2026年8月22日
  let m = s.match(/^(\d{4})\s*[年./\-]\s*(\d{1,2})\s*[月./\-]\s*(\d{1,2})\s*日?$/)
  if (m) {
    parts = { year: +m[1]!, month: +m[2]!, day: +m[3]! }
  }

  // 8月22日 / 08月22日（年份取 baseDate）
  if (!parts) {
    m = s.match(/^(\d{1,2})\s*月\s*(\d{1,2})\s*日?$/)
    if (m) {
      parts = { year: baseDate.getFullYear(), month: +m[1]!, day: +m[2]! }
    }
  }

  // 相对日：今天/明天/后天/大后天
  if (!parts && s in RELATIVE_DAYS) {
    const d = addDays(baseDate, RELATIVE_DAYS[s]!)
    parts = { year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate() }
  }

  // 第 N 天（N 为中文或阿拉伯数字，相对会议起始日）
  if (!parts) {
    m = s.match(/^第\s*(\d{1,2}|[一二两三四五六七八九十]+)\s*天$/)
    if (m) {
      const n = toNumber(m[1]!)
      if (n !== null && n >= 1 && n <= 31) {
        const d = addDays(baseDate, n - 1)
        parts = { year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate() }
      }
    }
  }

  // 8/22 / 8-22（月-日，年份取 baseDate）
  if (!parts) {
    m = s.match(/^(\d{1,2})\s*[/\-]\s*(\d{1,2})$/)
    if (m) {
      parts = { year: baseDate.getFullYear(), month: +m[1]!, day: +m[2]! }
    }
  }

  if (!parts) return null

  // 校验日期合法性（月 1-12、日有效）
  const probe = new Date(parts.year, parts.month - 1, parts.day)
  if (
    probe.getFullYear() !== parts.year ||
    probe.getMonth() !== parts.month - 1 ||
    probe.getDate() !== parts.day
  ) {
    return null
  }
  return parts
}

const RANGE_SEPARATORS = /[-–—~～]|至|到/g

/**
 * 解析时间（段）文本。
 * @param text 单元格原始文本
 * @param baseDate 会议起始日（用于补年份、解析相对日）
 * @returns 解析成功返回 { start, end }（end 可为 null，表示只有开始时间）；失败返回 null
 */
export function parseTimeRange(text: string, baseDate: Date | string): ParsedTimeRange | null {
  if (!text) return null
  const base = typeof baseDate === 'string' ? new Date(`${baseDate}T00:00:00`) : baseDate
  if (Number.isNaN(base.getTime())) return null

  let s = String(text).trim()
  if (!s) return null

  // 1. 提取日期片段（优先完整日期，其次月日、相对日），并将命中的片段从文本中移除
  let parts: DateParts | null = null
  const datePatterns: RegExp[] = [
    /(\d{4})\s*[年./\-]\s*(\d{1,2})\s*[月./\-]\s*(\d{1,2})\s*日?/,
    /(\d{1,2})\s*月\s*(\d{1,2})\s*日?/,
    /(今天|今日|明天|明日|后天|大后天)/,
    /第\s*(\d{1,2}|[一二两三四五六七八九十]+)\s*天/,
    /(\d{1,2})\s*[/\-]\s*(\d{1,2})/,
  ]
  for (const re of datePatterns) {
    const m = s.match(re)
    if (m && m.index !== undefined) {
      const parsed = parseDateToken(m[0], base)
      if (parsed) {
        parts = parsed
        s = (s.slice(0, m.index) + ' ' + s.slice(m.index + m[0].length)).trim()
        break
      }
    }
  }

  // 无日期片段时，日期取 baseDate 当天
  if (!parts) {
    parts = { year: base.getFullYear(), month: base.getMonth() + 1, day: base.getDate() }
  }

  const { year, month, day } = parts

  // 2. 按范围分隔符切分剩余文本
  const segments = s.split(RANGE_SEPARATORS).map((x) => x.trim()).filter((x) => x.length > 0)
  const hasSeparator = segments.length > 1

  // 3. 逐段解析时间点
  const times: { hour: number; minute: number }[] = []
  for (const seg of segments) {
    const t = parseTimeToken(seg)
    if (t) times.push(t)
  }

  if (times.length === 0) return null // 必须带小时
  if (hasSeparator && times.length < 2) return null // 写了范围但结束时间解析失败 → 整体失败

  const start = new Date(year, month - 1, day, times[0]!.hour, times[0]!.minute)
  let end: Date | null = null
  if (times.length >= 2) {
    end = new Date(year, month - 1, day, times[1]!.hour, times[1]!.minute)
    // 结束时间早于开始时间（如 23:00-01:00）按跨天处理
    if (end.getTime() <= start.getTime()) {
      end = addDays(end, 1)
    }
  }

  return { start, end }
}
