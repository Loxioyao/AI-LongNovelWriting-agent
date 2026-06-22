<template>
  <div class="longform-page" v-if="project">
    <div class="lf-header">
      <div>
        <h1 class="page-title">长篇生成</h1>
        <p class="page-desc">完整的AI协作工作流：大纲→任务→情节→细纲→爽点→节奏检查→多轮审查→逐章生成→内容验证→增加事实</p>
      </div>
      <div class="header-actions">
        <div class="rounds-config">
          <span class="config-label">审查轮数</span>
          <el-input-number v-model="maxRounds" :min="1" :max="5" size="small" @change="updateRounds" />
        </div>
        <el-button @click="showConfig = true">
          <el-icon><Setting /></el-icon>
          高级配置
        </el-button>
        <el-button @click="resetAll" type="danger" plain>
          <el-icon><RefreshLeft /></el-icon>
          重置
        </el-button>
      </div>
    </div>

    <!-- 进度总览条 -->
    <div class="progress-banner">
      <div class="progress-info">
        <span class="progress-label">总进度</span>
        <span class="progress-value">{{ overallProgress }}%</span>
      </div>
      <div class="progress-bar-container">
        <div class="progress-bar" :style="{ width: overallProgress + '%' }"></div>
      </div>
      <div class="phase-info">
        <el-tag :type="phaseTagType" effect="dark">{{ phaseText }}</el-tag>
        <span class="step-counter">{{ completedSteps }}/{{ totalSteps }} 步骤</span>
      </div>
    </div>

    <!-- 错误提示 -->
    <div class="error-banner" v-if="workflowState.error">
      <el-icon><WarningFilled /></el-icon>
      <span>{{ workflowState.error }}</span>
      <el-button text size="small" @click="workflowState.error = null">关闭</el-button>
    </div>

    <!-- 主工作区 -->
    <div class="lf-main">
      <!-- 左侧：流程步骤可视化 -->
      <div class="steps-panel">
        <div class="panel-title">
          <span>创作工作流</span>
          <el-tag size="small">{{ planningDone ? '规划完成' : '规划中' }}</el-tag>
        </div>

        <div class="steps-section">
          <div class="steps-section-title">阶段一：规划与审查</div>
          <div
            v-for="(step, i) in fullSteps"
            :key="step.id"
            class="step-item"
            :class="{
              completed: isStepCompleted(step.id),
              active: currentStepIndex === i && !planningDone,
              pending: currentStepIndex < i
            }"
          >
            <div class="step-marker" :style="{ background: isStepCompleted(step.id) ? step.color : 'transparent', borderColor: step.color }">
              <el-icon v-if="isStepCompleted(step.id)" :size="14"><Check /></el-icon>
              <span v-else>{{ i + 1 }}</span>
            </div>
            <div class="step-content">
              <div class="step-header">
                <span class="step-name">{{ step.name }}</span>
                <el-icon :color="step.color" :size="14"><component :is="step.icon" /></el-icon>
              </div>
              <span class="step-desc">{{ step.desc }}</span>
              <div class="step-result-tag" v-if="isStepCompleted(step.id)">
                <el-tag size="small" type="success">{{ getResult(step.id)?.content.length || 0 }} 字</el-tag>
              </div>
            </div>
            <el-button
              v-if="isStepCompleted(step.id)"
              text
              size="small"
              @click="viewResult(step.id)"
            >
              <el-icon><View /></el-icon>
            </el-button>
          </div>
        </div>

        <!-- 分隔线 -->
        <div class="phase-divider" v-if="planningDone || workflowState.phase === 'writing'">
          <span>阶段二：逐章生成</span>
        </div>

        <!-- 章节生成步骤 -->
        <div v-if="planningDone || workflowState.phase === 'writing'" class="steps-section">
          <div class="chapters-gen-info">
            <span>共 {{ project.chapters.length }} 章待生成</span>
            <span>已完成 {{ completedChapters }} 章</span>
          </div>
          <div
            v-for="(ch, i) in project.chapters"
            :key="ch.id"
            class="chapter-gen-item"
            :class="{
              completed: isChapterDone(i),
              active: workflowState.currentChapterIndex === i && workflowState.phase === 'writing',
              pending: workflowState.currentChapterIndex < i
            }"
          >
            <div class="ch-gen-marker">
              <el-icon v-if="isChapterDone(i)" :size="14"><Check /></el-icon>
              <span v-else>{{ i + 1 }}</span>
            </div>
            <div class="ch-gen-info">
              <span class="ch-gen-title">第{{ i + 1 }}章 {{ ch.title }}</span>
              <div class="ch-gen-steps">
                <span
                  v-for="cs in chapterSteps"
                  :key="cs.id"
                  class="ch-step-tag"
                  :class="{ done: workflowState.chapterResults[i]?.[cs.id] }"
                >
                  <el-icon :size="10"><component :is="cs.icon" /></el-icon>
                  {{ cs.name }}
                </span>
              </div>
            </div>
            <el-button
              v-if="isChapterDone(i) || workflowState.chapterResults[i]"
              text
              size="small"
              @click="viewChapterResult(i)"
            >
              <el-icon><View /></el-icon>
            </el-button>
          </div>
        </div>

        <!-- 执行按钮 -->
        <div class="execution-controls">
          <el-button
            v-if="!planningDone"
            type="primary"
            class="glow-button"
            :loading="executing"
            @click="executeCurrentStep"
            :disabled="!settings.hasApiKey || executing"
            size="large"
          >
            <el-icon><Promotion /></el-icon>
            执行: {{ currentStepData?.name }}
          </el-button>

          <el-button
            v-if="!planningDone && !executing"
            @click="runAutoPlanning"
            size="large"
          >
            <el-icon><VideoPlay /></el-icon>
            一键自动规划
          </el-button>

          <template v-if="planningDone && workflowState.phase !== 'done'">
            <el-button
              type="primary"
              class="glow-button"
              :loading="executing"
              @click="executeChapterGen"
              :disabled="!settings.hasApiKey || executing"
              size="large"
            >
              <el-icon><Promotion /></el-icon>
              {{ chapterStepText }}
            </el-button>
            <el-button
              v-if="!executing"
              @click="runAutoChapters"
              size="large"
            >
              <el-icon><VideoPlay /></el-icon>
              自动生成全部章节
            </el-button>
          </template>

          <el-button
            v-if="executing"
            type="danger"
            @click="cancelCurrent"
            size="large"
          >
            <el-icon><CloseBold /></el-icon>
            取消执行
          </el-button>

          <el-button
            v-if="workflowState.error && !executing"
            type="warning"
            @click="retryCurrent"
            size="large"
          >
            <el-icon><RefreshRight /></el-icon>
            重试
          </el-button>

          <el-button
            v-if="workflowState.phase === 'done'"
            type="success"
            @click="$router.push(`/project/${projectId}/chapters`)"
            size="large"
          >
            <el-icon><Check /></el-icon>
            查看完成的作品
          </el-button>

          <el-button
            v-if="!settings.hasApiKey"
            type="warning"
            @click="$router.push('/settings')"
            size="large"
          >
            <el-icon><Warning /></el-icon>
            请先配置API Key
          </el-button>
        </div>
      </div>

      <!-- 右侧：结果输出区 -->
      <div class="result-panel">
        <div class="panel-title">
          <span>{{ resultPanelTitle }}</span>
          <div class="result-actions" v-if="currentResult">
            <el-button text size="small" @click="copyResult">
              <el-icon><CopyDocument /></el-icon> 复制
            </el-button>
            <el-button text size="small" @click="applyResult">
              <el-icon><Check /></el-icon> 应用到项目
            </el-button>
          </div>
        </div>

        <!-- 流式输出区 -->
        <div class="result-content" ref="resultContainer">
          <div v-if="!currentResult && !executing" class="empty-result">
            <el-icon :size="48" color="var(--text-muted)"><MagicStick /></el-icon>
            <p>点击左侧"执行"按钮开始生成</p>
            <p class="empty-hint">每个步骤的AI输出将显示在这里</p>
          </div>

          <div v-if="executing && streamingContent" class="streaming-result">
            <div class="streaming-indicator">
              <el-icon class="is-loading"><Loading /></el-icon>
              <span>AI正在生成...</span>
            </div>
            <div class="markdown-body" v-html="renderMarkdown(streamingContent)"></div>
          </div>

          <div v-if="currentResult && !executing" class="completed-result">
            <div class="result-meta">
              <el-tag size="small">{{ viewingStep || currentStepData?.name || '章节结果' }}</el-tag>
              <span class="result-time">{{ formatTime(getResult(viewingStep)?.timestamp) }}</span>
            </div>
            <div class="markdown-body" v-html="renderMarkdown(currentResult)"></div>
          </div>
        </div>

        <!-- 日志区 -->
        <div class="logs-section">
          <div class="logs-header" @click="showLogs = !showLogs">
            <span>执行日志 ({{ workflowState.logs.length }})</span>
            <el-icon><ArrowDown v-if="!showLogs" /><ArrowUp v-else /></el-icon>
          </div>
          <transition name="slide-fade">
            <div v-if="showLogs" class="logs-list">
              <div
                v-for="log in workflowState.logs.slice(-20)"
                :key="log.id"
                class="log-item"
                :class="log.type"
              >
                <span class="log-time">{{ formatTime(log.timestamp) }}</span>
                <span class="log-step">{{ log.step }}</span>
                <span class="log-message">{{ log.message }}</span>
              </div>
              <div v-if="workflowState.logs.length === 0" class="empty-logs">
                暂无日志
              </div>
            </div>
          </transition>
        </div>
      </div>
    </div>

    <!-- 高级配置弹窗 -->
    <el-dialog v-model="showConfig" title="高级配置" width="560px">
      <el-form label-width="140px" label-position="left">
        <el-form-item label="审查轮数">
          <el-input-number v-model="maxRounds" :min="1" :max="5" @change="updateRounds" />
          <span class="config-hint">每轮包含：检查节奏→审查→重新审核</span>
        </el-form-item>
        <el-form-item label="章节生成步骤">
          <el-checkbox-group v-model="enabledChapterSteps">
            <el-checkbox label="write">写正文</el-checkbox>
            <el-checkbox label="check">检查内容</el-checkbox>
            <el-checkbox label="facts">增加事实</el-checkbox>
          </el-checkbox-group>
        </el-form-item>
        <el-form-item label="自动模式间隔">
          <span class="config-hint">自动模式下每步之间的延迟（毫秒）</span>
          <el-input-number v-model="autoDelay" :min="500" :max="10000" :step="500" />
        </el-form-item>
        <el-form-item label="每章目标字数">
          <el-input-number v-model="chapterWords" :min="1000" :max="10000" :step="500" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showConfig = false">关闭</el-button>
      </template>
    </el-dialog>

    <!-- 查看结果弹窗 -->
    <el-dialog v-model="showResultDialog" :title="resultDialogTitle" width="800px">
      <div class="markdown-body" v-html="renderMarkdown(dialogResult)"></div>
      <template #footer>
        <el-button @click="copyDialogResult">
          <el-icon><CopyDocument /></el-icon> 复制
        </el-button>
        <el-button @click="showResultDialog = false">关闭</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, watch, nextTick } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import { useProjectStore } from '@/stores/project'
