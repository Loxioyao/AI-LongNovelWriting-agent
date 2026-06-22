import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import db, {
  ProjectRepo, OutlineRepo, CharacterRepo, ChapterRepo,
  WorldBuildingRepo, ForeshadowRepo, TimelineRepo,
  WorkflowRepo, AIConfigRepo, AgentHistoryRepo
} from './db.js'
import { ConfigManager, encrypt, decrypt } from './crypto.js'
import { ContextBuilder } from './context.js'
import { WorkflowEngine, WorkflowState } from './workflow.js'
import { ZhipuProvider } from './providers/zhipu.js'
import { DeepSeekProvider } from './providers/deepseek.js'
import { OpenAIProvider } from './providers/openai.js'
import { ProviderError } from './providers/base.js'

const app = express()
const PORT = process.env.PORT || 3000

app.use(cors())
app.use(express.json({ limit: '10mb' }))

// ====== 初始化 ======
const providers = {
  zhipu: new ZhipuProvider(),
  deepseek: new DeepSeekProvider(),
  openai: new OpenAIProvider()
}

const configManager = new ConfigManager(db)
const contextBuilder = new ContextBuilder(db)

// AI角色配置
const AGENT_ROLES = [
  { id: 'outline-architect', name: '大纲架构师', icon: 'Document', color: '#6c5ce7', systemPrompt: '你是一位经验丰富的大纲架构师，擅长构建小说的整体框架。你需要根据用户的需求，设计出引人入胜的故事大纲，包括世界观设定、主线剧情、支线剧情、情节转折和高潮设计。输出结构化的大纲内容。' },
  { id: 'character-designer', name: '人物设计师', icon: 'User', color: '#67c23a', systemPrompt: '你是一位专业的人物设计师，擅长创造有深度的角色。你需要设计角色的外貌、性格、背景故事、成长轨迹、人际关系和能力设定。确保每个角色都有独特的辨识度和成长空间。' },
  { id: 'scene-writer', name: '场景描写师', icon: 'Picture', color: '#e6a23c', systemPrompt: '你是一位细腻的场景描写师，擅长营造氛围。你负责环境描写、感官细节、天气季节、建筑风格和空间布局，让读者身临其境。语言要优美且富有画面感。' },
  { id: 'dialogue-master', name: '对话大师', icon: 'ChatDotRound', color: '#f56c6c', systemPrompt: '你是一位对话大师，擅长写出有性格的对话。你负责人物对话、内心独白、语气词设计、潜台词和语言风格区分。对话要自然、有个性，能推动情节发展。' },
  { id: 'plot-weaver', name: '情节编织者', icon: 'Connection', color: '#909399', systemPrompt: '你是一位精于设计的情节编织者，擅长设计复杂的情节线和伏笔。你负责情节推进、冲突设计、悬念设置、伏笔埋设和情节照应。确保故事节奏紧凑且逻辑严密。' },
  { id: 'polish-editor', name: '润色编辑', icon: 'Edit', color: '#9c27b0', systemPrompt: '你是一位严谨的润色编辑，擅长提升文字质量。你负责文字润色、风格统一、修辞优化、错别字修正和节奏调整。保持作者原意的同时让文字更加流畅优美。' },
  { id: 'critic', name: '审阅评论家', icon: 'View', color: '#00bcd4', systemPrompt: '你是一位敏锐的审阅评论家，擅长发现作品中的问题。你需要从读者和评论家的角度审视作品，指出逻辑漏洞、人物不一致、节奏问题和可改进之处，给出具体建议。' },
  { id: 'thrill-designer', name: '爽点设计师', icon: 'Lightning', color: '#ff6b35', systemPrompt: '你是一位精通网文爽点设计的专家，擅长设计让读者兴奋、满足、期待的关键节点。你需要设计打脸、逆袭、装逼、震惊众人、获得机缘等爽感场景，确保每章至少有一个小爽点，每几章有一个大爽点。' },
  { id: 'rhythm-controller', name: '节奏把控师', icon: 'Timer', color: '#2ed573', systemPrompt: '你是一位专业的节奏把控师，擅长分析故事节奏的松紧和情绪起伏。你需要检查故事节奏是否合理：是否有过于拖沓的段落、是否缺少高潮、情绪曲线是否流畅、伏笔与回收是否均衡。' },
  { id: 'content-verifier', name: '内容审查员', icon: 'CircleCheck', color: '#ff9f43', systemPrompt: '你是一位严谨的内容审查员，负责验证小说内容的逻辑一致性和事实准确性。你需要检查：前后文是否有矛盾、人物行为是否符合设定、世界观设定是否自洽、时间线是否正确、因果关系是否成立。' }
]

