import { asc, eq, max } from 'drizzle-orm'
import { Hono } from 'hono'
import { nanoid } from 'nanoid'
import {
  addSpeakerSchema,
  createSessionOrganizerSchema,
  createSessionSchema,
  moveSessionSchema,
  updateSessionSchema,
} from '@meeting/shared'
import { db } from '../db'
import {
  meetings,
  organizations,
  participants,
  sessionOrganizers,
  sessionSpeakers,
  sessions,
  venues,
} from '../db/schema'
import { requireAuth, type AppEnv } from '../lib/auth'
import { badRequest, notFound } from '../lib/http'

const sessionsRouter = new Hono<AppEnv>()
sessionsRouter.use('*', requireAuth)

function getSessionOr404(id: string) {
  const session = db.select().from(sessions).where(eq(sessions.id, id)).get()
  if (!session) throw notFound('场次')
  return session
}

/** 校验场地存在且属于指定会议 */
function getVenueOfMeetingOr404(venueId: string, meetingId: string) {
  const venue = db.select().from(venues).where(eq(venues.id, venueId)).get()
  if (!venue) throw notFound('场地')
  if (venue.meetingId !== meetingId) throw badRequest('场地不属于该会议')
  return venue
}

// 会议的全部场次（按开始时间排序）?meetingId=
sessionsRouter.get('/', (c) => {
  const meetingId = c.req.query('meetingId')
  if (!meetingId) throw notFound('会议')
  const rows = db
    .select()
    .from(sessions)
    .where(eq(sessions.meetingId, meetingId))
    .orderBy(asc(sessions.startTime), asc(sessions.sortOrder))
    .all()
  return c.json({ data: rows })
})

// 新建场次（挂在某会议下，可同时关联嘉宾）
sessionsRouter.post('/', async (c) => {
  const body = await c.req.json()
  const input = createSessionSchema.parse(body)
  const meetingId = String(body?.meetingId ?? '')
  const meeting = db.select().from(meetings).where(eq(meetings.id, meetingId)).get()
  if (!meeting) throw notFound('会议')
  if (input.venueId) getVenueOfMeetingOr404(input.venueId, meeting.id)

  if (input.speakers) {
    for (const sp of input.speakers) {
      const p = db.select().from(participants).where(eq(participants.id, sp.participantId)).get()
      if (!p) throw notFound('人员')
      if (p.meetingId !== meeting.id) throw badRequest('人员不属于该会议')
    }
  }

  if (input.organizers) {
    for (const org of input.organizers) {
      const o = db.select().from(organizations).where(eq(organizations.id, org.organizationId)).get()
      if (!o) throw notFound('组织')
      if (o.meetingId !== meeting.id) throw badRequest('组织不属于该会议')
    }
  }

  const currentMax = db
    .select({ m: max(sessions.sortOrder) })
    .from(sessions)
    .where(eq(sessions.meetingId, meeting.id))
    .get()?.m
  const id = nanoid(12)

  db.transaction((tx) => {
    tx.insert(sessions)
      .values({
        id,
        meetingId: meeting.id,
        venueId: input.venueId ?? null,
        title: input.title,
        type: input.type,
        startTime: input.startTime,
        endTime: input.endTime,
        description: input.description ?? null,
        sortOrder: input.sortOrder ?? (currentMax ?? -1) + 1,
        crossTracks: input.crossTracks ?? false,
      })
      .run()

    for (const sp of input.speakers ?? []) {
      tx.insert(sessionSpeakers)
        .values({
          id: nanoid(12),
          sessionId: id,
          participantId: sp.participantId,
          role: sp.role,
          confirmStatus: 'pending',
        })
        .run()
    }

    for (const org of input.organizers ?? []) {
      tx.insert(sessionOrganizers)
        .values({
          id: nanoid(12),
          sessionId: id,
          organizationId: org.organizationId,
        })
        .run()
    }
  })

  return c.json(db.select().from(sessions).where(eq(sessions.id, id)).get(), 201)
})

// 更新场次
sessionsRouter.patch('/:id', async (c) => {
  const session = getSessionOr404(c.req.param('id'))
  const input = updateSessionSchema.parse(await c.req.json())
  if (input.venueId) getVenueOfMeetingOr404(input.venueId, session.meetingId)

  if (input.organizers) {
    for (const org of input.organizers) {
      const o = db.select().from(organizations).where(eq(organizations.id, org.organizationId)).get()
      if (!o) throw notFound('组织')
      if (o.meetingId !== session.meetingId) throw badRequest('组织不属于该会议')
    }
  }

  db.update(sessions)
    .set({
      ...(input.venueId !== undefined && { venueId: input.venueId ?? null }),
      ...(input.title !== undefined && { title: input.title }),
      ...(input.type !== undefined && { type: input.type }),
      ...(input.startTime !== undefined && { startTime: input.startTime }),
      ...(input.endTime !== undefined && { endTime: input.endTime }),
      ...(input.description !== undefined && { description: input.description ?? null }),
      ...(input.sortOrder !== undefined && { sortOrder: input.sortOrder }),
      ...(input.crossTracks !== undefined && { crossTracks: input.crossTracks }),
    })
    .where(eq(sessions.id, session.id))
    .run()

  for (const org of input.organizers ?? []) {
    db.insert(sessionOrganizers)
      .values({
        id: nanoid(12),
        sessionId: session.id,
        organizationId: org.organizationId,
      })
      .run()
  }

  return c.json(getSessionOr404(session.id))
})

