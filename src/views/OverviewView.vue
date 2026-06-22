<template>
  <div class="page-container" v-if="project">
    <h1 class="page-title">项目概览</h1>

    <div class="overview-grid">
      <div class="stats-row">
        <div class="stat-card" v-for="stat in stats" :key="stat.label">
          <div class="stat-icon" :style="{ background: stat.color }">
            <el-icon :size="22"><component :is="stat.icon" /></el-icon>
          </div>
          <div class="stat-info">
            <span class="stat-value">{{ stat.value }}</span>
            <span class="stat-label">{{ stat.label }}</span>
          </div>
        </div>
      </div>

      <div class="overview-main">
        <div class="card overview-info-card">
          <h3>小说信息</h3>
          <div class="info-grid">
            <div class="info-item">
              <span class="info-label">标题</span>
              <span class="info-value">{{ project.title }}</span>
            </div>
            <div class="info-item">
              <span class="info-label">类型</span>
              <el-tag>{{ project.genre }}</el-tag>
            </div>
            <div class="info-item">
              <span class="info-label">风格</span>
              <el-tag type="info">{{ project.style }}</el-tag>
            </div>
            <div class="info-item">
              <span class="info-label">目标字数</span>
              <span class="info-value">{{ project.targetWords.toLocaleString() }} 字</span>
            </div>
            <div class="info-item">
              <span class="info-label">当前字数</span>
              <span class="info-value">{{ totalWords.toLocaleString() }} 字</span>
            </div>
            <div class="info-item">
              <span class="info-label">完成进度</span>
              <el-progress
                :percentage="progressPercent"
                :color="'#6c5ce7'"
                :stroke-width="8"
                style="flex: 1"
              />
            </div>
          </div>
          <div class="summary-section" v-if="project.summary">
            <el-divider>故事简介</el-divider>
            <p class="summary-text">{{ project.summary }}</p>
          </div>
        </div>

        <div class="card quick-actions-card">
          <h3>快捷操作</h3>
          <div class="actions-grid">
            <div class="action-item" v-for="action in quickActions" :key="action.label" @click="action.action">
              <div class="action-icon" :style="{ background: action.color }">
                <el-icon :size="20"><component :is="action.icon" /></el-icon>
              </div>
              <span class="action-label">{{ action.label }}</span>
              <span class="action-desc">{{ action.desc }}</span>
            </div>
          </div>
        </div>
      </div>

      <div class="overview-side">
        <div class="card recent-card">
          <h3>最近章节</h3>
          <div v-if="project.chapters.length === 0" class="empty-mini">
            <span>还没有章节</span>
          </div>
          <div v-else class="chapter-list">
            <div
              v-for="ch in recentChapters"
              :key="ch.id"
              class="chapter-item"
              @click="goToChapter(ch.id)"
            >
              <span class="chapter-num">第{{ ch.order + 1 }}章</span>
              <span class="chapter-title">{{ ch.title }}</span>
              <span class="chapter-words">{{ ch.wordCount }}字</span>
            </div>
          </div>
        </div>

        <div class="card agents-preview-card">
          <h3>AI角色团队</h3>
          <div class="agents-preview">
            <div
              v-for="agent in enabledAgents"
              :key="agent.id"
              class="agent-mini"
              :style="{ borderColor: agent.color }"
            >
              <el-icon :size="16" :color="agent.color"><component :is="agent.icon" /></el-icon>
              <span>{{ agent.name }}</span>
            </div>
          </div>
          <el-button text type="primary" @click="$router.push(`/project/${projectId}/agents`)">
            进入AI协作室
            <el-icon><ArrowRight /></el-icon>
          </el-button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useProjectStore } from '@/stores/project'
import { useSettingsStore } from '@/stores/settings'

const route = useRoute()
const router = useRouter()
const projectStore = useProjectStore()
const settings = useSettingsStore()

const projectId = route.params.id
const project = computed(() => projectStore.currentProject)
const totalWords = computed(() => projectStore.totalWords)
const enabledAgents = computed(() => settings.enabledAgents)

const progressPercent = computed(() => {
  if (!project.value) return 0
  return Math.min(100, Math.round((totalWords.value / project.value.targetWords) * 100))
})

