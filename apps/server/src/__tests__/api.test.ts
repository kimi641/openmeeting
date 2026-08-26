import type { Hono } from 'hono'
import { beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../app.ts'

// 环境变量（DATA_DIR / ADMIN_USERNAME / ADMIN_PASSWORD）由 vitest.config.ts 注入
let app: Hono

beforeAll(() => {
  app = createApp()
})

let cookie = ''

async function api(
  pathName: string,
  init: RequestInit = {},
): Promise<{ status: number; body: any }> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(cookie ? { Cookie: cookie } : {}),
    ...(init.headers as Record<string, string> | undefined),
  }
  const res = await app.request(pathName, { ...init, headers })
  const body = await res.json().catch(() => null)
  return { status: res.status, body }
}

describe('认证', () => {
  it('健康检查无需登录', async () => {
    const { status, body } = await api('/api/health')
    expect(status).toBe(200)
    expect(body.ok).toBe(true)
  })

  it('错误密码登录返回 401', async () => {
    const { status } = await api('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username: 'admin', password: 'wrong' }),
    })
    expect(status).toBe(401)
  })

  it('正确账号密码登录成功', async () => {
    const res = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'test-password-123' }),
    })
    expect(res.status).toBe(200)
    const setCookie = res.headers.get('set-cookie')
    expect(setCookie).toContain('meeting_session=')
    cookie = setCookie!.split(';')[0]!
  })

  it('未登录访问受保护接口返回 401', async () => {
    const saved = cookie
    cookie = ''
    const { status } = await api('/api/meetings')
    expect(status).toBe(401)
    cookie = saved
  })

  it('当前用户信息', async () => {
    const { status, body } = await api('/api/auth/me')
    expect(status).toBe(200)
    expect(body).toMatchObject({ username: 'admin', role: 'admin' })
  })
})

