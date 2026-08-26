import { eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import { loginSchema } from '@meeting/shared'
import { db } from '../db'
import { users } from '../db/schema'
import {
  SESSION_COOKIE,
  SESSION_TTL_MS,
  cleanExpiredSessions,
  createSession,
  destroySession,
  requireAuth,
  verifyPassword,
  type AppEnv,
} from '../lib/auth'
import { ApiError, badRequest } from '../lib/http'

const auth = new Hono<AppEnv>()

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
