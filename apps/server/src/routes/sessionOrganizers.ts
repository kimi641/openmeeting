import { eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { db } from '../db'
import { sessionOrganizers } from '../db/schema'
import { requireAuth, type AppEnv } from '../lib/auth'
import { getAccessibleOrganizer } from '../lib/access'

const sessionOrganizersRouter = new Hono<AppEnv>()

// 移除主办方绑定
sessionOrganizersRouter.delete('/:id', requireAuth, (c) => {
  const existing = getAccessibleOrganizer(c.get('user'), c.req.param('id'))
  db.delete(sessionOrganizers).where(eq(sessionOrganizers.id, existing.id)).run()
  return c.json({ ok: true })
})

export default sessionOrganizersRouter
