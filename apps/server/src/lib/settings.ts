import { eq } from 'drizzle-orm'
import { db } from '../db'
import { settings } from '../db/schema'

/** 注册用户数上限默认值（admin 可在设置页调整） */
export const DEFAULT_REGISTRATION_LIMIT = 100

const KEY_REGISTRATION_LIMIT = 'registration_limit'

export function getSetting(key: string): string | null {
  return db.select().from(settings).where(eq(settings.key, key)).get()?.value ?? null
}

export function setSetting(key: string, value: string): void {
  const updatedAt = new Date().toISOString()
  db.insert(settings)
    .values({ key, value, updatedAt })
    .onConflictDoUpdate({ target: settings.key, set: { value, updatedAt } })
    .run()
}

export function getRegistrationLimit(): number {
  const raw = getSetting(KEY_REGISTRATION_LIMIT)
  const n = Number(raw)
  return Number.isInteger(n) && n > 0 ? n : DEFAULT_REGISTRATION_LIMIT
}

export function setRegistrationLimit(limit: number): void {
  setSetting(KEY_REGISTRATION_LIMIT, String(limit))
}

/** 首次启动：写入默认注册上限（可被 admin 后续调整覆盖） */
export function ensureDefaultSettings(): void {
  if (getSetting(KEY_REGISTRATION_LIMIT) === null) {
    setRegistrationLimit(DEFAULT_REGISTRATION_LIMIT)
  }
}
