# 会议设计排程系统 PRD（MVP / v0.1.0）

> 本文档是交付给 code agent 的开发依据。优先级：本文档 > 泛泛的"最佳实践"。凡本文档明确写出的决策（技术栈、范围、非目标），不得自行变更；本文档未覆盖的细节，按"简单、离线可用、零外部依赖"原则处理。

---

## 1. 产品概述

### 1.1 背景
大量组织（协会、企业、党政机关）仍用 Excel + Word + 邮件设计会议议程、管理参会人员信息。因数据保密要求无法使用云端 SaaS。本产品提供**可单机/内网部署**的开源会议管理工具。

### 1.2 MVP 目标
让一名会议组织者**不依赖任何外部服务**，完成一场中型闭门会议（30–100 人、跨 5–10 家单位、1–3 天、可多分会场）的全流程：会议设计 → 日程编排 → 冲突检查 → 材料管理 → 导出交付。

### 1.3 核心差异化（必须体现）
1. **零依赖离线运行**：单容器启动，无外网请求（无 CDN 字体、无统计上报、无遥测）；
2. **Excel 一键迁移**：导入既有 Excel 排期表/通讯录（规则引擎，见 §6.6）。

---

## 2. 范围

### 2.1 In Scope（MVP 必须交付）
- 本地账号认证（单管理员 + 多成员，无注册开放）
- 会议 CRUD、场次（session）编排：**场次直接关联会议与场地，无 track（日程线）概念**；编排全部在日历视图内完成（拖拽、点击编辑），不跳转其它页面
- 场地管理（**会议级资源**，非全局）、冲突检测（**场地/人员两个维度**，均仅警告不阻断保存，**检测范围限单会议**）
- 人员通讯录（**会议级资源**，非全局；单位为人员上的文本字段，不做单位实体管理）
- 材料上传/下载/与场次关联（不做 zip 打包）
- Excel 导入（单文件双 sheet：排期表 + 通讯录）：模板下载、排期表字段映射向导、预览入库、映射预设保存
- Excel/PDF 导出（日程表、人员名单）
- 场景模板：内置"党委会""年会论坛"两套（存 DB 表，首启种子数据），预填**场地与议程骨架**
- 日历视图（核心编排页）：场地为横向列、时间轴纵向；场地列可拖拽排序，场次卡片可拖拽移动、点击编辑
- 系统设置：数据备份（导出数据目录打包）、LLM 端点配置占位（仅配置存储，不实现调用）

### 2.2 Out of Scope（明确不做，agent 不得实现）
- track（多日程线）概念——已移除：场次直接关联场地，日历按场地分列；**不得重新引入 track**
- 跨会议冲突检测——场地与人员均为会议级资源，冲突只在本会议内判定
- 协同收集（收集表、免登录填写链接、提交审核）——本版聚焦个人组织者，列入后续版本
- 单位（组织）实体管理——人员仅保留"单位"文本字段
- 在线报名、售票、支付
- 邮件/短信/IM 通知发送（仅记录"通知状态"字段）
- 表决、投票、签到、纪要生成
- 多租户、SaaS 化、用户自注册
- 权限细粒度到字段级（MVP 仅 admin/member 两角色）
- 审计日志全量留痕（企业版功能；仅建表预留）
- LLM 实际调用（仅做配置存储与接口占位）
- 集群、高可用、PostgreSQL 支持
- 移动端原生 App（响应式 Web 即可）

---

## 3. 技术约束（强制）

