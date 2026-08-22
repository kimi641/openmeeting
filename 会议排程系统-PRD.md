# 会议设计排程系统 PRD（MVP / v0.1.0）

> 本文档是交付给 code agent 的开发依据。优先级：本文档 > 泛泛的"最佳实践"。凡本文档明确写出的决策（技术栈、范围、非目标），不得自行变更；本文档未覆盖的细节，按"简单、离线可用、零外部依赖"原则处理。

---

## 1. 产品概述

### 1.1 背景
大量组织（协会、企业、党政机关）仍用 Excel + Word + 邮件设计会议议程、收集参会信息。因数据保密要求无法使用云端 SaaS。本产品提供**可单机/内网部署**的开源会议管理工具。

### 1.2 MVP 目标
让一名会议组织者**不依赖任何外部服务**，完成一场中型闭门会议（30–100 人、跨 5–10 家单位、1–3 天、可多分会场）的全流程：会议设计 → 日程编排 → 跨单位信息收集 → 冲突检查 → 材料管理 → 导出交付。

### 1.3 核心差异化（必须体现）
1. **零依赖离线运行**：单容器启动，无外网请求（无 CDN 字体、无统计上报、无遥测）；
2. **Excel 一键迁移**：导入既有 Excel 排期表/通讯录（规则引擎，见 §6.7）；
3. **议程收集链接**：生成免登录填写链接，替代邮件来回收集。

---

## 2. 范围

### 2.1 In Scope（MVP 必须交付）
- 本地账号认证（单管理员 + 多成员，无注册开放）
- 会议 CRUD、多日程线（track）、场次（session）编排、拖拽排序
- 场地管理、时间冲突检测（场地硬冲突 + 人员软警告）
- 参与单位与人员通讯录、角色管理
- 协同收集：收集表创建、免登录填写链接、提交审核入库
- 材料上传/下载/与场次关联/会前打包下载（zip）
- Excel 导入（排期表、通讯录）：模板下载、字段映射向导、预览入库、映射预设保存
- Excel/CSV 导出（日程表、人员名单）
- 场景模板：内置"党委会""年会论坛"两套
- 日历视图（日/周/会议全程）
- 系统设置：数据备份（导出数据目录打包）、LLM 端点配置占位（仅配置存储，不实现调用）

### 2.2 Out of Scope（明确不做，agent 不得实现）
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
| 前端 | React 18 + Vite + TypeScript + Tailwind CSS + shadcn/ui |
| 拖拽 | dnd-kit |
| 日历 | FullCalendar React 版 |
| Excel | SheetJS（`xlsx` 包） |
| 校验 | zod（前后端共享 schema，放 `packages/shared`） |
| 单体仓库 | pnpm workspace：`apps/server`、`apps/web`、`packages/shared` |
| 部署 | 单 Dockerfile（多阶段：构建 web → 拷贝至 server 静态目录 → node:22-alpine 运行）；`docker run -v ./data:/data` 一条命令可用 |
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
| 外部填写人 | 无账号，持收集链接 token | 仅提交收集表 |

---

## 5. 信息架构与页面清单

前端路由（React Router）：

| 路径 | 页面 | 说明 |
|---|---|---|
| `/login` | 登录 | 账号密码，会话 cookie（httpOnly） |
| `/` | 仪表盘 | 进行中/即将开始的会议卡片、快捷入口 |
| `/meetings` | 会议列表 | 状态筛选（草稿/已发布/进行中/已结束）、新建（可选模板） |
| `/meetings/:id` | 会议详情-概览 | 基本信息、统计（场次/人员/材料数）、状态操作 |
| `/meetings/:id/agenda` | 会议详情-日程编排 | **核心页**：track 列 × 时间轴，场次卡片拖拽、冲突高亮 |
| `/meetings/:id/calendar` | 日历视图 | FullCalendar 展示全部场次 |
| `/meetings/:id/people` | 参会人员 | 按单位分组、角色标记、导入/导出 |
| `/meetings/:id/collect` | 协同收集 | 收集表列表、创建、链接复制、提交审核 |
| `/meetings/:id/materials` | 材料管理 | 上传、关联场次、打包下载 |
| `/contacts` | 通讯录 | 全局单位 + 人员库（会议人员从此选取或随导入创建） |
| `/venues` | 场地管理 | 场地 CRUD、可用时段 |
| `/settings` | 系统设置（admin） | 用户管理、备份导出、LLM 端点配置（占位）、关于 |

