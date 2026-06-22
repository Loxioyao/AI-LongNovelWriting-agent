import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { ZhipuProvider } from '../server/providers/zhipu.js'
import { DeepSeekProvider } from '../server/providers/deepseek.js'
import { OpenAIProvider } from '../server/providers/openai.js'
import { BaseAIProvider, ProviderError } from '../server/providers/base.js'

describe('Provider 抽象层', () => {
  test('ZhipuProvider 继承 BaseAIProvider', () => {
    const zhipu = new ZhipuProvider()
    assert.ok(zhipu instanceof BaseAIProvider)
    assert.equal(zhipu.name, '智谱清言')
    assert.equal(zhipu.baseUrl, 'https://open.bigmodel.cn/api/paas/v4')
    assert.equal(zhipu.defaultModel, 'glm-4-flash')
  })

  test('DeepSeekProvider 继承 BaseAIProvider', () => {
    const deepseek = new DeepSeekProvider()
    assert.ok(deepseek instanceof BaseAIProvider)
    assert.equal(deepseek.name, 'DeepSeek')
    assert.equal(deepseek.baseUrl, 'https://api.deepseek.com/v1')
    assert.equal(deepseek.defaultModel, 'deepseek-v4-flash')
  })

  test('OpenAIProvider 继承 BaseAIProvider', () => {
    const openai = new OpenAIProvider()
    assert.ok(openai instanceof BaseAIProvider)
    assert.equal(openai.name, 'OpenAI')
    assert.equal(openai.baseUrl, 'https://api.openai.com/v1')
    assert.equal(openai.defaultModel, 'gpt-4o-mini')
  })

  test('getModels() 返回模型列表', () => {
    const zhipu = new ZhipuProvider()
    const models = zhipu.getModels()
    assert.ok(Array.isArray(models))
    assert.ok(models.length > 0)
    assert.ok(models.every(m => m.id && m.name))
  })

  test('DeepSeek 模型列表包含 V4 系列', () => {
    const deepseek = new DeepSeekProvider()
    const models = deepseek.getModels()
    const ids = models.map(m => m.id)
    assert.ok(ids.includes('deepseek-v4-pro'), '应包含 deepseek-v4-pro')
    assert.ok(ids.includes('deepseek-v4-flash'), '应包含 deepseek-v4-flash')
  })

  test('getHeaders() 返回正确的 Authorization header', () => {
    const openai = new OpenAIProvider()
    const headers = openai.getHeaders('test-api-key-123')
    assert.equal(headers['Authorization'], 'Bearer test-api-key-123')
    assert.equal(headers['Content-Type'], 'application/json')
  })

  test('buildBody() 返回正确的请求体', () => {
    const zhipu = new ZhipuProvider()
    const body = zhipu.buildBody({
      model: 'glm-4-plus',
      messages: [{ role: 'user', content: 'hello' }],
      temperature: 0.7,
      maxTokens: 2048,
      stream: false
    })
    assert.equal(body.model, 'glm-4-plus')
    assert.equal(body.temperature, 0.7)
    assert.equal(body.max_tokens, 2048)
    assert.equal(body.stream, false)
  })

  test('buildBody() 使用默认值', () => {
    const deepseek = new DeepSeekProvider()
    const body = deepseek.buildBody({
      messages: [{ role: 'user', content: 'test' }]
    })
    assert.equal(body.model, 'deepseek-v4-flash', '应使用默认模型')
    assert.equal(body.temperature, 0.8, '应使用默认温度')
  })
})

describe('ProviderError 错误分类', () => {
  test('认证错误 (401)', () => {
    const err = new ProviderError('OpenAI', 401, 'Unauthorized')
    assert.equal(err.isAuthError, true)
    assert.equal(err.isRateLimit, false)
    assert.equal(err.isServerError, false)
  })

  test('认证错误 (403)', () => {
    const err = new ProviderError('Zhipu', 403, 'Forbidden')
    assert.equal(err.isAuthError, true)
  })

  test('限流错误 (429)', () => {
    const err = new ProviderError('DeepSeek', 429, 'Rate limited')
    assert.equal(err.isAuthError, false)
    assert.equal(err.isRateLimit, true)
    assert.equal(err.isServerError, false)
  })

  test('服务器错误 (500)', () => {
    const err = new ProviderError('OpenAI', 500, 'Internal error')
    assert.equal(err.isAuthError, false)
    assert.equal(err.isRateLimit, false)
    assert.equal(err.isServerError, true)
  })

  test('服务器错误 (503)', () => {
    const err = new ProviderError('Zhipu', 503, 'Service unavailable')
    assert.equal(err.isServerError, true)
  })

  test('用户友好消息', () => {
    const authErr = new ProviderError('OpenAI', 401, 'Invalid key')
    assert.ok(authErr.userMessage.includes('API Key'))
    assert.ok(authErr.userMessage.includes('OpenAI'))

    const rateErr = new ProviderError('DeepSeek', 429, 'Too many requests')
    assert.ok(rateErr.userMessage.includes('频率'))

    const serverErr = new ProviderError('Zhipu', 500, 'Internal error')
    assert.ok(serverErr.userMessage.includes('服务器错误'))
  })

  test('非错误状态码不触发任何分类', () => {
    const err = new ProviderError('OpenAI', 200, 'OK')
    assert.equal(err.isAuthError, false)
    assert.equal(err.isRateLimit, false)
    assert.equal(err.isServerError, false)
  })

  test('ProviderError 是 Error 的子类', () => {
    const err = new ProviderError('Test', 500, 'msg')
    assert.ok(err instanceof Error)
    assert.equal(err.name, 'ProviderError')
    assert.equal(err.provider, 'Test')
    assert.equal(err.statusCode, 500)
  })
})
