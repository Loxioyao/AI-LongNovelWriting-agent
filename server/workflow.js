/**
 * WorkflowEngine - AI协作工作流状态机
 *
 * 核心设计：
 * - 状态机模式管理多步骤创作流程
 * - 支持暂停/恢复/重试/回退
 * - 人工确认门（每步可设需要确认）
 * - 完整步骤日志
 * - 上下文在步骤间自动传递
 *
 * 状态转换：
 * idle → planning → reviewing → writing → done
 *                ↑                |
 *                └── review loop ┘
 */

import { WorkflowRepo } from './db.js'
import { ContextBuilder } from './context.js'
import { decrypt } from './crypto.js'

// 工作流状态
export const WorkflowState = {
  IDLE: 'idle',
  PLANNING: 'planning',
  REVIEWING: 'reviewing',
  WRITING: 'writing',
  PAUSED: 'paused',
  DONE: 'done',
  ERROR: 'error'
}

// 步骤状态
export const StepState = {
  PENDING: 'pending',
  RUNNING: 'running',
  COMPLETED: 'completed',
  SKIPPED: 'skipped',
  FAILED: 'failed',
  WAITING_CONFIRM: 'waiting_confirm'
}

// 步骤定义模板
const STEP_DEFINITIONS = [
  {
    id: 'outline', name: '写大纲', desc: 'AI生成故事整体大纲',
    agentId: 'outline-architect', phase: WorkflowState.PLANNING,
    requiresConfirm: false
  },
  {
    id: 'tasks', name: '设计任务', desc: '将大纲分解为创作任务',
    agentId: 'plot-weaver', phase: WorkflowState.PLANNING,
    requiresConfirm: false
  },
  {
    id: 'plot', name: '设计情节', desc: '详细设计核心情节线',
    agentId: 'plot-weaver', phase: WorkflowState.PLANNING,
    requiresConfirm: false
  },
  {
    id: 'detail-outline', name: '写细纲', desc: '分章节详细大纲',
    agentId: 'outline-architect', phase: WorkflowState.PLANNING,
    requiresConfirm: false
  },
  {
    id: 'thrills', name: '设计爽点', desc: '为每章设计爽感节点',
    agentId: 'thrill-designer', phase: WorkflowState.PLANNING,
    requiresConfirm: false
  },
  {
    id: 'rhythm-check', name: '检查节奏', desc: '审查故事节奏是否合理',
    agentId: 'rhythm-controller', phase: WorkflowState.REVIEWING,
    requiresConfirm: false
  },
  {
    id: 'review', name: '审查', desc: '全面审查大纲和细纲',
    agentId: 'critic', phase: WorkflowState.REVIEWING,
    requiresConfirm: false
  },
  {
    id: 'revise', name: '重新审核大纲', desc: '根据审查意见修改',
    agentId: 'outline-architect', phase: WorkflowState.REVIEWING,
    requiresConfirm: true // 修改后需要人工确认
  }
]

export class WorkflowEngine {
  constructor(db, providers, agentRoles) {
    this.db = db
    this.providers = providers // { zhipu, deepseek, openai }
    this.agentRoles = agentRoles
    this.contextBuilder = new ContextBuilder(db)
    this.activeControllers = new Map() // workflowId -> AbortController
  }

  /**
   * 获取完整步骤列表（含多轮审查）
   */
  getFullSteps(maxReviewRounds = 2) {
    const steps = [...STEP_DEFINITIONS]
    for (let i = 1; i < maxReviewRounds; i++) {
      const round = i + 1
      steps.push(
        { ...STEP_DEFINITIONS[5], id: `rhythm-check-${round}`, name: `检查节奏(第${round}轮)`, requiresConfirm: false },
        { ...STEP_DEFINITIONS[6], id: `review-${round}`, name: `审查第${round}轮`, requiresConfirm: false },
        { ...STEP_DEFINITIONS[7], id: `revise-${round}`, name: `重新审核(第${round}轮)`, requiresConfirm: true }
      )
    }
    return steps
  }

