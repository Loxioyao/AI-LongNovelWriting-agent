import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { configApi } from '@/utils/api'

export const useSettingsStore = defineStore('settings', () => {
  // 服务商配置（模型列表为静态定义，API Key 从服务端加载）
  const providers = ref({
    zhipu: {
      name: '智谱清言',
      apiKey: '',          // 仅用于前端显示是否有 key，不存储真实值
      hasKey: false,       // 从服务端获取的标志位
      model: 'glm-4-flash',
      models: [
        { id: 'glm-4-plus', name: 'GLM-4-Plus', desc: '最强模型，适合复杂创作' },
        { id: 'glm-4', name: 'GLM-4', desc: '通用模型，性价比高' },
        { id: 'glm-4-flash', name: 'GLM-4-Flash', desc: '快速响应，免费' },
        { id: 'glm-4-air', name: 'GLM-4-Air', desc: '轻量高效' }
      ]
    },
    deepseek: {
      name: 'DeepSeek',
      apiKey: '',
      hasKey: false,
      model: 'deepseek-v4-flash',
      models: [
        { id: 'deepseek-v4-pro', name: 'DeepSeek-V4-Pro', desc: '旗舰模型，擅长复杂推理与中文创作' },
        { id: 'deepseek-v4-flash', name: 'DeepSeek-V4-Flash', desc: '快速响应，性价比高' },
        { id: 'deepseek-reasoner', name: 'DeepSeek-R1', desc: '推理增强，适合复杂情节设计' }
      ]
    },
    openai: {
      name: 'OpenAI',
      apiKey: '',
      hasKey: false,
      model: 'gpt-4o-mini',
      models: [
        { id: 'gpt-4o', name: 'GPT-4o', desc: '最新旗舰模型，多模态能力强' },
        { id: 'gpt-4o-mini', name: 'GPT-4o-mini', desc: '快速且经济' },
        { id: 'gpt-4-turbo', name: 'GPT-4-Turbo', desc: '强大且高效' },
        { id: 'gpt-3.5-turbo', name: 'GPT-3.5-Turbo', desc: '经典模型，速度快' }
      ]
    }
  })

  const activeProvider = ref('zhipu')
  const temperature = ref(0.8)
  const maxTokens = ref(4096)
  const loading = ref(false)
  const error = ref(null)

  // AI角色配置
  const agentRoles = ref([
    {
      id: 'outline-architect',
      name: '大纲架构师',
      icon: 'Document',
      color: '#409eff',
      systemPrompt: '你是一位经验丰富的大纲架构师，擅长构建小说的整体框架。你需要根据用户的需求，设计出引人入胜的故事大纲，包括世界观设定、主线剧情、支线剧情、情节转折和高潮设计。输出结构化的大纲内容。',
      enabled: true
    },
    {
      id: 'character-designer',
      name: '人物设计师',
      icon: 'User',
      color: '#67c23a',
      systemPrompt: '你是一位专业的人物设计师，擅长创造有深度的角色。你需要设计角色的外貌、性格、背景故事、成长轨迹、人际关系和能力设定。确保每个角色都有独特的辨识度和成长空间。',
      enabled: true
    },
    {
      id: 'scene-writer',
      name: '场景描写师',
      icon: 'Picture',
      color: '#e6a23c',
      systemPrompt: '你是一位细腻的场景描写师，擅长营造氛围。你负责环境描写、感官细节、天气季节、建筑风格和空间布局，让读者身临其境。语言要优美且富有画面感。',
      enabled: true
    },
    {
      id: 'dialogue-master',
      name: '对话大师',
      icon: 'ChatDotRound',
      color: '#f56c6c',
      systemPrompt: '你是一位对话大师，擅长写出有性格的对话。你负责人物对话、内心独白、语气词设计、潜台词和语言风格区分。对话要自然、有个性，能推动情节发展。',
      enabled: true
    },
    {
      id: 'plot-weaver',
      name: '情节编织者',
      icon: 'Connection',
      color: '#909399',
      systemPrompt: '你是一位精于设计的情节编织者，擅长设计复杂的情节线和伏笔。你负责情节推进、冲突设计、悬念设置、伏笔埋设和情节照应。确保故事节奏紧凑且逻辑严密。',
      enabled: true
    },
    {
      id: 'polish-editor',
      name: '润色编辑',
      icon: 'Edit',
      color: '#9c27b0',
      systemPrompt: '你是一位严谨的润色编辑，擅长提升文字质量。你负责文字润色、风格统一、修辞优化、错别字修正和节奏调整。保持作者原意的同时让文字更加流畅优美。',
      enabled: true
    },
    {
      id: 'critic',
      name: '审阅评论家',
      icon: 'View',
      color: '#00bcd4',
      systemPrompt: '你是一位敏锐的审阅评论家，擅长发现作品中的问题。你需要从读者和评论家的角度审视作品，指出逻辑漏洞、人物不一致、节奏问题和可改进之处，给出具体建议。',
      enabled: true
    },
    {
      id: 'thrill-designer',
      name: '爽点设计师',
      icon: 'Lightning',
      color: '#ff6b35',
      systemPrompt: '你是一位精通网文爽点设计的专家，擅长设计让读者兴奋、满足、期待的关键节点。你需要设计打脸、逆袭、装逼、震惊众人、获得机缘等爽感场景，确保每章至少有一个小爽点，每几章有一个大爽点。要考虑爽点的层次递进和情感爆发，让读者欲罢不能。',
      enabled: true
    },
    {
      id: 'rhythm-controller',
      name: '节奏把控师',
      icon: 'Timer',
      color: '#2ed573',
      systemPrompt: '你是一位专业的节奏把控师，擅长分析故事节奏的松紧和情绪起伏。你需要检查故事节奏是否合理：是否有过于拖沓的段落、是否缺少高潮、情绪曲线是否流畅、伏笔与回收是否均衡。给出具体的节奏调整建议，包括哪些地方需要加速、哪些需要放慢、哪些需要增加冲突。',
      enabled: true
    },
    {
      id: 'content-verifier',
      name: '内容审查员',
      icon: 'CircleCheck',
      color: '#ff9f43',
      systemPrompt: '你是一位严谨的内容审查员，负责验证小说内容的逻辑一致性和事实准确性。你需要检查：前后文是否有矛盾、人物行为是否符合设定、世界观设定是否自洽、时间线是否正确、因果关系是否成立、专业知识点是否准确。对发现的问题给出具体的修改建议和补充事实。',
      enabled: true
    }
  ])

  const currentProvider = computed(() => providers.value[activeProvider.value])
  const enabledAgents = computed(() => agentRoles.value.filter(a => a.enabled))
  const hasApiKey = computed(() => {
    const p = currentProvider.value
    return p && p.hasKey === true
  })

  // ====== 从服务端加载配置（API Key 加密存储在后端） ======
  async function loadConfig() {
    loading.value = true
    error.value = null
    try {
      const response = await configApi.getAll()
      const configs = response.configs || response
      if (configs && typeof configs === 'object') {
        for (const [providerKey, config] of Object.entries(configs)) {
          const p = providers.value[providerKey]
          if (p) {
            p.hasKey = !!(config.hasApiKey ?? config.configured)
            if (config.model) p.model = config.model
          }
        }
      }

      // 本地存储非敏感偏好（活跃服务商、温度、token 数、角色开关）
      const saved = localStorage.getItem('ai-novel-preferences')
      if (saved) {
        const data = JSON.parse(saved)
        if (data.activeProvider) activeProvider.value = data.activeProvider
        if (data.temperature !== undefined) temperature.value = data.temperature
        if (data.maxTokens !== undefined) maxTokens.value = data.maxTokens
        if (data.agentRoles) {
          data.agentRoles.forEach(saved => {
            const existing = agentRoles.value.find(a => a.id === saved.id)
            if (existing) existing.enabled = saved.enabled
          })
        }
      }
    } catch (e) {
      error.value = e.message
      console.error('加载配置失败:', e)
    } finally {
      loading.value = false
    }
  }

  // ====== 保存非敏感偏好到 localStorage ======
  function savePreferences() {
    localStorage.setItem('ai-novel-preferences', JSON.stringify({
      activeProvider: activeProvider.value,
      temperature: temperature.value,
      maxTokens: maxTokens.value,
      agentRoles: agentRoles.value.map(a => ({ id: a.id, enabled: a.enabled }))
    }))
  }

  // ====== 设置 API Key（加密存储到服务端） ======
  async function setApiKey(provider, key) {
    try {
      await configApi.set(provider, { apiKey: key })
      providers.value[provider].hasKey = true
    } catch (e) {
      error.value = e.message
      throw e
    }
  }

  // ====== 删除 API Key ======
  async function deleteApiKey(provider) {
    try {
      await configApi.delete(provider)
      providers.value[provider].hasKey = false
      providers.value[provider].apiKey = ''
    } catch (e) {
      error.value = e.message
      throw e
    }
  }

  function setActiveProvider(provider) {
    activeProvider.value = provider
    savePreferences()
  }

  async function setModel(model) {
    const provider = activeProvider.value
    providers.value[provider].model = model
    try {
      await configApi.set(provider, { model })
    } catch (e) {
      console.error('保存模型设置失败:', e)
    }
    savePreferences()
  }

  function toggleAgent(agentId) {
    const agent = agentRoles.value.find(a => a.id === agentId)
    if (agent) {
      agent.enabled = !agent.enabled
      savePreferences()
    }
  }

  function updateAgentPrompt(agentId, prompt) {
    const agent = agentRoles.value.find(a => a.id === agentId)
    if (agent) {
      agent.systemPrompt = prompt
      savePreferences()
    }
  }

  // ====== 获取可用模型列表（从服务端动态获取） ======
  async function fetchModels(provider) {
    try {
      const models = await configApi.models(provider)
      if (models && models.length > 0) {
        providers.value[provider].models = models
      }
      return models
    } catch (e) {
      console.error('获取模型列表失败:', e)
      return providers.value[provider].models
    }
  }

  // 初始化加载
  loadConfig()

  return {
    providers,
    activeProvider,
    currentProvider,
    temperature,
    maxTokens,
    agentRoles,
    enabledAgents,
    hasApiKey,
    loading,
    error,
    loadConfig,
    setApiKey,
    deleteApiKey,
    setActiveProvider,
    setModel,
    toggleAgent,
    updateAgentPrompt,
    fetchModels
  }
})