import { useSettingsStore } from '@/stores/settings'
import { useLongFormStore } from '@/stores/longform'

const route = useRoute()
const projectStore = useProjectStore()
const settings = useSettingsStore()
const lf = useLongFormStore()

const projectId = route.params.id
const project = computed(() => projectStore.currentProject)

const workflowState = computed(() => lf.workflowState)
const fullSteps = computed(() => lf.fullSteps)
const chapterSteps = lf.chapterSteps
const currentStepData = computed(() => lf.currentStepData)
const planningDone = computed(() => lf.planningDone)

const executing = ref(false)
const streamingContent = ref('')
const currentResult = ref('')
const viewingStep = ref('')
const showLogs = ref(true)
const showConfig = ref(false)
const showResultDialog = ref(false)
const dialogResult = ref('')
const resultDialogTitle = ref('')
const resultContainer = ref(null)

const maxRounds = ref(workflowState.value.maxReviewRounds)
const enabledChapterSteps = ref(['write', 'check', 'facts'])
const autoDelay = ref(1000)
const chapterWords = ref(2000)

const currentStepIndex = computed(() => workflowState.value.currentStep)
const completedSteps = computed(() => {
  let count = workflowState.value.currentStep
  if (planningDone.value) count = fullSteps.value.length
  if (workflowState.value.phase === 'writing') {
    count += completedChapters.value
  }
  return count
})