| 项 | 决策 |
|---|---|
| 运行时 | Node.js 22 LTS |
| 后端框架 | Hono（运行于 Node，非 Bun） |
| 语言 | TypeScript 严格模式（`strict: true`） |
| 数据库 | SQLite（`better-sqlite3`，WAL 模式）+ Drizzle ORM |
| 前端 | React 18 + Vite + TypeScript + Tailwind CSS 4（自建轻量 UI 组件，不用 shadcn/ui） |
| 拖拽 | HTML5 原生 Drag & Drop（不引 dnd-kit） |
| 日历 | 自研排程日历组件（场地列 × 时间轴，不引 FullCalendar） |
| Excel | SheetJS（`xlsx` 包） |
| PDF | pdfkit（服务端生成；镜像内置 OFL 开源中文字体，离线可用） |
| 校验 | zod（前后端共享 schema，放 `packages/shared`）；可空文本字段（如 description/location）用 `.nullable().optional()` 对齐数据库可空列 |
| 单体仓库 | pnpm workspace：`apps/server`、`apps/web`、`packages/shared` |
| 部署 | **单服务单端口**：server 静态伺服 web 构建产物并提供 SPA fallback；单 Dockerfile（多阶段：构建 web → 拷贝至 server 静态目录 → node:22-alpine 运行）；`docker run -v ./data:/data` 一条命令可用 |
| 数据目录 | 环境变量 `DATA_DIR`（默认 `./data`）：SQLite 文件、上传材料、备份均存于此 |
| 端口 | 环境变量 `PORT`，默认 8080 |
| 离线约束 | 禁止任何运行时外网请求；前端字体用系统字体栈，不引 Google Fonts |
| 测试 | Vitest；冲突检测、Excel 解析、时间解析三个核心引擎必须有单测 |

---

## 4. 用户与角色

| 角色 | 说明 | 权限 |
|---|---|---|
| admin | 初始管理员，首次启动时通过 CLI/环境变量创建 | 全部 + 系统设置 + 用户管理 |
| member | 普通成员 | 会议/日程/人员/材料/导入的全部业务操作 |

---

## 5. 信息架构与页面清单

前端路由（React Router）：

| 路径 | 页面 | 说明 |
|---|---|---|
| `/login` | 登录 | 账号密码，会话 cookie（httpOnly） |
| `/` | 仪表盘 | 进行中/即将开始的会议卡片、快捷入口 |
| `/meetings` | 会议列表 | 状态筛选（草稿/已发布/进行中/已结束）、新建（可选模板） |
| `/meetings/:id` | 会议详情（**核心页**） | 概览（基本信息、统计、状态操作）+ 日历编排：**场地列 × 时间轴**，场次卡片拖拽改时间/换场地、点击场次编辑、场地列头拖拽排序、冲突高亮 |
| `/contacts` | 通讯录 | **会议级人员库**：页面顶部选会议，列表/检索/导入导出均按所选会议 |
| `/venues` | 场地管理 | **会议级场地**：页面顶部选会议，场地 CRUD 按所选会议 |
| `/settings` | 系统设置（admin） | 用户管理、备份导出、LLM 端点配置（占位）、关于 |

约束：**所有场次编排必须在会议详情的日历视图内完成**，不得为编排另设独立页面；材料管理、导入导出入口挂在会议详情页内。

---

## 6. 功能需求

### 6.1 认证
- 首次启动若无任何用户：优先读 `ADMIN_USERNAME`/`ADMIN_PASSWORD` 环境变量，未设置则随机生成密码打印到 CLI 日志；
- 登录：用户名+密码，bcrypt 哈希，httpOnly cookie 会话（SameSite=Lax；SQLite 存会话表，7 天过期）；
- 无注册接口；admin 在设置页创建 member。

### 6.2 会议管理
- 字段：名称、描述（可空）、起止日期、状态（draft/published/ongoing/finished）、地点说明（可空）；**无"场景类型"字段**——场景信息由所选模板隐含，仅模板表自身保留 scenarioType 作为展示标签；
- 状态流转：draft → published → ongoing → finished；全部手动切换，任意状态可互转；
- 新建会议可选择场景模板（党委会/年会论坛，存于 templates 表），模板预填**场地（日历列）与议程场次骨架**；
- 复制会议：复制**场地 + 场次骨架**（标题/类型/起止时间/简介/排序号/全体环节标记，场次指向副本场地），不含嘉宾、材料；新会议为 draft 状态，名称加"副本"前缀。

