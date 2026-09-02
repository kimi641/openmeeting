import { count } from 'drizzle-orm'
import { Hono } from 'hono'
import { updateSettingsSchema } from '@meeting/shared'
import { db } from '../db'
import { users } from '../db/schema'
import { requireAdmin, requireAuth, type AppEnv } from '../lib/auth'
import { getRegistrationLimit, setRegistrationLimit } from '../lib/settings'

const settingsRouter = new Hono<AppEnv>()
settingsRouter.use('*', requireAuth, requireAdmin)

function userCount(): number {
  return db.select({ n: count() }).from(users).get()?.n ?? 0
}

// 系统设置（admin）
settingsRouter.get('/', (c) => {
  return c.json({ registrationLimit: getRegistrationLimit(), userCount: userCount() })
})

settingsRouter.patch('/', async (c) => {
  const input = updateSettingsSchema.parse(await c.req.json())
  setRegistrationLimit(input.registrationLimit)
  return c.json({ registrationLimit: input.registrationLimit, userCount: userCount() })
})

export default settingsRouter