  /**
   * 初始化工作流
   */
  initWorkflow(projectId, options = {}) {
    const maxReviewRounds = options.maxReviewRounds || 2
    let wf = WorkflowRepo.getByProject(projectId)

    if (!wf || options.reset) {
      if (wf) {
        WorkflowRepo.clearResults(wf.id)
        WorkflowRepo.update(wf.id, {
          state: WorkflowState.IDLE,
          currentStep: 0,
          currentChapterIndex: 0,
          reviewRound: 0,
          maxReviewRounds,
          phase: WorkflowState.IDLE,
          autoMode: 0
        })
      } else {
        wf = WorkflowRepo.create(projectId, maxReviewRounds)
      }
    }

    return wf
  }

  /**
   * 获取工作流状态
   */
  getState(projectId) {
    return WorkflowRepo.getByProject(projectId)
  }

  /**
   * 构建步骤的prompt
   */
  buildStepPrompt(stepId, context, round = 1) {
    const prompts = {
      outline: `请为以下小说生成详细的故事大纲：
小说标题：${context.projectTitle || '未命名'}
小说类型：${context.genre || '未指定'}
写作风格：${context.style || '未指定'}
${context.summary ? `已有简介：${context.summary}` : ''}

请生成包含以下内容的大纲：
1. 故事背景与世界观概述
2. 主线剧情（起承转合）
3. 核心冲突设计
4. 关键转折点和高潮
5. 主要伏笔和照应
请用Markdown格式输出。`,

      tasks: `基于以下大纲，将创作任务分解为具体工作项：

故事大纲：
${context.outline || '无'}

请分解为：1.世界观构建任务 2.角色发展任务 3.情节推进任务 4.伏笔埋设任务 5.高潮设计任务
每类列出具体待办事项。`,

      plot: `基于以下大纲和任务，设计详细的核心情节线：

大纲：${context.outline || '无'}

请设计：1.主线情节推进路线 2.关键情节点详细描述 3.情节因果关联 4.冲突升级路径 5.情感高潮设计`,

      'detail-outline': `基于以下内容，编写分章详细细纲：

大纲：${context.outline || '无'}

请为每章编写细纲，包含：章节标题、主要事件、出场人物、爽点位置、伏笔/回收、与前后章衔接。
请规划10-20章。`,

      thrills: `基于以下细纲，为每章设计具体的爽点：

${context.outline || '无'}

请为每章设计：1.核心爽点 2.具体表现方式 3.配角反应 4.爽点与主线关联 5.读者预期情感曲线`,

      'rhythm-check': `请检查以下内容的节奏是否合理：

大纲：${context.outline || '无'}
${round > 1 && context[`reviewRound${round - 1}`] ? `上轮审查意见：${context[`reviewRound${round - 1}`]}` : ''}

请分析：1.整体节奏曲线 2.拖沓或仓促段落 3.高潮分布 4.情绪起伏 5.具体调整建议`,

      review: `请对以下小说规划进行全面审查（第${round}轮）：

大纲：${context.outline || '无'}
${round > 1 && context[`reviewRound${round - 1}`] ? `上轮审查：${context[`reviewRound${round - 1}`]}` : ''}

请审查：1.逻辑自洽 2.人物动机 3.情节硬伤 4.伏笔合理性 5.老套桥段 6.修改建议`,

      revise: `根据审查意见，修改并完善大纲：

原始大纲：${context.outline || '无'}
审查意见：${context[`reviewRound${round}`] || '无'}

请输出修改后的完整大纲，标注修改之处。`
    }

    if (stepId.startsWith('rhythm-check')) return prompts['rhythm-check']
    if (stepId.startsWith('review-')) return prompts.review
    if (stepId.startsWith('revise-')) return prompts.revise
    return prompts[stepId] || `请执行步骤：${stepId}`
  }