### 6.3 日程编排（核心，全部在日历视图内完成）
- session（场次）字段：**meetingId + venueId 直接关联**（无 trackId）、标题、类型（演讲/圆桌/茶歇/签到/其他）、起止时间、简介（可空）、排序号、全体环节标记（cross_tracks，跨全部场地横跨整行显示，仍关联一个场地并正常参与冲突检测）；
- 日历视图：**每个场地一列**（横向），时间轴纵向；多天会议用**一条连续时间轴**（不按天分页）；
- 场次卡片可拖拽改时间与换场地，**落定即即时保存**（move 接口），拖拽过程实时调冲突检测并高亮（冲突仅警告，不阻断保存）；
- **点击场次卡片打开编辑弹窗**（与拖拽互不干扰：拖拽结束不触发编辑，单击可靠触发编辑）；
- **场地列头可左右拖拽排序**，顺序持久化（sortOrder，reorder 接口）；列头提供场地编辑/删除与新增场地入口；
- 场次可关联嘉宾（session_speakers：人员 + 角色 host/speaker/panelist + 确认状态 pending/confirmed/declined）。

### 6.4 冲突检测引擎
- 规则（全部为**警告，不阻断任何保存**——用户可忽略，如领导中途离场去另一会场）：
  - **场地冲突（红）**：本会议内同一场地在同一时间段被多个场次占用；
  - **人员冲突（黄）**：本会议内同一人员在同一时间段被分配到多个场次；
- **检测范围限单会议**：场地与人员均为会议级资源，不做跨会议检测；
- 时间重叠判定：`startA < endB && startB < endA`；
- 引擎为独立模块 `packages/shared/conflict.ts`（纯函数，输入场次+人员分配，输出冲突列表），前后端共用；必须单测覆盖边界（首尾相接不算重叠、跨天场次、全体环节）。

### 6.5 人员
- participants 为**会议级资源**（挂 meetingId）：姓名、单位（文本字段，可空）、职务、电话、邮箱、备注；
- 各会议的通讯录相互独立：创建人员必须指定会议；列表/检索（keyword 匹配姓名/单位/职务/电话/邮箱）按会议过滤；
- 会议内的人员视图 = 本场会议涉及人员（通过场次嘉宾 + 手动添加）；meeting_participants.meeting_role 除预设 主办/嘉宾/汇报/列席 外，允许自定义任意文本标签。

### 6.6 场地
- venues 为**会议级资源**（挂 meetingId）：名称、容量、设备说明、备注、**sortOrder（日历列顺序）**；
- 各会议的场地相互独立：创建场地必须指定会议；列表按会议过滤，按 sortOrder 返回；
- 日历列拖拽排序调用 reorder 接口，按传入顺序整体重写 sortOrder；
- 删除场地：该会议中引用它的场次 venue_id 置空（解绑为"未指定"），不删场次。

### 6.7 Excel 导入（单文件双 sheet）
导入文件为**一个 xlsx，含两个 sheet**：`排期表`（→场次）与 `通讯录`（→人员；用户在通讯录 sheet 里完善人员联系方式）。**导入目标为某一个会议**（导入入口在会议详情内）。流程：

1. **模板下载**：提供标准模板 xlsx（双 sheet，表头固定）；
2. **上传解析**（SheetJS 分别读取两个 sheet）：
   - **排期表**走智能识别：自动探测表头行（前 10 行中命中同义词词典最多者）；处理合并单元格（向上填充）；
   - **通讯录**表头固定（姓名/单位/职务/电话/邮箱/备注），不做模糊识别；无法识别的列在预览中标灰跳过并提示；
3. **字段映射向导（仅排期表）**：
   - 同义词词典（内置，示例）：
     - 标题：`议题|议程|主题|标题|内容|事项`
     - 开始时间：`开始时间|开始|时间|日期时间`
     - 结束时间：`结束时间|结束`
     - 汇报人：`汇报人|主讲|演讲人|嘉宾|发言人|姓名`
     - 单位：`单位|公司|机构|组织`
     - 场地：`场地|会议室|地点|会场|厅`
   - 每列给出推荐目标字段 + 置信度（高/中/低），低置信度默认"不导入"，用户下拉修改；
   - 映射可保存为预设（import_presets），下次导入自动套用；
