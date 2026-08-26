import { eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { updateSpeakerSchema } from '@meeting/shared'
import { db } from '../db'
import { participants, sessionSpeakers } from '../db/schema'
import { requireAuth, type AppEnv } from '../lib/auth'
import { notFound } from '../lib/http'

const sessionSpeakersRouter = new Hono<AppEnv>()

function getSpeakerOr404(id: string) {
  const row = db.select().from(sessionSpeakers).where(eq(sessionSpeakers.id, id)).get()
  if (!row) throw notFound('场次嘉宾')
  return row
}

function speakerWithParticipant(id: string) {
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

// 更新嘉宾（角色 / 确认状态）
sessionSpeakersRouter.patch('/:id', requireAuth, async (c) => {
  const existing = getSpeakerOr404(c.req.param('id'))
  const input = updateSpeakerSchema.parse(await c.req.json())

  db.update(sessionSpeakers)
    .set({
      ...(input.role !== undefined && { role: input.role }),
      ...(input.confirmStatus !== undefined && { confirmStatus: input.confirmStatus }),
    })
    .where(eq(sessionSpeakers.id, existing.id))
    .run()

  return c.json(speakerWithParticipant(existing.id))
})

// 移除嘉宾
sessionSpeakersRouter.delete('/:id', requireAuth, (c) => {
  const existing = getSpeakerOr404(c.req.param('id'))
  db.delete(sessionSpeakers).where(eq(sessionSpeakers.id, existing.id)).run()
  return c.json({ ok: true })
})

export default sessionSpeakersRouter
