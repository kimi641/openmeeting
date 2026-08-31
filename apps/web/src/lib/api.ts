export class ApiClientError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message)
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    credentials: 'same-origin',
    headers: {
      ...(init.body && !(init.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
      ...(init.headers ?? {}),
    },
    ...init,
  })

  const body = await res.json().catch(() => null)
  if (!res.ok) {
    const err = body?.error ?? {}
    if (res.status === 401 && !path.startsWith('/auth/')) {
      window.location.href = '/login'
    }
    throw new ApiClientError(res.status, err.code ?? 'ERROR', err.message ?? `请求失败（${res.status}）`)
  }
  return body as T
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
}

// ---------- 类型 ----------

export interface User {
  id: string
  username: string
  role: 'admin' | 'member'
}

export interface Meeting {
  id: string
  name: string
  description: string | null
  startDate: string
  endDate: string
  location: string | null
  status: 'draft' | 'published' | 'ongoing' | 'finished'
  createdBy: string | null
  createdAt: string
  updatedAt: string
  stats?: { sessions: number }
}

export interface Session {
  id: string
  meetingId: string
  venueId: string | null
  title: string
  /** 活动类型 key（内置 speech/panel/... 或自定义类型 key） */
  type: string
  startTime: string
  endTime: string
  description: string | null
  sortOrder: number
  crossTracks: boolean
}

/** 场次活动类型（会议级资源，可自定义名称/颜色） */
export interface SessionType {
  id: string
  meetingId: string
  key: string
  name: string
  /** 十六进制颜色（#RRGGBB） */
  color: string
  sortOrder: number
}

export interface Speaker {
  id: string
  sessionId: string
  participantId: string
  role: 'host' | 'speaker' | 'panelist'
  confirmStatus: 'pending' | 'confirmed' | 'declined'
  participantName: string
}

export interface Participant {
  id: string
  meetingId: string
  name: string
  orgName: string | null
  title: string | null
  phone: string | null
  email: string | null
  note: string | null
}

export interface Venue {
  id: string
  meetingId: string
  name: string
  capacity: number | null
  equipment: string | null
  note: string | null
  sortOrder: number
}

export interface Conflict {
  type: 'venue' | 'person'
  level: 'error' | 'warning'
  sessionIds: string[]
  venueId?: string
  participantId?: string
  participantName?: string
  message: string
}

export interface Template {
  id: string
  name: string
  scenarioType: 'small' | 'medium'
}

export interface ListResult<T> {
  data: T[]
  total: number
  page?: number
  pageSize?: number
}
