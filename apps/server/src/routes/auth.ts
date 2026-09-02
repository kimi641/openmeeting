import { count, eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { nanoid } from 'nanoid'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import { loginSchema, registerSchema } from '@meeting/shared'
import { db } from '../db'
import { users } from '../db/schema'
import {
  SESSION_COOKIE,
  SESSION_TTL_MS,
  cleanExpiredSessions,
  createSession,
  destroySession,
  hashPassword,
  requireAuth,
  verifyPassword,
  type AppEnv,
} from '../lib/auth'
import { ApiError, badRequest } from '../lib/http'
import { getRegistrationLimit } from '../lib/settings'

const auth = new Hono<AppEnv>()

// 公开注册：用户名 + 密码，注册后立即可用（role=member）；受注册用户数上限约束
// （上限默认 100，admin 可在系统设置中调整；达到上限返回 403 REGISTRATION_CLOSED）
auth.post('/register', async (c) => {
  const input = registerSchema.parse(await c.req.json())

  const total = db.select({ n: count() }).from(users).get()?.n ?? 0
  if (total >= getRegistrationLimit()) {
    throw new ApiError(403, 'REGISTRATION_CLOSED', '用户数已达上限，暂无法注册')
  }

  const existing = db.select({ id: users.id }).from(users).where(eq(users.username, input.username)).get()
  if (existing) {
    throw new ApiError(409, 'USERNAME_TAKEN', '该用户名已被注册')
  }

  const id = nanoid(12)
  db.insert(users)
    .values({
      id,
      username: input.username,
      passwordHash: hashPassword(input.password),
      role: 'member',
      disabled: false,
      createdAt: new Date().toISOString(),
    })
    .run()

  cleanExpiredSessions()
  const sessionId = createSession(id)
  setCookie(c, SESSION_COOKIE, sessionId, {
    httpOnly: true,
    sameSite: 'Lax',
    path: '/',
    maxAge: SESSION_TTL_MS / 1000,
  })
  return c.json({ id, username: input.username, role: 'member' }, 201)
})

auth.post('/login', async (c) => {
  const body = loginSchema.parse(await c.req.json())
  const user = db.select().from(users).where(eq(users.username, body.username)).get()
  if (!user || !verifyPassword(body.password, user.passwordHash)) {
    throw new ApiError(401, 'AUTH_FAILED', '用户名或密码错误')
  }
  if (user.disabled) {
    throw new ApiError(403, 'USER_DISABLED', '账号已被禁用')
  }

  cleanExpiredSessions()
  const sessionId = createSession(user.id)
  setCookie(c, SESSION_COOKIE, sessionId, {
    httpOnly: true,
    sameSite: 'Lax',
    path: '/',
    maxAge: SESSION_TTL_MS / 1000,
  })
  return c.json({ id: user.id, username: user.username, role: user.role })
})

auth.post('/logout', (c) => {
  const sessionId = getCookie(c, SESSION_COOKIE)
  if (sessionId) destroySession(sessionId)
  deleteCookie(c, SESSION_COOKIE, { path: '/' })
  return c.json({ ok: true })
})

auth.get('/me', requireAuth, (c) => {
  return c.json(c.get('user'))
})

export default auth
