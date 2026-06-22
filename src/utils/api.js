import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' }
})

// 请求拦截器：添加错误处理
api.interceptors.response.use(
  response => response.data,
  error => {
    if (error.response) {
      const msg = error.response.data?.error || `请求失败 (${error.response.status})`
      throw new Error(msg)
    } else if (error.request) {
      throw new Error('网络错误：无法连接到服务器，请检查后端是否运行')
    } else {
      throw new Error(error.message || '请求失败')
    }
  }
)

// ====== 流式聊天 ======
export async function streamChat(messages, onChunk, options = {}) {
  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      provider: options.provider,
      model: options.model,
      messages,
      temperature: options.temperature,
      maxTokens: options.maxTokens,
      projectId: options.projectId,
      agentId: options.agentId,
      stream: true
    }),
    signal: options.signal
  })

  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: '请求失败' }))
    throw new Error(err.error || '请求失败')
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let fullContent = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop()

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        try {
          const data = JSON.parse(line.slice(6))
          if (data.error) throw new Error(data.error)
          if (data.done) return { content: fullContent, usage: data.usage }
          if (data.content) {
            fullContent += data.content
            onChunk?.(data.content, fullContent)
          }
        } catch (e) {
          if (e.message && !e.message.includes('JSON')) throw e
        }
      }
    }
  }
  return { content: fullContent, usage: null }
}

// ====== 工作流流式执行 ======
export async function streamWorkflowStep(projectId, stepId, onChunk, options = {}) {
  const { signal, ...bodyOptions } = options
  const response = await fetch(`/api/workflows/${projectId}/execute-stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ stepId, ...bodyOptions }),
    signal
  })

  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: '请求失败' }))
    throw new Error(err.error || '请求失败')
  }

  return _processSSEStream(response, onChunk)
}

export async function streamWorkflowChapter(projectId, chapterIndex, stepType, onChunk, options = {}) {
  const { signal, ...bodyOptions } = options
  const response = await fetch(`/api/workflows/${projectId}/chapter-stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chapterIndex, stepType, ...bodyOptions }),
    signal
  })

  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: '请求失败' }))
    throw new Error(err.error || '请求失败')
  }

  return _processSSEStream(response, onChunk)
}

async function _processSSEStream(response, onChunk) {
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let fullContent = ''
  let result = null

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop()

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        try {
          const data = JSON.parse(line.slice(6))
          if (data.error) throw new Error(data.error)
          if (data.done) {
            result = data.result
          } else if (data.content) {
            fullContent += data.content
            onChunk?.(data.content, fullContent)
          }
        } catch (e) {
          if (e.message && !e.message.includes('JSON')) throw e
        }
      }
    }
  }

  return { content: result?.content || fullContent, result }
}

// ====== AI角色消息构建 ======
export function buildAgentMessages(agentRole, userPrompt, context = {}) {
  const messages = [{ role: 'system', content: agentRole.systemPrompt }]

  if (context.projectTitle) {
    messages.push({
      role: 'system',
      content: `当前小说项目：《${context.projectTitle}》，类型：${context.genre || '未指定'}，风格：${context.style || '未指定'}`
    })
  }

  if (context.outline) {
    messages.push({ role: 'system', content: `已有大纲：\n${context.outline}` })
  }

  if (context.characters?.length > 0) {
    const charSummary = context.characters.map(c =>
      `- ${c.name}：${c.role || '角色'}，${c.personality || '性格未设定'}`
    ).join('\n')
    messages.push({ role: 'system', content: `已有角色：\n${charSummary}` })
  }

  if (context.previousChapters) {
    messages.push({ role: 'system', content: `前文内容摘要：\n${context.previousChapters}` })
  }

  messages.push({ role: 'user', content: userPrompt })
  return messages
}

// ====== 兼容旧版API（保持前端store逐步迁移） ======
export { api }

// 项目API
export const projectApi = {
  getAll: () => api.get('/projects'),
  get: (id) => api.get(`/projects/${id}`),
  create: (data) => api.post('/projects', data),
  update: (id, data) => api.put(`/projects/${id}`, data),
  delete: (id) => api.delete(`/projects/${id}`)
}

// 大纲API
export const outlineApi = {
  get: (projectId) => api.get(`/projects/${projectId}/outline`),
  save: (projectId, content) => api.put(`/projects/${projectId}/outline`, { content }),
  getVersions: (projectId) => api.get(`/projects/${projectId}/outlines`),
  activate: (outlineId) => api.post(`/outlines/${outlineId}/activate`)
}

// 角色API
export const characterApi = {
  getAll: (projectId) => api.get(`/projects/${projectId}/characters`),
  create: (projectId, data) => api.post(`/projects/${projectId}/characters`, data),
  update: (id, data) => api.put(`/characters/${id}`, data),
  delete: (id) => api.delete(`/characters/${id}`)
}

// 章节API
export const chapterApi = {
  getAll: (projectId) => api.get(`/projects/${projectId}/chapters`),
  create: (projectId, data) => api.post(`/projects/${projectId}/chapters`, data),
  update: (id, data) => api.put(`/chapters/${id}`, data),
  delete: (id) => api.delete(`/chapters/${id}`),
  reorder: (projectId, ids) => api.put(`/projects/${projectId}/chapters/reorder`, { chapterIds: ids })
}

// 世界观API
export const worldApi = {
  get: (projectId) => api.get(`/projects/${projectId}/world`),
  update: (projectId, data) => api.put(`/projects/${projectId}/world`, data)
}

// 伏笔API
export const foreshadowApi = {
  getAll: (projectId) => api.get(`/projects/${projectId}/foreshadows`),
  create: (projectId, data) => api.post(`/projects/${projectId}/foreshadows`, data),
  resolve: (id, chapterId) => api.post(`/foreshadows/${id}/resolve`, { chapterId }),
  delete: (id) => api.delete(`/foreshadows/${id}`)
}

// 时间线API
export const timelineApi = {
  getAll: (projectId) => api.get(`/projects/${projectId}/timeline`),
  create: (projectId, data) => api.post(`/projects/${projectId}/timeline`, data),
  delete: (id) => api.delete(`/timeline/${id}`)
}

// AI配置API
export const configApi = {
  getAll: () => api.get('/configs'),
  set: (provider, { apiKey, model }) => api.post(`/configs/${provider}`, { apiKey, model }),
  delete: (provider) => api.delete(`/configs/${provider}`),
  models: (provider) => api.get(`/models/${provider}`),
  agents: () => api.get('/agents')
}

// 工作流API
export const workflowApi = {
  init: (projectId, options) => api.post(`/workflows/${projectId}/init`, options),
  get: (projectId) => api.get(`/workflows/${projectId}`),
  execute: (projectId, data) => api.post(`/workflows/${projectId}/execute`, data),
  pause: (projectId) => api.post(`/workflows/${projectId}/pause`),
  resume: (projectId) => api.post(`/workflows/${projectId}/resume`),
  cancel: (projectId) => api.post(`/workflows/${projectId}/cancel`),
  rollback: (projectId, stepIndex) => api.post(`/workflows/${projectId}/rollback`, { stepIndex }),
  confirm: (projectId) => api.post(`/workflows/${projectId}/confirm`),
  retry: (projectId, options) => api.post(`/workflows/${projectId}/retry`, options)
}

// 历史API
export const historyApi = {
  getAll: (projectId) => api.get(`/projects/${projectId}/history`),
  clear: (projectId) => api.delete(`/projects/${projectId}/history`)
}