4. **预览入库**：双 sheet 分页签预览解析结果，解析失败单元格标红可就地编辑；确认后事务写入；
5. **落库规则（目标会议内）**：
   - 场次归属场地：按"场地"列匹配**该会议**已有场地，未命中则在该会议下新建同名场地；无场地列时 venue_id 置空；
   - 汇报人：按"姓名+单位（文本）"去重匹配**该会议**的 participants，未命中则在该会议下新建；
- parse 与 execute 之间**不落中间状态**：parse 返回完整解析网格，前端持有并编辑，execute 提交编辑后的网格；服务端对提交数据重新校验（时间单元格重新解析）后事务写入；
- 中文时间解析规则（`packages/shared/timeparse.ts`，纯函数+单测）：
  - `2026-08-22 14:00`、`2026/8/22 下午2点`、`8月22日 14:00-15:30`（结合会议起始日推年）、`第二天上午 9:00`（相对会议起始日）；
  - 无时区信息的时间一律按**服务器本地时区**转 UTC 存储；**必须带小时**，"8月22日下午"这类无小时表述按解析失败处理；
  - 解析失败返回 null，由预览层标红，不得抛错中断整批。

### 6.8 材料管理
- 上传至 `DATA_DIR/materials/<meetingId>/`，限制 100MB/文件，记录原名/大小/MIME/上传人/时间；
- 可关联到具体场次；列表按场次分组展示。

### 6.9 导出
- 日程表导出：xlsx（列 = 日期/开始/结束/场地/标题/类型/嘉宾）与 PDF（同内容）；
- 人员名单导出：xlsx（姓名/单位/职务/电话/邮箱/角色）与 PDF（同内容）；
- PDF 由服务端 pdfkit 生成，内置 OFL 开源中文字体文件，随镜像分发，离线可用。

### 6.10 系统设置
- 用户管理（admin）：创建/禁用 member，重置密码；
- 备份：一键打包 `DATA_DIR` 为 tar.gz 下载；
- LLM 端点配置（仅占位）：llm_endpoints 表 CRUD（provider/baseURL/apiKey 加密存储（AES-256-GCM，密钥来自环境变量 `SECRET_KEY`）/model/enabled），UI 注明"智能功能将在企业版提供"；
- 关于页：版本号、许可证（AGPLv3）、声明"数据存储于本地"。

---

## 7. 数据模型（Drizzle schema 依据）

```sql
users(id TEXT PK, username UNIQUE, password_hash, role TEXT 'admin|member', disabled INT, created_at)
auth_sessions(id TEXT PK, user_id FK, expires_at)
meetings(id TEXT PK, name, description, start_date, end_date, location, status, created_by FK, created_at, updated_at)  -- 无 scenario_type
venues(id TEXT PK, meeting_id FK CASCADE, name, capacity INT, equipment TEXT, note, sort_order INT)  -- 会议级资源；sort_order 为日历列顺序
sessions(id TEXT PK, meeting_id FK CASCADE, venue_id FK NULL ON DELETE SET NULL, title, type, start_time, end_time, description, sort_order, cross_tracks INT)  -- 直接挂会议+场地，无 track
participants(id TEXT PK, meeting_id FK CASCADE, name, org_name, title, phone, email, note)  -- 会议级资源；org_name 为单位文本字段，不做单位实体
session_speakers(id TEXT PK, session_id FK, participant_id FK, role TEXT, confirm_status TEXT)
meeting_participants(id TEXT PK, meeting_id FK, participant_id FK, meeting_role TEXT)  -- 手动添加的参会人；meeting_role 预设 主办/嘉宾/汇报/列席，可自定义文本
materials(id TEXT PK, meeting_id FK, session_id FK NULL, filename, stored_path, size INT, mime, uploaded_by FK, created_at)
import_presets(id TEXT PK, import_type TEXT, name, mapping_json TEXT, created_by FK, created_at)
templates(id TEXT PK, name, scenario_type, data_json TEXT, created_at)  -- 场景模板（党委会/年会论坛为首启种子数据）；scenario_type 仅存于模板
llm_endpoints(id TEXT PK, provider, base_url, api_key_enc, model, enabled INT, created_at)
audit_logs(id TEXT PK, user_id, action, target_type, target_id, detail_json, created_at)  -- MVP 仅建表
```