describe('会议与日程', () => {
  let meetingId = ''
  let tplMeetingId = ''
  let venueId = ''

  it('新建会议（无模板）', async () => {
    const res = await api('/api/meetings', {
      method: 'POST',
      body: JSON.stringify({
        name: '2026 行业闭门论坛',
        startDate: '2026-09-01',
        endDate: '2026-09-02',
        location: '北京',
      }),
    })
    expect(res.status).toBe(201)
    expect(res.body.status).toBe('draft')
    meetingId = res.body.id
  })

  it('新建会议（年会论坛模板预填日程与场地）', async () => {
    const res = await api('/api/meetings', {
      method: 'POST',
      body: JSON.stringify({
        name: '模板建会',
        startDate: '2026-09-10',
        endDate: '2026-09-11',
        templateId: 'tpl-forum',
      }),
    })
    expect(res.status).toBe(201)
    tplMeetingId = res.body.id

    const detail = await api(`/api/meetings/${tplMeetingId}`)
    expect(detail.body.stats.sessions).toBeGreaterThan(5)

    // 模板场地挂在新建会议下（主会场 + 分会场 A + 分会场 B）
    const venues = await api(`/api/venues?meetingId=${tplMeetingId}`)
    expect(venues.body.total).toBe(3)
  })

  it('会议列表分页与总数', async () => {
    const res = await api('/api/meetings?page=1&pageSize=10')
    expect(res.status).toBe(200)
    expect(res.body.total).toBe(2)
    expect(res.body.data.length).toBe(2)
  })

  it('状态流转：draft → published', async () => {
    const res = await api(`/api/meetings/${meetingId}/status`, {
      method: 'POST',
      body: JSON.stringify({ status: 'published' }),
    })
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('published')
  })

  it('场地 CRUD（会议级资源）', async () => {
    const created = await api('/api/venues', {
      method: 'POST',
      body: JSON.stringify({
        meetingId,
        name: '大报告厅',
        capacity: 200,
        equipment: '投影、音响',
      }),
    })
    expect(created.status).toBe(201)
    expect(created.body.meetingId).toBe(meetingId)
    venueId = created.body.id

    const second = await api('/api/venues', {
      method: 'POST',
      body: JSON.stringify({ meetingId, name: '分会场 C' }),
    })
    expect(second.status).toBe(201)

    const updated = await api(`/api/venues/${venueId}`, {
      method: 'PATCH',
      body: JSON.stringify({ capacity: 180 }),
    })
    expect(updated.status).toBe(200)
    expect(updated.body.capacity).toBe(180)

    const listed = await api(`/api/venues?meetingId=${meetingId}`)
    expect(listed.body.total).toBe(2)
  })

  it('场地按会议隔离（列表必须指定 meetingId）', async () => {
    const missing = await api('/api/venues')
    expect(missing.status).toBe(400)

    const tpl = await api(`/api/venues?meetingId=${tplMeetingId}`)
    expect(tpl.body.total).toBe(3)
    expect(tpl.body.data.some((v: any) => v.name === '大报告厅')).toBe(false)

    const cross = await api('/api/venues', {
      method: 'POST',
      body: JSON.stringify({ name: '无会议场地' }),
    })
    expect(cross.status).toBe(400)
  })

  it('人员 CRUD（会议级资源）', async () => {
    const created = await api('/api/participants', {
      method: 'POST',
      body: JSON.stringify({
        meetingId,
        name: '张三',
        orgName: '某协会',
        title: '秘书长',
        phone: '13800000000',
      }),
    })
    expect(created.status).toBe(201)
    expect(created.body.meetingId).toBe(meetingId)

    const bad = await api('/api/participants', {
      method: 'POST',
      body: JSON.stringify({ meetingId, name: '李四', email: 'not-an-email' }),
    })
    expect(bad.status).toBe(400)

    const listed = await api(`/api/participants?meetingId=${meetingId}`)
    expect(listed.body.total).toBe(1)
  })

  it('场地列拖拽排序（reorder 持久化）', async () => {
    const before = await api(`/api/venues?meetingId=${meetingId}`)
    expect(before.body.data[0].name).toBe('大报告厅')

    const reversed = [...before.body.data].map((v: any) => v.id).reverse()
    const res = await api('/api/venues/reorder', {
      method: 'POST',
      body: JSON.stringify({ venueIds: reversed }),
    })
    expect(res.status).toBe(200)

    const after = await api(`/api/venues?meetingId=${meetingId}`)
    expect(after.body.data[0].name).toBe('分会场 C')

    // 还原顺序，后续用例依赖
    const restore = await api('/api/venues/reorder', {
      method: 'POST',
      body: JSON.stringify({ venueIds: before.body.data.map((v: any) => v.id) }),
    })
    expect(restore.status).toBe(200)
  })

  it('在会议下创建场次（直接关联场地，含嘉宾）', async () => {
    const venues = await api(`/api/venues?meetingId=${meetingId}`)
    venueId = venues.body.data.find((v: any) => v.name === '大报告厅').id

    const people = await api(`/api/participants?meetingId=${meetingId}`)
    const participantId = people.body.data[0].id

    const res = await api('/api/sessions', {
      method: 'POST',
      body: JSON.stringify({
        meetingId,
        venueId,
        title: '开幕演讲',
        type: 'speech',
        startTime: '2026-09-01T02:00:00.000Z',
        endTime: '2026-09-01T03:00:00.000Z',
        speakers: [{ participantId, role: 'speaker' }],
      }),
    })
    expect(res.status).toBe(201)
    expect(res.body.venueId).toBe(venueId)

    // 按会议查询场次
    const list = await api(`/api/sessions?meetingId=${meetingId}`)
    expect(list.body.data.length).toBe(1)
  })

  it('同场地重叠场次产生场地冲突（仅警告，保存不阻断）', async () => {
    const res = await api('/api/sessions', {
      method: 'POST',
      body: JSON.stringify({
        meetingId,
        venueId,
        title: '圆桌讨论',
        type: 'panel',
        startTime: '2026-09-01T02:30:00.000Z',
        endTime: '2026-09-01T03:30:00.000Z',
      }),
    })
    expect(res.status).toBe(201) // 冲突不阻断保存

    const conflicts = await api(`/api/meetings/${meetingId}/conflicts`)
    expect(conflicts.status).toBe(200)
    expect(conflicts.body.total).toBeGreaterThanOrEqual(1)
    expect(conflicts.body.data.some((c: any) => c.type === 'venue')).toBe(true)
  })

  it('拖拽移动场次（move 接口：换场地/改时间）', async () => {
    const venues = await api(`/api/venues?meetingId=${meetingId}`)
    const newVenueId = venues.body.data.find((v: any) => v.name === '分会场 C').id

    const sessions = await api(`/api/sessions?meetingId=${meetingId}`)
    const sessionId = sessions.body.data[0].id

    const res = await api(`/api/sessions/${sessionId}/move`, {
      method: 'POST',
      body: JSON.stringify({
        venueId: newVenueId,
        startTime: '2026-09-01T05:00:00.000Z',
        endTime: '2026-09-01T06:00:00.000Z',
      }),
    })
    expect(res.status).toBe(200)
    expect(res.body.venueId).toBe(newVenueId)
  })

  it('复制会议（骨架复制，含场地、不含嘉宾）', async () => {
    const res = await api(`/api/meetings/${meetingId}/duplicate`, { method: 'POST' })
    expect(res.status).toBe(201)
    expect(res.body.name).toContain('副本')
    expect(res.body.status).toBe('draft')

    const detail = await api(`/api/meetings/${res.body.id}`)
    expect(detail.body.stats.sessions).toBe(2)

    // 场地随会议复制
    const copyVenues = await api(`/api/venues?meetingId=${res.body.id}`)
    expect(copyVenues.body.total).toBe(2)
    expect(copyVenues.body.data.some((v: any) => v.name === '大报告厅')).toBe(true)
  })

  it('删除会议级联删除日程与场地', async () => {
    const list = await api('/api/meetings')
    const last = list.body.data.find((m: any) => m.name.startsWith('副本'))
    const res = await api(`/api/meetings/${last.id}`, { method: 'DELETE' })
    expect(res.status).toBe(200)

    const after = await api('/api/meetings')
    expect(after.body.total).toBe(2)

    const venuesAfter = await api(`/api/venues?meetingId=${last.id}`)
    expect(venuesAfter.body.total).toBe(0)
  })

  it('删除场地后场次解绑为未指定', async () => {
    const venues = await api(`/api/venues?meetingId=${meetingId}`)
    const main = venues.body.data.find((v: any) => v.name === '分会场 C')

    const created = await api('/api/sessions', {
      method: 'POST',
      body: JSON.stringify({
        meetingId,
        venueId: main.id,
        title: '临时环节',
        startTime: '2026-09-02T02:00:00.000Z',
        endTime: '2026-09-02T03:00:00.000Z',
      }),
    })
    expect(created.status).toBe(201)

    const del = await api(`/api/venues/${main.id}`, { method: 'DELETE' })
    expect(del.status).toBe(200)

    const session = await api(`/api/sessions?meetingId=${meetingId}`)
    const row = session.body.data.find((s: any) => s.id === created.body.id)
    expect(row.venueId).toBeNull()
  })
})

describe('登出', () => {
  it('logout 后会话失效', async () => {
    const { status } = await api('/api/auth/logout', { method: 'POST' })
    expect(status).toBe(200)

    const me = await api('/api/auth/me')
    expect(me.status).toBe(401)
  })
})
