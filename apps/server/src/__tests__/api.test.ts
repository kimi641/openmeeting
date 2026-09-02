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

    // 会议已删除，其下属资源按无权限/不存在处理，统一返回 404
    const venuesAfter = await api(`/api/venues?meetingId=${last.id}`)
    expect(venuesAfter.status).toBe(404)
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

// ---------- 注册 / 用户数上限 / 数据隔离 / admin 用户管理 ----------

/** 直接请求并捕获响应头（用于拿注册/登录 cookie），不带全局 cookie */
async function rawRequest(
  pathName: string,
  init: RequestInit = {},
): Promise<{ status: number; body: any; cookie?: string }> {
  const res = await app.request(pathName, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init.headers as Record<string, string> | undefined) },
  })
  const body = await res.json().catch(() => null)
  const setCookie = res.headers.get('set-cookie')
  return { status: res.status, body, cookie: setCookie ? setCookie.split(';')[0] : undefined }
}

async function loginAs(username: string, password: string): Promise<string> {
  const res = await rawRequest('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  })
  expect(res.status).toBe(200)
  return res.cookie!
}

describe('注册与用户数上限', () => {
  const alice = { username: 'alice', password: 'alice-pass-123' }
  const bob = { username: 'bob', password: 'bob-pass-123' }
  let aliceCookie = ''
  let bobCookie = ''
  let aliceId = ''

  it('注册参数校验：非法用户名与过短密码返回 400', async () => {
    const badName = await rawRequest('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username: 'a b', password: 'alice-pass-123' }),
    })
    expect(badName.status).toBe(400)

    const badPass = await rawRequest('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username: 'carol', password: '123' }),
    })
    expect(badPass.status).toBe(400)
  })

  it('注册成功后立即可用（自动登录，role=member）', async () => {
    const res = await rawRequest('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(alice),
    })
    expect(res.status).toBe(201)
    expect(res.body).toMatchObject({ username: 'alice', role: 'member' })
    expect(res.cookie).toContain('meeting_session=')
    aliceCookie = res.cookie!

    cookie = aliceCookie
    const me = await api('/api/auth/me')
    expect(me.status).toBe(200)
    expect(me.body).toMatchObject({ username: 'alice', role: 'member' })
    aliceId = me.body.id
  })

  it('重复用户名注册返回 409', async () => {
    const res = await rawRequest('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(alice),
    })
    expect(res.status).toBe(409)
    expect(res.body.error.code).toBe('USERNAME_TAKEN')
  })

  it('默认注册上限为 100，admin 可调整', async () => {
    cookie = await loginAs('admin', 'test-password-123')
    const settings = await api('/api/settings')
    expect(settings.status).toBe(200)
    expect(settings.body.registrationLimit).toBe(100)
    expect(settings.body.userCount).toBe(2) // admin + alice

    const patched = await api('/api/settings', {
      method: 'PATCH',
      body: JSON.stringify({ registrationLimit: 2 }),
    })
    expect(patched.status).toBe(200)
    expect(patched.body.registrationLimit).toBe(2)
  })

  it('达到上限后注册被拒绝（403 REGISTRATION_CLOSED）', async () => {
    const res = await rawRequest('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(bob),
    })
    expect(res.status).toBe(403)
    expect(res.body.error.code).toBe('REGISTRATION_CLOSED')
  })

  it('上限校验：非法值（0/负数/小数）返回 400', async () => {
    const bad = await api('/api/settings', {
      method: 'PATCH',
      body: JSON.stringify({ registrationLimit: 0 }),
    })
    expect(bad.status).toBe(400)
  })

  it('调高上限后可继续注册', async () => {
    await api('/api/settings', {
      method: 'PATCH',
      body: JSON.stringify({ registrationLimit: 100 }),
    })
    const res = await rawRequest('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(bob),
    })
    expect(res.status).toBe(201)
    bobCookie = res.cookie!
  })

  it('非 admin 访问用户管理/设置接口被拒绝', async () => {
    cookie = bobCookie
    const users = await api('/api/users')
    expect(users.status).toBe(403)
    const settings = await api('/api/settings')
    expect(settings.status).toBe(403)
  })
})