---

## 6. 功能需求

### 6.1 认证
- 首次启动若无任何用户，CLI 打印初始 admin 凭据（或读 `ADMIN_USERNAME`/`ADMIN_PASSWORD` 环境变量）；
- 登录：用户名+密码，bcrypt 哈希，httpOnly cookie 会话（SQLite 存会话表，7 天过期）；
- 无注册接口；admin 在设置页创建 member。

### 6.2 会议管理
- 字段：名称、描述、密级（公开/内部/秘密/机密，仅标记展示用）、场景类型（small/medium）、起止日期、状态（draft/published/ongoing/finished）、地点说明；
- 状态流转：draft → published → ongoing → finished，允许回退；published 后收集链接才对外可用；
- 新建会议可选择场景模板（党委会/年会论坛），模板预填 tracks 与议程项骨架。

### 6.3 日程编排（核心）
- 一个会议含多个 track（日程线/分会场），track 有名称与关联场地；
- session（场次）字段：trackId、标题、类型（演讲/圆桌/茶歇/签到/其他）、起止时间、简介、排序号；
- 编排页：每个 track 一列，时间轴纵向；场次卡片可拖拽改时间与换 track（dnd-kit），拖拽实时调冲突检测；
- 茶歇/签到等类型可选择"跨全部 track"展示；
- 场次可关联嘉宾（session_speakers：人员 + 角色 host/speaker/panelist + 确认状态 pending/confirmed/declined）。

### 6.4 冲突检测引擎
- 规则：
  - **硬冲突**：同一场地（track 关联场地）的场次会议时间段重叠 → 红色标记，保存时警告但允许强制保存；
  - **软警告**：同一人员在同一时间段被分配到两个场次（含跨会议）→ 黄色标记；
- 时间重叠判定：`startA < endB && startB < endA`；
- 引擎为独立模块 `packages/shared/conflict.ts`（纯函数，输入场次+人员分配，输出冲突列表），前后端共用；必须单测覆盖边界（首尾相接不算重叠、跨天场次）。

### 6.5 单位与人员
- organizations：名称、联系人、联系方式、备注；
- participants：姓名、单位ID（可空）、职务、电话、邮箱、备注；
- 会议内的人员视图 = 本场会议涉及人员（通过场次嘉宾 + 手动添加）。

### 6.6 协同收集
- collect_forms：会议ID、标题、说明、字段配置（JSON，支持 文本/多行文本/日期时间/单选/文件说明）、截止时间、token（nanoid 21 位）、状态（open/closed）；
- 对外页 `/collect/:token`：免登录，按字段配置渲染表单，提交存 collect_entries（状态 pending）；
- 审核：会议成员在收集页查看提交，可"采纳"——采纳时将提交内容转为场次/嘉宾草稿（字段映射在采纳弹窗内人工确认）；
- 会议非 published 状态时链接页显示"未开放"；表单 closed 或过期显示"已截止"。

### 6.7 Excel 导入（四层设计，规则引擎）
三类导入：排期表（→场次）、通讯录（→单位+人员）。流程：

1. **模板下载**：每类提供标准模板 xlsx（表头固定）；
2. **上传解析**：SheetJS 读首个 sheet；自动探测表头行（前 10 行中命中同义词词典最多者）；处理合并单元格（向上填充）；
3. **字段映射向导**：
   - 同义词词典（内置，示例）：
     - 标题：`议题|议程|主题|标题|内容|事项`
     - 开始时间：`开始时间|开始|时间|日期时间`
     - 结束时间：`结束时间|结束`
     - 汇报人：`汇报人|主讲|演讲人|嘉宾|发言人|姓名`
     - 单位：`单位|公司|机构|组织`
     - 场地：`场地|会议室|地点|会场|厅`
   - 每列给出推荐目标字段 + 置信度（高/中/低），低置信度默认"不导入"，用户下拉修改；
   - 映射可保存为预设（import_presets），下次同类型导入自动套用；
