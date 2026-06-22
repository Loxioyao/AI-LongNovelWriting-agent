import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useSettingsStore } from './settings'
import { useProjectStore } from './project'
import { streamChat, streamWorkflowStep, streamWorkflowChapter, workflowApi, buildAgentMessages } from '@/utils/api'

export const useLongFormStore = defineStore('longform', () => {
  // 工作流状态（与后端状态机同步）
  const workflowState = ref({
    phase: 'idle', // idle | planning | reviewing | writing | paused | done | error
    currentStep: 0,
    reviewRound: 0,
    maxReviewRounds: 2,
    currentChapterIndex: 0,
    results: {},
    chapterResults: [],
    logs: [],
    running: false,
    autoMode: false,
    error: null,
    canPause: false,
    canConfirm: false
  })

  // AbortController for canceling streaming requests
  let abortController = null
  let userCancelRequested = false

  // 工作流步骤定义（与后端 workflow.js 一致）
  const workflowSteps = [
    {
      id: 'outline',
      name: '写大纲',
      desc: 'AI生成故事整体大纲',
      agentId: 'outline-architect',
      phase: 'planning',
      icon: 'Document',
      color: '#6c5ce7'
    },
    {
      id: 'tasks',
      name: '设计任务',
      desc: '将大纲分解为创作任务',
      agentId: 'plot-weaver',
      phase: 'planning',
      icon: 'List',
      color: '#909399'
    },
    {
      id: 'plot',
      name: '设计情节',
      desc: '详细设计核心情节线',
      agentId: 'plot-weaver',
      phase: 'planning',
      icon: 'Connection',
      color: '#5352ed'
    },
    {
      id: 'detail-outline',
      name: '写细纲',
      desc: '分章节详细大纲',
      agentId: 'outline-architect',
      phase: 'planning',
      icon: 'Notebook',
      color: '#3742fa'
    },
    {
      id: 'thrills',
      name: '设计爽点',
      desc: '为每章设计爽感节点',
      agentId: 'thrill-designer',
      phase: 'planning',
      icon: 'Lightning',
      color: '#ff6b35'
    },
    {
      id: 'rhythm-check-1',
      name: '检查节奏',
      desc: '审查故事节奏是否合理',
      agentId: 'rhythm-controller',
      phase: 'reviewing',
      icon: 'Timer',
      color: '#2ed573'
    },
    {
      id: 'review-1',
      name: '审查第1轮',
      desc: '全面审查大纲和细纲',
      agentId: 'critic',
      phase: 'reviewing',
      icon: 'View',
      color: '#00bcd4'
    },
    {
      id: 'revise-1',
      name: '重新审核大纲',
      desc: '根据审查意见修改大纲',
      agentId: 'outline-architect',
      phase: 'reviewing',
      icon: 'RefreshLeft',
      color: '#6c5ce7'
    }
  ]

  // 动态生成完整步骤列表（包括多轮审查）
  const fullSteps = computed(() => {
    const steps = [...workflowSteps]
    for (let i = 1; i < workflowState.value.maxReviewRounds; i++) {
      const round = i + 1
      steps.push(
        {
          id: `rhythm-check-${round}`,
          name: `检查节奏(第${round}轮)`,
          desc: `第${round}轮节奏检查`,
          agentId: 'rhythm-controller',
          phase: 'reviewing',
          icon: 'Timer',
          color: '#2ed573'
        },
        {
          id: `review-${round}`,
          name: `审查第${round}轮`,
          desc: `第${round}轮全面审查`,
          agentId: 'critic',
          phase: 'reviewing',
          icon: 'View',
          color: '#00bcd4'
        },
        {
          id: `revise-${round}`,
          name: `重新审核(第${round}轮)`,
          desc: `根据第${round}轮审查修改`,
          agentId: 'outline-architect',
          phase: 'reviewing',
          icon: 'RefreshLeft',
          color: '#6c5ce7'
        }
      )
    }
    return steps
  })

  // 章节生成步骤
  const chapterSteps = [
    { id: 'write', name: '写正文', agentId: 'scene-writer', icon: 'EditPen' },
    { id: 'check', name: '检查内容', agentId: 'content-verifier', icon: 'CircleCheck' },
    { id: 'facts', name: '增加事实', agentId: 'scene-writer', icon: 'Plus' }
  ]

  const currentStepData = computed(() => fullSteps.value[workflowState.value.currentStep])
  const progress = computed(() => {
    const total = fullSteps.value.length
    return Math.round((workflowState.value.currentStep / total) * 100)
  })

  const planningDone = computed(() => workflowState.value.currentStep >= fullSteps.value.length)

  function addLog(step, message, type = 'info') {
    workflowState.value.logs.push({
      id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      step,
      message,
      type,
      timestamp: new Date().toISOString()
    })
  }

  function setResult(stepId, content) {
    workflowState.value.results[stepId] = {
      content,
      timestamp: new Date().toISOString()
    }
  }

  function buildContext(stepId) {
    const projectStore = useProjectStore()
    const project = projectStore.currentProject
    const results = workflowState.value.results

    const context = {
      projectTitle: project?.title,
      genre: project?.genre,
      style: project?.style,
      outline: project?.outline || results.outline?.content || '',
      characters: project?.characters || []
    }

    // 根据步骤添加前序结果作为上下文
    if (results.outline?.content && stepId !== 'outline') {
      context.masterOutline = results.outline.content
    }
    if (results.tasks?.content && stepId !== 'tasks' && stepId !== 'outline') {
      context.tasks = results.tasks.content
    }
    if (results.plot?.content && !['outline', 'tasks'].includes(stepId)) {
      context.plotDesign = results.plot.content
    }
    if (results['detail-outline']?.content && !['outline', 'tasks', 'plot'].includes(stepId)) {
      context.detailOutline = results['detail-outline'].content
    }
    if (results.thrills?.content && !['outline', 'tasks', 'plot', 'detail-outline'].includes(stepId)) {
      context.thrills = results.thrills.content
    }
    // 审查上下文
    const reviewRounds = workflowState.value.maxReviewRounds
    for (let i = 1; i <= reviewRounds; i++) {
      if (results[`rhythm-check-${i}`]?.content) {
        context[`rhythmCheckRound${i}`] = results[`rhythm-check-${i}`].content
      }
      if (results[`review-${i}`]?.content) {
        context[`reviewRound${i}`] = results[`review-${i}`].content
      }
    }

    return context
  }

  function buildStepPrompt(stepId, context) {
    const projectStore = useProjectStore()
    const project = projectStore.currentProject

    const prompts = {
      outline: `请为以下小说生成详细的故事大纲：

小说标题：${project?.title || '未命名'}
小说类型：${project?.genre || '未指定'}
写作风格：${project?.style || '未指定'}
${project?.summary ? `已有简介：${project.summary}` : ''}

请生成包含以下内容的大纲：
1. 故事背景与世界观概述
2. 主线剧情（起承转合）
3. 核心冲突设计
4. 关键转折点和高潮
5. 主要伏笔和照应
请用Markdown格式输出。`,

      tasks: `基于以下大纲，将创作任务分解为具体的工作项：

故事大纲：
${context.masterOutline || '无'}

请分解为以下任务类别：
1. 世界观构建任务
2. 角色发展任务
3. 情节推进任务
4. 伏笔埋设任务
5. 高潮设计任务
每类列出具体待办事项。`,

      plot: `基于以下大纲和任务，设计详细的核心情节线：

大纲：
${context.masterOutline || '无'}

任务分解：
${context.tasks || '无'}

请设计：
1. 主线情节的具体推进路线（按时间顺序）
2. 每个关键情节点的详细描述
3. 情节之间的因果关联
4. 冲突升级路径
5. 情感高潮设计`,

      'detail-outline': `基于以下内容，编写分章详细细纲：

大纲：${context.masterOutline || '无'}
情节设计：${context.plotDesign || '无'}

请为每章编写细纲，包含：
- 章节标题
- 本章主要事件
- 出场人物
- 爽点位置
- 伏笔/回收
- 与前后章的衔接
请规划10-20章。`,

      thrills: `基于以下细纲，为每章设计具体的爽点：

细纲：
${context['detail-outline'] || context.masterOutline || '无'}

请为每章设计：
1. 本章的核心爽点（打脸/逆袭/装逼/获宝/突破等）
2. 爽点的具体表现方式
3. 配角反应设计（震惊/嫉妒/崇拜等）
4. 爽点与主线的关联
5. 读者的预期情感曲线`,

      'rhythm-check': (round) => `请检查以下内容的节奏是否合理：

大纲：
${context.masterOutline || '无'}

细纲：
${context['detail-outline'] || '无'}

${context.thrills ? `爽点设计：${context.thrills}` : ''}

${round > 1 && context[`reviewRound${round - 1}`] ? `上一轮审查意见：${context[`reviewRound${round - 1}`]}` : ''}

请从以下角度分析：
1. 整体节奏曲线是否流畅
2. 是否有拖沓或仓促的段落
3. 高潮分布是否合理
4. 情绪起伏是否自然
5. 具体的节奏调整建议`,

      review: (round) => `请对以下小说规划进行全面审查（第${round}轮）：

大纲：
${context.masterOutline || '无'}

细纲：
${context['detail-outline'] || '无'}

${context.thrills ? `爽点设计：${context.thrills}` : ''}

${context[`rhythmCheckRound${round}`] ? `节奏检查结果：${context[`rhythmCheckRound${round}`]}` : ''}

${round > 1 && context[`reviewRound${round - 1}`] ? `上一轮审查意见：${context[`reviewRound${round - 1}`]}` : ''}

请审查：
1. 逻辑是否自洽
2. 人物动机是否充分
3. 情节是否有硬伤
4. 伏笔是否合理
5. 是否存在老套桥段
6. 具体修改建议`,

      revise: (round) => `根据以下审查意见和节奏建议，修改并完善大纲和细纲：

原始大纲：
${context.masterOutline || '无'}

原始细纲：
${context['detail-outline'] || '无'}

第${round}轮审查意见：
${context[`reviewRound${round}`] || '无'}

${context[`rhythmCheckRound${round}`] ? `节奏建议：${context[`rhythmCheckRound${round}`]}` : ''}

请输出修改后的完整大纲和细纲，标注修改之处。`
    }

    // 动态匹配步骤
    if (stepId.startsWith('rhythm-check')) {
      const round = parseInt(stepId.split('-').pop()) || 1
      return prompts['rhythm-check'](round)
    }
    if (stepId.startsWith('review-')) {
      const round = parseInt(stepId.split('-').pop()) || 1
      return prompts.review(round)
    }
    if (stepId.startsWith('revise-')) {
      const round = parseInt(stepId.split('-').pop()) || 1
      return prompts.revise(round)
    }

    return prompts[stepId] || `请执行步骤：${stepId}`
  }

  // ====== 执行规划步骤（通过后端工作流引擎 + 流式 SSE） ======
  async function executeStep(stepId, onChunk) {
    const settings = useSettingsStore()
    const projectStore = useProjectStore()
    const project = projectStore.currentProject
    const step = fullSteps.value.find(s => s.id === stepId)

    if (!step) throw new Error(`未知步骤: ${stepId}`)

    const agent = settings.agentRoles.find(a => a.id === step.agentId)
    if (!agent) throw new Error(`未找到AI角色: ${step.agentId}`)

    // 创建 AbortController 以支持取消
    abortController = new AbortController()
    userCancelRequested = false

    addLog(step.name, `开始执行: ${step.desc}`, 'info')
    workflowState.value.running = true
    workflowState.value.error = null

    try {
      // 优先尝试通过后端工作流引擎执行（支持状态机、日志、上下文管理）
      let content
      try {
        const result = await streamWorkflowStep(
          project.id,
          stepId,
          (chunk, full) => {
            if (onChunk) onChunk(chunk, full)
          },
          {
            provider: settings.activeProvider,
            model: settings.currentProvider?.model,
            temperature: settings.temperature,
            maxTokens: settings.maxTokens,
            signal: abortController.signal
          }
        )
        content = result.content
      } catch (backendErr) {
        // 后端工作流未初始化或不可用，降级为直接流式聊天
        console.warn('后端工作流不可用，降级为直接流式聊天:', backendErr.message)

        const context = buildContext(stepId)
        const prompt = buildStepPrompt(stepId, context)
        const messages = buildAgentMessages(agent, prompt, context)

        const result = await streamChat(messages, (chunk, full) => {
          if (onChunk) onChunk(chunk, full)
        }, {
          provider: settings.activeProvider,
          model: settings.currentProvider?.model,
          temperature: settings.temperature,
          maxTokens: settings.maxTokens,
          projectId: project.id,
          agentId: step.agentId,
          signal: abortController.signal
        })
        content = result.content
      }

      setResult(stepId, content)
      addLog(step.name, `执行完成，生成${content.length}字`, 'success')

      // 如果是大纲步骤，同步到项目
      if (stepId === 'outline' || stepId.startsWith('revise-')) {
        await projectStore.updateOutline(content)
      }

      return content
    } catch (err) {
      // 如果是用户主动取消，不作为错误
      if (userCancelRequested && (err.name === 'AbortError' || err.message?.toLowerCase?.().includes('abort'))) {
        addLog(step.name, '用户取消执行', 'warning')
        throw new Error('用户取消执行')
      }
      workflowState.value.error = err.message
      addLog(step.name, `错误: ${err.message}`, 'error')
      throw err
    } finally {
      workflowState.value.running = false
      abortController = null
    }
  }

  // ====== 执行章节生成步骤 ======
  async function executeChapterStep(chapterIndex, stepType, onChunk) {
    const settings = useSettingsStore()
    const projectStore = useProjectStore()
    const project = projectStore.currentProject
    const chapter = projectStore.chapters[chapterIndex]

    if (!chapter) throw new Error(`未找到第${chapterIndex + 1}章`)

    const detailOutline = workflowState.value.results['detail-outline']?.content || ''
    const thrills = workflowState.value.results.thrills?.content || ''
    const previousContent = chapterIndex > 0
      ? projectStore.chapters[chapterIndex - 1]?.content?.slice(-2000)
      : ''

    const prompts = {
      write: `请根据细纲撰写第${chapterIndex + 1}章「${chapter.title}」的正文内容。

小说标题：${project?.title}
小说类型：${project?.genre}
写作风格：${project?.style}

本章细纲：
${detailOutline}

本章爽点设计：
${thrills}

${chapter.summary ? `章节摘要：${chapter.summary}` : ''}
${previousContent ? `上一章结尾（衔接用）：\n${previousContent}` : ''}

请撰写约2000-3000字的正文内容，注意：
1. 紧扣细纲推进情节
2. 融入设计好的爽点
3. 场景描写生动
4. 人物对话有个性
5. 与前文自然衔接`,

      check: `请审查以下第${chapterIndex + 1}章「${chapter.title}」的内容：

${chapter.content || '(暂无内容)'}

本章细纲：
${detailOutline}

请检查：
1. 内容是否与细纲一致
2. 是否有逻辑矛盾
3. 人物行为是否符合设定
4. 是否有事实错误
5. 爽点是否落实
6. 给出具体的修改建议和需要补充的事实。`,

      facts: `请为以下章节内容补充和增强事实细节：

当前内容：
${chapter.content || '(暂无内容)'}

审查意见：
${workflowState.value.chapterResults[chapterIndex]?.check || '无'}

请增强：
1. 补充环境描写的细节
2. 增加人物心理活动
3. 完善动作描写
4. 增加感官体验（视觉/听觉/触觉等）
5. 确保事实准确性和逻辑自洽
请输出增强后的完整章节内容。`
    }

    const agentMap = {
      write: 'scene-writer',
      check: 'content-verifier',
      facts: 'scene-writer'
    }

    const agent = settings.agentRoles.find(a => a.id === agentMap[stepType])
    if (!agent) throw new Error(`未找到AI角色`)

    const context = {
      projectTitle: project?.title,
      genre: project?.genre,
      style: project?.style,
      outline: detailOutline,
      characters: project?.characters
    }

    const messages = buildAgentMessages(agent, prompts[stepType], context)

    abortController = new AbortController()
    userCancelRequested = false

    addLog(`第${chapterIndex + 1}章-${chapterSteps.find(s => s.id === stepType)?.name}`, `开始${stepType}`, 'info')
    workflowState.value.running = true

    try {
      // 优先尝试后端工作流章节生成
      let content
      try {
        const result = await streamWorkflowChapter(
          project.id,
          chapterIndex,
          stepType,
          (chunk, full) => {
            if (onChunk) onChunk(chunk, full)
          },
          {
            provider: settings.activeProvider,
            model: settings.currentProvider?.model,
            temperature: settings.temperature,
            maxTokens: settings.maxTokens,
            signal: abortController.signal
          }
        )
        content = result.content
      } catch (backendErr) {
        // 降级为直接流式聊天
        console.warn('后端章节工作流不可用，降级为直接流式聊天:', backendErr.message)

        const result = await streamChat(messages, (chunk, full) => {
          if (onChunk) onChunk(chunk, full)
        }, {
          provider: settings.activeProvider,
          model: settings.currentProvider?.model,
          temperature: settings.temperature,
          maxTokens: settings.maxTokens,
          projectId: project.id,
          agentId: agentMap[stepType],
          signal: abortController.signal
        })
        content = result.content
      }

      // 保存章节步骤结果
      if (!workflowState.value.chapterResults[chapterIndex]) {
        workflowState.value.chapterResults[chapterIndex] = {}
      }
      workflowState.value.chapterResults[chapterIndex][stepType] = content

      // 写正文和增加事实时更新章节内容
      if (stepType === 'write' || stepType === 'facts') {
        await projectStore.updateChapter(chapter.id, {
          content,
          wordCount: content.length
        })
      }

      addLog(`第${chapterIndex + 1}章-${chapterSteps.find(s => s.id === stepType)?.name}`, `完成，生成${content.length}字`, 'success')

      return content
    } catch (err) {
      if (userCancelRequested && (err.name === 'AbortError' || err.message?.toLowerCase?.().includes('abort'))) {
        addLog(`第${chapterIndex + 1}章`, '用户取消执行', 'warning')
        throw new Error('用户取消执行')
      }
      workflowState.value.error = err.message
      addLog(`第${chapterIndex + 1}章`, `错误: ${err.message}`, 'error')
      throw err
    } finally {
      workflowState.value.running = false
      abortController = null
    }
  }

  // ====== 取消当前执行 ======
  function cancelExecution() {
    userCancelRequested = true
    if (abortController) {
      abortController.abort()
      addLog('系统', '执行已取消', 'warning')
    }
    workflowState.value.running = false
  }

  // ====== 初始化后端工作流 ======
  async function initBackendWorkflow(projectId) {
    try {
      const result = await workflowApi.init(projectId, {
        maxReviewRounds: workflowState.value.maxReviewRounds
      })
      addLog('系统', '后端工作流已初始化', 'success')
      return result
    } catch (e) {
      console.warn('初始化后端工作流失败（将使用降级模式）:', e.message)
    }
  }

  // ====== 工作流控制操作（对接后端状态机） ======
  async function pauseWorkflow(projectId) {
    try {
      await workflowApi.pause(projectId)
      workflowState.value.phase = 'paused'
      addLog('系统', '工作流已暂停', 'warning')
    } catch (e) {
      console.error('暂停失败:', e)
    }
  }

  async function resumeWorkflow(projectId) {
    try {
      await workflowApi.resume(projectId)
      workflowState.value.phase = 'planning'
      addLog('系统', '工作流已恢复', 'success')
    } catch (e) {
      console.error('恢复失败:', e)
    }
  }

  async function rollbackWorkflow(projectId, stepIndex) {
    try {
      await workflowApi.rollback(projectId, stepIndex)
      addLog('系统', `已回滚到步骤 ${stepIndex}`, 'warning')
    } catch (e) {
      console.error('回滚失败:', e)
    }
  }

  async function retryStep(projectId, options = {}) {
    try {
      await workflowApi.retry(projectId, options)
      addLog('系统', '重试当前步骤', 'info')
    } catch (e) {
      console.error('重试失败:', e)
    }
  }

  async function confirmStep(projectId) {
    try {
      await workflowApi.confirm(projectId)
      addLog('系统', '已确认当前步骤', 'success')
    } catch (e) {
      console.error('确认失败:', e)
    }
  }

  function nextStep() {
    workflowState.value.currentStep++
  }

  function resetWorkflow() {
    cancelExecution()
    workflowState.value = {
      phase: 'idle',
      currentStep: 0,
      reviewRound: 0,
      maxReviewRounds: workflowState.value.maxReviewRounds,
      currentChapterIndex: 0,
      results: {},
      chapterResults: [],
      logs: [],
      running: false,
      autoMode: false,
      error: null,
      canPause: false,
      canConfirm: false
    }
  }

  function setMaxReviewRounds(n) {
    workflowState.value.maxReviewRounds = n
  }

  return {
    workflowState,
    workflowSteps,
    fullSteps,
    chapterSteps,
    currentStepData,
    progress,
    planningDone,
    addLog,
    setResult,
    executeStep,
    executeChapterStep,
    cancelExecution,
    initBackendWorkflow,
    pauseWorkflow,
    resumeWorkflow,
    rollbackWorkflow,
    retryStep,
    confirmStep,
    nextStep,
    resetWorkflow,
    setMaxReviewRounds
  }
})
