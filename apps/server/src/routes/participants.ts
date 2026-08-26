import { and, count, eq, like, or } from 'drizzle-orm'
import { Hono } from 'hono'
import { nanoid } from 'nanoid'
import { createParticipantSchema, updateParticipantSchema } from '@meeting/shared'
import { db } from '../db'
import { meetings, participants } from '../db/schema'
import { requireAuth, type AppEnv } from '../lib/auth'
import { badRequest, notFound } from '../lib/http'

const participantsRouter = new Hono<AppEnv>()
participantsRouter.use('*', requireAuth)

function getParticipantOr404(id: string) {
  const p = db.select().from(participants).where(eq(participants.id, id)).get()
  if (!p) throw notFound('人员')
  return p
}

// 人员列表：?meetingId=（必填）&keyword=&page=&pageSize=（keyword 匹配姓名/单位/职务/电话/邮箱）
participantsRouter.get('/', (c) => {
  const meetingId = c.req.query('meetingId')
  if (!meetingId) throw badRequest('缺少会议 ID（meetingId）')
  const page = Math.max(1, Number(c.req.query('page') ?? 1) || 1)
  const pageSize = Math.min(100, Math.max(1, Number(c.req.query('pageSize') ?? 50) || 50))
  const keyword = c.req.query('keyword')?.trim()

  const conditions = [eq(participants.meetingId, meetingId)]
  if (keyword) {
    conditions.push(
      or(
        like(participants.name, `%${keyword}%`),
        like(participants.orgName, `%${keyword}%`),
        like(participants.title, `%${keyword}%`),
        like(participants.phone, `%${keyword}%`),
        like(participants.email, `%${keyword}%`),
      )!,
    )
  }
  const where = and(...conditions)

  const total = db.select({ n: count() }).from(participants).where(where).get()?.n ?? 0
  const data = db
    .select()
    .from(participants)
    .where(where)
    .orderBy(participants.name)
    .limit(pageSize)
    .offset((page - 1) * pageSize)
    .all()

  return c.json({ data, total, page, pageSize })
})

// 新建人员（挂到某会议下）
participantsRouter.post('/', async (c) => {
  const input = createParticipantSchema.parse(await c.req.json())
  const meeting = db.select().from(meetings).where(eq(meetings.id, input.meetingId)).get()
  if (!meeting) throw notFound('会议')
  const id = nanoid(12)
  db.insert(participants)
    .values({
      id,
      meetingId: meeting.id,
      name: input.name,
      orgName: input.orgName ?? null,
      title: input.title ?? null,
      phone: input.phone ?? null,
      email: input.email || null,
      note: input.note ?? null,
    })
    .run()
  return c.json(getParticipantOr404(id), 201)
})

// 更新人员
participantsRouter.patch('/:id', async (c) => {
  const p = getParticipantOr404(c.req.param('id'))
  const input = updateParticipantSchema.parse(await c.req.json())

  db.update(participants)
    .set({
      ...(input.name !== undefined && { name: input.name }),
      ...(input.orgName !== undefined && { orgName: input.orgName ?? null }),
      ...(input.title !== undefined && { title: input.title ?? null }),
      ...(input.phone !== undefined && { phone: input.phone ?? null }),
      ...(input.email !== undefined && { email: input.email || null }),
      ...(input.note !== undefined && { note: input.note ?? null }),
    })
    .where(eq(participants.id, p.id))
    .run()
  return c.json(getParticipantOr404(p.id))
})

// 删除人员（级联删除场次嘉宾关联与会议人员关联）
participantsRouter.delete('/:id', (c) => {
  const p = getParticipantOr404(c.req.param('id'))
  db.delete(participants).where(eq(participants.id, p.id)).run()
  return c.json({ ok: true })
})

export default participantsRouter
