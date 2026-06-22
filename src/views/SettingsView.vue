<template>
  <div class="settings-page">
    <div class="settings-container">
      <h1 class="page-title">设置</h1>

      <div class="settings-section card">
        <h3>AI服务商配置</h3>
        <p class="section-desc">选择并配置你使用的AI服务商。API Key 采用 AES-256-GCM 加密存储在服务端，永远不会暴露到前端或浏览器。</p>

        <div class="provider-grid">
          <div
            v-for="(provider, key) in providers"
            :key="key"
            class="provider-card"
            :class="{ active: activeProvider === key }"
            @click="setActiveProvider(key)"
          >
            <div class="provider-header">
              <span class="provider-name">{{ provider.name }}</span>
              <el-tag v-if="provider.hasKey" type="success" size="small">已配置</el-tag>
              <el-tag v-else type="info" size="small">未配置</el-tag>
            </div>
            <p class="provider-desc">{{ getProviderDesc(key) }}</p>
            <div class="provider-actions">
              <el-button text type="primary" @click.stop="openKeyDialog(key)">
                {{ provider.hasKey ? '更新 API Key' : '配置 API Key' }}
              </el-button>
              <el-button v-if="provider.hasKey" text type="danger" @click.stop="deleteKey(key)">
                删除
              </el-button>
            </div>
          </div>
        </div>
      </div>

      <div class="settings-section card">
        <h3>模型选择</h3>
        <div class="model-section">
          <span class="setting-label">当前服务商</span>
          <el-tag>{{ currentProvider.name }}</el-tag>
        </div>
        <div class="model-section">
          <span class="setting-label">选择模型</span>
          <el-select v-model="selectedModel" @change="handleModelChange" style="width: 360px">
            <el-option
              v-for="model in currentProvider.models"
              :key="model.id"
              :label="model.name"
              :value="model.id"
            >
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <span>{{ model.name }}</span>
                <span style="font-size: 12px; color: var(--text-muted);">{{ model.desc }}</span>
              </div>
            </el-option>
          </el-select>
          <el-button text size="small" @click="refreshModels">
            <el-icon><Refresh /></el-icon>
            刷新模型列表
          </el-button>
        </div>
      </div>

      <div class="settings-section card">
        <h3>生成参数</h3>
        <div class="param-row">
          <div class="param-info">
            <span class="param-label">温度 (Temperature)</span>
            <span class="param-desc">控制生成内容的创造性。值越高越有创意，值越低越稳定。</span>
          </div>
          <div class="param-control">
            <el-slider v-model="settings.temperature" :min="0" :max="2" :step="0.1" show-input style="width: 300px;" @change="settings.savePreferences()" />
          </div>
        </div>
        <div class="param-row">
          <div class="param-info">
            <span class="param-label">最大Token数</span>
            <span class="param-desc">每次生成的最大Token数量。</span>
          </div>
          <div class="param-control">
            <el-input-number v-model="settings.maxTokens" :min="256" :max="32768" :step="256" @change="settings.savePreferences()" />
          </div>
        </div>
      </div>

      <div class="settings-section card">
        <h3>AI角色管理</h3>
        <p class="section-desc">启用/禁用AI角色，或自定义角色的系统提示词。</p>
        <div class="agents-config">
          <div
            v-for="agent in settings.agentRoles"
            :key="agent.id"
            class="agent-config-item"
          >
            <div class="agent-config-header">
              <div class="agent-config-avatar" :style="{ background: agent.color }">
                <el-icon :size="16"><component :is="agent.icon" /></el-icon>
              </div>
              <span class="agent-config-name">{{ agent.name }}</span>
              <el-switch v-model="agent.enabled" @change="settings.savePreferences()" />
              <el-button text size="small" @click="openPromptEditor(agent)">
                <el-icon><Edit /></el-icon>
                编辑提示词
              </el-button>
            </div>
          </div>
        </div>
      </div>

      <div class="settings-section card">
        <h3>数据管理</h3>
        <p class="section-desc">项目数据存储在服务端 SQLite 数据库中。API Key 已加密存储，不会包含在导出文件中。</p>
        <div class="data-actions">
          <el-button @click="exportData">
            <el-icon><Download /></el-icon>
            导出偏好设置
          </el-button>
          <el-button @click="importData">
            <el-icon><Upload /></el-icon>
            导入偏好设置
          </el-button>
          <el-button type="danger" plain @click="clearData">
            <el-icon><Delete /></el-icon>
            清空本地偏好
          </el-button>
        </div>
      </div>
    </div>

    <el-dialog v-model="showKeyDialog" :title="`${editingProvider?.name} API Key配置`" width="520px">
      <div class="key-dialog-content">
        <el-input
          v-model="tempKey"
          type="password"
          show-password
          placeholder="输入API Key"
          style="margin-bottom: 12px;"
        />
        <div class="key-help">
          <p v-if="editingKey === 'zhipu'">
            获取智谱API Key：访问
            <a href="https://open.bigmodel.cn" target="_blank" style="color: var(--accent-secondary);">open.bigmodel.cn</a>
            → 控制台 → API Keys
          </p>
          <p v-else-if="editingKey === 'deepseek'">
            获取DeepSeek API Key：访问
            <a href="https://platform.deepseek.com" target="_blank" style="color: var(--accent-secondary);">platform.deepseek.com</a>
            → API Keys
          </p>
          <p v-else-if="editingKey === 'openai'">
            获取OpenAI API Key：访问
            <a href="https://platform.openai.com/api-keys" target="_blank" style="color: var(--accent-secondary);">platform.openai.com</a>
            → Create new secret key
          </p>
        </div>
      </div>
      <template #footer>
        <el-button @click="showKeyDialog = false">取消</el-button>
        <el-button type="primary" class="glow-button" :loading="saving" @click="saveKey">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="showPromptDialog" :title="`编辑${editingAgent?.name}提示词`" width="640px">
      <el-input
        v-model="tempPrompt"
        type="textarea"
        :rows="10"
        placeholder="系统提示词定义了AI角色的行为方式..."
      />
      <template #footer>
        <el-button @click="showPromptDialog = false">取消</el-button>
        <el-button type="primary" class="glow-button" @click="savePrompt">保存</el-button>
      </template>
    </el-dialog>

    <input ref="fileInput" type="file" accept=".json" style="display: none" @change="handleImport" />
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useSettingsStore } from '@/stores/settings'

