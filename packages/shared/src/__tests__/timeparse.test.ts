import { describe, expect, it } from 'vitest'
import { parseTimeRange, parseTimeToken } from '../timeparse.ts'

// 会议起始日：2026-08-22（本地时区）
const BASE = new Date(2026, 7, 22, 0, 0, 0)

function local(y: number, mo: number, d: number, h: number, mi: number): Date {
  return new Date(y, mo - 1, d, h, mi)
}

describe('parseTimeToken', () => {
  it('解析 24 小时制', () => {
    expect(parseTimeToken('14:00')).toEqual({ hour: 14, minute: 0 })
    expect(parseTimeToken('9:30')).toEqual({ hour: 9, minute: 30 })
    expect(parseTimeToken('14时30分')).toEqual({ hour: 14, minute: 30 })
    expect(parseTimeToken('14点')).toEqual({ hour: 14, minute: 0 })
  })

  it('解析上午/下午/晚上', () => {
    expect(parseTimeToken('上午9:00')).toEqual({ hour: 9, minute: 0 })
    expect(parseTimeToken('下午2点')).toEqual({ hour: 14, minute: 0 })
    expect(parseTimeToken('晚上8点30分')).toEqual({ hour: 20, minute: 30 })
    expect(parseTimeToken('凌晨12点')).toEqual({ hour: 0, minute: 0 })
    expect(parseTimeToken('中午12点')).toEqual({ hour: 12, minute: 0 })
    expect(parseTimeToken('下午12点')).toEqual({ hour: 12, minute: 0 })
  })

  it('解析中文数字', () => {
    expect(parseTimeToken('下午两点')).toEqual({ hour: 14, minute: 0 })
    expect(parseTimeToken('上午九点三十分')).toEqual({ hour: 9, minute: 30 })
    expect(parseTimeToken('十点')).toEqual({ hour: 10, minute: 0 })
  })

  it('解析点半', () => {
    expect(parseTimeToken('2点半')).toEqual({ hour: 2, minute: 30 })
    expect(parseTimeToken('下午两点半')).toEqual({ hour: 14, minute: 30 })
  })

  it('无小时返回 null', () => {
    expect(parseTimeToken('下午')).toBeNull()
    expect(parseTimeToken('上午')).toBeNull()
    expect(parseTimeToken('')).toBeNull()
  })

  it('非法时间返回 null', () => {
    expect(parseTimeToken('25:00')).toBeNull()
    expect(parseTimeToken('12:60')).toBeNull()
    expect(parseTimeToken('abc')).toBeNull()
  })
})

describe('parseTimeRange', () => {
  it('标准日期时间：2026-08-22 14:00', () => {
    const r = parseTimeRange('2026-08-22 14:00', BASE)
    expect(r).not.toBeNull()
    expect(r!.start.getTime()).toBe(local(2026, 8, 22, 14, 0).getTime())
    expect(r!.end).toBeNull()
  })

  it('斜杠日期 + 中文下午：2026/8/22 下午2点', () => {
    const r = parseTimeRange('2026/8/22 下午2点', BASE)
    expect(r).not.toBeNull()
    expect(r!.start.getTime()).toBe(local(2026, 8, 22, 14, 0).getTime())
    expect(r!.end).toBeNull()
  })

  it('月日 + 时间段：8月22日 14:00-15:30（年份取会议起始日）', () => {
    const r = parseTimeRange('8月22日 14:00-15:30', BASE)
    expect(r).not.toBeNull()
    expect(r!.start.getTime()).toBe(local(2026, 8, 22, 14, 0).getTime())
    expect(r!.end!.getTime()).toBe(local(2026, 8, 22, 15, 30).getTime())
  })

  it('相对日：第二天上午 9:00', () => {
    const r = parseTimeRange('第二天上午 9:00', BASE)
    expect(r).not.toBeNull()
    expect(r!.start.getTime()).toBe(local(2026, 8, 23, 9, 0).getTime())
  })

  it('第三天 14:00-15:30', () => {
    const r = parseTimeRange('第三天 14:00-15:30', BASE)
    expect(r).not.toBeNull()
    expect(r!.start.getTime()).toBe(local(2026, 8, 24, 14, 0).getTime())
    expect(r!.end!.getTime()).toBe(local(2026, 8, 24, 15, 30).getTime())
  })

  it('仅时间段（日期取会议起始日）：14:00-15:30', () => {
    const r = parseTimeRange('14:00-15:30', BASE)
    expect(r).not.toBeNull()
    expect(r!.start.getTime()).toBe(local(2026, 8, 22, 14, 0).getTime())
    expect(r!.end!.getTime()).toBe(local(2026, 8, 22, 15, 30).getTime())
  })

  it('中文分隔符：8月22日 14:00至15:30', () => {
    const r = parseTimeRange('8月22日 14:00至15:30', BASE)
    expect(r).not.toBeNull()
    expect(r!.end!.getTime()).toBe(local(2026, 8, 22, 15, 30).getTime())
  })

  it('完整日期时间范围：2026-08-22 14:00-15:30', () => {
    const r = parseTimeRange('2026-08-22 14:00-15:30', BASE)
    expect(r).not.toBeNull()
    expect(r!.start.getTime()).toBe(local(2026, 8, 22, 14, 0).getTime())
    expect(r!.end!.getTime()).toBe(local(2026, 8, 22, 15, 30).getTime())
  })

  it('无小时表述解析失败返回 null：8月22日下午', () => {
    expect(parseTimeRange('8月22日下午', BASE)).toBeNull()
  })

  it('纯日期无时间返回 null', () => {
    expect(parseTimeRange('8月22日', BASE)).toBeNull()
  })

  it('写了范围但结束时间非法 → 整体失败', () => {
    expect(parseTimeRange('8月22日 14:00-abc', BASE)).toBeNull()
  })

  it('非法日期返回 null', () => {
    expect(parseTimeRange('13月1日 14:00', BASE)).toBeNull()
    expect(parseTimeRange('2月30日 14:00', BASE)).toBeNull()
  })

  it('空文本返回 null', () => {
    expect(parseTimeRange('', BASE)).toBeNull()
    expect(parseTimeRange('  ', BASE)).toBeNull()
  })

  it('跨天时段（结束早于开始）自动顺延一天', () => {
    const r = parseTimeRange('8月22日 23:00-01:00', BASE)
    expect(r).not.toBeNull()
    expect(r!.start.getTime()).toBe(local(2026, 8, 22, 23, 0).getTime())
    expect(r!.end!.getTime()).toBe(local(2026, 8, 23, 1, 0).getTime())
  })

  it('接受 YYYY-MM-DD 字符串作为 baseDate', () => {
    const r = parseTimeRange('14:00-15:30', '2026-08-22')
    expect(r).not.toBeNull()
    expect(r!.start.getFullYear()).toBe(2026)
    expect(r!.start.getMonth()).toBe(7)
    expect(r!.start.getDate()).toBe(22)
  })
})