  /**
   * 执行单个步骤
   */
  async executeStep(projectId, stepId, options = {}) {
    const wf = this.getState(projectId)
    if (!wf) throw new Error('工作流未初始化')

    const steps = this.getFullSteps(wf.maxReviewRounds || 2)
    const step = steps.find(s => s.id === stepId)
    if (!step) throw new Error(`未知步骤: ${stepId}`)

    const agent = this.agentRoles.find(a => a.id === step.agentId)
    if (!agent) throw new Error(`AI角色未找到: ${step.agentId}`)

    // 获取provider和apiKey
    const { provider, apiKey, model } = this.getProviderConfig(options)

    // 构建上下文
    const context = this.contextBuilder.build(projectId)
    const round = parseInt(stepId.split('-').pop()) || 1

    // 合并工作流前序结果到上下文
    Object.assign(context, this.collectWorkflowResults(wf))

    const prompt = this.buildStepPrompt(stepId, context, round)

    // 构建AI消息
    const systemMessages = this.contextBuilder.toSystemMessages(context)
    const messages = [
      { role: 'system', content: agent.systemPrompt },
      ...systemMessages,
      { role: 'user', content: prompt }
    ]

    // 创建AbortController支持取消
    const controller = new AbortController()
    this.activeControllers.set(wf.id, controller)

    WorkflowRepo.addLog(wf.id, step.name, `开始执行: ${step.desc}`, 'info')
    WorkflowRepo.update(wf.id, { state: step.phase, phase: step.phase })

    try {
      const p = this.providers[provider]
      const result = await p.chatStream({
        model,
        messages,
        apiKey,
        signal: controller.signal,
        onChunk: options.onChunk
      })

      // 保存结果
      WorkflowRepo.setResult(wf.id, stepId, result.content)

      // 大纲步骤同步到项目
      if (stepId === 'outline' || stepId.startsWith('revise')) {
        this.db.prepare('UPDATE outlines SET is_active = 0 WHERE project_id = ?').run(projectId)
        const outlineId = `outline-${Date.now()}`
        const version = (this.db.prepare('SELECT MAX(version) as v FROM outlines WHERE project_id = ?').get(projectId)?.v || 0) + 1
        this.db.prepare('INSERT INTO outlines (id, project_id, content, version, is_active, created_at) VALUES (?, ?, ?, ?, 1, ?)').run(outlineId, projectId, result.content, version, new Date().toISOString())
      }

      WorkflowRepo.addLog(wf.id, step.name, `完成，生成${result.content.length}字`, 'success')

      // 如果需要人工确认，设置等待状态
      if (step.requiresConfirm) {
        WorkflowRepo.update(wf.id, { state: WorkflowState.PAUSED })
        WorkflowRepo.addLog(wf.id, step.name, '等待人工确认后继续', 'info')
      }

      return { content: result.content, step, needsConfirm: step.requiresConfirm }
    } catch (error) {
      if (error.name === 'AbortError') {
        WorkflowRepo.addLog(wf.id, step.name, '用户取消生成', 'warning')
        WorkflowRepo.update(wf.id, { state: WorkflowState.PAUSED })
        throw new Error('生成已取消')
      }
      WorkflowRepo.addLog(wf.id, step.name, `错误: ${error.message}`, 'error')
      WorkflowRepo.update(wf.id, { state: WorkflowState.ERROR })
      throw error
    } finally {
      this.activeControllers.delete(wf.id)
    }
  }

  /**
   * 执行下一步（自动推进）
   */
  async executeNext(projectId, options = {}) {
    const wf = this.getState(projectId)
    if (!wf) throw new Error('工作流未初始化')

    const steps = this.getFullSteps(wf.maxReviewRounds || 2)

    if (wf.current_step >= steps.length) {
      // 进入章节生成阶段
      WorkflowRepo.update(wf.id, { state: WorkflowState.WRITING, phase: WorkflowState.WRITING })
      return { phase: 'writing', message: '规划阶段完成' }
    }

    const step = steps[wf.current_step]
    const result = await this.executeStep(projectId, step.id, options)

    // 推进步骤
    WorkflowRepo.update(wf.id, { currentStep: wf.current_step + 1 })

    return result
  }

