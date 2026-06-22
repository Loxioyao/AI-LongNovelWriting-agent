<template>
  <div class="agents-page" v-if="project">
    <div class="agents-header">
      <div>
        <h1 class="page-title">AI协作室</h1>
        <p class="page-desc">让多个AI角色协作完成创作任务，支持流式输出实时查看</p>
      </div>
      <div class="header-actions">
        <el-select v-model="selectedAgent" placeholder="选择AI角色" style="width: 180px">
          <el-option
            v-for="agent in enabledAgents"
            :key="agent.id"
            :label="agent.name"
            :value="agent.id"
          >
            <div style="display: flex; align-items: center; gap: 8px;">
              <el-icon :color="agent.color"><component :is="agent.icon" /></el-icon>
              <span>{{ agent.name }}</span>
            </div>
          </el-option>
        </el-select>
        <el-button type="primary" class="glow-button" @click="showMultiAgentDialog = true">
          <el-icon><Connection /></el-icon>
          多AI协作
        </el-button>
      </div>
    </div>

    <div class="agents-layout">
      <div class="agents-sidebar">
        <h3>AI角色团队</h3>
        <div class="agent-list">
          <div
            v-for="agent in settings.agentRoles"
            :key="agent.id"
            class="agent-card"
            :class="{ active: selectedAgent === agent.id, disabled: !agent.enabled }"
            @click="agent.enabled && (selectedAgent = agent.id)"
          >
            <div class="agent-avatar" :style="{ background: agent.color }">
              <el-icon :size="18"><component :is="agent.icon" /></el-icon>
            </div>
            <div class="agent-info">
              <span class="agent-name">{{ agent.name }}</span>
              <span class="agent-status">{{ agent.enabled ? '已启用' : '已禁用' }}</span>
            </div>
            <el-switch
              v-model="agent.enabled"
              size="small"
              @click.stop
              @change="settings.saveToStorage()"
            />
          </div>
        </div>

        <div class="collaboration-modes">
          <h3>协作模式</h3>
          <div class="mode-list">
            <div
              v-for="mode in collaborationModes"
              :key="mode.id"
              class="mode-card"
              :class="{ active: selectedMode === mode.id }"
              @click="selectedMode = mode.id"
            >
              <el-icon :size="20"><component :is="mode.icon" /></el-icon>
              <div class="mode-info">
                <span class="mode-name">{{ mode.name }}</span>
                <span class="mode-desc">{{ mode.desc }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="agents-main">
        <div class="chat-area">
          <div class="chat-messages" ref="messagesContainer">
            <div v-if="messages.length === 0" class="chat-empty">
              <el-icon :size="48" color="var(--text-muted)"><ChatDotRound /></el-icon>
              <p>选择一个AI角色，输入你的创作需求开始协作</p>
              <div class="suggestions">
                <el-button
                  v-for="s in suggestions"
                  :key="s"
                  size="small"
                  round
                  @click="quickPrompt = s"
                >{{ s }}</el-button>
              </div>
            </div>

            <div
              v-for="msg in messages"
              :key="msg.id"
              class="message"
              :class="msg.role"
            >
              <div class="message-avatar" v-if="msg.role === 'assistant'">
                <el-icon :color="msg.agentColor"><component :is="msg.agentIcon" /></el-icon>
              </div>
              <div class="message-avatar user" v-else>
                <el-icon><User /></el-icon>
              </div>
              <div class="message-content">
                <div class="message-header">
                  <span class="message-name">{{ msg.role === 'assistant' ? msg.agentName : '我' }}</span>
                  <span class="message-time">{{ formatTime(msg.timestamp) }}</span>
                </div>
                <div class="message-body" v-html="renderMarkdown(msg.content)"></div>
                <div class="message-actions" v-if="msg.role === 'assistant' && msg.content">
                  <el-button text size="small" @click="copyContent(msg.content)">
                    <el-icon><CopyDocument /></el-icon> 复制
                  </el-button>
                  <el-button text size="small" @click="useResult(msg.content)">
                    <el-icon><Check /></el-icon> 使用结果
                  </el-button>
                </div>
              </div>
            </div>

            <div v-if="loading" class="message assistant">
              <div class="message-avatar">
                <el-icon :color="currentAgent?.color"><component :is="currentAgent?.icon" /></el-icon>
              </div>
              <div class="message-content">
                <div class="message-header">
                  <span class="message-name">{{ currentAgent?.name }}</span>
                  <span class="typing-indicator">
                    <span></span><span></span><span></span>
                  </span>
                </div>
                <div class="message-body streaming" v-html="renderMarkdown(streamingContent)"></div>
              </div>
            </div>
          </div>

          <div class="chat-input-area">
            <div class="input-toolbar">
              <el-tooltip content="清空对话" placement="top">
                <el-button text size="small" @click="messages = []">
                  <el-icon><Delete /></el-icon>
                </el-button>
              </el-tooltip>
              <el-tooltip content="AI温度" placement="top">
                <span class="toolbar-item">
                  温度: {{ settings.temperature }}
                  <el-slider v-model="settings.temperature" :min="0" :max="2" :step="0.1" style="width: 80px;" size="small" @change="settings.saveToStorage()" />
                </span>
              </el-tooltip>
            </div>
            <div class="input-row">
              <el-input
                v-model="quickPrompt"
                type="textarea"
                :rows="3"
                placeholder="输入你的创作需求，例如：帮我设计一个拥有时间穿越能力的女主角..."
                @keydown.ctrl.enter="sendPrompt"
                resize="none"
              />
              <el-button
                type="primary"
                class="glow-button send-btn"
                :loading="loading"
                @click="sendPrompt"
                :disabled="!quickPrompt.trim()"
              >
                <el-icon v-if="!loading"><Promotion /></el-icon>
                {{ loading ? '生成中' : '发送' }}
              </el-button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <el-dialog v-model="showMultiAgentDialog" title="多AI协作模式" width="640px">
      <p style="color: var(--text-secondary); margin-bottom: 16px;">
        选择多个AI角色按顺序协作完成任务，每个角色会基于前一个角色的输出继续创作。
      </p>
      <div class="multi-agent-select">
        <div
          v-for="agent in enabledAgents"
          :key="agent.id"
          class="multi-agent-item"
          :class="{ selected: multiAgentSelected.includes(agent.id) }"
          @click="toggleMultiAgent(agent.id)"
        >
          <el-icon :color="agent.color"><component :is="agent.icon" /></el-icon>
          <span>{{ agent.name }}</span>
          <el-icon v-if="multiAgentSelected.includes(agent.id)" class="check-icon"><CircleCheck /></el-icon>
        </div>
      </div>
      <div v-if="multiAgentSelected.length > 0" class="agent-order">
        <span>协作顺序：</span>
        <el-tag v-for="(id, i) in multiAgentSelected" :key="id" style="margin: 0 4px;">
          {{ i + 1 }}. {{ getAgentName(id) }}
        </el-tag>
      </div>
      <el-input
        v-model="multiAgentPrompt"
        type="textarea"
        :rows="3"
        placeholder="描述你要让AI团队完成的任务..."
        style="margin-top: 16px;"
      />
      <template #footer>
        <el-button @click="showMultiAgentDialog = false">取消</el-button>
        <el-button type="primary" class="glow-button" @click="startMultiAgent" :loading="loading">
          开始协作
        </el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="showUseResultDialog" title="使用AI生成结果" width="480px">
      <p style="color: var(--text-secondary); margin-bottom: 16px;">
        选择将AI生成的内容用于：
      </p>
      <div class="use-options">
        <el-button @click="useAs('outline')" style="margin: 4px;">设为故事大纲</el-button>
        <el-button @click="useAs('character')" style="margin: 4px;">添加为人物卡</el-button>
        <el-button @click="useAs('chapter')" style="margin: 4px;">添加为新章节</el-button>
        <el-button @click="useAs('worldBuilding')" style="margin: 4px;">设为世界观设定</el-button>
      </div>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, nextTick, watch } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import { useProjectStore } from '@/stores/project'
