<template>
  <div class="home-page">
    <div class="hero-section">
      <div class="hero-bg">
        <div class="orb orb-1"></div>
        <div class="orb orb-2"></div>
        <div class="orb orb-3"></div>
      </div>
      <div class="hero-content">
        <h1 class="hero-title">
          <span class="gradient-text">AI协作小说创作平台</span>
        </h1>
        <p class="hero-subtitle">多AI角色协作 · 智能大纲生成 · 人物卡管理 · 章节编辑导出</p>
        <div class="hero-actions">
          <el-button type="primary" size="large" class="glow-button" @click="showCreateDialog = true">
            <el-icon><Plus /></el-icon>
            创建新小说
          </el-button>
          <el-button size="large" @click="$router.push('/settings')" class="settings-btn">
            <el-icon><Setting /></el-icon>
            AI设置
          </el-button>
        </div>
      </div>
    </div>

    <div class="projects-section">
      <div class="section-header">
        <h2 class="section-title">我的小说项目</h2>
        <el-button type="primary" plain @click="showCreateDialog = true">
          <el-icon><Plus /></el-icon>
          新建
        </el-button>
      </div>

      <div v-if="projects.length === 0" class="empty-state">
        <el-empty description="还没有小说项目，点击上方按钮创建第一部小说">
          <el-button type="primary" class="glow-button" @click="showCreateDialog = true">立即创建</el-button>
        </el-empty>
      </div>

      <div v-else class="projects-grid">
        <div
          v-for="project in projects"
          :key="project.id"
          class="project-card"
          @click="openProject(project.id)"
        >
          <div class="project-cover">
            <div class="cover-gradient" :style="{ background: getGradient(project.genre) }"></div>
            <div class="cover-content">
              <span class="project-genre">{{ project.genre }}</span>
              <span class="project-style">{{ project.style }}</span>
            </div>
          </div>
          <div class="project-info">
            <h3 class="project-title">{{ project.title }}</h3>
            <p class="project-summary">{{ project.summary || '暂无简介' }}</p>
            <div class="project-stats">
              <span><el-icon><Document /></el-icon> {{ chapterCount(project) }} 章</span>
              <span><el-icon><User /></el-icon> {{ characterCount(project) }} 角色</span>
              <span><el-icon><EditPen /></el-icon> {{ totalWords(project) }} 字</span>
            </div>
            <div class="project-footer">
              <span class="project-date">{{ formatDate(project.updatedAt) }}</span>
              <el-dropdown trigger="click" @click.stop>
                <el-button text @click.stop>
                  <el-icon><MoreFilled /></el-icon>
                </el-button>
                <template #dropdown>
                  <el-dropdown-menu>
                    <el-dropdown-item @click="openProject(project.id)">打开项目</el-dropdown-item>
                    <el-dropdown-item @click="exportProject(project)">导出小说</el-dropdown-item>
                    <el-dropdown-item divided @click="confirmDelete(project)">
                      <span style="color: var(--danger)">删除项目</span>
                    </el-dropdown-item>
                  </el-dropdown-menu>
                </template>
              </el-dropdown>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="features-section" v-if="projects.length === 0">
      <div class="features-grid">
        <div class="feature-card" v-for="feature in features" :key="feature.title">
          <div class="feature-icon" :style="{ background: feature.color }">
            <el-icon :size="28"><component :is="feature.icon" /></el-icon>
          </div>
          <h3>{{ feature.title }}</h3>
          <p>{{ feature.desc }}</p>
        </div>
      </div>
    </div>

    <el-dialog v-model="showCreateDialog" title="创建新小说" width="560px">
      <el-form :model="newProject" label-width="80px" label-position="left">
        <el-form-item label="小说标题">
          <el-input v-model="newProject.title" placeholder="给你的小说起个名字" />
        </el-form-item>
        <el-form-item label="题材类型">
          <el-select v-model="newProject.genre" placeholder="选择题材" style="width: 100%">
            <el-option v-for="g in genres" :key="g" :label="g" :value="g" />
          </el-select>
        </el-form-item>
        <el-form-item label="写作风格">
          <el-select v-model="newProject.style" placeholder="选择风格" style="width: 100%">
            <el-option v-for="s in styles" :key="s" :label="s" :value="s" />
          </el-select>
        </el-form-item>
        <el-form-item label="目标字数">
          <el-input-number v-model="newProject.targetWords" :min="10000" :max="5000000" :step="10000" style="width: 100%" />
        </el-form-item>
        <el-form-item label="故事简介">
          <el-input
            v-model="newProject.summary"
            type="textarea"
            :rows="4"
            placeholder="简单描述一下你想写的故事（可选，后续可让AI帮你生成）"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showCreateDialog = false">取消</el-button>
        <el-button type="primary" class="glow-button" @click="handleCreate">创建项目</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive } from 'vue'
import { useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { ElMessageBox, ElMessage } from 'element-plus'
import { useProjectStore } from '@/stores/project'
import { exportAsTxt, exportAsMarkdown, exportAsZip } from '@/utils/export'

const router = useRouter()
const projectStore = useProjectStore()
const { projects } = storeToRefs(projectStore)

const showCreateDialog = ref(false)

const newProject = reactive({
  title: '',
  genre: '玄幻',
  style: '热血',
  targetWords: 100000,
  summary: ''
})

const genres = ['玄幻', '仙侠', '武侠', '科幻', '都市', '历史', '军事', '游戏', '悬疑', '言情', '奇幻', '末日']
const styles = ['热血', '轻松', '黑暗', '搞笑', '正剧', '治愈', '烧脑', '冒险']

const features = [
  { title: '多AI角色协作', desc: '7个专业AI角色分工合作，从大纲到润色全程参与', icon: 'ChatDotRound', color: 'var(--gradient-1)' },
  { title: '智能大纲生成', desc: 'AI根据你的创意自动生成故事大纲、世界观和情节线', icon: 'Document', color: 'var(--gradient-3)' },
  { title: '人物卡管理', desc: '创建和管理角色档案，保证人物性格和关系一致性', icon: 'User', color: 'var(--gradient-4)' },
  { title: '章节编辑与导出', desc: '强大的编辑器配合AI辅助写作，支持多种格式导出', icon: 'EditPen', color: 'var(--gradient-2)' }
]

async function openProject(id) {
  if (!id) return
  await projectStore.openProject(id)
  router.push(`/project/${id}`)
}

async function handleCreate() {
  if (!newProject.title.trim()) {
    ElMessage.warning('请输入小说标题')
    return
  }

  try {
    const project = await projectStore.createProject({ ...newProject })
    showCreateDialog.value = false
    newProject.title = ''
    newProject.summary = ''
    ElMessage.success('项目创建成功！')
    router.push(`/project/${project.id}`)
  } catch (error) {
    ElMessage.error(error.message || '项目创建失败，请确认后端服务已启动')
  }
}

function confirmDelete(project) {
  ElMessageBox.confirm(
    `确定要删除《${project.title}》吗？所有章节和角色数据将永久丢失。`,
    '删除确认',
    { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' }
  ).then(() => {
    projectStore.deleteProject(project.id)
    ElMessage.success('项目已删除')
  }).catch(() => {})
}

function exportProject(project) {
  ElMessageBox.alert(
    `<div style="margin: 10px 0;">
      <el-button style="margin: 5px;" onclick="window.__exportTxt('${project.id}')">导出 TXT</el-button>
      <el-button style="margin: 5px;" onclick="window.__exportMd('${project.id}')">导出 Markdown</el-button>
      <el-button style="margin: 5px;" onclick="window.__exportZip('${project.id}')">导出 ZIP完整包</el-button>
    </div>`,
    '选择导出格式',
    { dangerouslyUseHTMLString: true, showConfirmButton: false, showCancelButton: true }
  )
}

window.__exportTxt = (id) => {
  const p = projects.value.find(p => p.id === id)
  if (p) exportAsTxt(p)
}
window.__exportMd = (id) => {
  const p = projects.value.find(p => p.id === id)
  if (p) exportAsMarkdown(p)
}
window.__exportZip = async (id) => {
  const p = projects.value.find(p => p.id === id)
  if (p) {
    await exportAsZip(p)
    ElMessage.success('ZIP导出成功')
  }
}

function chapterCount(project) {
  return project.chapter_count ?? project.chapterCount ?? project.chapters?.length ?? 0
}

function characterCount(project) {
  return project.character_count ?? project.characterCount ?? project.characters?.length ?? 0
}

function totalWords(project) {
  return project.total_words ?? project.totalWords ?? project.chapters?.reduce((sum, ch) => sum + (ch.wordCount || ch.word_count || 0), 0) ?? 0
}

function formatDate(dateStr) {
  const d = new Date(dateStr)
  const now = new Date()
  const diff = (now - d) / 1000
  if (diff < 60) return '刚刚'
  if (diff < 3600) return `${Math.floor(diff / 60)}分钟前`
  if (diff < 86400) return `${Math.floor(diff / 3600)}小时前`
  if (diff < 604800) return `${Math.floor(diff / 86400)}天前`
  return d.toLocaleDateString('zh-CN')
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
</script>

<style scoped>
.home-page {
  height: 100vh;
  overflow-y: auto;
  background: var(--bg-primary);
}

.hero-section {
  position: relative;
  height: 340px;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border-bottom: 1px solid var(--border-color);
}

.hero-bg {
  position: absolute;
  inset: 0;
  background: var(--bg-secondary);
}

.orb {
  position: absolute;
  border-radius: 50%;
  filter: blur(60px);
  opacity: 0.3;
  animation: float 8s ease-in-out infinite;
}

.orb-1 {
  width: 300px;
  height: 300px;
  background: var(--accent-primary);
  top: -50px;
  left: -50px;
}

.orb-2 {
  width: 250px;
  height: 250px;
  background: #00b894;
  bottom: -30px;
  right: 10%;
  animation-delay: 2s;
}

.orb-3 {
  width: 200px;
  height: 200px;
  background: #e17055;
  top: 30%;
  right: 40%;
  animation-delay: 4s;
}

@keyframes float {
  0%, 100% { transform: translate(0, 0); }
  50% { transform: translate(30px, -30px); }
}

.hero-content {
  position: relative;
  z-index: 1;
  text-align: center;
}

.hero-title {
  font-size: 36px;
  font-weight: 800;
  margin-bottom: 12px;
}

.gradient-text {
  background: var(--gradient-1);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.hero-subtitle {
  color: var(--text-secondary);
  font-size: 15px;
  margin-bottom: 28px;
}

.hero-actions {
  display: flex;
  gap: 12px;
  justify-content: center;
}

.settings-btn {
  background: rgba(255, 255, 255, 0.08) !important;
  border: 1px solid var(--border-color) !important;
  color: var(--text-primary) !important;
}

.settings-btn:hover {
  background: rgba(255, 255, 255, 0.15) !important;
}

.projects-section {
  max-width: 1200px;
  margin: 0 auto;
  padding: 32px;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
}

.section-title {
  font-size: 22px;
  font-weight: 700;
  color: var(--text-primary);
}

.projects-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 20px;
}

.project-card {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  overflow: hidden;
  cursor: pointer;
  transition: all 0.3s ease;
  backdrop-filter: blur(10px);
}

.project-card:hover {
  transform: translateY(-4px);
  border-color: rgba(108, 92, 231, 0.3);
  box-shadow: 0 8px 32px rgba(108, 92, 231, 0.2);
}

.project-cover {
  height: 120px;
  position: relative;
  overflow: hidden;
}

.cover-gradient {
  position: absolute;
  inset: 0;
}

.cover-content {
  position: relative;
  z-index: 1;
  padding: 12px 16px;
  display: flex;
  gap: 8px;
}

.project-genre,
.project-style {
  background: rgba(0, 0, 0, 0.3);
  color: white;
  padding: 2px 10px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 500;
  backdrop-filter: blur(4px);
}

.project-info {
  padding: 16px;
}

.project-title {
  font-size: 18px;
  font-weight: 700;
  margin-bottom: 8px;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.project-summary {
  color: var(--text-secondary);
  font-size: 13px;
  line-height: 1.6;
  margin-bottom: 12px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  height: 42px;
}

.project-stats {
  display: flex;
  gap: 16px;
  font-size: 13px;
  color: var(--text-muted);
  margin-bottom: 12px;
}

.project-stats span {
  display: flex;
  align-items: center;
  gap: 4px;
}

.project-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: 12px;
  border-top: 1px solid var(--border-color);
}

.project-date {
  font-size: 12px;
  color: var(--text-muted);
}

.empty-state {
  padding: 60px 0;
}

.features-section {
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 32px 60px;
}

.features-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 20px;
}

.feature-card {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  padding: 28px 24px;
  text-align: center;
  transition: all 0.3s ease;
}

.feature-card:hover {
  border-color: rgba(108, 92, 231, 0.3);
  transform: translateY(-2px);
}

.feature-icon {
  width: 56px;
  height: 56px;
  border-radius: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto 16px;
  color: white;
}

.feature-card h3 {
  font-size: 16px;
  margin-bottom: 8px;
  color: var(--text-primary);
}

.feature-card p {
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.6;
}
</style>