const router = useRouter()
const settings = useSettingsStore()

const providers = computed(() => settings.providers)
const activeProvider = computed(() => settings.activeProvider)
const currentProvider = computed(() => settings.currentProvider)
const selectedModel = ref(currentProvider.value.model)
const saving = ref(false)

const showKeyDialog = ref(false)
const editingKey = ref('')
const editingProvider = ref(null)
const tempKey = ref('')

const showPromptDialog = ref(false)
const editingAgent = ref(null)
const tempPrompt = ref('')

const fileInput = ref(null)

watch(currentProvider, (val) => {
  if (val?.model) selectedModel.value = val.model
})

function getProviderDesc(key) {
  const desc = {
    zhipu: '国产大模型，支持中文创作，有免费额度',
    deepseek: '高性价比国产模型，擅长代码和推理',
    openai: 'GPT系列模型，能力全面，需海外网络'
  }
  return desc[key] || ''
}

function setActiveProvider(key) {
  settings.setActiveProvider(key)
  selectedModel.value = settings.providers[key].model
}

async function handleModelChange(model) {
  await settings.setModel(model)
}

async function refreshModels() {
  const models = await settings.fetchModels(activeProvider.value)
  ElMessage.success(`已刷新模型列表（${models?.length || 0}个模型）`)
}

function openKeyDialog(key) {
  editingKey.value = key
  editingProvider.value = providers.value[key]
  tempKey.value = ''
  showKeyDialog.value = true
}

async function saveKey() {
  if (!tempKey.value.trim()) {
    ElMessage.warning('请输入API Key')
    return
  }

  saving.value = true
  try {
    await settings.setApiKey(editingKey.value, tempKey.value.trim())
    showKeyDialog.value = false
    ElMessage.success(`${editingProvider.value.name} API Key 已加密保存到服务端`)
  } catch (err) {
    ElMessage.error(err.message || '保存失败')
  } finally {
    saving.value = false
  }
}

async function deleteKey(key) {
  try {
    await ElMessageBox.confirm(
      `确定要删除 ${providers.value[key].name} 的 API Key 吗？`,
      '删除确认',
      { type: 'warning' }
    )
    await settings.deleteApiKey(key)
    ElMessage.success('API Key 已删除')
  } catch (e) {
    if (e !== 'cancel') ElMessage.error('删除失败')
  }
}

