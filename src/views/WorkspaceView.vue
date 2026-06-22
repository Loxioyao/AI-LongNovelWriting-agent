<template>
  <div class="workspace">
    <aside class="sidebar">
      <div class="sidebar-header">
        <div class="logo" @click="$router.push('/')">
          <el-icon :size="24"><EditPen /></el-icon>
          <span>AI写作工坊</span>
        </div>
      </div>

      <div class="project-info" v-if="project">
        <div class="project-badge" :style="{ background: getGradient(project.genre) }">
          {{ project.genre[0] }}
        </div>
        <div class="project-meta">
          <h3>{{ project.title }}</h3>
          <span>{{ project.genre }} · {{ project.style }}</span>
        </div>
      </div>

      <nav class="nav-menu">
        <router-link
          v-for="item in navItems"
          :key="item.path"
          :to="`/project/${projectId}/${item.path}`"
          class="nav-item"
          :class="{ active: isActive(item.path) }"
        >
          <el-icon :size="18"><component :is="item.icon" /></el-icon>
          <span>{{ item.label }}</span>
          <el-badge v-if="item.badge" :value="item.badge" :max="99" class="nav-badge" />
        </router-link>
      </nav>

      <div class="sidebar-footer">
        <div class="ai-status" @click="$router.push('/settings')">
          <div class="status-dot" :class="{ active: hasApiKey }"></div>
          <span>{{ hasApiKey ? currentProvider.name : '未配置API' }}</span>
          <el-icon :size="14"><ArrowRight /></el-icon>
        </div>
      </div>
    </aside>

    <main class="main-content">
      <div v-if="!project" class="missing-project">
        <el-empty description="项目不存在或尚未加载">
          <el-button type="primary" @click="router.push('/')">返回首页</el-button>
        </el-empty>
      </div>
      <router-view v-else v-slot="{ Component }">
        <transition name="slide-fade" mode="out-in">
          <component :is="Component" />
        </transition>
      </router-view>
    </main>
  </div>
</template>

<script setup>
import { computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useProjectStore } from '@/stores/project'
import { useSettingsStore } from '@/stores/settings'

const route = useRoute()
const router = useRouter()
const projectStore = useProjectStore()
const settings = useSettingsStore()

const projectId = computed(() => route.params.id)
const project = computed(() => projectStore.currentProject)

const hasApiKey = computed(() => settings.hasApiKey)
const currentProvider = computed(() => settings.currentProvider)

const navItems = computed(() => {
  if (!project.value) return []
  return [
    { path: '', label: '项目概览', icon: 'Odometer' },
    { path: 'outline', label: '故事大纲', icon: 'Document' },
    { path: 'characters', label: '人物卡管理', icon: 'User', badge: project.value.characters.length || undefined },
    { path: 'chapters', label: '章节编辑', icon: 'EditPen', badge: project.value.chapters.length || undefined },
    { path: 'longform', label: '长篇生成', icon: 'MagicStick' },
    { path: 'agents', label: 'AI协作室', icon: 'ChatDotRound' }
  ]
})

function isActive(path) {
  if (path === '') {
    return route.name === 'overview'
  }
  return route.path.includes(path)
}

function getGradient(genre) {
  const gradients = {
    '玄幻': 'linear-gradient(135deg, #667eea, #764ba2)',
    '仙侠': 'linear-gradient(135deg, #a8edea, #fed6e3)',
    '武侠': 'linear-gradient(135deg, #f6d365, #fda085)',
    '科幻': 'linear-gradient(135deg, #4facfe, #00f2fe)',
    '都市': 'linear-gradient(135deg, #30cfd0, #330867)',
    '历史': 'linear-gradient(135deg, #fad0c4, #ffd1ff)',
    '军事': 'linear-gradient(135deg, #5ee7df, #b490ca)',
    '游戏': 'linear-gradient(135deg, #c471f5, #fa71cd)',
    '悬疑': 'linear-gradient(135deg, #30cfd0, #2c3e50)',
    '言情': 'linear-gradient(135deg, #ff9a9e, #fad0c4)',
    '奇幻': 'linear-gradient(135deg, #a18cd1, #fbc2eb)',
    '末日': 'linear-gradient(135deg, #485563, #29323c)'
  }
  return gradients[genre] || 'linear-gradient(135deg, #667eea, #764ba2)'
}

watch(() => route.params.id, async (id) => {
  if (!id || id === 'undefined') {
    router.replace('/')
    return
  }
  await projectStore.openProject(id)
}, { immediate: true })
</script>

<style scoped>
.workspace {
  display: flex;
  height: 100vh;
  overflow: hidden;
}

.sidebar {
  width: 260px;
  background: var(--bg-secondary);
  border-right: 1px solid var(--border-color);
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
}

.sidebar-header {
  padding: 20px 24px;
  border-bottom: 1px solid var(--border-color);
}

.logo {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 18px;
  font-weight: 700;
  cursor: pointer;
  color: var(--accent-secondary);
}

.project-info {
  padding: 16px 24px;
  border-bottom: 1px solid var(--border-color);
  display: flex;
  align-items: center;
  gap: 12px;
}

.project-badge {
  width: 40px;
  height: 40px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-weight: 700;
  font-size: 18px;
  flex-shrink: 0;
}

.project-meta h3 {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 140px;
}

.project-meta span {
  font-size: 12px;
  color: var(--text-muted);
}

.nav-menu {
  flex: 1;
  padding: 12px;
  overflow-y: auto;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 16px;
  border-radius: var(--radius-md);
  color: var(--text-secondary);
  text-decoration: none;
  font-size: 14px;
  transition: all 0.2s ease;
  margin-bottom: 4px;
  position: relative;
}

.nav-item:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.nav-item.active {
  background: rgba(108, 92, 231, 0.15);
  color: var(--accent-secondary);
}

.nav-item.active::before {
  content: '';
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 3px;
  height: 20px;
  background: var(--accent-primary);
  border-radius: 0 2px 2px 0;
}

.nav-badge {
  margin-left: auto;
}

.sidebar-footer {
  padding: 16px;
  border-top: 1px solid var(--border-color);
}

.ai-status {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: var(--bg-tertiary);
  border-radius: var(--radius-md);
  cursor: pointer;
  font-size: 13px;
  color: var(--text-secondary);
  transition: all 0.2s ease;
}

.ai-status:hover {
  background: var(--bg-hover);
}

.ai-status span {
  flex: 1;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--text-muted);
}

.status-dot.active {
  background: var(--success);
  box-shadow: 0 0 8px var(--success);
}

.main-content {
  flex: 1;
  overflow: hidden;
  background: var(--bg-primary);
}

.missing-project {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
