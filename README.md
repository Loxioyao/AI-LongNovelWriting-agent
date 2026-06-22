# AI Novel Writer - 多AI协作小说创作平台

> 基于 Vue 3 + Express + SQLite 的多模型协作长篇小说生成系统，支持智谱清言、DeepSeek、OpenAI 三大服务商切换，内置 10 个 AI 角色协作工作流。

## 技术架构

```
┌─────────────────────────────────────────────────────┐
│                    Frontend (Vue 3)                   │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ │
│  │ 项目管理  │ │ 大纲编辑  │ │ 角色卡片  │ │ 章节写作  │ │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘ │
│  ┌──────────┐ ┌──────────┐ ┌──────────────────────┐ │
│  │ 长篇工作流│ │ 设置中心  │ │ Pinia Store (异步)   │ │
│  └──────────┘ └──────────┘ └──────────────────────┘ │
│                 SSE Streaming + AbortController       │
└──────────────────────┬──────────────────────────────┘
                       │ REST API + SSE
┌──────────────────────┴──────────────────────────────┐
│                   Backend (Express)                    │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ │
│  │ REST API  │ │ SSE流式  │ │ 工作流引擎│ │ 上下文构建│ │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘ │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ │
│  │ Provider │ │ AES-256  │ │ SQLite   │ │ 重试退避  │ │
│  │ 抽象层    │ │ 密钥加密  │ │ 数据层   │ │ 策略     │ │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘ │
└─────────────────────────────────────────────────────┘
```

## 核心特性

### 1. 数据持久化 (SQLite + Repository Pattern)

所有项目数据存储在服务端 SQLite 数据库中，前端不再依赖 localStorage。

**数据表**: projects, world_buildings, outlines (版本化), characters, chapters, foreshadows, timeline_events, workflows, workflow_results, workflow_chapter_results, workflow_logs, ai_configs, agent_history

**核心文件**: `server/db.js`

**简历亮点**: 实现基于 Repository 模式的数据访问层，支持大纲版本管理、伏笔追踪、时间线一致性检查。

### 2. API Key 安全 (AES-256-GCM 加密)

API Key 不再存储在浏览器 localStorage 中，而是通过 AES-256-GCM 加密后存储在服务端数据库，密钥派生自环境变量。

**优先级**: 环境变量 > 数据库加密存储

**核心文件**: `server/crypto.js`

**简历亮点**: 实现多模型 API Key 的服务端加密管理，使用 AES-256-GCM 算法，密钥派生自环境变量，避免敏感信息暴露到前端。

### 3. AI 工作流编排 (State Machine)

完整的创作工作流状态机，支持暂停、恢复、取消、回滚、重试、手动确认。

**状态流转**: idle → planning → reviewing → writing → done (含 paused/error)

**工作流步骤**: 写大纲 → 设计任务 → 设计情节 → 写细纲 → 设计爽点 → 检查节奏 → 审查N轮（每轮：节奏检查→审查→修改）→ 逐章生成（写正文→检查内容→增加事实）

**核心文件**: `server/workflow.js`

**简历亮点**: 设计并实现 AI 创作工作流状态机，支持多轮审查循环、暂停/恢复/回滚/重试，配合 AbortController 实现可取消的流式生成。

### 4. 多模型 Provider 抽象 (OpenAI-Compatible)

统一的 BaseAIProvider 基类，所有服务商只需设置 baseUrl 和模型列表即可接入。内置指数退避重试、超时控制、SSE 流式解析。

**支持的模型**:
- 智谱清言: GLM-4-Plus, GLM-4, GLM-4-Flash, GLM-4-Air
- DeepSeek: DeepSeek-V4-Pro, DeepSeek-V4-Flash, DeepSeek-R1
- OpenAI: GPT-4o, GPT-4o-mini, GPT-4-Turbo, GPT-3.5-Turbo

**核心文件**: `server/providers/base.js`, `server/providers/zhipu.js`, `server/providers/deepseek.js`, `server/providers/openai.js`

**简历亮点**: 设计 OpenAI 兼容的 Provider 抽象层，通过继承基类实现多模型快速接入，内置指数退避重试策略和 ProviderError 错误分类。

### 5. 长篇上下文管理

ContextBuilder 自动组装世界观、角色卡、大纲、章节摘要、伏笔、时间线等上下文，确保 AI 在长篇创作中保持一致性。

**一致性检查**: 自动检测伏笔回收、时间线冲突。

**核心文件**: `server/context.js`

**简历亮点**: 实现长篇小说上下文管理系统，自动组装世界观/角色/伏笔/时间线，支持一致性检查和伏笔追踪。

### 6. 错误处理与流式体验

- **指数退避重试**: 429 限流和 5xx 服务器错误自动重试
- **AbortController 取消**: 前端可随时取消正在进行的 AI 生成
- **SSE 流式输出**: 实时显示 AI 生成内容
- **错误分类**: ProviderError 区分认证错误、限流错误、服务器错误，提供用户友好提示

### 7. 十个 AI 角色协作

| 角色 | 职责 |
|------|------|
| 大纲架构师 | 构建故事整体框架 |
| 人物设计师 | 创建有深度的角色 |
| 场景描写师 | 营造氛围和画面感 |
| 对话大师 | 写出有性格的对话 |
| 情节编织者 | 设计情节线和伏笔 |
| 润色编辑 | 提升文字质量 |
| 审阅评论家 | 发现作品问题 |
| 爽点设计师 | 设计网文爽感节点 |
| 节奏把控师 | 分析故事节奏 |
| 内容审查员 | 验证逻辑一致性 |

