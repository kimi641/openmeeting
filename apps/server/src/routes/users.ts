import { asc, count, eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { adminUpdateUserSchema } from '@meeting/shared'
import { db } from '../db'
import { authSessions, importPresets, materials, meetings, users } from '../db/schema'
import { hashPassword, requireAdmin, requireAuth, type AppEnv } from '../lib/auth'
import { ApiError, notFound } from '../lib/http'

const usersRouter = new Hono<AppEnv>()
usersRouter.use('*', requireAuth, requireAdmin)

// 用户列表（含注册时间与名下会议数）
usersRouter.get('/', (c) => {
  const rows = db
    .select({ id: users.id, username: users.username, role: users.role, disabled: users.disabled, createdAt: users.createdAt })
    .from(users)
    .orderBy(asc(users.createdAt))
    .all()

  const meetingCounts = db
    .select({ createdBy: meetings.createdBy, n: count() })
    .from(meetings)
    .groupBy(meetings.createdBy)
    .all()
  const countMap = new Map<string, number>()
  for (const row of meetingCounts) {
    if (row.createdBy) countMap.set(row.createdBy, row.n)
  }

  const data = rows.map((u) => ({ ...u, meetingCount: countMap.get(u.id) ?? 0 }))
  return c.json({ data, total: data.length })
})

// 更新用户：禁用/启用、重置密码（重置密码会使其全部会话失效）
usersRouter.patch('/:id', async (c) => {
  const input = adminUpdateUserSchema.parse(await c.req.json())
  const target = db.select().from(users).where(eq(users.id, c.req.param('id'))).get()
  if (!target) throw notFound('用户')

  const me = c.get('user')
  if (target.id === me.id && input.disabled === true) {
    throw new ApiError(400, 'BAD_REQUEST', '不能禁用当前登录的管理员账号')
  }

  db.update(users)
    .set({
      ...(input.disabled !== undefined && { disabled: input.disabled }),
      ...(input.password !== undefined && { passwordHash: hashPassword(input.password) }),
    })
    .where(eq(users.id, target.id))
    .run()

  // 禁用或重置密码后，强制该用户重新登录
  if (input.disabled === true || input.password !== undefined) {
    db.delete(authSessions).where(eq(authSessions.userId, target.id)).run()
  }
  return c.json({ ok: true })
})

// 删除用户：连同其名下会议（级联清理会议数据）；其他引用置空
usersRouter.delete('/:id', (c) => {
  const target = db.select().from(users).where(eq(users.id, c.req.param('id'))).get()
  if (!target) throw notFound('用户')

  if (target.id === c.get('user').id) {
    throw new ApiError(400, 'BAD_REQUEST', '不能删除当前登录的管理员账号')
  }

  db.transaction((tx) => {
    tx.delete(meetings).where(eq(meetings.createdBy, target.id)).run()
    tx.update(importPresets).set({ createdBy: null }).where(eq(importPresets.createdBy, target.id)).run()
    tx.update(materials).set({ uploadedBy: null }).where(eq(materials.uploadedBy, target.id)).run()
    tx.delete(users).where(eq(users.id, target.id)).run()
  })
  return c.json({ ok: true })
})

export default usersRouter