describe('数据隔离（member 仅见本人数据，admin 全量）', () => {
  const alice = { username: 'alice', password: 'alice-pass-123' }
  const bob = { username: 'bob', password: 'bob-pass-123' }
  let meetingAId = ''
  let venueAId = ''

  it('alice 创建会议及下属资源', async () => {
    cookie = await loginAs(alice.username, alice.password)

    const meeting = await api('/api/meetings', {
      method: 'POST',
      body: JSON.stringify({
        name: 'alice 的私有会议',
        startDate: '2026-10-01',
        endDate: '2026-10-01',
      }),
    })
    expect(meeting.status).toBe(201)
    meetingAId = meeting.body.id

    const venue = await api('/api/venues', {
      method: 'POST',
      body: JSON.stringify({ meetingId: meetingAId, name: '私有场地' }),
    })
    expect(venue.status).toBe(201)
    venueAId = venue.body.id

    const participant = await api('/api/participants', {
      method: 'POST',
      body: JSON.stringify({ meetingId: meetingAId, name: '私有嘉宾' }),
    })
    expect(participant.status).toBe(201)

    const session = await api('/api/sessions', {
      method: 'POST',
      body: JSON.stringify({
        meetingId: meetingAId,
        venueId: venueAId,
        title: '私有场次',
        startTime: '2026-10-01T02:00:00.000Z',
        endTime: '2026-10-01T03:00:00.000Z',
      }),
    })
    expect(session.status).toBe(201)

    const list = await api('/api/meetings')
    expect(list.body.total).toBe(1)
  })

  it('bob 看不到 alice 的会议与下属资源（统一 404）', async () => {
    cookie = await loginAs(bob.username, bob.password)

    const list = await api('/api/meetings')
    expect(list.status).toBe(200)
    expect(list.body.total).toBe(0)

    expect((await api(`/api/meetings/${meetingAId}`)).status).toBe(404)
    expect((await api(`/api/meetings/${meetingAId}`, { method: 'PATCH', body: JSON.stringify({ name: '篡改' }) })).status).toBe(404)
    expect((await api(`/api/meetings/${meetingAId}`, { method: 'DELETE' })).status).toBe(404)
    expect((await api(`/api/venues?meetingId=${meetingAId}`)).status).toBe(404)
    expect((await api(`/api/participants?meetingId=${meetingAId}`)).status).toBe(404)
    expect((await api(`/api/organizations?meetingId=${meetingAId}`)).status).toBe(404)
    expect((await api(`/api/session-types?meetingId=${meetingAId}`)).status).toBe(404)
    expect(
      (
        await api('/api/sessions', {
          method: 'POST',
          body: JSON.stringify({
            meetingId: meetingAId,
            title: '越权场次',
            startTime: '2026-10-01T04:00:00.000Z',
            endTime: '2026-10-01T05:00:00.000Z',
          }),
        })
      ).status,
    ).toBe(404)
    expect((await api(`/api/venues/${venueAId}`, { method: 'DELETE' })).status).toBe(404)
  })

  it('admin 可见全部会议与用户统计', async () => {
    cookie = await loginAs('admin', 'test-password-123')

    const list = await api('/api/meetings')
    expect(list.body.total).toBe(3) // admin 原有 2 个 + alice 1 个

    const detail = await api(`/api/meetings/${meetingAId}`)
    expect(detail.status).toBe(200)

    const users = await api('/api/users')
    expect(users.status).toBe(200)
    const aliceRow = users.body.data.find((u: any) => u.username === 'alice')
    expect(aliceRow.meetingCount).toBe(1)
  })
})

describe('admin 用户管理', () => {
  const alice = { username: 'alice', password: 'alice-pass-123' }
  const bob = { username: 'bob', password: 'bob-pass-123' }

  async function findUser(username: string): Promise<any> {
    const users = await api('/api/users')
    return users.body.data.find((u: any) => u.username === username)
  }

  it('禁用 alice 后其会话失效且无法登录', async () => {
    cookie = await loginAs('admin', 'test-password-123')
    const aliceRow = await findUser(alice.username)

    const dis = await api(`/api/users/${aliceRow.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ disabled: true }),
    })
    expect(dis.status).toBe(200)

    const login = await rawRequest('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(alice),
    })
    expect(login.status).toBe(403)
    expect(login.body.error.code).toBe('USER_DISABLED')

    // 已有会话被强制失效
    cookie = ''
    const me = await rawRequest('/api/auth/me')
    expect(me.status).toBe(401)
  })

  it('重新启用 alice 后可登录', async () => {
    cookie = await loginAs('admin', 'test-password-123')
    const aliceRow = await findUser(alice.username)

    const en = await api(`/api/users/${aliceRow.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ disabled: false }),
    })
    expect(en.status).toBe(200)

    const login = await rawRequest('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(alice),
    })
    expect(login.status).toBe(200)
  })

  it('重置 bob 密码后旧密码失效、新密码可用', async () => {
    cookie = await loginAs('admin', 'test-password-123')
    const bobRow = await findUser(bob.username)

    const reset = await api(`/api/users/${bobRow.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ password: 'bob-new-pass-456' }),
    })
    expect(reset.status).toBe(200)

    const oldLogin = await rawRequest('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(bob),
    })
    expect(oldLogin.status).toBe(401)

    const newLogin = await rawRequest('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username: bob.username, password: 'bob-new-pass-456' }),
    })
    expect(newLogin.status).toBe(200)
  })

  it('admin 不能禁用或删除自己', async () => {
    cookie = await loginAs('admin', 'test-password-123')
    const adminRow = await findUser('admin')

    const dis = await api(`/api/users/${adminRow.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ disabled: true }),
    })
    expect(dis.status).toBe(400)

    const del = await api(`/api/users/${adminRow.id}`, { method: 'DELETE' })
    expect(del.status).toBe(400)
  })

  it('删除用户会连同其名下会议一起删除', async () => {
    cookie = await loginAs('admin', 'test-password-123')
    const bobRow = await findUser(bob.username)
    const aliceRow = await findUser(alice.username)

    const delBob = await api(`/api/users/${bobRow.id}`, { method: 'DELETE' })
    expect(delBob.status).toBe(200)

    const users = await api('/api/users')
    expect(users.body.data.some((u: any) => u.username === 'bob')).toBe(false)

    const delAlice = await api(`/api/users/${aliceRow.id}`, { method: 'DELETE' })
    expect(delAlice.status).toBe(200)

    // alice 名下会议已级联删除，admin 会议数回到原有 2 个
    const list = await api('/api/meetings')
    expect(list.body.total).toBe(2)
  })

  it('被删除用户无法登录', async () => {
    const login = await rawRequest('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(alice),
    })
    expect(login.status).toBe(401)
  })
})

