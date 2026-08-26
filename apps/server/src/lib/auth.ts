import { eq, lt } from 'drizzle-orm'
import { getCookie } from 'hono/cookie'
import { createMiddleware } from 'hono/factory'
import bcrypt from 'bcryptjs'
import { nanoid } from 'nanoid'
import { db } from '../db'
import { authSessions, users } from '../db/schema'
import { ApiError, unauthorized } from './http'

export const SESSION_COOKIE = 'meeting_session'
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000 // 7 天

export interface CurrentUser {
  id: string
  username: string
  role: 'admin' | 'member'
}

export interface AppEnv {
  Variables: {
    user: CurrentUser
  }
}

export function hashPassword(password: string): string {
  return bcrypt.hashSync(password, 10)
}

export function verifyPassword(password: string, hash: string): boolean {
  return bcrypt.compareSync(password, hash)
}

/** 创建会话并返回会话 ID（调用方负责写 cookie） */
export function createSession(userId: string): string {
  const id = nanoid(32)
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString()
  db.insert(authSessions).values({ id, userId, expiresAt }).run()
  return id
}

export function destroySession(sessionId: string): void {
  db.delete(authSessions).where(eq(authSessions.id, sessionId)).run()
}

/** 清理过期会话 */
export function cleanExpiredSessions(): void {
  db.delete(authSessions).where(lt(authSessions.expiresAt, new Date().toISOString())).run()
}

function resolveSession(sessionId: string | undefined): CurrentUser | null {
  if (!sessionId) return null
  const row = db
    .select({
      id: users.id,
      username: users.username,
      role: users.role,
      disabled: users.disabled,
      expiresAt: authSessions.expiresAt,
    })
    .from(authSessions)
    .innerJoin(users, eq(authSessions.userId, users.id))
    .where(eq(authSessions.id, sessionId))
    .get()
  if (!row) return null
  if (row.disabled) return null
  if (row.expiresAt <= new Date().toISOString()) return null
  return { id: row.id, username: row.username, role: row.role }
}

/** 全局会话校验中间件：/api/auth/login 与 /api/health 之外均需登录 */
export const requireAuth = createMiddleware<AppEnv>(async (c, next) => {
  const user = resolveSession(getCookie(c, SESSION_COOKIE))
  if (!user) throw unauthorized()
  c.set('user', user)
  await next()
})

/** admin 专用 */
export const requireAdmin = createMiddleware<AppEnv>(async (c, next) => {
  if (c.get('user').role !== 'admin') {
    throw new ApiError(403, 'FORBIDDEN', '仅管理员可执行此操作')
  }
  await next()
})

/** 首次启动：若无任何用户则创建初始管理员 */
export function ensureAdminUser(): void {
  const count = db.select({ n: users.id }).from(users).all().length
  if (count > 0) return

  const username = process.env.ADMIN_USERNAME?.trim() || 'admin'
  let password = process.env.ADMIN_PASSWORD || ''
  if (!password) {
    password = nanoid(16)
  }
  db.insert(users)
    .values({
      id: nanoid(12),
      username,
      passwordHash: hashPassword(password),
      role: 'admin',
      disabled: false,
      createdAt: new Date().toISOString(),
    })
    .run()

  if (process.env.ADMIN_PASSWORD) {
    console.log(`[init] 已创建管理员账号：${username}（密码来自 ADMIN_PASSWORD 环境变量）`)
  } else {
    console.log('='.repeat(56))
    console.log(`[init] 已创建初始管理员账号：${username}`)
    console.log(`[init] 初始密码（仅显示一次，请登录后尽快修改）：${password}`)
    console.log('='.repeat(56))
  }
}