约定：ID 用 nanoid；时间统一 ISO 8601 字符串（UTC 存储，前端按本地时区显示）；删除会议级联删除 venues/sessions/session_speakers/meeting_participants/materials（材料文件一并清理）；删除场地将其场次 venue_id 置空。索引：sessions(meeting_id, start_time)、venues(meeting_id)、participants(meeting_id)、session_speakers(participant_id)。

---

## 8. API 规范（REST，Hono）

统一约定：前缀 `/api`；除 `/api/auth/login` 外均需会话；错误格式 `{ error: { code, message } }`；列表支持 `?page=&pageSize=`，响应含 `total` 总数；**会议级资源（场地/人员）的列表与创建接口必须携带 meetingId**。

```
POST   /api/auth/login            登录
POST   /api/auth/logout           登出
GET    /api/auth/me               当前用户

GET/POST        /api/meetings
GET/PATCH/DELETE /api/meetings/:id
POST   /api/meetings/:id/status   状态流转 {status}
POST   /api/meetings/:id/duplicate 复制会议（含场地与日程骨架）
GET    /api/meetings/:id/conflicts  冲突检测（实时计算，限本会议）

GET    /api/venues?meetingId=     场地列表（meetingId 必填，按 sort_order 返回）
POST   /api/venues                新建场地 {meetingId, name, capacity?, equipment?, note?}
POST   /api/venues/reorder        场地列拖拽排序 {venueIds}（按顺序重写 sort_order）
PATCH/DELETE     /api/venues/:id  删除时场次解绑为"未指定"

GET    /api/participants?meetingId=&keyword=&page=&pageSize=   人员列表（meetingId 必填）
POST   /api/participants          新建人员 {meetingId, name, ...}
PATCH/DELETE     /api/participants/:id

GET    /api/sessions?meetingId=   场次列表（按会议）
POST   /api/sessions              新建场次 {meetingId, venueId?, title, type, startTime, endTime, description?, speakers?}
PATCH/DELETE     /api/sessions/:id
POST   /api/sessions/:id/move     拖拽落点 {venueId, startTime, endTime}
GET/POST /api/sessions/:id/speakers   场次嘉宾
PATCH/DELETE /api/session-speakers/:id

GET    /api/templates             模板列表（建会可选）

POST   /api/import/parse          上传 xlsx，返回 sheet 列表、表头行、列、推荐映射（仅排期表）、置信度与完整解析网格（P4）
POST   /api/import/execute        提交确认映射 + 编辑后的完整网格（无服务端中间态），服务端重新校验后事务写入（P4）
GET/POST /api/import/presets      映射预设（仅排期表）（P4）
GET    /api/import/template       下载标准模板（双 sheet）（P4）

GET/POST        /api/meetings/:id/materials   （POST 为 multipart 上传）（P4）
GET    /api/materials/:id/download                       （P4）
DELETE /api/materials/:id                               （P4）

GET    /api/export/agenda.xlsx?meetingId=                （P4）
GET    /api/export/agenda.pdf?meetingId=                 （P4）
GET    /api/export/participants.xlsx?meetingId=           （P4）
GET    /api/export/participants.pdf?meetingId=            （P4）

GET/POST        /api/settings/users       （admin）（P5）
PATCH  /api/settings/users/:id                            （P5）
GET    /api/settings/backup               下载 tar.gz（admin）（P5）
GET/POST/PATCH/DELETE /api/settings/llm-endpoints （admin，占位）（P5）
```

---

## 9. 非功能需求

- **部署形态**：单服务单端口——后端同时伺服 API 与前端构建产物（SPA fallback 到 index.html），开发期 web 由 Vite dev server 代理；
- **性能**：单会议 500 场次、5000 人员规模下，日历页加载 < 1s（SQLite 索引见 §7）；
- **安全**：bcrypt 密码哈希；上传文件类型白名单（pdf/doc/docx/xls/xlsx/ppt/pptx/zip/png/jpg）；所有 SQL 走 Drizzle 参数化；CSP 禁外源；
- **可靠性**：所有多表写入用事务（场地排序、会议复制等）；导入执行失败整体回滚；
- **可维护**：ESLint + Prettier；核心引擎（conflict/timeparse/excel-mapping）放 `packages/shared` 纯函数实现，禁止依赖 UI 或 HTTP 框架。

