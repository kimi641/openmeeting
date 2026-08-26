/**
 * 冲突检测引擎（纯函数，前后端共用）
 *
 * 规则（PRD §6.4）：
 * - 场地冲突（红 / error）：同一场地同一时间段被多个场次占用（场地为会议级资源，检测范围为单会议内）；
 * - 人员冲突（黄 / warning）：同一人员同一时间段被分配到多个场次（通讯录为会议级资源，检测范围为单会议内）。
 *
 * 所有冲突仅警告，不阻断保存。时间重叠判定：startA < endB && startB < endA（首尾相接不算重叠）。
 */

export type ConflictType = 'venue' | 'person'
export type ConflictLevel = 'error' | 'warning'

/** 参与冲突检测的场次视图（时间均为 ISO 8601 UTC 字符串） */
export interface ConflictSession {
  id: string
  meetingId: string
  title: string
  startTime: string
  endTime: string
  /** 场次绑定的场地 ID（日历列），可为空 */
  venueId: string | null
}

/** 场次嘉宾分配视图 */
export interface ConflictSpeaker {
  sessionId: string
  participantId: string
  participantName?: string
}

export interface Conflict {
  type: ConflictType
  level: ConflictLevel
  /** 涉及的场次 ID */
  sessionIds: string[]
  /** 冗余上下文，便于前端高亮与提示 */
  venueId?: string
  participantId?: string
  participantName?: string
  message: string
}

function overlaps(a: ConflictSession, b: ConflictSession): boolean {
  return a.startTime < b.endTime && b.startTime < a.endTime
}

/** 计算同一分组（同场地）内的两两时间重叠 */
function detectGroupConflicts(
  sessions: ConflictSession[],
  keyOf: (s: ConflictSession) => string | null,
  make: (a: ConflictSession, b: ConflictSession, key: string) => Conflict,
): Conflict[] {
  const groups = new Map<string, ConflictSession[]>()
  for (const s of sessions) {
    const key = keyOf(s)
    if (key === null || key === '') continue
    const list = groups.get(key)
    if (list) list.push(s)
    else groups.set(key, [s])
  }

  const conflicts: Conflict[] = []
  for (const [key, list] of groups) {
    const sorted = [...list].sort((a, b) => a.startTime.localeCompare(b.startTime))
    for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 1; j < sorted.length; j++) {
        const a = sorted[i]!
        const b = sorted[j]!
        if (overlaps(a, b)) {
          conflicts.push(make(a, b, key))
        } else if (b.startTime >= a.endTime) {
          // 已按开始时间排序，后续场次不再与本场次重叠
          break
        }
      }
    }
  }
  return conflicts
}

/**
 * 冲突检测主入口。
 * @param sessions 全部参与检测的场次（为支持跨会议的场地/人员冲突，调用方应传入全局场次）
 * @param speakers 全部场次嘉宾分配
 */
export function detectConflicts(
  sessions: ConflictSession[],
  speakers: ConflictSpeaker[],
): Conflict[] {
  const conflicts: Conflict[] = []

  // 1. 场地冲突（红）
  conflicts.push(
    ...detectGroupConflicts(sessions, (s) => s.venueId, (a, b, venueId) => ({
      type: 'venue' as const,
      level: 'error' as const,
      sessionIds: [a.id, b.id],
      venueId,
      message: `场地冲突：场次「${a.title}」与「${b.title}」占用了同一场地的重叠时段`,
    })),
  )

  // 2. 人员冲突（黄）
  const byParticipant = new Map<string, { session: ConflictSession; name?: string }[]>()
  for (const sp of speakers) {
    const session = sessions.find((s) => s.id === sp.sessionId)
    if (!session) continue
    const list = byParticipant.get(sp.participantId)
    const entry = { session, name: sp.participantName }
    if (list) list.push(entry)
    else byParticipant.set(sp.participantId, [entry])
  }

  for (const [participantId, entries] of byParticipant) {
    const sorted = [...entries].sort((a, b) => a.session.startTime.localeCompare(b.session.startTime))
    for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 1; j < sorted.length; j++) {
        const a = sorted[i]!
        const b = sorted[j]!
        if (overlaps(a.session, b.session)) {
          const name = a.name ?? b.name ?? participantId
          conflicts.push({
            type: 'person',
            level: 'warning',
            sessionIds: [a.session.id, b.session.id],
            participantId,
            participantName: name,
            message: `人员冲突：${name} 在「${a.session.title}」与「${b.session.title}」的重叠时段内被重复安排`,
          })
        } else if (b.session.startTime >= a.session.endTime) {
          break
        }
      }
    }
  }

  return conflicts
}
