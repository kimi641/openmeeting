import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import * as schema from './schema'
import { env } from '../env'

export const dataDir = path.resolve(env.DATA_DIR)
fs.mkdirSync(dataDir, { recursive: true })
fs.mkdirSync(path.join(dataDir, 'materials'), { recursive: true })

export const sqlite = new Database(path.join(dataDir, 'meeting.db'))
sqlite.pragma('journal_mode = WAL')
sqlite.pragma('foreign_keys = ON')

export const db = drizzle(sqlite, { schema })

/** 启动时执行迁移（drizzle 目录由 `pnpm db:generate` 生成） */
export function runMigrations(): void {
  const here = fileURLToPath(new URL('.', import.meta.url))
  // 兼容三种布局：src 运行（src/db → ../../drizzle）、bundle 运行（dist → ../drizzle）、容器（drizzle 拷贝至 server.js 同级）
  const candidates = [
    path.resolve(here, '../../drizzle'),
    path.resolve(here, '../drizzle'),
    path.resolve(here, 'drizzle'),
  ]
  const migrationsFolder = candidates.find((p) => fs.existsSync(path.join(p, 'meta', '_journal.json')))
  if (!migrationsFolder) {
    throw new Error(`未找到数据库迁移目录（已尝试：${candidates.join('、')}）`)
  }
  migrate(db, { migrationsFolder })
}