import { useSettingsStore } from '@/stores/settings'
import { streamChat, buildAgentMessages } from '@/utils/api'

const route = useRoute()
const projectStore = useProjectStore()
const settings = useSettingsStore()

const project = computed(() => projectStore.currentProject)
const projectId = route.params.id

const selectedAgent = ref('outline-architect')
const selectedMode = ref('single')
const quickPrompt = ref('')
const messages = ref([])
const loading = ref(false)
const streamingContent = ref('')
const messagesContainer = ref(null)
const showMultiAgentDialog = ref(false)
const multiAgentSelected = ref([])
const multiAgentPrompt = ref('')
const showUseResultDialog = ref(false)
const lastResultContent = ref('')

const enabledAgents = computed(() => settings.enabledAgents)

const currentAgent = computed(() =>
  settings.agentRoles.find(a => a.id === selectedAgent.value)
)

const collaborationModes = [
  { id: 'single', name: '单角色对话', desc: '与单个AI角色对话', icon: 'ChatDotRound' },
  { id: 'sequential', name: '顺序协作', desc: '多角色按顺序接力创作', icon: 'Connection' },
  { id: 'brainstorm', name: '头脑风暴', desc: '多角色同时给出方案', icon: 'Lightning' }
]

const suggestions = [
  '帮我设计一个奇幻世界的世界观',
  '创建一个有反转的反派角色',
  '写一段紧张刺激的追逐场景',
  '设计一个出人意料的情节转折'
]