function openPromptEditor(agent) {
  editingAgent.value = agent
  tempPrompt.value = agent.systemPrompt
  showPromptDialog.value = true
}

function savePrompt() {
  if (editingAgent.value) {
    settings.updateAgentPrompt(editingAgent.value.id, tempPrompt.value)
    showPromptDialog.value = false
    ElMessage.success(`${editingAgent.value.name} 提示词已更新`)
  }
}

function exportData() {
  const data = {
    preferences: JSON.parse(localStorage.getItem('ai-novel-preferences') || '{}'),
    exportDate: new Date().toISOString()
  }
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `ai-novel-preferences-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(url)
  ElMessage.success('偏好设置已导出（不含 API Key）')
}

function importData() {
  fileInput.value?.click()
}

function handleImport(event) {
  const file = event.target.files[0]
  if (!file) return

  const reader = new FileReader()
  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target.result)
      if (data.preferences) {
        localStorage.setItem('ai-novel-preferences', JSON.stringify(data.preferences))
        ElMessage.success('偏好设置导入成功，页面将刷新...')
        setTimeout(() => location.reload(), 1000)
      } else {
        ElMessage.error('文件格式不正确')
      }
    } catch (err) {
      ElMessage.error('文件格式错误')
    }
  }
  reader.readAsText(file)
  event.target.value = ''
}

function clearData() {
  ElMessageBox.confirm(
    '确定要清空本地偏好设置吗？服务端的项目数据和 API Key 不会受到影响。',
    '清空确认',
    { type: 'warning', confirmButtonText: '确定清空', cancelButtonText: '取消' }
  ).then(() => {
    localStorage.removeItem('ai-novel-preferences')
    localStorage.removeItem('ai-novel-settings')
    ElMessage.success('本地偏好已清空')
    setTimeout(() => router.push('/'), 1000)
  }).catch(() => {})
}
</script>

<style scoped>
.settings-page {
  height: 100vh;
  overflow-y: auto;
  background: var(--bg-primary);
}

.settings-container {
  max-width: 800px;
  margin: 0 auto;
  padding: 32px;
}

.settings-section {
  margin-bottom: 24px;
}

.settings-section h3 {
  font-size: 16px;
  font-weight: 600;
  margin-bottom: 8px;
  color: var(--text-primary);
}

.section-desc {
  font-size: 13px;
  color: var(--text-muted);
  margin-bottom: 20px;
}

.provider-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
}

.provider-card {
  background: var(--bg-tertiary);
  border: 2px solid var(--border-color);
  border-radius: var(--radius-md);
  padding: 20px;
  cursor: pointer;
  transition: all 0.3s ease;
}

.provider-card:hover {
  border-color: rgba(108, 92, 231, 0.3);
}

.provider-card.active {
  border-color: var(--accent-primary);
  background: rgba(108, 92, 231, 0.1);
}

.provider-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.provider-name {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
}

.provider-desc {
  font-size: 12px;
  color: var(--text-muted);
  margin-bottom: 12px;
}

.provider-actions {
  display: flex;
  gap: 4px;
}

.model-section {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-top: 16px;
}

.setting-label {
  font-size: 14px;
  color: var(--text-secondary);
  min-width: 120px;
}

.param-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 0;
  border-bottom: 1px solid var(--border-color);
}

.param-row:last-child {
  border-bottom: none;
}

.param-info {
  flex: 1;
}

.param-label {
  display: block;
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
  margin-bottom: 4px;
}

.param-desc {
  font-size: 12px;
  color: var(--text-muted);
}

.agents-config {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.agent-config-item {
  background: var(--bg-tertiary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  padding: 12px 16px;
}

.agent-config-header {
  display: flex;
  align-items: center;
  gap: 12px;
}

.agent-config-avatar {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
}

.agent-config-name {
  flex: 1;
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
}

.data-actions {
  display: flex;
  gap: 12px;
}

.key-dialog-content {
  margin-bottom: 16px;
}

.key-help p {
  font-size: 12px;
  color: var(--text-muted);
  line-height: 1.6;
}

.key-help a {
  text-decoration: none;
}

.key-help a:hover {
  text-decoration: underline;
}
</style>
