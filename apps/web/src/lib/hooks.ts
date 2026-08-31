import { useCallback, useEffect, useState } from 'react'
import { api, type ListResult, type Organization, type SessionType } from './api'

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

// 按 meetingId 共享组织数据：右侧面板组织 Tab 与详情页（场次弹窗主办方下拉）共用，
// 任意一处 reload（新增/编辑/删除组织后），同 meetingId 所有实例同步刷新
const orgCache = new Map<string, Organization[]>()
const orgInflight = new Map<string, Promise<Organization[]>>()
const orgListeners = new Set<(meetingId: string) => void>()

function emitOrganizations(meetingId: string) {
  for (const fn of orgListeners) fn(meetingId)
}

async function fetchOrganizations(meetingId: string, force: boolean): Promise<Organization[]> {
  if (!force) {
    const cached = orgCache.get(meetingId)
    if (cached) return cached
  }
  let p = orgInflight.get(meetingId)
  if (!p) {
    p = api
      .get<ListResult<Organization>>(`/organizations?meetingId=${meetingId}`)
      .then((r) => {
        orgCache.set(meetingId, r.data)
        return r.data
      })
      .catch(() => {
        orgCache.set(meetingId, [])
        return [] as Organization[]
      })
      .finally(() => {
        orgInflight.delete(meetingId)
      })
    orgInflight.set(meetingId, p)
  }
  const data = await p
  emitOrganizations(meetingId)
  return data
}

/**
 * 拉取会议的组织列表。
 * 右侧面板组织 Tab 与会议详情页（场次编辑弹窗主办方下拉）共用，保证数据一致；
 * 任一调用方 reload 后，同一会议的所有实例都会同步更新。
 */
export function useOrganizations(meetingId: string | null) {
  const [organizations, setOrganizations] = useState<Organization[]>(() =>
    meetingId ? orgCache.get(meetingId) ?? [] : [],
  )

  useEffect(() => {
    if (!meetingId) {
      setOrganizations([])
      return
    }
    let cancelled = false
    setOrganizations(orgCache.get(meetingId) ?? [])
    void fetchOrganizations(meetingId, false).then((data) => {
      if (!cancelled) setOrganizations(data)
    })
    const fn = (changed: string) => {
      if (changed === meetingId) setOrganizations(orgCache.get(meetingId) ?? [])
    }
    orgListeners.add(fn)
    return () => {
      cancelled = true
      orgListeners.delete(fn)
    }
  }, [meetingId])

  const reload = useCallback(async () => {
    if (!meetingId) return
    await fetchOrganizations(meetingId, true)
  }, [meetingId])

  return { types: organizations, reload }
}