const workflowEngine = new WorkflowEngine(db, providers, AGENT_ROLES)

// ====== 健康检查 ======
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    providers: Object.keys(providers),
    agents: AGENT_ROLES.length,
    dbPath: process.env.DB_PATH || './data/novel.db'
  })
})

// ====== AI角色配置 ======
app.get('/api/agents', (req, res) => {
  res.json({ agents: AGENT_ROLES })
})

// ====== AI配置管理 ======
app.get('/api/configs', (req, res) => {
  res.json({ configs: configManager.getAllConfigs() })
})

app.post('/api/configs/:provider', (req, res) => {
  const { provider } = req.params
  const { apiKey, model } = req.body
  if (!providers[provider]) return res.status(400).json({ error: '不支持的服务商' })

  if (apiKey) configManager.setApiKey(provider, apiKey)
  if (model) configManager.setModel(provider, model)
  res.json({ success: true })
})

app.delete('/api/configs/:provider', (req, res) => {
  configManager.deleteApiKey(req.params.provider)
  res.json({ success: true })
})

app.get('/api/models/:provider', (req, res) => {
  const p = providers[req.params.provider]
  if (!p) return res.status(400).json({ error: '不支持的服务商' })
  res.json({ models: p.getModels() })
})

// ====== 项目管理 ======
app.get('/api/projects', (req, res) => {
  res.json({ projects: ProjectRepo.getAll() })
})

app.post('/api/projects', (req, res) => {
  const project = ProjectRepo.create(req.body)
  res.json({ project })
})

app.get('/api/projects/:id', (req, res) => {
  const project = ProjectRepo.getById(req.params.id)
  if (!project) return res.status(404).json({ error: '项目不存在' })
  res.json({ project })
})

app.put('/api/projects/:id', (req, res) => {
  const project = ProjectRepo.update(req.params.id, req.body)
  res.json({ project })
})

app.delete('/api/projects/:id', (req, res) => {
  ProjectRepo.delete(req.params.id)
  res.json({ success: true })
})

// ====== 大纲管理 ======
app.get('/api/projects/:id/outline', (req, res) => {
  const outline = OutlineRepo.getActive(req.params.id)
  res.json({ outline })
})

app.get('/api/projects/:id/outlines', (req, res) => {
  res.json({ versions: OutlineRepo.getVersions(req.params.id) })
})

app.put('/api/projects/:id/outline', (req, res) => {
  const outline = OutlineRepo.save(req.params.id, req.body.content)
  res.json({ outline })
})

app.post('/api/outlines/:id/activate', (req, res) => {
  const outline = OutlineRepo.activate(req.params.id)
  res.json({ outline })
})

// ====== 世界观 ======
app.get('/api/projects/:id/world', (req, res) => {
  res.json({ worldBuilding: WorldBuildingRepo.get(req.params.id) })
})

app.put('/api/projects/:id/world', (req, res) => {
  WorldBuildingRepo.update(req.params.id, req.body)
  res.json({ success: true })
})

// ====== 角色管理 ======
app.get('/api/projects/:id/characters', (req, res) => {
  res.json({ characters: CharacterRepo.getAll(req.params.id) })
})

app.post('/api/projects/:id/characters', (req, res) => {
  const character = CharacterRepo.create(req.params.id, req.body)
  res.json({ character })
})

app.put('/api/characters/:id', (req, res) => {
  CharacterRepo.update(req.params.id, req.body)
  res.json({ success: true })
})

app.delete('/api/characters/:id', (req, res) => {
  CharacterRepo.delete(req.params.id)
  res.json({ success: true })
})

// ====== 章节管理 ======
app.get('/api/projects/:id/chapters', (req, res) => {
  res.json({ chapters: ChapterRepo.getAll(req.params.id) })
})

app.post('/api/projects/:id/chapters', (req, res) => {
  const chapter = ChapterRepo.create(req.params.id, req.body)
  res.json({ chapter })
})

