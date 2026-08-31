import { eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { db } from '../db'
import { sessionOrganizers } from '../db/schema'
import { requireAuth, type AppEnv } from '../lib/auth'
import { notFound } from '../lib/http'

const sessionOrganizersRouter = new Hono<AppEnv>()

function getOrganizerOr404(id: string) {
  const row = db.select().from(sessionOrganizers).where(eq(sessionOrganizers.id, id)).get()
  if (!row) throw notFound('场次主办方')
  return row
}

// 移除主办方绑定
sessionOrganizersRouter.delete('/:id', requireAuth, (c) => {
  const existing = getOrganizerOr404(c.req.param('id'))
  db.delete(sessionOrganizers).where(eq(sessionOrganizers.id, existing.id)).run()
  return c.json({ ok: true })
})

export default sessionOrganizersRouter