function renderMarkdown(text) {
  if (!text) return ''
  const html = marked(text)
  return DOMPurify.sanitize(html)
}

function formatTime(ts) {
  const d = new Date(ts)
  return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
}

function getAgentName(id) {
  return settings.agentRoles.find(a => a.id === id)?.name || id
}

async function scrollToBottom() {
  await nextTick()
  if (messagesContainer.value) {
    messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
  }
}

watch(messages, scrollToBottom, { deep: true })
watch(streamingContent, scrollToBottom)

async function sendPrompt() {
  if (!quickPrompt.value.trim() || loading.value) return
  if (!settings.hasApiKey) {
    ElMessage.warning('请先在设置中配置API Key')
    return
  }

  const userPrompt = quickPrompt.value.trim()
  quickPrompt.value = ''

  messages.value.push({
    id: `msg-${Date.now()}`,
    role: 'user',
    content: userPrompt,
    timestamp: new Date().toISOString()
  })

  await sendToAgent(currentAgent.value, userPrompt)
}

async function sendToAgent(agent, prompt) {
  loading.value = true
  streamingContent.value = ''

  const context = {
    projectTitle: project.value?.title,
    genre: project.value?.genre,
    style: project.value?.style,
    outline: project.value?.outline,
    characters: project.value?.characters,
    previousChapters: project.value?.chapters
      .slice(-1)[0]?.content?.slice(0, 2000)
  }

  const aiMessages = buildAgentMessages(agent, prompt, context)

  try {
    const result = await streamChat(
      aiMessages,
      (chunk, full) => {
        streamingContent.value = full
      },
      {
        provider: settings.activeProvider,
        model: settings.currentProvider?.model,
        temperature: settings.temperature,
        maxTokens: settings.maxTokens,
        projectId,
        agentId: agent.id
      }
    )

    messages.value.push({
      id: `msg-${Date.now()}`,
      role: 'assistant',
      content: result.content,
      agentName: agent.name,
      agentIcon: agent.icon,
      agentColor: agent.color,
      timestamp: new Date().toISOString()
    })

    projectStore.addAgentHistory({
      agentId: agent.id,
      agentName: agent.name,
      prompt: prompt,
      response: result.content
    })
  } catch (error) {
    ElMessage.error(error.message || 'AI请求失败')
    messages.value.push({
      id: `msg-${Date.now()}`,
      role: 'assistant',
      content: `❌ 请求失败：${error.message}`,
      agentName: agent.name,
      agentIcon: agent.icon,
      agentColor: agent.color,
      timestamp: new Date().toISOString()
    })
  } finally {
    loading.value = false
    streamingContent.value = ''
  }
}

