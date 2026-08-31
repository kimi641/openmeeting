import { useCallback, useEffect, useState } from 'react'
import { api, type ListResult, type SessionType } from './api'

// 按 meetingId 共享类型数据：任意一处 reload，所有使用方同步刷新
// （保证在右侧面板改颜色后，主日历/日程 Tab/编辑弹窗立即使用新颜色）
const cache = new Map<string, SessionType[]>()
const inflight = new Map<string, Promise<SessionType[]>>()
const listeners = new Set<(meetingId: string) => void>()

function emit(meetingId: string) {
  for (const fn of listeners) fn(meetingId)
}

async function fetchTypes(meetingId: string, force: boolean): Promise<SessionType[]> {
  if (!force) {
    const cached = cache.get(meetingId)
    if (cached) return cached
  }
  let p = inflight.get(meetingId)
  if (!p) {
    p = api
      .get<ListResult<SessionType>>(`/session-types?meetingId=${meetingId}`)
      .then((r) => {
        cache.set(meetingId, r.data)
        return r.data
      })
      .catch(() => {
        cache.set(meetingId, [])
        return [] as SessionType[]
      })
      .finally(() => {
        inflight.delete(meetingId)
      })
    inflight.set(meetingId, p)
  }
  const data = await p
  emit(meetingId)
  return data
}

/**
 * 拉取会议的活动类型列表（含内置与自定义）。
 * 各页面（日历/编辑弹窗/右侧面板/打印页）共用，保证颜色与名称一致；
 * 任一调用方 reload 后，同一会议的所有实例都会同步更新。
 */
export function useSessionTypes(meetingId: string | null) {
  const [types, setTypes] = useState<SessionType[]>(() =>
    meetingId ? cache.get(meetingId) ?? [] : [],
  )

  useEffect(() => {
    if (!meetingId) {
      setTypes([])
      return
    }
    let cancelled = false
    setTypes(cache.get(meetingId) ?? [])
    void fetchTypes(meetingId, false).then((data) => {
      if (!cancelled) setTypes(data)
    })
    const fn = (changed: string) => {
      if (changed === meetingId) setTypes(cache.get(meetingId) ?? [])
    }
    listeners.add(fn)
    return () => {
      cancelled = true
      listeners.delete(fn)
    }
  }, [meetingId])

  const reload = useCallback(async () => {
    if (!meetingId) return
    await fetchTypes(meetingId, true)
  }, [meetingId])

  return { types, reload }
}
