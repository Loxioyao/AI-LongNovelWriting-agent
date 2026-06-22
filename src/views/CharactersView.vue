<template>
  <div class="page-container" v-if="project">
    <div class="characters-header">
      <h1 class="page-title">人物卡管理</h1>
      <div class="header-actions">
        <el-button type="primary" plain @click="showAIGenerate = true">
          <el-icon><MagicStick /></el-icon>
          AI生成角色
        </el-button>
        <el-button type="primary" class="glow-button" @click="showAddDialog = true">
          <el-icon><Plus /></el-icon>
          新建角色
        </el-button>
      </div>
    </div>

    <div v-if="characters.length === 0" class="empty-state">
      <el-empty description="还没有角色，创建你的第一个人物卡">
        <el-button type="primary" class="glow-button" @click="showAddDialog = true">创建角色</el-button>
      </el-empty>
    </div>

    <div v-else class="characters-grid">
      <div
        v-for="char in characters"
        :key="char.id"
        class="char-card"
        :style="{ borderLeftColor: char.color || getCharColor(char.role) }"
        @click="editCharacter(char)"
      >
        <div class="char-avatar" :style="{ background: char.color || getCharColor(char.role) }">
          {{ char.name?.[0] || '?' }}
        </div>
        <div class="char-info">
          <h3 class="char-name">{{ char.name }}</h3>
          <el-tag size="small" effect="plain">{{ char.role || '未设定' }}</el-tag>
          <p class="char-personality">{{ char.personality || '性格未设定' }}</p>
          <div class="char-footer">
            <span class="char-relations" v-if="char.relationships?.length">
              {{ char.relationships.length }}个关系
            </span>
            <el-dropdown trigger="click" @click.stop>
              <el-button text size="small" @click.stop>
                <el-icon><MoreFilled /></el-icon>
              </el-button>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item @click="editCharacter(char)">编辑</el-dropdown-item>
                  <el-dropdown-item @click="duplicateChar(char)">复制</el-dropdown-item>
                  <el-dropdown-item divided @click="confirmDelete(char)">
                    <span style="color: var(--danger)">删除</span>
                  </el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </div>
        </div>
      </div>
    </div>

    <div v-if="characters.length > 0" class="relations-section card">
      <h3>人物关系图</h3>
      <div class="relations-view">
        <div class="relation-item" v-for="(rel, i) in allRelations" :key="i">
          <span class="rel-from">{{ rel.from }}</span>
          <span class="rel-arrow">
            <el-icon><Right /></el-icon>
            <span class="rel-type">{{ rel.type }}</span>
            <el-icon><Right /></el-icon>
          </span>
          <span class="rel-to">{{ rel.to }}</span>
        </div>
        <div v-if="allRelations.length === 0" class="empty-mini">
          暂无人物关系，在角色编辑中添加关系
        </div>
      </div>
    </div>

    <el-dialog v-model="showAddDialog" :title="editingChar ? '编辑角色' : '创建新角色'" width="640px">
      <el-form :model="charForm" label-width="80px" label-position="left">
        <el-form-item label="姓名">
          <el-input v-model="charForm.name" placeholder="角色姓名" />
        </el-form-item>
        <el-form-item label="角色定位">
          <el-select v-model="charForm.role" placeholder="选择角色定位" style="width: 100%">
            <el-option label="主角" value="主角" />
            <el-option label="女主角" value="女主角" />
            <el-option label="反派" value="反派" />
            <el-option label="配角" value="配角" />
            <el-option label="导师" value="导师" />
            <el-option label="伙伴" value="伙伴" />
            <el-option label="神秘人" value="神秘人" />
            <el-option label="其他" value="其他" />
          </el-select>
        </el-form-item>
        <el-form-item label="主题色">
          <div class="color-picker">
            <div
              v-for="c in colors"
              :key="c"
              class="color-dot"
              :class="{ selected: charForm.color === c }"
              :style="{ background: c }"
              @click="charForm.color = c"
            ></div>
          </div>
        </el-form-item>
        <el-form-item label="性格">
          <el-input
            v-model="charForm.personality"
            type="textarea"
            :rows="2"
            placeholder="性格特征描述"
          />
        </el-form-item>
        <el-form-item label="背景故事">
          <el-input
            v-model="charForm.background"
            type="textarea"
            :rows="3"
            placeholder="角色背景故事"
          />
        </el-form-item>
        <el-form-item label="外貌">
          <el-input
            v-model="charForm.appearance"
            type="textarea"
            :rows="2"
            placeholder="外貌描述"
          />
        </el-form-item>
        <el-form-item label="能力">
          <el-input
            v-model="charForm.abilities"
            type="textarea"
            :rows="2"
            placeholder="特殊能力/技能"
          />
        </el-form-item>
        <el-form-item label="人物关系">
          <div class="relations-editor">
            <div v-for="(rel, i) in charForm.relationships" :key="i" class="rel-edit-item">
              <el-input v-model="rel.target" placeholder="关系对象" style="width: 120px;" size="small" />
              <el-input v-model="rel.type" placeholder="关系类型（如：师徒/恋人/宿敌）" style="flex: 1" size="small" />
              <el-button text size="small" @click="charForm.relationships.splice(i, 1)">
                <el-icon><Close /></el-icon>
              </el-button>
            </div>
            <el-button text size="small" @click="charForm.relationships.push({ target: '', type: '' })">
              <el-icon><Plus /></el-icon> 添加关系
            </el-button>
          </div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showAddDialog = false">取消</el-button>
        <el-button type="primary" class="glow-button" @click="saveCharacter">
          {{ editingChar ? '保存修改' : '创建角色' }}
        </el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="showAIGenerate" title="AI生成角色" width="560px">
      <el-form :model="aiConfig" label-width="100px" label-position="left">
        <el-form-item label="AI角色">
          <el-select v-model="aiConfig.agentId" style="width: 100%">
            <el-option
              v-for="agent in enabledAgents"
              :key="agent.id"
              :label="agent.name"
              :value="agent.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="角色定位">
          <el-select v-model="aiConfig.role" style="width: 100%">
            <el-option label="主角" value="主角" />
            <el-option label="女主角" value="女主角" />
            <el-option label="反派" value="反派" />
            <el-option label="配角" value="配角" />
            <el-option label="导师" value="导师" />
            <el-option label="伙伴" value="伙伴" />
            <el-option label="神秘人" value="神秘人" />
          </el-select>
        </el-form-item>
        <el-form-item label="角色描述">
          <el-input
            v-model="aiConfig.desc"
            type="textarea"
            :rows="4"
            placeholder="描述你想要的角色，例如：一个表面上冷酷但内心温柔的女剑士，有着不为人知的皇室血统..."
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showAIGenerate = false">取消</el-button>
        <el-button type="primary" class="glow-button" @click="generateCharacter" :loading="generating">
          {{ generating ? '生成中...' : '生成角色' }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useProjectStore } from '@/stores/project'