const totalSteps = computed(() => {
  return fullSteps.value.length + project.value?.chapters.length || 0
})

const overallProgress = computed(() => {
  if (totalSteps.value === 0) return 0
  return Math.round((completedSteps.value / totalSteps.value) * 100)
})

const completedChapters = computed(() => {
  return workflowState.value.chapterResults.filter(r => r && r.write).length
})

const phaseText = computed(() => {
  if (workflowState.value.phase === 'idle') return '待开始'
  if (workflowState.value.phase === 'planning') return '规划中'
  if (workflowState.value.phase === 'reviewing') return '审查中'
  if (workflowState.value.phase === 'writing') return `写第${workflowState.value.currentChapterIndex + 1}章`
  if (workflowState.value.phase === 'done') return '已完成'
  return '进行中'
})

const phaseTagType = computed(() => {
  const map = { idle: 'info', planning: '', reviewing: 'warning', writing: '', done: 'success' }
  return map[workflowState.value.phase] || 'info'
})

const resultPanelTitle = computed(() => {
  if (executing.value) return '生成中...'
  if (currentResult.value) return '生成结果'
  if (planningDone.value) return '章节生成'
  return '等待执行'
})

const chapterStepText = computed(() => {
  const idx = workflowState.value.currentChapterIndex
  const ch = project.value?.chapters[idx]
  if (!ch) return '生成章节'
  return `生成第${idx + 1}章: ${ch.title}`
})

