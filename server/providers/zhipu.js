import { BaseAIProvider } from './base.js'

/**
 * 智谱清言 Provider
 * API: https://open.bigmodel.cn/api/paas/v4
 * OpenAI-compatible API，直接继承BaseAIProvider即可
 */
export class ZhipuProvider extends BaseAIProvider {
  constructor() {
    super({
      name: '智谱清言',
      baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
      defaultModel: 'glm-4-flash',
      models: [
        { id: 'glm-4-plus', name: 'GLM-4-Plus', desc: '最强模型，适合复杂创作' },
        { id: 'glm-4', name: 'GLM-4', desc: '通用模型，性价比高' },
        { id: 'glm-4-flash', name: 'GLM-4-Flash', desc: '快速响应，免费' },
        { id: 'glm-4-air', name: 'GLM-4-Air', desc: '轻量高效' }
      ]
    })
  }
}
