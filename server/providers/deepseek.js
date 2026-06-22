import { BaseAIProvider } from './base.js'

/**
 * DeepSeek Provider
 * API: https://api.deepseek.com/v1
 * 支持 DeepSeek-V4-Pro 和 DeepSeek-V4-Flash
 */
export class DeepSeekProvider extends BaseAIProvider {
  constructor() {
    super({
      name: 'DeepSeek',
      baseUrl: 'https://api.deepseek.com/v1',
      defaultModel: 'deepseek-v4-flash',
      models: [
        { id: 'deepseek-v4-pro', name: 'DeepSeek-V4-Pro', desc: '旗舰模型，擅长复杂创作和推理' },
        { id: 'deepseek-v4-flash', name: 'DeepSeek-V4-Flash', desc: '快速高效，性价比高' },
        { id: 'deepseek-reasoner', name: 'DeepSeek-R1', desc: '推理增强，适合情节设计' }
      ]
    })
  }
}