function isStepCompleted(stepId) {
  return !!workflowState.value.results[stepId]
}

function getResult(stepId) {
  return workflowState.value.results[stepId]
}

function isChapterDone(idx) {
  return !!(workflowState.value.chapterResults[idx]?.write && workflowState.value.chapterResults[idx]?.check && workflowState.value.chapterResults[idx]?.facts)
}

function renderMarkdown(text) {
  if (!text) return ''
  return DOMPurify.sanitize(marked(text))
}

function formatTime(ts) {
  if (!ts) return ''
  return new Date(ts).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

async function scrollToBottom() {
  await nextTick()
  if (resultContainer.value) {
    resultContainer.value.scrollTop = resultContainer.value.scrollHeight
  }
}

watch(streamingContent, scrollToBottom)

async function executeCurrentStep() {
  if (!settings.hasApiKey) {
    ElMessage.warning('请先在设置中配置API Key')
    return
  }

  executing.value = true
  streamingContent.value = ''
  currentResult.value = ''
  viewingStep.value = ''

  if (workflowState.value.phase === 'idle') {
    workflowState.value.phase = 'planning'
  }

  try {
    const step = fullSteps.value[workflowState.value.currentStep]
    const content = await lf.executeStep(step.id, (chunk, full) => {
      streamingContent.value = full
    })

    if (!content) throw new Error('????????????')
    currentResult.value = content
    viewingStep.value = step.id

    lf.nextStep()

    if (workflowState.value.currentStep >= fullSteps.value.length) {
      workflowState.value.phase = 'writing'
      ElMessage.success('规划阶段完成！可以开始逐章生成')
    }
  } catch (error) {
    ElMessage.error(error.message || '执行失败')
    lf.addLog(currentStepData.value?.name || '未知步骤', `错误: ${error.message}`, 'error')
  } finally {
    executing.value = false
    streamingContent.value = ''
  }
}

async function runAutoPlanning() {
  if (!settings.hasApiKey) {
    ElMessage.warning('请先配置API Key')
    return
  }

  ElMessageBox.confirm(
    '将自动执行所有规划步骤，可能需要较长时间。确定开始？',
    '自动规划',
    { type: 'info', confirmButtonText: '开始', cancelButtonText: '取消' }
  ).then(async () => {
    workflowState.value.autoMode = true
    if (workflowState.value.phase === 'idle') {
      workflowState.value.phase = 'planning'
    }

    while (workflowState.value.currentStep < fullSteps.value.length) {
      executing.value = true
      streamingContent.value = ''
      currentResult.value = ''

      try {
        const step = fullSteps.value[workflowState.value.currentStep]
        const content = await lf.executeStep(step.id, (chunk, full) => {
          streamingContent.value = full
        })
        if (!content) throw new Error('????????????')
        currentResult.value = content
        viewingStep.value = step.id
        lf.nextStep()
        await new Promise(r => setTimeout(r, autoDelay.value))
      } catch (error) {
        ElMessage.error(`步骤失败: ${error.message}`)
        break
      } finally {
        executing.value = false
      }
    }

    if (workflowState.value.currentStep >= fullSteps.value.length) {
      workflowState.value.phase = 'writing'
      ElMessage.success('规划完成！')
    }
    workflowState.value.autoMode = false
  }).catch(() => {})
}

async function executeChapterGen() {
  if (!settings.hasApiKey) {
    ElMessage.warning('请先配置API Key')
    return
  }

  const idx = workflowState.value.currentChapterIndex
  const ch = project.value?.chapters[idx]

  if (!ch) {
    ElMessage.info('所有章节已生成完成！')
    workflowState.value.phase = 'done'
    return
  }

  // 确定当前章节的执行步骤
  const chResult = workflowState.value.chapterResults[idx] || {}
  let stepType = null
  for (const s of enabledChapterSteps.value) {
    if (!chResult[s]) {
      stepType = s
      break
    }
  }

  if (!stepType) {
    // 当前章节完成，进入下一章
    workflowState.value.currentChapterIndex++
    if (workflowState.value.currentChapterIndex >= project.value.chapters.length) {
      workflowState.value.phase = 'done'
      ElMessage.success('全部章节生成完成！')
    } else {
      ElMessage.info(`进入第${workflowState.value.currentChapterIndex + 1}章`)
    }
    return
  }

  executing.value = true
  streamingContent.value = ''
  currentResult.value = ''
  viewingStep.value = ''

  workflowState.value.phase = 'writing'

  try {
    const content = await lf.executeChapterStep(idx, stepType, (chunk, full) => {
      streamingContent.value = full
    })
    if (!content) throw new Error('????????????')
    currentResult.value = content
    viewingStep.value = `chapter-${idx}-${stepType}`

    // 检查是否本章所有步骤完成
    const updatedResult = workflowState.value.chapterResults[idx] || {}
    const allDone = enabledChapterSteps.value.every(s => updatedResult[s])

    if (allDone) {
      ElMessage.success(`第${idx + 1}章「${ch.title}」生成完成！`)
    }
  } catch (error) {
    ElMessage.error(error.message || '生成失败')
  } finally {
    executing.value = false
    streamingContent.value = ''
  }
}

async function runAutoChapters() {
  if (!settings.hasApiKey) {
    ElMessage.warning('请先配置API Key')
    return
  }

  ElMessageBox.confirm(
    '将自动生成所有章节，每章包含写正文→检查→增加事实。这可能需要很长时间，确定开始？',
    '自动生成全部章节',
    { type: 'info', confirmButtonText: '开始', cancelButtonText: '取消' }
  ).then(async () => {
    workflowState.value.autoMode = true
    workflowState.value.phase = 'writing'

    while (workflowState.value.currentChapterIndex < project.value.chapters.length) {
      const idx = workflowState.value.currentChapterIndex
      const ch = project.value.chapters[idx]

      for (const stepType of enabledChapterSteps.value) {
        const chResult = workflowState.value.chapterResults[idx] || {}
        if (chResult[stepType]) continue

        executing.value = true
        streamingContent.value = ''

        try {
          const content = await lf.executeChapterStep(idx, stepType, (chunk, full) => {
            streamingContent.value = full
          })
          if (!content) throw new Error('????????????')
          currentResult.value = content
          viewingStep.value = `chapter-${idx}-${stepType}`
          await new Promise(r => setTimeout(r, autoDelay.value))
        } catch (error) {
          ElMessage.error(`第${idx + 1}章 ${stepType} 失败: ${error.message}`)
          workflowState.value.autoMode = false
          executing.value = false
          return
        } finally {
          executing.value = false
        }
      }

      ElMessage.success(`第${idx + 1}章「${ch.title}」完成！`)
      workflowState.value.currentChapterIndex++
    }

    workflowState.value.phase = 'done'
    workflowState.value.autoMode = false
    ElMessage.success('全部章节生成完成！')
  }).catch(() => {})
}

function viewResult(stepId) {
  const result = getResult(stepId)
  if (result) {
    resultDialogTitle.value = fullSteps.value.find(s => s.id === stepId)?.name || '结果'
    dialogResult.value = result.content
    showResultDialog.value = true
  }
}

function viewChapterResult(idx) {
  const chResult = workflowState.value.chapterResults[idx]
  if (chResult) {
    const ch = project.value.chapters[idx]
    resultDialogTitle.value = `第${idx + 1}章 ${ch.title} - 生成结果`
    const parts = []
    if (chResult.check) parts.push(`### 内容检查\n\n${chResult.check}`)
    dialogResult.value = parts.join('\n\n---\n\n') || ch.content || '(无结果)'
    showResultDialog.value = true
  }
}

function copyResult() {
  if (currentResult.value) {
    navigator.clipboard.writeText(currentResult.value)
    ElMessage.success('已复制')
  }
}

function copyDialogResult() {
  if (dialogResult.value) {
    navigator.clipboard.writeText(dialogResult.value)
    ElMessage.success('已复制')
  }
}

function applyResult() {
  if (!currentResult.value) return
  const step = viewingStep.value || fullSteps.value[workflowState.value.currentStep - 1]?.id

  if (step === 'outline' || step === 'revise-1' || step?.startsWith('revise')) {
    projectStore.updateOutline(currentResult.value)
    ElMessage.success('已应用到故事大纲')
  } else if (step === 'detail-outline') {
    ElMessage.info('细纲已保存在工作流中')
  } else if (step?.startsWith('chapter')) {
    ElMessage.info('章节内容已自动保存')
  } else {
    ElMessage.info('结果已保存在工作流中')
  }
}

function updateRounds(val) {
  lf.setMaxReviewRounds(val)
}

function cancelCurrent() {
  lf.cancelExecution()
  executing.value = false
  streamingContent.value = ''
  ElMessage.info('已取消当前执行')
}

async function retryCurrent() {
  workflowState.value.error = null
  if (planningDone.value) {
    await executeChapterGen()
  } else {
    await executeCurrentStep()
  }
}

function resetAll() {
  ElMessageBox.confirm(
    '确定要重置工作流吗？所有规划结果和章节生成进度将清除。',
    '重置确认',
    { type: 'warning', confirmButtonText: '重置', cancelButtonText: '取消' }
  ).then(() => {
    lf.resetWorkflow()
    currentResult.value = ''
    streamingContent.value = ''
    viewingStep.value = ''
    ElMessage.success('工作流已重置')
  }).catch(() => {})
}

watch(() => workflowState.value.results, () => {
  // 自动更新当前结果展示
  if (viewingStep.value) {
    const r = getResult(viewingStep.value)
    if (r && !executing.value) {
      currentResult.value = r.content
    }
  }
}, { deep: true })
</script>

<style scoped>
.longform-page {
  height: 100vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding: 24px 32px;
}

.lf-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 16px;
}

