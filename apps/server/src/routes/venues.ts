import { asc, eq, max } from 'drizzle-orm'
import { Hono } from 'hono'
import { nanoid } from 'nanoid'
import { createVenueSchema, reorderVenuesSchema, updateVenueSchema } from '@meeting/shared'
import { db } from '../db'
import { sessions, venues } from '../db/schema'
import { requireAuth, type AppEnv } from '../lib/auth'
import { getAccessibleMeeting, getAccessibleVenue } from '../lib/access'
import { badRequest } from '../lib/http'

const venuesRouter = new Hono<AppEnv>()
venuesRouter.use('*', requireAuth)

// 场地列表（会议级资源，?meetingId= 必填，按日历列顺序返回）
venuesRouter.get('/', (c) => {
  const meetingId = c.req.query('meetingId')
  if (!meetingId) throw badRequest('缺少会议 ID（meetingId）')
  getAccessibleMeeting(c.get('user'), meetingId)
  const data = db
    .select()
    .from(venues)
    .where(eq(venues.meetingId, meetingId))
    .orderBy(asc(venues.sortOrder), asc(venues.name))
    .all()
  return c.json({ data, total: data.length })
})

// 新建场地（挂到某会议下）
venuesRouter.post('/', async (c) => {
  const input = createVenueSchema.parse(await c.req.json())
  const meeting = getAccessibleMeeting(c.get('user'), input.meetingId)

  const currentMax = db
    .select({ m: max(venues.sortOrder) })
    .from(venues)
    .where(eq(venues.meetingId, meeting.id))
    .get()?.m

  const id = nanoid(12)
  db.insert(venues)
    .values({
      id,
      meetingId: meeting.id,
      name: input.name,
      capacity: input.capacity ?? null,
      equipment: input.equipment ?? null,
      note: input.note ?? null,
      sortOrder: (currentMax ?? -1) + 1,
    })
    .run()
  return c.json(getAccessibleVenue(c.get('user'), id), 201)
})

// 日历场地列拖拽排序：按传入顺序写入 sortOrder
venuesRouter.post('/reorder', async (c) => {
  const input = reorderVenuesSchema.parse(await c.req.json())
  // 逐项校验归属：member 只能重排本人会议下的场地列
  for (const id of input.venueIds) {
    getAccessibleVenue(c.get('user'), id)
  }

  db.transaction((tx) => {
    input.venueIds.forEach((id, i) => {
      tx.update(venues).set({ sortOrder: i }).where(eq(venues.id, id)).run()
    })
  })
  return c.json({ ok: true })
})

// 更新场地
venuesRouter.patch('/:id', async (c) => {
  const venue = getAccessibleVenue(c.get('user'), c.req.param('id'))
  const input = updateVenueSchema.parse(await c.req.json())

  db.update(venues)
    .set({
      ...(input.name !== undefined && { name: input.name }),
      ...(input.capacity !== undefined && { capacity: input.capacity ?? null }),
      ...(input.equipment !== undefined && { equipment: input.equipment ?? null }),
      ...(input.note !== undefined && { note: input.note ?? null }),
    })
    .where(eq(venues.id, venue.id))
    .run()
  return c.json(getAccessibleVenue(c.get('user'), venue.id))
})

// 删除场地（先解绑该会议中引用它的场次）
venuesRouter.delete('/:id', (c) => {
  const venue = getAccessibleVenue(c.get('user'), c.req.param('id'))
  db.transaction((tx) => {
    tx.update(sessions).set({ venueId: null }).where(eq(sessions.venueId, venue.id)).run()
    tx.delete(venues).where(eq(venues.id, venue.id)).run()
  })
  return c.json({ ok: true })
})

export default venuesRouter
