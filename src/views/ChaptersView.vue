<template>
  <div class="chapters-page" v-if="project">
    <div class="chapters-header">
      <h1 class="page-title">章节编辑</h1>
      <div class="header-actions">
        <el-dropdown @command="handleExport">
          <el-button>
            <el-icon><Download /></el-icon>
            导出小说
            <el-icon class="el-icon--right"><ArrowDown /></el-icon>
          </el-button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="txt">导出 TXT</el-dropdown-item>
              <el-dropdown-item command="md">导出 Markdown</el-dropdown-item>
              <el-dropdown-item command="zip">导出 ZIP完整包</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
        <el-button type="primary" class="glow-button" @click="showAddChapter = true">
          <el-icon><Plus /></el-icon>
          新建章节
        </el-button>
      </div>
    </div>

    <div class="chapters-layout">
      <div class="chapter-list-panel">
        <div class="panel-header">
          <span>章节列表 ({{ chapters.length }})</span>
        </div>
        <div class="chapter-items">
          <div
            v-for="(ch, i) in sortedChapters"
            :key="ch.id"
            class="chapter-item"
            :class="{ active: selectedChapterId === ch.id }"
            @click="selectChapter(ch.id)"
          >
            <div class="chapter-item-header">
              <span class="chapter-num">第{{ ch.order + 1 }}章</span>
              <el-tag :type="statusTag(ch.status)" size="small" effect="plain">
                {{ statusText(ch.status) }}
              </el-tag>
            </div>
            <span class="chapter-item-title">{{ ch.title }}</span>
            <span class="chapter-item-words">{{ ch.wordCount || 0 }} 字</span>
          </div>
          <div v-if="chapters.length === 0" class="empty-mini">
            还没有章节
          </div>
        </div>
      </div>

      <div class="chapter-editor-panel" v-if="currentChapter">
        <div class="editor-header">
          <el-input v-model="currentChapter.title" class="title-input" size="large" placeholder="章节标题" />
          <div class="editor-actions">
            <el-select v-model="currentChapter.status" size="small" style="width: 100px">
              <el-option label="草稿" value="draft" />
              <el-option label="进行中" value="in-progress" />
              <el-option label="已完成" value="completed" />
              <el-option label="修订中" value="revising" />
            </el-select>
            <el-button @click="showAIPanel = !showAIPanel" :type="showAIPanel ? 'primary' : ''">
              <el-icon><MagicStick /></el-icon>
              AI辅助
            </el-button>
            <el-button type="primary" class="glow-button" @click="saveChapter">
              <el-icon><Check /></el-icon>
              保存
            </el-button>
          </div>
        </div>

        <div class="editor-body">
          <div class="editor-main" :class="{ 'with-ai': showAIPanel }">
            <el-input
              v-model="currentChapter.content"
              type="textarea"
              :rows="30"
              placeholder="开始写作..."
              resize="none"
              class="content-editor"
              @input="onContentChange"
            />
            <div class="editor-footer">
              <span>{{ currentChapter.content?.length || 0 }} 字</span>
              <span v-if="currentChapter.summary">摘要：{{ currentChapter.summary }}</span>
            </div>
          </div>

          <transition name="slide-fade">
            <div v-if="showAIPanel" class="ai-assist-panel">
              <div class="ai-panel-header">
                <span>AI辅助写作</span>
                <el-button text size="small" @click="showAIPanel = false">
                  <el-icon><Close /></el-icon>
                </el-button>
              </div>

              <div class="ai-actions">
                <el-button @click="aiAction('continue')" :loading="aiLoading" class="ai-btn">
                  <el-icon><Right /></el-icon> 续写
                </el-button>
                <el-button @click="aiAction('rewrite')" :loading="aiLoading" class="ai-btn">
                  <el-icon><RefreshRight /></el-icon> 重写
                </el-button>
                <el-button @click="aiAction('polish')" :loading="aiLoading" class="ai-btn">
                  <el-icon><MagicStick /></el-icon> 润色
                </el-button>
                <el-button @click="aiAction('expand')" :loading="aiLoading" class="ai-btn">
                  <el-icon><FullScreen /></el-icon> 扩写
                </el-button>
                <el-button @click="aiAction('summary')" :loading="aiLoading" class="ai-btn">
                  <el-icon><Document /></el-icon> 生成摘要
                </el-button>
                <el-button @click="aiAction('dialogue')" :loading="aiLoading" class="ai-btn">
                  <el-icon><ChatDotRound /></el-icon> 对话
                </el-button>
              </div>

              <div class="ai-prompt-section">
                <span class="ai-label">自定义指令</span>
                <el-input
                  v-model="aiCustomPrompt"
                  type="textarea"
                  :rows="2"
                  placeholder="告诉AI你想怎么修改..."
                  size="small"
                />
                <el-button type="primary" size="small" class="glow-button" @click="aiAction('custom')" :loading="aiLoading" style="margin-top: 8px; width: 100%;">
                  执行
                </el-button>
              </div>

              <div v-if="aiResult" class="ai-result">
                <span class="ai-label">AI结果</span>
                <div class="ai-result-content" v-html="renderMarkdown(aiResult)"></div>
                <div class="ai-result-actions">
                  <el-button text size="small" @click="appendResult">追加到正文</el-button>
                  <el-button text size="small" @click="replaceResult">替换正文</el-button>
                  <el-button text size="small" @click="copyResult">复制</el-button>
                </div>
              </div>

              <div v-if="aiLoading" class="ai-loading">
                <el-icon class="is-loading"><Loading /></el-icon>
                <span>AI正在生成...</span>
              </div>
            </div>
          </transition>
        </div>
      </div>

      <div v-else class="no-chapter">
        <el-empty description="选择一个章节开始编辑，或创建新章节" />
      </div>
    </div>

    <el-dialog v-model="showAddChapter" title="新建章节" width="480px">
      <el-form :model="newChapter" label-width="80px">
        <el-form-item label="章节标题">
          <el-input v-model="newChapter.title" placeholder="例如：初入江湖" />
        </el-form-item>
        <el-form-item label="章节摘要">
          <el-input
            v-model="newChapter.summary"
            type="textarea"
            :rows="2"
            placeholder="本章内容摘要（可选）"
          />
        </el-form-item>
        <el-form-item label="AI生成">
          <el-switch v-model="newChapter.useAI" />
          <span style="margin-left: 8px; font-size: 12px; color: var(--text-muted)">开启后创建时自动让AI生成初稿</span>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showAddChapter = false">取消</el-button>
        <el-button type="primary" class="glow-button" @click="addChapter">创建</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import { useProjectStore } from '@/stores/project'