.page-desc {
  color: var(--text-muted);
  font-size: 13px;
  margin-top: 4px;
  max-width: 600px;
}

.header-actions {
  display: flex;
  gap: 12px;
  align-items: center;
}

.rounds-config {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--text-secondary);
}

.config-label {
  white-space: nowrap;
}

.progress-banner {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  padding: 16px 20px;
  margin-bottom: 16px;
  display: flex;
  align-items: center;
  gap: 20px;
}

.progress-info {
  display: flex;
  flex-direction: column;
  align-items: center;
  min-width: 60px;
}

.progress-label {
  font-size: 12px;
  color: var(--text-muted);
}

.progress-value {
  font-size: 24px;
  font-weight: 700;
  color: var(--accent-secondary);
}

.progress-bar-container {
  flex: 1;
  height: 8px;
  background: var(--bg-tertiary);
  border-radius: 4px;
  overflow: hidden;
}

.progress-bar {
  height: 100%;
  background: var(--gradient-1);
  border-radius: 4px;
  transition: width 0.5s ease;
}

.error-banner {
  background: rgba(245, 108, 108, 0.1);
  border: 1px solid rgba(245, 108, 108, 0.3);
  border-radius: var(--radius-md);
  padding: 10px 16px;
  margin-bottom: 16px;
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--danger);
  font-size: 13px;
}