4. **预览入库**：表格预览解析结果，解析失败单元格标红可就地编辑；确认后事务写入；
- 中文时间解析规则（`packages/shared/timeparse.ts`，纯函数+单测）：
  - `2026-08-22 14:00`、`2026/8/22 下午2点`、`8月22日 14:00-15:30`（结合会议起始日推年）、`第二天上午 9:00`（相对会议日期）；
  - 解析失败返回 null，由预览层标红，不得抛错中断整批。

### 6.8 材料管理
- 上传至 `DATA_DIR/materials/<meetingId>/`，限制 100MB/文件，记录原名/大小/MIME/上传人/时间；
- 可关联到具体场次；列表按场次分组展示；
- "会前打包"：按 `会议名/场次序号_场次名/材料` 目录结构打 zip 下载。

### 6.9 导出
- 日程表导出 xlsx：列 = 日期/开始/结束/track/标题/类型/嘉宾/场地；
- 人员名单导出 xlsx：姓名/单位/职务/电话/邮箱/角色。

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
meetings(id TEXT PK, name, description, secrecy_level, scenario_type, start_date, end_date, location, status, created_by FK, created_at, updated_at)
tracks(id TEXT PK, meeting_id FK, name, venue_id FK NULL, sort_order)
venues(id TEXT PK, name, capacity INT, equipment TEXT, note)
sessions(id TEXT PK, track_id FK, title, type, start_time, end_time, description, sort_order, cross_tracks INT)
organizations(id TEXT PK, name, contact_person, contact_info, note)
participants(id TEXT PK, name, org_id FK NULL, title, phone, email, note)
session_speakers(id TEXT PK, session_id FK, participant_id FK, role TEXT, confirm_status TEXT)
meeting_participants(id TEXT PK, meeting_id FK, participant_id FK, meeting_role TEXT)  -- 手动添加的参会人
collect_forms(id TEXT PK, meeting_id FK, title, description, fields_json TEXT, deadline, token UNIQUE, status, created_at)
collect_entries(id TEXT PK, form_id FK, org_name, submitter_name, submitter_contact, payload_json TEXT, status TEXT 'pending|accepted|rejected', created_at)
materials(id TEXT PK, meeting_id FK, session_id FK NULL, filename, stored_path, size INT, mime, uploaded_by FK, created_at)
import_presets(id TEXT PK, import_type TEXT, name, mapping_json TEXT, created_by FK, created_at)
llm_endpoints(id TEXT PK, provider, base_url, api_key_enc, model, enabled INT, created_at)
audit_logs(id TEXT PK, user_id, action, target_type, target_id, detail_json, created_at)  -- MVP 仅建表
```

约定：ID 用 nanoid；时间统一 ISO 8601 字符串（UTC 存储，前端按本地时区显示）；删除会议级联删除 tracks/sessions/材料记录（文件一并清理）。

---

## 8. API 规范（REST，Hono）

统一约定：前缀 `/api`；除 `/api/auth/login` 与 `/api/collect/public/:token` 外均需会话；错误格式 `{ error: { code, message } }`；列表支持 `?page=&pageSize=`。

```
POST   /api/auth/login            登录
POST   /api/auth/logout           登出
GET    /api/auth/me               当前用户

GET/POST        /api/meetings
GET/PATCH/DELETE /api/meetings/:id
POST   /api/meetings/:id/status   状态流转 {status}
POST   /api/meetings/:id/duplicate 复制会议（含日程骨架）

GET/POST        /api/meetings/:id/tracks
PATCH/DELETE    /api/tracks/:id
GET/POST        /api/tracks/:id/sessions
PATCH/DELETE    /api/sessions/:id
POST   /api/sessions/:id/move     拖拽落点 {trackId, startTime, endTime, sortOrder}
GET    /api/meetings/:id/conflicts  冲突检测（实时计算）

GET/POST        /api/organizations
PATCH/DELETE    /api/organizations/:id
GET/POST        /api/participants
PATCH/DELETE    /api/participants/:id
POST   /api/sessions/:id/speakers   添加嘉宾
PATCH/DELETE /api/session-speakers/:id