---

## 10. 验收标准（DoD）

1. `docker build` 成功，`docker run -p 8080:8080 -v ./data:/data` 后：创建 admin → 登录 → 用"年会论坛"模板建会（自动预填场地与议程）→ 在日历中编排 3 个场地列 × 2 天日程（拖拽场次换场地/改时间、拖拽场地列头排序、点击场次编辑）→ 导入一份列名混乱的排期表 Excel（走映射向导，含通讯录 sheet）→ 上传材料并下载 → 导出日程 xlsx 与 PDF；全流程无报错；
2. 在同一会议内制造一个场地重叠与一个人员重叠，日历中分别显示红/黄标记，且均不阻断保存；
3. 两个会议各自维护独立的场地与通讯录（列表按会议隔离，互不可见）；
4. 断网（禁外网）环境下全部功能可用；
5. 冲突检测、时间解析、Excel 映射三个模块单测通过，覆盖率 ≥ 80%；
6. 备份下载的 tar.gz 解压后含 SQLite 文件与材料目录；
7. 数据目录拷到另一台机器挂载启动，数据完整可见（验证"备份即拷贝"）。

---

## 11. 里程碑拆分（建议 agent 按序执行）

| 阶段 | 内容 | 完成标志 |
|---|---|---|
| P1 | 仓库骨架、CI、认证、数据模型迁移、会议/场地/场次/人员 CRUD、基础布局 | 建会/建场地/建人员链路可走通（无导入） |
| P2 | 日历编排页（场地列×时间轴：场次拖拽、点击编辑、场地列拖拽排序）、冲突检测（场地/人员，单会议） | §10-2、§10-3 通过 |
| P3 | 会议级资源隔离完善（Venues/Contacts 页会议选择器、复制/模板挂场地）、会议人员管理 | 隔离与编排链路验收通过 |
| P4 | Excel 导入（双 sheet）、导出（xlsx+PDF）、材料管理 | §10-1 完整通过 |
| P5 | 设置页（用户/备份/LLM 占位）、Docker 与离线包、README | §10 全部通过 |

---

## 12. 开源治理（随 P1 落地）

- 根目录 `LICENSE`：AGPLv3 全文；`README.md` 中英双语，含功能截图占位、快速开始（docker 一条命令）、商业授权联系邮箱占位；
- `CONTRIBUTING.md`（含 CLA 说明占位）、`SECURITY.md`；
- CI（GitHub Actions）：lint + typecheck + 单测 + `license-checker` 禁 AGPL 不兼容依赖 + docker build；
- `.env.example`：PORT、DATA_DIR、SECRET_KEY、ADMIN_USERNAME、ADMIN_PASSWORD。

---

## 13. 变更记录

| 日期 | 变更 |
|---|---|
| 2026-08-22 | 移除会议"场景类型"字段（信息与模板重复，无业务消费；仅模板表保留） |
| 2026-08-22 | 移除 track 概念：场次直接关联 meetingId + venueId；日历以场地为列；"跨 track"改为"全体环节（跨场地）"；冲突检测去掉 track 维度 |
| 2026-08-22 | 场地/通讯录改为会议级资源（挂 meetingId，级联删除）；场地页/通讯录页增加会议选择器；场地增加 sortOrder 支持日历列拖拽排序 |
| 2026-08-22 | 冲突检测范围收敛到单会议（场地红/人员黄，不再跨会议）；日历支持点击场次编辑 |
| 2026-08-22 | 技术栈修正：拖拽用 HTML5 原生 Drag & Drop（非 dnd-kit）；日历为自研组件（非 FullCalendar）；UI 为自建轻量组件（非 shadcn/ui）；明确单服务单端口部署形态 |
