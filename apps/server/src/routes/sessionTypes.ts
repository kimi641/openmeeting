import { and, asc, eq, max } from 'drizzle-orm'
import { Hono } from 'hono'
import { nanoid } from 'nanoid'
import { createSessionTypeSchema, updateSessionTypeSchema } from '@meeting/shared'
import { db } from '../db'
import { sessionTypes, sessions } from '../db/schema'
import { requireAuth, type AppEnv } from '../lib/auth'
import { getAccessibleMeeting, getAccessibleSessionType } from '../lib/access'
import { badRequest, ApiError } from '../lib/http'

const sessionTypesRouter = new Hono<AppEnv>()
sessionTypesRouter.use('*', requireAuth)

/** 内置活动类型（key 与存量 sessions.type 兼容；论坛为新增） */
const BUILTIN_TYPES: { key: string; name: string; color: string }[] = [
  { key: 'speech', name: '演讲', color: '#3B82F6' },
  { key: 'panel', name: '圆桌', color: '#8B5CF6' },
  { key: 'forum', name: '论坛', color: '#F97316' },
  { key: 'break', name: '茶歇', color: '#F59E0B' },
  { key: 'checkin', name: '签到', color: '#14B8A6' },
  { key: 'other', name: '其他', color: '#6B7280' },
]
const BUILTIN_KEYS = new Set(BUILTIN_TYPES.map((t) => t.key))

// 会议的全部活动类型（首次访问惰性 seed 内置类型，兼容存量会议）
sessionTypesRouter.get('/', (c) => {
  const meetingId = c.req.query('meetingId')
  if (!meetingId) throw badRequest('缺少会议 ID（meetingId）')
  getAccessibleMeeting(c.get('user'), meetingId)

  let data = db
    .select()
    .from(sessionTypes)
    .where(eq(sessionTypes.meetingId, meetingId))
    .orderBy(asc(sessionTypes.sortOrder), asc(sessionTypes.name))
    .all()

  // 惰性 seed：内置类型 key 与存量 sessions.type 一致，老会议零迁移
  if (data.length === 0) {
    db.transaction((tx) => {
      BUILTIN_TYPES.forEach((t, i) => {
        tx.insert(sessionTypes)
          .values({ id: nanoid(12), meetingId, key: t.key, name: t.name, color: t.color, sortOrder: i })
          .run()
      })
    })
    data = db
      .select()
      .from(sessionTypes)
      .where(eq(sessionTypes.meetingId, meetingId))
      .orderBy(asc(sessionTypes.sortOrder))
      .all()
  }
  return c.json({ data, total: data.length })
})

// 新增自定义活动类型
sessionTypesRouter.post('/', async (c) => {
  const body = await c.req.json()
  const input = createSessionTypeSchema.parse(body)
  const meetingId = String(body?.meetingId ?? '')
  getAccessibleMeeting(c.get('user'), meetingId)

  const currentMax = db
    .select({ m: max(sessionTypes.sortOrder) })
    .from(sessionTypes)
    .where(eq(sessionTypes.meetingId, meetingId))
    .get()?.m

  const id = nanoid(12)
  db.insert(sessionTypes)
    .values({
      id,
      meetingId,
      // 自定义类型 key = 记录 ID（与内置 key 空间天然隔离）
      key: id,
      name: input.name,
      color: input.color,
      sortOrder: (currentMax ?? -1) + 1,
    })
    .run()
  return c.json(getAccessibleSessionType(c.get('user'), id), 201)
})

// 更新活动类型（改名/改色/排序）
sessionTypesRouter.patch('/:id', async (c) => {
  const row = getAccessibleSessionType(c.get('user'), c.req.param('id'))
  const input = updateSessionTypeSchema.parse(await c.req.json())
  db.update(sessionTypes)
    .set({
      ...(input.name !== undefined && { name: input.name }),
      ...(input.color !== undefined && { color: input.color }),
      ...(input.sortOrder !== undefined && { sortOrder: input.sortOrder }),
    })
    .where(eq(sessionTypes.id, row.id))
    .run()
  return c.json(getAccessibleSessionType(c.get('user'), row.id))
})

// 删除活动类型（内置类型不可删；自定义类型被场次引用时拒绝）
sessionTypesRouter.delete('/:id', (c) => {
  const row = getAccessibleSessionType(c.get('user'), c.req.param('id'))
  if (BUILTIN_KEYS.has(row.key)) {
    throw new ApiError(409, 'CONFLICT', '内置类型不可删除，仅可修改名称或颜色')
  }
  const used = db
    .select({ id: sessions.id })
    .from(sessions)
    .where(and(eq(sessions.type, row.key), eq(sessions.meetingId, row.meetingId)))
    .limit(1)
    .all()
  if (used.length > 0) {
    throw new ApiError(409, 'CONFLICT', `仍有场次使用「${row.name}」类型，请先调整这些场次的类型`)
  }
  db.delete(sessionTypes).where(eq(sessionTypes.id, row.id)).run()
  return c.json({ ok: true })
})

export default sessionTypesRouter
