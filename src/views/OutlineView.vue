<template>
  <div class="page-container" v-if="project">
    <div class="outline-header">
      <h1 class="page-title">故事大纲</h1>
      <div class="header-actions">
        <el-button @click="showWorldBuilding = true">
          <el-icon><Setting /></el-icon>
          世界观设定
        </el-button>
        <el-button type="primary" class="glow-button" @click="showGenerateDialog = true">
          <el-icon><MagicStick /></el-icon>
          AI生成大纲
        </el-button>
      </div>
    </div>

    <div class="outline-content">
      <div class="card outline-editor-card">
        <div class="outline-toolbar">
          <span class="toolbar-label">大纲内容</span>
          <div class="toolbar-actions">
            <el-button text size="small" @click="copyOutline">
              <el-icon><CopyDocument /></el-icon> 复制
            </el-button>
            <el-button text size="small" @click="saveOutline" :disabled="!outlineText">
              <el-icon><Check /></el-icon> 保存
            </el-button>
          </div>
        </div>
        <el-input
          v-model="outlineText"
          type="textarea"
          :rows="28"
          placeholder="在这里编写你的故事大纲，或点击右上角让AI帮你生成..."
          resize="none"
          class="outline-textarea"
        />
        <div class="outline-footer">
          <span>{{ outlineText.length }} 字</span>
          <span v-if="lastSaved">上次保存: {{ formatTime(lastSaved) }}</span>
        </div>
      </div>

      <div class="outline-side">
        <div class="card outline-preview-card">
          <h3>大纲预览</h3>
          <div class="markdown-body preview-content" v-html="renderMarkdown(outlineText)"></div>
        </div>

        <div class="card outline-templates-card">
          <h3>大纲模板</h3>
          <div class="template-list">
            <div
              v-for="tpl in templates"
              :key="tpl.name"
              class="template-item"
              @click="applyTemplate(tpl)"
            >
              <el-icon :size="16"><component :is="tpl.icon" /></el-icon>
              <span>{{ tpl.name }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <el-dialog v-model="showGenerateDialog" title="AI生成大纲" width="600px">
      <el-form :model="genConfig" label-width="100px" label-position="left">
        <el-form-item label="AI角色">
          <el-select v-model="genConfig.agentId" style="width: 100%">
            <el-option
              v-for="agent in enabledAgents"
              :key="agent.id"
              :label="agent.name"
              :value="agent.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="故事主题">
          <el-input v-model="genConfig.theme" placeholder="例如：少年踏上天路修行的旅程" />
        </el-form-item>
        <el-form-item label="核心冲突">
          <el-input
            v-model="genConfig.conflict"
            type="textarea"
            :rows="2"
            placeholder="例如：人族与妖族的万年恩怨"
          />
        </el-form-item>
        <el-form-item label="故事结构">
          <el-select v-model="genConfig.structure" style="width: 100%">
            <el-option label="三幕式（开端-发展-结局）" value="three-act" />
            <el-option label="英雄之旅（12阶段）" value="heros-journey" />
            <el-option label="五幕式（铺垫-上升-高潮-下降-解决）" value="five-act" />
            <el-option label="网文结构（黄金三章+升级打怪）" value="web-novel" />
          </el-select>
        </el-form-item>
        <el-form-item label="章节数量">
          <el-input-number v-model="genConfig.chapterCount" :min="5" :max="50" />
        </el-form-item>
        <el-form-item label="额外要求">
          <el-input
            v-model="genConfig.extra"
            type="textarea"
            :rows="2"
            placeholder="任何额外要求（可选）"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showGenerateDialog = false">取消</el-button>
        <el-button type="primary" class="glow-button" @click="generateOutline" :loading="generating">
          {{ generating ? 'AI生成中...' : '开始生成' }}
        </el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="showWorldBuilding" title="世界观设定" width="640px">
      <el-form :model="worldBuilding" label-width="100px" label-position="left">
        <el-form-item label="时代背景">
          <el-input v-model="worldBuilding.era" placeholder="例如：远古神话时代" />
        </el-form-item>
        <el-form-item label="世界设定">
          <el-input
            v-model="worldBuilding.setting"
            type="textarea"
            :rows="2"
            placeholder="整体世界设定描述"
          />
        </el-form-item>
        <el-form-item label="力量体系">
          <el-input
            v-model="worldBuilding.magicSystem"
            type="textarea"
            :rows="3"
            placeholder="魔法/修仙/科技等力量体系描述"
          />
        </el-form-item>
        <el-form-item label="地理环境">
          <el-input
            v-model="worldBuilding.geography"
            type="textarea"
            :rows="2"
            placeholder="主要地理环境"
          />
        </el-form-item>
        <el-form-item label="文化种族">
          <el-input
            v-model="worldBuilding.cultures"
            type="textarea"
            :rows="2"
            placeholder="种族、文化、势力分布"
          />
        </el-form-item>
        <el-form-item label="世界规则">
          <el-input
            v-model="worldBuilding.rules"
            type="textarea"
            :rows="2"
            placeholder="世界的核心规则/法则"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showWorldBuilding = false">取消</el-button>
        <el-button type="primary" class="glow-button" @click="saveWorldBuilding">保存设定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, watch } from 'vue'
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

