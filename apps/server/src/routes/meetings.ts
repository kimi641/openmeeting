import { and, asc, count, desc, eq, like, or } from 'drizzle-orm'
import { Hono } from 'hono'
import { nanoid } from 'nanoid'
import {
  createMeetingSchema,
  detectConflicts,
  meetingStatusSchema,
  updateMeetingSchema,
  type ConflictSession,
  type ConflictSpeaker,
} from '@meeting/shared'
import { db } from '../db'
import { meetings, participants, sessionSpeakers, sessions, venues } from '../db/schema'
import { requireAuth, type AppEnv } from '../lib/auth'
import { notFound } from '../lib/http'
import { applyTemplate } from '../db/templates'

const meetingsRouter = new Hono<AppEnv>()
meetingsRouter.use('*', requireAuth)

function getMeetingOr404(id: string) {
  const meeting = db.select().from(meetings).where(eq(meetings.id, id)).get()
  if (!meeting) throw notFound('会议')
  return meeting
}

// 会议列表：?status=&keyword=&page=&pageSize=
meetingsRouter.get('/', (c) => {
  const page = Math.max(1, Number(c.req.query('page') ?? 1) || 1)
  const pageSize = Math.min(100, Math.max(1, Number(c.req.query('pageSize') ?? 20) || 20))
  const status = c.req.query('status')
  const keyword = c.req.query('keyword')?.trim()

  const conditions = []
  if (
    status === 'draft' ||
    status === 'published' ||
    status === 'ongoing' ||
    status === 'finished'
  ) {
    conditions.push(eq(meetings.status, status))
  }
  if (keyword) {
    conditions.push(or(like(meetings.name, `%${keyword}%`), like(meetings.location, `%${keyword}%`))!)
  }
  const where = conditions.length > 0 ? and(...conditions) : undefined

  const total = db.select({ n: count() }).from(meetings).where(where).get()?.n ?? 0
  const data = db
    .select()
    .from(meetings)
    .where(where)
    .orderBy(desc(meetings.createdAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize)
    .all()

  return c.json({ data, total, page, pageSize })
})

// 新建会议（可选场景模板）
meetingsRouter.post('/', async (c) => {
  const input = createMeetingSchema.parse(await c.req.json())
  const now = new Date().toISOString()
  const id = nanoid(12)

  db.insert(meetings)
    .values({
      id,
      name: input.name,
      description: input.description ?? null,
      startDate: input.startDate,
      endDate: input.endDate,
      location: input.location ?? null,
      status: 'draft',
      createdBy: c.get('user').id,
      createdAt: now,
      updatedAt: now,
    })
    .run()

  if (input.templateId) {
    applyTemplate(input.templateId, id, input.startDate)
  }

  return c.json(getMeetingOr404(id), 201)
})

// 会议详情 + 统计
meetingsRouter.get('/:id', (c) => {
  const meeting = getMeetingOr404(c.req.param('id'))
  const sessionCount =
    db.select({ n: count() }).from(sessions).where(eq(sessions.meetingId, meeting.id)).get()?.n ?? 0
  return c.json({ ...meeting, stats: { sessions: sessionCount } })
})

// 更新会议基本信息
meetingsRouter.patch('/:id', async (c) => {
  const meeting = getMeetingOr404(c.req.param('id'))
  const input = updateMeetingSchema.parse(await c.req.json())

  db.update(meetings)
    .set({
      ...(input.name !== undefined && { name: input.name }),
      ...(input.description !== undefined && { description: input.description ?? null }),
      ...(input.startDate !== undefined && { startDate: input.startDate }),
      ...(input.endDate !== undefined && { endDate: input.endDate }),
      ...(input.location !== undefined && { location: input.location ?? null }),
      updatedAt: new Date().toISOString(),
    })
    .where(eq(meetings.id, meeting.id))
    .run()

  return c.json(getMeetingOr404(meeting.id))
})

// 删除会议（级联删除 tracks/sessions/speakers/materials 记录）
meetingsRouter.delete('/:id', (c) => {
  const meeting = getMeetingOr404(c.req.param('id'))
  db.delete(meetings).where(eq(meetings.id, meeting.id)).run()
  return c.json({ ok: true })
})

// 状态流转（draft/published/ongoing/finished 任意互转，全部手动切换）
meetingsRouter.post('/:id/status', async (c) => {
  const meeting = getMeetingOr404(c.req.param('id'))
  const { status } = meetingStatusSchema.parse(await c.req.json())

  db.update(meetings)
    .set({ status, updatedAt: new Date().toISOString() })
    .where(eq(meetings.id, meeting.id))
    .run()

  return c.json(getMeetingOr404(meeting.id))
})

// 复制会议：复制场地与场次骨架（标题/类型/起止时间/场地/简介/排序号/全体环节标记；不含嘉宾）
meetingsRouter.post('/:id/duplicate', (c) => {
  const meeting = getMeetingOr404(c.req.param('id'))
  const now = new Date().toISOString()
  const newId = nanoid(12)

  db.transaction((tx) => {
    tx.insert(meetings)
      .values({
        id: newId,
        name: `副本 ${meeting.name}`,
        description: meeting.description,
        startDate: meeting.startDate,
        endDate: meeting.endDate,
        location: meeting.location,
        status: 'draft',
        createdBy: c.get('user').id,
        createdAt: now,
        updatedAt: now,
      })
      .run()

    // 复制场地（新 id 映射，场次引用指向副本）
    const venueRows = tx
      .select()
      .from(venues)
      .where(eq(venues.meetingId, meeting.id))
      .orderBy(asc(venues.sortOrder))
      .all()
    const venueMap = new Map<string, string>()
    for (const v of venueRows) {
      const nv = nanoid(12)
      venueMap.set(v.id, nv)
      tx.insert(venues)
        .values({
          id: nv,
          meetingId: newId,
          name: v.name,
          capacity: v.capacity,
          equipment: v.equipment,
          note: v.note,
          sortOrder: v.sortOrder,
        })
        .run()
    }

    const sessionRows = tx.select().from(sessions).where(eq(sessions.meetingId, meeting.id)).all()
    for (const s of sessionRows) {
      tx.insert(sessions)
        .values({
          id: nanoid(12),
          meetingId: newId,
          venueId: s.venueId ? (venueMap.get(s.venueId) ?? null) : null,
          title: s.title,
          type: s.type,
          startTime: s.startTime,
          endTime: s.endTime,
          description: s.description,
          sortOrder: s.sortOrder,
          crossTracks: s.crossTracks,
        })
        .run()
    }
  })

  return c.json(getMeetingOr404(newId), 201)
})

// 冲突检测（实时计算，仅警告不阻断保存；场地/人员为会议级资源，检测范围为本会议）
meetingsRouter.get('/:id/conflicts', (c) => {
  const meeting = getMeetingOr404(c.req.param('id'))

  const mySessions = db
    .select({
      id: sessions.id,
      meetingId: sessions.meetingId,
      title: sessions.title,
      startTime: sessions.startTime,
      endTime: sessions.endTime,
      venueId: sessions.venueId,
    })
    .from(sessions)
    .where(eq(sessions.meetingId, meeting.id))
    .all()

  const mySpeakers = db
    .select({
      sessionId: sessionSpeakers.sessionId,
      participantId: sessionSpeakers.participantId,
      participantName: participants.name,
    })
    .from(sessionSpeakers)
    .innerJoin(sessions, eq(sessionSpeakers.sessionId, sessions.id))
    .innerJoin(participants, eq(sessionSpeakers.participantId, participants.id))
    .where(eq(sessions.meetingId, meeting.id))
    .all()

  const conflicts = detectConflicts(
    mySessions as ConflictSession[],
    mySpeakers as ConflictSpeaker[],
  )
  return c.json({ data: conflicts, total: conflicts.length })
})

export default meetingsRouter