function toggleMultiAgent(agentId) {
  const idx = multiAgentSelected.value.indexOf(agentId)
  if (idx !== -1) {
    multiAgentSelected.value.splice(idx, 1)
  } else {
    multiAgentSelected.value.push(agentId)
  }
}

async function startMultiAgent() {
  if (multiAgentSelected.value.length === 0) {
    ElMessage.warning('请至少选择一个AI角色')
    return
  }
  if (!multiAgentPrompt.value.trim()) {
    ElMessage.warning('请描述协作任务')
    return
  }

  showMultiAgentDialog.value = false
  const task = multiAgentPrompt.value.trim()
  multiAgentPrompt.value = ''

  messages.value.push({
    id: `msg-${Date.now()}`,
    role: 'user',
    content: `【多AI协作任务】${task}`,
    timestamp: new Date().toISOString()
  })

  let accumulatedContent = ''

  for (const agentId of multiAgentSelected.value) {
    const agent = settings.agentRoles.find(a => a.id === agentId)
    if (!agent) continue

    messages.value.push({
      id: `msg-${Date.now()}`,
      role: 'user',
      content: `→ 轮到 ${agent.name} 处理`,
      timestamp: new Date().toISOString()
    })

    const prompt = accumulatedContent
      ? `前一位AI角色（${settings.agentRoles.find(a => a.id === multiAgentSelected.value[multiAgentSelected.value.indexOf(agentId) - 1])?.name}）的输出：\n\n${accumulatedContent}\n\n请基于以上内容，继续完成任务：${task}`
      : task

    await sendToAgent(agent, prompt)
    const lastMsg = messages.value[messages.value.length - 1]
    if (lastMsg && lastMsg.role === 'assistant') {
      accumulatedContent = lastMsg.content
    }
  }

  ElMessage.success('多AI协作完成！')
  multiAgentSelected.value = []
}

function copyContent(content) {
  navigator.clipboard.writeText(content).then(() => {
    ElMessage.success('已复制到剪贴板')
  })
}

function useResult(content) {
  lastResultContent.value = content
  showUseResultDialog.value = true
}

function useAs(type) {
  const content = lastResultContent.value
  if (type === 'outline') {
    projectStore.updateOutline(content)
    ElMessage.success('已设为故事大纲')
  } else if (type === 'character') {
    projectStore.addCharacter({
      name: 'AI生成角色',
      role: '待设定',
      personality: '待设定',
      background: content.slice(0, 500)
    })
    ElMessage.success('已添加为人物卡')
  } else if (type === 'chapter') {
    projectStore.addChapter({
      title: `AI生成章节 ${projectStore.chapters.length + 1}`,
      content: content
    })
    ElMessage.success('已添加为新章节')
  } else if (type === 'worldBuilding') {
    projectStore.updateWorldBuilding({ setting: content })
    ElMessage.success('已设为世界观设定')
  }
  showUseResultDialog.value = false
}
</script>

<style scoped>
.agents-page {
  height: 100vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.agents-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  padding: 24px 32px 16px;
}

.page-desc {
  color: var(--text-muted);
  font-size: 13px;
  margin-top: 4px;
}

.header-actions {
  display: flex;
  gap: 12px;
}

.agents-layout {
  flex: 1;
  display: flex;
  gap: 0;
  overflow: hidden;
  padding: 0 32px 24px;
}

.agents-sidebar {
  width: 280px;
  display: flex;
  flex-direction: column;
  gap: 20px;
  overflow-y: auto;
  padding-right: 16px;
}

.agents-sidebar h3 {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-secondary);
  margin-bottom: 12px;
}

.agent-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.agent-card {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: var(--radius-md);
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  cursor: pointer;
  transition: all 0.2s ease;
}