.error-banner .el-button {
  margin-left: auto;
}

.phase-info {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  min-width: 80px;
}

.step-counter {
  font-size: 12px;
  color: var(--text-muted);
}

.lf-main {
  flex: 1;
  display: flex;
  gap: 16px;
  overflow: hidden;
}

.steps-panel {
  width: 360px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.panel-title {
  padding: 16px;
  border-bottom: 1px solid var(--border-color);
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.result-actions {
  display: flex;
  gap: 4px;
}

.steps-panel > div:not(.panel-title):not(.execution-controls) {
  overflow-y: auto;
}

.steps-section {
  padding: 12px;
}

.steps-section-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-muted);
  padding: 8px 12px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.step-item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px 12px;
  border-radius: var(--radius-md);
  margin-bottom: 4px;
  transition: all 0.2s ease;
  position: relative;
}

.step-item.active {
  background: rgba(108, 92, 231, 0.12);
}

.step-item.completed {
  opacity: 0.8;
}

.step-marker {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  border: 2px solid;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 600;
  color: white;
  flex-shrink: 0;
  transition: all 0.3s ease;
}

.step-content {
  flex: 1;
  min-width: 0;
}

.step-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.step-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
}

.step-desc {
  font-size: 11px;
  color: var(--text-muted);
  display: block;
  margin-top: 2px;
}