import { useSettingsStore } from '@/stores/settings'
import { streamChat, buildAgentMessages } from '@/utils/api'

const projectStore = useProjectStore()
const settings = useSettingsStore()

const project = computed(() => projectStore.currentProject)
const characters = computed(() => projectStore.characters)
const enabledAgents = computed(() => settings.enabledAgents)

const showAddDialog = ref(false)
const showAIGenerate = ref(false)
const generating = ref(false)
const editingChar = ref(null)

const colors = ['#6c5ce7', '#00b894', '#e17055', '#0984e3', '#d63031', '#fdcb6e', '#e84393', '#00cec9']

const charForm = reactive({
  name: '',
  role: '',
  color: '#6c5ce7',
  personality: '',
  background: '',
  appearance: '',
  abilities: '',
  relationships: []
})

const aiConfig = reactive({
  agentId: 'character-designer',
  role: '主角',
  desc: ''
})

const allRelations = computed(() => {
  const rels = []
  characters.value.forEach(char => {
    if (char.relationships) {
      char.relationships.forEach(r => {
        if (r.target && r.type) {
          rels.push({ from: char.name, type: r.type, to: r.target })
        }
      })
    }
  })
  return rels
})

function getCharColor(role) {
  const map = {
    '主角': '#6c5ce7',
    '女主角': '#e84393',
    '反派': '#d63031',
    '配角': '#0984e3',
    '导师': '#fdcb6e',
    '伙伴': '#00b894',
    '神秘人': '#2d3436'
  }
  return map[role] || '#6c5ce7'
}

function editCharacter(char) {
  editingChar.value = char
  Object.assign(charForm, {
    name: char.name || '',
    role: char.role || '',
    color: char.color || '#6c5ce7',
    personality: char.personality || '',
    background: char.background || '',
    appearance: char.appearance || '',
    abilities: char.abilities || '',
    relationships: char.relationships ? [...char.relationships] : []
  })
  showAddDialog.value = true
}

function saveCharacter() {
  if (!charForm.name.trim()) {
    ElMessage.warning('请输入角色姓名')
    return
  }

  if (editingChar.value) {
    projectStore.updateCharacter(editingChar.value.id, { ...charForm })
    ElMessage.success('角色已更新')
  } else {
    projectStore.addCharacter({ ...charForm })
    ElMessage.success('角色已创建')
  }

  showAddDialog.value = false
  editingChar.value = null
  resetForm()
}

function resetForm() {
  Object.assign(charForm, {
    name: '',
    role: '',
    color: '#6c5ce7',
    personality: '',
    background: '',
    appearance: '',
    abilities: '',
    relationships: []
  })
}

