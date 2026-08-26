import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { env } from './env'
import { createApp, userCount } from './app'

const app = createApp()

// ---------- 静态资源伺服（内嵌前端构建产物，单服务即可用） ----------
// 探测顺序：server 同级 public（容器布局）→ ../../web/dist（monorepo 布局，src 与 dist 两种运行路径通用）
const here = path.dirname(fileURLToPath(import.meta.url))
const webRoot = [path.resolve(here, 'public'), path.resolve(here, '../../web/dist')].find((p) =>
  existsSync(path.join(p, 'index.html')),
)

if (webRoot) {
  app.use('*', serveStatic({ root: path.relative(process.cwd(), webRoot) }))
  // SPA 回退：前端路由路径统一返回 index.html
  const indexHtml = readFileSync(path.join(webRoot, 'index.html'), 'utf8')
  app.get('*', (c) => c.html(indexHtml))
  console.log(`[server] 已伺服前端构建产物：${webRoot}`)
} else {
  console.log('[server] 未找到前端构建产物，仅提供 API（开发模式请配合 Vite 开发服务器）')
}

serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  console.log(`[server] 会议排程系统已启动：http://localhost:${info.port}`)
  console.log(`[server] 数据目录：${env.DATA_DIR}（用户数：${userCount()}）`)
})