// 删除场次（级联删除嘉宾关联与材料关联）
sessionsRouter.delete('/:id', (c) => {
  const session = getSessionOr404(c.req.param('id'))
  db.delete(sessions).where(eq(sessions.id, session.id)).run()
  return c.json({ ok: true })
})

// 场次的嘉宾列表
sessionsRouter.get('/:id/speakers', (c) => {
  const session = getSessionOr404(c.req.param('id'))
  const rows = db
    .select({
      id: sessionSpeakers.id,
      sessionId: sessionSpeakers.sessionId,
      participantId: sessionSpeakers.participantId,
      role: sessionSpeakers.role,
      confirmStatus: sessionSpeakers.confirmStatus,
      participantName: participants.name,
    })
    .from(sessionSpeakers)
    .innerJoin(participants, eq(sessionSpeakers.participantId, participants.id))
    .where(eq(sessionSpeakers.sessionId, session.id))
    .all()
  return c.json({ data: rows })
})

// 场次的主办方列表
sessionsRouter.get('/:id/organizers', (c) => {
  const session = getSessionOr404(c.req.param('id'))
  const rows = db
    .select({
      id: sessionOrganizers.id,
      sessionId: sessionOrganizers.sessionId,
      organizationId: sessionOrganizers.organizationId,
      organizationName: organizations.name,
    })
    .from(sessionOrganizers)
    .innerJoin(organizations, eq(sessionOrganizers.organizationId, organizations.id))
    .where(eq(sessionOrganizers.sessionId, session.id))
    .orderBy(asc(sessionOrganizers.id))
    .all()
  return c.json({ data: rows })
})

// 拖拽落点保存：换场地 / 改时间 / 改排序，落定即保存（冲突仅警告不阻断）
sessionsRouter.post('/:id/move', async (c) => {
  const session = getSessionOr404(c.req.param('id'))
  const input = moveSessionSchema.parse(await c.req.json())
  if (input.venueId) getVenueOfMeetingOr404(input.venueId, session.meetingId)

  db.update(sessions)
    .set({
      venueId: input.venueId ?? null,
      startTime: input.startTime,
      endTime: input.endTime,
      ...(input.sortOrder !== undefined && { sortOrder: input.sortOrder }),
    })
    .where(eq(sessions.id, session.id))
    .run()

  return c.json(getSessionOr404(session.id))
})

// 添加场次嘉宾
sessionsRouter.post('/:id/speakers', async (c) => {
  const session = getSessionOr404(c.req.param('id'))
  const input = addSpeakerSchema.parse(await c.req.json())
  const participant = db.select().from(participants).where(eq(participants.id, input.participantId)).get()
  if (!participant) throw notFound('人员')
  if (participant.meetingId !== session.meetingId) throw badRequest('人员不属于该会议')

  const id = nanoid(12)
  db.insert(sessionSpeakers)
    .values({
      id,
      sessionId: session.id,
      participantId: input.participantId,
      role: input.role,
      confirmStatus: input.confirmStatus,
    })
    .run()

  return c.json(getSpeakerRow(id), 201)
})

function getSpeakerRow(id: string) {
  return db
    .select({
      id: sessionSpeakers.id,
      sessionId: sessionSpeakers.sessionId,
      participantId: sessionSpeakers.participantId,
      role: sessionSpeakers.role,
      confirmStatus: sessionSpeakers.confirmStatus,
      participantName: participants.name,
    })
    .from(sessionSpeakers)
    .innerJoin(participants, eq(sessionSpeakers.participantId, participants.id))
    .where(eq(sessionSpeakers.id, id))
    .get()
}

// 添加场次主办方
sessionsRouter.post('/:id/organizers', async (c) => {
  const session = getSessionOr404(c.req.param('id'))
  const input = createSessionOrganizerSchema.parse(await c.req.json())
  const organization = db
    .select()
    .from(organizations)
    .where(eq(organizations.id, input.organizationId))
    .get()
  if (!organization) throw notFound('组织')
  if (organization.meetingId !== session.meetingId) throw badRequest('组织不属于该会议')

  const id = nanoid(12)
  db.insert(sessionOrganizers)
    .values({
      id,
      sessionId: session.id,
      organizationId: input.organizationId,
    })
    .run()

  return c.json(getOrganizerRow(id), 201)
})

function getOrganizerRow(id: string) {
  return db
    .select({
      id: sessionOrganizers.id,
      sessionId: sessionOrganizers.sessionId,
      organizationId: sessionOrganizers.organizationId,
      organizationName: organizations.name,
    })
    .from(sessionOrganizers)
    .innerJoin(organizations, eq(sessionOrganizers.organizationId, organizations.id))
    .where(eq(sessionOrganizers.id, id))
    .get()
}

export default sessionsRouter