.agent-card:hover:not(.disabled) {
  border-color: rgba(108, 92, 231, 0.3);
  background: var(--bg-hover);
}

.agent-card.active {
  border-color: var(--accent-primary);
  background: rgba(108, 92, 231, 0.1);
}

.agent-card.disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.agent-avatar {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  flex-shrink: 0;
}

.agent-info {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.agent-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
}

.agent-status {
  font-size: 12px;
  color: var(--text-muted);
}

.collaboration-modes {
  border-top: 1px solid var(--border-color);
  padding-top: 16px;
}

.mode-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.mode-card {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: var(--radius-md);
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  cursor: pointer;
  transition: all 0.2s ease;
}

.mode-card:hover,
.mode-card.active {
  border-color: var(--accent-primary);
  background: rgba(108, 92, 231, 0.1);
}

.mode-info {
  display: flex;
  flex-direction: column;
}

.mode-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
}

.mode-desc {
  font-size: 11px;
  color: var(--text-muted);
}

.agents-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  overflow: hidden;
}

.chat-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
}

.chat-empty {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: var(--text-muted);
}

.chat-empty p {
  font-size: 14px;
}

.suggestions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: center;
  max-width: 400px;
}

.message {
  display: flex;
  gap: 12px;
  margin-bottom: 20px;
}

.message-avatar {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  background: var(--bg-tertiary);
  border: 1px solid var(--border-color);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.message-avatar.user {
  background: var(--gradient-1);
  color: white;
}

.message-content {
  flex: 1;
  min-width: 0;
}

.message-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

.message-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}

.message-time {
  font-size: 11px;
  color: var(--text-muted);
}

.message-body {
  font-size: 14px;
  line-height: 1.7;
  color: var(--text-primary);
  word-wrap: break-word;
}

.message-body.streaming::after {
  content: '▌';
  animation: blink 0.8s infinite;
  color: var(--accent-primary);
}

@keyframes blink {
  0%, 50% { opacity: 1; }
  51%, 100% { opacity: 0; }
}

.message-actions {
  display: flex;
  gap: 8px;
  margin-top: 8px;
}

.message.user .message-content {
  background: rgba(108, 92, 231, 0.1);
  border-radius: 0 var(--radius-md) var(--radius-md) 0;
  padding: 12px 16px;
  border-left: 3px solid var(--accent-primary);
}

.typing-indicator {
  display: inline-flex;
  gap: 3px;
  padding: 2px 0;
}

.typing-indicator span {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--accent-secondary);
  animation: typing 1.4s infinite;
}

.typing-indicator span:nth-child(2) { animation-delay: 0.2s; }
.typing-indicator span:nth-child(3) { animation-delay: 0.4s; }

@keyframes typing {
  0%, 60%, 100% { transform: translateY(0); opacity: 0.5; }
  30% { transform: translateY(-6px); opacity: 1; }
}

.chat-input-area {
  border-top: 1px solid var(--border-color);
  padding: 12px 16px;
}

.input-toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 8px;
  font-size: 12px;
  color: var(--text-muted);
}

.toolbar-item {
  display: flex;
  align-items: center;
  gap: 8px;
}

.input-row {
  display: flex;
  gap: 12px;
  align-items: flex-end;
}

.send-btn {
  height: 76px;
  min-width: 80px;
}

.multi-agent-select {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}

.multi-agent-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all 0.2s ease;
  font-size: 13px;
  color: var(--text-secondary);
}

.multi-agent-item:hover {
  border-color: var(--accent-primary);
}

.multi-agent-item.selected {
  border-color: var(--accent-primary);
  background: rgba(108, 92, 231, 0.1);
  color: var(--text-primary);
}

.check-icon {
  margin-left: auto;
  color: var(--success);
}

.agent-order {
  margin-top: 16px;
  padding: 12px;
  background: var(--bg-tertiary);
  border-radius: var(--radius-md);
  font-size: 13px;
  color: var(--text-secondary);
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px;
}

.use-options {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
</style>
