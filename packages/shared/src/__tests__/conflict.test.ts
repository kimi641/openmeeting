import { describe, expect, it } from 'vitest'
import { detectConflicts, type ConflictSession, type ConflictSpeaker } from '../conflict.ts'

let seq = 0
function sess(partial: Partial<ConflictSession> & { id: string }): ConflictSession {
  seq++
  return {
    meetingId: 'm1',
    title: `场次${seq}`,
    startTime: '2026-08-22T02:00:00.000Z',
    endTime: '2026-08-22T03:00:00.000Z',
    venueId: null,
    ...partial,
  }
}

describe('detectConflicts', () => {
  it('无冲突时返回空列表', () => {
    const result = detectConflicts(
      [
        sess({ id: 's1', startTime: '2026-08-22T02:00:00.000Z', endTime: '2026-08-22T03:00:00.000Z' }),
        sess({ id: 's2', startTime: '2026-08-22T03:00:00.000Z', endTime: '2026-08-22T04:00:00.000Z' }),
      ],
      [],
    )
    expect(result).toEqual([])
  })

  it('首尾相接不算重叠', () => {
    const result = detectConflicts(
      [
        sess({ id: 's1', venueId: 'v1', endTime: '2026-08-22T03:00:00.000Z' }),
        sess({ id: 's2', venueId: 'v1', startTime: '2026-08-22T03:00:00.000Z', endTime: '2026-08-22T04:00:00.000Z' }),
      ],
      [],
    )
    expect(result).toEqual([])
  })

  it('同一场地时间段重叠 → 红色场地冲突', () => {
    const result = detectConflicts(
      [
        sess({ id: 's1', venueId: 'v1' }),
        sess({ id: 's2', venueId: 'v1', startTime: '2026-08-22T02:30:00.000Z' }),
      ],
      [],
    )
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({ type: 'venue', level: 'error', sessionIds: ['s1', 's2'] })
  })

  it('场地冲突含跨会议', () => {
    const result = detectConflicts(
      [
        sess({ id: 's1', meetingId: 'm1', venueId: 'v1' }),
        sess({ id: 's2', meetingId: 'm2', venueId: 'v1', startTime: '2026-08-22T02:30:00.000Z' }),
      ],
      [],
    )
    expect(result).toHaveLength(1)
    expect(result[0]!.type).toBe('venue')
  })

  it('不同场地同时段不算场地冲突', () => {
    const result = detectConflicts(
      [
        sess({ id: 's1', venueId: 'v1' }),
        sess({ id: 's2', venueId: 'v2', startTime: '2026-08-22T02:30:00.000Z' }),
      ],
      [],
    )
    expect(result).toEqual([])
  })

  it('同一人员重叠时段分配到多场次 → 黄色人员冲突（含跨会议）', () => {
    const result = detectConflicts(
      [
        sess({ id: 's1', meetingId: 'm1' }),
        sess({ id: 's2', meetingId: 'm2', startTime: '2026-08-22T02:30:00.000Z' }),
      ],
      [
        { sessionId: 's1', participantId: 'p1', participantName: '张三' },
        { sessionId: 's2', participantId: 'p1', participantName: '张三' },
      ],
    )
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      type: 'person',
      level: 'warning',
      participantId: 'p1',
      participantName: '张三',
    })
  })

  it('同一人员不同时段不算人员冲突', () => {
    const result = detectConflicts(
      [
        sess({ id: 's1', endTime: '2026-08-22T03:00:00.000Z' }),
        sess({ id: 's2', startTime: '2026-08-22T03:00:00.000Z', endTime: '2026-08-22T04:00:00.000Z' }),
      ],
      [
        { sessionId: 's1', participantId: 'p1' },
        { sessionId: 's2', participantId: 'p1' },
      ],
    )
    expect(result).toEqual([])
  })

  it('跨天场次参与重叠判定', () => {
    const result = detectConflicts(
      [
        sess({ id: 's1', venueId: 'v1', startTime: '2026-08-22T10:00:00.000Z', endTime: '2026-08-23T02:00:00.000Z' }),
        sess({ id: 's2', venueId: 'v1', startTime: '2026-08-23T01:00:00.000Z', endTime: '2026-08-23T05:00:00.000Z' }),
      ],
      [],
    )
    expect(result).toHaveLength(1)
    expect(result[0]!.type).toBe('venue')
  })

  it('三场次两两重叠产生多条冲突', () => {
    const result = detectConflicts(
      [
        sess({ id: 's1', venueId: 'v1', startTime: '2026-08-22T01:00:00.000Z', endTime: '2026-08-22T04:00:00.000Z' }),
        sess({ id: 's2', venueId: 'v1', startTime: '2026-08-22T02:00:00.000Z', endTime: '2026-08-22T05:00:00.000Z' }),
        sess({ id: 's3', venueId: 'v1', startTime: '2026-08-22T03:00:00.000Z', endTime: '2026-08-22T06:00:00.000Z' }),
      ],
      [],
    )
    expect(result).toHaveLength(3)
  })

  it('无场地的场次不参与场地冲突', () => {
    const result = detectConflicts(
      [
        sess({ id: 's1', venueId: null }),
        sess({ id: 's2', venueId: null, startTime: '2026-08-22T02:30:00.000Z' }),
      ],
      [],
    )
    expect(result).toEqual([])
  })
})
