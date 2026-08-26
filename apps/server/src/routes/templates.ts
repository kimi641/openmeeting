import { asc } from 'drizzle-orm'
import { Hono } from 'hono'
import { db } from '../db'
import { templates } from '../db/schema'
import { requireAuth, type AppEnv } from '../lib/auth'

const templatesRouter = new Hono<AppEnv>()

// 场景模板列表（供新建会议时选择）
templatesRouter.get('/', requireAuth, (c) => {
  const data = db
    .select({ id: templates.id, name: templates.name, scenarioType: templates.scenarioType })
    .from(templates)
    .orderBy(asc(templates.name))
    .all()
  return c.json({ data, total: data.length })
})

export default templatesRouter
