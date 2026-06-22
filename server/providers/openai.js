import { BaseAIProvider } from './base.js'

/**
 * OpenAI Provider
 * API: https://api.openai.com/v1
 * GPT系列模型，需海外网络环境
 */
export class OpenAIProvider extends BaseAIProvider {
  constructor() {
    super({
      name: 'OpenAI',
      baseUrl: 'https://api.openai.com/v1',
      defaultModel: 'gpt-4o-mini',
      models: [
        { id: 'gpt-4o', name: 'GPT-4o', desc: '最新旗舰模型，多模态能力强' },
        { id: 'gpt-4o-mini', name: 'GPT-4o-mini', desc: '快速且经济' },
        { id: 'gpt-4-turbo', name: 'GPT-4-Turbo', desc: '强大且高效' },
        { id: 'gpt-3.5-turbo', name: 'GPT-3.5-Turbo', desc: '经典模型，速度快' }
      ]
    })
  }
}