GET/POST        /api/meetings/:id/collect-forms
PATCH/DELETE    /api/collect-forms/:id
GET    /api/collect/public/:token        免登录：表单定义+会议名
POST   /api/collect/public/:token/entries 免登录：提交
GET    /api/collect-forms/:id/entries
POST   /api/collect-entries/:id/accept   采纳（body 含映射后的场次/嘉宾数据）
POST   /api/collect-entries/:id/reject

GET/POST        /api/meetings/:id/materials   （POST 为 multipart 上传）
GET    /api/materials/:id/download
DELETE /api/materials/:id
GET    /api/meetings/:id/materials/archive    打包 zip

POST   /api/import/parse          上传 xlsx，返回探测结果（表头行、列、推荐映射、置信度）
POST   /api/import/execute        按确认映射执行导入（事务）
GET/POST /api/import/presets
GET    /api/import/templates/:type  下载标准模板

GET    /api/export/agenda.xlsx?meetingId=
GET    /api/export/participants.xlsx?meetingId=

GET/POST        /api/settings/users       （admin）
PATCH  /api/settings/users/:id
GET    /api/settings/backup               下载 tar.gz（admin）
GET/POST/PATCH/DELETE /api/settings/llm-endpoints （admin，占位）
```

---

## 9. 非功能需求

- **性能**：单会议 500 场次、5000 人员规模下，日程页加载 < 1s（SQLite 索引：sessions(track_id, start_time)、session_speakers(participant_id)）；
- **安全**：bcrypt 密码哈希；收集链接 token 不可枚举（nanoid 21）；上传文件类型白名单（pdf/doc/docx/xls/xlsx/ppt/pptx/zip/png/jpg）；所有 SQL 走 Drizzle 参数化；CSP 禁外源；
- **可靠性**：所有多表写入用事务；导入执行失败整体回滚；
- **可维护**：ESLint + Prettier；核心引擎（conflict/timeparse/excel-mapping）放 `packages/shared` 纯函数实现，禁止依赖 UI 或 HTTP 框架。

---

## 10. 验收标准（DoD）

1. `docker build` 成功，`docker run -p 8080:8080 -v ./data:/data` 后：创建 admin → 登录 → 用"年会论坛"模板建会 → 编排 3 个 track × 2 天日程（拖拽）→ 导入一份列名混乱的通讯录 Excel（走映射向导）→ 创建收集表并用无痕窗口提交 → 采纳为场次 → 上传材料并打包下载 → 导出日程 xlsx；全流程无报错；
2. 制造一个场地重叠与一个人员重叠，日程页分别显示红/黄标记；
3. 断网（禁外网）环境下全部功能可用；
4. 冲突检测、时间解析、Excel 映射三个模块单测通过，覆盖率 ≥ 80%；
5. 备份下载的 tar.gz 解压后含 SQLite 文件与材料目录；
6. 数据目录拷到另一台机器挂载启动，数据完整可见（验证"备份即拷贝"）。

---

## 11. 里程碑拆分（建议 agent 按序执行）

| 阶段 | 内容 | 完成标志 |
|---|---|---|
| P1 | 仓库骨架、CI、认证、数据模型迁移、会议/track/session CRUD、基础布局 | §10-1 的前三步可走通（无导入/收集） |
| P2 | 日程编排拖拽页、冲突检测、日历视图、场地 | §10-2 通过 |
| P3 | 单位/人员、协同收集全链路 | 收集链路验收通过 |
| P4 | Excel 导入四层、导出、材料管理 | §10-1 完整通过 |
| P5 | 场景模板、设置页（用户/备份/LLM 占位）、Docker 与离线包、README | §10 全部通过 |

---

## 12. 开源治理（随 P1 落地）

- 根目录 `LICENSE`：AGPLv3 全文；`README.md` 中英双语，含功能截图占位、快速开始（docker 一条命令）、商业授权联系邮箱占位；
- `CONTRIBUTING.md`（含 CLA 说明占位）、`SECURITY.md`；
- CI（GitHub Actions）：lint + typecheck + 单测 + `license-checker` 禁 AGPL 不兼容依赖 + docker build；
- `.env.example`：PORT、DATA_DIR、SECRET_KEY、ADMIN_USERNAME、ADMIN_PASSWORD。