  /**
   * 章节生成：写正文 → 检查内容 → 增加事实
   */
  async executeChapterStep(projectId, chapterIndex, stepType, options = {}) {
    const wf = this.getState(projectId)
    if (!wf) throw new Error('工作流未初始化')

    const chapter = this.db.prepare('SELECT * FROM chapters WHERE project_id = ? ORDER BY sort_order ASC LIMIT 1 OFFSET ?').get(projectId, chapterIndex)
    if (!chapter) throw new Error(`第${chapterIndex + 1}章不存在`)

    const agentMap = {
      write: { id: 'scene-writer', name: '场景描写师' },
      check: { id: 'content-verifier', name: '内容审查员' },
      facts: { id: 'scene-writer', name: '场景描写师' }
    }
    const agent = this.agentRoles.find(a => a.id === agentMap[stepType].id)
    if (!agent) throw new Error('AI角色未找到')

    // 构建包含完整上下文的消息
    const context = this.contextBuilder.build(projectId, {
      includePreviousContent: stepType === 'write',
      maxPreviousContentChars: 3000
    })

    // 获取工作流结果作为额外上下文
    const wfResults = this.collectWorkflowResults(wf)
    if (wfResults['detail-outline']) context.detailOutline = wfResults['detail-outline']
    if (wfResults.thrills) context.thrills = wfResults.thrills

    // 章节检查结果
    const chResult = wf.chapterResults?.[chapterIndex] || {}
    if (stepType === 'facts' && chResult.check) {
      context.checkResult = chResult.check
    }

    const prompts = this.buildChapterPrompt(stepType, chapter, chapterIndex, context)
    const { provider, apiKey, model } = this.getProviderConfig(options)

    const systemMessages = this.contextBuilder.toSystemMessages(context)
    const messages = [
      { role: 'system', content: agent.systemPrompt },
      ...systemMessages,
      { role: 'user', content: prompts }
    ]

    const controller = new AbortController()
    this.activeControllers.set(`${wf.id}-chapter`, controller)

    WorkflowRepo.addLog(wf.id, `第${chapterIndex + 1}章-${agentMap[stepType].name}`, `开始${stepType}`, 'info')

    try {
      const p = this.providers[provider]
      const result = await p.chatStream({
        model,
        messages,
        apiKey,
        signal: controller.signal,
        onChunk: options.onChunk
      })

      WorkflowRepo.setChapterResult(wf.id, chapterIndex, stepType, result.content)

      // 写正文和增加事实时更新章节内容
      if (stepType === 'write' || stepType === 'facts') {
        const now = new Date().toISOString()
        this.db.prepare('UPDATE chapters SET content = ?, word_count = ?, summary = ?, updated_at = ? WHERE id = ?')
          .run(result.content, result.content.length, this.contextBuilder.autoGenerateSummary(result.content), now, chapter.id)
      }

      WorkflowRepo.addLog(wf.id, `第${chapterIndex + 1}章-${agentMap[stepType].name}`, `完成，${result.content.length}字`, 'success')

      return { content: result.content, chapter, stepType }
    } catch (error) {
      if (error.name === 'AbortError') {
        WorkflowRepo.addLog(wf.id, `第${chapterIndex + 1}章`, '用户取消生成', 'warning')
        throw new Error('生成已取消')
      }
      WorkflowRepo.addLog(wf.id, `第${chapterIndex + 1}章`, `错误: ${error.message}`, 'error')
      throw error
    } finally {
      this.activeControllers.delete(`${wf.id}-chapter`)
    }
  }

  buildChapterPrompt(stepType, chapter, chapterIndex, context) {
    if (stepType === 'write') {
      return `请根据细纲撰写第${chapterIndex + 1}章「${chapter.title}」的正文内容。

${context.detailOutline ? `本章细纲参考：${context.detailOutline}` : ''}
${context.thrills ? `爽点设计：${context.thrills}` : ''}
${chapter.summary ? `章节摘要：${chapter.summary}` : ''}

请撰写约2000-3000字的正文内容，注意：1.紧扣细纲推进情节 2.融入设计好的爽点 3.场景描写生动 4.人物对话有个性 5.与前文自然衔接`
    }

    if (stepType === 'check') {
      return `请审查以下第${chapterIndex + 1}章「${chapter.title}」的内容：

${chapter.content || '(暂无内容)'}

请检查：1.内容是否与细纲一致 2.逻辑矛盾 3.人物行为是否符合设定 4.事实错误 5.爽点是否落实 6.具体修改建议和需补充的事实`
    }

    if (stepType === 'facts') {
      return `请为以下章节内容补充和增强事实细节：

当前内容：
${chapter.content || '(暂无内容)'}

审查意见：
${context.checkResult || '无'}

请增强：1.补充环境描写细节 2.增加人物心理活动 3.完善动作描写 4.增加感官体验 5.确保事实准确性和逻辑自洽
请输出增强后的完整章节内容。`
    }
  }