import { useSettingsStore } from '@/stores/settings'
import { streamChat, buildAgentMessages } from '@/utils/api'
import { exportAsTxt, exportAsMarkdown, exportAsZip } from '@/utils/export'

const projectStore = useProjectStore()
const settings = useSettingsStore()

const project = computed(() => projectStore.currentProject)
const chapters = computed(() => projectStore.chapters)
const sortedChapters = computed(() =>
  [...chapters.value].sort((a, b) => (a.order || 0) - (b.order || 0))
)

const selectedChapterId = ref(null)
const currentChapter = ref(null)
const showAIPanel = ref(false)
const aiLoading = ref(false)
const aiResult = ref('')
const aiCustomPrompt = ref('')
const showAddChapter = ref(false)

const newChapter = reactive({
  title: '',
  summary: '',
  useAI: false
})

watch(sortedChapters, (list) => {
  if (list.length > 0 && !selectedChapterId.value) {
    selectChapter(list[0].id)
  }
}, { immediate: true })

function selectChapter(id) {
  selectedChapterId.value = id
  const ch = chapters.value.find(c => c.id === id)
  currentChapter.value = ch ? { ...ch } : null
  aiResult.value = ''
  aiCustomPrompt.value = ''
}

function onContentChange() {
  if (currentChapter.value) {
    currentChapter.value.wordCount = currentChapter.value.content?.length || 0
  }
}

function saveChapter() {
  if (!currentChapter.value) return
  projectStore.updateChapter(currentChapter.value.id, { ...currentChapter.value })
  ElMessage.success('章节已保存')
}

function statusText(status) {
  const map = { draft: '草稿', 'in-progress': '进行中', completed: '已完成', revising: '修订中' }
  return map[status] || '草稿'
}

function statusTag(status) {
  const map = { draft: 'info', 'in-progress': 'warning', completed: 'success', revising: '' }
  return map[status] || 'info'
}

async function addChapter() {
  if (!newChapter.title.trim()) {
    ElMessage.warning('请输入章节标题')
    return
  }

  const ch = projectStore.addChapter({
    title: newChapter.title,
    summary: newChapter.summary,
    order: chapters.value.length,
    status: 'draft'
  })

  if (newChapter.useAI) {
    selectChapter(ch.id)
    showAddChapter.value = false
    await aiGenerateDraft()
  } else {
    selectChapter(ch.id)
    showAddChapter.value = false
  }

  ElMessage.success('章节已创建')
  newChapter.title = ''
  newChapter.summary = ''
  newChapter.useAI = false
}

