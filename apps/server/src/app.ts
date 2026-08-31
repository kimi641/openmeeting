import { Hono } from 'hono'
import { ZodError } from 'zod'
import { runMigrations, db } from './db'
import { ensureAdminUser } from './lib/auth'
import { ApiError } from './lib/http'
import { seedTemplates } from './db/templates'
import authRoutes from './routes/auth'
import meetingsRouter from './routes/meetings'
import sessionsRouter from './routes/sessions'
import sessionSpeakersRouter from './routes/sessionSpeakers'
import sessionTypesRouter from './routes/sessionTypes'
import venuesRouter from './routes/venues'
import participantsRouter from './routes/participants'
import templatesRouter from './routes/templates'
import { users } from './db/schema'

/** 构建 Hono 应用并执行启动初始化（迁移、初始管理员、模板种子） */
export function createApp(): Hono {
  const app = new Hono()

  // 统一错误格式：{ error: { code, message } }
  app.onError((err, c) => {
    if (err instanceof ApiError) {
      return c.json({ error: { code: err.code, message: err.message } }, err.status)
    }
    if (err instanceof ZodError) {
      const first = err.issues[0]
      const message = first ? `${first.path.join('.') || '输入'}：${first.message}` : '参数校验失败'
      return c.json({ error: { code: 'VALIDATION_ERROR', message } }, 400)
    }
    console.error('[server] unhandled error:', err)
    return c.json({ error: { code: 'INTERNAL_ERROR', message: '服务器内部错误' } }, 500)
  })

  app.notFound((c) => {
    if (c.req.path.startsWith('/api/')) {
      return c.json({ error: { code: 'NOT_FOUND', message: '接口不存在' } }, 404)
    }
    return c.text('Not Found', 404)
  })

  app.get('/api/health', (c) => c.json({ ok: true, version: '0.1.0' }))

  app.route('/api/auth', authRoutes)
  app.route('/api/meetings', meetingsRouter)
  app.route('/api/sessions', sessionsRouter)
  app.route('/api/session-speakers', sessionSpeakersRouter)
  app.route('/api/session-types', sessionTypesRouter)
  app.route('/api/venues', venuesRouter)
  app.route('/api/participants', participantsRouter)
  app.route('/api/templates', templatesRouter)

  // 启动初始化
  runMigrations()
  ensureAdminUser()
  seedTemplates()

  return app
}

export function userCount(): number {
  return db.select({ id: users.id }).from(users).all().length
}