.step-result-tag {
  margin-top: 4px;
}

.phase-divider {
  padding: 12px;
  text-align: center;
  font-size: 12px;
  font-weight: 600;
  color: var(--accent-secondary);
  border-top: 1px solid var(--border-color);
  border-bottom: 1px solid var(--border-color);
  margin: 8px 0;
}

.chapters-gen-info {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  color: var(--text-muted);
  padding: 4px 12px;
}

.chapter-gen-item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 8px 12px;
  border-radius: var(--radius-md);
  margin-bottom: 4px;
}

.chapter-gen-item.active {
  background: rgba(108, 92, 231, 0.12);
}

.ch-gen-marker {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  border: 2px solid var(--border-color);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  color: var(--text-muted);
  flex-shrink: 0;
}

.chapter-gen-item.completed .ch-gen-marker {
  background: var(--success);
  border-color: var(--success);
  color: white;
}

.ch-gen-info {
  flex: 1;
  min-width: 0;
}

.ch-gen-title {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-primary);
  display: block;
}

.ch-gen-steps {
  display: flex;
  gap: 4px;
  margin-top: 4px;
}

.ch-step-tag {
  display: flex;
  align-items: center;
  gap: 2px;
  font-size: 10px;
  color: var(--text-muted);
  padding: 1px 6px;
  border-radius: 8px;
  background: var(--bg-tertiary);
}

.ch-step-tag.done {
  color: var(--success);
  background: rgba(0, 184, 148, 0.1);
}

.execution-controls {
  padding: 16px;
  border-top: 1px solid var(--border-color);
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.result-panel {
  flex: 1;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.result-content {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
}

.empty-result {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: var(--text-muted);
}

.empty-result p {
  font-size: 14px;
}

.empty-hint {
  font-size: 12px !important;
  color: var(--text-muted);
}

.streaming-indicator {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
  color: var(--accent-secondary);
  font-size: 13px;
}

.result-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}

.result-time {
  font-size: 12px;
  color: var(--text-muted);
}

.logs-section {
  border-top: 1px solid var(--border-color);
  max-height: 200px;
  display: flex;
  flex-direction: column;
}

.logs-header {
  padding: 10px 16px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  cursor: pointer;
  font-size: 13px;
  color: var(--text-secondary);
  background: var(--bg-tertiary);
}

.logs-list {
  overflow-y: auto;
  padding: 8px 16px;
}

.log-item {
  display: flex;
  gap: 8px;
  padding: 4px 0;
  font-size: 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.03);
}

.log-time {
  color: var(--text-muted);
  flex-shrink: 0;
}

.log-step {
  color: var(--accent-secondary);
  font-weight: 500;
  min-width: 100px;
  flex-shrink: 0;
}

.log-message {
  color: var(--text-secondary);
  flex: 1;
}

.log-item.error .log-message {
  color: var(--danger);
}

.log-item.success .log-message {
  color: var(--success);
}

.empty-logs {
  text-align: center;
  padding: 12px;
  color: var(--text-muted);
  font-size: 12px;
}

.config-hint {
  display: block;
  font-size: 12px;
  color: var(--text-muted);
  margin-top: 4px;
}
</style>
