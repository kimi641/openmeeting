import { asc, eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { nanoid } from 'nanoid'
import { createOrganizationSchema, updateOrganizationSchema } from '@meeting/shared'
import { db } from '../db'
import { meetings, organizations } from '../db/schema'
import { requireAuth, type AppEnv } from '../lib/auth'
import { badRequest, notFound } from '../lib/http'

const organizationsRouter = new Hono<AppEnv>()
organizationsRouter.use('*', requireAuth)

function getOrganizationOr404(id: string) {
  const organization = db.select().from(organizations).where(eq(organizations.id, id)).get()
  if (!organization) throw notFound('组织')
  return organization
}

// 组织列表（会议级资源，?meetingId= 必填，按名称排序）
organizationsRouter.get('/', (c) => {
  const meetingId = c.req.query('meetingId')
  if (!meetingId) throw badRequest('缺少会议 ID（meetingId）')
  const data = db
    .select()
    .from(organizations)
    .where(eq(organizations.meetingId, meetingId))
    .orderBy(asc(organizations.name))
    .all()
  return c.json({ data })
})

// 新建组织（挂到某会议下）
organizationsRouter.post('/', async (c) => {
  const input = createOrganizationSchema.parse(await c.req.json())
  const meeting = db.select().from(meetings).where(eq(meetings.id, input.meetingId)).get()
  if (!meeting) throw notFound('会议')

  const id = nanoid(12)
  db.insert(organizations)
    .values({
      id,
      meetingId: meeting.id,
      name: input.name,
      contact: input.contact ?? null,
      phone: input.phone ?? null,
      note: input.note ?? null,
    })
    .run()
  return c.json(getOrganizationOr404(id), 201)
})

// 更新组织
organizationsRouter.patch('/:id', async (c) => {
  const organization = getOrganizationOr404(c.req.param('id'))
  const input = updateOrganizationSchema.parse(await c.req.json())

  db.update(organizations)
    .set({
      ...(input.name !== undefined && { name: input.name }),
      ...(input.contact !== undefined && { contact: input.contact ?? null }),
      ...(input.phone !== undefined && { phone: input.phone ?? null }),
      ...(input.note !== undefined && { note: input.note ?? null }),
    })
    .where(eq(organizations.id, organization.id))
    .run()
  return c.json(getOrganizationOr404(organization.id))
})

// 删除组织（级联删除场次主办方绑定）
organizationsRouter.delete('/:id', (c) => {
  const organization = getOrganizationOr404(c.req.param('id'))
  db.delete(organizations).where(eq(organizations.id, organization.id)).run()
  return c.json({ ok: true })
})

export default organizationsRouter