## 快速开始

### 环境要求

- Node.js >= 18
- npm >= 9

### 安装

```bash
cd "H:/vibecoding/AI writing"
npm install
```

### 配置

复制环境变量模板并填入你的 API Key：

```bash
cp .env.example .env
```

编辑 `.env` 文件：

```env
# 至少配置一个服务商的 API Key
ZHIPU_API_KEY=your_zhipu_key
DEEPSEEK_API_KEY=your_deepseek_key
OPENAI_API_KEY=your_openai_key

# 加密密钥（用于数据库中 API Key 的加密存储）
ENCRYPTION_KEY=your_random_32_char_string

# 服务端口
PORT=3000
```

> 也可以不配置 `.env`，启动后在设置页面通过界面输入 API Key（会加密存储到数据库）。

### 启动

```bash
npm run dev
```

前端运行在 `http://localhost:5173`，后端运行在 `http://localhost:3000`。

### 构建

```bash
npm run build
```

## 项目结构

```
AI writing/
├── server/                    # 后端
│   ├── index.js               # Express 服务器 + REST API
│   ├── db.js                  # SQLite 数据层 + Repository
│   ├── crypto.js              # AES-256-GCM 加密 + ConfigManager
│   ├── context.js             # 长篇上下文构建器
│   ├── workflow.js            # 工作流状态机引擎
│   └── providers/             # AI 服务商抽象层
│       ├── base.js            # BaseAIProvider 基类
│       ├── zhipu.js           # 智谱清言
│       ├── deepseek.js        # DeepSeek
│       └── openai.js          # OpenAI
├── src/                       # 前端
│   ├── views/                 # 页面组件
│   │   ├── HomeView.vue
│   │   ├── WorkspaceView.vue
│   │   ├── OutlineView.vue
│   │   ├── CharactersView.vue
│   │   ├── ChaptersView.vue
│   │   ├── LongFormView.vue   # 长篇工作流可视化
│   │   ├── AgentsView.vue
│   │   ├── OverviewView.vue
│   │   └── SettingsView.vue
│   ├── stores/                # Pinia 状态管理
│   │   ├── project.js         # 项目数据 (异步 API 调用)
│   │   ├── settings.js        # 设置 (服务端密钥管理)
│   │   └── longform.js        # 工作流状态
│   ├── utils/
│   │   └── api.js             # API 客户端 + SSE 流式
│   ├── router/
│   │   └── index.js
│   ├── App.vue
│   └── main.js
├── tests/                     # 测试
├── .env.example
├── .gitignore
├── package.json
└── vite.config.js
```

## REST API 概览

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/health | 健康检查 |
| GET | /api/agents | 获取 AI 角色列表 |
| GET | /api/configs | 获取所有服务商配置 |
| POST | /api/configs/:provider | 设置 API Key/模型（加密存储） |
| DELETE | /api/configs/:provider | 删除 API Key |
| GET | /api/models/:provider | 获取可用模型列表 |
| GET/POST | /api/projects | 项目 CRUD |
| GET/PUT/DELETE | /api/projects/:id | 单个项目操作 |
| GET/PUT | /api/projects/:id/outline | 大纲管理 |
| POST | /api/outlines/:id/activate | 激活大纲版本 |
| GET/POST | /api/projects/:id/characters | 角色管理 |
| GET/POST | /api/projects/:id/chapters | 章节管理 |
| PUT | /api/projects/:id/chapters/reorder | 章节排序 |
| GET/PUT | /api/projects/:id/world | 世界观管理 |
| GET/POST | /api/projects/:id/foreshadows | 伏笔管理 |
| POST | /api/foreshadows/:id/resolve | 标记伏笔回收 |
| GET/POST | /api/projects/:id/timeline | 时间线管理 |
| POST | /api/chat | AI 聊天（支持 SSE 流式） |
| POST | /api/workflows/:projectId/init | 初始化工作流 |
| GET | /api/workflows/:projectId | 获取工作流状态 |
| POST | /api/workflows/:projectId/execute-stream | 流式执行步骤 |
| POST | /api/workflows/:projectId/chapter-stream | 流式执行章节生成 |
| POST | /api/workflows/:projectId/pause | 暂停 |
| POST | /api/workflows/:projectId/resume | 恢复 |
| POST | /api/workflows/:projectId/cancel | 取消 |
| POST | /api/workflows/:projectId/rollback | 回滚 |
| POST | /api/workflows/:projectId/confirm | 手动确认 |
| POST | /api/workflows/:projectId/retry | 重试 |

## 技术栈

| 层面 | 技术 |
|------|------|
| 前端框架 | Vue 3 + Vite |
| UI 组件库 | Element Plus |
| 状态管理 | Pinia |
| 路由 | Vue Router 4 |
| HTTP 客户端 | Axios + Fetch (SSE) |
| Markdown 渲染 | marked + DOMPurify |
| 后端框架 | Express 4 |
| 数据库 | SQLite (better-sqlite3) |
| 加密 | AES-256-GCM (Node.js crypto) |
| 环境变量 | dotenv |
| 测试 | Node.js built-in test runner |

## License

MIT
