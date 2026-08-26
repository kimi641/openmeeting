# 会议排程系统（Meeting Scheduler）

开源、可单机部署的会议设计排程系统。**数据不出内网**——SQLite 内嵌、零外部依赖、无遥测上报，替代 Excel + Word + 邮件的传统排会方式。

## 核心特性

- **会议设计**：多日程线（track）× 场次（session）编排，支持跨日程线的全体环节（签到/茶歇）
- **冲突检测**：场地、时间、人员三维度实时检测，仅警告不阻断保存；场地与人员维度支持跨会议判定
- **场景模板**：内置「党委会」「年会论坛」两套模板，新建会议一键生成日程骨架
- **通讯录与场地**：参会人、场地独立管理，场次可关联多位嘉宾（主持/演讲/圆桌）及确认状态
- **单服务部署**：Node 22 + Hono 伺服内嵌前端构建产物，一个进程、一个端口、一个数据目录

## 技术栈

| 层 | 选型 |
|---|---|
| 后端 | Node 22 LTS + Hono + better-sqlite3 + Drizzle ORM |
| 前端 | React 18 + Vite + TypeScript + Tailwind CSS |
| 契约 | zod schema 前后端共享（packages/shared） |
| 工程 | pnpm workspace monorepo |

## 快速开始

环境要求：Node.js ≥ 22、pnpm ≥ 10（`corepack enable` 即可）。

```bash
# 安装依赖
pnpm install

# 开发模式（server:8080 + web:5173，Vite 代理 /api）
pnpm dev

# 全量测试与类型检查
pnpm test
pnpm typecheck

# 生产构建 + 单服务启动（http://localhost:8080）
pnpm build
pnpm --filter @meeting/server start
```

### 首次登录

首次启动若数据库无任何用户，会自动创建管理员 `admin`：密码取自 `ADMIN_PASSWORD` 环境变量，未设置则随机生成并打印到启动日志（仅显示一次）。配置项参见 [.env.example](.env.example)。

### 数据与备份

所有运行时数据（SQLite、上传材料）都在 `DATA_DIR`（默认 `./data`）目录内。**备份即拷贝，恢复即放回**。

## 目录结构

```
├── apps/
│   ├── server/        # Hono API + 静态资源伺服（better-sqlite3 + Drizzle）
│   └── web/           # React 前端
├── packages/
│   └── shared/        # zod schema、冲突检测引擎、中文时间解析
├── .env.example       # 环境变量样例
└── LICENSE            # AGPL-3.0
```

## 许可证

[AGPL-3.0-or-later](LICENSE)