app.put('/api/chapters/:id', (req, res) => {
  ChapterRepo.update(req.params.id, req.body)
  res.json({ success: true })
})

app.delete('/api/chapters/:id', (req, res) => {
  ChapterRepo.delete(req.params.id)
  res.json({ success: true })
})

app.put('/api/projects/:id/chapters/reorder', (req, res) => {
  ChapterRepo.reorder(req.params.id, req.body.chapterIds)
  res.json({ success: true })
})

// ====== 伏笔追踪 ======
app.get('/api/projects/:id/foreshadows', (req, res) => {
  res.json({ foreshadows: ForeshadowRepo.getAll(req.params.id) })
})

app.post('/api/projects/:id/foreshadows', (req, res) => {
  const fs = ForeshadowRepo.create(req.params.id, req.body)
  res.json({ foreshadow: fs })
})

app.post('/api/foreshadows/:id/resolve', (req, res) => {
  ForeshadowRepo.resolve(req.params.id, req.body.chapterId)
  res.json({ success: true })
})

app.delete('/api/foreshadows/:id', (req, res) => {
  ForeshadowRepo.delete(req.params.id)
  res.json({ success: true })
})

// ====== 时间线 ======
app.get('/api/projects/:id/timeline', (req, res) => {
  res.json({ timeline: TimelineRepo.getAll(req.params.id) })
})

app.post('/api/projects/:id/timeline', (req, res) => {
  const event = TimelineRepo.create(req.params.id, req.body)
  res.json({ event })
})

app.delete('/api/timeline/:id', (req, res) => {
  TimelineRepo.delete(req.params.id)
  res.json({ success: true })
})