  /**
   * 收集工作流前序结果作为上下文
   */
  collectWorkflowResults(wf) {
    const results = {}
    for (const [stepId, data] of Object.entries(wf.results || {})) {
      results[stepId] = data.content
      if (stepId === 'review') results.reviewRound1 = data.content
      if (stepId === 'rhythm-check') results.rhythmCheckRound1 = data.content
      // 提取轮次编号
      const match = stepId.match(/-(\d+)$/)
      if (match) {
        const round = parseInt(match[1])
        const base = stepId.replace(/-\d+$/, '')
        if (base === 'review') results[`reviewRound${round}`] = data.content
        if (base === 'rhythm-check') results[`rhythmCheckRound${round}`] = data.content
      }
    }
    return results
  }

  /**
   * 获取provider配置
   */
  getProviderConfig(options = {}) {
    const provider = options.provider || process.env.DEFAULT_PROVIDER || 'zhipu'
    const p = this.providers[provider]
    if (!p) throw new Error(`不支持的AI服务商: ${provider}`)

    // API Key优先级: 请求参数 > 环境变量 > 数据库解密
    let apiKey = options.apiKey
    if (!apiKey) {
      const envKey = process.env[`${provider.toUpperCase()}_API_KEY`]
      if (envKey) {
        apiKey = envKey
      } else {
        const config = this.db.prepare('SELECT api_key_encrypted FROM ai_configs WHERE provider = ?').get(provider)
        if (config) {
          apiKey = decrypt(config.api_key_encrypted)
        }
      }
    }

    if (!apiKey) throw new Error('请先配置API Key')

    const model = options.model || p.defaultModel
    return { provider, apiKey, model }
  }

  /**
   * 暂停工作流
   */
  pause(projectId) {
    const wf = this.getState(projectId)
    if (!wf) return
    WorkflowRepo.update(wf.id, { state: WorkflowState.PAUSED })
    WorkflowRepo.addLog(wf.id, '系统', '工作流已暂停', 'warning')
  }

  /**
   * 恢复工作流
   */
  resume(projectId) {
    const wf = this.getState(projectId)
    if (!wf) return
    WorkflowRepo.update(wf.id, { state: wf.phase })
    WorkflowRepo.addLog(wf.id, '系统', '工作流已恢复', 'info')
  }

  /**
   * 取消当前生成
   */
  cancel(projectId) {
    const wf = this.getState(projectId)
    if (!wf) return
    const controller = this.activeControllers.get(wf.id) || this.activeControllers.get(`${wf.id}-chapter`)
    if (controller) controller.abort()
    WorkflowRepo.update(wf.id, { state: WorkflowState.PAUSED })
    WorkflowRepo.addLog(wf.id, '系统', '生成已取消', 'warning')
  }

  /**
   * 回退到指定步骤
   */
  rollback(projectId, stepIndex) {
    const wf = this.getState(projectId)
    if (!wf) return
    WorkflowRepo.update(wf.id, { currentStep: stepIndex, state: WorkflowState.PLANNING })
    WorkflowRepo.addLog(wf.id, '系统', `回退到步骤${stepIndex + 1}`, 'warning')

    // 删除回退点之后的结果
    const steps = this.getFullSteps(wf.maxReviewRounds || 2)
    for (let i = stepIndex; i < steps.length; i++) {
      const step = steps[i]
      if (wf.results?.[step.id]) {
        this.db.prepare('DELETE FROM workflow_results WHERE workflow_id = ? AND step_id = ?').run(wf.id, step.id)
      }
    }
  }

  /**
   * 重试失败的步骤
   */
  async retry(projectId, options = {}) {
    const wf = this.getState(projectId)
    if (!wf) throw new Error('工作流未初始化')
    // 回退一步再执行
    WorkflowRepo.update(wf.id, { currentStep: wf.current_step, state: wf.phase })
    return this.executeNext(projectId, options)
  }

  /**
   * 人工确认步骤
   */
  confirm(projectId) {
    const wf = this.getState(projectId)
    if (!wf) return
    WorkflowRepo.update(wf.id, { state: wf.phase })
    WorkflowRepo.addLog(wf.id, '系统', '人工确认通过，继续执行', 'success')
  }
}