function duplicateChar(char) {
  projectStore.addCharacter({
    ...char,
    name: `${char.name} (副本)`,
    relationships: []
  })
  ElMessage.success('角色已复制')
}

function confirmDelete(char) {
  ElMessageBox.confirm(`确定要删除角色「${char.name}」吗？`, '删除确认', {
    type: 'warning',
    confirmButtonText: '删除',
    cancelButtonText: '取消'
  }).then(() => {
    projectStore.deleteCharacter(char.id)
    ElMessage.success('角色已删除')
  }).catch(() => {})
}

async function generateCharacter() {
  if (!settings.hasApiKey) {
    ElMessage.warning('请先在设置中配置API Key')
    return
  }
  if (!aiConfig.desc.trim()) {
    ElMessage.warning('请描述你想要的角色')
    return
  }

  const agent = settings.agentRoles.find(a => a.id === aiConfig.agentId)
  if (!agent) return

  generating.value = true
  showAIGenerate.value = false

  const prompt = `请为以下小说创建一个角色：

小说标题：${project.value?.title || '未命名'}
小说类型：${project.value?.genre || '未指定'}
角色定位：${aiConfig.role}
角色描述：${aiConfig.desc}

请用以下JSON格式输出（不要用markdown代码块包裹，直接输出JSON）：
{
  "name": "角色姓名",
  "personality": "性格特征描述（100字内）",
  "background": "背景故事（200字内）",
  "appearance": "外貌描述（100字内）",
  "abilities": "特殊能力或技能（100字内）"
}`

  const context = {
    projectTitle: project.value?.title,
    genre: project.value?.genre,
    style: project.value?.style,
    outline: project.value?.outline,
    characters: project.value?.characters
  }

  try {
    const messages = buildAgentMessages(agent, prompt, context)
    let result = ''
    await streamChat(messages, (chunk, full) => {
      result = full
    }, {
      provider: settings.activeProvider,
      model: settings.currentProvider?.model,
      temperature: settings.temperature,
      maxTokens: settings.maxTokens,
      projectId: project.value?.id,
      agentId: agent.id
    })

    // 尝试解析JSON
    const jsonMatch = result.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      const charData = JSON.parse(jsonMatch[0])
      projectStore.addCharacter({
        ...charData,
        role: aiConfig.role,
        color: getCharColor(aiConfig.role),
        relationships: []
      })
      ElMessage.success(`角色「${charData.name}」已创建！`)
    } else {
      ElMessage.error('AI返回格式异常，请重试')
    }
  } catch (error) {
    ElMessage.error(error.message || '生成失败')
  } finally {
    generating.value = false
  }
}
</script>

<style scoped>
.characters-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
}

.header-actions {
  display: flex;
  gap: 12px;
}

.empty-state {
  padding: 60px 0;
}

.characters-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 16px;
  margin-bottom: 24px;
}

.char-card {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-left: 4px solid;
  border-radius: var(--radius-md);
  padding: 20px;
  display: flex;
  gap: 16px;
  cursor: pointer;
  transition: all 0.3s ease;
}

.char-card:hover {
  border-color: rgba(108, 92, 231, 0.3);
  transform: translateY(-2px);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.2);
}

.char-avatar {
  width: 56px;
  height: 56px;
  border-radius: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-size: 24px;
  font-weight: 700;
  flex-shrink: 0;
}

.char-info {
  flex: 1;
  min-width: 0;
}

.char-name {
  font-size: 17px;
  font-weight: 700;
  margin-bottom: 4px;
  color: var(--text-primary);
}

.char-personality {
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.5;
  margin: 8px 0;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.char-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.char-relations {
  font-size: 12px;
  color: var(--text-muted);
}

.relations-section h3 {
  font-size: 16px;
  font-weight: 600;
  margin-bottom: 16px;
  color: var(--text-primary);
}

.relations-view {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.relation-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 12px;
  background: var(--bg-tertiary);
  border-radius: var(--radius-sm);
  font-size: 13px;
}

.rel-from {
  font-weight: 600;
  color: var(--accent-secondary);
}

.rel-arrow {
  display: flex;
  align-items: center;
  gap: 4px;
  color: var(--text-muted);
}

.rel-type {
  color: var(--text-secondary);
  padding: 2px 8px;
  background: rgba(108, 92, 231, 0.1);
  border-radius: 10px;
}

.rel-to {
  font-weight: 600;
  color: var(--text-primary);
}

.empty-mini {
  text-align: center;
  padding: 20px;
  color: var(--text-muted);
  font-size: 13px;
}

.color-picker {
  display: flex;
  gap: 8px;
}

.color-dot {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  cursor: pointer;
  border: 2px solid transparent;
  transition: all 0.2s ease;
}

.color-dot.selected {
  border-color: white;
  transform: scale(1.1);
}

.relations-editor {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
}

.rel-edit-item {
  display: flex;
  gap: 8px;
  align-items: center;
}
</style>