// ====== AI对话（流式） ======
app.post('/api/chat', async (req, res) => {
  try {
    const { provider, model, messages, temperature, maxTokens, stream, apiKey, projectId, agentId } = req.body

    const p = providers[provider]
    if (!p) return res.status(400).json({ error: `不支持的服务商: ${provider}` })

    // 获取API Key
    let key = apiKey
    if (!key) key = configManager.getApiKey(provider)
    if (!key) return res.status(400).json({ error: '请先配置API Key' })

    // 如果有projectId，注入完整上下文
    let finalMessages = messages
    if (projectId) {
      const context = contextBuilder.build(projectId)
      const systemMsgs = contextBuilder.toSystemMessages(context)
      finalMessages = [...systemMsgs, ...messages]
    }

    if (stream) {
      res.setHeader('Content-Type', 'text/event-stream')
      res.setHeader('Cache-Control', 'no-cache')
      res.setHeader('Connection', 'keep-alive')


      try {
        const result = await p.chatStream({
          model,
          messages: finalMessages,
          temperature: temperature ?? 0.8,
          maxTokens: maxTokens ?? 4096,
          apiKey: key,
          onChunk: (chunk) => {
            res.write(`data: ${JSON.stringify(chunk)}\n\n`)
          }
        })

        // 保存对话历史
        if (projectId && agentId) {
          const agent = AGENT_ROLES.find(a => a.id === agentId)
          if (agent) {
            AgentHistoryRepo.create(projectId, {
              agentId, agentName: agent.name,
              prompt: messages.find(m => m.role === 'user')?.content || '',
              response: result.content
            })
          }
        }

        res.write(`data: ${JSON.stringify({ done: true, usage: result.usage })}\n\n`)
        res.end()
      } catch (error) {
        if (error instanceof ProviderError) {
          res.write(`data: ${JSON.stringify({ error: error.userMessage })}\n\n`)
        } else {
          res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`)
        }
        res.end()
      }
    } else {
      const result = await p.chat({
        model,
        messages: finalMessages,
        temperature: temperature ?? 0.8,
        maxTokens: maxTokens ?? 4096,
        apiKey: key
      })
      res.json(result)
    }
  } catch (error) {
    console.error('Chat API Error:', error)
    if (error instanceof ProviderError) {
      res.status(500).json({ error: error.userMessage })
    } else {
      res.status(500).json({ error: error.message })
    }
  }
})

// ====== 工作流API ======
app.post('/api/workflows/:projectId/init', (req, res) => {
  const wf = workflowEngine.initWorkflow(req.params.projectId, req.body)
  res.json({ workflow: wf })
})

app.get('/api/workflows/:projectId', (req, res) => {
  const wf = workflowEngine.getState(req.params.projectId)
  res.json({ workflow: wf })
})

app.post('/api/workflows/:projectId/execute', async (req, res) => {
  try {
    const { stepId, ...options } = req.body
    if (stepId) {
      // 执行指定步骤
      const result = await workflowEngine.executeStep(req.params.projectId, stepId, {
        ...options,
        onChunk: (chunk) => {
          // 流式输出
        }
      })
      res.json({ success: true, result })
    } else {
      // 执行下一步
      const result = await workflowEngine.executeNext(req.params.projectId, options)
      res.json({ success: true, result })
    }
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// 流式执行工作流步骤
app.post('/api/workflows/:projectId/execute-stream', async (req, res) => {
  try {
    const { stepId, ...options } = req.body

    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')

    const onChunk = (chunk) => {
      res.write(`data: ${JSON.stringify(chunk)}\n\n`)
    }

    try {
      const result = stepId
        ? await workflowEngine.executeStep(req.params.projectId, stepId, { ...options, onChunk })
        : await workflowEngine.executeNext(req.params.projectId, { ...options, onChunk })

      res.write(`data: ${JSON.stringify({ done: true, result: { content: result.content, needsConfirm: result.needsConfirm } })}\n\n`)
    } catch (error) {
      res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`)
    }
    res.end()
  } catch (error) {
    if (!res.headersSent) res.status(500).json({ error: error.message })
  }
})

// 章节生成（流式）
app.post('/api/workflows/:projectId/chapter-stream', async (req, res) => {
  try {
    const { chapterIndex, stepType, ...options } = req.body

    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')

    try {
      const result = await workflowEngine.executeChapterStep(
        req.params.projectId, chapterIndex, stepType,
        { ...options, onChunk: (chunk) => res.write(`data: ${JSON.stringify(chunk)}\n\n`) }
      )
      res.write(`data: ${JSON.stringify({ done: true, result: { content: result.content, chapter: result.chapter } })}\n\n`)
    } catch (error) {
      res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`)
    }
    res.end()
  } catch (error) {
    if (!res.headersSent) res.status(500).json({ error: error.message })
  }
})

// 工作流控制
app.post('/api/workflows/:projectId/pause', (req, res) => {
  workflowEngine.pause(req.params.projectId)
  res.json({ success: true })
})

app.post('/api/workflows/:projectId/resume', (req, res) => {
  workflowEngine.resume(req.params.projectId)
  res.json({ success: true })
})

app.post('/api/workflows/:projectId/cancel', (req, res) => {
  workflowEngine.cancel(req.params.projectId)
  res.json({ success: true })
})

app.post('/api/workflows/:projectId/rollback', (req, res) => {
  workflowEngine.rollback(req.params.projectId, req.body.stepIndex)
  res.json({ success: true })
})

app.post('/api/workflows/:projectId/confirm', (req, res) => {
  workflowEngine.confirm(req.params.projectId)
  res.json({ success: true })
})

app.post('/api/workflows/:projectId/retry', async (req, res) => {
  try {
    const result = await workflowEngine.retry(req.params.projectId, req.body)
    res.json({ success: true, result })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// 同步章节进度
app.post('/api/workflows/:projectId/sync-progress', (req, res) => {
  const { currentChapterIndex, phase } = req.body
  const wf = WorkflowRepo.getByProject(req.params.projectId)
  if (wf) {
    WorkflowRepo.update(wf.id, {
      currentChapterIndex,
      phase
    })
  }
  res.json({ success: true })
})

// 对话历史
app.get('/api/projects/:id/history', (req, res) => {
  res.json({ history: AgentHistoryRepo.getAll(req.params.id) })
})

app.delete('/api/projects/:id/history', (req, res) => {
  AgentHistoryRepo.clear(req.params.id)
  res.json({ success: true })
})

// ====== 启动服务器 ======
app.listen(PORT, () => {
  console.log(`✅ AI代理服务器已启动: http://localhost:${PORT}`)
  console.log(`📝 支持的AI服务商: ${Object.keys(providers).join(', ')}`)
  console.log(`🤖 AI角色数量: ${AGENT_ROLES.length}`)
  console.log(`💾 数据库: ${process.env.DB_PATH || './data/novel.db'}`)
})