async function aiGenerateDraft() {
  if (!settings.hasApiKey) {
    ElMessage.warning('请先配置API Key')
    return
  }

  aiLoading.value = true
  showAIPanel.value = true

  const agent = settings.agentRoles.find(a => a.id === 'scene-writer') || settings.enabledAgents[0]
  const prompt = `请为以下小说撰写第${(currentChapter.value?.order || 0) + 1}章的内容。

小说标题：${project.value?.title || '未命名'}
小说类型：${project.value?.genre || '未指定'}
写作风格：${project.value?.style || '未指定'}
章节标题：${currentChapter.value?.title || '未命名'}
${currentChapter.value?.summary ? `章节摘要：${currentChapter.value.summary}` : ''}
${project.value?.outline ? `故事大纲：\n${project.value.outline}` : ''}

请撰写本章内容，约2000字左右。注意情节推进和场景描写。`

  const context = {
    projectTitle: project.value?.title,
    genre: project.value?.genre,
    style: project.value?.style,
    outline: project.value?.outline,
    characters: project.value?.characters,
    previousChapters: project.value?.chapters
      .filter(c => c.id !== currentChapter.value?.id)
      .slice(-1)[0]?.content?.slice(0, 2000)
  }

  const messages = buildAgentMessages(agent, prompt, context)

  try {
    let result = ''
    await streamChat(messages, (chunk, full) => {
      result = full
      currentChapter.value.content = full
    }, {
      provider: settings.activeProvider,
      model: settings.currentProvider?.model,
      temperature: settings.temperature,
      maxTokens: settings.maxTokens,
      projectId: project.value?.id,
      agentId: agent.id
    })
    currentChapter.value.content = result
    currentChapter.value.wordCount = result.length
    ElMessage.success('AI初稿生成完成')
  } catch (error) {
    ElMessage.error(error.message || '生成失败')
  } finally {
    aiLoading.value = false
  }
}

async function aiAction(action) {
  if (!currentChapter.value?.content && action !== 'continue') {
    ElMessage.warning('请先写一些内容')
    return
  }

  if (!settings.hasApiKey) {
    ElMessage.warning('请先配置API Key')
    return
  }

  aiLoading.value = true
  aiResult.value = ''

  const agentMap = {
    continue: { id: 'plot-weaver', name: '情节编织者' },
    rewrite: { id: 'polish-editor', name: '润色编辑' },
    polish: { id: 'polish-editor', name: '润色编辑' },
    expand: { id: 'scene-writer', name: '场景描写师' },
    summary: { id: 'outline-architect', name: '大纲架构师' },
    dialogue: { id: 'dialogue-master', name: '对话大师' },
    custom: { id: 'polish-editor', name: '润色编辑' }
  }

  const agent = settings.agentRoles.find(a => a.id === agentMap[action].id) || settings.enabledAgents[0]

  const actionPrompts = {
    continue: `请续写以下内容，保持风格一致，约500字：\n\n${currentChapter.value.content.slice(-1000)}`,
    rewrite: `请重写以下内容，保持原意但提升质量：\n\n${currentChapter.value.content}`,
    polish: `请润色以下内容，保持原意但让文字更优美流畅：\n\n${currentChapter.value.content}`,
    expand: `请扩写以下内容，增加更多细节和描写：\n\n${currentChapter.value.content.slice(0, 1000)}`,
    summary: `请为以下章节内容生成一个简短的摘要（100字内）：\n\n${currentChapter.value.content}`,
    dialogue: `请为以下场景添加更多生动的人物对话：\n\n${currentChapter.value.content.slice(0, 1000)}`,
    custom: `${aiCustomPrompt.value}\n\n以下是需要处理的内容：\n\n${currentChapter.value.content}`
  }

  if (action === 'custom' && !aiCustomPrompt.value.trim()) {
    ElMessage.warning('请输入自定义指令')
    aiLoading.value = false
    return
  }

  const context = {
    projectTitle: project.value?.title,
    genre: project.value?.genre,
    style: project.value?.style,
    characters: project.value?.characters
  }

  const messages = buildAgentMessages(agent, actionPrompts[action], context)

  try {
    let result = ''
    await streamChat(messages, (chunk, full) => {
      result = full
      aiResult.value = full
    }, {
      provider: settings.activeProvider,
      model: settings.currentProvider?.model,
      temperature: settings.temperature,
      maxTokens: settings.maxTokens,
      projectId: project.value?.id,
      agentId: agent.id
    })
    aiResult.value = result
  } catch (error) {
    ElMessage.error(error.message || '生成失败')
  } finally {
    aiLoading.value = false
  }
}