const outlineText = ref(project.value?.outline || '')
const lastSaved = ref(null)
const showGenerateDialog = ref(false)
const showWorldBuilding = ref(false)
const generating = ref(false)

const enabledAgents = computed(() => settings.enabledAgents)

const genConfig = reactive({
  agentId: 'outline-architect',
  theme: '',
  conflict: '',
  structure: 'three-act',
  chapterCount: 10,
  extra: ''
})

const worldBuilding = reactive({
  era: '',
  setting: '',
  magicSystem: '',
  geography: '',
  cultures: '',
  rules: '',
  ...(project.value?.worldBuilding || {})
})

const templates = [
  {
    name: '三幕式结构',
    icon: 'Document',
    content: `# 故事大纲\n\n## 第一幕：开端\n\n### 场景1：日常世界\n- 主角介绍\n- 日常生活\n\n### 场景2：触发事件\n- 改变主角命运的事件\n\n### 场景3：跨入未知\n- 主角踏上旅程\n\n## 第二幕：发展\n\n### 场景4：试炼与挑战\n- 遇到阻碍\n\n### 场景5：中点转折\n- 重大发现或转折\n\n### 场景6：危机加深\n\n## 第三幕：结局\n\n### 场景7：最终决战\n\n### 场景8：回归与成长\n- 问题解决\n- 主角成长`
  },
  {
    name: '网文大纲',
    icon: 'EditPen',
    content: `# 网文大纲\n\n## 黄金三章\n\n### 第1章：觉醒\n- 金手指激活\n- 奠定基调\n\n### 第2章：初露锋芒\n- 第一次展示实力\n- 引入第一个冲突\n\n### 第3章：打脸\n- 爽点设计\n- 吸引读者\n\n## 主线\n- 升级路线\n- 势力发展\n\n## 副线\n- 感情线\n- 兄弟情义\n\n## 高潮设计\n- 大事件1\n- 大事件2\n- 大事件3`
  },
  {
    name: '英雄之旅',
    icon: 'Trophy',
    content: `# 英雄之旅大纲\n\n## 1. 日常世界\n## 2. 冒险召唤\n## 3. 拒绝召唤\n## 4. 遇见导师\n## 5. 跨越门槛\n## 6. 试炼、盟友与敌人\n## 7. 接近深穴\n## 8. 严峻考验\n## 9. 获得奖赏\n## 10. 回归之路\n## 11. 复活\n## 12. 带着仙丹归来`
  }
]

function renderMarkdown(text) {
  if (!text) return '<p style="color: var(--text-muted)">暂无大纲内容</p>'
  return DOMPurify.sanitize(marked(text))
}

function saveOutline() {
  projectStore.updateOutline(outlineText.value)
  lastSaved.value = new Date().toISOString()
  ElMessage.success('大纲已保存')
}

function copyOutline() {
  navigator.clipboard.writeText(outlineText.value)
  ElMessage.success('已复制到剪贴板')
}

function applyTemplate(tpl) {
  if (outlineText.value && !confirm('当前大纲已有内容，确定要替换为模板吗？')) return
  outlineText.value = tpl.content
  ElMessage.success(`已应用${tpl.name}`)
}