const stats = computed(() => {
  if (!project.value) return []
  return [
    { label: '章节数', value: project.value.chapters.length, icon: 'Document', color: 'var(--gradient-1)' },
    { label: '角色数', value: project.value.characters.length, icon: 'User', color: 'var(--gradient-3)' },
    { label: '总字数', value: totalWords.value.toLocaleString(), icon: 'EditPen', color: 'var(--gradient-4)' },
    { label: 'AI角色', value: enabledAgents.value.length, icon: 'ChatDotRound', color: 'var(--gradient-2)' }
  ]
})

const recentChapters = computed(() => {
  if (!project.value) return []
  return [...project.value.chapters]
    .sort((a, b) => (b.order || 0) - (a.order || 0))
    .slice(0, 5)
})

const quickActions = [
  { label: '生成大纲', desc: '让AI帮你设计故事框架', icon: 'Document', color: 'var(--gradient-1)', action: () => router.push(`/project/${projectId}/outline`) },
  { label: '创建角色', desc: '添加新的人物卡片', icon: 'User', color: 'var(--gradient-3)', action: () => router.push(`/project/${projectId}/characters`) },
  { label: '开始写作', desc: '进入章节编辑器', icon: 'EditPen', color: 'var(--gradient-4)', action: () => router.push(`/project/${projectId}/chapters`) },
  { label: 'AI协作', desc: '与AI角色团队协作', icon: 'ChatDotRound', color: 'var(--gradient-2)', action: () => router.push(`/project/${projectId}/agents`) }
]

function goToChapter(id) {
  router.push(`/project/${projectId}/chapters`)
}
</script>

<style scoped>
.overview-grid {
  display: grid;
  grid-template-columns: 1fr 320px;
  gap: 24px;
  margin-bottom: 24px;
}

.stats-row {
  grid-column: 1 / -1;
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
}

.stat-card {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  padding: 20px;
  display: flex;
  align-items: center;
  gap: 16px;
  transition: all 0.3s ease;
}

.stat-card:hover {
  border-color: rgba(108, 92, 231, 0.3);
  transform: translateY(-2px);
}

.stat-icon {
  width: 48px;
  height: 48px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
}

.stat-info {
  display: flex;
  flex-direction: column;
}

.stat-value {
  font-size: 24px;
  font-weight: 700;
  color: var(--text-primary);
}

.stat-label {
  font-size: 13px;
  color: var(--text-muted);
  margin-top: 2px;
}

.overview-main {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.overview-info-card h3,
.quick-actions-card h3,
.recent-card h3,
.agents-preview-card h3 {
  font-size: 16px;
  font-weight: 600;
  margin-bottom: 16px;
  color: var(--text-primary);
}

.info-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

.info-item {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 14px;
}

.info-label {
  color: var(--text-muted);
  min-width: 70px;
}

.info-value {
  color: var(--text-primary);
  font-weight: 500;
}

.summary-text {
  color: var(--text-secondary);
  line-height: 1.8;
  font-size: 14px;
}

.actions-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
}

.action-item {
  background: var(--bg-tertiary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  padding: 16px 12px;
  text-align: center;
  cursor: pointer;
  transition: all 0.3s ease;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.action-item:hover {
  border-color: rgba(108, 92, 231, 0.3);
  transform: translateY(-2px);
  background: var(--bg-hover);
}

.action-icon {
  width: 40px;
  height: 40px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
}

.action-label {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
}

.action-desc {
  font-size: 12px;
  color: var(--text-muted);
}

.overview-side {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.empty-mini {
  text-align: center;
  padding: 24px;
  color: var(--text-muted);
  font-size: 13px;
}

.chapter-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.chapter-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: all 0.2s ease;
  font-size: 13px;
}

.chapter-item:hover {
  background: var(--bg-hover);
}

.chapter-num {
  color: var(--accent-secondary);
  font-weight: 500;
  min-width: 50px;
}

.chapter-title {
  flex: 1;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.chapter-words {
  color: var(--text-muted);
  font-size: 12px;
}

.agents-preview {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 16px;
}

.agent-mini {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border: 1px solid;
  border-radius: 20px;
  font-size: 12px;
  color: var(--text-secondary);
}
</style>