function appendResult() {
  if (!aiResult.value || !currentChapter.value) return
  currentChapter.value.content = (currentChapter.value.content || '') + '\n\n' + aiResult.value
  currentChapter.value.wordCount = currentChapter.value.content.length
  ElMessage.success('已追加到正文')
}

function replaceResult() {
  if (!aiResult.value || !currentChapter.value) return
  currentChapter.value.content = aiResult.value
  currentChapter.value.wordCount = currentChapter.value.content.length
  ElMessage.success('已替换正文')
}

function copyResult() {
  navigator.clipboard.writeText(aiResult.value)
  ElMessage.success('已复制')
}

function renderMarkdown(text) {
  if (!text) return ''
  return DOMPurify.sanitize(marked(text))
}

function handleExport(format) {
  if (!project.value) return
  if (format === 'txt') exportAsTxt(project.value)
  else if (format === 'md') exportAsMarkdown(project.value)
  else if (format === 'zip') exportAsZip(project.value).then(() => ElMessage.success('ZIP导出成功'))
}
</script>

<style scoped>
.chapters-page {
  height: 100vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding: 24px 32px;
}

.chapters-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.header-actions {
  display: flex;
  gap: 12px;
}

.chapters-layout {
  flex: 1;
  display: flex;
  gap: 16px;
  overflow: hidden;
}

.chapter-list-panel {
  width: 240px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.panel-header {
  padding: 16px;
  border-bottom: 1px solid var(--border-color);
  font-size: 14px;
  font-weight: 500;
  color: var(--text-secondary);
}

.chapter-items {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.chapter-item {
  padding: 10px 12px;
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all 0.2s ease;
  margin-bottom: 4px;
}

.chapter-item:hover {
  background: var(--bg-hover);
}

.chapter-item.active {
  background: rgba(108, 92, 231, 0.15);
  border-left: 3px solid var(--accent-primary);
}

.chapter-item-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 4px;
}

.chapter-num {
  font-size: 12px;
  color: var(--accent-secondary);
  font-weight: 500;
}

.chapter-item-title {
  display: block;
  font-size: 14px;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.chapter-item-words {
  font-size: 11px;
  color: var(--text-muted);
  margin-top: 4px;
  display: block;
}

.empty-mini {
  text-align: center;
  padding: 24px;
  color: var(--text-muted);
  font-size: 13px;
}

.chapter-editor-panel {
  flex: 1;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.editor-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px;
  border-bottom: 1px solid var(--border-color);
  gap: 16px;
}

.title-input :deep(.el-input__wrapper) {
  background: transparent !important;
  box-shadow: none !important;
}

.title-input :deep(.el-input__inner) {
  font-size: 18px;
  font-weight: 600;
}

.editor-actions {
  display: flex;
  gap: 8px;
  align-items: center;
}

.editor-body {
  flex: 1;
  display: flex;
  overflow: hidden;
}

.editor-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 0;
  transition: all 0.3s ease;
}

.editor-main.with-ai {
  flex: 1;
}

.content-editor :deep(.el-textarea__inner) {
  border: none !important;
  box-shadow: none !important;
  padding: 20px;
  font-size: 15px;
  line-height: 2;
  height: 100% !important;
  min-height: 500px !important;
}

.editor-footer {
  display: flex;
  justify-content: space-between;
  padding: 8px 20px;
  border-top: 1px solid var(--border-color);
  font-size: 12px;
  color: var(--text-muted);
}

.ai-assist-panel {
  width: 320px;
  border-left: 1px solid var(--border-color);
  display: flex;
  flex-direction: column;
  padding: 16px;
  overflow-y: auto;
  background: var(--bg-tertiary);
}

.ai-panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.ai-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  margin-bottom: 16px;
}

.ai-btn {
  font-size: 12px !important;
  padding: 8px 4px !important;
}

.ai-prompt-section {
  margin-bottom: 16px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--border-color);
}

.ai-label {
  display: block;
  font-size: 12px;
  color: var(--text-muted);
  margin-bottom: 8px;
}

.ai-result {
  margin-top: 16px;
}

.ai-result-content {
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  padding: 12px;
  font-size: 13px;
  line-height: 1.7;
  max-height: 300px;
  overflow-y: auto;
  margin-bottom: 8px;
}

.ai-result-actions {
  display: flex;
  gap: 4px;
}

.ai-loading {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px;
  color: var(--accent-secondary);
  font-size: 13px;
}

.no-chapter {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