function formatTime(ts) {
  return new Date(ts).toLocaleString('zh-CN')
}

async function generateOutline() {
  if (!settings.hasApiKey) {
    ElMessage.warning('请先在设置中配置API Key')
    return
  }

  const agent = settings.agentRoles.find(a => a.id === genConfig.agentId)
  if (!agent) {
    ElMessage.error('请选择AI角色')
    return
  }

  generating.value = true
  showGenerateDialog.value = false

  const structureMap = {
    'three-act': '三幕式结构（开端-发展-结局）',
    'heros-journey': '英雄之旅12阶段',
    'five-act': '五幕式结构',
    'web-novel': '网文结构（黄金三章+升级路线）'
  }

  const prompt = `请为以下小说生成详细的故事大纲：

小说标题：${project.value?.title || '未命名'}
小说类型：${project.value?.genre || '未指定'}
写作风格：${project.value?.style || '未指定'}
故事主题：${genConfig.theme || '由你发挥'}
核心冲突：${genConfig.conflict || '由你发挥'}
故事结构：${structureMap[genConfig.structure]}
章节数量：约${genConfig.chapterCount}章
${genConfig.extra ? `额外要求：${genConfig.extra}` : ''}

${project.value?.summary ? `已有简介：${project.value.summary}` : ''}

请生成包含以下内容的大纲：
1. 故事背景与世界观概述
2. 主要情节线（起承转合）
3. ${genConfig.chapterCount}个章节的分章大纲（每章含标题和内容摘要）
4. 关键转折点和高潮设计
5. 主要伏笔和照应

请用Markdown格式输出。`

  try {
    const context = {
      projectTitle: project.value?.title,
      genre: project.value?.genre,
      style: project.value?.style
    }

    const messages = buildAgentMessages(agent, prompt, context)

    let result = ''
    await streamChat(messages, (chunk, full) => {
      result = full
      outlineText.value = full
    }, {
      provider: settings.activeProvider,
      model: settings.currentProvider?.model,
      temperature: settings.temperature,
      maxTokens: settings.maxTokens,
      projectId: project.value?.id,
      agentId: agent.id
    })

    outlineText.value = result
    projectStore.updateOutline(result)
    ElMessage.success('大纲生成成功！')
  } catch (error) {
    ElMessage.error(error.message || '生成失败')
  } finally {
    generating.value = false
  }
}

function saveWorldBuilding() {
  projectStore.updateWorldBuilding({ ...worldBuilding })
  showWorldBuilding.value = false
  ElMessage.success('世界观设定已保存')
}

watch(() => project.value?.outline, (val) => {
  if (val && !outlineText.value) {
    outlineText.value = val
  }
})
</script>

<style scoped>
.outline-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
}

.header-actions {
  display: flex;
  gap: 12px;
}

.outline-content {
  display: grid;
  grid-template-columns: 1fr 360px;
  gap: 24px;
  margin-bottom: 24px;
}

.outline-editor-card {
  padding: 0;
  overflow: hidden;
}

.outline-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-color);
}

.toolbar-label {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
}

.toolbar-actions {
  display: flex;
  gap: 8px;
}

.outline-textarea :deep(.el-textarea__inner) {
  border: none !important;
  box-shadow: none !important;
  border-radius: 0 !important;
  padding: 16px;
  font-size: 14px;
  line-height: 1.8;
  min-height: 500px !important;
}

.outline-footer {
  display: flex;
  justify-content: space-between;
  padding: 8px 16px;
  border-top: 1px solid var(--border-color);
  font-size: 12px;
  color: var(--text-muted);
}

.outline-side {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.outline-preview-card h3,
.outline-templates-card h3 {
  font-size: 16px;
  font-weight: 600;
  margin-bottom: 12px;
  color: var(--text-primary);
}

.preview-content {
  font-size: 13px;
  max-height: 400px;
  overflow-y: auto;
}

.template-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.template-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  background: var(--bg-tertiary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all 0.2s ease;
  font-size: 13px;
  color: var(--text-secondary);
}

.template-item:hover {
  border-color: var(--accent-primary);
  color: var(--text-primary);
}
</style>
